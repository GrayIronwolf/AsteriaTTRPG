import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {createServer as createHttpServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {build,createServer} from 'vite';

const configFile=fileURLToPath(new URL('../vite.site.config.mjs',import.meta.url));
const reference='tools/weapon-crafting.html';
const original=new URL('../'+reference,import.meta.url);

test('the isolated production build preserves the standalone weapon reference byte for byte',async t=>{
 const root=await mkdtemp(join(tmpdir(),'asteria-public-reference-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(join(root,'index.html'),'<!doctype html><p>Vite build fixture</p>');
 const outDir=join(root,'dist');
 await build({configFile,root,logLevel:'silent',build:{outDir}});
 assert.deepEqual(await readFile(join(outDir,reference)),await readFile(original));
});

test('the original standalone path works during development and only exposes the named document',async t=>{
 const vite=await createServer({configFile,appType:'custom',logLevel:'silent',
  server:{middlewareMode:true,hmr:false,watch:null}});
 t.after(()=>vite.close());
 const server=createHttpServer((request,response)=>vite.middlewares(request,response,()=>{
  response.writeHead(404).end();
 }));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port+'/';
 const response=await fetch(base+reference+'?reference=1');
 assert.equal(response.status,200);
 assert.match(response.headers.get('content-type'),/^text\/html\b/i);
 assert.deepEqual(Buffer.from(await response.arrayBuffer()),await readFile(original));
 assert.equal((await fetch(base+reference,{method:'HEAD'})).status,200);
 assert.equal((await fetch(base+'tools/private-reference.html')).status,404);
});
