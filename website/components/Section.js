import RevealSection from './RevealSection';
import styles from './Section.module.css';

// Shared section shell: alternating light/dark background, "Fig. 0X"
// kicker, and the "0X — Title" heading with a rule underneath. The inner
// content fades up when scrolled into view.
export default function Section({ id, variant, fig, num, title, children }) {
  const tone = variant === 'light' ? styles.light : styles.dark;
  return (
    <section id={id} className={`${styles.section} ${tone}`}>
      <RevealSection className={styles.inner}>
        <p className={styles.fig}>{fig}</p>
        <h2 className={styles.heading}>
          <span className={styles.num}>{num} —</span> {title}
        </h2>
        {children}
      </RevealSection>
    </section>
  );
}

// Text helpers shared by all sections
export function Lede({ children }) {
  return <p className={styles.lede}>{children}</p>;
}

export function BodyCopy({ children }) {
  return <p className={styles.body}>{children}</p>;
}
