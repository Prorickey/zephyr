'use client';

import { useEffect, useRef, useState } from 'react';
import ZephyrMark from './ZephyrMark';
import styles from './PhoneMockup.module.css';

// Realistic iPhone (15/16 Pro proportions) built purely with HTML + CSS,
// with a working demo of the Zephyr app on its screen: press SUMMON and the
// scooter rides from its dock along the route to the rider, then can be
// sent home again.

const TRIP_MS = 4800;
const ETA_MIN = 4;

// Map coordinates (viewBox 120x150): the dock is at (106,18) and the rider's
// location dot sits at (44,96). The scooter marker is anchored at the dock
// and this path is expressed relative to it, so the marker rests at the dock
// before and after every trip. It is the dock→rider half of the drawn route.
const DOCK = { x: 106, y: 18 };
const TRIP_PATH = 'M0 0 C-14 16 -28 24 -34 38 C-40 52 -58 62 -62 78';

const COPY = {
  idle: { status: 'Parked at dock', button: 'Summon' },
  enroute: { status: 'En route', button: 'Summoning…' },
  arrived: { status: 'Arrived', button: 'Send home' },
  returning: { status: 'Returning', button: 'Returning…' },
};

export default function PhoneMockup() {
  const [phase, setPhase] = useState('idle');
  const [eta, setEta] = useState(ETA_MIN);
  const [battery, setBattery] = useState(87);
  const motionRef = useRef(null);
  const timers = useRef([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  // Drive the SMIL motion forwards (dock → rider) or backwards.
  const drive = (direction) => {
    const anim = motionRef.current;
    if (!anim) return;
    anim.setAttribute('keyPoints', direction === 'out' ? '0;1' : '1;0');
    anim.beginElement();
  };

  const summon = () => {
    if (phase !== 'idle') return;
    clearTimers();
    setPhase('enroute');
    setEta(ETA_MIN);
    drive('out');
    for (let i = 1; i < ETA_MIN; i += 1) {
      later(() => setEta(ETA_MIN - i), (TRIP_MS / ETA_MIN) * i);
    }
    later(() => {
      setPhase('arrived');
      setBattery((b) => Math.max(b - 1, 0));
    }, TRIP_MS);
  };

  const sendHome = () => {
    if (phase !== 'arrived') return;
    clearTimers();
    setPhase('returning');
    drive('back');
    later(() => {
      setPhase('idle');
      setEta(ETA_MIN);
    }, TRIP_MS);
  };

  const busy = phase === 'enroute' || phase === 'returning';
  const arrives =
    phase === 'enroute' ? `${eta} min` : phase === 'arrived' ? 'Now' : phase === 'returning' ? '—' : `${ETA_MIN} min`;
  const routeClass = [
    styles.route,
    phase === 'enroute' && styles.routeOut,
    phase === 'returning' && styles.routeBack,
  ]
    .filter(Boolean)
    .join(' ');
  const buttonClass = [styles.summon, phase === 'arrived' && styles.summonArrived].filter(Boolean).join(' ');

  return (
    <div className={styles.stage}>
      <div className={styles.phone}>
        {/* Physical buttons protruding from the titanium band */}
        <span className={`${styles.btn} ${styles.btnAction}`} />
        <span className={`${styles.btn} ${styles.btnVolUp}`} />
        <span className={`${styles.btn} ${styles.btnVolDown}`} />
        <span className={`${styles.btn} ${styles.btnPower}`} />

        <div className={styles.bezel}>
          <div className={styles.screen}>
            <div className={styles.island} />

            <div className={styles.statusBar} aria-hidden="true">
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
              <p className={styles.brand} aria-hidden="true">
                Zephyr
                <ZephyrMark size="0.85em" className={styles.brandMark} />
              </p>

              <div className={styles.map} aria-hidden="true">
                <svg viewBox="0 0 120 150" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
                  <g className={styles.streets}>
                    <path d="M0 38H120M0 92H120M0 128H120M36 0V150M84 0V150" />
                    <path d="M0 62 60 58 120 66M58 0 62 150" />
                  </g>
                  <path className={routeClass} d="M14 134 C 30 128, 40 112, 44 96 S 66 70, 72 56 S 92 34, 106 18" />
                  <circle className={styles.pinRing} cx={DOCK.x} cy={DOCK.y} r="3.2" />
                  <circle className={styles.pinCore} cx={DOCK.x} cy={DOCK.y} r="1.3" />

                  {/* The scooter: anchored at the dock, moved along TRIP_PATH by SMIL */}
                  <g className={styles.scooter} transform={`translate(${DOCK.x} ${DOCK.y})`}>
                    <animateMotion
                      ref={motionRef}
                      path={TRIP_PATH}
                      dur={`${TRIP_MS}ms`}
                      begin="indefinite"
                      fill="freeze"
                      calcMode="linear"
                      keyTimes="0;1"
                      keyPoints="0;1"
                    />
                    <circle className={styles.scooterHalo} r="7.5" />
                    <g className={styles.scooterGlyph}>
                      <circle cx="-4" cy="1.6" r="1.7" />
                      <circle cx="4" cy="1.6" r="1.7" />
                      <path d="M-2 0h4.6" />
                      <path d="M-2.6 0-5 -6.2" />
                      <path d="M-6.4-6.2h2.8" />
                    </g>
                  </g>
                </svg>
                <span className={styles.dot} />
                <span className={styles.mapLabel}>Live map</span>
              </div>

              <div className={styles.rows} aria-live="polite">
                <div className={styles.row}>
                  <span>Battery</span>
                  <span className={styles.value}>{battery}%</span>
                </div>
                <div className={styles.row}>
                  <span>Status</span>
                  <span className={styles.value}>{COPY[phase].status}</span>
                </div>
                <div className={styles.row}>
                  <span>Arrives</span>
                  <span className={styles.value}>{arrives}</span>
                </div>
              </div>

              <button
                type="button"
                className={buttonClass}
                onClick={phase === 'arrived' ? sendHome : summon}
                disabled={busy}
                aria-busy={busy}
              >
                {COPY[phase].button}
              </button>
            </div>

            <span className={styles.homeBar} />
          </div>
        </div>
      </div>
    </div>
  );
}
