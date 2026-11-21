/*
 * Zephyr system identification: measures the physical constants the LQR in simulators/rwps_lqr.py depends on.
 *
 * Same hardware as lqr_balance (ESP32, ICM42688 on SPI, VESC on Serial2). Each test records into RAM at a fixed
 * rate, then prints the run as a CSV block between "#BEGIN ..." and "#END" lines. Run system_id/capture.py to
 * save every block to system_id/data/ automatically (or paste the Serial Monitor output into a .txt file there),
 * then run system_id/analyze.py.
 *
 * With current as the input, the LQR only needs three ratios:
 *     a  = Mg / J      gravity / frame inertia       (1/s^2)   from the fall test
 *     bJ = K_t / J     frame acceleration per amp    (rad/s^2/A) from the fall test with current pulses
 *     bW = K_t / I_w   wheel acceleration per amp    (rad/s^2/A) from the wheel test
 * The static tip test adds the absolute Mg, which turns those into J, K_t and I_w.
 *
 * Tests (type the line in the Serial Monitor, line ending "Newline", 115200 baud):
 *   b                gyro bias. Scooter completely still, 2 s. Do this first, and again if the gyro drifts.
 *   n [rpm]          noise. Frame held or propped still. Spins the wheel at rpm (default 0 = motor off), settles,
 *                    records gyro and accelerometer at 1 kHz for 3 s, then brakes the wheel. Try 0, 500, 1500.
 *   w [amps] [s]     wheel test. Frame held upright and still (a firm hand on the handlebars is enough: the reaction
 *                    is ~1 N at the bars). Wheel starts stopped. Drives +amps for s seconds, coasts 2 s, -amps for
 *                    2s seconds, coasts 2 s, +amps for s seconds, then brakes. Defaults 15 A, 1.5 s.
 *   f [amps]         fall test. PUT SOFT STOPS (boxes, straps or a spotter) at about +/-15 deg first. Hold the scooter
 *                    near upright and still. LED blinks fast for 2 s, then goes SOLID: let go cleanly. If amps > 0
 *                    (default 0) it fires 120 ms current pulses that push it back toward upright while it falls.
 *                    Stops when the lean passes STOP_DEG. Do several falls each way: f 0 at least 3 times per
 *                    side, then f 10 a few times per side.
 *   d grams r_mm     flywheel drop test (measures I_w without trusting any motor constant). Frame held upright and
 *                    still. Tape one end of a string to the wheel's rim (or a hub of known radius), wind it 1-2 m
 *                    around, hang a known mass on the free end, hold the wheel. Send the command: LED blinks 1 s, then
 *                    goes SOLID: let go of the wheel. Motor stays unpowered. Records 6 s. grams = hanging mass,
 *                    r_mm = radius to the CENTER of the string. Do 2-3 drops each with 2-3 different masses
 *                    (e.g. 250 g, 500 g, 1000 g): the spread of masses is what separates inertia from friction.
 *   s grams L_cm     static tip test. Motor off. Lean the scooter to 30-45 deg, wheels on the floor and not sliding,
 *                    and rest the top of the stem (the centerline, not a grip) on a kitchen scale on a box. grams is
 *                    the scale reading, L_cm the height of that support point above the floor when the scooter is
 *                    upright. Averages the lean for 1 s. Do it 2-3 times leaning LEFT and 2-3 times leaning RIGHT.
 *   p                live telemetry on/off (for checking signs: lean left -> acc and rate positive)
 *   i                print settings once
 *   x or space       abort the running test immediately (also the BOOT button)
 *
 * Keep the sign constants below identical to lqr_balance.ino. They define the sign conventions of the log.
 */
#include <Arduino.h>
#include <SPI.h>
#include <Preferences.h>
#include "ICM42688.h"

// Types used in function signatures must come before any function: the Arduino IDE inserts its own function
// prototypes near the top of the sketch, and they fail if these aren't declared by then.
enum Test { NONE, BIAS, NOISE, WHEEL, FALL, STATIC, DROP };
enum Cmd { RELEASE, CURRENT, RPM };   // what the motor should do this tick

// ----------------------------------------------- hardware -----------------------------------------------
#define LED_PIN       2
#define BUTTON_PIN    0
#define IMU_CS_PIN    5
#define VESC_RX_PIN   16
#define VESC_TX_PIN   17
#define VESC_BAUD     115200
#define USB_BAUD      115200

// ------------------------------------------ signs (same as lqr_balance) ----------------------------------
const float LEAN_ACCEL_SIGN = -1.0f;
const float LEAN_GYRO_SIGN  = -1.0f;            // was +1: measured 2026-11-21, the gyro read negative leaning left
const float MOTOR_SIGN      = +1.0f;
const float MOTOR_POLE_PAIRS = 7.0f;

// ----------------------------------------------- timing -------------------------------------------------
const uint32_t TICK_US = 1000;        // 1 kHz IMU loop
const uint32_t VESC_EVERY = 5;        // VESC command + telemetry request every 5 ticks (the reply takes ~2.5 ms)

// ----------------------------------------------- safety -------------------------------------------------
const float MAX_TEST_AMPS = 30.0f;    // keep the VESC Tool motor current limit >= this
const float MAX_TEST_RPM = 2500.0f;   // abort above this mechanical wheel speed
const float BRAKE_AMPS = 10.0f;       // current used to stop the wheel at the end of a test
const float STOP_DEG = 12.0f;         // fall test ends once it has fallen this far from where it was let go
const uint32_t TELEMETRY_TIMEOUT_MS = 100;
const float FILTER_TAU_S = 0.5f;      // complementary filter, only used for the fall test's stop / pulse logic

// =========================================================================================================

ICM42688 IMU(SPI, IMU_CS_PIN);
Preferences prefs;

// --------------------------------------- minimal non-blocking VESC link ----------------------------------
namespace vesc {
  const uint8_t COMM_SET_CURRENT = 6;
  const uint8_t COMM_SET_RPM = 8;
  const uint8_t COMM_GET_VALUES_SELECTIVE = 50;
  const uint32_t MASK_MOTOR_CURRENT = 1UL << 2;
  const uint32_t MASK_IQ = 1UL << 5;
  const uint32_t MASK_RPM = 1UL << 7;
  const uint32_t MASK_VIN = 1UL << 8;
  const uint32_t MASK_TACH = 1UL << 13;   // 6 counts per electrical revolution in FOC
  const uint32_t MASK_FAULT = 1UL << 15;
  const uint8_t FIELD_COUNT = 16;
  const uint8_t FIELD_SIZES[FIELD_COUNT] = {2, 2, 4, 4, 4, 4, 2, 4, 2, 4, 4, 4, 4, 4, 4, 1};

  float erpm = 0, inputVoltage = 0, motorCurrent = 0, iq = 0;
  int32_t tach = 0;
  uint8_t fault = 0;
  uint32_t lastReplyMs = 0;
  bool haveReply = false;

  uint16_t crc16(const uint8_t *data, size_t len) {
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

  void putInt32(uint8_t *buf, int32_t v) { buf[0] = v >> 24; buf[1] = v >> 16; buf[2] = v >> 8; buf[3] = v; }

  int32_t getInt(const uint8_t *buf, uint8_t size) {
    if (size == 1) return buf[0];
    if (size == 2) return (int16_t)((buf[0] << 8) | buf[1]);
    return (int32_t)(((uint32_t)buf[0] << 24) | ((uint32_t)buf[1] << 16) | ((uint32_t)buf[2] << 8) | buf[3]);
  }

  void setCurrent(float amps) { uint8_t p[5] = {COMM_SET_CURRENT}; putInt32(p + 1, (int32_t)(amps * 1000.0f)); sendPayload(p, 5); }
  void setErpm(float e) { uint8_t p[5] = {COMM_SET_RPM}; putInt32(p + 1, (int32_t)e); sendPayload(p, 5); }

  void requestTelemetry() {
    uint8_t p[5] = {COMM_GET_VALUES_SELECTIVE};
    putInt32(p + 1, (int32_t)(MASK_MOTOR_CURRENT | MASK_IQ | MASK_RPM | MASK_VIN | MASK_TACH | MASK_FAULT));
    sendPayload(p, 5);
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
      else if (bit == 5) iq = raw / 100.0f;
      else if (bit == 7) erpm = (float)raw;
      else if (bit == 8) inputVoltage = raw / 10.0f;
      else if (bit == 13) tach = raw;
      else if (bit == 15) fault = (uint8_t)raw;
      i += size;
    }
    lastReplyMs = millis();
    haveReply = true;
  }

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
        case 5: if (c == 3 && crc == crc16(buf, len)) handlePayload(buf, len); state = 0; break;
      }
    }
  }

  bool fresh() { return haveReply && millis() - lastReplyMs < TELEMETRY_TIMEOUT_MS; }
}

// ------------------------------------------------ sensors -------------------------------------------------
float gyroBiasDps = 0.0f;   // (raw gyro X units, dps) subtracted before the sign, set by 'b' and at boot
float leanOffset = 0.0f;    // (rad) lqr_balance's saved zero, only reported in logs for comparison
float rateDps = 0.0f;       // lean rate, model sign, bias removed
float accLeanDeg = 0.0f;    // accelerometer lean, model sign, absolute (offset NOT removed)
float leanEst = 0.0f;       // (rad) complementary filter estimate, absolute
bool filterSeeded = false;
int imuErrors = 0;

float omegaRel() { return MOTOR_SIGN * vesc::erpm / MOTOR_POLE_PAIRS * TWO_PI / 60.0f; }   // wheel vs frame, rad/s

bool readImu() {
  if (IMU.getAGT() < 0) { imuErrors++; return false; }
  imuErrors = 0;
  float ax = IMU.accX(), ay = IMU.accY(), az = IMU.accZ();
  accLeanDeg = LEAN_ACCEL_SIGN * atan2f(ay, sqrtf(ax * ax + az * az)) * RAD_TO_DEG;
  rateDps = LEAN_GYRO_SIGN * (IMU.gyrX() - gyroBiasDps);   // gyroBiasDps is in raw gyro units
  float dt = TICK_US * 1e-6f;
  if (!filterSeeded) { leanEst = accLeanDeg * DEG_TO_RAD; filterSeeded = true; }
  float alpha = FILTER_TAU_S / (FILTER_TAU_S + dt);
  leanEst = alpha * (leanEst + rateDps * DEG_TO_RAD * dt) + (1 - alpha) * accLeanDeg * DEG_TO_RAD;
  return true;
}

// ------------------------------------------------ logging -------------------------------------------------
struct Sample { uint32_t tUs; float rateDps, accLeanDeg, omegaRel, iCmd, iq; int32_t tach; uint8_t phase; };
Sample *buf = nullptr;
int capacity = 0, count = 0;
bool truncated = false;

void logSample(uint32_t tUs, float iCmd, uint8_t phase) {
  if (count >= capacity) { truncated = true; return; }
  buf[count++] = {tUs, rateDps, accLeanDeg, omegaRel(), iCmd, MOTOR_SIGN * vesc::iq, vesc::tach, phase};
}

// ------------------------------------------------ tests ---------------------------------------------------
const char *TEST_NAMES[] = {"none", "bias", "noise", "wheel", "fall", "static", "drop"};
Test test = NONE;
int runNumber[7] = {0};
uint32_t testStartUs = 0, tickCount = 0;
float argA = 0, argB = 0;            // test arguments
const char *abortReason = nullptr;
bool dumpPending = false;
bool telemetryOn = false;
Test lastDumpTest = NONE;

// What the motor should do this tick, in the model's sign convention
Cmd cmd = RELEASE;
float cmdValue = 0;                  // amps or mechanical rpm
float iCmdLogged = 0;

// accumulators for bias / static
double accSum = 0, accSqSum = 0;
long accN = 0;
float vinSum = 0; long vinN = 0;

// wheel test: segment list built at start
struct Segment { float amps; float seconds; };
Segment segs[5];
const int SEG_COUNT = 5;
uint32_t brakeStartUs = 0;
int fallPhase = 0;                    // 0 countdown, 1 free, 2 stopping
uint32_t phaseStartUs = 0;
float leanRelease = 0;                // (rad) lean estimate when the fall test let go
float pulseSign = 0;

void startTest(Test t, float a, float b) {
  if (test != NONE) { Serial.println("A test is already running. 'x' to abort."); return; }
  bool needsMotor = (t == NOISE && a != 0) || t == WHEEL || (t == FALL && a != 0) || t == DROP;   // DROP: telemetry only
  if (needsMotor && !vesc::fresh()) { Serial.println("No telemetry from the VESC, can't run a motor test."); return; }
  if (t == WHEEL || t == FALL) a = constrain(a, 0.0f, MAX_TEST_AMPS);
  argA = a; argB = b;
  count = 0; truncated = false; abortReason = nullptr;
  accSum = accSqSum = 0; accN = 0; vinSum = 0; vinN = 0;
  fallPhase = 0; pulseSign = 0; brakeStartUs = 0;
  testStartUs = micros(); phaseStartUs = testStartUs;
  if (t == WHEEL) {
    segs[0] = {a, b}; segs[1] = {0, 2.0f}; segs[2] = {-a, 2 * b}; segs[3] = {0, 2.0f}; segs[4] = {a, b};
  }
  test = t;
  runNumber[t]++;
  Serial.printf("Starting %s run %d\n", TEST_NAMES[t], runNumber[t]);
  if (t == FALL) Serial.println("Hold it still near upright... let go when the LED goes SOLID");
  if (t == DROP) Serial.println("Hold the wheel... let go of it when the LED goes SOLID");
}

void finishTest(const char *reason = nullptr) {
  if (test == NONE) return;
  cmd = RELEASE;
  if (reason) { abortReason = reason; Serial.printf("ABORTED: %s\n", reason); }
  Test t = test;
  test = NONE;
  lastDumpTest = t;
  if (t == BIAS) {
    if (!reason && accN > 0) {
      gyroBiasDps += (float)(accSum / accN) * LEAN_GYRO_SIGN;   // accSum: model-sign rate with the old bias removed
      float sd = sqrt(fmax(0.0, accSqSum / accN - pow(accSum / accN, 2)));
      Serial.printf("Gyro bias now %.4f dps (rate std while still %.3f dps)\n", gyroBiasDps, sd);
      if (sd > 0.5f) Serial.println("  That's a lot of motion for 'still'. Redo it with the scooter untouched.");
    }
    return;
  }
  if (t == STATIC) {
    if (!reason && accN > 0) {
      double mean = accSum / accN, sd = sqrt(fmax(0.0, accSqSum / accN - mean * mean));
      Serial.printf("#STATIC run=%d grams=%.1f L_cm=%.2f lean_deg=%.3f lean_std_deg=%.3f\n",
                    runNumber[STATIC], argA, argB, mean, sd);
    }
    return;
  }
  dumpPending = true;
}

void dump(Test t) {
  float vin = vinN ? vinSum / vinN : 0;
  Serial.printf("#BEGIN test=%s run=%d a=%.3f b=%.3f n=%d truncated=%d aborted=%s tick_us=%lu motor_sign=%.0f "
                "pole_pairs=%.0f lean_offset_deg=%.3f gyro_bias_dps=%.4f vin=%.2f stop_deg=%.1f lean_gyro_sign=%.0f "
                "lean_accel_sign=%.0f\n",
                TEST_NAMES[t], runNumber[t], argA, argB, count, truncated, abortReason ? "yes" : "no",
                (unsigned long)TICK_US, MOTOR_SIGN, MOTOR_POLE_PAIRS, leanOffset * RAD_TO_DEG, gyroBiasDps, vin, STOP_DEG,
                LEAN_GYRO_SIGN, LEAN_ACCEL_SIGN);
  Serial.println("#COLS t_us,rate_dps,acc_lean_deg,omega_rel_rads,i_cmd_a,iq_a,phase,tach");
  uint32_t t0 = count ? buf[0].tUs : 0;
  for (int i = 0; i < count; i++) {
    const Sample &s = buf[i];
    Serial.printf("%lu,%.4f,%.4f,%.3f,%.2f,%.2f,%u,%ld\n", (unsigned long)(s.tUs - t0), s.rateDps, s.accLeanDeg,
                  s.omegaRel, s.iCmd, s.iq, s.phase, (long)(s.tach - buf[0].tach));
  }
  Serial.println("#END");
}

// One tick of whichever test is running. Sets cmd / cmdValue and logs.
void runTest(uint32_t nowUs) {
  float elapsed = (nowUs - testStartUs) * 1e-6f;
  float wheelRpm = omegaRel() * 60.0f / TWO_PI;
  bool vescSlot = (tickCount % VESC_EVERY) == 0;
  if (vescSlot && vesc::inputVoltage > 5) { vinSum += vesc::inputVoltage; vinN++; }

  // shared motor safety
  if (cmd != RELEASE || test == WHEEL) {
    if (!vesc::fresh()) { finishTest("no telemetry from VESC"); return; }
    if (vesc::fault) { finishTest("VESC fault"); return; }
    if (fabsf(wheelRpm) > MAX_TEST_RPM) { finishTest("wheel too fast"); return; }
  }
  if (imuErrors > 5) { finishTest("IMU read failed"); return; }

  switch (test) {
    case BIAS:
      cmd = RELEASE;
      accSum += rateDps; accSqSum += (double)rateDps * rateDps; accN++;
      if (elapsed > 2.0f) finishTest();
      break;

    case STATIC:
      cmd = RELEASE;
      accSum += accLeanDeg; accSqSum += (double)accLeanDeg * accLeanDeg; accN++;
      if (elapsed > 1.0f) finishTest();
      break;

    case NOISE: {
      // phase 0 settle, 1 record, 2 brake
      float settle = argA != 0 ? 3.0f : 0.5f;
      if (elapsed < settle) { cmd = argA != 0 ? RPM : RELEASE; cmdValue = argA; }
      else if (elapsed < settle + 3.0f) {
        cmd = argA != 0 ? RPM : RELEASE; cmdValue = argA;
        logSample(nowUs, 0, 1);
      } else {
        if (argA == 0 || fabsf(wheelRpm) < 30 || elapsed > settle + 10.0f) { finishTest(); break; }
        cmd = CURRENT; cmdValue = wheelRpm > 0 ? -BRAKE_AMPS : BRAKE_AMPS;
      }
      break;
    }

    case WHEEL: {
      float t = elapsed;
      int seg = -1;
      for (int i = 0; i < SEG_COUNT; i++) { if (t < segs[i].seconds) { seg = i; break; } t -= segs[i].seconds; }
      if (seg >= 0) {
        cmd = CURRENT; cmdValue = segs[seg].amps;
        if (vescSlot) logSample(nowUs, cmdValue, seg + 1);
      } else {
        if (!brakeStartUs) brakeStartUs = nowUs;
        float brakeT = (nowUs - brakeStartUs) * 1e-6f;
        if (fabsf(wheelRpm) < 30 || brakeT > 8.0f) { finishTest(); break; }
        cmd = CURRENT; cmdValue = wheelRpm > 0 ? -BRAKE_AMPS : BRAKE_AMPS;
        if (vescSlot) logSample(nowUs, cmdValue, 6);
      }
      break;
    }

    case FALL: {
      // Measured from where it was let go, not from lqr_balance's saved zero (which can be off by degrees)
      float fallen = leanEst - leanRelease;
      float sincePhase = (nowUs - phaseStartUs) * 1e-6f;
      cmd = RELEASE; cmdValue = 0;
      bool logNow = (tickCount % 2) == 0;   // 500 Hz
      if (fallPhase == 0) {                  // holding, countdown. Log the last 0.5 s for the starting angle
        if (sincePhase > 1.5f && logNow) logSample(nowUs, 0, 0);
        if (sincePhase > 2.0f) { fallPhase = 1; phaseStartUs = nowUs; leanRelease = leanEst; }
      } else if (fallPhase == 1) {           // free
        if (argA > 0 && sincePhase > 0.4f) {
          // 120 ms on, 180 ms off. Each pulse pushes against the direction it's falling (the lean rate), with the
          // sign fixed at the pulse's start. +current pushes the frame toward -theta, so falling left (+rate) gets +.
          // No pulse until it's clearly moving.
          float cyc = fmodf(sincePhase - 0.4f, 0.3f);
          if (cyc < 0.12f) {
            if (pulseSign == 0 && fabsf(rateDps) > 1.0f) pulseSign = rateDps > 0 ? 1.0f : -1.0f;
            if (pulseSign != 0) { cmd = CURRENT; cmdValue = pulseSign * argA; }
          } else pulseSign = 0;
        }
        if (logNow) logSample(nowUs, cmd == CURRENT ? cmdValue : 0, 1);
        if (fabsf(fallen) > STOP_DEG * DEG_TO_RAD || sincePhase > 5.0f) { fallPhase = 2; phaseStartUs = nowUs; }
      } else {                               // stopping: motor off, a little more data
        if (logNow) logSample(nowUs, 0, 2);
        if (sincePhase > 0.15f) finishTest();
      }
      break;
    }
    case DROP:
      // 1 s countdown holding the wheel (not logged), then released with the motor unpowered for 6 s
      cmd = RELEASE;
      if (!vesc::fresh()) { finishTest("no telemetry from VESC"); break; }
      if (elapsed > 1.0f && vescSlot) logSample(nowUs, 0, 1);
      if (elapsed > 7.0f) finishTest();
      break;

    default: break;
  }
}

// ------------------------------------------------ user input ----------------------------------------------
void printInfo() {
  Serial.printf("buffer %d samples, gyro bias %.4f dps, lean offset (from lqr_balance) %.2f deg\n",
                capacity, gyroBiasDps, leanOffset * RAD_TO_DEG);
  Serial.printf("signs accel %+.0f gyro %+.0f motor %+.0f, pole pairs %.0f, VESC %s, vin %.1f V\n", LEAN_ACCEL_SIGN,
                LEAN_GYRO_SIGN, MOTOR_SIGN, MOTOR_POLE_PAIRS, vesc::fresh() ? "ok" : "NOT RESPONDING", vesc::inputVoltage);
  Serial.println("tests: b | n [rpm] | w [amps] [s] | f [amps] | d grams r_mm | s grams L_cm | p | i | x abort");
}

void handleLine(char *line) {
  char c = line[0];
  float a = NAN, b = NAN;
  sscanf(line + 1, "%f %f", &a, &b);
  switch (c) {
    case 'b': startTest(BIAS, 0, 0); break;
    case 'n': startTest(NOISE, isnan(a) ? 0 : constrain(a, -MAX_TEST_RPM, MAX_TEST_RPM), 0); break;
    case 'w': startTest(WHEEL, isnan(a) ? 15.0f : a, isnan(b) ? 1.5f : constrain(b, 0.2f, 3.0f)); break;
    case 'f': startTest(FALL, isnan(a) ? 0.0f : a, 0); break;
    case 'd':
      if (isnan(a) || isnan(b)) { Serial.println("usage: d grams r_mm   e.g. d 500 150"); break; }
      startTest(DROP, a, b);
      break;
    case 's':
      if (isnan(a) || isnan(b)) { Serial.println("usage: s grams L_cm   e.g. s 2350 105"); break; }
      startTest(STATIC, a, b);
      break;
    case 'p': telemetryOn = !telemetryOn; break;
    case 'i': printInfo(); break;
    default: if (c) Serial.printf("unknown command '%s'\n", line); break;
  }
}

void readSerial() {
  static char line[64];
  static int len = 0;
  while (Serial.available()) {
    char c = Serial.read();
    if ((c == 'x' || c == ' ') && len == 0) { if (test != NONE) finishTest("user abort"); else Serial.println("idle"); continue; }
    if (c == '\r') continue;
    if (c == '\n') { line[len] = 0; if (len) handleLine(line); len = 0; continue; }
    if (len < (int)sizeof(line) - 1) line[len++] = c;
  }
}

void pollButton() {
  static bool last = false;
  static uint32_t lastChange = 0;
  bool pressed = digitalRead(BUTTON_PIN) == LOW;
  if (pressed != last && millis() - lastChange > 50) {
    lastChange = millis(); last = pressed;
    if (pressed && test != NONE) finishTest("button");
  }
}

void updateLED() {
  uint32_t t = millis();
  bool on = false;
  if (test == FALL && fallPhase == 0) on = (t / 60) % 2;     // fast blink: keep holding
  else if (test == DROP && micros() - testStartUs < 1000000) on = (t / 60) % 2;
  else if (test != NONE) on = true;                          // solid: running (fall test: let go)
  else on = abortReason ? (t / 300) % 2 : false;
  digitalWrite(LED_PIN, on);
}

void printTelemetry() {
  static uint32_t last = 0;
  if (!telemetryOn || test != NONE || millis() - last < 100) return;
  last = millis();
  Serial.printf("acc=%.2f est=%.2f (rel %.2f) rate=%.2f dps  wheel=%.0f rpm  iq=%.1f A  vin=%.1f%s\n", accLeanDeg,
                leanEst * RAD_TO_DEG, (leanEst - leanOffset) * RAD_TO_DEG, rateDps, omegaRel() * 60 / TWO_PI,
                MOTOR_SIGN * vesc::iq, vesc::inputVoltage, vesc::fresh() ? "" : " [no VESC]");
}

// ------------------------------------------------ setup / loop --------------------------------------------
uint32_t nextTickUs = 0;

void setup() {
  delay(2000);
  Serial.setTxBufferSize(2048);
  Serial.begin(USB_BAUD);
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  Serial2.begin(VESC_BAUD, SERIAL_8N1, VESC_RX_PIN, VESC_TX_PIN);
  vesc::setCurrent(0);

  for (int n : {5000, 4000, 3000, 2000}) {
    buf = (Sample *)malloc(n * sizeof(Sample));
    if (buf) { capacity = n; break; }
  }
  if (!buf) { Serial.println("Couldn't allocate the sample buffer"); while (1) delay(100); }

  Serial.println("\nZephyr system ID. Keep the scooter still: calibrating the gyro...");
  int status = IMU.begin();
  if (status < 0) {
    Serial.printf("IMU initialization failed! Error code: %d\n", status);
    while (1) { digitalWrite(LED_PIN, (millis() / 100) % 2); delay(10); }
  }
  prefs.begin("zephyr", true);   // read-only: lqr_balance's saved zero
  leanOffset = prefs.getFloat("lean_off", 0.0f);
  prefs.end();

  printInfo();
  startTest(BIAS, 0, 0);
  nextTickUs = micros() + TICK_US;
}

void loop() {
  vesc::poll();
  readSerial();
  pollButton();
  if (dumpPending && test == NONE) { dumpPending = false; dump(lastDumpTest); }

  uint32_t now = micros();
  if ((int32_t)(now - nextTickUs) < 0) return;
  nextTickUs += TICK_US;
  if ((int32_t)(now - nextTickUs) > (int32_t)(5 * TICK_US)) nextTickUs = now + TICK_US;   // fell behind (e.g. a dump)
  tickCount++;

  readImu();
  if (test != NONE) runTest(now);
  else cmd = RELEASE;

  if (tickCount % VESC_EVERY == 0) {
    if (cmd == CURRENT) vesc::setCurrent(MOTOR_SIGN * constrain(cmdValue, -MAX_TEST_AMPS, MAX_TEST_AMPS));
    else if (cmd == RPM) vesc::setErpm(MOTOR_SIGN * cmdValue * MOTOR_POLE_PAIRS);
    else vesc::setCurrent(0);
    vesc::requestTelemetry();
  }
  updateLED();
  printTelemetry();
}
