import React, { useId } from 'react';
import wordmarkUrl from '../../../assets/header/asteria-wordmark.png';
import styles from './AsteriaBrand.module.css';

/**
 * One asset-backed logo with the existing four Asteria star windows.
 * Each instance gets unique filter/clip IDs; there is no DOM mutation,
 * global animation timer or separate legacy logo CSS.
 */
export function AsteriaBrand() {
  const prefix = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  return (
    <a className={styles.brand} href="#home" data-testid="site-brand" aria-label="Asteria TTRPG — Home">
      <svg
        className={styles.wordmark}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 2048 682"
        preserveAspectRatio="xMinYMid meet"
        role="img"
        aria-label="Asteria TTRPG"
      >
        <defs>
          <filter
            id={prefix + '-star-colour'}
            colorInterpolationFilters="sRGB"
            x="-20%" y="-20%" width="140%" height="140%"
          >
            <feColorMatrix type="saturate" values="0" result="silver" />
            <feFlood className={styles.starFlood} result="theme" />
            <feBlend in="theme" in2="silver" mode="color" result="coloured" />
            <feComposite in="coloured" in2="SourceGraphic" operator="in" />
          </filter>
          <clipPath id={prefix + '-star-windows'}>
            <path d="M356 286 Q374 344 443 365 Q374 384 356 450 Q337 385 266 365 Q337 345 356 286Z" />
            <path d="M1721 286 Q1740 345 1804 365 Q1740 385 1721 447 Q1702 385 1640 365 Q1702 345 1721 286Z" />
            <path d="M709 496 Q718 516 747 527 Q718 536 709 557 Q699 536 671 527 Q699 518 709 496Z" />
            <path d="M1346 497 Q1356 518 1385 527 Q1356 537 1346 558 Q1336 537 1308 527 Q1336 518 1346 497Z" />
          </clipPath>
        </defs>
        <image href={wordmarkUrl} width="2048" height="682" />
        <g clipPath={'url(#' + prefix + '-star-windows)'} aria-hidden="true">
          <image
            href={wordmarkUrl}
            width="2048" height="682"
            filter={'url(#' + prefix + '-star-colour)'}
          />
        </g>
      </svg>
    </a>
  );
}
