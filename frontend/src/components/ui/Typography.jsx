import React from 'react';
import styles from './Typography.module.css';

export function Eyebrow({ children, className = '' }) {
  return <p className={[styles.eyebrow, className].filter(Boolean).join(' ')}>{children}</p>;
}

export function Heading({ as: Element = 'h1', id, hero = false, className = '', children }) {
  return (
    <Element id={id} className={[styles.heading, hero ? styles.hero : '', className].filter(Boolean).join(' ')}>
      {children}
    </Element>
  );
}

export function BodyText({ as: Element = 'p', muted = false, className = '', children }) {
  return (
    <Element className={[styles.body, muted ? styles.muted : '', className].filter(Boolean).join(' ')}>
      {children}
    </Element>
  );
}
