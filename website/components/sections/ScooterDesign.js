import Section, { Lede, BodyCopy } from '../Section';
import styles from './ScooterDesign.module.css';

const SPECS = [
  ['Motor', '500 W rear-hub BLDC (placeholder)'],
  ['Battery', '48 V 13 Ah lithium-ion, swappable (placeholder)'],
  ['Frame', '6061 aluminum, reinforced steering column (placeholder)'],
  ['Steering', 'Servo-actuated column for autonomous mode (placeholder)'],
  ['Sensors', 'Solid-state lidar, stereo camera, wheel encoders (placeholder)'],
  ['Compute', 'Embedded SoC under the deck, passively cooled (placeholder)'],
];

export default function ScooterDesign() {
  return (
    <Section id="design" variant="light" fig="Fig. 03" num="03" title="Electric Scooter Design">
      <Lede>
        Off-the-shelf where it can be, custom where it must be. The frame carries the compute;
        the compute never gets in the rider&apos;s way.
      </Lede>
      <table className={styles.specTable}>
        <tbody>
          {SPECS.map(([label, value]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <BodyCopy>
        Placeholder: design write-up covering weight distribution with the sensor mast,
        waterproofing, and why the kickstand turned out to be the hardest part.
      </BodyCopy>
    </Section>
  );
}
