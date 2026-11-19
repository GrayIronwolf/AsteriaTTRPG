import React from 'react';
import styles from './PageLayout.module.css';

/** A width/gutter owner shared by Home, Compendium and future dashboards. */
export function PageLayout({
  as: Element = 'section', width = 'reading', variant = 'standard',
  id, labelledBy, className = '', children, ...rest
}) {
  return (
    <Element
      id={id}
      aria-labelledby={labelledBy}
      data-page-layout={variant}
      className={[styles.page, styles[width] || styles.reading, styles[variant] || styles.standard, className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </Element>
  );
}
