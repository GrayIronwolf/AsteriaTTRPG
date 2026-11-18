import React from 'react';
import { getSafePublicHref } from './publicEntryModel.mjs';
import styles from './PublicMarkdown.module.css';

/**
 * Restricted Markdown presentation: React text nodes, not injected HTML.
 * No raw HTML, remote image loads, arbitrary URLs or scriptable attributes.
 */
function link(href, children, key) {
  const safe=getSafePublicHref(href);
  if (!safe) return <span key={key}>{children}</span>;
  if (safe.startsWith('https://')) {
    return <a key={key} href={safe} target="_blank" rel="noopener noreferrer">{children}</a>;
  }
  return <a key={key} href={safe}>{children}</a>;
}

function inline(value, prefix='line', depth=0) {
  const text=String(value??'');
  if (depth > 4) return text;
  const parts=[];
  const pattern=/(!?\[[^\]]{1,200}\]\([^)]+\)|\[\[[^\]]{1,250}\]\]|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^\x60]+`)/g;
  let last=0, found, index=0;
  while ((found=pattern.exec(text))) {
    if (found.index>last) parts.push(text.slice(last,found.index));
    const token=found[0], key=prefix+'-'+index++;
    if (token.startsWith('![')) {
      // No untrusted images are loaded. Preserve descriptive alt text.
      const alt=token.match(/^!\[([^\]]+)\]/)?.[1] || 'Image';
      parts.push(<span key={key}>[Image: {alt}]</span>);
    } else if (token.startsWith('[[')) {
      // Wiki links require canonical resolution in a later phase; do not invent.
      parts.push(<span key={key}>{token.slice(2,-2).split('|').at(-1)}</span>);
    } else if (token.startsWith('[')) {
      const match=token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      parts.push(match?link(match[2],inline(match[1],key,depth+1),key):token);
    } else if (/^(\*\*|__)/.test(token)) {
      parts.push(<strong key={key}>{inline(token.slice(2,-2),key,depth+1)}</strong>);
    } else if (/^(\*|_)/.test(token)) {
      parts.push(<em key={key}>{inline(token.slice(1,-1),key,depth+1)}</em>);
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
    const heading=line.match(/^\s{0,3}(#{3,6})\s+(.+)$/);
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
    while(i<lines.length && !blank(lines[i]) && !/^(\s{0,3}#{3,6}\s|\s{0,3}[-*+]\s|\s{0,3}\d+\.\s|\s*>|\s{0,3}[\x60~]{3,})/.test(lines[i])) paragraph.push(lines[i++]);
    if (paragraph.length===0) paragraph.push(lines[i++]);
    blocks.push({type:'p',text:paragraph.join(' ')});
  }
  return blocks;
}

export function PublicMarkdown({ source }) {
  return (
    <div className={styles.markdown} data-testid="site-public-markdown">
      {parseBlocks(source).map((block,i)=>{
        const key='block-'+i;
        if(block.type==='heading') {
          const Element=block.level<=3?'h3':block.level===4?'h4':'h5';
          return <Element key={key}>{inline(block.text,key)}</Element>;
        }
        if(block.type==='hr')return <hr key={key}/>;
        if(block.type==='code')return <pre key={key}><code>{block.text}</code></pre>;
        if(block.type==='quote')return <blockquote key={key}>{inline(block.text,key)}</blockquote>;
        if(block.type==='ol'||block.type==='ul') {
          const List=block.type;
          return <List key={key}>{block.items.map((item,j)=><li key={j}>{inline(item,key+'-'+j)}</li>)}</List>;
        }
        if(block.type==='table')return (
          <div key={key} className={styles.tableScroll}>
            <table><thead><tr>{block.head.map((h,j)=><th key={j} scope="col">{inline(h,key+'h'+j)}</th>)}</tr></thead>
              <tbody>{block.rows.map((row,j)=><tr key={j}>{block.head.map((_,k)=><td key={k}>{inline(row[k]??'',key+'r'+j+'c'+k)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
        return <p key={key}>{inline(block.text,key)}</p>;
      })}
    </div>
  );
}
