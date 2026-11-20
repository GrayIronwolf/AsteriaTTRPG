import React,{useId} from 'react';
import styles from './ForgedBadge.module.css';

// Original Asteria combat silhouettes, retained exactly as authored in
// src/dashboards/CombatPanel.jsx. Level follows the original shield outline.
export const FORGED_BADGE_PATHS=Object.freeze({
  level:'M45 2L84 15L79 70L45 98L11 70L6 15Z',
  order:'M12 4H76L88 18V58L76 72H12V54H4V43H12V32H4V21H12Z',
  initiative:'M24 4H66L88 38L66 72H24L2 38Z',
  ap:'M45 2L56 14L73 10L75 27L88 38L75 49L73 66L56 62L45 74L34 62L17 66L15 49L2 38L15 27L17 10L34 14Z',
  timer:'M4 9H86V23L69 38L86 53V67H4V53L21 38L4 23Z'
});

// Display only: the containing dashboard remains the authority for numbers,
// turn state and timers. No button semantics or new data subscriptions.
export function ForgedBadge({kind,label,value,active=false,warning=false,compact=false}){
  const uid=useId().replace(/:/g,'');
  const shape=FORGED_BADGE_PATHS[kind];
  if(!shape)return null;
  const level=kind==='level',center=level?50:38;
  const text=String(value??'—');
  const inner=`translate(45 ${center}) scale(.88) translate(-45 -${center})`;
  const facets=`translate(45 ${center}) scale(.8) translate(-45 -${center})`;
  const steel=`badge-steel-${uid}`,inset=`badge-inset-${uid}`,
    highlight=`badge-highlight-${uid}`;
  return <div className={styles.badge}
    data-kind={kind} data-size={compact?'compact':'standard'}
    data-active={active?'true':'false'} data-warning={warning?'true':'false'}
    data-testid={`site-forged-badge-${kind}`} role="img"
    aria-label={`${label}: ${text}`}>
    <span className={styles.label} aria-hidden="true">{label}</span>
    <div className={styles.emblem} aria-hidden="true">
      <svg viewBox={level?'0 0 90 100':'0 0 90 76'}
        preserveAspectRatio="xMidYMid meet" focusable="false">
        <defs>
          <linearGradient id={steel} x1="0" y1="0" x2=".8" y2="1">
            <stop offset="0" stopColor="var(--ast-badge-metal-light)"/>
            <stop offset=".27" stopColor="var(--ast-badge-metal-mid)"/>
            <stop offset=".5" stopColor="var(--ast-badge-metal-light)"/>
            <stop offset=".81" stopColor="var(--ast-badge-metal-dark)"/>
            <stop offset="1" stopColor="var(--ast-badge-metal-mid)"/>
          </linearGradient>
          <linearGradient id={inset} x1="0" y1="0" x2=".8" y2="1">
            <stop offset="0" stopColor="var(--ast-badge-face-raised)"/>
            <stop offset=".47" stopColor="var(--ast-badge-face-deep)"/>
            <stop offset="1" stopColor="var(--ast-badge-face-low)"/>
          </linearGradient>
          <linearGradient id={highlight} x1=".1" y1="0" x2=".8" y2="1">
            <stop offset="0" stopColor="var(--badge-accent)" stopOpacity=".34"/>
            <stop offset=".57" stopColor="var(--badge-accent)" stopOpacity=".07"/>
            <stop offset="1" stopColor="var(--badge-accent)" stopOpacity="0"/>
          </linearGradient>
        </defs>
        <path d={shape} transform="translate(0 1.5)" fill="var(--ast-badge-face-deep)" opacity=".65"/>
        <path d={shape} fill={`url(#${steel})`}
          stroke="var(--ast-badge-metal-light)" strokeWidth="1.25" strokeLinejoin="round"/>
        <path d={shape} transform={inner} fill={`url(#${inset})`}
          stroke="var(--ast-badge-metal-dark)" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d={shape} transform={facets} fill={`url(#${highlight})`}/>
      </svg>
      <strong className={styles.value}>{text}</strong>
    </div>
  </div>;
}
