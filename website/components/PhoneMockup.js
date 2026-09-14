import ZephyrMark from './ZephyrMark';
import styles from './PhoneMockup.module.css';

// Realistic iPhone (15/16 Pro proportions) built purely with HTML + CSS,
// with the Zephyr app drawn on its screen. Decorative only.
export default function PhoneMockup() {
  return (
    <div className={styles.stage} aria-hidden="true">
      <div className={styles.phone}>
        {/* Physical buttons protruding from the titanium band */}
        <span className={`${styles.btn} ${styles.btnAction}`} />
        <span className={`${styles.btn} ${styles.btnVolUp}`} />
        <span className={`${styles.btn} ${styles.btnVolDown}`} />
        <span className={`${styles.btn} ${styles.btnPower}`} />

        <div className={styles.bezel}>
          <div className={styles.screen}>
            <div className={styles.island} />

            <div className={styles.statusBar}>
              <span className={styles.time}>9:41</span>
              <span className={styles.glyphs}>
                {/* Cellular */}
                <svg viewBox="0 0 18 12" xmlns="http://www.w3.org/2000/svg">
                  <rect x="0" y="8" width="3" height="4" rx="0.7" />
                  <rect x="5" y="5.5" width="3" height="6.5" rx="0.7" />
                  <rect x="10" y="3" width="3" height="9" rx="0.7" />
                  <rect x="15" y="0" width="3" height="12" rx="0.7" />
                </svg>
                {/* Wi-Fi */}
                <svg viewBox="0 0 16 12" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 11.3 5.8 8.6a3.2 3.2 0 0 1 4.4 0Z" />
                  <path
                    d="M3.6 6.1a6.4 6.4 0 0 1 8.8 0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                  <path
                    d="M1 3.4a10 10 0 0 1 14 0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
                {/* Battery */}
                <svg viewBox="0 0 27 12" xmlns="http://www.w3.org/2000/svg">
                  <rect
                    x="0.75"
                    y="0.75"
                    width="22.5"
                    height="10.5"
                    rx="2.8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    opacity="0.45"
                  />
                  <rect x="2.4" y="2.4" width="16.6" height="7.2" rx="1.6" />
                  <path d="M25 4.2v3.6a1.9 1.9 0 0 0 0-3.6Z" opacity="0.45" />
                </svg>
              </span>
            </div>

            <div className={styles.app}>
              <p className={styles.brand}>
                Zephyr
                <ZephyrMark size="0.85em" className={styles.brandMark} />
              </p>

              <div className={styles.map}>
                <svg viewBox="0 0 120 150" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
                  <g className={styles.streets}>
                    <path d="M0 38H120M0 92H120M0 128H120M36 0V150M84 0V150" />
                    <path d="M0 62 60 58 120 66M58 0 62 150" />
                  </g>
                  <path className={styles.route} d="M14 134 C 30 128, 40 112, 44 96 S 66 70, 72 56 S 92 34, 106 18" />
                  <circle className={styles.pinRing} cx="106" cy="18" r="3.2" />
                  <circle className={styles.pinCore} cx="106" cy="18" r="1.3" />
                </svg>
                <span className={styles.dot} />
                <span className={styles.mapLabel}>Live map</span>
              </div>

              <div className={styles.rows}>
                <div className={styles.row}>
                  <span>Battery</span>
                  <span className={styles.value}>87%</span>
                </div>
                <div className={styles.row}>
                  <span>Status</span>
                  <span className={styles.value}>En&nbsp;route</span>
                </div>
                <div className={styles.row}>
                  <span>Arrives</span>
                  <span className={styles.value}>4&nbsp;min</span>
                </div>
              </div>

              <div className={styles.summon}>Summon</div>
            </div>

            <span className={styles.homeBar} />
          </div>
        </div>
      </div>
    </div>
  );
}
