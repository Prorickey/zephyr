import Section, { Lede, BodyCopy } from '../Section';
import PhoneMockup from '../PhoneMockup';
import styles from './MobileApp.module.css';

const FEATURES = [
  ['Summon.', 'Drop a pin; Zephyr rides to you. (Placeholder)'],
  ['Live map.', 'Watch it navigate in real time. (Placeholder)'],
  ['Battery & health.', 'Charge state, diagnostics, firmware. (Placeholder)'],
  ['Ride log.', 'Distance, routes, and the occasional detour. (Placeholder)'],
];

export default function MobileApp() {
  return (
    <Section id="app" variant="dark" fig="Fig. 04" num="04" title="Zephyr Mobile App" progress={0}>
      <div className={styles.layout}>
        <div>
          <Lede>The remote control you never need to look at twice.</Lede>
          <ul className={styles.features}>
            {FEATURES.map(([title, copy]) => (
              <li key={title}>
                <strong>{title}</strong> {copy}
              </li>
            ))}
          </ul>
          <BodyCopy>
            Placeholder: notes on the app stack, the telemetry link, and the remote-stop
            safety button.
          </BodyCopy>
        </div>
        <PhoneMockup />
      </div>
    </Section>
  );
}
