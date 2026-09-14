import Section, { Lede } from '../Section';
import styles from './Autonomy.module.css';

const COLUMNS = [
  {
    title: 'Perception',
    copy: 'Camera and lidar streams are fused into a local occupancy grid. Placeholder: notes on the vision model, obstacle classification, and how Zephyr tells a curb from a shadow.',
  },
  {
    title: 'Planning',
    copy: 'A hybrid A* planner proposes paths; a safety layer vetoes anything that gets within a comfortable margin of pedestrians. Placeholder: replanning cadence and edge cases.',
  },
  {
    title: 'Control',
    copy: 'Steering and throttle are closed-loop at 50 Hz with a graceful fallback: when confidence drops, Zephyr simply stops and phones home. Placeholder: controller details.',
  },
];

const TAGS = ['Computer Vision', 'SLAM', 'Path Planning', 'Sensor Fusion', 'Embedded', 'ROS 2'];

export default function Autonomy() {
  return (
    <Section
      id="autonomy"
      variant="dark"
      fig="Fig. 02"
      num="02"
      title="Autonomous AI Implementation"
    >
      <Lede>
        A lightweight perception-planning-control loop, tuned to run on hardware that fits
        under a deck plate.
      </Lede>
      <div className={styles.cols}>
        {COLUMNS.map((col) => (
          <div key={col.title} className={styles.col}>
            <h3>{col.title}</h3>
            <p>{col.copy}</p>
          </div>
        ))}
      </div>
      <div className={styles.tags}>
        {TAGS.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
    </Section>
  );
}
