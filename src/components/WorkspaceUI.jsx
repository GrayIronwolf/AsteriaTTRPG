import React, { memo } from 'react';

export function WorkspaceShell({ eyebrow, title, subtitle, actions, sidebar, children, className = '' }) {
  return <div className={`react-workspace-shell ${className}`}>
    {sidebar ? <aside className="react-workspace-sidebar">{sidebar}</aside> : null}
    <div className="react-workspace-main">
      <header className="react-workspace-header asteria-react-panel">
        <div><p className="react-eyebrow">{eyebrow}</p><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</div>
        <div className="react-header-actions">{actions}</div>
      </header>
      {children}
    </div>
  </div>;
}

export function Panel({ title, eyebrow, action, children, className = '' }) {
  return <section className={`asteria-react-panel ${className}`}>
    {(title || eyebrow || action) ? <header className="react-panel-header"><div>{eyebrow ? <p className="react-eyebrow">{eyebrow}</p> : null}{title ? <h2>{title}</h2> : null}</div>{action}</header> : null}
    {children}
  </section>;
}

export function Tabs({ tabs, active, onChange, ariaLabel = 'Workspace sections' }) {
  return <nav className="react-tabs asteria-react-panel" aria-label={ariaLabel}>
    {tabs.map(tab => <button key={tab.id} className={active === tab.id ? 'active' : ''} onClick={() => onChange(tab.id)} type="button"><span aria-hidden="true">{tab.icon}</span>{tab.label}</button>)}
  </nav>;
}

export const ResourceBar = memo(function ResourceBar({ label, value, maximum, kind, compact = false }) {
  const current = Number(value || 0);
  const max = Math.max(0, Number(maximum || 0));
  const percent = max ? Math.max(0, Math.min(100, current / max * 100)) : 0;
  return <div className={`react-resource ${kind || ''} ${compact ? 'compact' : ''}`} data-resource={kind}>
    <div><b>{label}</b><span>{current.toLocaleString()} / {max.toLocaleString()}</span></div>
    <div className="react-resource-track"><i style={{ width: `${percent}%` }} /></div>
  </div>;
});

export function ConnectionBanner({ online, error, session }) {
  const status = error ? 'Sync needs attention' : online ? 'Live sync connected' : 'Reconnecting';
  return <div className={`react-connection ${error ? 'error' : online ? 'online' : 'offline'}`} role="status">
    <span /> <b>{status}</b>{session?.status ? <small>Session: {session.status}</small> : null}
  </div>;
}

export function EmptyState({ title, children }) {
  return <div className="react-empty"><h3>{title}</h3>{children ? <p>{children}</p> : null}</div>;
}

export function Modal({ title, eyebrow, onClose, children, busy = false, footer }) {
  return <div className="react-modal-backdrop" role="presentation" onMouseDown={event => { if(event.target === event.currentTarget && !busy) onClose?.(); }}>
    <section className="react-modal asteria-react-panel" role="dialog" aria-modal="true" aria-labelledby="react-modal-title" aria-busy={busy}>
      <header><div>{eyebrow ? <p className="react-eyebrow">{eyebrow}</p> : null}<h2 id="react-modal-title">{title}</h2></div><button type="button" className="react-icon-button" onClick={onClose} disabled={busy} aria-label="Close">X</button></header>
      <div className="react-modal-body">{children}</div>
      {footer ? <footer>{footer}</footer> : null}
    </section>
  </div>;
}

export function StatusPill({ children, tone = '' }) {
  return <span className={`react-status-pill ${tone}`}>{children}</span>;
}
