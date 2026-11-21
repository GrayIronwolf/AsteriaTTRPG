import React from 'react';
import forgeCampaignBook from '../../../assets/menus/forge-campaign-map-book.avif';
import { filterMegaMenuEntries } from '../navigation/megaMenuRegistry.mjs';
import styles from './NavigationMegaMenu.module.css';

/**
 * One React-owned modal dropdown for all seven Asteria menu groups.
 * Cards navigate through the Phase 1 hash router; no legacy DOM mutation.
 */
export function NavigationMegaMenu({
  menu, query, owned, onQueryChange, onClose, onNavigate, panelRef
}) {
  if (!menu) return null;
  const entries = filterMegaMenuEntries(menu, query, {owned});

  return (
    <div className={styles.layer} data-testid="site-mega-layer">
      <button
        type="button"
        className={styles.backdrop}
        aria-label="Close navigation menu"
        tabIndex={-1}
        onClick={() => onClose(true)}
      />
      <section
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="site-mega-heading"
        data-testid="site-mega-menu"
        data-menu={menu.id}
      >
        <div className={styles.heading}>
          <div className={styles.headingText}>
            <p className={styles.eyebrow}>Asteria Navigation</p>
            <h2 id="site-mega-heading">{menu.title}</h2>
          </div>
          <label className={styles.searchLabel}>
            <span>Search menu cards</span>
            <input
              type="search"
              value={query}
              onChange={event => onQueryChange(event.target.value)}
              autoComplete="off"
              placeholder="Find a section..."
              aria-label="Search menu cards"
              data-testid="site-mega-search"
            />
          </label>
          <button
            type="button"
            className={styles.close}
            aria-label="Close navigation"
            onClick={() => onClose(true)}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className={styles.actions}>
          <a
            href={menu.defaultHref}
            onClick={onNavigate}
            className={styles.browseAll}
            data-testid="site-mega-browse"
          >
            Browse all {menu.title}
          </a>
        </div>
        <div className={styles.cardGrid} data-testid="site-mega-cards">
          {entries.map(item => (
            <a
              key={item.id}
              className={styles.card}
              href={item.href}
              onClick={onNavigate}
              aria-label={item.label}
              data-testid={'site-menu-card-' + item.id}
            >
              <span className={styles.cardArt} aria-hidden="true">
                {item.artwork === 'campaign-book' && (
                  <img src={forgeCampaignBook} width="256" height="128" alt="" loading="lazy" decoding="async" />
                )}
              </span>
              <span className={styles.cardText}>
                <span className={styles.cardLabel}>{item.label}</span>
                <span className={styles.cardDescription}>{item.description}</span>
              </span>
            </a>
          ))}
        </div>
        {entries.length === 0 && (
          <p className={styles.noResults} role="status">
            No menu cards match that search. Try a different term.
          </p>
        )}
      </section>
    </div>
  );
}
