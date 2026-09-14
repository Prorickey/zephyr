import styles from './ScooterDrawing.module.css';

const draw = (group) => `${styles.draw} ${styles[group]}`;
const pulse = (n) => `${styles.draw} ${styles.pulse} ${styles[n]}`;

// Simple white line silhouette of a Segway-style performance scooter
// (raked stem, front suspension arm, long deck, swept rear fender),
// stroke-animated so it "draws itself" on load, with trailing zephyr
// wind lines pulsing afterwards. Groups d1–d7 stagger the draw-in so the
// silhouette appears wheels-first.
export default function ScooterDrawing() {
  return (
    <div className={styles.wrap} aria-hidden="true">
      <svg
        className={styles.scooter}
        viewBox="0 0 640 400"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* ground */}
        <line className={draw('d7')} x1="50" y1="372" x2="590" y2="372" />

        {/* trailing wind / zephyr lines — these keep pulsing */}
        <path className={pulse('p1')} d="M560 250 Q 600 240 634 252" />
        <path className={pulse('p2')} d="M566 282 Q 606 272 636 286" />
        <path className={pulse('p3')} d="M572 314 Q 604 306 632 316" />

        {/* front wheel — tire, rim, hub */}
        <circle className={draw('d1')} cx="150" cy="320" r="48" />
        <circle className={draw('d2')} cx="150" cy="320" r="26" />
        <circle className={styles.dot} cx="150" cy="320" r="4" />

        {/* front suspension arm from axle up to the steering head */}
        <path className={draw('d2')} d="M136 292 L120 234 L124 220 L146 216 L166 296" />

        {/* front fender */}
        <path className={draw('d2')} d="M104 294 A 54 54 0 0 1 198 290" />

        {/* headlight beams */}
        <line className={draw('d5')} x1="112" y1="244" x2="58" y2="236" />
        <line className={draw('d5')} x1="112" y1="252" x2="54" y2="256" />

        {/* raked steering stem */}
        <path className={draw('d3')} d="M156 244 L206 62" />
        <path className={draw('d3')} d="M172 248 L222 66" />

        {/* handlebar with grips */}
        <line className={draw('d4')} x1="144" y1="62" x2="292" y2="56" />
        <path className={draw('d4')} d="M144 55 L174 54 L174 68 L144 69 Z" />
        <path className={draw('d4')} d="M262 52 L292 51 L292 63 L262 64 Z" />

        {/* deck */}
        <path className={draw('d1')} d="M196 262 L430 254 L448 264 L452 300 L200 300 Z" />

        {/* rear swingarm from deck to rear axle */}
        <path className={draw('d2')} d="M432 290 L490 308 L486 320 L428 302 Z" />

        {/* rear fender sweeping over the wheel with kicked-up tail */}
        <path className={draw('d2')} d="M444 260 A 62 62 0 0 1 550 294 L562 286" />

        {/* rear wheel — tire, rim, hub */}
        <circle className={draw('d1')} cx="498" cy="320" r="48" />
        <circle className={draw('d2')} cx="498" cy="320" r="26" />
        <circle className={styles.dot} cx="498" cy="320" r="4" />
      </svg>
    </div>
  );
}
