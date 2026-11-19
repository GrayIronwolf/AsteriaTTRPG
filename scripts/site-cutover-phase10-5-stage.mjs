import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {dirname,resolve,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyCutoverPackage} from './site-cutover-phase10-4-package.mjs';

const repoRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const digest=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
function inside(root,path){
 if(!path||typeof path!=='string'||path.startsWith('/')||path.includes('\\')||
   path.split('/').some(s=>!s||s==='.'||s==='..'))throw Error('Unsafe release path: '+path);
 const target=resolve(root,path);
 if(!target.startsWith(resolve(root)+sep))throw Error('Release file escaped root');
 return target;
}
export function stageCutoverIntoWorkingTree({root=repoRoot,
 output=join(process.env.RUNNER_TEMP||'/tmp','asteria-phase-10-4-release'),
 targetBranch=process.env.TARGET_BRANCH,sourceSha=process.env.GITHUB_SHA}={}){
 if(targetBranch!=='react-vite-live')throw Error('Only the isolated react-vite-live release branch is permitted');
 if(!/^[a-f0-9]{40}$/.test(sourceSha||''))throw Error('Pinned source commit SHA required');
 const m=verifyCutoverPackage({output});
 assert.equal(m.buildMode,'production');
 assert.equal(m.firebaseProject,'asteria-ttrpg');
 assert.equal(m.deployed,false);
 assert.equal(m.productionAccessed,false);
 assert.equal(m.cutoverApproved,false);
 if(!existsSync(join(root,'CNAME'))||
   readFileSync(join(root,'CNAME'),'utf8').trim()!=='asteriattrpg.com')
  throw Error('The live CNAME domain differs from the release');
 if(digest(join(root,'index.html'))!==m.originalIndexSha256)
  throw Error('Original index changed since the rollback was captured');
 const overlay=join(output,'overlay'),files=Object.keys(m.files);
 assert.ok(files.includes('index.html'),'Release overlay missing index.html');
 const marker='assets/asteria-react-release.json';
 if(existsSync(inside(root,marker)))throw Error('Release marker collision');
 for(const p of files){
  const current=inside(root,p);
  if(p!=='index.html'&&existsSync(current)&&digest(current)!==digest(inside(overlay,p)))
   throw Error('Static asset collision with old site: '+p);
 }
 for(const p of ['css/styles.css','js/app.js','src/dev-entry.js',
  'react-dist/asteria-react-content-v2.js']){
  if(!existsSync(inside(root,p)))throw Error('Missing legacy asset: '+p);
 }
 const metadata={
  phase:'10.5',sourceCommit:sourceSha,releaseBranch:targetBranch,
  productionPublished:false,rollbackBranch:'main',
  originalIndexSha256:m.originalIndexSha256,
  rollbackIndexSha256:m.rollbackIndexSha256,
  compiledEntrySha256:m.files['index.html'],
  firebaseProject:'asteria-ttrpg',publicationRequiresPagesSourceSwitch:true
 };
 // Writes occur only after all integrity and conflict checks have passed.
 for(const p of files){
  const dest=inside(root,p);
  mkdirSync(dirname(dest),{recursive:true});
  copyFileSync(inside(overlay,p),dest);
 }
 mkdirSync(dirname(inside(root,marker)),{recursive:true});
 writeFileSync(inside(root,marker),JSON.stringify(metadata,null,2)+'\n');
 assert.equal(digest(join(root,'index.html')),m.files['index.html']);
 return {releasePaths:[...files,marker],marker:metadata};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv[2]!=='--apply')throw Error('Use --apply on the isolated release branch');
  const result=stageCutoverIntoWorkingTree();
  console.log('Staged '+result.releasePaths.length+' files. GitHub Pages and Firebase are unchanged.');
 }catch(error){console.error('Phase 10.5 release refused: '+error.message);process.exitCode=1;}
}
