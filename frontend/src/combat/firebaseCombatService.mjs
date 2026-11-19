import {assertGMCampaignId,gmCampaignAccess,gmPartySummary} from '../dashboard/gmDashboardModel.mjs';
import {requireDashboardId,playerCampaignAccess,linkedCharacterAccess,matchesOwnedSource} from '../player/playerDashboardModel.mjs';
import {gmSessionState} from '../dashboard/gmDashboardModel.mjs';
import {
  projectCombat,eligiblePlayerCombatants,gmEncounterCandidates,validateCombatCommand,
  combatRevision
} from './combatModel.mjs';

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
  const sessionRef=id=>firestoreSdk.doc(db,'campaigns',id,'liveSession','current');
  const gmRef=id=>firestoreSdk.doc(db,'campaigns',id,'systems','gmWorkspace');
  const partyRef=id=>firestoreSdk.collection(db,'campaigns',id,'characters');
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
          roster:[],workspace:null};
        const required=mode==='gm'
          ?['campaign','member','encounter','session','roster','workspace']
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
                pending:data.workspace?.combatState?.pending?.status?
                  {id:data.workspace.combatState.pending.id||'',
                    status:String(data.workspace.combatState.pending.status).slice(0,80),
                    actorId:data.workspace.combatState.pending.actorId||''}:null,
                party:gmPartySummary(data.roster)
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
        }
        attach('encounter',encounterRef(id),snap=>snap.exists()?snap.data():null,false);
        attach('session',sessionRef(id),snap=>snap.exists()?snap.data():null,false);
      }catch(error){fail(error);}
    })();
    return close;
  }

  const watchGM=(id,onUpdate,onError)=>watch(id,'gm','',onUpdate,onError);
  const watchPlayer=(id,characterId,onUpdate,onError)=>
    watch(id,'player',characterId,onUpdate,onError);
  async function command(id,mode,characterId,actorId,input){
    const command=validateCombatCommand(mode,actorId,input);
    const {uid}=await check(id,mode,characterId);
    const encounter=await fromServer(encounterRef(id));
    same(uid);
    const raw=encounter.exists()?encounter.data():{};
    if(combatRevision(raw)!==command.revision)
      throw Error('Combat changed in another session. Wait for live sync.');
    if(mode==='player'&&!((raw.combatants||[]).some(row=>
      row.id===actorId&&row.characterId===characterId)))
      throw Error('That combat participant is not linked to your character.');
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
  return Object.freeze({
    availability:()=>flags,watchGM,watchPlayer,
    commandGM:(id,actorId,input)=>command(id,'gm','',actorId,input),
    commandPlayer:(id,characterId,actorId,input)=>command(id,'player',characterId,actorId,input)
  });
}
