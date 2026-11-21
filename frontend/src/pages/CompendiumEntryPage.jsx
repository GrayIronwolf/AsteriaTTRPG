import React, { useEffect, useRef, useState } from 'react';
import { PageLayout, PageHeader } from '../components/ui/PageLayout.jsx';
import { CrystalButton } from '../components/ui/CrystalButton.jsx';
import { BodyText } from '../components/ui/Typography.jsx';
import { PublicMarkdown } from '../compendium/PublicMarkdown.jsx';
import { loadPublicEntry } from '../compendium/publicEntryLoader.mjs';
import { createPublicSectionHref, resolveSelectedSection } from '../compendium/publicEntryModel.mjs';
import { getPublicEntryTabs, publicEntryArtwork, publicEntryFacts,
  publicRelationshipTargets, publicTalentTiers } from '../compendium/publicEntryPresentation.mjs';
import { createDiscoveryHref, entryCategoryPath } from '../compendium/discoveryModel.mjs';
import { useLibraryPreferences } from '../compendium/useLibraryPreferences.js';
import { PUBLIC_DOMAINS } from '../compendium/compendiumModel.mjs';
import styles from './CompendiumEntryPage.module.css';

const domainLabel=domain=>PUBLIC_DOMAINS.find(item=>item.id===domain)?.label||'Compendium';
const entryStates={error:'Compendium unavailable',missing:'Definition unavailable',
  ambiguous:'Multiple definitions share this address',loading:'Asteria Compendium'};
const loading={state:'loading',entry:null};

function EntryLinks({rows, showCategory=false, ...props}){
  return <ul className={styles.entryLinks} {...props}>{rows.map(row=>
    <li key={row.href}><a href={row.href}>
      {row.title}
      {showCategory&&<small>{row.categoryPath?.join(' / ')||domainLabel(row.domain)}</small>}
    </a></li>)}
  </ul>;
}

function EntryFacts({entry,tab}){
  const facts=publicEntryFacts(entry,tab);
  if(!facts.length)return null;
  return <dl className={styles.facts} data-testid="site-entry-facts">{facts.map(({key,label,value})=>
    <div key={key}><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl>;
}

function EntryGallery({entry}){
  const approved=new Set();
  const images=entry.gallery.flatMap(row=>{
    const src=publicEntryArtwork(row.url);
    if(!src||approved.has(src))return [];
    approved.add(src);
    return [{...row,src}];
  });
  if(!images.length)return null;
  return <div className={styles.gallery} data-testid="site-entry-gallery">{images.map(row=>
    <figure key={row.src}>
      <img src={row.src} alt={row.alt||row.caption||entry.title} loading="lazy" decoding="async"/>
      {row.caption&&<figcaption>{row.caption}</figcaption>}
    </figure>)}
  </div>;
}

function EntryTalentTree({entry}){
  return <div className={styles.talentTree} data-testid="site-entry-talent-tree">
    {publicTalentTiers(entry.talents).map(({number,talents})=>
      <section className={styles.tier} key={number}>
        <h3>Tier {number}</h3>
        {talents.length?<EntryLinks rows={talents}/>:<BodyText muted>No published talents</BodyText>}
      </section>)}
  </div>;
}

function EntryTraits({entry}){
  const traits=entry.details?.racialTraits;
  if(!Array.isArray(traits)||!traits.length)return null;
  return <div className={styles.subsection}>
    <h3>Racial Traits</h3>
    {traits.map(trait=><details className={styles.trait} key={trait.name}>
      <summary>{trait.name}</summary>
      <PublicMarkdown source={[trait.description,trait.effects.map(effect=>'- '+effect).join('\n')].filter(Boolean).join('\n\n')}
        entry={entry} headingLevel={4}/>
    </details>)}
  </div>;
}

function EntrySection({entry,section}){
  return <section className={styles.section} aria-labelledby="site-entry-selected" data-testid="site-entry-section">
    <h2 id="site-entry-selected" className={styles.sectionHeading}>{section.title}</h2>
    <EntryFacts entry={entry} tab={section.title}/>
    {section.kind==='talents'&&<EntryTalentTree entry={entry}/>}
    {section.kind==='gallery'&&<EntryGallery entry={entry}/>}
    {section.kind==='related'&&<EntryLinks rows={publicRelationshipTargets(entry.related)} showCategory/>}
    {section.sections.map(part=>{
      const groupHeading=part.title!==section.title&&part.title!=='Overview';
      return <div key={part.title} className={styles.subsection}>
        {groupHeading&&<h3>{part.title}</h3>}
        <PublicMarkdown source={part.body} entry={entry} headingLevel={groupHeading?4:3}/>
      </div>;
    })}
    {section.kind==='racial'&&!section.sections.some(part=>part.title==='Racial Traits')&&<EntryTraits entry={entry}/>}
  </section>;
}

/** Entry bodies and relationship targets are loaded from validated public shards. */
export function CompendiumEntryPage({ route }) {
  const {domain,slug,choices:bookmarkChoices}=route.params;
  const requestKey=JSON.stringify([domain,slug]);
  const [request,setRequest]=useState(null);
  const sectionNav=useRef(null);
  const recordedVisit=useRef(null);
  const {isFavourite,toggleFavourite,recordRecent,preferencesReady}=useLibraryPreferences();
  useEffect(()=>{
    if(bookmarkChoices)return;
    let current=true;
    loadPublicEntry(domain,slug).then(result=>{
      if(current)setRequest({key:requestKey,result});
    }).catch(()=>{
      if(current)setRequest({key:requestKey,result:{state:'error',entry:null}});
    });
    return ()=>{current=false;};
  },[domain,slug,requestKey,bookmarkChoices]);

  const result=bookmarkChoices?{state:'ambiguous',entry:null,choices:bookmarkChoices}:
    request?.key===requestKey?request.result:loading;
  const entry=result.entry;
  useEffect(()=>{
    if(!entry){recordedVisit.current=null;return;}
    if(!preferencesReady||recordedVisit.current===requestKey)return;
    recordRecent(entry);
    recordedVisit.current=requestKey;
  },[entry,preferencesReady,recordRecent,requestKey]);

  const tabs=getPublicEntryTabs(entry);
  const selected=resolveSelectedSection(tabs,route.query);
  useEffect(()=>{
    const nav=sectionNav.current;
    const active=nav?.querySelector('[aria-current="page"]');
    if(!active||nav.scrollWidth<=nav.clientWidth)return;
    const rail=nav.getBoundingClientRect();
    const link=active.getBoundingClientRect();
    if(link.left<rail.left)nav.scrollLeft+=link.left-rail.left;
    else if(link.right>rail.right)nav.scrollLeft+=link.right-rail.right;
  },[entry,selected]);
  const selectedSection=tabs.find(section=>section.title===selected);
  const category=entryCategoryPath(entry);
  const selectedDomain=entry?.domain||domain;
  const label=domainLabel(selectedDomain);
  const catalogueHref=createDiscoveryHref({domain:selectedDomain});
  const backHref=createDiscoveryHref({domain:selectedDomain,path:category});
  const artwork=publicEntryArtwork(entry?.artwork);
  const choices=publicRelationshipTargets(result.choices);
  const favourite=entry&&isFavourite(entry);
  return (
    <PageLayout as="article" width="wide" className={`${styles.page}${artwork?' '+styles.withArtwork:''}`}
      labelledBy="site-entry-title" data-testid="site-compendium-entry-page">
      <PageHeader eyebrow={label} id="site-entry-title" title={entry?.title||entryStates[result.state]}>
        {artwork&&<img className={styles.artwork} data-testid="site-entry-artwork" src={artwork} alt={entry.title} decoding="async"/>}
        {entry&&<div className={styles.actions}>
          <CrystalButton type="button" size="compact" aria-pressed={favourite} disabled={!preferencesReady}
            onClick={()=>toggleFavourite(entry)}>{favourite?'Remove favourite':'Add to favourites'}</CrystalButton>
        </div>}
      </PageHeader>
      <nav aria-label="Compendium breadcrumbs" className={styles.breadcrumbs}>
        <a href="#/compendium">Asteria Compendium</a>
        <span aria-hidden="true">/</span>
        <a href={catalogueHref}>{label}</a>
        {category.map((name,index)=><React.Fragment key={index}>
          <span aria-hidden="true">/</span>
          <a href={createDiscoveryHref({domain:selectedDomain,path:category.slice(0,index+1)})}>{name}</a>
        </React.Fragment>)}
      </nav>
      {result.state==='loading'&&<p role="status">Loading public definition…</p>}
      {result.state==='error'&&<div role="alert">
        <BodyText>The entry cannot be loaded.</BodyText>
        <a href={catalogueHref}>Return to catalogue</a>
      </div>}
      {result.state==='missing'&&<div role="status">
        <BodyText>This definition is unavailable in the public Compendium.</BodyText>
        <a href={catalogueHref}>Browse public entries</a>
      </div>}
      {result.state==='ambiguous'&&<section aria-label="Matching definitions">
        {choices.length>0?<EntryLinks rows={choices} showCategory data-testid="site-entry-choices"/>:
          <a href={catalogueHref}>Browse matching definitions</a>}
      </section>}
      {result.state==='ready'&&entry&&<>
        {selectedSection?<div data-page-shell="true">
          <nav ref={sectionNav} data-page-rail="true" data-page-nav="true" aria-label="Definition sections" data-testid="site-entry-tabs">
            {tabs.map(section=><a data-page-nav-item="true" key={section.title}
              href={createPublicSectionHref(entry.domain,entry.slug,section.title)}
              aria-current={section.title===selected?'page':undefined}
              data-testid="site-entry-tab">{section.title}</a>)}
          </nav>
          <div data-page-content="true">
            <EntrySection key={entry.id+':'+selected} entry={entry} section={selectedSection}/>
          </div>
        </div>:<BodyText>No published sections are available for this definition.</BodyText>}
        <footer className={styles.entryFooter}>
          <a className={styles.returnLink} href={backHref}>Back to cards</a>
          <small className={styles.identity} data-testid="site-entry-id">Definition ID: {entry.id}</small>
        </footer>
      </>}
    </PageLayout>
  );
}
