import {gmCampaignAccess,gmSessionState} from '../dashboard/gmDashboardModel.mjs';
import {playerCampaignAccess,linkedCharacterAccess,matchesOwnedSource,publicPartyProjection} from '../player/playerDashboardModel.mjs';
import {requireEconomyId,economyProjection} from './economyModel.mjs';

/**
 * One scoped, verified reader and trusted command adapter for existing economy.
 * No direct Firestore writes, no additional Firebase project or client singleton.
 */
export function createFirebaseEconomyService({
  auth,db,firestoreSdk,functions,functionsSdk,readCanonical,enabled=false
}={}){
  if(!auth||!db||!firestoreSdk||!functions||!functionsSdk||typeof readCanonical!=='function')
    throw Error('Authenticated economy dependencies required.');
  const flags=Object.freeze({enabled:enabled===true});
  const id=requireEconomyId;
  const ref=(...p)=>firestoreSdk.doc(db,...p);
  const collection=(cid,name)=>firestoreSdk.collection(db,'campaigns',cid,name);
  const source=(uid,id)=>ref('users',uid,'characters',id);
  const same=uid=>{if(auth.currentUser?.uid!==uid)throw Error('Signed-in account changed.');};
  async function get(reference){
    try{return await firestoreSdk.getDocFromServer(reference);}
    catch{throw Error('Requested campaign resource cannot be accessed.');}
  }
  async function verified(){
    if(!flags.enabled)throw Error('React economy migration is disabled.');
    const uid=auth.currentUser?.uid;
    if(!uid)throw Error('Sign in to use campaign inventory.');
    const profile=await readCanonical(auth.currentUser);
    same(uid);
    if(profile?.uid!==uid)throw Error('Account verification unavailable.');
    return uid;
  }
  const access=(data,member,uid,cid,role)=>
    role==='gm'?gmCampaignAccess(data,member,uid,cid).allowed:
      playerCampaignAccess(data,member,uid,cid).allowed;
  async function authorize(cid,role,charId=''){
    id(cid);
    if(!['gm','player'].includes(role))throw Error('Invalid economy role.');
    if(role==='player')id(charId);
    const uid=await verified(),c=await get(ref('campaigns',cid));same(uid);
    if(!c.exists())throw Error('Campaign no longer exists.');
    const campaign={id:cid,...c.data()};
    const v2=campaign.membershipSchemaVersion===2&&campaign.ownerUid!==uid;
    const m=v2?await get(ref('campaigns',cid,'members',uid)):null;
    same(uid);
    const member=m?.exists()?m.data():null;
    if(!access(campaign,member,uid,cid,role))throw Error('Campaign economy permission denied.');
    let character=null,owned=null,sourceId='';
    if(role==='player'){
      const shared=await get(ref('campaigns',cid,'characters',charId));same(uid);
      if(!shared.exists())throw Error('Linked character no longer exists.');
      character={id:charId,...shared.data()};
      const link=linkedCharacterAccess(campaign,character,uid,
        playerCampaignAccess(campaign,member,uid,cid));
      if(!link.allowed||!link.owned)throw Error('Only the linked character owner can use its economy.');
      sourceId=id(character.sourceCharacterId||charId);
      const privateSheet=await get(source(uid,sourceId));same(uid);
      if(!privateSheet.exists())throw Error('Owner character record is unavailable.');
      owned={id:sourceId,...privateSheet.data()};
      if(!matchesOwnedSource(owned,character,cid,uid,campaign.membershipSchemaVersion??1))
        throw Error('Character ownership or source link changed.');
    }
    return {uid,campaign,member,v2,character,owned,sourceId};
  }
  const groups=Object.freeze({
    stashes:'partyStashes',loot:'partyLoot',drafts:'partyLootDrafts',
    shops:'shops',trades:'itemRequests',merchantDeals:'merchantDeals',
    recipes:'craftingRecipes',stations:'craftingStations',
    services:'npcCraftingServices',craftingRequests:'craftingRequests',
    repairRequests:'npcRepairRequests'
  });
  const ownerScoped=new Set(['merchantDeals','craftingRequests','repairRequests']);
  const publicStatus=Object.freeze({recipes:'published',stations:'open',services:'published'});
  function watch(cid,role,charId,onUpdate,onError){
    id(cid);if(role==='player')id(charId);
    let active=true;const stops=[];
    const close=()=>{active=false;for(const stop of stops.splice(0))try{stop();}catch{}};
    const fail=err=>{if(!active)return;close();onError?.(err instanceof Error?err:Error('Economy sync failed.'));};
    (async()=>{
      try{
        const init=await authorize(cid,role,charId);
        if(!active)return;
        const {uid,v2}=init;
        const state={campaign:init.campaign,member:init.member,
          character:init.character,privateSheet:init.owned,party:[],
          session:null,publicParty:role==='player'?publicPartyProjection(init.campaign):[],...Object.fromEntries(Object.keys(groups).map(key=>[key,[]]))};
        const required=['campaign','member','session','party','character','privateSheet',
          ...Object.keys(groups)];
        const done=Object.fromEntries(required.map(k=>[k,
          k==='member'&&!v2||k==='party'&&role==='player'||
          (k==='character'||k==='privateSheet')&&role==='gm']));
        const check=()=>{
          same(uid);
          if(!access(state.campaign,state.member,uid,cid,role))
            throw Error('Campaign economy access has been revoked.');
          if(role==='player'){
            const permission=linkedCharacterAccess(state.campaign,state.character,uid,
              playerCampaignAccess(state.campaign,state.member,uid,cid));
            if(!permission.allowed||!permission.owned||
              !matchesOwnedSource(state.privateSheet,state.character,cid,uid,
                state.campaign.membershipSchemaVersion??1))
              throw Error('Character economy ownership has been revoked.');
          }
        };
        const publish=()=>{
          if(!active||!Object.values(done).every(Boolean))return;
          try{
            check();
            const projected=economyProjection(state,role,uid,charId);
            onUpdate?.(Object.freeze({
              ...projected,session:gmSessionState(state.session)
            }));
          }catch(error){fail(error);}
        };
        const attach=(key,reference,decode,document=false,requiredDoc=false)=>{
          const stop=firestoreSdk.onSnapshot(reference,{includeMetadataChanges:true},snap=>{
            if(!active||snap.metadata?.fromCache||snap.metadata?.hasPendingWrites)return;
            try{
              same(uid);
              if(document&&requiredDoc&&!snap.exists())throw Error('Economy access ended.');
              state[key]=decode(snap);
              if(key==='campaign'&&role==='player')state.publicParty=publicPartyProjection(state.campaign);
              done[key]=true;publish();
            }catch(error){fail(error);}
          },fail);
          if(active)stops.push(stop);else stop();
        };
        const mapDoc=s=>s.exists()?{id:s.id,...s.data()}:null;
        const mapRows=s=>s.docs.map(row=>({id:row.id,...row.data()}));
        attach('campaign',ref('campaigns',cid),mapDoc,true,true);
        if(v2)attach('member',ref('campaigns',cid,'members',uid),mapDoc,true,true);
        if(role==='player'){
          attach('character',ref('campaigns',cid,'characters',charId),mapDoc,true,true);
          attach('privateSheet',source(uid,init.sourceId),mapDoc,true,true);
        }else attach('party',firestoreSdk.query(collection(cid,'characters'),firestoreSdk.limit(128)),mapRows);
        attach('session',ref('campaigns',cid,'liveSession','current'),mapDoc,true,false);
        for(const [key,kind] of Object.entries(groups)){
          if(key==='drafts'&&role!=='gm'){done[key]=true;continue;}
          const constraints=[firestoreSdk.limit(100)];
          if(role!=='gm'){
            if(publicStatus[key])
              constraints.unshift(firestoreSdk.where('status','==',publicStatus[key]));
            if(ownerScoped.has(key))
              constraints.unshift(firestoreSdk.where('ownerUid','==',uid));
          }
          const q=firestoreSdk.query(collection(cid,kind),...constraints);
          if(key==='trades'&&role==='player'){
            // Firestore cannot safely query cross-owner trades without both
            // indexed predicates; each listener independently enforces ownerUid.
            const rows={sent:[],received:[]};
            const emit=()=>[...new Map([...rows.sent,...rows.received].map(x=>[x.id,x])).values()];
            const sent=firestoreSdk.query(collection(cid,kind),
              firestoreSdk.where('fromOwnerUid','==',uid),firestoreSdk.limit(100));
            const received=firestoreSdk.query(collection(cid,kind),
              firestoreSdk.where('toOwnerUid','==',uid),firestoreSdk.limit(100));
            done.trades=false;
            const ready={sent:false,received:false};
            for(const [name,query] of [['sent',sent],['received',received]]){
              const stop=firestoreSdk.onSnapshot(query,{includeMetadataChanges:true},snap=>{
                if(!active||snap.metadata?.fromCache||snap.metadata?.hasPendingWrites)return;
                try{same(uid);rows[name]=mapRows(snap);ready[name]=true;
                  if(ready.sent&&ready.received){state.trades=emit();done.trades=true;publish();}
                }catch(error){fail(error);}
              },fail);
              if(active)stops.push(stop);else stop();
            }
          }else attach(key,q,mapRows);
        }
      }catch(error){fail(error);}
    })();
    return close;
  }
  const PLAYER=Object.freeze({
    inventory:'updateCharacterInventory',
    tradeCreate:'createLiveItemRequest',tradeRespond:'respondLiveItemRequest',
    tradeFinalize:'finalizeLiveItemTrade',tradeCancel:'cancelLiveItemRequest',
    tradeAckSender:'acknowledgeLiveItemRequest',
    tradeAckRecipient:'acknowledgeLiveItemRecipientUpdate',
    stashMove:'movePartyStashItem',lootVote:'votePartyLoot',lootClaim:'claimPartyLoot',
    shopBuy:'buyLiveShopItem',shopSell:'sellLiveShopItem',
    bargain:'createMerchantDeal',bargainCancel:'cancelMerchantDeal',
    craftRequest:'requestCraftingRecipe',repairRequest:'requestNPCRepair',
    rewardClaim:'resolveLootReward'
  });
  const GM=Object.freeze({
    inventory:'updateCharacterInventory',
    stash:'managePartyStash',loot:'managePartyLootDrop',lootSplit:'splitPartyLootCurrency',
    shop:'manageCampaignShop',bargainReview:'respondMerchantDeal',
    recipe:'manageCampaignCraftingRecipe',craftReview:'reviewCraftingRequest',
    station:'manageCraftingStation',service:'manageNPCService',repairReview:'reviewNPCRepair',
    reward:'grantGMRewardBundle'
  });
  const scopeActions=new Set(['stash','loot','lootSplit','shop','bargainReview',
    'recipe','craftReview','station','service','repairReview']);
  async function action(cid,role,characterId,kind,...args){
    id(cid);
    if(role==='player')id(characterId);
    if(!Object.hasOwn(role==='gm'?GM:PLAYER,kind))
      throw Error('Unsupported economy operation.');
    const {uid}=await authorize(cid,role,characterId);
    const command=(role==='gm'?GM:PLAYER)[kind];
    if(role==='gm'&&!scopeActions.has(kind)&&kind!=='reward')
      id(characterId);
    if(role==='gm'&&kind==='reward')id(characterId);
    const target=role==='gm'&&scopeActions.has(kind)?'gm-scope':characterId;
    // The underlying callable performs final session and identity checks.
    // Unrestricted target IDs never let a player act on another character.
    if(role==='player'&&kind==='inventory'){
      const op=args[0]||{};
      if(!['create-storage','rename-storage','reorder-storages','create-custom-item',
        'split-stack','equip','unequip','quick','use','move-storage','identify','read-spellbook'].includes(op.type))
        throw Error('Invalid player inventory operation.');
    }
    if(role==='gm'&&kind==='inventory'&&!['set-quantity','equip','unequip','move-storage'].includes(args[0]?.type))
      throw Error('GM inventory changes are restricted to existing supported actions.');
    const requestId=crypto.randomUUID();
    const payload={action:command,args:[cid,target,...args],requestId};
    if(JSON.stringify(payload).length>30000)throw Error('Economy operation too large.');
    const callable=functionsSdk.httpsCallable(functions,'asteriaAction');
    const response=await callable(payload);
    same(uid);
    if(response.data?.ok!==true)throw Error(response.data?.error||'Economy command rejected.');
    return response.data;
  }
  return Object.freeze({
    availability:()=>flags,
    watchGM:(cid,ok,err)=>watch(cid,'gm','',ok,err),
    watchPlayer:(cid,charId,ok,err)=>watch(cid,'player',charId,ok,err),
    player:(cid,charId,kind,...args)=>action(cid,'player',charId,kind,...args),
    gm:(cid,charId,kind,...args)=>action(cid,'gm',charId,kind,...args)
  });
}