'use strict';
// Imports *only* explicitly approved, public export pages from the private vault.
// The output is a review-only staging area, not the live Compendium. No vault
// path, unrelated note, attachment, or GM-only page is ever copied by this script.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const yaml=require('js-yaml');

const DOMAINS=Object.freeze({
  races:'race',classes:'class',creatures:'creature',items:'item',
  spells:'spell',talents:'talent',professions:'profession',skills:'skill',
  origins:'origin',locations:'location',theology:'religion',
  factions:'faction',lore:'lore',handbook:'handbook'
});
const ID=/^\\d{2}-\\d{2}-\\d{3}-\\d{3}$/;
const MAX_BYTES=180000;
const unsafe=/(?:^|\\n)\\s*#{1,6}\\s*(?:GM\\s*(?:Notes?|Only|Secrets?)|Secrets?|Private\\s*Notes?|Spoilers?)\\b|\\[\\[|<!--[\\s\\S]*?-->|<\\/?(?:script|iframe|object|embed|form|svg|style)\\b|javascript\\s*:/i;
function fail(message){throw new Error('Approved vault export: '+message);}
function listFiles(root){
  if(!fs.existsSync(root))fail('publish/public/ does not exist in the private source repository');
  const files=[];
  function walk(dir){
    for(const row of fs.readdirSync(dir,{withFileTypes:true})){
      const file=path.join(dir,row.name);
      if(row.isSymbolicLink())fail('symbolic links are not permitted: '+path.relative(root,file));
      if(row.isDirectory())walk(file);
      else if(row.isFile()){
        if(row.name==='README.md')continue;
        const rel=path.relative(root,file).split(path.sep).join('/');
        if(!/^[a-z]+\\/[a-z0-9]+(?:-[a-z0-9]+)*\\/index\\.md$/.test(rel))
          fail('unexpected file outside a domain/slug/index.md export: '+rel);
        files.push({file,rel});
      }else fail('unsupported file type: '+file);
    }
  }
  walk(root);
  return files.sort((a,b)=>a.rel.localeCompare(b.rel));
}
function readFrontmatter(text,file){
  const match=text.match(/^---\\r?\\n([\\s\\S]*?)\\r?\\n---\\r?\\n/);
  if(!match)fail(file+' must begin with YAML frontmatter');
  let meta;
  try{meta=yaml.safeLoad(match[1]);}catch(error){fail(file+' has invalid YAML: '+error.message);}
  if(!meta||typeof meta!=='object'||Array.isArray(meta))fail(file+' must contain a YAML mapping');
  const body=text.slice(match[0].length).trim();
  if(!body)fail(file+' has an empty public body');
  return {meta,body};
}
function strings(value,file,key,max=50){
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>max||value.some(x=>typeof x!=='string'||x.length>120))
    fail(file+' has invalid '+key);
  return value;
}
function approvedRecord(source,entry){
  const {rel,file}=entry;
  const match=rel.match(/^([a-z]+)\\/([a-z0-9]+(?:-[a-z0-9]+)*)\\/index\\.md$/);
  const [folder,slug]=match.slice(1);
  const domain=DOMAINS[folder];
  if(!domain)fail('unknown export category: '+folder);
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.size>MAX_BYTES)fail(rel+' exceeds size limit or is not a file');
  const text=fs.readFileSync(file,'utf8'),{meta,body}=readFrontmatter(text,rel);
  if(meta.publish!==true||meta.publicationApproved!==true||meta.visibility!=='public')
    fail(rel+' requires publish: true, publicationApproved: true and visibility: public');
  if(meta.gmOnly===true||meta.private===true||meta.secret===true)
    fail(rel+' contains a private/GM-only flag');
  if(typeof meta.title!=='string'||!meta.title.trim()||meta.title.length>140)
    fail(rel+' requires a short public title');
  if(meta.domain!==domain||meta.slug!==slug)fail(rel+' domain and slug must match its directory');
  const id=meta.id, indexCode=meta['Asteria ID Index Code'];
  if(typeof id!=='string'||!ID.test(id)||id!==indexCode)
    fail(rel+' must use a matching, permanent four-part Asteria ID Index Code');
  if(unsafe.test(body))fail(rel+' contains a forbidden GM/private heading, unresolved Obsidian link or unsafe markup');
  const categoryPath=strings(meta.categoryPath,rel,'categoryPath',10);
  const tags=strings(meta.tags,rel,'tags');
  // Only allowlisted metadata is exposed; no full private vault frontmatter.
  const clean={title:meta.title.trim(),slug,domain,id,
    'Asteria ID Index Code':id,visibility:'public',categoryPath,tags};
  const markdown='---\\n'+yaml.safeDump(clean,{noRefs:true,lineWidth:120})+'---\\n\\n'+body+'\\n';
  const sha256=crypto.createHash('sha256').update(markdown).digest('hex');
  return {rel,folder,slug,domain,id,markdown,sha256};
}
function syncApprovedContent({source,out,dryRun=false}){
  const src=path.resolve(source),dest=path.resolve(out);
  if(src===dest||dest.startsWith(src+path.sep))fail('output must be outside the private source directory');
  const records=listFiles(src).map(row=>approvedRecord(src,row));
  const ids=new Set(),paths=new Set();
  for(const record of records){
    if(ids.has(record.id))fail('duplicate public Asteria ID: '+record.id);
    ids.add(record.id);
    const target=record.folder+'/'+record.slug;
    if(paths.has(target))fail('duplicate output path: '+target);
    paths.add(target);
  }
  // Fail closed: no automatic deletion of a previously staged definition.
  // Existing IDs cannot be silently changed by editing a slug's metadata.
  if(fs.existsSync(dest)){
    const old=listFiles(dest);
    for(const row of old){
      const relative=row.rel;
      const previous=readFrontmatter(fs.readFileSync(row.file,'utf8'),relative).meta;
      if(!ID.test(previous.id||''))fail('existing staged record has an invalid ID: '+relative);
      const incoming=records.find(x=>x.rel===relative);
      if(incoming&&incoming.id!==previous.id)fail('permanent ID changed for '+relative);
      if(!incoming&&ids.has(previous.id))fail('the existing Asteria ID moved paths without review: '+previous.id);
    }
  }
  const manifest={format:'asteria-approved-vault-export-v1',sourceRepository:'GrayIronwolf/Asteria-Obsidian-Vault',
    integration:'review-only; not yet the live Compendium',definitions:records.map(({rel,id,domain,sha256})=>({sourcePath:rel,id,domain,sha256}))};
  if(!dryRun&&records.length){
    for(const record of records){
      const target=path.join(dest,record.rel);
      fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.writeFileSync(target,record.markdown);
    }
    fs.writeFileSync(path.join(dest,'manifest.json'),JSON.stringify(manifest,null,2)+'\\n');
  }
  return {definitions:records.length,manifest};
}
if(require.main===module){
  const arg=key=>{const i=process.argv.indexOf(key);return i>=0?process.argv[i+1]:null;};
  const source=arg('--source'),out=arg('--out');
  if(!source||!out)fail('Usage: node scripts/import-approved-vault.cjs --source PATH --out PATH [--validate-only]');
  const result=syncApprovedContent({source,out,dryRun:process.argv.includes('--validate-only')});
  console.log('Validated '+result.definitions+' explicitly approved public vault definition(s). No private notes were imported.');
}
module.exports={syncApprovedContent,approvedRecord,listFiles,DOMAINS};
