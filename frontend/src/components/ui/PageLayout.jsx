import React from 'react';
import styles from './PageLayout.module.css';

/** A width/gutter owner shared by Home, Compendium and future dashboards. */
export function PageLayout({
  as: Element = 'section', width = 'reading',
  id, labelledBy, className = '', children, ...rest
}) {
  return (
    <Element
      id={id}
      aria-labelledby={labelledBy}
      className={[styles.page, styles[width] || styles.reading, className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </Element>
  );
}
