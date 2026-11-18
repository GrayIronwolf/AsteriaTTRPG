import React, { useEffect, useMemo, useState } from 'react';
import { PageLayout } from '../components/ui/PageLayout.jsx';
import { Heading, Eyebrow, BodyText } from '../components/ui/Typography.jsx';
import { loadPublicDomain } from '../compendium/publicCatalogue.mjs';
import {
  PUBLIC_DOMAINS, createCompendiumHref, filterPublicCatalogue,
  groupPublicCategories, resolveCompendiumScope
} from '../compendium/compendiumModel.mjs';
import styles from './CompendiumCataloguePage.module.css';

const PAGE_SIZE = 48;

/**
 * Phase 3.1 public-only catalogue, not unrestricted Compendium entry content.
 * Search and category filters use the canonical route's query parameters.
 * Details remain fail-closed previews until their later content migration.
 */
export function CompendiumCataloguePage({ route }) {
  const scope = useMemo(() => resolveCompendiumScope(route.query), [route.hash]);
  const [records, setRecords] = useState([]);
  const [status, setStatus] = useState('loading');
  const [search, setSearch] = useState(scope.search);
  const [category, setCategory] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);

  useEffect(() => { setSearch(scope.search); setCategory(''); setLimit(PAGE_SIZE); }, [route.hash]);

  useEffect(() => {
    let cancelled = false;
    setRecords([]);
    setStatus('loading');
    Promise.all(scope.domainIds.map(loadPublicDomain)).then(chunks => {
      if (cancelled) return;
      setRecords(chunks.flat());
      setStatus('ready');
    }).catch(() => {
      if (!cancelled) { setRecords([]); setStatus('error'); }
    });
    return () => { cancelled = true; };
  }, [scope]);

  const matching = useMemo(
    () => filterPublicCatalogue(records, { search, category }),
    [records, search, category]
  );
  const categories = useMemo(() => groupPublicCategories(records), [records]);
  const visible = matching.slice(0, limit);
  const title = route.id === 'handbook' ? 'Asteria Handbook'
    : route.id === 'lore' ? 'Worlds & Lore' : 'Asteria Compendium';

  return (
    <PageLayout as="section" width="wide" className={styles.page}
      labelledBy="site-compendium-title" data-testid="site-compendium-catalogue">
      <Eyebrow>Public reference library</Eyebrow>
      <Heading id="site-compendium-title">{title}</Heading>
      <BodyText>Browse the existing Asteria definitions by subject, category, or keyword.</BodyText>
      <BodyText muted>
        This is the public catalogue. Full definition pages and GM-only campaign notes
        are not yet available in the new React website.
      </BodyText>
      <div className={styles.controls}>
        <label htmlFor="site-compendium-search">
          Search public catalogue
          <input id="site-compendium-search" type="search" value={search}
            data-testid="site-compendium-search" placeholder="Find an Asteria definition…"
            onChange={event => { setSearch(event.target.value.slice(0,160)); setLimit(PAGE_SIZE); }} />
        </label>
        <label htmlFor="site-compendium-domain">
          Subject
          <select id="site-compendium-domain" value={scope.selectedDomain}
            data-testid="site-compendium-domain"
            onChange={event => {
              window.location.hash = createCompendiumHref({
                domain: event.target.value, query: search
              });
            }}>
            <option value="">All selected subjects</option>
            {PUBLIC_DOMAINS.map(domain => (
              <option key={domain.id} value={domain.id}>{domain.label}</option>
            ))}
          </select>
        </label>
        <label htmlFor="site-compendium-category">
          Category
          <select id="site-compendium-category" value={category}
            data-testid="site-compendium-category"
            onChange={event => { setCategory(event.target.value); setLimit(PAGE_SIZE); }}>
            <option value="">All categories</option>
            {categories.map(value => <option value={value} key={value}>{value}</option>)}
          </select>
        </label>
      </div>
      {status === 'loading' && <p role="status">Loading public catalogue…</p>}
      {status === 'error' && <div role="alert">
        <p>Public catalogue is unavailable. Your existing website data has not been changed.</p>
        <button type="button" onClick={() => window.location.reload()}>Try again</button>
      </div>}
      {status === 'ready' && (
        <>
          <p role="status" data-testid="site-compendium-results">
            {matching.length.toLocaleString()} public {matching.length === 1 ? 'definition' : 'definitions'}
          </p>
          {matching.length === 0 && <p>No public definitions match those filters.</p>}
          <div className={styles.results} data-testid="site-compendium-cards">
            {visible.map(entry => (
              <a href={entry.href} key={entry.id} className={styles.card}
                data-testid="site-compendium-card">
                <span className={styles.type}>{PUBLIC_DOMAINS.find(d => d.id === entry.domain)?.label || entry.domain}</span>
                <span className={styles.name}>{entry.title}</span>
                {entry.categoryPath.length > 0 &&
                  <span className={styles.category}>{entry.categoryPath.join(' / ')}</span>}
                {entry.summary && <span className={styles.summary}>{entry.summary}</span>}
              </a>
            ))}
          </div>
          {matching.length > limit && (
            <button className={styles.more} type="button"
              data-testid="site-compendium-more"
              onClick={() => setLimit(current => current + PAGE_SIZE)}>
              Show more definitions
            </button>
          )}
        </>
      )}
      <a className={styles.home} href="#home">Return to Home</a>
    </PageLayout>
  );
}
