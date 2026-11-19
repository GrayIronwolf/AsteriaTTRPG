/* Reversible cutover artifact packager. Never deploys or writes to root. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readdirSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,rmSync} from 'node:fs';
import {resolve,dirname,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const rootDefault=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
function target(root,p){
 if(!p||p.startsWith('/')||p.includes('\\')||p.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('Unsafe file name: '+p);
 const full=resolve(root,p);
 if(!full.startsWith(resolve(root)+sep))throw Error('File escapes root');
 return full;
}
function walk(root,prefix=''){
 return readdirSync(root,{withFileTypes:true}).flatMap(e=>{
  const p=prefix+e.name,full=join(root,e.name);
  if(e.isSymbolicLink())throw Error('Symlink in artifact: '+p);
  if(e.isDirectory())return walk(full,p+'/');
  if(!e.isFile())throw Error('Non-file artifact: '+p);
  return [p];
 }).sort();
}
const legacyFiles=['CNAME','css/styles.css','js/app.js','js/auth-bridge.js','src/dev-entry.js','react-dist/asteria-react-content-v2.js'];
export function verifyCutoverPackage({output}){
 const m=JSON.parse(readFileSync(join(output,'cutover-manifest.json'),'utf8'));
 assert.equal(m.phase,'10.4');assert.equal(m.deployed,false);assert.equal(m.cutoverApproved,false);
 assert.equal(m.legacyAuthenticated,'not-captured');
 assert.equal(m.publicationMode,'overlay-preserve-existing-files');
 assert.deepEqual(walk(join(output,'overlay')),Object.keys(m.files).sort());
 for(const [p,h] of Object.entries(m.files))assert.equal(hash(target(join(output,'overlay'),p)),h,'Tampered output: '+p);
 assert.equal(hash(join(output,'rollback/index.html')),m.rollbackIndexSha256);
 assert.equal(m.rollbackIndexSha256,m.originalIndexSha256);
 return m;
}
export function stageCutoverPackage({root=rootDefault,dist=join(rootDefault,'frontend-dist'),
 output=join(process.env.RUNNER_TEMP||'/tmp','asteria-phase-10-4-release'),
 mode=process.env.VITE_FIREBASE_MODE}={}){
 if(mode!=='production')throw Error('Explicit production-mode candidate required, not an emulator build');
 if(!existsSync(join(root,'index.html')))throw Error('Legacy index missing; cannot roll back');
 const html=readFileSync(join(dist,'index.html'),'utf8');
 assert.match(html,/id="asteria-site-root"/);
 assert.match(html,/<script type="module" crossorigin/);
 const config=JSON.parse(readFileSync(join(dist,'.vite/manifest.json'),'utf8'));
 assert.equal(config['index.html']?.isEntry,true);
 const files=walk(dist).filter(x=>x!=='index.html'&&!x.startsWith('.vite/'));
 for(const p of [config['index.html'].file,...(config['index.html'].css||[])])
  assert.ok(files.includes(p),'Missing Vite entry asset: '+p);
 const refs=[...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map(x=>x[1]);
 for(const ref of refs){
  if(ref.startsWith('#'))continue;
  if(!ref.startsWith('./'))throw Error('Cutover entry requires relative, local asset: '+ref);
  const value=ref.slice(2).split(/[?#]/)[0];
  if(!files.includes(value))throw Error('Unresolved compiled asset: '+ref);
 }
 for(const p of files){
  if(p.startsWith('.'))throw Error('Unexpected hidden publish file: '+p);
  if(existsSync(target(root,p))&&hash(target(root,p))!==hash(target(dist,p)))
   throw Error('Collision with current website: '+p);
 }
 const preserved={};
 for(const p of legacyFiles){
  if(!existsSync(target(root,p)))throw Error('Missing rollback dependency: '+p);
  preserved[p]=hash(target(root,p));
 }
 const cache=walk(join(root,'react-dist'));
 if(cache.length<100)throw Error('Old cached React assets missing');
 const cacheHashes=Object.fromEntries(cache.map(p=>['react-dist/'+p,hash(target(root,'react-dist/'+p))]));
 const originalIndexSha256=hash(join(root,'index.html'));
 if(existsSync(output))rmSync(output,{recursive:true,force:true});
 mkdirSync(join(output,'overlay'),{recursive:true});mkdirSync(join(output,'rollback'),{recursive:true});
 writeFileSync(join(output,'overlay/index.html'),html);
 copyFileSync(join(root,'index.html'),join(output,'rollback/index.html'));
 for(const p of files){
  const out=target(join(output,'overlay'),p);
  mkdirSync(dirname(out),{recursive:true});copyFileSync(target(dist,p),out);
 }
 const paths=['index.html',...files];
 const report={
  schemaVersion:1,phase:'10.4',productionAccessed:false,deployed:false,cutoverApproved:false,
  legacyAuthenticated:'not-captured',manualApprovalRequired:true,buildMode:'production',
  firebaseProject:'asteria-ttrpg',publicationMode:'overlay-preserve-existing-files',
  originalIndexSha256,rollbackIndexSha256:hash(join(output,'rollback/index.html')),
  files:Object.fromEntries(paths.map(p=>[p,hash(target(join(output,'overlay'),p))])),
  legacyFiles:preserved,cachedReactFiles:cacheHashes,
  blockers:[
   'Redacted authenticated legacy GM and Player production comparisons are unavailable',
   'Existing website publisher must be verified to retain old static files and old cache URLs',
   'User sign-off of known-good live version, rollback and production cutover is required',
   'Production Firebase backend/rules/index compatibility remains to be checked at release'
  ]
 };
 writeFileSync(join(output,'cutover-manifest.json'),JSON.stringify(report,null,2)+'\n');
 verifyCutoverPackage({output});
 return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const output=join(process.env.RUNNER_TEMP||'/tmp','asteria-phase-10-4-release');
  if(process.argv[2]==='--stage'){
   const m=stageCutoverPackage({output});console.log('PASS staged overlay '+Object.keys(m.files).length+' files; preserved '+Object.keys(m.cachedReactFiles).length+' cached React files');
  }else if(process.argv[2]==='--verify'){
   verifyCutoverPackage({output});console.log('PASS verified reversible overlay; no production deployment');
  }else throw Error('Expected --stage or --verify');
 }catch(e){console.error('Phase 10.4 package blocked: '+e.message);process.exitCode=1;}
}
