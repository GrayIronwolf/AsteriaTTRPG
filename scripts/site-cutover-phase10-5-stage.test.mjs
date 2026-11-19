import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {stageCutoverPackage} from './site-cutover-phase10-4-package.mjs';
import {stageCutoverIntoWorkingTree} from './site-cutover-phase10-5-stage.mjs';

const OLD='<html><body>Original Asteria website</body></html>';
const NEW='<!doctype html><html><body><div id="asteria-site-root"></div><script type="module" crossorigin src="./assets/new-main-123.js"></script><link rel="stylesheet" href="./assets/new-styles-123.css"></body></html>';
const options={targetBranch:'react-vite-live',sourceSha:'a'.repeat(40)};
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'asteria-cutover-')),dist=join(root,'compiled'),output=join(root,'release');
 const put=(p,c)=>{mkdirSync(dirname(p),{recursive:true});writeFileSync(p,c);};
 put(join(root,'index.html'),OLD);
 put(join(root,'CNAME'),'asteriattrpg.com\n');
 for(const p of ['css/styles.css','js/app.js','js/auth-bridge.js','src/dev-entry.js','react-dist/asteria-react-content-v2.js'])put(join(root,p),'legacy '+p);
 for(let i=0;i<100;i++)put(join(root,'react-dist','previous-'+i+'.js'),'legacy cached '+i);
 put(join(dist,'index.html'),NEW);
 put(join(dist,'assets/new-main-123.js'),'console.log("react app")');
 put(join(dist,'assets/new-styles-123.css'),'body{background:black}');
 put(join(dist,'.vite/manifest.json'),JSON.stringify({'index.html':{isEntry:true,file:'assets/new-main-123.js',css:['assets/new-styles-123.css']}}));
 stageCutoverPackage({root,dist,output,mode:'production'});
 return {root,output,put,clean:()=>rmSync(root,{recursive:true,force:true})};
}
test('verified release changes only isolated branch entry and preserves rollback and all older content',()=>{
 const f=fixture();
 try{
  const result=stageCutoverIntoWorkingTree({root:f.root,output:f.output,...options});
  assert.equal(readFileSync(join(f.root,'index.html'),'utf8'),NEW);
  assert.equal(readFileSync(join(f.root,'CNAME'),'utf8'),'asteriattrpg.com\n');
  assert.equal(readFileSync(join(f.root,'react-dist/previous-3.js'),'utf8'),'legacy cached 3');
  assert.equal(readFileSync(join(f.root,'css/styles.css'),'utf8'),'legacy css/styles.css');
  assert.equal(readFileSync(join(f.output,'rollback/index.html'),'utf8'),OLD);
  assert.ok(existsSync(join(f.root,'assets/new-main-123.js')));
  assert.deepEqual(result.releasePaths.sort(),[
   'index.html','assets/new-main-123.js','assets/new-styles-123.css','assets/asteria-react-release.json'
  ].sort());
  const marker=JSON.parse(readFileSync(join(f.root,'assets/asteria-react-release.json'),'utf8'));
  assert.equal(marker.sourceCommit,options.sourceSha);
  assert.equal(marker.phase,'10.5');
  assert.equal(marker.productionPublished,false);
 }finally{f.clean();}
});
test('refuses main or an unauthorized release branch without touching the entry',()=>{
 const f=fixture();
 try{
  for(const b of ['main','gh-pages','', 'feature/foo'])
   assert.throws(()=>stageCutoverIntoWorkingTree({root:f.root,output:f.output,...options,targetBranch:b}),/branch/i);
  assert.equal(readFileSync(join(f.root,'index.html'),'utf8'),OLD);
 }finally{f.clean();}
});
test('detects entry drift and asset collisions before any writes',()=>{
 const f=fixture();
 try{
  f.put(join(f.root,'index.html'),'Another commit changed index');
  assert.throws(()=>stageCutoverIntoWorkingTree({root:f.root,output:f.output,...options}),/index|rollback|changed/i);
  assert.equal(existsSync(join(f.root,'assets/new-main-123.js')),false);
  f.put(join(f.root,'index.html'),OLD);
  f.put(join(f.root,'assets/new-main-123.js'),'a conflicting version');
  assert.throws(()=>stageCutoverIntoWorkingTree({root:f.root,output:f.output,...options}),/collis|different/i);
  assert.equal(readFileSync(join(f.root,'index.html'),'utf8'),OLD);
 }finally{f.clean();}
});
test('refuses tampered evidence, invalid SHA and changed custom domain',()=>{
 const f=fixture();
 try{
  assert.throws(()=>stageCutoverIntoWorkingTree({root:f.root,output:f.output,...options,sourceSha:'main'}),/commit SHA/i);
  f.put(join(f.root,'CNAME'),'wrong.example.com\n');
  assert.throws(()=>stageCutoverIntoWorkingTree({root:f.root,output:f.output,...options}),/domain|CNAME/i);
  f.put(join(f.root,'CNAME'),'asteriattrpg.com\n');
  f.put(join(f.output,'overlay/assets/new-main-123.js'),'tampered');
  assert.throws(()=>stageCutoverIntoWorkingTree({root:f.root,output:f.output,...options}),/tamper|hash|stage/i);
  assert.equal(readFileSync(join(f.root,'index.html'),'utf8'),OLD);
 }finally{f.clean();}
});
