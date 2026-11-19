import {gmCampaignAccess,gmSessionState} from '../dashboard/gmDashboardModel.mjs';
import {playerCampaignAccess} from '../player/playerDashboardModel.mjs';
import {assertGMId,GM_AREAS,gmToolkitProjection,worldMutation} from './digitalGMModel.mjs';
import {sessionPdfFileError,sessionPdfPath} from '../../../src/state/sessionLibraryModel.mjs';

/**
 * Authenticated single-app Phase 7.4 reader. GM world and notes use the same
 * existing Firestore document and merge transaction as the legacy GM Workspace.
 * Other Digital GM mutations remain behind the existing receipt-backed callable.
 */
export function createFirebaseDigitalGMService({
  auth,db,firestoreSdk,functions,functionsSdk,readCanonical,
  storage=null,storageSdk=null,enabled=false
}={}){
  if(!auth||!db||!firestoreSdk||!functions||!functionsSdk||
    typeof readCanonical!=='function')throw Error('Digital GM Firebase dependencies required.');
  const flags=Object.freeze({enabled:enabled===true});
  const ref=(...p)=>firestoreSdk.doc(db,...p);
  const collection=(cid,name)=>firestoreSdk.collection(db,'campaigns',cid,name);
  const same=uid=>{if(auth.currentUser?.uid!==uid)throw Error('Signed-in account changed.');};
  const exists=s=>Boolean(s?.exists?.());
  async function verified(){
    if(!flags.enabled)throw Error('React Digital GM tools are disabled.');
    const user=auth.currentUser;
    if(!user?.uid)throw Error('Sign in before opening campaign tools.');
    const profile=await readCanonical(user);same(user.uid);
    if(profile?.uid!==user.uid)throw Error('Account verification unavailable.');
    return user.uid;
  }
  function permission(campaign,member,uid,cid,role){
    if(role==='gm')return gmCampaignAccess(campaign,member,uid,cid).allowed;
    return playerCampaignAccess(campaign,member,uid,cid).allowed;
  }
  async function authorize(cid,role='gm'){
    assertGMId(cid);
    if(!['gm','player'].includes(role))throw Error('Invalid GM toolkit audience.');
    const uid=await verified();
    let snapshot;
    try{snapshot=await firestoreSdk.getDocFromServer(ref('campaigns',cid));}
    catch{throw Error('Campaign membership is required.');}
    same(uid);
    if(!exists(snapshot))throw Error('Campaign is unavailable.');
    const campaign={id:cid,...snapshot.data()};
    const v2=campaign.membershipSchemaVersion===2&&campaign.ownerUid!==uid;
    let membership=null;
    if(v2){
      const member=await firestoreSdk.getDocFromServer(ref('campaigns',cid,'members',uid));
      same(uid);
      membership=exists(member)?member.data():null;
    }
    if(!permission(campaign,membership,uid,cid,role))
      throw Error(role==='gm'?'GM access is required.':'Campaign membership is required.');
    return {uid,campaign,membership,v2};
  }
  const sources=Object.freeze({
    library:{
      merchantRelationships:'merchantRelationships',shops:'shops',characters:'characters'
    },
    relationships:{
      merchantRelationships:'merchantRelationships',shops:'shops',characters:'characters'
    },
    stories:{sessionNotes:'sessionNotes',sessionPdfs:'sessionPdfs'},
    tables:{
      randomTables:'randomTables',randomTableRolls:'randomTableRolls',
      lootTables:'lootTables',encounterPlans:'encounterPlans',
      lootDrafts:'partyLootDrafts'
    },
    calendar:{calendarState:'calendarState/current',calendarEntries:'calendarEntries'},
    weather:{calendarState:'calendarState/current',weatherZones:'weatherZones',
      weatherReports:'weatherReports'},
    archives:{sessionNotes:'sessionNotes',sessionPdfs:'sessionPdfs'},
    audio:{audioTracks:'audioTracks',audioLive:'audioLive/current'},
    recordings:{recordingControl:'recordingControl/current',recordingArchives:'recordingArchives',
      recordingConsents:'recordingConsents'}
  });
  const publicSources=Object.freeze({
    calendarPublic:'calendarPublic/current',calendarEntries:'calendarSharedEntries',
    weatherReports:'weatherSharedReports',sessionPdfs:'sessionPdfsShared',
    audioTracks:'audioTracksShared',audioLive:'audioLive/current',
    recordingNotice:'recordingNotice/current'
  });
  // The active view subscribes ONLY to its required private collections.
  // Losing GM membership revokes every listener instead of trusting cached data.
  function watch(cid,role,area,onUpdate,onError){
    assertGMId(cid);
    if(role==='gm'&&!GM_AREAS.includes(area))throw Error('Unsupported Digital GM workspace.');
    let active=true;const unsub=[];
    const close=()=>{active=false;while(unsub.length)try{unsub.pop()();}catch{}};
    const fail=e=>{if(!active)return;close();onError?.(e instanceof Error?e:Error('Digital GM data unavailable.'));};
    (async()=>{
      try{
        const initial=await authorize(cid,role);
        if(!active)return;
        const {uid,v2}=initial;
        const data={campaign:initial.campaign,member:initial.membership,
          workspace:null,session:null,sections:{}};
        const map=role==='gm'?sources[area]:publicSources;
        const required=['campaign','member','session',...(role==='gm'?['workspace']:[]),
          ...Object.keys(map)];
        const done=Object.fromEntries(required.map(k=>[k,
          k==='member'&&!v2]));
        const publish=()=>{
          if(!active||!Object.values(done).every(Boolean))return;
          try{
            same(uid);
            if(!permission(data.campaign,data.member,uid,cid,role))
              throw Error('Campaign tool permission was revoked.');
            const session=gmSessionState(data.session);
            if(role==='gm'){
              const projection=gmToolkitProjection(data.workspace||{},data.sections,data.campaign);
              onUpdate?.(Object.freeze({...projection,session,role}));
            }else{
              // Public read-only projections are published by existing GM actions.
              // Never subscribe to GM workspace, hidden drafts or private notes.
              onUpdate?.(Object.freeze({session,sections:{...data.sections},role}));
            }
          }catch(e){fail(e);}
        };
        const connect=(key,reference,isDoc)=>{
          const stop=firestoreSdk.onSnapshot(reference,{includeMetadataChanges:true},snapshot=>{
            if(!active||snapshot.metadata?.fromCache||snapshot.metadata?.hasPendingWrites)return;
            try{
              same(uid);
              if((key==='campaign'||key==='member')&&!exists(snapshot))
                throw Error('Campaign membership was revoked.');
              const value=isDoc?(exists(snapshot)?{id:snapshot.id,...snapshot.data()}:null):
                snapshot.docs.map(d=>({id:d.id,...d.data()}));
              if(['campaign','member','session','workspace'].includes(key)){
                data[key]=value;
              }else data.sections[key]=value;
              done[key]=true;publish();
            }catch(e){fail(e);}
          },fail);
          if(active)unsub.push(stop);else stop();
        };
        connect('campaign',ref('campaigns',cid),true);
        if(v2)connect('member',ref('campaigns',cid,'members',uid),true);
        connect('session',ref('campaigns',cid,'liveSession','current'),true);
        if(role==='gm')connect('workspace',ref('campaigns',cid,'systems','gmWorkspace'),true);
        for(const [key,path] of Object.entries(map)){
          if(path.includes('/'))connect(key,ref('campaigns',cid,...path.split('/')),true);
          else connect(key,firestoreSdk.query(collection(cid,path),firestoreSdk.limit(120)),false);
        }
      }catch(e){fail(e);}
    })();
    return close;
  }
  const GM_ACTIONS=Object.freeze({
    merchant:'manageMerchantRelationship',
    random:'manageRandomTable',loot:'manageLootTable',
    encounter:'manageEncounterReward',calendar:'manageAsteriaCalendar',
    weather:'manageWeatherEnvironment',sessionLibrary:'manageSessionLibrary',
    audio:'manageCampaignAudio',recording:'manageSessionRecording',
    information:'manageCampaignInformation'
  });
  async function command(cid,key,action){
    assertGMId(cid);
    if(!Object.hasOwn(GM_ACTIONS,key))throw Error('Unsupported Digital GM action.');
    const {uid}=await authorize(cid,'gm');
    const input={action:GM_ACTIONS[key],args:[cid,'gm-scope',action],
      requestId:crypto.randomUUID()};
    if(JSON.stringify(input).length>30000)throw Error('GM action payload is too large.');
    const res=await functionsSdk.httpsCallable(functions,'asteriaAction')(input);
    same(uid);
    if(res.data?.ok!==true)throw Error(res.data?.error||'The GM command was rejected.');
    return res.data;
  }
  const worldOps=new Set(['library-save','library-delete','card-save',
    'relationship-save','relationship-delete','reputation-save','reputation-delete']);
  async function writeWorkspace(cid,operation={}){
    assertGMId(cid);
    const {uid}=await authorize(cid,'gm');
    if(!worldOps.has(operation.type)&&!['note-save','note-log','quest-save','quest-delete'].includes(operation.type))
      throw Error('Unsupported workspace edit.');
    const campaignRef=ref('campaigns',cid),membershipRef=ref('campaigns',cid,'members',uid),
      workspaceRef=ref('campaigns',cid,'systems','gmWorkspace');
    const result=await firestoreSdk.runTransaction(db,async tx=>{
      const campaignSnap=await tx.get(campaignRef);
      if(!exists(campaignSnap))throw Error('Campaign unavailable.');
      const campaign={id:cid,...campaignSnap.data()};
      const member=campaign.membershipSchemaVersion===2&&campaign.ownerUid!==uid?
        await tx.get(membershipRef):null;
      same(uid);
      if(!gmCampaignAccess(campaign,exists(member)?member.data():null,uid,cid).allowed)
        throw Error('GM access was revoked before saving.');
      const snap=await tx.get(workspaceRef),saved=exists(snap)?snap.data():{};
      const next={version:'asteria-react-gm-workspace-v1',
        updatedBy:uid,updatedAt:firestoreSdk.serverTimestamp()};
      if(worldOps.has(operation.type)){
        const patch=worldMutation(saved.world||{},operation);
        next.world=patch;
      }else if(operation.type==='note-save'){
        if(typeof operation.text!=='string'||operation.text.length>20000)
          throw Error('Private GM notes must be at most 20,000 characters.');
        // Explicit version prevents overwriting a different GM's more recent note.
        if(String(saved.notes?.privateNotes||'')!==String(operation.expectedText||''))
          throw Error('Private notes changed in another tab. Reload before saving.');
        next.notes={privateNotes:operation.text};
      }else if(operation.type==='note-log'){
        if(typeof operation.title!=='string'||!operation.title.trim()||
          operation.title.length>120||typeof operation.text!=='string'||
          operation.text.length>16000)
          throw Error('Enter a valid session-log title and note.');
        const logs=Array.isArray(saved.notes?.sessionLogs)?saved.notes.sessionLogs:[];
        next.notes={sessionLogs:[{id:'session-log-'+crypto.randomUUID(),title:operation.title.trim(),
          body:operation.text,createdAt:new Date().toISOString()},...logs].slice(0,100)};
      }else{
        const quests=Array.isArray(saved.quests)?saved.quests:[];
        if(!Array.isArray(operation.entry)&&operation.type==='quest-save'){
          const entry=operation.entry;
          if(!entry||typeof entry.title!=='string'||!entry.title.trim()||
            entry.title.length>160||typeof entry.objective!=='string'||entry.objective.length>2000)
            throw Error('Enter a quest title and objective.');
          const existing=quests.find(q=>q.id===operation.id);
          if(String(existing?.updatedAt||'')!==String(operation.expectedUpdatedAt||''))
            throw Error('This quest changed. Refresh before saving.');
          const nextEntry={...existing,id:operation.id,title:entry.title.trim(),objective:entry.objective,
            visibility:['GM Only','Players'].includes(entry.visibility)?entry.visibility:'GM Only',
            status:['Draft','Active','Completed','Failed','Archived'].includes(entry.status)?entry.status:'Draft',
            updatedAt:new Date().toISOString()};
          next.quests=existing?quests.map(q=>q.id===operation.id?nextEntry:q):
            [...quests,nextEntry].slice(0,200);
        }else if(operation.type==='quest-delete'){
          if(!quests.some(q=>q.id===operation.id))throw Error('Quest was removed.');
          next.quests=quests.filter(q=>q.id!==operation.id);
        }else throw Error('Invalid quest edit.');
      }
      tx.set(workspaceRef,next,{merge:true});
      return {saved:true};
    });
    same(uid);
    return result;
  }
  async function rollDice(input={}){
    const uid=await verified();
    const result=await functionsSdk.httpsCallable(functions,'asteriaAdvancedDice')(input);
    same(uid);
    if(result.data?.ok!==true)throw Error(result.data?.error||'Digital dice roll rejected.');
    return result.data;
  }
  async function uploadSessionPdf(cid,file,details){
    if(!storage||!storageSdk)throw Error('Document uploads are unavailable.');
    const reason=sessionPdfFileError(file);if(reason)throw Error(reason);
    const {uid}=await authorize(cid,'gm');
    const id='pdf-'+crypto.randomUUID();
    const payload={...details,fileName:file.name,size:file.size};
    await command(cid,'sessionLibrary',{type:'reserve-pdf',id,details:payload});
    same(uid);
    const location=sessionPdfPath(cid,id);
    await storageSdk.uploadBytes(storageSdk.ref(storage,location),file,{
      contentType:'application/pdf',cacheControl:'private,max-age=300'
    });
    const saved=await command(cid,'sessionLibrary',{type:'finish-pdf',id,expectedRevision:1});
    same(uid);return saved;
  }
  return Object.freeze({
    availability:()=>flags,
    watchGM:(cid,area,ok,fail)=>watch(cid,'gm',area,ok,fail),
    watchPlayer:(cid,ok,fail)=>watch(cid,'player','public',ok,fail),
    world:writeWorkspace,command,rollDice,uploadSessionPdf
  });
}