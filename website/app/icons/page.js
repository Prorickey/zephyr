import ZephyrMark from '@/components/ZephyrMark';
import { ACTIVE_MARK, MARKS, markToSvg } from '@/lib/marks';
import styles from './page.module.css';

export const metadata = {
  title: 'Zephyr — Mark candidates',
  robots: { index: false, follow: false },
};

// Internal review page: every brand-mark candidate shown large, in the
// taskbar, and at real favicon sizes on dark and light tab strips.
export default function IconsPage() {
  return (
    <main className={styles.page}>
      <header className={styles.intro}>
        <p className={styles.fig}>Fig. 06 — Brand mark candidates</p>
        <h1 className={styles.title}>Pick a mark.</h1>
        <p className={styles.lede}>
          Six monoline options drawn on the same 64-unit grid as the hero line art. Each row
          shows the mark large, in the taskbar, and at real favicon sizes on dark and light
          tab strips. The one marked <em>active</em> is currently wired into the site; to
          switch, change <code>ACTIVE_MARK</code> in <code>lib/marks.js</code> and run{' '}
          <code>node scripts/build-icon.mjs</code>.
        </p>
      </header>

      {MARKS.map((mark, i) => {
        const tile = `data:image/svg+xml;base64,${Buffer.from(
          markToSvg(mark, { size: 64, padding: 8, radius: 14 })
        ).toString('base64')}`;
        const active = mark.id === ACTIVE_MARK;
        return (
          <section key={mark.id} className={styles.row} id={mark.id}>
            <div className={styles.meta}>
              <p className={styles.num}>0{i + 1}</p>
              <h2 className={styles.name}>
                {mark.name}
                {active && <span className={styles.badge}>active</span>}
              </h2>
              <p className={styles.blurb}>{mark.blurb}</p>
              <p className={styles.id}>
                id: <code>{mark.id}</code>
              </p>
            </div>

            <div className={styles.large}>
              <ZephyrMark id={mark.id} size={168} />
            </div>

            <div className={styles.contexts}>
              {/* taskbar */}
              <div className={styles.taskbar}>
                <span className={styles.brand}>
                  Zephyr
                  <ZephyrMark id={mark.id} size={18} className={styles.brandMark} />
                </span>
                <span className={styles.navLinks}>
                  <span>
                    <b>01</b> Project Overview
                  </span>
                  <span>
                    <b>02</b> Autonomy
                  </span>
                </span>
              </div>

              {/* favicon tiles */}
              <div className={styles.tabs}>
                <div className={`${styles.tabStrip} ${styles.tabDark}`}>
                  <span className={styles.tab}>
                    <img src={tile} width={16} height={16} alt="" />
                    Zephyr — Autonomous Electric Scooter
                  </span>
                  <img src={tile} width={32} height={32} alt="" />
                  <img src={tile} width={64} height={64} alt="" />
                </div>
                <div className={`${styles.tabStrip} ${styles.tabLight}`}>
                  <span className={styles.tab}>
                    <img src={tile} width={16} height={16} alt="" />
                    Zephyr — Autonomous Electric Scooter
                  </span>
                  <img src={tile} width={32} height={32} alt="" />
                  <img src={tile} width={64} height={64} alt="" />
                </div>
              </div>

              {/* on paper */}
              <div className={styles.paper}>
                <ZephyrMark id={mark.id} size={40} />
                <span className={styles.paperText}>
                  <em>Zephyr</em> — Fig. 0{i + 1}, mark on white
                </span>
              </div>
            </div>
          </section>
        );
      })}
    </main>
  );
}
