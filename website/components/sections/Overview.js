import Section, { Lede, BodyCopy } from '../Section';
import styles from './Overview.module.css';

// The roadmap: each phase is one of the sections below, and `progress` matches
// that section's stretch of the progress line.
const PHASES = [
  {
    num: '02',
    href: '#design',
    title: 'Self-stabilization',
    status: 'In progress',
    progress: 0.5,
    copy: 'A motor-driven flywheel and an LQR controller hold the scooter upright with no rider. Physics, simulation and controller design are done; the electronics are on the bench.',
  },
  {
    num: '03',
    href: '#autonomy',
    title: 'Autonomy',
    status: 'Up next',
    progress: 0,
    copy: 'Perception, planning and control, so Zephyr can find whoever called it within a set radius. The first architecture sketches are drawn.',
  },
  {
    num: '04',
    href: '#app',
    title: 'Mobile app',
    status: 'Planned',
    progress: 0,
    copy: 'Summon Zephyr from your phone, watch it ride over, and send it home again.',
  },
];

const STATS = [
  { value: '1 of 3', label: 'Phases underway' },
  { value: '≈ 50%', label: 'Of self-stabilization done' },
  { value: 'Aug 2026', label: 'Project started' },
  { value: '2', label: 'Engineers, many late nights' },
];

export default function Overview() {
  return (
    <Section
      id="overview"
      variant="light"
      fig="Fig. 01"
      num="01"
      title="Project Overview"
      progress={1}
    >
      <Lede>
        Zephyr is an electric scooter that holds itself upright, and will drive itself to whoever
        calls it.
      </Lede>
      <BodyCopy>
        We&apos;re building it in order. A scooter can&apos;t ride over to you until it can stand on
        its own, so the first phase is self-stabilization: a flywheel on the deck, spun by a motor,
        that catches the scooter every time it starts to tip. Autonomy and the app come after it.
      </BodyCopy>
      <BodyCopy>
        The line down the left edge of this page tracks where we are. Today it stops halfway
        through self-stabilization.
      </BodyCopy>

      <ol className={styles.phases}>
        {PHASES.map((phase) => (
          <li
            key={phase.num}
            className={`${styles.phase} ${phase.progress > 0 ? styles.active : ''}`}
          >
            <a className={styles.phaseLink} href={phase.href}>
              <span className={styles.phaseHead}>
                <span className={styles.phaseNum}>{phase.num}</span>
                <span className={styles.phaseStatus}>{phase.status}</span>
              </span>
              <span className={styles.phaseTitle}>{phase.title}</span>
              <span
                className={styles.meter}
                role="img"
                aria-label={`${Math.round(phase.progress * 100)}% complete`}
              >
                <span className={styles.meterFill} style={{ '--progress': phase.progress }} />
              </span>
              <span className={styles.phaseCopy}>{phase.copy}</span>
            </a>
          </li>
        ))}
      </ol>

      <div className={styles.statGrid}>
        {STATS.map((stat) => (
          <div key={stat.label} className={styles.stat}>
            <span className={styles.statValue}>{stat.value}</span>
            <span className={styles.statLabel}>{stat.label}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}
