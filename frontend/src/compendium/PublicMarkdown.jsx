import React, { useEffect, useId, useRef, useState } from 'react';
import { createPublicSectionHref, getSafePublicHref } from './publicEntryModel.mjs';
import { resolvePublicReference } from './publicEntryLoader.mjs';
import { publicEntryArtwork, publicRelationshipTargets } from './publicEntryPresentation.mjs';
import styles from './PublicMarkdown.module.css';

/**
 * Restricted Markdown presentation: React text nodes, not injected HTML.
 * Artwork can only come from the published entry's validated image index.
 */
function PublicReference({ reference, entry, children }) {
  const [resolved,setResolved]=useState(null);
  const [open,setOpen]=useState(false);
  const listId=useId();
  const control=useRef(null);
  useEffect(()=>{
    let current=true;
    resolvePublicReference(reference,entry).then(result=>{
      if(current)setResolved({reference,entry,result});
    }).catch(()=>{});
    return ()=>{current=false;};
  },[reference,entry]);

  const result=resolved?.reference===reference&&resolved.entry===entry?resolved.result:null;
  if(result?.state==='ready'){
    const [match]=publicRelationshipTargets([result.entry]);
    if(match)return <a href={match.href}>{children}</a>;
  }
  const choices=result?.state==='ambiguous'?publicRelationshipTargets(result.choices):[];
  if(choices.length<2)return <span>{children}</span>;
  return <span className={styles.reference} onKeyDown={event=>{
    if(event.key==='Escape'&&open){setOpen(false);control.current?.focus();}
  }}>
    <button ref={control} type="button" className={styles.referenceButton}
      aria-expanded={open} aria-controls={listId} onClick={()=>setOpen(value=>!value)}>{children}</button>
    <span id={listId} role="group" aria-label="Matching Compendium definitions" className={styles.referenceChoices} hidden={!open}>
      {choices.map(choice=><a key={choice.href} href={choice.href}>
        {choice.title}<span className={styles.choiceScope}>{choice.categoryPath?.join(' / ')||choice.domain}</span>
      </a>)}
    </span>
  </span>;
}

function link(href, children, key, entry) {
  const safe=getSafePublicHref(href);
  if (safe?.startsWith('https://')) {
    return <a key={key} href={safe} target="_blank" rel="noopener noreferrer">{children}</a>;
  }
  if(safe&&/^#\/compendium(?:\/[^/?]+)?\/?(?:\?|$)/i.test(safe))return <a key={key} href={safe}>{children}</a>;
  if(entry){
    const anchor=href.trim().match(/^#([^/]+)$/)?.[1];
    if(anchor){
      const normalized=value=>value.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'');
      try{
        const section=entry.sections.find(item=>normalized(item.title)===normalized(decodeURIComponent(anchor)));
        if(section)return <a key={key} href={createPublicSectionHref(entry.domain,entry.slug,section.title)}>{children}</a>;
      }catch{/* Malformed fragments remain readable. */}
    }
    return <PublicReference key={key} reference={href} entry={entry}>{children}</PublicReference>;
  }
  return safe?<a key={key} href={safe}>{children}</a>:<span key={key}>{children}</span>;
}

function inline(value, prefix='line', depth=0, entry) {
  const text=String(value??'');
  if (depth > 4) return text;
  const parts=[];
  const pattern=/(!?\[\[[^\]]{1,250}\]\]|!?\[[^\]]{0,200}\]\([^)]+\)|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^\x60]+`)/g;
  let last=0, found, index=0;
  while ((found=pattern.exec(text))) {
    if (found.index>last) parts.push(text.slice(last,found.index));
    const token=found[0], key=prefix+'-'+index++;
    if (token.startsWith('![')) {
      const [reference,alt]=token.startsWith('![[')
        ?token.slice(3,-2).split('|',2)
        :[token.match(/\]\(([^)]+)\)$/)?.[1],token.match(/^!\[([^\]]*)\]/)?.[1]];
      const index=entry?.imageReferences;
      const source=reference&&index&&Object.hasOwn(index,reference)?publicEntryArtwork(index[reference]):null;
      const description=alt||entry?.title||'Artwork';
      parts.push(source?<img className={styles.inlineArtwork} key={key} src={source} alt={description} loading="lazy" decoding="async"/>:
        <span key={key}>[Image: {description}]</span>);
    } else if (token.startsWith('[[')) {
      const [reference,label]=token.slice(2,-2).split('|',2);
      parts.push(link(reference,label||reference,key,entry));
    } else if (token.startsWith('[')) {
      const match=token.match(/^\[([^\]]*)\]\(([^)]+)\)$/);
      parts.push(match&&match[1]?link(match[2],inline(match[1],key,depth+1),key,entry):token);
    } else if (/^(\*\*|__)/.test(token)) {
      parts.push(<strong key={key}>{inline(token.slice(2,-2),key,depth+1,entry)}</strong>);
    } else if (/^(\*|_)/.test(token)) {
      parts.push(<em key={key}>{inline(token.slice(1,-1),key,depth+1,entry)}</em>);
    } else if (token.charCodeAt(0)===96) {
      parts.push(<code key={key}>{token.slice(1,-1)}</code>);
    } else parts.push(token);
    last=pattern.lastIndex;
  }
  if (last<text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}

function parseBlocks(text) {
  const lines=String(text??'').replace(/\r\n?/g,'\n').split('\n');
  const blocks=[];
  let i=0;
  const blank=line=>!line.trim();
  const tableSplit=line=>line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(s=>s.trim());
  while (i<lines.length) {
    if (blank(lines[i])) {i++;continue;}
    const line=lines[i];
    const fence=line.match(/^\s{0,3}(\x60{3,}|~{3,})\s*([\w-]*)/);
    if (fence) {
      const body=[], marker=fence[1][0], min=fence[1].length;
      i++;
      while(i<lines.length && !(new RegExp('^\\s{0,3}'+(marker==='\x60'?'\\x60':'~')+'{'+min+',}\\s*$')).test(lines[i])) body.push(lines[i++]);
      if(i<lines.length)i++;
      blocks.push({type:'code',text:body.join('\n')});continue;
    }
    const heading=line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {blocks.push({type:'heading',level:heading[1].length,text:heading[2]});i++;continue;}
    if (/^\s{0,3}(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
      blocks.push({type:'hr'});i++;continue;
    }
    if (line.trim().startsWith('>')) {
      const values=[];
      while(i<lines.length && lines[i].trim().startsWith('>')) values.push(lines[i++].replace(/^\s*>\s?/,''));
      blocks.push({type:'quote',text:values.join(' ')});continue;
    }
    const ordered=/^\s{0,3}\d+\.\s+/.test(line);
    const unordered=/^\s{0,3}[-*+]\s+/.test(line);
    if (ordered||unordered) {
      const values=[];
      const match=ordered?/^\s{0,3}\d+\.\s+/:/^\s{0,3}[-*+]\s+/;
      while(i<lines.length && match.test(lines[i])) values.push(lines[i++].replace(match,''));
      blocks.push({type:ordered?'ol':'ul',items:values});continue;
    }
    if (line.includes('|') && i+1<lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i+1])) {
      const head=tableSplit(line);i+=2;const rows=[];
      while(i<lines.length && lines[i].includes('|') && !blank(lines[i])) rows.push(tableSplit(lines[i++]));
      blocks.push({type:'table',head,rows});continue;
    }
    const paragraph=[];
    while(i<lines.length && !blank(lines[i]) && !/^(\s{0,3}#{1,6}\s|\s{0,3}[-*+]\s|\s{0,3}\d+\.\s|\s*>|\s{0,3}[\x60~]{3,})/.test(lines[i])) paragraph.push(lines[i++]);
    if (paragraph.length===0) paragraph.push(lines[i++]);
    blocks.push({type:'p',text:paragraph.join(' ')});
  }
  return blocks;
}

export function PublicMarkdown({ source, entry, headingLevel=3 }) {
  const renderInline=(text,key)=>inline(text,key,0,entry);
  return (
    <div className={styles.markdown} data-testid="site-public-markdown">
      {parseBlocks(source).map((block,i)=>{
        const key='block-'+i;
        if(block.type==='heading') {
          const Element='h'+Math.min(6,headingLevel+Math.max(0,block.level-3));
          return <Element key={key}>{renderInline(block.text,key)}</Element>;
        }
        if(block.type==='hr')return <hr key={key}/>;
        if(block.type==='code')return <pre key={key}><code>{block.text}</code></pre>;
        if(block.type==='quote')return <blockquote key={key}>{renderInline(block.text,key)}</blockquote>;
        if(block.type==='ol'||block.type==='ul') {
          const List=block.type;
          return <List key={key}>{block.items.map((item,j)=><li key={j}>{renderInline(item,key+'-'+j)}</li>)}</List>;
        }
        if(block.type==='table')return (
          <div key={key} className={styles.tableScroll}>
            <table><thead><tr>{block.head.map((h,j)=><th key={j} scope="col">{renderInline(h,key+'h'+j)}</th>)}</tr></thead>
              <tbody>{block.rows.map((row,j)=><tr key={j}>{block.head.map((_,k)=><td key={k}>{renderInline(row[k]??'',key+'r'+j+'c'+k)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
        return <p key={key}>{renderInline(block.text,key)}</p>;
      })}
    </div>
  );
}
