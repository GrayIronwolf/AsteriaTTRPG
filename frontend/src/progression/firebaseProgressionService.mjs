import {gmCampaignAccess,gmSessionState,gmPartySummary} from '../dashboard/gmDashboardModel.mjs';
import {playerCampaignAccess,linkedCharacterAccess,matchesOwnedSource,requireDashboardId} from '../player/playerDashboardModel.mjs';
import {checkProjection,progressionProjection,skillProjection,assertCheckPayload} from './progressionModel.mjs';

export function createFirebaseProgressionService({
  auth,db,firestoreSdk,functions,functionsSdk,readCanonical,enabled=false
}){
  if(!auth||!db||!firestoreSdk||!functions||!functionsSdk||typeof readCanonical!=='function')
    throw Error('An authenticated Firebase progression adapter is required.');
  const flags=Object.freeze({enabled:enabled===true});
  const id=value=>requireDashboardId(value);
  const same=uid=>{
    if(auth.currentUser?.uid!==uid)throw Error('The signed-in account changed.');
  };
  const ref=(...path)=>firestoreSdk.doc(db,...path);
  const campaign=id=>ref('campaigns',id);
  const member=(id,uid)=>ref('campaigns',id,'members',uid);
  const shared=(id,cid)=>ref('campaigns',id,'characters',cid);
  const source=(uid,cid)=>ref('users',uid,'characters',cid);
  const session=id=>ref('campaigns',id,'liveSession','current');
  const requests=id=>firestoreSdk.collection(db,'campaigns',id,'checkRequests');
  const roster=id=>firestoreSdk.collection(db,'campaigns',id,'characters');
  const guarded=async reference=>{
    try{return await firestoreSdk.getDocFromServer(reference);}
    catch{throw Error('The campaign or character cannot be accessed by this account.');}
  };
  async function verified(){
    if(!flags.enabled)throw Error('Migrated progression and checks are disabled.');
    const uid=auth.currentUser?.uid;
    if(!uid)throw Error('Sign in to access progression.');
    const profile=await readCanonical(auth.currentUser);
    same(uid);
    if(profile?.uid!==uid)throw Error('Account profile could not be verified.');
    return uid;
  }
  const access=(campaign,member,uid,cid,mode)=>
    mode==='gm'?gmCampaignAccess(campaign,member,uid,cid).allowed:
      playerCampaignAccess(campaign,member,uid,cid).allowed;
  async function authorize(cid,mode,characterId=''){
    id(cid);
    if(!['gm','player'].includes(mode))throw Error('Unknown gameplay role.');
    if(mode==='player')id(characterId);
    const uid=await verified();
    const c=await guarded(campaign(cid));same(uid);
    if(!c.exists())throw Error('Campaign no longer exists.');
    const data={...c.data(),id:cid};
    const v2=data.membershipSchemaVersion===2&&data.ownerUid!==uid;
    const m=v2?await guarded(member(cid,uid)):null;same(uid);
    const membership=m?.exists()?m.data():null;
    if(!access(data,membership,uid,cid,mode))throw Error('Campaign membership or role is unavailable.');
    let character=null,own=null,sourceId='';
    if(mode==='player'){
      const s=await guarded(shared(cid,characterId));same(uid);
      if(!s.exists())throw Error('Linked character no longer exists.');
      character={...s.data(),id:s.id};
      const allowed=linkedCharacterAccess(data,character,uid,
        playerCampaignAccess(data,membership,uid,cid));
      if(!allowed.allowed||!allowed.owned)throw Error('Only the character owner may use gameplay actions.');
      sourceId=character.sourceCharacterId||characterId;id(sourceId);
      const from=await guarded(source(uid,sourceId));same(uid);
      if(!from.exists())throw Error('Saved character record is missing.');
      own={...from.data(),id:sourceId};
      if(!matchesOwnedSource(own,character,cid,uid,data.membershipSchemaVersion??1))
        throw Error('Character source link is invalid.');
    }
    return {uid,data,membership,v2,character,own,sourceId};
  }
  function subscribe(cid,mode,characterId,onUpdate,onError){
    id(cid);if(mode==='player')id(characterId);
    let active=true;
    const stops=[];
    const close=()=>{active=false;stops.splice(0).forEach(stop=>{try{stop();}catch{}});};
    const fail=error=>{if(!active)return;close();onError?.(error instanceof Error?error:Error('Progression access failed.'));};
    (async()=>{
      try{
        const initial=await authorize(cid,mode,characterId);
        if(!active)return;
        const {uid,v2,sourceId}=initial;
        const state={campaign:initial.data,member:initial.membership,
          character:initial.character,source:initial.own,session:null,party:[],checks:[]};
        const keys=mode==='gm'?['campaign','member','session','party','checks']:
          ['campaign','member','character','source','session','checks'];
        const confirmed=Object.fromEntries(keys.map(key=>[key,key==='member'&&!v2]));
        const validate=()=>{
          same(uid);
          if(!access(state.campaign,state.member,uid,cid,mode))
            throw Error('Campaign progression permission was revoked.');
          if(mode==='player'){
            const relationship=linkedCharacterAccess(state.campaign,state.character,uid,
              playerCampaignAccess(state.campaign,state.member,uid,cid));
            if(!relationship.allowed||!relationship.owned||
              !matchesOwnedSource(state.source,state.character,cid,uid,
                state.campaign.membershipSchemaVersion??1))
              throw Error('Character progression ownership or link was revoked.');
          }
        };
        const publish=()=>{
          if(!active||!Object.values(confirmed).every(Boolean))return;
          try{
            validate();
            onUpdate?.(Object.freeze({
              session:gmSessionState(state.session),
              checks:checkProjection(state.checks,mode,characterId),
              ...(mode==='gm'?{
                party:gmPartySummary(state.party.filter(row=>row.status==='linked'||!row.status))
              }:{
                character:state.character,
                progression:progressionProjection(state.character),
                skills:skillProjection(state.character)
              })
            }));
          }catch(error){fail(error);}
        };
        const attach=(key,reference,decode,required=true)=>{
          const stop=firestoreSdk.onSnapshot(reference,{includeMetadataChanges:true},snap=>{
            if(!active||snap.metadata?.fromCache||snap.metadata?.hasPendingWrites)return;
            try{
              same(uid);
              if(required&&!snap.exists())throw Error('Campaign or character access is no longer available.');
              state[key]=decode(snap);
              confirmed[key]=true;publish();
            }catch(error){fail(error);}
          },fail);
          if(active)stops.push(stop);else stop();
        };
        attach('campaign',campaign(cid),s=>({...s.data(),id:s.id}));
        if(v2)attach('member',member(cid,uid),s=>s.exists()?s.data():null,false);
        if(mode==='player'){
          attach('character',shared(cid,characterId),s=>({...s.data(),id:s.id}));
          attach('source',source(uid,sourceId),s=>({...s.data(),id:s.id}));
        }else{
          attach('party',roster(cid),s=>s.docs.map(row=>({...row.data(),id:row.id})),false);
        }
        attach('session',session(cid),s=>s.exists()?s.data():null,false);
        const query=mode==='gm'?
          firestoreSdk.query(requests(cid),firestoreSdk.orderBy('createdAt','desc'),firestoreSdk.limit(100)):
          firestoreSdk.query(requests(cid),firestoreSdk.where('ownerUid','==',uid),firestoreSdk.limit(100));
        attach('checks',query,s=>s.docs.map(row=>({...row.data(),id:row.id})),false);
      }catch(error){fail(error);}
    })();
    return close;
  }
  async function trustedCommand(cid,characterId,action,args){
    id(cid);id(characterId);
    const {uid}=await authorize(cid,'player',characterId);
    const supported=['spendCharacteristicAllocations','purchaseTalentRank',
      'useCharacterTalent','recordSkillSuccess'];
    if(!supported.includes(action))throw Error('Unknown progression command.');
    const cmd=functionsSdk.httpsCallable(functions,'asteriaAction');
    const result=await cmd({action,args:[cid,characterId,...args],requestId:crypto.randomUUID()});
    same(uid);
    if(result.data?.ok!==true)throw Error(result.data?.error||'Progression update rejected.');
    return result.data;
  }
  async function awardXP(cid,characterId,amount,reason){
    id(cid);id(characterId);
    const {uid}=await authorize(cid,'gm');
    if(!Number.isSafeInteger(amount)||amount<1||amount>1000000||
      typeof reason!=='string'||reason.trim().length<3||reason.length>300)
      throw Error('Choose a valid XP amount and recorded reason.');
    const cmd=functionsSdk.httpsCallable(functions,'asteriaAction');
    const result=await cmd({action:'grantCharacterXP',
      args:[cid,characterId,amount,reason.trim()],requestId:crypto.randomUUID()});
    same(uid);
    if(result.data?.ok!==true)throw Error(result.data?.error||'XP award rejected.');
    return result.data;
  }
  async function checkAction(cid,mode,characterId,input){
    id(cid);if(mode==='player')id(characterId);
    assertCheckPayload(mode,input);
    const {uid}=await authorize(cid,mode,characterId);
    if(mode==='player'&&input.action==='submit'){
      const snap=await guarded(ref('campaigns',cid,'checkRequests',input.requestId));
      same(uid);
      if(!snap.exists()||snap.data().ownerUid!==uid||
        snap.data().characterId!==characterId)
        throw Error('Check request is not addressed to this character.');
    }
    const cmd=functionsSdk.httpsCallable(functions,'asteriaUniversalCheck');
    const result=await cmd({campaignId:cid,...input,operationId:crypto.randomUUID()});
    same(uid);
    if(result.data?.ok!==true)throw Error(result.data?.error||'Check request was rejected.');
    return result.data;
  }
  return Object.freeze({availability:()=>flags,
    watchGM:(cid,ok,fail)=>subscribe(cid,'gm','',ok,fail),
    watchPlayer:(cid,characterId,ok,fail)=>subscribe(cid,'player',characterId,ok,fail),
    awardXP,
    spendCP:(cid,id,allocations)=>trustedCommand(cid,id,'spendCharacteristicAllocations',[allocations]),
    purchaseTalent:(cid,id,talent)=>trustedCommand(cid,id,'purchaseTalentRank',[talent]),
    useTalent:(cid,id,talent,selection)=>trustedCommand(cid,id,'useCharacterTalent',[talent,selection]),
    recordSkill:(cid,id,skill)=>trustedCommand(cid,id,'recordSkillSuccess',[skill]),
    checkGM:(cid,input)=>checkAction(cid,'gm','',input),
    checkPlayer:(cid,id,input)=>checkAction(cid,'player',id,input)
  });
}
