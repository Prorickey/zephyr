// Reaction-wheel inverted pendulum and its LQR controller, ported from
// simulators/rwps_v2.py (plant) and simulators/rwps_lqr.py (controller) so the
// interactive model on the site runs the same physics and the same control law
// as our Python simulator.
//
// Conventions match the Zephyr Physics doc: theta = 0 is upright, positive
// rotation is counterclockwise viewed from behind (a lean to the left), phi is
// the flywheel's angle relative to the frame and omega = phi_dot.
//
//   tau_m      = (K_t / R)(V - K_e omega)      motor torque on the flywheel (clamped)
//   theta_ddot = (M g sin(theta) - tau_m - b theta_dot + tau_ext) / J
//   phi_ddot   = tau_m / I_w - theta_ddot

// VOLPAM 350W scooter (compare.py's mass model) with a Flipsky 7070 KV110
// driving a 3 kg rim-weighted flywheel: the rwps_lqr.py presets.
export const DEFAULT_PARAMS = {
  handlebarMass: 2.0, // (kg) m_h
  bodyMass: 11.6, // (kg) m_b
  stemLength: 1.088, // (m) L_1, pivot to handlebars
  frameMoment: 4.801, // (kg m) m_a h_a
  frameInertia: 3.581, // (kg m^2) I_a
  wheelHeight: 0.3, // (m) L_2, pivot to flywheel axle
  wheelMass: 3.0, // (kg) m_w
  wheelRadius: 0.15, // (m) r_w
  wheelShape: 0.9, // I_w = shape * m_w * r_w^2 (0.5 solid disk, ~0.9 rim-weighted)
  motorMass: 1.08, // (kg) m_s, non-spinning motor mass at L_2
  kt: 0.08681, // (N m / A) K_t = 60 / (2 pi KV); K_e is numerically equal
  resistance: 0.055, // (ohm)
  maxCurrent: 100, // (A) winding current clamp
  voltage: 36, // (V) pack voltage, the largest command the controller can give
  packPower: 525, // (W) most the pack can deliver to the motor; regen is never limited
  friction: 0, // (N m s / rad) b, pivot friction
  gravity: 9.81,
};

// The controller runs every LOOP_PERIOD seconds; the plant is integrated with
// SUBSTEPS RK4 steps per period while the command is held.
export const LOOP_PERIOD = 0.005;
export const SUBSTEPS = 5;

// Once fallen the motor is switched off and the flywheel freewheels, slowing
// on bearing and air drag with this time constant (s).
const COAST_TIME = 2.5;

// Bryson's rule defaults from rwps_lqr.py: 1 / (largest acceptable value)^2
export const DEFAULT_WEIGHTS = {
  qTheta: 1 / (2 * Math.PI / 180) ** 2, // 2 degrees of lean
  qThetaDot: 1 / 0.5 ** 2, // 0.5 rad/s of lean rate
  qPhi: 1 / (2 * Math.PI * 20) ** 2, // 20 turns of flywheel drift
  qOmega: 1 / 300 ** 2, // 300 rad/s of flywheel speed
  r: 1 / 6 ** 2, // 6 V of command
};

// Derived plant quantities (M, J, I_w, ...) for a parameter set.
export function makePlant(overrides = {}) {
  const p = { ...DEFAULT_PARAMS, ...overrides };
  const wheelInertia = p.wheelShape * p.wheelMass * p.wheelRadius ** 2;
  const atWheel = p.wheelMass + p.motorMass;
  const plant = {
    ...p,
    ke: p.kt,
    wheelInertia,
    // M = m_a h_a + (m_w + m_s) L_2, J = I_a + (m_w + m_s) L_2^2
    gravitationalMoment: p.frameMoment + atWheel * p.wheelHeight,
    totalInertia: p.frameInertia + atWheel * p.wheelHeight ** 2,
    totalMass: p.handlebarMass + p.bodyMass + atWheel,
    // Lying on its side, the scooter rests on a handlebar grip (0.43 m bar).
    fallAngle: Math.PI / 2 - Math.atan(0.215 / p.stemLength),
  };
  plant.comHeight = plant.gravitationalMoment / plant.totalMass;
  plant.noLoadSpeed = p.voltage / plant.ke;
  plant.peakTorque = motorTorque(plant, p.voltage, 0);
  return plant;
}

// Torque the motor applies to the flywheel. The winding current is clamped to
// maxCurrent, then to what packPower can feed: the motor draws (e + iR) i, so
// i <= (-e + sqrt(e^2 + 4RP)) / 2R with e the back-EMF along the current.
export function motorTorque(plant, voltage, omega) {
  const backEmf = plant.ke * omega;
  let current = (voltage - backEmf) / plant.resistance;
  current = Math.max(-plant.maxCurrent, Math.min(plant.maxCurrent, current));
  if (plant.packPower != null && current !== 0) {
    const direction = Math.sign(current);
    const emfAlong = direction * backEmf;
    const limit =
      (-emfAlong + Math.sqrt(emfAlong ** 2 + 4 * plant.resistance * plant.packPower)) /
      (2 * plant.resistance);
    current = direction * Math.min(Math.abs(current), limit);
  }
  return plant.kt * current;
}

// d/dt of x = [theta, theta_dot, phi, omega] under command voltage and an
// external torque on the frame about the pivot.
export function derivatives(plant, x, voltage, extTorque) {
  const [theta, thetaDot, , omega] = x;
  const tau = motorTorque(plant, voltage, omega);
  const thetaDdot =
    (plant.gravitationalMoment * plant.gravity * Math.sin(theta) -
      tau -
      plant.friction * thetaDot +
      extTorque) /
    plant.totalInertia;
  const phiDdot = tau / plant.wheelInertia - thetaDdot;
  return [thetaDot, thetaDdot, omega, phiDdot];
}

export function rk4(plant, x, voltage, extTorque, h) {
  const add = (a, b, s) => a.map((v, i) => v + s * b[i]);
  const k1 = derivatives(plant, x, voltage, extTorque);
  const k2 = derivatives(plant, add(x, k1, h / 2), voltage, extTorque);
  const k3 = derivatives(plant, add(x, k2, h / 2), voltage, extTorque);
  const k4 = derivatives(plant, add(x, k3, h), voltage, extTorque);
  return x.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

// The doc's forward-Euler A and B (x = theta, theta_dot, phi, omega; u = V),
// with M and J from the plant so they include the motor's stator mass.
export function discreteModel(plant, T = LOOP_PERIOD) {
  const J = plant.totalInertia;
  const Iw = plant.wheelInertia;
  const Mg = plant.gravitationalMoment * plant.gravity;
  const b = plant.friction;
  const { kt, ke, resistance: R } = plant;
  const A = [
    [1, T, 0, 0],
    [(T * Mg) / J, 1 - (T * b) / J, 0, (T * kt * ke) / (R * J)],
    [0, 0, 1, T],
    [(-T * Mg) / J, (T * b) / J, 0, 1 - (T * kt * ke * (Iw + J)) / (R * Iw * J)],
  ];
  const B = [0, (-T * kt) / (R * J), 0, (T * kt * (Iw + J)) / (R * Iw * J)];
  return { A, B };
}

const matMul = (X, Y) => X.map((row) => Y[0].map((_, j) => row.reduce((s, v, k) => s + v * Y[k][j], 0)));

// Iterates the doc's P = Q + A'PA - A'PB (R + B'PB)^-1 B'PA from P = Q, then
// K = (R + B'PB)^-1 B'PA. B has one column, so R + B'PB is a scalar.
//
// Two changes keep it stable in floating point: each step uses the equivalent
// Joseph form P = Q + K'RK + (A - BK)'P(A - BK), and P is re-symmetrized.
// Without that, round-off leaves P slightly asymmetric and A'PA grows the
// asymmetric part at the open-loop (falling) rate until P overflows. It stops
// once every gain has settled to `tolerance`, relative.
export function solveLqr(A, B, weights, { tolerance = 1e-10, maxIterations = 200000 } = {}) {
  const { qTheta, qThetaDot, qPhi, qOmega, r } = weights;
  const q = [qTheta, qThetaDot, qPhi, qOmega];
  const n = 4;
  // Row-major flat arrays: this runs thousands of times per slider move.
  const a = Float64Array.from(A.flat());
  const P = new Float64Array(n * n);
  for (let i = 0; i < n; i++) P[i * n + i] = q[i];
  const K = new Float64Array(n);
  const nextK = new Float64Array(n);
  const PB = new Float64Array(n);
  const Acl = new Float64Array(n * n);
  const PAcl = new Float64Array(n * n);

  const gains = (out) => {
    let S = r;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += P[i * n + k] * B[k];
      PB[i] = s;
      S += B[i] * s;
    }
    // B'PA = (PB)'A since P is symmetric
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += PB[k] * a[k * n + j];
      out[j] = s / S;
    }
  };

  gains(K);
  let iterations = 0;
  let converged = false;
  while (iterations < maxIterations && !converged) {
    iterations++;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) Acl[i * n + j] = a[i * n + j] - B[i] * K[j];
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let k = 0; k < n; k++) s += P[i * n + k] * Acl[k * n + j];
        PAcl[i * n + j] = s;
      }
    }
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        let s = (i === j ? q[i] : 0) + r * K[i] * K[j];
        for (let k = 0; k < n; k++) {
          s += 0.5 * (Acl[k * n + i] * PAcl[k * n + j] + Acl[k * n + j] * PAcl[k * n + i]);
        }
        P[i * n + j] = s;
        P[j * n + i] = s;
      }
    }
    gains(nextK);
    converged = true;
    for (let i = 0; i < n; i++) {
      if (Math.abs(nextK[i] - K[i]) > tolerance * Math.abs(nextK[i])) converged = false;
      K[i] = nextK[i];
    }
  }
  const gainsOut = Array.from(K);
  const Pout = [0, 1, 2, 3].map((i) => Array.from(P.subarray(i * n, i * n + n)));
  return { K: gainsOut, P: Pout, iterations, converged, stable: isStable(A, B, gainsOut) };
}

// The closed loop A - BK is stable when its powers die out: square it 15
// times (A_cl^32768) and check what is left.
function isStable(A, B, K) {
  let M = A.map((row, i) => row.map((v, j) => v - B[i] * K[j]));
  for (let i = 0; i < 15; i++) {
    M = matMul(M, M);
    if (!M.every((row) => row.every(Number.isFinite))) return false;
  }
  return Math.max(...M.flat().map(Math.abs)) < 1e-3;
}

// The plant, the controller and the disturbance, stepped one controller period
// at a time. state = [theta, theta_dot, phi, omega].
export class BalanceSim {
  constructor(params = {}, weights = DEFAULT_WEIGHTS) {
    this.weights = { ...weights };
    this.setParams(params);
    this.reset();
  }

  setParams(params) {
    this.params = { ...params };
    this.plant = makePlant(params);
    this.retune();
  }

  setWeights(weights) {
    this.weights = { ...this.weights, ...weights };
    this.retune();
  }

  retune() {
    const { A, B } = discreteModel(this.plant, LOOP_PERIOD);
    this.lqr = solveLqr(A, B, this.weights);
  }

  reset(theta = 0) {
    this.state = [theta, 0, 0, 0];
    this.command = 0; // (V) u = -Kx, clipped to the pack voltage
    this.torque = 0; // (N m) on the flywheel, averaged over the last period
    this.current = 0; // (A)
    this.limited = false; // current clamp or pack power cap was active
    this.fallen = false;
    this.time = 0;
    this.owed = 0;
  }

  // Advance by dt seconds of real time. extTorque(state) returns the push's
  // torque about the pivot for the current state.
  advance(dt, { controllerOn = true, extTorque = () => 0 } = {}) {
    this.owed = Math.min(this.owed + dt, 0.1); // don't try to catch up after a stall
    while (this.owed >= LOOP_PERIOD) {
      this.owed -= LOOP_PERIOD;
      this.controlStep(controllerOn, extTorque);
    }
  }

  controlStep(controllerOn, extTorque) {
    const plant = this.plant;
    const h = LOOP_PERIOD / SUBSTEPS;
    this.time += LOOP_PERIOD;

    if (this.fallen) {
      // Lying on the ground with the motor off: the flywheel coasts down
      let [, , phi, omega] = this.state;
      for (let i = 0; i < SUBSTEPS; i++) {
        omega *= Math.exp(-h / COAST_TIME);
        phi += h * omega;
      }
      this.state = [this.state[0], 0, phi, omega];
      this.command = 0;
      this.torque = 0;
      this.current = 0;
      this.limited = false;
      return;
    }

    const x = this.state;
    const u = controllerOn ? -this.lqr.K.reduce((s, k, i) => s + k * x[i], 0) : 0;
    this.command = Math.max(-plant.voltage, Math.min(plant.voltage, u));

    let torque = 0;
    let limited = false;
    let next = x;
    for (let i = 0; i < SUBSTEPS; i++) {
      const tau = motorTorque(plant, this.command, next[3]);
      const unclamped = (plant.kt * (this.command - plant.ke * next[3])) / plant.resistance;
      if (Math.abs(unclamped - tau) > 1e-6 * plant.peakTorque) limited = true;
      torque += tau / SUBSTEPS;
      next = rk4(plant, next, this.command, extTorque(next), h);
    }
    if (Math.abs(next[0]) >= plant.fallAngle) {
      this.fallen = true;
      next = [Math.sign(next[0]) * plant.fallAngle, 0, next[2], next[3]];
    }
    this.state = next;
    this.torque = torque;
    this.current = torque / plant.kt;
    this.limited = limited;
  }

  // Contribution of each state to the command, -K_i x_i (V)
  contributions() {
    return this.lqr.K.map((k, i) => -k * this.state[i]);
  }
}

// Largest lean (rad) the controller recovers from, starting at rest with the
// flywheel stopped: bisection on the initial angle, like compare.py's test but
// with the LQR in the loop instead of full throttle.
export function maxRecoveryAngle(params, weights, { seconds = 8, iterations = 11 } = {}) {
  const sim = new BalanceSim(params, weights);
  const steps = Math.round(seconds / LOOP_PERIOD);
  const recovers = (theta) => {
    sim.reset(theta);
    for (let k = 0; k < steps; k++) {
      sim.controlStep(true, () => 0);
      if (sim.fallen) return false;
    }
    return Math.abs(sim.state[0]) < 0.02;
  };
  let low = 0;
  let high = 0.5;
  for (let i = 0; i < iterations; i++) {
    const mid = (low + high) / 2;
    if (recovers(mid)) low = mid;
    else high = mid;
  }
  return low;
}
