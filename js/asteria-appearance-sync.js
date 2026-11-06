/* Appearance sync controller. Runs in the static shell, never mutates gameplay.
 * Only theme and typography are synced; dashboard preferences keep their
 * established character/GM Firestore save paths. */
(function(){
  'use strict';
  const SECTIONS=['theme','typography'];
  const state={
    uid:'',loaded:false,unsubscribe:null,
    cloud:{theme:null,typography:null},revisions:{theme:0,typography:0},
    pending:{theme:false,typography:false},saving:{theme:false,typography:false},
    conflicts:{theme:false,typography:false},failed:{theme:false,typography:false}
  };
  const byId=id=>document.getElementById(id);
  function uid(){
    const auth=window.AsteriaFirebase?.getUser?.();
    const session=window.AsteriaAuthBridge?.getSession?.() || window.session || {};
    return auth?.uid && auth.uid===session.uid ? String(auth.uid) : '';
  }
  function localKey(section){
    return section==='theme'
      ? window.AsteriaThemeSystem?.scopedStorageKey?.()
      : window.AsteriaTypography?.scopedStorageKey?.();
  }
  function localValue(section){
    return section==='theme'
      ? window.AsteriaThemeSystem?.getSettings?.()
      : window.AsteriaTypography?.get?.();
  }
  function applyCloud(section,value){
    if(section==='theme')window.AsteriaThemeSystem?.applyCloud?.(value);
    else window.AsteriaTypography?.applyCloud?.(value);
  }
  function stored(section){
    try{return Boolean(localStorage.getItem(localKey(section)));}catch{return false;}
  }
  function metaKey(){return 'asteria.appearance.synced.v1.'+state.uid;}
  function meta(){
    try{const value=JSON.parse(localStorage.getItem(metaKey())||'{}');return value&&typeof value==='object'?value:{};}
    catch{return {};}
  }
  function remember(section,revision,value){
    try{
      const m=meta();
      m[section]={revision,fingerprint:JSON.stringify(value)};
      localStorage.setItem(metaKey(),JSON.stringify(m));
    }catch{/* Safe to lose sync metadata; a conflict will be displayed instead. */}
  }
  function equals(a,b){return JSON.stringify(a)===JSON.stringify(b);}
  function status(message){
    const region=byId('appearanceSyncStatus');
    if(region)region.textContent=message;
  }
  function display(){
    const authenticated=Boolean(state.uid);
    const row=byId('appearanceSyncControls');
    if(row)row.hidden=!authenticated;
    if(!authenticated){status('Sign in to sync appearance across your devices. Guest preferences remain on this device.');return;}
    if(!state.loaded){status('Connecting to your cloud appearance settings…');return;}
    const conflict=SECTIONS.filter(section=>state.conflicts[section]);
    const failed=SECTIONS.filter(section=>state.failed[section]);
    const missing=SECTIONS.filter(section=>!state.cloud[section] && !state.pending[section]);
    const button=byId('appearanceSyncNow');
    if(button)button.disabled=SECTIONS.some(section=>state.saving[section]);
    const resolution=byId('appearanceConflictControls');
    if(resolution)resolution.hidden=!conflict.length;
    for(const section of SECTIONS){
      const field=byId('appearanceConflict-'+section);
      if(field)field.hidden=!state.conflicts[section];
    }
    if(conflict.length)status('Different '+conflict.join(' and ')+' preferences exist on this device and in the cloud. Choose which version to keep.');
    else if(failed.length)status('Cloud sync failed for '+failed.join(' and ')+'. Your local preferences are preserved. Select Sync now to retry.');
    else if(SECTIONS.some(section=>state.pending[section]||state.saving[section]))status('Saving appearance preferences to your account…');
    else if(missing.length)status('Connected. Select Sync now to save '+missing.join(' and ')+' to this account.');
    else status('Appearance preferences synced to your account. Existing character and GM dashboard layouts use their own saved settings.');
  }
  function stop(){
    state.unsubscribe?.();state.unsubscribe=null;
    state.uid='';state.loaded=false;
    for(const section of SECTIONS){
      state.cloud[section]=null;state.revisions[section]=0;
      state.pending[section]=false;state.conflicts[section]=false;
      state.saving[section]=false;state.failed[section]=false;
    }
    display();
  }
  async function saveSection(section,force=false){
    if(!state.uid||!state.loaded||state.saving[section])return;
    if(state.conflicts[section]&&!force){display();return;}
    const service=window.AsteriaFirebase;
    if(!service?.saveAppearancePreference){state.failed[section]=true;display();return;}
    const owner=state.uid;
    const value=localValue(section);
    const expected=state.revisions[section];
    if(!value)return;
    state.saving[section]=true;
    state.pending[section]=false;
    display();
    let result;
    try{result=await service.saveAppearancePreference(section,value,expected,force);}
    catch(error){result={ok:false,error:error?.message||String(error)};}
    if(state.uid!==owner)return;
    state.saving[section]=false;
    if(result?.ok){
      state.failed[section]=false;
      state.conflicts[section]=false;
      state.revisions[section]=result.revision;
      state.cloud[section]={value,revision:result.revision};
      remember(section,result.revision,value);
    }else if(result?.conflict){
      state.cloud[section]={value:result.value,revision:result.revision};
      state.revisions[section]=result.revision;
      state.conflicts[section]=true;
    }else state.failed[section]=true;
    if(state.pending[section]&&!state.conflicts[section])void saveSection(section);
    display();
  }
  function acceptCloud(section){
    const cloud=state.cloud[section];
    if(!cloud?.value)return;
    applyCloud(section,cloud.value);
    remember(section,cloud.revision,localValue(section));
    state.conflicts[section]=false;
    state.pending[section]=false;state.failed[section]=false;
    display();
  }
  function onSnapshot(data,owner){
    if(state.uid!==owner)return;
    state.loaded=true;
    for(const section of SECTIONS){
      const record=data?.[section]||null;
      const revision=Number(record?.revision||0);
      const remote=record?.value||null;
      const prior=state.cloud[section];
      state.cloud[section]=remote?{value:remote,revision}:null;
      state.revisions[section]=revision;
      if(state.saving[section])continue;
      const pending=state.pending[section];
      if(remote){
        const current=localValue(section);
        const recorded=meta()[section];
        if(equals(current,remote)){
          remember(section,revision,current);
          state.conflicts[section]=false;
        }else if(!stored(section) || (recorded?.fingerprint===JSON.stringify(current) &&
          revision>Number(recorded?.revision||0) && !pending)){
          applyCloud(section,remote);
          remember(section,revision,localValue(section));
          state.conflicts[section]=false;
        }else{
          state.conflicts[section]=true;
        }
      }else{
        state.conflicts[section]=false;
        if(prior && !pending)state.failed[section]=true;
      }
      if(pending&&!state.conflicts[section])void saveSection(section);
    }
    display();
  }
  function start(){
    const owner=uid();
    if(!owner){stop();return;}
    if(owner===state.uid)return;
    stop();state.uid=owner;display();
    const service=window.AsteriaFirebase;
    if(!service?.subscribeAppearancePreferences){state.failed.theme=true;display();return;}
    state.unsubscribe=service.subscribeAppearancePreferences(data=>onSnapshot(data,owner));
  }
  function localChange(event){
    const section=event.detail?.section;
    if(!SECTIONS.includes(section)||!state.uid)return;
    state.pending[section]=true;
    state.failed[section]=false;
    if(state.loaded)void saveSection(section);
    display();
  }
  function syncNow(){
    if(!state.uid||!state.loaded)return;
    for(const section of SECTIONS){
      state.failed[section]=false;
      state.pending[section]=true;
      if(!state.conflicts[section])void saveSection(section);
    }
    display();
  }
  function boot(){
    byId('appearanceSyncNow')?.addEventListener('click',syncNow);
    SECTIONS.forEach(section=>{
      byId('appearanceCloud-'+section)?.addEventListener('click',()=>acceptCloud(section));
      byId('appearanceDevice-'+section)?.addEventListener('click',()=>{
        state.conflicts[section]=false;
        state.pending[section]=true;
        void saveSection(section,true);
      });
    });
    window.addEventListener('asteria:firebase-ready',start);
    window.addEventListener('asteria:firebase-signed-out',stop);
    window.addEventListener('asteria:appearance-local-change',localChange);
    // Auth may complete before the deferred settings controller is ready.
    start();
  }
  window.AsteriaAppearanceSync=Object.freeze({
    refreshAccount:start,
    stop,
    getStatus:()=>({uid:state.uid,loaded:state.loaded,
      conflicts:{...state.conflicts},revisions:{...state.revisions},
      pending:{...state.pending}})
  });
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot):boot();
})();
