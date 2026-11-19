import React, { useEffect, useMemo, useState } from 'react';
import { PageLayout } from '../components/ui/PageLayout.jsx';
import { Heading, Eyebrow, BodyText } from '../components/ui/Typography.jsx';
import { loadPublicDomain } from '../compendium/publicCatalogue.mjs';
import { loadPublicSearchDomain } from '../compendium/publicSearchIndex.mjs';
import { PUBLIC_DOMAINS, resolveCompendiumScope } from '../compendium/compendiumModel.mjs';
import {
  createDiscoveryHref, filterDiscoveryEntries, getDiscoveryFacets,
  parseDiscoveryFilters
} from '../compendium/discoveryModel.mjs';
import styles from './CompendiumCataloguePage.module.css';

const PAGE_SIZE = 48;

/**
 * Phase 3.3 unified catalogue discovery: public-only source data, one router,
 * persistent facets, query, scope and sort. No additional global CSS or JS.
 */
export function CompendiumCataloguePage({ route }) {
  const scope = useMemo(() => resolveCompendiumScope(route.query), [route.hash]);
  const filters = useMemo(() => parseDiscoveryFilters(route.query), [route.hash]);
  const [records, setRecords] = useState([]);
  const [searchIndex, setSearchIndex] = useState(null);
  const [status, setStatus] = useState('loading');
  const [searchStatus, setSearchStatus] = useState('loading');
  const [draft, setDraft] = useState(scope.search);
  const [limit, setLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    setDraft(scope.search);
    setLimit(PAGE_SIZE);
  }, [route.hash]);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setSearchStatus('loading');
    setRecords([]);
    setSearchIndex(null);
    Promise.all(scope.domainIds.map(loadPublicDomain)).then(chunks => {
      if (!cancelled) {
        setRecords(chunks.flat());
        setStatus('ready');
      }
    }).catch(() => {
      if (!cancelled) { setRecords([]); setStatus('error'); }
    });
    // Only the already-filtered PUBLIC search shards are loaded. A search
    // failure falls back to metadata-only results rather than revealing data.
    Promise.all(scope.domainIds.map(loadPublicSearchDomain)).then(maps => {
      if (cancelled) return;
      const index = new Map();
      for (const map of maps) for (const [id,text] of map) index.set(id,text);
      setSearchIndex(index);
      setSearchStatus('ready');
    }).catch(() => {
      if (!cancelled) setSearchStatus('unavailable');
    });
    return () => { cancelled = true; };
  }, [scope]);

  // Typing previews metadata matches immediately; pressing Search activates
  // complete published-body search and creates a shareable browser-history URL.
  const hasSubmittedQuery = scope.search.trim() && scope.search === draft;
  const matching = useMemo(
    () => filterDiscoveryEntries(records, {
      query: draft, path: filters.path, sort: filters.sort,
      searchIndex: hasSubmittedQuery ? searchIndex : null
    }),
    [records, draft, filters, searchIndex, hasSubmittedQuery]
  );
  const facetCandidates = useMemo(
    () => filterDiscoveryEntries(records, {
      query: draft, path: [], sort: 'az',
      searchIndex: hasSubmittedQuery ? searchIndex : null
    }),
    [records, draft, hasSubmittedQuery, searchIndex]
  );
  const facets = useMemo(() => getDiscoveryFacets(facetCandidates, filters.path),
    [facetCandidates, filters.path]);
  const visible = matching.slice(0, limit);
  const title = route.id === 'handbook' ? 'Asteria Handbook'
    : route.id === 'lore' ? 'Worlds & Lore' : 'Asteria Compendium';

  function destination(patch = {}) {
    return createDiscoveryHref({
      domain: scope.selectedDomain,
      group: scope.group,
      legacyCategory: scope.category,
      query: scope.search,
      path: filters.path,
      sort: filters.sort,
      ...patch
    });
  }
  function navigate(patch) {
    const next = destination(patch);
    if (window.location.hash === next) {
      setDraft(String(patch.query ?? scope.search));
      setLimit(PAGE_SIZE);
    } else window.location.hash = next;
  }
  function submitSearch(event) {
    event.preventDefault();
    navigate({ query: draft, path: [] });
  }

  return (
    <PageLayout as="section" width="wide" className={styles.page}
      labelledBy="site-compendium-title" data-testid="site-compendium-catalogue">
      <Eyebrow>Public reference library</Eyebrow>
      <Heading id="site-compendium-title">{title}</Heading>
      <BodyText>Search Asteria's published definitions and browse their existing subject hierarchy.</BodyText>
      <BodyText muted>Public definitions only. Private campaign notes and GM-only content are not published here.</BodyText>

      <form className={styles.controls} role="search" onSubmit={submitSearch}
        data-testid="site-discovery-search-form">
        <label htmlFor="site-compendium-search">
          Search public catalogue
          <input id="site-compendium-search" type="search" value={draft}
            data-testid="site-compendium-search" placeholder="Search names, descriptions and public rules…"
            maxLength={160}
            onChange={event => { setDraft(event.target.value.slice(0,160)); setLimit(PAGE_SIZE); }} />
        </label>
        <button type="submit" data-testid="site-discovery-submit">Search all public text</button>
        <label htmlFor="site-compendium-domain">
          Subject
          <select id="site-compendium-domain" value={scope.selectedDomain}
            data-testid="site-compendium-domain"
            onChange={event => navigate({
              domain: event.target.value, group: '', legacyCategory: '',
              query: scope.search, path: []
            })}>
            <option value="">All selected subjects</option>
            {PUBLIC_DOMAINS.map(domain => (
              <option key={domain.id} value={domain.id}>{domain.label}</option>
            ))}
          </select>
        </label>
        <label htmlFor="site-compendium-sort">
          Sort results
          <select id="site-compendium-sort" value={filters.sort}
            data-testid="site-compendium-sort"
            onChange={event => navigate({sort:event.target.value, query:draft})}>
            <option value="relevance">Most relevant</option>
            <option value="az">Title A–Z</option>
            <option value="za">Title Z–A</option>
          </select>
        </label>
      </form>
      {hasSubmittedQuery && searchStatus === 'loading' &&
        <p role="status">Searching published definition text…</p>}
      {hasSubmittedQuery && searchStatus === 'unavailable' &&
        <p role="status">Full-text search is unavailable. Showing published catalogue matches.</p>}

      <div className={styles.discoveryLayout}>
        <aside className={styles.taxonomy} aria-label="Compendium category hierarchy"
          data-testid="site-discovery-taxonomy">
          <h2>Categories</h2>
          <nav aria-label="Category trail" className={styles.trail} data-testid="site-discovery-trail">
            <a href={destination({query:draft,path:[]})}
              aria-current={filters.path.length===0?'page':undefined}>All categories</a>
            {filters.path.map((segment,i) =>
              <React.Fragment key={i}>
                <span aria-hidden="true">/</span>
                <a href={destination({query:draft,path:filters.path.slice(0,i+1)})}
                  aria-current={i===filters.path.length-1?'page':undefined}>{segment}</a>
              </React.Fragment>
            )}
          </nav>
          {status === 'ready' && <div className={styles.facetList} data-testid="site-discovery-facets">
            {facets.children.map(child =>
              <a href={destination({query:draft,path:child.path})} key={child.label}
                data-testid="site-discovery-facet">
                <span>{child.label}</span>
                <span className={styles.count}>{child.count.toLocaleString()}</span>
              </a>
            )}
            {facets.directCount>0 && filters.path.length>0 &&
              <p>{facets.directCount.toLocaleString()} definitions belong directly to this category.</p>}
            {!facets.children.length && !filters.path.length &&
              <p>Categories are not available for the current results.</p>}
          </div>}
          {(filters.path.length>0 || draft || scope.selectedDomain) &&
            <a className={styles.clear} href="#/compendium" data-testid="site-discovery-clear">Clear all filters</a>}
        </aside>

        <div className={styles.resultArea}>
          {status === 'loading' && <p role="status">Loading public catalogue…</p>}
          {status === 'error' && <div role="alert">
            <p>Public catalogue is unavailable. Your existing website data has not been changed.</p>
            <button type="button" onClick={() => window.location.reload()}>Try again</button>
          </div>}
          {status === 'ready' && <>
            <p role="status" data-testid="site-compendium-results">
              {matching.length.toLocaleString()} public {matching.length === 1 ? 'definition' : 'definitions'}
            </p>
            {matching.length === 0 && <p>No public definitions match those filters.</p>}
            <div className={styles.results} data-testid="site-compendium-cards">
              {visible.map(entry => (
                <a href={entry.href} key={entry.id} className={styles.card}
                  data-testid="site-compendium-card">
                  <span className={styles.type}>{PUBLIC_DOMAINS.find(d => d.id===entry.domain)?.label||entry.domain}</span>
                  <span className={styles.name}>{entry.title}</span>
                  {entry.categoryPath.length>0 &&
                    <span className={styles.category}>{entry.categoryPath.join(' / ')}</span>}
                  {entry.summary && <span className={styles.summary}>{entry.summary}</span>}
                </a>
              ))}
            </div>
            {matching.length > limit &&
              <button className={styles.more} type="button" data-testid="site-compendium-more"
                onClick={() => setLimit(value=>value+PAGE_SIZE)}>
                Show more definitions
              </button>}
          </>}
        </div>
      </div>
    </PageLayout>
  );
}
