import {stagedEncounterList} from '../../state/preparedEncounterLoadModel.mjs';
import {libraryDraft,updateGMLibrary} from '../../../src/state/gmNpcCreatureLibraryModel.mjs';
import {assertGMCampaignId,gmCampaignAccess,gmPartySummary} from './combatAccess.mjs';
import {requireDashboardId,playerCampaignAccess,linkedCharacterAccess,matchesOwnedSource} from './combatAccess.mjs';
import {gmSessionState} from './combatAccess.mjs';
import {
  projectCombat,eligiblePlayerCombatants,gmEncounterCandidates,validateCombatCommand,
  combatRevision
} from './combatModel.mjs';
import {
  normalizePreparedEncounters,validatePreparedEncounterInput,PREPARED_ENCOUNTER_MAX_PLANS
} from '../../../src/state/preparedEncounterModel.mjs';
import {projectGMLivePending,projectGMLiveLog}
  from '../../../src/state/liveCombatCommandModel.mjs';
import {encounterScheduleForGM} from '../../../src/state/encounterWaveModel.mjs';

/** React/Vite Phase 7.1. Existing authenticated Firebase app, paths and
 * asteriaAction combatCommand transaction are the only sources of authority. */
export function createFirebaseCombatService({
  auth,db,firestoreSdk,functions,functionsSdk,readCanonical,enabled=false
}){
  if(!auth||!db||!firestoreSdk||!functions||!functionsSdk||
    typeof readCanonical!=='function')
    throw Error('The verified combat Firebase adapter is required.');
  const flags=Object.freeze({enabled:enabled===true});
  const same=uid=>{
    if(!uid||auth.currentUser?.uid!==uid)throw Error('Account changed. Reload combat.');
  };
  const campaignRef=id=>firestoreSdk.doc(db,'campaigns',id);
  const memberRef=(id,uid)=>firestoreSdk.doc(db,'campaigns',id,'members',uid);
  const encounterRef=id=>firestoreSdk.doc(db,'campaigns',id,'systems','encounter');
  const publicCombatRef=id=>firestoreSdk.doc(db,'campaigns',id,'combatPublic','current');
  const sessionRef=id=>firestoreSdk.doc(db,'campaigns',id,'liveSession','current');
  const gmRef=id=>firestoreSdk.doc(db,'campaigns',id,'systems','gmWorkspace');
  const partyRef=id=>firestoreSdk.collection(db,'campaigns',id,'characters');
  const mapsRef=id=>firestoreSdk.collection(db,'campaigns',id,'battleMaps');
  const historyRef=id=>firestoreSdk.collection(db,'campaigns',id,'encounterHistory');
  const characterRef=(id,characterId)=>firestoreSdk.doc(db,'campaigns',id,'characters',characterId);
  const sourceRef=(uid,id)=>firestoreSdk.doc(db,'users',uid,'characters',id);
  async function verified(){
    if(!flags.enabled)throw Error('The migrated combat workspace is disabled.');
    const user=auth.currentUser;
    if(!user?.uid)throw Error('Sign in to open combat.');
    const profile=await readCanonical(user);
    same(user.uid);
    if(profile?.uid!==user.uid)throw Error('Account profile could not be verified.');
    return user.uid;
  }
  const fromServer=async reference=>{
    try{return await firestoreSdk.getDocFromServer(reference);}
    catch{throw Error('The campaign or combat record is unavailable to this account.');}
  };
  const permit=(campaign,member,uid,id,mode)=>
    mode==='gm'?gmCampaignAccess(campaign,member,uid,id).allowed:
      playerCampaignAccess(campaign,member,uid,id).allowed;

  async function check(id,mode,characterId=''){
    assertGMCampaignId(id);
    if(mode!=='gm'&&mode!=='player')throw Error('Unsupported combat access mode.');
    if(mode==='player')requireDashboardId(characterId);
    const uid=await verified();
    const c=await fromServer(campaignRef(id));
    same(uid);
    if(!c.exists())throw Error('Campaign no longer exists.');
    const campaign={...c.data(),id:c.id};
    const v2=campaign.membershipSchemaVersion===2&&campaign.ownerUid!==uid;
    const m=v2?await fromServer(memberRef(id,uid)):null;
    same(uid);
    const member=m?.exists()?m.data():null;
    if(!permit(campaign,member,uid,id,mode))
      throw Error('Campaign combat permission is unavailable.');
    let character=null,source=null,sourceId='';
    if(mode==='player'){
      const s=await fromServer(characterRef(id,characterId));
      same(uid);
      if(!s.exists())throw Error('Linked character no longer exists.');
      character={...s.data(),id:s.id};
      const link=linkedCharacterAccess(campaign,character,uid,
        playerCampaignAccess(campaign,member,uid,id));
      if(!link.allowed||!link.owned)
        throw Error('Only the verified character owner may control this combatant.');
      sourceId=character.sourceCharacterId||character.id;
      requireDashboardId(sourceId);
      const own=await fromServer(sourceRef(uid,sourceId));
      same(uid);
      if(!own.exists())throw Error('Saved character source is unavailable.');
      source={...own.data(),id:own.id};
      if(!matchesOwnedSource(source,character,id,uid,campaign.membershipSchemaVersion??1))
        throw Error('Owned character link changed.');
    }
    return {uid,campaign,member,v2,character,source,sourceId};
  }

  function watch(id,mode,characterId,onUpdate,onError){
    assertGMCampaignId(id);
    if(mode==='player')requireDashboardId(characterId);
    let active=true;
    const unsubs=[];
    const close=()=>{active=false;unsubs.splice(0).forEach(stop=>{try{stop();}catch{}});};
    const fail=error=>{
      if(!active)return;
      close();
      onError?.(error instanceof Error?error:Error('Combat connection denied.'));
    };
    (async()=>{
      try{
        const first=await check(id,mode,characterId);
        if(!active)return;
        const {uid,v2,sourceId}=first;
        const data={campaign:first.campaign,member:first.member,
          character:first.character,source:first.source,encounter:null,session:null,
          roster:[],workspace:null,maps:[]};
        const required=mode==='gm'
          ?['campaign','member','encounter','session','roster','workspace','maps']
          :['campaign','member','character','source','encounter','session'];
        const ready=Object.fromEntries(required.map(key=>[key,key==='member'&&!v2]));
        const valid=()=>{
          same(uid);
          if(!permit(data.campaign,data.member,uid,id,mode))
            throw Error('Combat access or campaign membership was revoked.');
          if(mode==='player'){
            const access=playerCampaignAccess(data.campaign,data.member,uid,id);
            const owned=linkedCharacterAccess(data.campaign,data.character,uid,access);
            if(!owned.allowed||!owned.owned||
              !matchesOwnedSource(data.source,data.character,id,uid,
                data.campaign.membershipSchemaVersion??1))
              throw Error('Character combat link or ownership was revoked.');
          }
        };
        const publish=()=>{
          if(!active||!Object.values(ready).every(Boolean))return;
          try{
            valid();
            const party=mode==='gm'?data.roster:data.character?[data.character]:[];
            const combat=projectCombat(data.encounter,data.session,{
              role:mode,characterId:mode==='player'?characterId:'',party
            });
            const result={combat,session:gmSessionState(data.session),
              ...(mode==='gm'?{
                candidates:eligiblePlayerCombatants(data.campaign,data.roster,combat.combatants),
                library:gmEncounterCandidates(data.workspace?.world),
                pending:projectGMLivePending(data.workspace?.combatState),
                combatLog:projectGMLiveLog(data.encounter?.combat?.log),
                encounterSchedule:encounterScheduleForGM(data.workspace?.combatState),
                party:gmPartySummary(data.roster),
                preparedDetails:data.workspace?.combatState?.preparedDetails||null,
                stagedEncounters:stagedEncounterList(data.workspace?.combatState?.stagedEncounters),
                preparedEncounters:normalizePreparedEncounters(data.workspace?.preparedEncounters),
                maps:data.maps
              }:{})};
            onUpdate?.(Object.freeze(result));
          }catch(error){fail(error);}
        };
        const attach=(key,ref,decode,requiredDocument=true)=>{
          const stop=firestoreSdk.onSnapshot(ref,{includeMetadataChanges:true},snap=>{
            if(!active||snap.metadata?.fromCache||snap.metadata?.hasPendingWrites)return;
            try{
              same(uid);
              if(requiredDocument&&!snap.exists())throw Error('Campaign or character access ended.');
              data[key]=decode(snap);
              ready[key]=true;publish();
            }catch(error){fail(error);}
          },fail);
          if(active)unsubs.push(stop);else stop();
        };
        attach('campaign',campaignRef(id),snap=>({...snap.data(),id:snap.id}));
        if(v2)attach('member',memberRef(id,uid),
          snap=>snap.exists()?snap.data():null,false);
        if(mode==='player'){
          attach('character',characterRef(id,characterId),
            snap=>({...snap.data(),id:snap.id}));
          attach('source',sourceRef(uid,sourceId),snap=>({...snap.data(),id:snap.id}));
        }else{
          attach('roster',partyRef(id),snap=>snap.docs.map(row=>({...row.data(),id:row.id})),false);
          attach('workspace',gmRef(id),snap=>snap.exists()?snap.data():null,false);
          attach('maps',mapsRef(id),snap=>snap.docs.map(row=>({
            id:row.id,name:String(row.data()?.name||'Unnamed map').slice(0,100),
            kind:String(row.data()?.kind||'').slice(0,32)
          })).filter(row=>/^[A-Za-z0-9_-]{1,160}$/.test(row.id)),false);
        }
        attach('encounter',mode==='gm'?encounterRef(id):publicCombatRef(id),
          snap=>snap.exists()?snap.data():null,false);
        attach('session',sessionRef(id),snap=>snap.exists()?snap.data():null,false);
      }catch(error){fail(error);}
    })();
    return close;
  }

  // Separate GM-only listener: player subscriptions never touch private history.
  function watchGMHistory(id,onUpdate,onError){
    let active=true,stop=()=>{};
    (async()=>{
      try{
        const {uid}=await check(id,'gm');
        if(!active)return;
        const query=firestoreSdk.query(historyRef(id),
          firestoreSdk.orderBy('endedAt','desc'),firestoreSdk.limit(30));
        stop=firestoreSdk.onSnapshot(query,{includeMetadataChanges:true},snapshot=>{
          if(!active||snapshot.metadata?.fromCache||
            snapshot.metadata?.hasPendingWrites)return;
          try{
            same(uid);
            onUpdate(snapshot.docs.map(row=>({...row.data(),id:row.id})));
          }catch(error){onError?.(error);}
        },error=>{if(active)onError?.(error);});
      }catch(error){if(active)onError?.(error);}
    })();
    return ()=>{active=false;stop?.();};
  }
  function watchEncounterSnapshots(id,combatId,onUpdate,onError){
    let active=true,stop=()=>{};
    (async()=>{
      try{
        const {uid}=await check(id,'gm');
        if(!active)return;
        const ref=firestoreSdk.doc(db,'campaigns',id,'encounterHistory',combatId,'recovery','snapshotIndex');
        stop=firestoreSdk.onSnapshot(ref,{includeMetadataChanges:true},snapshot=>{
          if(!active||snapshot.metadata?.fromCache||snapshot.metadata?.hasPendingWrites)return;
          try{same(uid);onUpdate(snapshot.data()?.entries||[]);}
          catch(error){onError(error);}
        },failure=>{if(active)onError(failure);});
      }catch(error){if(active)onError(error);}
    })();
    return ()=>{active=false;stop();};
  }
  async function completionAction(id,input){
    const {uid}=await check(id,'gm');
    const action=functionsSdk.httpsCallable(functions,'asteriaAction');
    const response=await action({
      action:'manageEncounterCompletion',args:[id,'encounter',input],
      requestId:crypto.randomUUID()
    });
    same(uid);
    if(response.data?.ok!==true)
      throw Error(response.data?.error||'Encounter completion review was rejected.');
    return response.data;
  }
  async function deliverCompletion(id,characterId,kind,history){
    const {uid}=await check(id,'gm');
    const reward=history?.rewards?.find(row=>row.characterId===characterId);
    if(!reward||!['xp','bundle'].includes(kind))
      throw Error('Choose an approved encounter reward.');
    const action=functionsSdk.httpsCallable(functions,'asteriaAction');
    const payload=kind==='xp'?
      {action:'grantCharacterXP',args:[id,characterId,reward.xp,
        'Approved encounter '+history.id,history.id]}:
      {action:'grantGMRewardBundle',args:[id,characterId,{
        items:reward.items,currency:reward.currency,
        bundleName:'Encounter '+history.id,
        message:'Approved encounter reward',encounterHistoryId:history.id
      }]};
    const response=await action({...payload,requestId:crypto.randomUUID()});
    same(uid);
    if(response.data?.ok!==true)
      throw Error(response.data?.error||'Reward delivery was not confirmed.');
    return response.data;
  }
  const watchGM=(id,onUpdate,onError)=>watch(id,'gm','',onUpdate,onError);
  const watchPlayer=(id,characterId,onUpdate,onError)=>
    watch(id,'player',characterId,onUpdate,onError);
  async function command(id,mode,characterId,actorId,input){
    const command=validateCombatCommand(mode,actorId,input);
    const {uid}=await check(id,mode,characterId);
    const encounter=await fromServer(mode==='gm'?encounterRef(id):publicCombatRef(id));
    same(uid);
    const raw=encounter.exists()?encounter.data():{};
    if(combatRevision(raw)!==command.revision)
      throw Error('Combat changed in another session. Wait for live sync.');
    if(mode==='player'&&!((raw.combatants||[]).some(row=>
      row.id===actorId&&(row.characterId===characterId||
        command.operation==='player-map-move'&&
        raw.combat?.participants?.[actorId]?.movementDelegated===true))))
      throw Error('That combat participant is not linked to your character or delegated for map movement.');
    const action=functionsSdk.httpsCallable(functions,'asteriaAction');
    const response=await action({
      action:'combatCommand',args:[id,actorId,command],
      requestId:crypto.randomUUID()
    });
    same(uid);
    if(response.data?.ok!==true)
      throw Error(response.data?.error||'The combat command was rejected.');
    return response.data;
  }
  /** GM-only transaction on the existing private workspace; never writes live combat. */
  async function writePrepared(id,type,entry,expectedRevision=0){
    const {uid}=await check(id,'gm');
    const payload=type==='save'?validatePreparedEncounterInput(entry):null;
    const identifier=String(entry?.id||'');
    if(!/^prepared-[A-Za-z0-9_-]{1,95}$/.test(identifier))
      throw Error('Invalid prepared encounter ID.');
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)
      throw Error('Invalid prepared encounter revision.');
    const result=await firestoreSdk.runTransaction(db,async tx=>{
      same(uid);
      const campaignSnap=await tx.get(campaignRef(id));
      if(!campaignSnap.exists())throw Error('Campaign no longer exists.');
      const campaign={...campaignSnap.data(),id};
      const v2=campaign.membershipSchemaVersion===2&&campaign.ownerUid!==uid;
      const memberSnap=v2?await tx.get(memberRef(id,uid)):null;
      if(!permit(campaign,memberSnap?.exists()?memberSnap.data():null,uid,id,'gm'))
        throw Error('GM permission was revoked before saving.');
      const workspaceSnap=await tx.get(gmRef(id));
      const stored=normalizePreparedEncounters(workspaceSnap.exists()?
        workspaceSnap.data()?.preparedEncounters:[]);
      const current=stored.find(row=>row.id===identifier);
      if((current?.revision||0)!==expectedRevision)
        throw Error('Prepared encounter changed in another session. Refresh and try again.');
      let next;
      if(type==='save'){
        if(!current&&stored.length>=PREPARED_ENCOUNTER_MAX_PLANS)
          throw Error('Prepared encounter library is full (30).');
        if(payload.mapId){
          const map=await tx.get(firestoreSdk.doc(db,'campaigns',id,'battleMaps',payload.mapId));
          if(!map.exists())throw Error('Selected battle map no longer exists.');
        }
        const now=new Date().toISOString();
        const updated={id:identifier,...payload,revision:expectedRevision+1,
          createdAt:current?.createdAt||now,createdBy:current?.createdBy||uid,
          updatedAt:now,updatedBy:uid};
        next=current?stored.map(row=>row.id===identifier?updated:row):[...stored,updated];
      }else if(type==='delete'){
        if(!current)throw Error('Prepared encounter was already deleted.');
        next=stored.filter(row=>row.id!==identifier);
      }else throw Error('Unknown prepared encounter action.');
      if(JSON.stringify(next).length>500000)
        throw Error('The prepared encounter library exceeds its storage limit.');
      tx.set(gmRef(id),{
        preparedEncounters:next,updatedBy:uid,updatedAt:firestoreSdk.serverTimestamp()
      },{merge:true});
      return {ok:true,id:identifier,revision:expectedRevision+1};
    });
    same(uid);
    return result;
  }
  /** Create a separate campaign-owned creature variant; never change the
   * source Library record, prepared encounter or active combatant. */
  async function saveCreatureVariant(id,enemy){
    const {uid}=await check(id,'gm');
    if(!enemy||typeof enemy!=='object'||!Array.isArray(enemy.hp))
      throw Error('Choose an encounter enemy with valid statistics.');
    const variantId='creature-'+crypto.randomUUID();
    const draft=libraryDraft('creature',{
      ...enemy,name:enemy.name,xpReward:enemy.xpReward??0
    });
    const result=await firestoreSdk.runTransaction(db,async tx=>{
      const reference=gmRef(id),snap=await tx.get(reference);
      same(uid);
      const world=snap.exists()?snap.data()?.world||{}:{};
      const update=updateGMLibrary(world,'creature',draft,variantId);
      if(!update.ok)throw Error(update.error);
      tx.set(reference,{world:{...world,...update.patch},
        updatedBy:uid,updatedAt:firestoreSdk.serverTimestamp()},{merge:true});
      return {ok:true,id:variantId,name:update.record.name};
    });
    same(uid);return result;
  }
  return Object.freeze({
    availability:()=>flags,watchGM,watchPlayer,watchGMHistory,watchEncounterSnapshots,saveCreatureVariant,
    reviewCompletion:(id,input)=>completionAction(id,input),
    deliverCompletion,
    commandGM:(id,actorId,input)=>command(id,'gm','',actorId,input),
    commandPlayer:(id,characterId,actorId,input)=>command(id,'player',characterId,actorId,input),
    savePrepared:(id,entry,expectedRevision=0)=>writePrepared(id,'save',entry,expectedRevision),
    deletePrepared:(id,entry,expectedRevision)=>writePrepared(id,'delete',entry,expectedRevision),
    stagePrepared:(id,preparedId,revision,expectedPreparedRevision)=>command(id,'gm','','encounter',{
      operation:'stage-prepared',preparedId,revision,expectedPreparedRevision
    }),
    unstagePrepared:(id,preparedId,revision)=>command(id,'gm','','encounter',{
      operation:'unstage-prepared',preparedId,revision
    }),
    loadPrepared:(id,preparedId,revision,expectedPreparedRevision)=>command(id,'gm','','encounter',{
      operation:'load-prepared',preparedId,replace:true,revision,
      expectedPreparedRevision,confirmation:'replace-staged-enemies'
    })
  });
}
