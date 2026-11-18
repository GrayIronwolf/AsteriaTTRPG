import React from 'react';
import styles from './CrystalButton.module.css';

/**
 * One accessible button surface for links and actions. Exact shape/size
 * variants are owned here — never in a global .button selector or late patch.
 */
export function CrystalButton({
  children, href, variant = 'nav', size = 'regular', active = false,
  disabled = false, type = 'button', className = '', ...rest
}) {
  const classes = [
    styles.button, styles[variant] || styles.nav,
    styles[size] || styles.regular,
    active ? styles.active : '',
    className
  ].filter(Boolean).join(' ');

  const content = <span className={styles.crystal}><span className={styles.label}>{children}</span></span>;
  if (href != null) {
    // Disabled navigation is not rendered as a deceptive interactive link.
    if (disabled) return <span className={classes} aria-disabled="true">{content}</span>;
    return (
      <a href={href} className={classes} aria-current={active ? 'page' : undefined} {...rest}>
        {content}
      </a>
    );
  }

  return (
    <button className={classes} type={type} disabled={disabled} {...rest}>
      {content}
    </button>
  );
}
