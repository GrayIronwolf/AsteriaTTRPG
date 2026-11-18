import React from 'react';
import styles from './SurfacePanel.module.css';

/** One reusable surface; no nested global panel overrides. */
export function SurfacePanel({ as: Element = 'div', tone = 'obsidian', className = '', children, ...rest }) {
  return (
    <Element className={[styles.panel, styles[tone] || styles.obsidian, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </Element>
  );
}
