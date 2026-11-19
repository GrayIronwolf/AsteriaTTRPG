import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {publishReactBuild} from './site-live-refresh.mjs';

const sha='a'.repeat(40);
const hash=content=>createHash('sha256').update(content).digest('hex');
function fixture(){
 const temp=mkdtempSync(join(tmpdir(),'asteria-live-'));
 const siteRoot=join(temp,'site'),dist=join(temp,'dist');
 const write=(p,v)=>{mkdirSync(dirname(p),{recursive:true});writeFileSync(p,v);};
 const old='<div id="asteria-site-root"></div><p>Previous React release</p>';
 write(join(siteRoot,'index.html'),old);
 write(join(siteRoot,'CNAME'),'asteriattrpg.com\n');
 write(join(siteRoot,'assets/old-cache.js'),'old cache');
 write(join(siteRoot,'assets/asteria-react-release.json'),JSON.stringify({
  phase:'10.5',releaseBranch:'react-vite-live',rollbackBranch:'main',
  compiledEntrySha256:hash(old),sourceCommit:'b'.repeat(40)
 }));
 const html='<div id="asteria-site-root"></div><script type="module" crossorigin src="./assets/new.js"></script><link rel="stylesheet" href="./assets/new.css">';
 write(join(dist,'index.html'),html);
 write(join(dist,'assets/new.js'),'new JavaScript');
 write(join(dist,'assets/new.css'),'new CSS');
 write(join(dist,'.vite/manifest.json'),JSON.stringify({'index.html':{
  isEntry:true,file:'assets/new.js',css:['assets/new.css']
 }}));
 return {siteRoot,dist,temp,html,write,cleanup:()=>rmSync(temp,{recursive:true,force:true})};
}
test('updates React entry, records source and retains previous assets',()=>{
 const f=fixture();
 try{
  const result=publishReactBuild({...f,sourceSha:sha});
  assert.equal(result.sourceCommit,sha);
  assert.equal(readFileSync(join(f.siteRoot,'index.html'),'utf8'),f.html);
  assert.ok(existsSync(join(f.siteRoot,'assets/old-cache.js')));
  assert.ok(existsSync(join(f.siteRoot,'assets/new.js')));
  const marker=JSON.parse(readFileSync(join(f.siteRoot,'assets/asteria-react-release.json'),'utf8'));
  assert.equal(marker.sourceCommit,sha);
  assert.equal(marker.compiledEntrySha256,hash(f.html));
 }finally{f.cleanup();}
});
test('refuses a different live entry and leaves existing release intact',()=>{
 const f=fixture();
 try{
  f.write(join(f.siteRoot,'index.html'),'unexpected modification');
  assert.throws(()=>publishReactBuild({...f,sourceSha:sha}),/Live entry differs/);
  assert.equal(readFileSync(join(f.siteRoot,'index.html'),'utf8'),'unexpected modification');
 }finally{f.cleanup();}
});
test('refuses collisions and missing referenced files without modifying entry',()=>{
 const f=fixture();
 try{
  f.write(join(f.siteRoot,'assets/new.js'),'unrelated old file');
  assert.throws(()=>publishReactBuild({...f,sourceSha:sha}),/collision/i);
  assert.notEqual(readFileSync(join(f.siteRoot,'index.html'),'utf8'),f.html);
  f.write(join(f.siteRoot,'assets/new.js'),'new JavaScript');
  f.write(join(f.dist,'index.html'),f.html.replace('./assets/new.js','./assets/missing.js'));
  assert.throws(()=>publishReactBuild({...f,sourceSha:sha}),/Missing referenced asset/);
  assert.notEqual(readFileSync(join(f.siteRoot,'index.html'),'utf8'),f.html);
 }finally{f.cleanup();}
});
test('rejects wrong release branch and unsafe source metadata',()=>{
 const f=fixture();
 try{
  assert.throws(()=>publishReactBuild({...f,sourceSha:'not-a-sha'}),/SHA/);
  f.write(join(f.siteRoot,'assets/asteria-react-release.json'),
    JSON.stringify({phase:'10.5',releaseBranch:'main',rollbackBranch:'main',
      compiledEntrySha256:hash(readFileSync(join(f.siteRoot,'index.html')))}));
  assert.throws(()=>publishReactBuild({...f,sourceSha:sha}),/react-vite-live/);
 }finally{f.cleanup();}
});
