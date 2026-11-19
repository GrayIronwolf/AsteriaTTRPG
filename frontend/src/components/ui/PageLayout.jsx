import { Eyebrow, Heading } from './Typography.jsx';
import React from 'react';
import styles from './PageLayout.module.css';

/** One responsive page-width and spacing owner for all React routes. */
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

/** One page heading for Account, libraries, Forges and settings; no duplicate per-page header CSS. */
export function PageHeader({ eyebrow, id, title, children }) {
  return <header data-page-header="true">
    {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
    <Heading id={id}>{title}</Heading>
    {children}
  </header>;
}
