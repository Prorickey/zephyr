import Section, { Lede, BodyCopy } from '../Section';
import styles from './Overview.module.css';

const STATS = [
  { value: '25 km', label: 'Range per charge' },
  { value: 'L4', label: 'Target autonomy (geofenced)' },
  { value: '3', label: 'Sensor modalities' },
  { value: '2', label: 'Engineers, many late nights' },
];

export default function Overview() {
  return (
    <Section id="overview" variant="light" fig="Fig. 01" num="01" title="Project Overview">
      <Lede>
        Zephyr is a two-person exploration into what happens when a humble electric scooter
        learns to think for itself. Summon it from across campus, ride it wherever you like,
        and let it quietly return itself to the nearest charging dock.
      </Lede>
      <BodyCopy>
        Built from the ground up — frame, drivetrain, perception stack, and companion app —
        Zephyr is equal parts robotics testbed and daily commuter. This page is a living
        document of the project; the copy below is placeholder while we write up the real
        results.
      </BodyCopy>
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
