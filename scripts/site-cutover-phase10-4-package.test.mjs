import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {stageCutoverPackage,verifyCutoverPackage} from './site-cutover-phase10-4-package.mjs';
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'asteria-stage-')),dist=join(root,'compiled'),output=join(root,'out');
 const write=(name,data)=>{mkdirSync(dirname(name),{recursive:true});writeFileSync(name,data);};
 write(join(root,'index.html'),'<h1>legacy home</h1>');
 for(const path of ['CNAME','css/styles.css','js/app.js','js/auth-bridge.js',
  'src/dev-entry.js','react-dist/asteria-react-content-v2.js'])
  write(join(root,path),'legacy:'+path);
 for(let i=0;i<100;i++)write(join(root,'react-dist','cached-'+i+'.js'),'cached');
 write(join(dist,'index.html'),'<div id="asteria-site-root"></div><script type="module" crossorigin src="./assets/a.js"></script><link rel="stylesheet" href="./assets/a.css">');
 write(join(dist,'assets/a.js'),'new js');write(join(dist,'assets/a.css'),'new css');
 write(join(dist,'.vite/manifest.json'),JSON.stringify({'index.html':{isEntry:true,file:'assets/a.js',css:['assets/a.css']}}));
 return {root,dist,output,write,clean:()=>rmSync(root,{recursive:true,force:true})};
}
test('release stage preserves legacy index and cached assets',()=>{
 const f=fixture();
 try{
  const initial=readFileSync(join(f.root,'index.html'),'utf8');
  const r=stageCutoverPackage({...f,mode:'production'});
  assert.equal(r.cutoverApproved,false);
  assert.equal(r.deployed,false);
  assert.equal(r.legacyAuthenticated,'not-captured');
  assert.equal(Object.keys(r.cachedReactFiles).length,101);
  assert.equal(readFileSync(join(f.root,'index.html'),'utf8'),initial);
  assert.equal(verifyCutoverPackage({output:f.output}).originalIndexSha256,r.rollbackIndexSha256);
 }finally{f.clean();}
});
test('emulator-mode builds cannot be packaged',()=>{
 const f=fixture();
 try{
  assert.throws(()=>stageCutoverPackage({...f,mode:'emulator'}),/production-mode/);
  assert.equal(existsSync(f.output),false);
 }finally{f.clean();}
});
test('publish collision fails rather than overwriting legacy assets',()=>{
 const f=fixture();
 try{
  f.write(join(f.root,'assets/a.js'),'existing different');
  assert.throws(()=>stageCutoverPackage({...f,mode:'production'}),/Collision/);
 }finally{f.clean();}
});
test('absolute new asset URL fails before publication',()=>{
 const f=fixture();
 try{
  f.write(join(f.dist,'index.html'),'<div id="asteria-site-root"></div><script type="module" crossorigin src="/assets/a.js"></script>');
  assert.throws(()=>stageCutoverPackage({...f,mode:'production'}),/relative/);
 }finally{f.clean();}
});
test('missing asset URLs and modified staged bytes fail',()=>{
 const f=fixture();
 try{
  f.write(join(f.dist,'index.html'),'<div id="asteria-site-root"></div><script type="module" crossorigin src="./assets/missing.js"></script>');
  assert.throws(()=>stageCutoverPackage({...f,mode:'production'}),/Unresolved/);
  f.write(join(f.dist,'index.html'),'<div id="asteria-site-root"></div><script type="module" crossorigin src="./assets/a.js"></script>');
  stageCutoverPackage({...f,mode:'production'});
  f.write(join(f.output,'overlay/assets/a.js'),'tampered');
  assert.throws(()=>verifyCutoverPackage({output:f.output}),/Tampered/);
 }finally{f.clean();}
});
