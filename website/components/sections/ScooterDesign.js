import Section, { Lede, BodyCopy } from '../Section';
import BalanceModel from '../balance/BalanceModel';
import styles from './ScooterDesign.module.css';

// Self-stabilization milestones, in order. `done` and `current` should agree
// with the section's progress (about half).
const MILESTONES = [
  {
    state: 'done',
    title: 'Physics model',
    when: 'Sep 2026',
    copy: 'Equations of motion for the frame and the flywheel, written up in our physics doc.',
  },
  {
    state: 'done',
    title: 'Simulators',
    when: 'Sep 2026',
    copy: 'An inverted pendulum first, then the full reaction-wheel system, integrated with RK4.',
  },
  {
    state: 'done',
    title: 'Component trade study',
    when: 'Sep 2026',
    copy: '20 scooters against 30 flywheel motors: the largest lean each pairing can recover from.',
  },
  {
    state: 'done',
    title: 'LQR controller',
    when: 'Oct 2026',
    copy: 'Designed from the linearized model, then tested against the full nonlinear simulation.',
  },
  {
    state: 'current',
    title: 'Hardware bring-up',
    when: 'Oct 2026',
    copy: 'An ESP32 reading the ICM-42688 IMU and driving the flywheel motor through a VESC.',
  },
  {
    state: 'next',
    title: 'Flywheel on the scooter',
    copy: 'Mount the flywheel and motor on the deck of the test scooter.',
  },
  {
    state: 'next',
    title: 'Standing on its own',
    copy: 'Run the LQR on the ESP32 and tune it until the scooter balances with nobody holding it.',
  },
];

const STEPS = [
  {
    title: 'Sense',
    copy: 'An IMU on the deck measures how far the scooter leans and how fast. The motor controller reports the flywheel’s angle and speed.',
  },
  {
    title: 'Decide',
    copy: 'The LQR controller multiplies those four numbers by gains worked out offline and adds them into a motor voltage, 200 times a second.',
  },
  {
    title: 'Act',
    copy: 'The motor spins the flywheel one way, so the frame is pushed the other way, back toward upright. Newton’s third law does the balancing.',
  },
];

const BUILD = [
  ['Scooter', 'VOLPAM 350 W commuter: 36 V pack, 8.5″ solid tires. Our test platform.'],
  ['Flywheel motor', 'Flipsky 7070 110 KV outrunner, about 8.7 N·m peak.'],
  ['Flywheel', '3 kg steel rim, Ø 300 mm, its axle 300 mm above the ground (design value).'],
  ['Motor controller', 'VESC, commanded over UART.'],
  ['Sensing', 'ICM-42688 six-axis IMU for lean; the VESC for flywheel speed.'],
  ['Compute', 'ESP32 microcontroller.'],
  ['Control', 'LQR on four states (lean, lean rate, flywheel angle, flywheel speed) at 200 Hz.'],
];

export default function ScooterDesign() {
  return (
    <Section
      id="design"
      variant="dark"
      fig="Fig. 02"
      num="02"
      title="Self-Stabilizing Scooter"
      progress={0.5}
    >
      <Lede>
        Before Zephyr can drive itself anywhere, it has to stand up on its own. A spinning flywheel
        does the work.
      </Lede>
      <BodyCopy>
        Parked on its two wheels, a scooter is an inverted pendulum: the smallest lean grows until it
        falls over. We mount a heavy flywheel on the deck, spinning about the scooter&apos;s long
        axis. Whenever the motor speeds the flywheel up one way, the frame is pushed the other way,
        so by choosing the motor&apos;s voltage fast enough a controller can push back against every
        lean.
      </BodyCopy>

      <div className={styles.status}>
        <div className={styles.statusHead}>
          <p className={styles.statusTitle}>
            Phase 1 <span className={styles.statusSep}>·</span> Self-stabilization
          </p>
          <p className={styles.statusValue}>In progress, about halfway</p>
        </div>
        <span className={styles.meter} role="img" aria-label="About 50% complete">
          <span className={styles.meterFill} />
        </span>
        <ol className={styles.milestones}>
          {MILESTONES.map((m) => (
            <li key={m.title} className={`${styles.milestone} ${styles[m.state]}`}>
              <span className={styles.marker} aria-hidden="true" />
              <span className={styles.milestoneTitle}>
                {m.title}
                <span className={styles.visuallyHidden}>
                  {m.state === 'done' ? ' (done)' : m.state === 'current' ? ' (in progress)' : ' (to do)'}
                </span>
              </span>
              <span className={styles.milestoneWhen}>
                {m.state === 'current' ? 'Now' : m.when || 'Next'}
              </span>
              <span className={styles.milestoneCopy}>{m.copy}</span>
            </li>
          ))}
        </ol>
      </div>

      <h3 className={styles.subhead}>How it balances</h3>
      <ol className={styles.steps}>
        {STEPS.map((step, i) => (
          <li key={step.title} className={styles.step}>
            <span className={styles.stepNum}>{String(i + 1).padStart(2, '0')}</span>
            <h4>{step.title}</h4>
            <p>{step.copy}</p>
          </li>
        ))}
      </ol>

      <BalanceModel />

      <h3 className={styles.subhead}>The build</h3>
      <table className={styles.specTable}>
        <tbody>
          {BUILD.map(([label, value]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <BodyCopy>
        The flywheel is a design value from our simulations; the motor, controller and sensors are
        on the bench now. Next the flywheel goes on the deck, and the LQR moves from simulation onto
        the ESP32.
      </BodyCopy>
    </Section>
  );
}
