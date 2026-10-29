'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './ProgressRail.module.css';

// One section's stretch of the project progress line down the left edge of
// the page. Sections sit flush against each other, so their rails join into
// a single line. `progress` is how much of this section's work is done (0-1):
// the line is filled that far down the section, and a section that is part
// done gets a "we are here" marker where the fill ends. The fill draws in
// when the section scrolls into view.
export default function ProgressRail({ num, progress }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    if (
      document.documentElement.hasAttribute('data-noanim') ||
      typeof IntersectionObserver === 'undefined'
    ) {
      setVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -25% 0px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const stage = progress >= 1 ? styles.done : progress > 0 ? styles.current : '';

  return (
    <div
      ref={ref}
      className={`${styles.rail} ${stage} ${visible ? styles.visible : ''}`}
      style={{ '--progress': progress }}
      aria-hidden="true"
    >
      <span className={styles.track} />
      <span className={styles.fill} />
      <span className={styles.node}>
        <span className={styles.num}>{num}</span>
      </span>
      {progress > 0 && progress < 1 && (
        <span className={styles.now}>
          <span className={styles.nowLabel}>We are here</span>
        </span>
      )}
    </div>
  );
}
