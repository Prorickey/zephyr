import Image from 'next/image';
import { PEOPLE } from '@/lib/site';
import styles from './OtherWork.module.css';

const AVATAR_SIZE = 60;

export default function OtherWork() {
  return (
    <div className={styles.wrap}>
      <p className={styles.label}>Our Other Work</p>
      <div className={styles.icons}>
        {PEOPLE.map((person) => (
          <a
            key={person.name}
            className={styles.person}
            href={person.url}
            target="_blank"
            rel="noopener noreferrer"
            data-name={person.name}
            aria-label={person.name}
          >
            <Image
              className={styles.avatar}
              src={person.image}
              alt={person.name}
              width={AVATAR_SIZE}
              height={AVATAR_SIZE}
              sizes={`${AVATAR_SIZE}px`}
            />
          </a>
        ))}
      </div>
    </div>
  );
}
