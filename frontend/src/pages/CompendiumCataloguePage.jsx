import React, { useEffect, useMemo, useState } from 'react';
import { PageLayout, PageHeader } from '../components/ui/PageLayout.jsx';
import { BodyText } from '../components/ui/Typography.jsx';
import { loadPublicDomain } from '../compendium/publicCatalogue.mjs';
import { loadPublicSearchDomain } from '../compendium/publicSearchIndex.mjs';
import {
  PUBLIC_DOMAINS, filterLibraryScope, resolveCompendiumScope
} from '../compendium/compendiumModel.mjs';
import {
  createDiscoveryHref, filterDiscoveryEntries, getDiscoveryFacets, getMetadataFacets,
  parseDiscoveryFilters
} from '../compendium/discoveryModel.mjs';
import {
  LEGACY_LIBRARY_CATEGORIES, LEGACY_LIBRARY_GROUPS, getLibraryCategory,
  getLibraryCounts, legacyLibraryCategory
} from '../compendium/legacyLibrary.mjs';
import { useLibraryPreferences } from '../compendium/useLibraryPreferences.js';
import styles from './CompendiumCataloguePage.module.css';

const PAGE_SIZE = 48;
const NO_SEARCH = Object.freeze({domains:'',index:null,status:'idle'});
const fieldLabel = field => (field[0].toUpperCase()+field.slice(1)).replace(/([a-z])([A-Z])/g,'$1 $2');

function LibraryCards({entries,isFavourite,toggleFavourite,preferencesReady,testId}) {
  return <div className={styles.results} data-testid={testId}>
    {entries.map(entry => {
      const saved = isFavourite(entry);
      const kind = getLibraryCategory(legacyLibraryCategory(entry));
      return <article className={styles.card} key={entry.id}>
        <a href={entry.href} className={styles.cardLink} data-testid="site-compendium-card">
          {entry.artwork && <img className={styles.artwork} src={entry.artwork} alt="" loading="lazy" />}
          <span className={styles.type}>{kind?.title || entry.domain}</span>
          <span className={styles.name}>{entry.title}</span>
          {entry.categoryPath.length > 0 &&
            <span className={styles.category}>{entry.categoryPath.join(' / ')}</span>}
          {entry.summary && <span className={styles.summary}>{entry.summary}</span>}
          {entry.indexCode && <span className={styles.code} title="Permanent Asteria ID Index Code">{entry.indexCode}</span>}
        </a>
        <button type="button" className={styles.favourite} aria-pressed={saved} disabled={!preferencesReady}
          aria-label={(saved ? 'Remove '+entry.title+' from' : 'Add '+entry.title+' to')+' favourites'}
          data-testid="site-library-favourite" onClick={() => toggleFavourite(entry)}>
          <span aria-hidden="true">{saved ? '★' : '☆'}</span>
        </button>
      </article>;
    })}
  </div>;
}

function LibraryGroups({selected,counts,destination}) {
  return <div className={styles.groups}>
    {LEGACY_LIBRARY_GROUPS.filter(group => !selected || group.id === selected).map(group => (
      <section key={group.id} className={styles.group} data-testid="site-library-group" data-library-group={group.id}>
        <div className={styles.groupHeading}>
          <span aria-hidden="true">{group.symbol}</span>
          <div>
            <h2><a href={destination({group:group.id,legacyCategory:'',path:[]})}>{group.title}</a></h2>
            <p>{group.description}</p>
          </div>
        </div>
        <small>{counts.groups.get(group.id).toLocaleString()} published entries</small>
        <details open={Boolean(selected)}>
          <summary>Browse categories</summary>
          <ul>
            {group.categories.map(category => {
              const count = counts.categories.get(category.id);
              return <li key={category.id}>
                {count ? <a href={destination({group:group.id,legacyCategory:category.id,path:[]})}>
                  <span>{category.title}</span><small>{count.toLocaleString()}</small>
                </a> : <span className={styles.unavailable}>
                  <span>{category.title}</span><small>No published entries</small>
                </span>}
              </li>;
            })}
          </ul>
        </details>
      </section>
    ))}
  </div>;
}

export function CompendiumCataloguePage({ route }) {
  const legacyDomain = route.params?.legacyDomain === true;
  const scope = useMemo(() => resolveCompendiumScope(route.query,{legacyDomain}),[route.query,legacyDomain]);
  const filters = useMemo(() => parseDiscoveryFilters(route.query,{legacyDomain}),[route.query,legacyDomain]);
  const preferences = useLibraryPreferences();
  const {favourites,recent} = preferences;
  const [records,setRecords] = useState([]);
  const [fullText,setFullText] = useState(NO_SEARCH);
  const [status,setStatus] = useState('loading');
  const [draft,setDraft] = useState(scope.search);
  const [limit,setLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    setDraft(scope.search);
    setLimit(PAGE_SIZE);
  },[route.hash,scope.search]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(PUBLIC_DOMAINS.map(({id}) => loadPublicDomain(id))).then(chunks => {
      if (cancelled) return;
      setRecords(chunks.flat());
      setStatus('ready');
    }).catch(() => {
      if (!cancelled) setStatus('error');
    });
    return () => { cancelled = true; };
  },[]);

  const scoped = useMemo(() => filterLibraryScope(records,scope),[records,scope]);
  const hasSubmittedQuery = Boolean(scope.search.trim() && scope.search === draft);
  const searchDomains = useMemo(() => [...new Set(scoped.map(entry => entry.domain))].sort().join(','),
    [scoped]);
  useEffect(() => {
    if (!scope.search.trim() || !searchDomains) return;
    let cancelled = false;
    // Only submitted queries load prefiltered public section text.
    Promise.all(searchDomains.split(',').map(loadPublicSearchDomain)).then(maps => {
      if (cancelled) return;
      const index = new Map();
      for (const map of maps) for (const [id,text] of map) index.set(id,text);
      setFullText({domains:searchDomains,index,status:'ready'});
    }).catch(() => {
      if (!cancelled) setFullText({domains:searchDomains,index:null,status:'unavailable'});
    });
    return () => { cancelled = true; };
  },[scope.search,searchDomains]);

  const searchStatus = fullText.domains === searchDomains ? fullText.status : 'loading';
  const searchIndex = hasSubmittedQuery && searchStatus === 'ready' ? fullText.index : null;
  const searchCandidates = useMemo(
    () => filters.saved ? filterLibraryScope(scoped,{}, {favourites}) : scoped,
    [scoped,filters.saved,favourites]
  );
  const matching = useMemo(() => filterDiscoveryEntries(searchCandidates,{
    ...filters, query:draft, searchIndex, categoryByPath:Boolean(scope.selectedDomain)
  }),[searchCandidates,filters,draft,searchIndex,scope.selectedDomain]);
  const facetCandidates = useMemo(() => filterDiscoveryEntries(searchCandidates,{
    query:draft, field:filters.field, value:filters.value, searchIndex
  }),[searchCandidates,draft,filters.field,filters.value,searchIndex]);
  const facets = useMemo(() => getDiscoveryFacets(facetCandidates,filters.path),[facetCandidates,filters.path]);
  const counts = useMemo(() => getLibraryCounts(records),[records]);
  const metadata = useMemo(() => getMetadataFacets(scoped,scope.selectedDomain),[scoped,scope.selectedDomain]);
  const selectedMetadata = metadata.find(row => row.field === filters.field);
  const selectedValue = selectedMetadata?.values.find(value => value.toLocaleLowerCase() === filters.value.toLocaleLowerCase()) ?? filters.value;
  const byId = useMemo(() => new Map(records.map(entry => [entry.id,entry])),[records]);
  const favouriteEntries = favourites.map(id => byId.get(id)).filter(Boolean);
  const recentEntries = recent.map(id => byId.get(id)).filter(Boolean).slice(0,6);
  const categoryOptions = LEGACY_LIBRARY_CATEGORIES.filter(category => !scope.group || category.group === scope.group);
  const showResults = Boolean(draft || scope.group || scope.category || scope.selectedDomain ||
    filters.path.length || filters.field || filters.saved || filters.sort !== 'relevance');
  const title = route.id === 'handbook' ? 'Asteria Handbook'
    : route.id === 'lore' ? 'Worlds & Lore' : 'Asteria Compendium';

  function destination(patch = {}) {
    return createDiscoveryHref({
      ...filters, domain:scope.selectedDomain, group:scope.group, legacyCategory:scope.category,
      includeLibraryScope:true, query:scope.search, ...patch
    });
  }
  function navigate(patch) {
    const next = destination({query:draft,...patch});
    if (window.location.hash === next) {
      setDraft(String(patch.query ?? draft).trim());
      setLimit(PAGE_SIZE);
    } else window.location.hash = next;
  }
  function submitSearch(event) {
    event.preventDefault();
    navigate({query:draft});
  }

  return <PageLayout as="section" width="wide" className={styles.page}
    labelledBy="site-compendium-title" data-testid="site-compendium-catalogue">
    <PageHeader eyebrow="The Asteria Library" id="site-compendium-title" title={title} />
    <div className={styles.discoveryLayout} data-page-shell="true">
      <aside data-page-rail="true" className={styles.taxonomy} aria-label="Compendium category hierarchy"
        data-testid="site-discovery-taxonomy">
        <h2>Categories</h2>
        <nav aria-label="Category trail" className={styles.trail} data-testid="site-discovery-trail">
          <a href={destination({query:draft,path:[]})}
            aria-current={filters.path.length===0?'page':undefined}>All categories</a>
          {filters.path.map((segment,i) => <React.Fragment key={i}>
            <span aria-hidden="true">/</span>
            <a href={destination({query:draft,path:filters.path.slice(0,i+1)})}
              aria-current={i===filters.path.length-1?'page':undefined}>{segment}</a>
          </React.Fragment>)}
        </nav>
        {status === 'ready' && <div className={styles.facetList} data-page-nav="true" data-testid="site-discovery-facets">
          {facets.children.map(child => <a data-page-nav-item="true"
            href={destination({query:draft,path:child.path})} key={child.label} data-testid="site-discovery-facet">
            <span>{child.label}</span><span className={styles.count}>{child.count.toLocaleString()}</span>
          </a>)}
          {facets.directCount > 0 && filters.path.length > 0 &&
            <p>{facets.directCount.toLocaleString()} definitions belong directly to this category.</p>}
        </div>}
        {showResults && <a className={styles.clear}
          href="#/compendium" data-testid="site-discovery-clear">Clear all filters</a>}
      </aside>
      <div className={styles.resultArea} data-page-content="true">
        <BodyText muted>Public definitions only. Private campaign notes and GM-only content are not published here.</BodyText>
        <form className={styles.controls} role="search" onSubmit={submitSearch} data-testid="site-discovery-search-form">
          <label htmlFor="site-compendium-search">
            Search public catalogue
            <input id="site-compendium-search" type="search" value={draft} data-testid="site-compendium-search"
              placeholder="Search names, aliases or Asteria IDs…" maxLength={160}
              onChange={event => { setDraft(event.target.value); setLimit(PAGE_SIZE); }} />
          </label>
          <button type="submit" data-testid="site-discovery-submit">Search all public text</button>
          <label>Section
            <select value={scope.group} data-testid="site-library-section" onChange={event =>
              navigate({group:event.target.value,legacyCategory:'',domain:'',path:[],field:'',value:''})}>
              <option value="">All sections</option>
              {LEGACY_LIBRARY_GROUPS.map(group => <option key={group.id} value={group.id}>
                {group.title} ({counts.groups.get(group.id).toLocaleString()})
              </option>)}
            </select>
          </label>
          <label>Library category
            <select value={scope.category} data-testid="site-library-category" onChange={event => {
              const category = getLibraryCategory(event.target.value);
              navigate({group:category?.group || scope.group,legacyCategory:event.target.value,
                domain:'',path:[],field:'',value:''});
            }}>
              <option value="">All categories</option>
              {categoryOptions.map(category => <option key={category.id} value={category.id}>
                {category.title} ({counts.categories.get(category.id).toLocaleString()})
              </option>)}
            </select>
          </label>
          <label>Subject
            <select id="site-compendium-domain" value={scope.selectedDomain} data-testid="site-compendium-domain"
              onChange={event => navigate({domain:event.target.value,group:'',legacyCategory:'',path:[],field:'',value:''})}>
              <option value="">All selected subjects</option>
              {PUBLIC_DOMAINS.map(domain => <option key={domain.id} value={domain.id}>{domain.label}</option>)}
            </select>
          </label>
          <label>Sort results
            <select id="site-compendium-sort" value={filters.sort} data-testid="site-compendium-sort"
              onChange={event => navigate({sort:event.target.value})}>
              <option value="relevance">Relevance</option>
              <option value={filters.sort === 'az' ? 'az' : 'name'}>Name A–Z</option>
              <option value="za">Name Z–A</option>
              <option value="category">Category</option>
            </select>
          </label>
          {(metadata.length > 0 || filters.field) && <label>Metadata
            <select value={filters.field} data-testid="site-library-metadata-field"
              onChange={event => navigate({field:event.target.value,value:''})}>
              <option value="">All metadata</option>
              {filters.field && !selectedMetadata && <option value={filters.field}>{fieldLabel(filters.field)}</option>}
              {metadata.map(row => <option value={row.field} key={row.field}>{fieldLabel(row.field)}</option>)}
            </select>
          </label>}
          {filters.field && <label>Metadata value
            <select value={selectedValue} data-testid="site-library-metadata-value"
              onChange={event => navigate({value:event.target.value})}>
              <option value="">All values</option>
              {selectedValue && !selectedMetadata?.values.includes(selectedValue) &&
                <option value={selectedValue}>{selectedValue}</option>}
              {selectedMetadata?.values.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>}
          <label className={styles.savedFilter}>
            <input type="checkbox" checked={filters.saved} data-testid="site-library-favourites-only"
              onChange={event => navigate({saved:event.target.checked})} /> Favourites only
          </label>
        </form>

        {hasSubmittedQuery && searchStatus === 'loading' && <p role="status">Searching published definition text…</p>}
        {hasSubmittedQuery && searchStatus === 'unavailable' &&
          <p role="status">Full-text search is unavailable. Showing published catalogue matches.</p>}
        {status === 'loading' && <p role="status">Loading public catalogue…</p>}
        {status === 'error' && <div role="alert">
          <p>Public catalogue is unavailable.</p>
          <button type="button" onClick={() => window.location.reload()}>Try again</button>
        </div>}
        {status === 'ready' && <>
          {!draft && !scope.category && !scope.selectedDomain && !filters.path.length && !filters.field && !filters.saved &&
            <LibraryGroups selected={scope.group} counts={counts} destination={destination} />}
          {!showResults && favouriteEntries.length > 0 && <section data-testid="site-library-favourites">
            <h2>Favourites</h2>
            <LibraryCards entries={favouriteEntries} {...preferences} />
          </section>}
          {!showResults && recentEntries.length > 0 && <section data-testid="site-library-recent">
            <h2>Recently viewed</h2>
            <LibraryCards entries={recentEntries} {...preferences} />
          </section>}
          <p role="status" data-testid="site-compendium-results">
            {matching.length.toLocaleString()} public {matching.length === 1 ? 'definition' : 'definitions'}
          </p>
          {showResults && <>
            {matching.length === 0 && <p>No public definitions match those filters.</p>}
            <LibraryCards entries={matching.slice(0,limit)} {...preferences} testId="site-compendium-cards" />
            {matching.length > limit &&
              <button className={styles.more} type="button" data-testid="site-compendium-more"
                onClick={() => setLimit(value => value+PAGE_SIZE)}>
                Show more definitions
              </button>}
          </>}
        </>}
      </div>
    </div>
  </PageLayout>;
}
