import { PEOPLE } from '@/lib/site';
import ZephyrMark from './ZephyrMark';
import styles from './Footer.module.css';

export default function Footer() {
  const [joshua, trevor] = PEOPLE;
  return (
    <footer className={styles.footer}>
      <p className={styles.title}>
        Zephyr
        <ZephyrMark size={20} className={styles.titleMark} />
      </p>
      <p>
        A project by{' '}
        <a href={joshua.url} target="_blank" rel="noopener noreferrer">
          {joshua.name}
        </a>{' '}
        &amp;{' '}
        <a href={trevor.url} target="_blank" rel="noopener noreferrer">
          {trevor.name}
        </a>
      </p>
      <p className={styles.fine}>
        © 2026 · Fig. 05 — colophon: set in Times, drawn in strokes of white.
      </p>
    </footer>
  );
}
