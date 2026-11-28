import React from 'react';
import {createRoot} from 'react-dom/client';
import {initializeApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInAnonymously} from 'firebase/auth';
import * as firestore from 'firebase/firestore';
import * as storageSdk from 'firebase/storage';
import {CampaignMapWorkspace} from '../../src/dashboards/presentation/CampaignMapWorkspace.jsx';
import {createFirebaseCampaignMediaService} from '../../src/dashboards/presentation/firebaseCampaignMediaService.mjs';
import {createBattleMapDownloader} from '../../src/firebase/battleMapMedia.mjs';

const projectId='demo-asteria-maps',campaignId='browser-map-test';
const app=initializeApp({projectId,apiKey:'demo-key',appId:'demo-app',storageBucket:projectId+'.appspot.com'});
const auth=getAuth(app),db=firestore.getFirestore(app),storage=storageSdk.getStorage(app);
connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
firestore.connectFirestoreEmulator(db,'127.0.0.1',8080);
storageSdk.connectStorageEmulator(storage,'127.0.0.1',9199);
window.AsteriaFirebase={getBattleMapSession:()=>auth.currentUser};
const api=createFirebaseCampaignMediaService({auth,db,storage,firestoreSdk:firestore,
  storageSdk:{...storageSdk,downloadMapBlob:createBattleMapDownloader(auth,{emulator:true})},
  enabled:true,functions:{},functionsSdk:{},readCanonical:async user=>
    (await firestore.getDocFromServer(firestore.doc(db,'users',user.uid))).data()});
const fixtures=['image/png','image/jpeg','image/webp'];
async function waitForMedia(name){
  const deadline=Date.now()+20000;
  while(Date.now()<deadline){
    if(name==='video/webm'){
      const video=document.querySelector('video');
      if(video?.readyState>=2&&video.videoWidth===96&&video.videoHeight===64&&video.getBoundingClientRect().width>0)return;
    }
    const img=document.querySelector('img[alt="'+name+'"]');
    if(img?.complete&&img.naturalWidth===96&&img.naturalHeight===64){
      const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
      ctx.drawImage(img,0,0);
      const [r,g,b]=ctx.getImageData(1,1,1,1).data;
      if(r<180||g>60||b>60||img.getBoundingClientRect().width<=0)throw Error('Incorrect rendered map pixels or layout');
      return;
    }
    await new Promise(r=>setTimeout(r,40));
  }
  throw Error('Timed out displaying '+name+'; '+document.querySelector('[role=alert]')?.textContent);
}
async function run(){
  await auth.authStateReady();
  if(!auth.currentUser)await signInAnonymously(auth);
  if(!sessionStorage.getItem('reload')){
    const seeded=await fetch('/seed',{method:'POST',body:auth.currentUser.uid});
    if(!seeded.ok)throw Error('Could not seed emulator campaign');
    const canvas=document.createElement('canvas');canvas.width=96;canvas.height=64;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#dd2211';ctx.fillRect(0,0,96,64);
    for(const mime of fixtures){
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,mime));
      if(blob.type!==mime)throw Error('Unsupported fixture encoder');
      await api.uploadMap(campaignId,new File([blob],'scene',{type:mime}),
        {name:mime,visibility:'gm'},{width:96,height:64});
    }
    const video=await (await fetch('/frame.webm')).blob();
    await api.uploadMap(campaignId,new File([video],'scene.webm',{type:'video/webm'}),
      {name:'video/webm',visibility:'gm'},{width:96,height:64});
  }
  createRoot(document.getElementById('root')).render(<CampaignMapWorkspace api={api} campaignId={campaignId} role="gm"/>);
  if(sessionStorage.getItem('reload')){
    await waitForMedia('image/webp');
    await fetch('/result',{method:'POST',body:'pass'});
    return;
  }
  await waitForMedia('image/jpeg');
  for(const name of ['image/png','video/webm','image/webp']){
    const select=document.querySelector('select[aria-label="Battle map"]');
    select.value=Array.from(select.options).find(option=>option.text.split(' ·')[0]===name).value;
    select.dispatchEvent(new Event('change',{bubbles:true}));
    await waitForMedia(name);
  }
  sessionStorage.setItem('reload','1');
  location.reload();
}
run().catch(error=>fetch('/result',{method:'POST',body:error.stack||String(error)}));
