import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {build} from 'esbuild';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';

test('authenticated Chromium loads PNG, JPEG, WEBP and WEBM from Storage and restores the selected map on refresh',
  {timeout:90000},async t=>{
    assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8080');
    const app=initializeApp({projectId:'demo-asteria-maps'},'browser-map-test');
    t.after(()=>deleteApp(app));
    const {outputFiles}=await build({entryPoints:['scripts/helpers/battle-map-browser.jsx'],
      bundle:true,outfile:'browser.js',write:false,define:{'process.env.NODE_ENV':'"production"'}});
    let finish;
    const result=new Promise(resolve=>{finish=resolve;});
    const server=createServer(async(req,res)=>{
      try{
        if(req.method==='POST'){
          const chunks=[];for await(const chunk of req)chunks.push(chunk);
          const body=Buffer.concat(chunks).toString();
          if(req.url==='/seed'){
            assert.match(body,/^[A-Za-z0-9_-]+$/);
            const db=getFirestore(app);
            await db.doc('users/'+body).set({uid:body});
            await db.doc('campaigns/browser-map-test').set({ownerUid:body,membershipSchemaVersion:2});
          }else if(req.url==='/result')finish(body);
        }else if(req.url==='/frame.webm'){
          res.setHeader('content-type','video/webm');
          res.write(await readFile(new URL('./helpers/battle-map-frame.webm',import.meta.url)));
        }else if(req.url==='/'){
          res.setHeader('content-type','text/html');
          res.write('<link rel="stylesheet" href="/browser.css"><div id="root"></div><script src="/browser.js"></script>');
        }else{
          const file=outputFiles.find(output=>output.path.endsWith(req.url));
          if(file){res.setHeader('content-type',req.url.endsWith('.css')?'text/css':'text/javascript');res.write(file.contents);}
          else res.statusCode=404;
        }
        res.end();
      }catch(error){finish(error.stack);res.writeHead(500).end();}
    });
    server.listen(0,'127.0.0.1');await once(server,'listening');
    t.after(()=>{server.closeAllConnections();server.close();});
    const profile=await mkdtemp(join(tmpdir(),'asteria-map-browser-'));
    const chrome=spawn(process.env.CHROME_BIN||'google-chrome',['--headless','--disable-gpu','--no-sandbox',
      '--disable-dev-shm-usage','--user-data-dir='+profile,'http://127.0.0.1:'+server.address().port],
      {stdio:'ignore'});
    const exited=once(chrome,'exit').catch(error=>finish(error.message));
    chrome.once('error',error=>finish(error.message));
    chrome.once('exit',code=>finish('Browser exited: '+code));
    t.after(async()=>{chrome.kill();await exited;await rm(profile,{recursive:true,force:true,maxRetries:3});});
    const timer=setTimeout(()=>finish('Browser did not report a result'),75000);
    try{assert.equal(await result,'pass');}finally{clearTimeout(timer);}
  });
