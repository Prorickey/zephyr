// To revert to the original line drawing, swap this import back to ScooterDrawing from './ScooterDrawing'.
import ScooterDrawingCad from './ScooterDrawingCad';
import OtherWork from './OtherWork';
import styles from './Hero.module.css';

export default function Hero() {
  return (
    <section className={styles.hero} id="top">
      <p className={`${styles.kicker} ${styles.fade}`} style={{ '--delay': '0.2s' }}>
        Fig. 00 — An autonomous mobility project
      </p>
      <h1 className={`${styles.title} ${styles.fade}`} style={{ '--delay': '0.35s' }}>
        ZEPHYR
      </h1>
      <p className={`${styles.sub} ${styles.fade}`} style={{ '--delay': '0.55s' }}>
        <em>n.</em>&nbsp; a soft, gentle breeze — reimagined as a self-driving electric scooter.
      </p>

      <div className={styles.fade} style={{ '--delay': '0.7s' }}>
        <ScooterDrawingCad />
      </div>

      <div className={styles.fade} style={{ '--delay': '1s' }}>
        <OtherWork />
      </div>

      <a className={styles.scrollCue} href="#overview">
        Scroll
        <span className={styles.scrollLine} />
      </a>
    </section>
  );
}
