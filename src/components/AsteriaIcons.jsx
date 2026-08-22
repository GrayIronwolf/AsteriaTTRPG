import React from 'react';

const paths = {
  dashboard: <><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" /></>,
  character: <><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></>,
  talents: <><path d="M12 2v20M5 6l7 4 7-4M5 18l7-4 7 4" /><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="5" cy="18" r="2" /><circle cx="19" cy="18" r="2" /></>,
  skills: <><path d="m12 2 2.3 6.2L21 10l-5 4.2.4 6.8-4.4-2.6L7.6 21l.4-6.8L3 10l6.7-1.8z" /></>,
  spells: <><path d="m13 2-8 12h6l-1 8 9-13h-6z" /></>,
  inventory: <><path d="M4 7h16v14H4zM8 7V5a4 4 0 0 1 8 0v2M4 12h16" /></>,
  quest: <><path d="M5 21V4h11l-1 4 4 4H5" /></>,
  journal: <><path d="M5 3h12a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2zM8 7h8M8 11h8M8 15h5" /></>,
  party: <><circle cx="8" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M2.5 21a5.5 5.5 0 0 1 11 0M13 21a4 4 0 0 1 8 0" /></>,
  gallery: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m4 17 5-5 4 4 2-2 5 4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  filter: <><path d="M3 5h18M6 12h12M10 19h4" /></>,
  grid: <><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" /></>,
  list: <><path d="M9 6h12M9 12h12M9 18h12" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  chevronDown: <><path d="m6 9 6 6 6-6" /></>,
  chevronLeft: <><path d="m15 18-6-6 6-6" /></>,
  chevronRight: <><path d="m9 18 6-6-6-6" /></>,
  coin: <><circle cx="12" cy="12" r="9" /><path d="M9 8.5h4a2.5 2.5 0 0 1 0 5H9m3-8v13" /></>,
  location: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0z" /><circle cx="12" cy="10" r="2.5" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  check: <><path d="m5 12 4 4L19 6" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
  upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5" /></>,
  equipment: <><path d="m6 3 12 18M18 3 6 21M4 5l3-2 2 3-3 2zM20 5l-3-2-2 3 3 2z" /></>,
  armour: <><path d="M12 3 4.5 6v5.5c0 4.7 3.1 7.8 7.5 9.5 4.4-1.7 7.5-4.8 7.5-9.5V6z" /><path d="M9 8h6v7H9z" /></>,
  weapon: <><path d="M14.5 4.5 19.5 2l-2.5 5-9.5 9.5-3 3-2-2 3-3z" /><path d="m5 13 6 6M8 18l-2 2" /></>,
  quick: <><path d="M7 3h10v4l2.5 4.5a6.8 6.8 0 1 1-15 0L7 7z" /><path d="M8 15h8" /></>,
  level: <><path d="m12 2 7 3v6c0 4.6-2.8 8-7 11-4.2-3-7-6.4-7-11V5z" /><path d="M9 12h6M12 9v6" /></>,
  campaign: <><path d="M4 5h16v15H4zM8 2v6M16 2v6M4 10h16" /></>,
  xp: <><path d="m12 3 2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z" /></>,
  bag: <><path d="M5 8h14l1 13H4zM9 8V6a3 3 0 0 1 6 0v2" /></>,
  use: <><path d="M8 3h8v4l3 5a7 7 0 1 1-14 0l3-5zM8 15h8" /></>,
  transfer: <><path d="M4 7h14m-4-4 4 4-4 4M20 17H6m4 4-4-4 4-4" /></>
};

export function AsteriaIcon({ name, size = 18, className = '' }) {
  return <svg
    className={`asteria-icon ${className}`.trim()}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >{paths[name] || paths.info}</svg>;
}

export default AsteriaIcon;
