import test from 'node:test';
import {createBattleMapDownloader} from '../src/firebase/battleMapMedia.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import React from 'react';
import {act,create} from 'react-test-renderer';
import {createFirebaseCampaignMediaService} from '../src/dashboards/presentation/firebaseCampaignMediaService.mjs';

const compiled=await build({
  stdin:{contents:`export {GMBattleMapManager} from './src/dashboards/BattleMapWorkspace.jsx';
    export {CampaignMapCanvas} from './src/dashboards/presentation/CampaignMapWorkspace.jsx';`,resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'cjs',external:['react'],
  plugins:[{name:'test-css',setup(builder){builder.onLoad({filter:/\.css$/},()=>({
    contents:'export default {};',loader:'js'
  }));}}]
});
const compiledModule={exports:{}};
new Function('require','module','exports',compiled.outputFiles[0].text)(
  createRequire(import.meta.url),compiledModule,compiledModule.exports);
const {GMBattleMapManager,CampaignMapCanvas}=compiledModule.exports;

const campaignId='test-campaign';
const image={id:'trail',campaignId,name:'Forest Trail',visibility:'players',kind:'image',contentType:'image/png',
  storagePath:`campaigns/${campaignId}/battleMaps/trail/scene.png`,width:800,height:600,
  gridColumns:2,gridRows:2,gridOpacity:40,gridVisible:true,fogEnabled:true,fogCells:'1000',
  tokens:[{id:'hero',label:'Hero',kind:'marker',x:25,y:25},{id:'secret',label:'Secret',kind:'marker',x:75,y:75,visibility:'gm'}]};
const video={...image,id:'00000000-0000-4000-8000-000000000001',name:'Cavern Preview',visibility:'gm',
  kind:'video',contentType:'video/webm',
  storagePath:'campaigns/test-campaign/battleMaps/00000000-0000-4000-8000-000000000001/scene.webm'};
const imageBlob=new Blob(['image fixture'],{type:'image/png'});
const webmBlob=new Blob(['video fixture'],{type:'video/webm'});
const textOf=node=>node.children.map(child=>typeof child==='string'?child:textOf(child)).join('');

function fixture(t,{session='gm',ownershipReady=true}={}){
  const previousWindow=globalThis.window;
  const requests=[],created=[],revoked=[];
  let user=session?{uid:session}:null;
  const playerApi={fetchMapMedia:(campaign,map,mode,options)=>request(campaign,map,options)};
  function request(campaign,map,options){
    return new Promise((resolve,reject)=>requests.push({campaign,map,options,resolve,reject}));
  }
  globalThis.window=Object.assign(new EventTarget(),{AsteriaFirebase:{
    isReady:()=>ownershipReady&&Boolean(user),getUser:()=>user,getBattleMapSession:()=>user,
    subscribeBattleMaps:(_campaign,update)=>{update([image,video]);return()=>{};},
    subscribeBattleMapPrivatePins:()=>()=>{},
    fetchBattleMapMedia:(campaign,map,options)=>request(campaign,map,options).then(blob=>({ok:true,blob}),
      error=>({ok:false,code:error.code,error:error.message}))
  }});
  t.mock.method(URL,'createObjectURL',blob=>{
    const url=`blob:map-${created.length+1}`;
    created.push({url,blob});
    return url;
  });
  t.mock.method(URL,'revokeObjectURL',url=>revoked.push(url));
  let renderer;
  t.after(()=>{if(renderer)act(()=>renderer.unmount());globalThis.window=previousWindow;});
  const playerElement=map=>React.createElement(CampaignMapCanvas,{api:{...playerApi},campaignId,map});
  async function render(element){
    await act(async()=>{
      if(renderer)renderer.update(element);
      else renderer=create(element,{createNodeMock:node=>node.type==='video'?{
        play:async()=>{},pause:()=>{}
      }:null});
    });
  }
  return {requests,created,revoked,
    player:map=>render(playerElement(map)),
    gm:()=>render(React.createElement(GMBattleMapManager,{campaignId})),
    select:map=>act(async()=>{
      renderer.root.findAllByType('select')[0].props.onChange({target:{value:map.id}});
    }),
    unmount:()=>{act(()=>renderer.unmount());renderer=null;},
    changeSession:(uid,event=uid?'asteria:firebase-ready':'asteria:firebase-signed-out')=>act(async()=>{
      user=uid?{uid}:null;
      window.dispatchEvent(new Event(event));
    }),
    media:type=>renderer.root.findAllByType(type),
    text:role=>renderer.root.findAllByProps({role}).map(textOf).join(' '),
    retry:()=>act(async()=>{
      renderer.root.findAllByType('button').find(node=>textOf(node)==='Retry loading media').props.onClick();
    })
  };
}

test('the shared canvas requests the selected image and clears loading after it decodes',async t=>{
  const view=fixture(t);
  await view.player(image);
  assert.equal(view.requests[0].campaign,campaignId);
  assert.equal(view.requests[0].map.storagePath,image.storagePath);
  await act(async()=>view.requests[0].resolve(imageBlob));
  assert.match(view.text('status'),/loading|preparing/i);
  const media=view.media('img')[0];
  assert.equal(media.props.alt,'Forest Trail');
  act(()=>media.props.onLoad());
  assert.doesNotMatch(view.text('status'),/loading|preparing/i);
  assert.equal(view.text('alert'),'');
});

test('the GM editor loads a WEBM scene with muted inline looping playback',async t=>{
  const view=fixture(t);
  await view.gm();
  await view.select(video);
  assert.equal(view.requests[0].map.storagePath,video.storagePath);
  await act(async()=>view.requests[0].resolve(webmBlob));
  const media=view.media('video')[0];
  assert.equal(view.created[0].blob.type,'video/webm');
  for(const prop of ['autoPlay','loop','muted','playsInline'])assert.equal(media.props[prop],true);
  act(()=>media.props.onLoadedData());
  assert.doesNotMatch(view.text('status'),/loading|preparing/i);
});

for(const [code,message] of [
  ['storage/unauthorized',/permission|access.*denied/i],
  ['storage/object-not-found',/file.*(missing|not found)/i],
  ['storage/unauthenticated',/sign in|session/i],
  ['storage/unknown',/network|connection/i],
  ['storage/retry-limit-exceeded',/network|connection|cors/i]
]){
  test(`the GM editor reports ${code} and clears loading`,async t=>{
    const view=fixture(t);
    await view.gm();
    await view.select(video);
    await act(async()=>view.requests[0].reject(Object.assign(new Error('Firebase request failed'),{code})));
    assert.match(view.text('alert'),message);
    assert.doesNotMatch(view.text('status'),/loading private map media/i);
  });
}

test('the shared canvas waits for Firebase readiness before requesting bytes',async t=>{
  const view=fixture(t,{session:''});
  await view.player(image);
  assert.equal(view.requests.length,0);
  assert.match(view.text('alert'),/sign in|session/i);
  await view.changeSession('player');
  assert.equal(view.requests.length,1);
});

test('an authenticated map viewer can download while unrelated character data is unavailable',async t=>{
  const view=fixture(t,{ownershipReady:false});
  await view.gm();
  await view.select(image);
  assert.equal(view.requests[0]?.map.id,image.id);
});

test('an auth transition removes displayed media before the next account finishes restoring',async t=>{
  const view=fixture(t);
  await view.player(image);
  await act(async()=>view.requests[0].resolve(imageBlob));
  await view.changeSession('player','asteria:firebase-session-changed');
  assert.equal(view.media('img').length,0);
  assert.deepEqual(view.revoked,['blob:map-1']);
});

test('an account change discards in-flight bytes and revokes already displayed media',async t=>{
  const view=fixture(t);
  await view.player(image);
  await view.changeSession('player');
  await act(async()=>view.requests[0].resolve(imageBlob));
  assert.deepEqual(view.created,[]);
  assert.equal(view.requests.length,2);
  await act(async()=>view.requests[1].resolve(imageBlob));
  assert.equal(view.media('img').length,1);
  await view.changeSession('');
  assert.equal(view.media('img').length,0);
  assert.deepEqual(view.revoked,['blob:map-1']);
});

test('a map that points outside the selected campaign never reaches the loader',async t=>{
  const view=fixture(t);
  await view.player({...image,storagePath:'campaigns/other/battleMaps/trail/scene.png'});
  assert.equal(view.requests.length,0);
  assert.match(view.text('alert'),/invalid.*reference/i);
});

test('a shared download times out and a retry ignores the first request’s late result',async t=>{
  const view=fixture(t);
  t.mock.timers.enable({apis:['setTimeout']});
  await view.player(image);
  act(()=>t.mock.timers.tick(20_000));
  assert.match(view.text('alert'),/timed out/i);
  assert.doesNotMatch(view.text('status'),/loading/i);
  await view.retry();
  assert.equal(view.requests.length,2);
  await act(async()=>view.requests[1].resolve(imageBlob));
  const url=view.media('img')[0].props.src;
  await act(async()=>view.requests[0].resolve(imageBlob));
  assert.equal(view.media('img')[0].props.src,url);
  assert.equal(view.created.length,1);
});

test('the GM editor lets the viewer retry after a network error',async t=>{
  const view=fixture(t);
  await view.gm();
  await view.select(video);
  await act(async()=>view.requests[0].reject(Object.assign(new Error('Failed to fetch'),{code:'storage/unknown'})));
  await view.retry();
  await act(async()=>view.requests[1].resolve(webmBlob));
  assert.equal(view.text('alert'),'');
  assert.equal(view.media('video').length,1);
});

test('switching maps while loading ignores late bytes from the previous selection',async t=>{
  const view=fixture(t);
  await view.gm();
  await view.select(video);
  await view.select(image);
  await act(async()=>view.requests[1].resolve(imageBlob));
  await act(async()=>view.requests[0].resolve(webmBlob));
  assert.equal(view.media('video').length,0);
  assert.equal(view.media('img')[0].props.alt,'Forest Trail');
  assert.deepEqual(view.created.map(entry=>entry.blob),[imageBlob]);
});

test('unmounting a loading canvas discards the outstanding request',async t=>{
  const view=fixture(t);
  await view.player(image);
  view.unmount();
  await act(async()=>view.requests[0].resolve(imageBlob));
  assert.deepEqual(view.created,[]);
});

test('switching maps and unmounting release each displayed object URL once',async t=>{
  const view=fixture(t);
  await view.gm();
  await view.select(video);
  await act(async()=>view.requests[0].resolve(webmBlob));
  await view.select(image);
  assert.deepEqual(view.revoked,['blob:map-1']);
  await act(async()=>view.requests[1].resolve(imageBlob));
  view.unmount();
  assert.deepEqual(view.revoked,['blob:map-1','blob:map-2']);
});

test('a WEBM decoder error revokes its URL and offers retry',async t=>{
  const view=fixture(t);
  await view.gm();
  await view.select(video);
  await act(async()=>view.requests[0].resolve(webmBlob));
  act(()=>view.media('video')[0].props.onError({currentTarget:{error:{code:3}}}));
  assert.match(view.text('alert'),/decode|codec/i);
  assert.equal(view.media('video').length,0);
  assert.deepEqual(view.revoked,['blob:map-1']);
  await view.retry();
  assert.equal(view.requests.length,2);
});

test('a browser that never reports image readiness gets a retryable error',async t=>{
  const view=fixture(t);
  t.mock.timers.enable({apis:['setTimeout']});
  await view.player(image);
  await act(async()=>view.requests[0].resolve(imageBlob));
  act(()=>t.mock.timers.tick(20_000));
  assert.match(view.text('alert'),/browser.*(timed out|did not)/i);
  assert.deepEqual(view.revoked,['blob:map-1']);
});

test('video metadata alone leaves a deadline for the first decoded frame',async t=>{
  const view=fixture(t);
  t.mock.timers.enable({apis:['setTimeout']});
  await view.gm();
  await view.select(video);
  await act(async()=>view.requests[0].resolve(webmBlob));
  act(()=>view.media('video')[0].props.onLoadedMetadata?.());
  act(()=>t.mock.timers.tick(12_000));
  assert.match(view.text('alert'),/browser.*did not/i);
  assert.equal(view.media('video').length,0);
});

test('loading a shared image preserves the grid, fog and revealed tokens',async t=>{
  const view=fixture(t);
  await view.player(image);
  await act(async()=>view.requests[0].resolve(imageBlob));
  const svg=view.media('svg');
  assert.ok(view.media('path').some(node=>node.props.stroke==='white'&&node.props.strokeOpacity===0.4));
  assert.ok(svg.some(node=>node.props['aria-label']==='Hidden fog of war'));
  const tokens=view.media('span').filter(node=>node.props['data-token-id']);
  assert.deepEqual(tokens.map(node=>node.props['data-token-id']),['hero']);
});

function mediaService({mapRead,download}={}){
  const auth={currentUser:{uid:'gm'}},reads=[];
  const service=createFirebaseCampaignMediaService({auth,db:{},storage:{},functions:{},functionsSdk:{},enabled:true,
    readCanonical:async user=>({uid:user.uid}),
    firestoreSdk:{doc:(_db,...parts)=>parts.join('/'),getDocFromServer:async path=>{
      reads.push(path);
      if(path===`campaigns/${campaignId}`)return {exists:()=>true,id:campaignId,data:()=>({ownerUid:'gm'})};
      return mapRead?mapRead():{exists:()=>true,id:video.id,data:()=>video};
    }},
    storageSdk:{ref:(_storage,path)=>path,downloadMapBlob:download||(()=>webmBlob)}
  });
  return {auth,service,reads};
}

test('the campaign media service rejects a request scoped to the previous account',async()=>{
  const {service,reads}=mediaService();
  await assert.rejects(service.fetchMapMedia(campaignId,video,'gm',{uid:'previous-gm'}),
    {code:'auth/user-changed'});
  assert.deepEqual(reads,[]);
});

test('cancelling while the campaign media service verifies the map skips the Storage request',async()=>{
  let continueRead,startRead,storageReads=0;
  const reading=new Promise(resolve=>{startRead=resolve;});
  const record=new Promise(resolve=>{continueRead=resolve;});
  const {service}=mediaService({mapRead:()=>{startRead();return record;},download:()=>{
    storageReads++;
    return webmBlob;
  }});
  const controller=new AbortController();
  const result=service.fetchMapMedia(campaignId,video,'gm',{signal:controller.signal});
  await reading;
  controller.abort();
  continueRead({exists:()=>true,id:video.id,data:()=>video});
  await assert.rejects(result,{name:'AbortError'});
  assert.equal(storageReads,0);
});

test('the campaign media service discards downloads from a replaced Firebase session with the same UID',async()=>{
  let finishDownload,startDownload;
  const downloading=new Promise(resolve=>{startDownload=resolve;});
  const bytes=new Promise(resolve=>{finishDownload=resolve;});
  const {auth,service}=mediaService({download:path=>{startDownload(path);return bytes;}});
  const result=service.fetchMapMedia(campaignId,video,'gm');
  assert.equal(await downloading,video.storagePath);
  auth.currentUser={uid:'gm'};
  finishDownload(webmBlob);
  await assert.rejects(result,{code:'auth/user-changed'});
});

test('a new API wrapper, token position and grid settings retain the same download and URL',async t=>{
  const view=fixture(t);
  await view.player(image);
  await view.player({...image,tokens:[],gridVisible:false});
  assert.equal(view.requests.length,1);
  await act(async()=>view.requests[0].resolve(imageBlob));
  await view.player({...image,name:'Updated title'});
  assert.equal(view.media('img')[0].props.src,view.created[0].url);
  assert.deepEqual(view.revoked,[]);
});

test('a progressing download gets its own idle deadline after record verification',async t=>{
  const view=fixture(t);
  t.mock.timers.enable({apis:['setTimeout']});
  await view.player(image);
  const {onStage}=view.requests[0].options;
  onStage('map record verification');
  act(()=>t.mock.timers.tick(19000));
  onStage('Firebase Storage download');
  act(()=>t.mock.timers.tick(19000));
  onStage('Firebase Storage download');
  act(()=>t.mock.timers.tick(19000));
  assert.equal(view.text('alert'),'');
  act(()=>t.mock.timers.tick(1000));
  assert.match(view.text('alert'),/timed out during Firebase Storage download/);
});

function transport(t){
  const transfers=[];
  const previous=globalThis.XMLHttpRequest;
  globalThis.XMLHttpRequest=class{
    open(method,url){this.method=method;this.url=url;}
    setRequestHeader(name,value){assert.equal(name,'Authorization');assert.equal(value,'Firebase test-token');}
    send(){transfers.push(this);}
    abort(){this.cancelled=true;this.onabort();this.onloadend();}
    respond(status){this.status=status;this.response=imageBlob;this.onload();this.onloadend();}
  };
  t.after(()=>{if(previous)globalThis.XMLHttpRequest=previous;else delete globalThis.XMLHttpRequest;});
  const user={uid:'gm',getIdToken:async()=>'test-token'};
  const auth={currentUser:user};
  const download=createBattleMapDownloader(auth);
  const ref={bucket:'demo-bucket',fullPath:image.storagePath};
  return {auth,transfers,request:options=>download(ref,options)};
}

test('two canvases share one authenticated GET and detaching one keeps the other alive',async t=>{
  const {request,transfers}=transport(t);
  const controller=new AbortController();
  const first=request({signal:controller.signal}),second=request();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(transfers.length,1);
  assert.equal(transfers[0].url,'https://firebasestorage.googleapis.com/v0/b/demo-bucket/o/'+encodeURIComponent(image.storagePath)+'?alt=media');
  controller.abort();
  await assert.rejects(first,{name:'AbortError'});
  assert.ok(!transfers[0].cancelled);
  transfers[0].respond(200);
  assert.equal(await second,imageBlob);
});

test('the last cancellation aborts the wire request and retry starts a fresh one',async t=>{
  const {request,transfers}=transport(t);
  const controller=new AbortController(),first=request({signal:controller.signal});
  await new Promise(resolve=>setImmediate(resolve));
  controller.abort();
  await assert.rejects(first,{name:'AbortError'});
  assert.equal(transfers[0].cancelled,true);
  const retry=request();
  await new Promise(resolve=>setImmediate(resolve));
  transfers[1].respond(404);
  await assert.rejects(retry,{code:'storage/object-not-found'});
});
