'use client';

import { useState } from 'react';
import { NAV_LINKS } from '@/lib/site';
import ZephyrMark from './ZephyrMark';
import styles from './Taskbar.module.css';

export default function Taskbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);

  return (
    <header className={`${styles.taskbar} ${menuOpen ? styles.menuOpen : ''}`}>
      <a className={styles.brand} href="#top" onClick={close}>
        Zephyr
        <ZephyrMark size={18} className={styles.brandMark} />
      </a>

      <nav id="site-nav" className={`${styles.nav} ${menuOpen ? styles.open : ''}`}>
        {NAV_LINKS.map((item) => (
          <a key={item.id} href={`#${item.id}`} onClick={close}>
            <span className={styles.navNum}>{item.num}</span>
            {item.label}
          </a>
        ))}
      </nav>

      <button
        type="button"
        className={styles.menuToggle}
        aria-label="Toggle menu"
        aria-expanded={menuOpen}
        aria-controls="site-nav"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span />
        <span />
      </button>
    </header>
  );
}
