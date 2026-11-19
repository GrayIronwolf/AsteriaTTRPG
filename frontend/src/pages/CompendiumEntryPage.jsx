import React, { useEffect, useState } from 'react';
import { PageLayout, PageHeader } from '../components/ui/PageLayout.jsx';
import { BodyText } from '../components/ui/Typography.jsx';
import { PublicMarkdown } from '../compendium/PublicMarkdown.jsx';
import { loadPublicEntry } from '../compendium/publicEntryLoader.mjs';
import {
  createPublicSectionHref, resolveSelectedSection, isValidPublicEntryRoute
} from '../compendium/publicEntryModel.mjs';
import { PUBLIC_DOMAINS } from '../compendium/compendiumModel.mjs';
import styles from './CompendiumEntryPage.module.css';

/** Public-only definition page: no Firebase reads and no raw Markdown injection. */
export function CompendiumEntryPage({ route }) {
  const { domain, slug } = route.params;
  const [result, setResult] = useState({ state: 'loading', entry: null });
  useEffect(() => {
    let alive = true;
    setResult({state:'loading', entry:null});
    loadPublicEntry(domain, slug).then(value => {
      if (alive) setResult(value);
    }).catch(() => {
      if (alive) setResult({state:'error', entry:null});
    });
    return () => {alive=false;};
  }, [domain,slug]);

  const entry=result.entry;
  const sections=entry?.sections || [];
  const selected=resolveSelectedSection(sections,route.query);
  const selectedSection=sections.find(section => section.title===selected);
  const catalogueHref='#/compendium?domain='+encodeURIComponent(
    isValidPublicEntryRoute(domain,slug) ? domain : 'handbook'
  );
  const label=PUBLIC_DOMAINS.find(item=>item.id===domain)?.label || 'Compendium';
  const headerTitle = result.state==='ready' && entry ? entry.title
    : result.state==='error' ? 'Compendium unavailable'
    : result.state==='missing' ? 'Definition unavailable'
    : result.state==='ambiguous' ? 'Multiple definitions share this address'
    : 'Asteria Compendium';

  return (
    <PageLayout as="article" width="reading" className={styles.page}
      labelledBy="site-entry-title" data-testid="site-compendium-entry-page">
      <PageHeader eyebrow={label} id="site-entry-title" title={headerTitle} />
      <nav aria-label="Compendium breadcrumbs" className={styles.breadcrumbs}>
        <a href="#/compendium">Asteria Compendium</a>
        <span aria-hidden="true">/</span>
        <a href={catalogueHref}>{label}</a>
      </nav>
      {result.state==='loading' && <p role="status">Loading public definition…</p>}
      {result.state==='error' && <div role="alert">
        <BodyText>The entry cannot be loaded. No account or campaign data was accessed.</BodyText>
        <a href={catalogueHref}>Return to catalogue</a>
      </div>}
      {result.state==='missing' && <div role="status">
        <BodyText>This definition is not available in the public Compendium. It may not exist or may require access that is not enabled in the preview.</BodyText>
        <a href={catalogueHref}>Browse public entries</a>
      </div>}
      {result.state==='ambiguous' && <div role="status">
        <BodyText>The original link is ambiguous. Choose the intended definition in the catalogue instead.</BodyText>
        <a href={catalogueHref}>Browse matching definitions</a>
      </div>}
      {result.state==='ready' && entry && <>
        {entry.categoryPath?.length>0 && <p className={styles.category}>{entry.categoryPath.join(' / ')}</p>}
        {entry.summary && <BodyText muted>{entry.summary}</BodyText>}
        <div className={styles.identity} data-testid="site-entry-id">Definition ID: {entry.id}</div>
        {sections.length>0 ? <div data-page-shell="true">
          <nav data-page-rail="true" data-page-nav="true" aria-label="Definition sections" data-testid="site-entry-tabs">
            {sections.map(section => (
              <a data-page-nav-item="true" key={section.title}
                href={createPublicSectionHref(domain,slug,section.title)}
                aria-current={section.title===selected?'page':undefined}
                data-testid="site-entry-tab">{section.title}</a>
            ))}
          </nav>
          <div data-page-content="true">
            <section className={styles.section} aria-label={selected} data-testid="site-entry-section">
            <h2 className={styles.sectionHeading}>{selected}</h2>
            {selectedSection && <PublicMarkdown source={selectedSection.body}/>}
            </section>
          </div>
        </div> : <BodyText>The public definition does not contain published sections yet.</BodyText>}
        <p className={styles.notice}>Public reference content only. Private campaign notes and GM-only sections are not published here.</p>
        <a className={styles.returnLink} href={catalogueHref}>Return to catalogue</a>
      </>}
    </PageLayout>
  );
}
