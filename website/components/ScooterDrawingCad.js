import styles from './ScooterDrawingCad.module.css';

const cx = (...names) => names.map((n) => styles[n]).join(' ');

// CAD-style side elevation of the scooter: a drafted silhouette of a
// performance e-scooter (10" wheels, raked folding stem, long deck, rear
// swingarm) with drafting conventions layered on top — centre lines through
// the axles and steering axis, centre marks, hidden lines for the battery,
// dimension lines with open arrowheads, leaders, a detail callout and a
// small title block. Pure CSS animation: the silhouette draws in first
// (groups d1–d4, wheels first), then the grey drafting layer follows
// (groups a1–a4). Every stroked element carries pathLength="1" so the
// dasharray/dashoffset draw-in covers its full length.
export default function ScooterDrawingCad() {
  return (
    <div className={styles.wrap} aria-hidden="true">
      <svg
        className={styles.scooter}
        viewBox="0 0 640 400"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* ---- construction: ground line, axle centre lines, steering axis ---- */}
        <line className={cx('dim', 'a1')} pathLength="1" x1="40" y1="336" x2="600" y2="336" />
        <line className={cx('cl', 'a1')} x1="60" y1="292" x2="560" y2="292" />
        <line className={cx('cl', 'a1')} x1="150" y1="196" x2="150" y2="368" />
        <line className={cx('cl', 'a1')} x1="470" y1="232" x2="470" y2="368" />
        <line className={cx('cl', 'a2')} x1="136" y1="342" x2="226" y2="20" />

        {/* ---- silhouette ---- */}
        {/* front wheel: tire, rim, hub */}
        <circle className={cx('draw', 'd1')} pathLength="1" cx="150" cy="292" r="44" />
        <circle className={cx('draw', 'fine', 'd1')} pathLength="1" cx="150" cy="292" r="30" />
        <circle className={cx('draw', 'fine', 'd1')} pathLength="1" cx="150" cy="292" r="7" />
        {/* rear wheel: tire, rim, hub motor, axle */}
        <circle className={cx('draw', 'd1')} pathLength="1" cx="470" cy="292" r="44" />
        <circle className={cx('draw', 'fine', 'd1')} pathLength="1" cx="470" cy="292" r="30" />
        <circle className={cx('draw', 'fine', 'd1')} pathLength="1" cx="470" cy="292" r="18" />
        <circle className={cx('draw', 'fine', 'd1')} pathLength="1" cx="470" cy="292" r="7" />
        {/* axle centre marks + hub dots */}
        <path className={styles.mark} d="M141 292 H159 M150 283 V301 M461 292 H479 M470 283 V301" />
        <circle className={styles.dot} cx="150" cy="292" r="2.2" />
        <circle className={styles.dot} cx="470" cy="292" r="2.2" />

        {/* deck */}
        <path className={cx('draw', 'd1')} pathLength="1" d="M200 262 H428 V292 H208 L200 284 Z" />

        {/* front fork arm + fender */}
        <path className={cx('draw', 'fine', 'd2')} pathLength="1" d="M156 262 L168 263 L156 293 L144 291 Z" />
        <path className={cx('draw', 'd2')} pathLength="1" d="M105 271 A 50 50 0 0 1 183 255" />
        {/* folding hinge + neck casting into the deck */}
        <circle className={cx('draw', 'fine', 'd2')} pathLength="1" cx="162" cy="255" r="7" />
        <path className={cx('draw', 'fine', 'd2')} pathLength="1" d="M169 249 L200 262 M168 262 L200 284" />
        {/* rear swingarm + pivot, rear fender */}
        <circle className={cx('draw', 'fine', 'd2')} pathLength="1" cx="420" cy="298" r="5" />
        <path className={cx('draw', 'fine', 'd2')} pathLength="1" d="M424 294 L465 287 M424 303 L465 298" />
        <path className={cx('draw', 'd2')} pathLength="1" d="M428 265 A 50 50 0 0 1 517 275 L524 279" />

        {/* stem, raked 16 deg from vertical */}
        <path className={cx('draw', 'd3')} pathLength="1" d="M155 248 L205 68" />
        <path className={cx('draw', 'd3')} pathLength="1" d="M169 248 L219 68" />

        {/* headlight + sensor head on the front face of the stem */}
        <path className={cx('draw', 'fine', 'd4')} pathLength="1" d="M170 191 L164 190 L161 201 L167 202 Z" />
        <path className={cx('draw', 'fine', 'd4')} pathLength="1" d="M192 117 L182 115 L178 131 L188 133 Z" />
        {/* cockpit: clamp, bar, grips, display, brake lever */}
        <path className={cx('draw', 'fine', 'd4')} pathLength="1" d="M203 69 V60 H221 V69" />
        <line className={cx('draw', 'd4')} pathLength="1" x1="178" y1="56" x2="252" y2="56" />
        <rect className={cx('draw', 'fine', 'd4')} pathLength="1" x="150" y="51" width="30" height="10" rx="3" />
        <rect className={cx('draw', 'fine', 'd4')} pathLength="1" x="250" y="51" width="30" height="10" rx="3" />
        <rect className={cx('draw', 'fine', 'd4')} pathLength="1" x="202" y="45" width="22" height="9" rx="1.5" />
        <path className={cx('draw', 'fine', 'd4')} pathLength="1" d="M172 61 Q168 70 158 72" />

        {/* ---- sensor sweep: draws in, then keeps pulsing ---- */}
        <path className={cx('pulse', 'p1')} pathLength="1" d="M157 110 A 28 28 0 0 0 157 138" />
        <path className={cx('pulse', 'p2')} pathLength="1" d="M145 103 A 42 42 0 0 0 145 145" />

        {/* ---- hidden lines: battery pack inside the deck ---- */}
        <rect className={cx('hid', 'a2')} x="214" y="270" width="200" height="14" />

        {/* ---- annotations ---- */}
        {/* rake angle between the stem's front edge and the wheel centre line */}
        <path className={cx('dim', 'a2')} pathLength="1" d="M150 210 A 56 56 0 0 1 165.6 212" />
        <text className={cx('lbl', 'a4')} x="146" y="207" textAnchor="end">16°</text>

        {/* detail callout around the folding hinge */}
        <circle className={cx('dim', 'a2')} pathLength="1" cx="162" cy="255" r="15" />
        <path className={cx('dim', 'a2')} pathLength="1" d="M175 247 L192 238" />
        <text className={cx('lbl', 'a4')} x="195" y="241">A</text>

        {/* wheel diameter leader */}
        <path className={cx('dim', 'a3')} pathLength="1" d="M119 261 L92 234 H66" />
        <text className={cx('lbl', 'a4')} x="66" y="230">Ø 254</text>

        {/* sensor leader */}
        <path className={cx('dim', 'a3')} pathLength="1" d="M186 115 V88 H156" />
        <text className={cx('lbl', 'a4')} x="152" y="91" textAnchor="end">LIDAR</text>

        {/* ground clearance */}
        <path className={cx('dim', 'a3')} pathLength="1" d="M300 292 V336 M297 299 L300 292 L303 299 M297 329 L300 336 L303 329" />
        <text className={cx('lbl', 'a4')} x="306" y="318">125</text>

        {/* wheelbase (dimensioned to the axle centre lines) */}
        <path className={cx('dim', 'a3')} pathLength="1" d="M150 360 H470 M158 357 L150 360 L158 363 M462 357 L470 360 L462 363" />
        <text className={cx('lbl', 'a4')} x="310" y="356" textAnchor="middle">WHEELBASE 925</text>

        {/* overall length, with extension lines */}
        <path className={cx('dim', 'a3')} pathLength="1" d="M106 340 V390 M524 340 V390" />
        <path className={cx('dim', 'a3')} pathLength="1" d="M106 384 H524 M114 381 L106 384 L114 387 M516 381 L524 384 L516 387" />
        <text className={cx('lbl', 'a4')} x="315" y="380" textAnchor="middle">OVERALL 1 205</text>

        {/* title block */}
        <text className={cx('lbl', 'a4')} x="598" y="40" textAnchor="end">ZEPHYR — SIDE ELEVATION</text>
        <text className={cx('lbl', 'a4')} x="598" y="54" textAnchor="end">SCALE 1:8 · DIMENSIONS IN MM</text>
        <text className={cx('lbl', 'a4')} x="598" y="68" textAnchor="end">DWG. Z-001 · REV A</text>
      </svg>
    </div>
  );
}
