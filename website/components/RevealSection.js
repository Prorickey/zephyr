'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './RevealSection.module.css';

// Fades its content up once it scrolls into view. Reveals immediately when
// the ?noanim escape hatch is set or IntersectionObserver is unavailable.
export default function RevealSection({ className = '', children }) {
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
      // Trigger once the top of the section is 120px into the viewport.
      { rootMargin: '0px 0px -120px 0px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${styles.reveal} ${visible ? styles.visible : ''} ${className}`}
    >
      {children}
    </div>
  );
}
