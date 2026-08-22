import React, { memo, useEffect, useId, useRef } from 'react';
import { liveSyncPresentation } from '../state/liveSyncState.mjs';
import { AsteriaIcon } from './AsteriaIcons.jsx';

export function AsteriaAppShell({ eyebrow, title, subtitle, actions, sidebar, children, className = '', showHeader = true }) {
  return <div className={`react-workspace-shell ${sidebar ? 'has-sidebar' : 'no-sidebar'} ${className}`} data-asteria-app-shell="true">
    {sidebar ? <aside className="react-workspace-sidebar">{sidebar}</aside> : null}
    <div className="react-workspace-main">
      {showHeader ? <AppHeader eyebrow={eyebrow} title={title} subtitle={subtitle} actions={actions} /> : null}
      {children}
    </div>
  </div>;
}

export const WorkspaceShell = AsteriaAppShell;

export function AppHeader({ eyebrow, title, subtitle, actions }) {
  return <header className="react-workspace-header asteria-react-panel">
    <div>{eyebrow ? <p className="react-eyebrow">{eyebrow}</p> : null}<h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</div>
    {actions ? <div className="react-header-actions">{actions}</div> : null}
  </header>;
}

export function PanelHeader({ title, eyebrow, action, icon }) {
  if(!title && !eyebrow && !action) return null;
  return <header className="react-panel-header"><div className="react-panel-title-group">{icon ? <AsteriaIcon name={icon} /> : null}<div>{eyebrow ? <p className="react-eyebrow">{eyebrow}</p> : null}{title ? <h2>{title}</h2> : null}</div></div>{action}</header>;
}

export function Panel({ title, eyebrow, action, icon, children, className = '' }) {
  return <section className={`asteria-react-panel ${className}`}>
    <PanelHeader title={title} eyebrow={eyebrow} action={action} icon={icon} />
    {children}
  </section>;
}

export const AsteriaPanel = Panel;
export const DashboardCard = Panel;

export function DashboardPanel({ variant = 'normal', compact = false, className = '', ...props }) {
  return <Panel {...props} className={`react-dashboard-panel variant-${variant} ${compact ? 'is-compact' : ''} ${className}`.trim()} />;
}

export function SectionHeader({ title, eyebrow, action, level = 2 }) {
  const Heading = level === 3 ? 'h3' : 'h2';
  return <header className="react-section-header"><div>{eyebrow ? <p className="react-eyebrow">{eyebrow}</p> : null}<Heading>{title}</Heading></div>{action}</header>;
}

export function NavigationItem({ tab, active, index, onChange, onKeyDown }) {
  return <button key={tab.id} role="tab" aria-selected={active} tabIndex={active ? 0 : -1} className={active ? 'active' : ''} onKeyDown={event => onKeyDown(event, index)} onClick={() => onChange(tab.id)} type="button"><span aria-hidden="true">{React.isValidElement(tab.icon) ? tab.icon : <AsteriaIcon name={tab.icon || 'info'} />}</span><span className="react-tab-label">{tab.label}</span></button>;
}

export function Tabs({ tabs, active, onChange, ariaLabel = 'Workspace sections' }) {
  const move = (event, index) => {
    if(!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')?.[next]?.focus();
  };
  return <nav className="react-tabs asteria-react-panel" aria-label={ariaLabel} aria-orientation="horizontal" role="tablist">
    {tabs.map((tab, index) => <NavigationItem key={tab.id} tab={tab} index={index} active={active === tab.id} onChange={onChange} onKeyDown={move} />)}
  </nav>;
}

export const DashboardNavigation = Tabs;

export const ResourceBar = memo(function ResourceBar({ label, value, maximum, kind, compact = false }) {
  const current = Number(value || 0);
  const max = Math.max(0, Number(maximum || 0));
  const percent = max ? Math.max(0, Math.min(100, current / max * 100)) : 0;
  return <div className={`react-resource ${kind || ''} ${compact ? 'compact' : ''}`} data-resource={kind} role="progressbar" aria-label={label} aria-valuemin="0" aria-valuemax={max} aria-valuenow={current} aria-valuetext={`${current} of ${max}`}>
    <div><b>{label}</b><span>{current.toLocaleString()} / {max.toLocaleString()}</span></div>
    <div className="react-resource-track"><i style={{ width: `${percent}%` }} /></div>
  </div>;
});

export const StatBar = ResourceBar;

export function ResourceChip({ label, value, tone = '' }) {
  return <span className={`react-resource-chip ${tone}`}><small>{label}</small><strong>{value}</strong></span>;
}

export function CurrencyDisplay({ label, value, symbol = 'G', tone = 'gold' }) {
  return <div className={`react-currency-display ${tone}`}><span aria-hidden="true">{symbol}</span><div><small>{label}</small><strong>{Number(value || 0).toLocaleString()}</strong></div></div>;
}

export function LiveSyncStatus({ online, error, loading, connectionState, session }) {
  const presentation = liveSyncPresentation({ online, error, loading, connectionState, session });
  return <div className={`react-connection ${presentation.tone}`} role="status" aria-live="polite" data-sync-state={presentation.state}>
    <span aria-hidden="true" /> <b>{presentation.label}</b><small>{presentation.detail}</small>
  </div>;
}

export const ConnectionBanner = LiveSyncStatus;

export function EmptyState({ title, children }) {
  return <div className="react-empty" role="status"><h3>{title}</h3>{children ? <p>{children}</p> : null}</div>;
}

export function LoadingSkeleton({ label = 'Loading content', lines = 3 }) {
  return <div className="react-loading-state" role="status" aria-label={label}>{Array.from({ length:Math.max(1, lines) }, (_, index) => <span key={index} />)}</div>;
}

export function Modal({ title, eyebrow, onClose, children, busy = false, footer }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const returnFocusRef = useRef(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    returnFocusRef.current = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.focus();
    const keydown = event => {
      if(event.key === 'Escape' && !busyRef.current) closeRef.current?.();
      if(event.key !== 'Tab' || !dialog) return;
      const controls = [...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')];
      if(!controls.length) return event.preventDefault();
      const first = controls[0];
      const last = controls[controls.length - 1];
      if(event.shiftKey && document.activeElement === first){ event.preventDefault(); last.focus(); }
      else if(!event.shiftKey && document.activeElement === last){ event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); returnFocusRef.current?.focus?.(); };
  }, []);
  return <div className="react-modal-backdrop" role="presentation" onMouseDown={event => { if(event.target === event.currentTarget && !busy) onClose?.(); }}>
    <section ref={dialogRef} tabIndex="-1" className="react-modal asteria-react-panel" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy}>
      <header><div>{eyebrow ? <p className="react-eyebrow">{eyebrow}</p> : null}<h2 id={titleId}>{title}</h2></div><button type="button" className="react-icon-button" onClick={onClose} disabled={busy} aria-label="Close dialog"><AsteriaIcon name="close" /></button></header>
      <div className="react-modal-body">{children}</div>
      {footer ? <footer>{footer}</footer> : null}
    </section>
  </div>;
}

export function AsteriaButton({ children, tone = '', className = '', disabledReason = '', ...props }) {
  const explanation = props.disabled && disabledReason ? disabledReason : props.title;
  return <button className={`asteria-button ${tone} ${className}`.trim()} type="button" aria-disabled={props.disabled || undefined} title={explanation} {...props}>{children}</button>;
}

export function IconButton({ label, children, className = '', ...props }) {
  return <button className={`react-icon-button ${className}`.trim()} type="button" aria-label={label} title={label} {...props}>{children}</button>;
}

export function Tooltip({ label, children }) {
  return <span className="react-tooltip" data-tooltip={label}>{children}</span>;
}

export function SearchField({ value, onChange, placeholder = 'Search...', label = 'Search', className = '' }) {
  return <label className={`react-search-field ${className}`.trim()}><span className="visually-hidden">{label}</span><AsteriaIcon name="search" /><input type="search" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

export function FilterControl({ label, value, onChange, children, className = '' }) {
  return <label className={`react-filter-control ${className}`.trim()}><span>{label}</span><select value={value} onChange={event => onChange(event.target.value)}>{children}</select></label>;
}

export function ErrorState({ title = 'Something went wrong', children }) {
  return <div className="react-error-state" role="alert"><h3>{title}</h3>{children ? <p>{children}</p> : null}</div>;
}

export function ReadOnlyState({ children = 'This action is unavailable until the GM starts a live session.' }) {
  return <div className="react-read-only-state" role="status">{children}</div>;
}

export function LiveRegion({ message, priority = 'polite' }) {
  return <div className="visually-hidden" role="status" aria-live={priority} aria-atomic="true">{message}</div>;
}

export function StatusPill({ children, tone = '' }) {
  return <span className={`react-status-pill ${tone}`}>{children}</span>;
}
