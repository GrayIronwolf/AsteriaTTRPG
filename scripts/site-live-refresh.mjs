/* Publish a verified Vite build into the existing Pages release branch.
 * No Firebase deployment, destructive asset cleanup, or branch recreation.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {copyFileSync,existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const digest=(p)=>createHash('sha256').update(readFileSync(p)).digest('hex');
function walk(base,prefix=''){
 return readdirSync(base,{withFileTypes:true}).flatMap(item=>{
  assert.ok(item.isFile()||item.isDirectory(),'Unsupported release artifact: '+item.name);
  const name=prefix+item.name;
  return item.isDirectory()?walk(join(base,item.name),name+'/'):[name];
 }).sort();
}
function safe(base,name){
 assert.ok(typeof name==='string'&&name&& !name.startsWith('/')&&
   !name.includes('\\')&&name.split('/').every(x=>x&&x!=='.'&&x!=='..'),
   'Unsafe file path: '+name);
 const result=resolve(base,name);
 assert.ok(result.startsWith(resolve(base)+sep),'Release escapes directory');
 return result;
}
export function publishReactBuild({siteRoot,dist=join(root,'frontend-dist'),sourceSha}){
 assert.match(sourceSha||'',/^[0-9a-f]{40}$/,'Full source commit SHA required');
 assert.ok(siteRoot&&existsSync(siteRoot),'Existing live branch worktree is required');
 assert.equal(readFileSync(join(siteRoot,'CNAME'),'utf8').trim(),'asteriattrpg.com');
 const markerPath=join(siteRoot,'assets/asteria-react-release.json');
 const previous=JSON.parse(readFileSync(markerPath,'utf8'));
 assert.equal(previous.phase,'10.5');
 assert.equal(previous.releaseBranch,'react-vite-live');
 assert.equal(previous.rollbackBranch,'main');
 assert.equal(digest(join(siteRoot,'index.html')),previous.compiledEntrySha256,
  'Live entry differs from recorded release');
 const html=readFileSync(join(dist,'index.html'),'utf8');
 assert.match(html,/id="asteria-site-root"/);
 assert.match(html,/<script type="module" crossorigin/);
 const manifest=JSON.parse(readFileSync(join(dist,'.vite/manifest.json'),'utf8'));
 assert.equal(manifest['index.html']?.isEntry,true);
 const all=walk(dist).filter(p=>p!=='index.html'&&!p.startsWith('.vite/'));
 for(const p of [manifest['index.html'].file,...(manifest['index.html'].css||[])])
   assert.ok(all.includes(p),'Missing entry asset '+p);
 for(const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)){
  const ref=match[1];
  if(ref.startsWith('#'))continue;
  assert.ok(ref.startsWith('./'),'Non-local entry reference '+ref);
  assert.ok(all.includes(ref.slice(2).split(/[?#]/)[0]),'Missing referenced asset '+ref);
 }
 for(const name of all){
  const old=safe(siteRoot,name),fresh=safe(dist,name);
  assert.ok(!existsSync(old)||digest(old)===digest(fresh),
    'Asset collision with existing website: '+name);
 }
 // Perform writes only after validating all assets and release identities.
 for(const name of all){
  const dest=safe(siteRoot,name);
  mkdirSync(dirname(dest),{recursive:true});
  if(!existsSync(dest))copyFileSync(safe(dist,name),dest);
 }
 writeFileSync(join(siteRoot,'index.html'),html);
 const next={...previous,sourceCommit:sourceSha,compiledEntrySha256:digest(join(siteRoot,'index.html')),
  updatedFromMain:true,refreshedAt:new Date().toISOString()};
 writeFileSync(markerPath,JSON.stringify(next,null,2)+'\n');
 return {assetCount:all.length,sourceCommit:sourceSha};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  assert.equal(process.argv[2],'--apply');
  assert.equal(process.env.GITHUB_REF,'refs/heads/main');
  assert.equal(process.env.GITHUB_EVENT_NAME,'workflow_dispatch');
  const result=publishReactBuild({siteRoot:process.env.ASTERIA_LIVE_WORKTREE,
   sourceSha:process.env.GITHUB_SHA});
  console.log('Prepared a non-destructive React/Vite Pages update:',result);
 }catch(error){console.error('Refusing live website update:',error.message);process.exitCode=1;}
}
