/*
 * Zephyr reaction-wheel self-balancing scooter: LQR balance controller.
 *
 * Combines the hardware setup from sketch_oct12a (ESP32, ICM42688 on SPI, VESC on Serial2) with the LQR
 * designed in simulators/rwps_lqr.py (VOLPAM 350W scooter + Flipsky 7070 KV110 flywheel motor).
 *
 *   state  x = (theta, theta_dot, phi, omega)
 *            theta     lean angle (rad), 0 = balanced, POSITIVE = leaning LEFT viewed from behind
 *            theta_dot lean rate (rad/s)
 *            phi       wheel angle relative to the frame (rad), integrated from omega
 *            omega     wheel speed relative to the frame (rad/s), POSITIVE = counter-clockwise viewed from behind
 *   input  u = -K x, a motor voltage (V), sent to the VESC as duty = u / V_battery
 *
 * K is only valid at the sample period it was designed for (LOOP_PERIOD_US below = LOOP_PERIOD in
 * rwps_lqr.py). If you change the scooter, motor, Q/R weights or loop period in the Python, regenerate K with
 *     cd simulators && python -c "import rwps_lqr as m; print(m.LQRSimulation().K)"
 * and paste the four numbers into K_LQR.
 *
 * ---------------------------------------------------------------------------------------------------------
 * BEFORE THE FIRST BALANCE ATTEMPT do the sign checks with the scooter held or propped (wheel free to spin):
 *   1. Open Serial Monitor at 115200 and send 'p' to stream telemetry.
 *   2. Lean the scooter LEFT (viewed from behind). "acc" and "rate" must both go POSITIVE while it moves.
 *      Wrong sign on acc  -> flip LEAN_ACCEL_SIGN.  Wrong sign on rate -> flip LEAN_GYRO_SIGN.
 *      If neither moves, the lean axis isn't the IMU's X axis: change leanAccel()/leanRate().
 *   3. Send 'm' (motor test, +MOTOR_TEST_VOLTS for 0.4 s). Viewed from behind the wheel must spin
 *      COUNTER-CLOCKWISE, the same way the frame turns when it leans left (positive lean), and the frame
 *      should kick the other way, to the right. If the wheel spins clockwise, flip MOTOR_SIGN. Go by what you
 *      see: "w" reads positive in this test either way, because MOTOR_SIGN flips the command and the reading.
 *   4. Hold the scooter at its balance point (where it neither falls left nor right) and send 'z' to save that
 *      as zero lean. It is stored in flash. Be careful: in rwps_lqr.py a zero that is 1 deg off still balances,
 *      but 2 deg off falls over.
 *   5. Send 'a' to arm (or press the BOOT button). Bring it upright; once it is within ARM_ANGLE_DEG for
 *      ARM_HOLD_MS it starts balancing. Send 'x' / space (or press BOOT) to stop at any time.
 * In the VESC Tool: enable UART at 115200 baud, set the motor current limit to the 30 A the Python assumes,
 * and keep the app timeout short (e.g. 200 ms) so the motor releases if the ESP32 stops talking.
 * ---------------------------------------------------------------------------------------------------------
 *
 * Serial commands: a arm | x or space disarm | z zero lean here | m motor direction test | p telemetry on/off
 *                  k print gains | g / G gains -10% / +10% | d / D damping -10% / +10% | r reset g and d to 1.0
 *                  (g, d and the lean offset are saved in flash)
 */
#include <Arduino.h>
#include <SPI.h>
#include <Preferences.h>
#include "ICM42688.h"

// ----------------------------------------------- hardware -----------------------------------------------
#define LED_PIN       2
#define BUTTON_PIN    0     // BOOT button on most ESP32 dev boards, toggles arm / disarm
#define IMU_CS_PIN    5
#define VESC_RX_PIN   16
#define VESC_TX_PIN   17
#define VESC_BAUD     115200

// --------------------------------------------- controller -----------------------------------------------
// From simulators/rwps_lqr.py: LOOP_PERIOD = 0.005 s, Bryson's-rule Q/R, motor_max_current = 30 A.
// Units: V/rad, V/(rad/s), V/rad, V/(rad/s). u = -(K0 theta + K1 theta_dot + K2 phi + K3 omega)
const float K_LQR[4] = {-245.225f, -48.2777f, -0.0462526f, -0.251858f};
const uint32_t LOOP_PERIOD_US = 5000;           // must match LOOP_PERIOD in rwps_lqr.py
const float LOOP_PERIOD_S = LOOP_PERIOD_US * 1e-6f;

const float NOMINAL_PACK_VOLTAGE = 36.0f;       // (V) used until the VESC reports its input voltage
const float MAX_DUTY = 0.95f;                   // |duty| cap, so |u| <= MAX_DUTY * V_battery

// How the LQR's voltage command u reaches the motor.
//   true:  command the winding current the model says u would produce, i = (u - K_e omega) / R, clamped to
//          MAX_CURRENT_A. The VESC's fast current loop then makes the motor behave like the model's motor, and
//          the torque no longer depends on the VESC's duty-cycle controller or on K_e / R being exactly right
//          (at 0.055 ohm every 0.1 V of error in duty mode is ~2 A of unintended current).
//   false: send u as duty = u / V_battery, the original behavior.
const bool CONTROL_BY_CURRENT = true;
const float MOTOR_KE = 0.08681f;                // (V/(rad/s)) = K_t, motor_kt in rwps_lqr.py
const float MOTOR_RESISTANCE = 0.055f;          // (ohm) motor_resistance in rwps_lqr.py
const float MAX_CURRENT_A = 30.0f;              // motor_max_current in rwps_lqr.py. Keep the VESC Tool limit >= this

// Soft start: the gains ramp from 0 to full over this long when balancing begins. In rwps_lqr.py this halves
// the startup current kick from a 0.5 deg start (30 A -> 12.5 A) with only ~0.01 deg more lean. Much longer
// and it falls before the controller bites (it falls with a ~0.26 s time constant uncorrected).
const float SOFT_START_S = 0.3f;

// --------------------------------------------- sign / mapping --------------------------------------------
// See the sign checks in the header. These map the raw sensors onto the model's conventions.
const float LEAN_ACCEL_SIGN = -1.0f;            // sketch_oct12a used atan2(-ay, ...)
const float LEAN_GYRO_SIGN  = +1.0f;            // sketch_oct12a integrated +gx
const float MOTOR_SIGN      = +1.0f;            // +1 if positive VESC duty / current spins the wheel CCW viewed from behind
const float MOTOR_POLE_PAIRS = 7.0f;            // Flipsky 7070: 14 poles. VESC reports electrical RPM

// --------------------------------------------- estimator -------------------------------------------------
// Complementary filter time constant. Longer trusts the gyro more, which rejects the accelerometer's false
// "tilt" from the frame's own lean acceleration and wheel vibration, but corrects gyro drift more slowly.
const float FILTER_TAU_S = 0.5f;

// ----------------------------------------------- safety -------------------------------------------------
// rwps_lqr.py recovers from a 2.0 deg start but falls from 2.5 deg (only ~2.6 Nm at 30 A), so arm well inside
const float ARM_ANGLE_DEG = 1.0f;               // must be this close to upright to start balancing
const float ARM_RATE_DPS = 5.0f;                // ... and this still (deg/s)
const uint32_t ARM_HOLD_MS = 500;               // ... for this long
const float FALL_ANGLE_DEG = 20.0f;             // beyond this it can't recover (peak torque ~2.6 Nm), give up
const float MAX_WHEEL_RPM = 3700.0f;            // no-load is ~3960 rpm at 36 V; past this there's no torque left
const uint32_t TELEMETRY_TIMEOUT_MS = 100;      // VESC silent this long -> disarm
const int MAX_IMU_ERRORS = 5;                   // consecutive failed IMU reads -> disarm
const float MOTOR_TEST_VOLTS = 3.0f;            // duty mode
const float MOTOR_TEST_AMPS = 5.0f;             // current mode
const uint32_t MOTOR_TEST_MS = 400;

// =========================================================================================================

ICM42688 IMU(SPI, IMU_CS_PIN);
Preferences prefs;

// --------------------------------------- minimal non-blocking VESC link ----------------------------------
// VescUart::getVescValues() blocks until the full COMM_GET_VALUES reply arrives (~80 bytes, ~7 ms at 115200),
// which is longer than the whole 5 ms control period. Instead each tick sends a duty command plus a
// COMM_GET_VALUES_SELECTIVE request for just motor current, RPM and input voltage (20-byte reply), and the
// reply is parsed byte by byte as it arrives, so it is used on the next tick.
namespace vesc {
  const uint8_t COMM_SET_DUTY = 5;
  const uint8_t COMM_SET_CURRENT = 6;
  const uint8_t COMM_GET_VALUES_SELECTIVE = 50;
  const uint32_t MASK_MOTOR_CURRENT = 1UL << 2;
  const uint32_t MASK_RPM = 1UL << 7;
  const uint32_t MASK_VIN = 1UL << 8;
  const uint32_t MASK_FAULT = 1UL << 15;
  // Byte sizes of the selective fields, in bit order: temp_fet, temp_motor, current_motor, current_in, id,
  // iq, duty, rpm, v_in, amp_hours, amp_hours_charged, watt_hours, watt_hours_charged, tach, tach_abs, fault
  const uint8_t FIELD_COUNT = 16;
  const uint8_t FIELD_SIZES[FIELD_COUNT] = {2, 2, 4, 4, 4, 4, 2, 4, 2, 4, 4, 4, 4, 4, 4, 1};
  const char *FAULT_NAMES[] = {"none", "over voltage", "under voltage", "DRV", "abs over current",
                               "over temp FET", "over temp motor", "gate driver over voltage",
                               "gate driver under voltage", "MCU under voltage", "watchdog reset"};

  const char *faultName(uint8_t code) {
    return code < sizeof(FAULT_NAMES) / sizeof(FAULT_NAMES[0]) ? FAULT_NAMES[code] : "see mc_fault_code in datatypes.h";
  }

  float erpm = 0.0f;
  uint8_t fault = 0;
  float inputVoltage = 0.0f;
  float motorCurrent = 0.0f;
  uint32_t lastReplyMs = 0;
  bool haveReply = false;

  uint16_t crc16(const uint8_t *data, size_t len) {   // CRC-16/XMODEM, as used by the VESC
    uint16_t crc = 0;
    for (size_t i = 0; i < len; i++) {
      crc ^= (uint16_t)data[i] << 8;
      for (int b = 0; b < 8; b++) crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
    }
    return crc;
  }

  void sendPayload(const uint8_t *payload, uint8_t len) {
    uint8_t frame[32];
    frame[0] = 2;
    frame[1] = len;
    memcpy(frame + 2, payload, len);
    uint16_t crc = crc16(payload, len);
    frame[len + 2] = crc >> 8;
    frame[len + 3] = crc & 0xFF;
    frame[len + 4] = 3;
    Serial2.write(frame, len + 5);
  }

  void putInt32(uint8_t *buf, int32_t v) {
    buf[0] = v >> 24; buf[1] = v >> 16; buf[2] = v >> 8; buf[3] = v;
  }

  int32_t getInt(const uint8_t *buf, uint8_t size) {
    if (size == 1) return buf[0];
    if (size == 2) return (int16_t)((buf[0] << 8) | buf[1]);
    return (int32_t)(((uint32_t)buf[0] << 24) | ((uint32_t)buf[1] << 16) | ((uint32_t)buf[2] << 8) | buf[3]);
  }

  void setDuty(float duty) {
    uint8_t p[5] = {COMM_SET_DUTY};
    putInt32(p + 1, (int32_t)(duty * 100000.0f));
    sendPayload(p, sizeof(p));
  }

  void setCurrent(float amps) {   // signed: negative current is reverse torque
    uint8_t p[5] = {COMM_SET_CURRENT};
    putInt32(p + 1, (int32_t)(amps * 1000.0f));
    sendPayload(p, sizeof(p));
  }

  void release() { setCurrent(0.0f); }   // zero current: the motor coasts

  void requestTelemetry() {
    uint8_t p[5] = {COMM_GET_VALUES_SELECTIVE};
    putInt32(p + 1, (int32_t)(MASK_MOTOR_CURRENT | MASK_RPM | MASK_VIN | MASK_FAULT));
    sendPayload(p, sizeof(p));
  }

  void handlePayload(const uint8_t *p, uint8_t len) {
    if (len < 5 || p[0] != COMM_GET_VALUES_SELECTIVE) return;
    uint32_t mask = (uint32_t)getInt(p + 1, 4);
    uint8_t i = 5;
    for (uint8_t bit = 0; bit < FIELD_COUNT; bit++) {
      if (!(mask & (1UL << bit))) continue;
      uint8_t size = FIELD_SIZES[bit];
      if (i + size > len) return;
      int32_t raw = getInt(p + i, size);
      if (bit == 2) motorCurrent = raw / 100.0f;
      else if (bit == 7) erpm = (float)raw;
      else if (bit == 8) inputVoltage = raw / 10.0f;
      else if (bit == 15) fault = (uint8_t)raw;
      i += size;
    }
    lastReplyMs = millis();
    haveReply = true;
  }

  // Byte-at-a-time parser for short (<= 255 byte) VESC packets: 0x02 len payload crc_hi crc_lo 0x03
  void poll() {
    static uint8_t buf[256];
    static uint8_t state = 0, len = 0, idx = 0;
    static uint16_t crc = 0;
    while (Serial2.available()) {
      uint8_t c = Serial2.read();
      switch (state) {
        case 0: if (c == 2) state = 1; break;
        case 1: len = c; idx = 0; state = len ? 2 : 0; break;
        case 2: buf[idx++] = c; if (idx == len) state = 3; break;
        case 3: crc = (uint16_t)c << 8; state = 4; break;
        case 4: crc |= c; state = 5; break;
        case 5:
          if (c == 3 && crc == crc16(buf, len)) handlePayload(buf, len);
          state = 0;
          break;
      }
    }
  }

  bool fresh() { return haveReply && millis() - lastReplyMs < TELEMETRY_TIMEOUT_MS; }
}

// ------------------------------------------------ state ---------------------------------------------------
enum Mode { DISARMED, WAITING_UPRIGHT, BALANCING, MOTOR_TEST };
Mode mode = DISARMED;
const char *faultReason = nullptr;   // last reason the controller stopped itself, shown until the next arm

float lean = 0.0f;          // (rad) filtered, before the offset
float leanOffset = 0.0f;    // (rad) the balance point, saved in flash
float accLean = 0.0f;       // (rad) raw accelerometer lean, for the sign check
float theta = 0.0f, thetaDot = 0.0f, phi = 0.0f, omega = 0.0f;
float u = 0.0f;             // (V) last LQR command
float iCmd = 0.0f;          // (A) last commanded current (current mode)
bool filterSeeded = false;

// Live tuning, saved in flash. gainScale multiplies all of K ("how hard"), dampScale multiplies K1 on top
// ("how much it resists lean rate"). Both 1.0 = exactly the rwps_lqr.py design.
float gainScale = 1.0f, dampScale = 1.0f;

uint32_t nextTickUs = 0, lastTickUs = 0;
uint32_t uprightSinceMs = 0, motorTestEndMs = 0;
uint32_t overruns = 0, lastTickDurationUs = 0;
int imuErrors = 0;
bool telemetryOn = false;

// The last second of balancing, printed whenever balancing stops so you can see what led up to it
struct Sample { uint32_t ms; float thetaDeg, rateDps, wheelRpm, volts, cmdAmps, amps; };
const int LOG_LEN = 1000000 / LOOP_PERIOD_US;
Sample sampleLog[LOG_LEN];
int logHead = 0, logCount = 0;
uint32_t balanceStartMs = 0;
bool dumpPending = false;

void recordSample() {
  sampleLog[logHead] = {millis() - balanceStartMs, (float)(theta * RAD_TO_DEG), (float)(thetaDot * RAD_TO_DEG),
                        (float)(omega * 60.0f / TWO_PI), u, iCmd, vesc::motorCurrent};
  logHead = (logHead + 1) % LOG_LEN;
  if (logCount < LOG_LEN) logCount++;
}

void dumpLog() {
  Serial.println("--- last second of balancing (every 4th sample) ---");
  Serial.println("t_ms   theta_deg  rate_dps  wheel_rpm  u_V     Icmd_A  Imeas_A");
  int start = (logHead - logCount + LOG_LEN) % LOG_LEN;
  for (int i = 0; i < logCount; i += 4) {
    const Sample &s = sampleLog[(start + i) % LOG_LEN];
    Serial.printf("%5lu  %8.2f  %8.1f  %9.0f  %6.2f  %6.1f  %6.1f\n", (unsigned long)s.ms, s.thetaDeg, s.rateDps,
                  s.wheelRpm, s.volts, s.cmdAmps, s.amps);
  }
  Serial.println("--- end ---");
}

// Lean about the IMU's X axis, as in sketch_oct12a. Change these two if the board is mounted differently.
float leanAccel(float ax, float ay, float az) { return LEAN_ACCEL_SIGN * atan2f(ay, sqrtf(ax * ax + az * az)); }
float leanRate(float gx_dps) { return LEAN_GYRO_SIGN * gx_dps * DEG_TO_RAD; }

void setMode(Mode m, const char *reason = nullptr) {
  if (m == DISARMED || m == WAITING_UPRIGHT) vesc::release();
  if (mode == BALANCING && m != BALANCING) {
    Serial.printf("Balanced for %.2f s\n", (millis() - balanceStartMs) / 1000.0f);
    dumpPending = true;
  }
  if (reason) {
    faultReason = reason;
    Serial.printf("STOPPED: %s\n", reason);
  }
  if (m == WAITING_UPRIGHT) {
    faultReason = nullptr;
    uprightSinceMs = 0;
    Serial.printf("Armed: bring it within %.1f deg of upright\n", ARM_ANGLE_DEG);
  }
  if (m == BALANCING) {
    phi = 0.0f;
    logHead = logCount = 0;
    balanceStartMs = millis();
    Serial.println("Balancing");
  }
  if (m == DISARMED && !reason) Serial.println("Disarmed");
  mode = m;
}

void printGains() {
  Serial.printf("K = [%.4g V/rad, %.4g V/(rad/s), %.4g V/rad, %.4g V/(rad/s)], T = %lu us\n",
                K_LQR[0], K_LQR[1], K_LQR[2], K_LQR[3], (unsigned long)LOOP_PERIOD_US);
  Serial.printf("lean offset %.2f deg, signs accel %+.0f gyro %+.0f motor %+.0f\n",
                leanOffset * RAD_TO_DEG, LEAN_ACCEL_SIGN, LEAN_GYRO_SIGN, MOTOR_SIGN);
  Serial.printf("gain scale %.2f, damping scale %.2f -> effective K0 %.1f, K1 %.2f; %s mode, soft start %.2f s\n",
                gainScale, dampScale, gainScale * K_LQR[0], gainScale * dampScale * K_LQR[1],
                CONTROL_BY_CURRENT ? "current" : "duty", SOFT_START_S);
}

void setScales(float g, float d) {
  gainScale = constrain(g, 0.2f, 3.0f);
  dampScale = constrain(d, 0.2f, 5.0f);
  prefs.putFloat("gain", gainScale);
  prefs.putFloat("damp", dampScale);
  Serial.printf("gain scale %.2f, damping scale %.2f\n", gainScale, dampScale);
}

// Send a voltage command u (V) to the motor, in the model's sign convention
void driveVolts(float volts, float vBattery) {
  if (CONTROL_BY_CURRENT) {
    iCmd = constrain((volts - MOTOR_KE * omega) / MOTOR_RESISTANCE, -MAX_CURRENT_A, MAX_CURRENT_A);
    vesc::setCurrent(MOTOR_SIGN * iCmd);
  } else {
    iCmd = 0.0f;
    vesc::setDuty(MOTOR_SIGN * volts / vBattery);
  }
}

// ------------------------------------------------ control -------------------------------------------------
void controlStep(float dt) {
  // --- estimate theta and theta_dot ---
  if (IMU.getAGT() < 0) {
    if (++imuErrors >= MAX_IMU_ERRORS && mode == BALANCING) setMode(DISARMED, "IMU read failed");
    return;
  }
  imuErrors = 0;
  accLean = leanAccel(IMU.accX(), IMU.accY(), IMU.accZ());
  thetaDot = leanRate(IMU.gyrX());
  if (!filterSeeded) {
    lean = accLean;
    filterSeeded = true;
  }
  float alpha = FILTER_TAU_S / (FILTER_TAU_S + dt);
  lean = alpha * (lean + thetaDot * dt) + (1.0f - alpha) * accLean;
  theta = lean - leanOffset;

  // --- wheel speed and angle (relative to the frame) ---
  omega = MOTOR_SIGN * vesc::erpm / MOTOR_POLE_PAIRS * TWO_PI / 60.0f;
  float vBattery = vesc::inputVoltage > 5.0f ? vesc::inputVoltage : NOMINAL_PACK_VOLTAGE;
  float vMax = MAX_DUTY * vBattery;
  float thetaDeg = theta * RAD_TO_DEG;
  float wheelRpm = fabsf(omega) * 60.0f / TWO_PI;

  // --- mode logic ---
  uint32_t now = millis();
  switch (mode) {
    case WAITING_UPRIGHT:
      if (fabsf(thetaDeg) < ARM_ANGLE_DEG && fabsf(thetaDot * RAD_TO_DEG) < ARM_RATE_DPS && vesc::fresh()) {
        if (!uprightSinceMs) uprightSinceMs = now;
        if (now - uprightSinceMs >= ARM_HOLD_MS) setMode(BALANCING);
      } else {
        uprightSinceMs = 0;
      }
      break;
    case BALANCING:
      if (fabsf(thetaDeg) > FALL_ANGLE_DEG) setMode(DISARMED, "fell past FALL_ANGLE_DEG");
      else if (!vesc::fresh()) setMode(DISARMED, "no telemetry from VESC");
      else if (wheelRpm > MAX_WHEEL_RPM) setMode(DISARMED, "wheel speed saturated");
      else if (vesc::fault) {
        Serial.printf("VESC fault %u: %s\n", vesc::fault, vesc::faultName(vesc::fault));
        setMode(DISARMED, "VESC reported a fault");
      }
      break;
    case MOTOR_TEST:
      if ((int32_t)(now - motorTestEndMs) >= 0) setMode(DISARMED);
      break;
    default:
      break;
  }

  // --- actuate ---
  if (mode == BALANCING) {
    phi += omega * dt;
    float ramp = SOFT_START_S > 0 ? fminf(1.0f, (now - balanceStartMs) / (1000.0f * SOFT_START_S)) : 1.0f;
    u = -ramp * gainScale *
        (K_LQR[0] * theta + dampScale * K_LQR[1] * thetaDot + K_LQR[2] * phi + K_LQR[3] * omega);
    u = constrain(u, -vMax, vMax);
    driveVolts(u, vBattery);
    recordSample();
  } else if (mode == MOTOR_TEST) {
    if (CONTROL_BY_CURRENT) {
      u = 0.0f;
      iCmd = MOTOR_TEST_AMPS;
      vesc::setCurrent(MOTOR_SIGN * iCmd);
    } else {
      u = MOTOR_TEST_VOLTS;
      driveVolts(u, vBattery);
    }
  } else {
    u = 0.0f;
    iCmd = 0.0f;
    vesc::release();   // also keeps the VESC's command timeout fed
  }
  vesc::requestTelemetry();
}

// ------------------------------------------------ user input ----------------------------------------------
void handleCommand(char c) {
  switch (c) {
    case 'a':
      if (mode == DISARMED) setMode(WAITING_UPRIGHT);
      break;
    case 'x': case ' ':
      setMode(DISARMED);
      break;
    case 'z':
      if (mode != DISARMED) { Serial.println("Disarm before zeroing"); break; }
      leanOffset = lean;
      prefs.putFloat("lean_off", leanOffset);
      Serial.printf("Lean offset set to %.2f deg\n", leanOffset * RAD_TO_DEG);
      break;
    case 'm':
      if (mode != DISARMED) { Serial.println("Disarm before the motor test"); break; }
      if (CONTROL_BY_CURRENT) Serial.printf("Motor test: +%.1f A", MOTOR_TEST_AMPS);
      else Serial.printf("Motor test: +%.1f V", MOTOR_TEST_VOLTS);
      Serial.printf(" for %lu ms. Wheel should spin CCW viewed from behind (same way as a left lean), frame kicks right\n",
                    (unsigned long)MOTOR_TEST_MS);
      motorTestEndMs = millis() + MOTOR_TEST_MS;
      mode = MOTOR_TEST;
      break;
    case 'p':
      telemetryOn = !telemetryOn;
      break;
    case 'k':
      printGains();
      break;
    case 'g': setScales(gainScale * 0.9f, dampScale); break;   // softer
    case 'G': setScales(gainScale * 1.1f, dampScale); break;   // harder
    case 'd': setScales(gainScale, dampScale * 0.9f); break;   // less damping
    case 'D': setScales(gainScale, dampScale * 1.1f); break;   // more damping
    case 'r': setScales(1.0f, 1.0f); break;                    // back to the rwps_lqr.py design
  }
}

void pollButton() {
  static bool lastPressed = false;
  static uint32_t lastChangeMs = 0;
  bool pressed = digitalRead(BUTTON_PIN) == LOW;
  if (pressed != lastPressed && millis() - lastChangeMs > 50) {
    lastChangeMs = millis();
    lastPressed = pressed;
    if (pressed) setMode(mode == DISARMED ? WAITING_UPRIGHT : DISARMED);
  }
}

void updateLED() {
  // off = disarmed, slow blink = armed and waiting, solid = balancing, fast blink = stopped on a fault
  uint32_t t = millis();
  bool on;
  switch (mode) {
    case BALANCING:       on = true; break;
    case WAITING_UPRIGHT: on = (t / 500) % 2; break;
    case MOTOR_TEST:      on = (t / 50) % 2; break;
    default:              on = faultReason ? (t / 100) % 2 : false; break;
  }
  digitalWrite(LED_PIN, on);
}

void printTelemetry() {
  static uint32_t lastPrintMs = 0;
  if (!telemetryOn || millis() - lastPrintMs < 50) return;
  lastPrintMs = millis();
  static const char *names[] = {"OFF", "WAIT", "BAL", "TEST"};
  Serial.printf("%s th=%.2f acc=%.2f rate=%.1f deg/s w=%.0frpm phi=%.1frev u=%.2fV I=%.1fA vin=%.1f tick=%luus ovr=%lu%s\n",
                names[mode], theta * RAD_TO_DEG, (accLean - leanOffset) * RAD_TO_DEG, thetaDot * RAD_TO_DEG,
                omega * 60.0f / TWO_PI, phi / TWO_PI, u, vesc::motorCurrent, vesc::inputVoltage,
                (unsigned long)lastTickDurationUs, (unsigned long)overruns, vesc::fresh() ? "" : " [no VESC]");
}

// ------------------------------------------------ setup / loop --------------------------------------------
void setup() {
  delay(3000);
  Serial.setTxBufferSize(1024);   // so telemetry prints queue instead of stalling the control loop
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  Serial2.begin(VESC_BAUD, SERIAL_8N1, VESC_RX_PIN, VESC_TX_PIN);
  vesc::release();

  // If the board resets the moment the motor pulls current, this says why (BROWNOUT = its supply sagged)
  static const char *resetNames[] = {"UNKNOWN", "POWERON", "EXT", "SW", "PANIC", "INT_WDT", "TASK_WDT", "WDT",
                                     "DEEPSLEEP", "BROWNOUT", "SDIO"};
  esp_reset_reason_t why = esp_reset_reason();
  Serial.printf("\nReset reason: %s\n", why < 11 ? resetNames[why] : "OTHER");

  Serial.println("Initializing ICM42688. Keep the scooter still: the gyro bias is calibrated now...");
  int status = IMU.begin();   // begin() also runs calibrateGyro()
  if (status < 0) {
    Serial.printf("IMU initialization failed! Error code: %d\n", status);
    while (1) { digitalWrite(LED_PIN, (millis() / 100) % 2); delay(10); }
  }

  prefs.begin("zephyr", false);
  leanOffset = prefs.getFloat("lean_off", 0.0f);
  gainScale = prefs.getFloat("gain", 1.0f);
  dampScale = prefs.getFloat("damp", 1.0f);

  Serial.println("Zephyr LQR balance ready. Commands: a arm | x disarm | z zero lean | m motor test | p telemetry | k gains | g/G gain | d/D damping | r reset");
  printGains();

  lastTickUs = micros();
  nextTickUs = lastTickUs + LOOP_PERIOD_US;
}

void loop() {
  // Between ticks: read VESC replies, user commands and the button without blocking
  vesc::poll();
  while (Serial.available()) handleCommand(Serial.read());
  pollButton();
  if (dumpPending && mode != BALANCING) {   // the motor is already released, so blocking on prints is fine
    dumpPending = false;
    dumpLog();
  }

  uint32_t now = micros();
  if ((int32_t)(now - nextTickUs) < 0) return;

  // Fixed-rate tick. K assumes exactly LOOP_PERIOD_US between updates; if we fall badly behind, resync
  // rather than running a burst of back-to-back updates.
  nextTickUs += LOOP_PERIOD_US;
  if ((int32_t)(now - nextTickUs) > (int32_t)LOOP_PERIOD_US) {
    overruns++;
    nextTickUs = now + LOOP_PERIOD_US;
  }
  float dt = (now - lastTickUs) * 1e-6f;
  lastTickUs = now;

  controlStep(dt);
  lastTickDurationUs = micros() - now;

  updateLED();
  printTelemetry();
}
