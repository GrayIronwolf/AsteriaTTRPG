import { createInformationCommands } from './informationCommands.mjs';
import { isCampaignGM, readCampaignMember } from './characterPermissions.mjs';
import { createCombatCommands } from './combatCommands.mjs';
import { isDeepStrictEqual } from 'node:util';
import { createCoreCommands } from './coreCommands.mjs';
import { reconcileCharacterSystems } from '../src/state/characterSystems.mjs';
import { applyResourceChanges, parseResourceCosts, resourceId, resourceSnapshot } from '../src/state/resourceEngine.mjs';
import { buildTalentCatalog, prerequisiteProblem, rankDefined, reconcileTalentEffects, saveTalentRank, talentRank } from '../src/state/talentModel.mjs';
import { talentRules, useLearnedTalent } from '../src/state/talentMechanics.mjs';
import { changeQuestProgress, changeQuestStatus } from '../src/state/questWorkflowModel.mjs';
import { applyCharacteristicAllocations, applyCharacteristicPoints, characterKnowsIdentify, firstFreeStorageSlot, nextSkillProgress, normalizeCharacterStorages, normalizeInventoryItems, normalizeLiveItem, parseResourceCost, slug as liveSlug, stableInventoryItemId, stackableStorageItem, unidentifiedItemName, structuredCloneSafe, talentRankCost, talentTierUnlocked, timestampMs } from '../src/state/liveWorkspaceModel.mjs';
import { createAsteriaItem, marketPricingStatus, normalizeMarketPricing } from '../src/systems/items/marketPricing.mjs';
import { shopStockCompatible, shopVariantKey, merchantPriceCopper } from '../src/state/shopTransactionModel.mjs';
import { equipCharacterInventoryItem, stageDirectEquipReward } from './rewardDelivery.mjs';
import { createItemStoreCommands } from './itemStoreCommands.mjs';
import { addGrantedMagicElement } from '../src/state/characterIntegrityModel.mjs';
import { markQuestRewardClaimed, normalizeQuestReward, questRewardClaimed, questRewardSummary } from '../src/state/questRewardModel.mjs';
import { validateGMRewardPayload } from '../src/state/gmRewardModel.mjs';

// Canonical player mutations. Executed only by the authenticated callable handler.
export function createCommands(context) {
const {db,currentUser,requestId,doc,collection,runTransaction,serverTimestamp,window,reportSyncError}=context;
const uniqueValues=(...lists)=>[...new Set(lists.flatMap(value=>Array.isArray(value)?value:[]).filter(Boolean))];
function liveSessionState(value={}){
  const expiresAt=timestampMs(value.expiresAt);
  const expired=['active','paused'].includes(value.status) && Boolean(expiresAt) && Date.now() >= expiresAt;
  return Object.assign({},value,{ status:expired ? 'expired' : (value.status || 'idle'), expired, editable:value.status === 'active' && !expired });
}
function requireLiveSession(transaction,campaignId){
  const liveRef=doc(db,'campaigns',campaignId,'liveSession','current');
  return transaction.get(liveRef).then(snapshot=>{
    const session=liveSessionState(snapshot.exists() ? snapshot.data() : {});
    if(!session.editable) throw new Error(session.expired ? 'This session reached its 10-hour limit.' : 'The GM must start the session before this dashboard can be edited.');
    return session;
  });
}
async function requireCampaignGM(transaction,campaignId){
  const campaignRef=doc(db,'campaigns',campaignId);
  const snapshot=await transaction.get(campaignRef);
  if(!snapshot.exists()) throw new Error('Campaign not found.');
  const campaign=snapshot.data();
  const uid=currentUser?.uid || '';
  const membership=await readCampaignMember({get:async ref=>{
    const row=await transaction.get(ref);return {exists:row.exists(),data:()=>row.data()};
  }},db,campaignId,campaign,uid);
  if(!isCampaignGM(campaign,uid,membership)) throw new Error('Only a GM for this campaign can make this change.');
  return campaign;
}
function liveCharacterRefs(campaignId,characterId){
  return {
    campaign:doc(db,'campaigns',campaignId,'characters',characterId),
    private:doc(db,'users',currentUser.uid,'characters',characterId)
  };
}
function ownedCharacterSourceId(characterId,character={}){
  return String(character.sourceCharacterId || character.id || characterId || '');
}
async function verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs={},allowGM=false){
  if(character.ownerUid !== currentUser.uid) {
    if(!allowGM) throw new Error('This character belongs to another account.');
    await requireCampaignGM(transaction,campaignId);
  }
  refs.private=doc(db,'users',character.ownerUid,'characters',ownedCharacterSourceId(characterId,character));
  refs.verifiedOwner=true;
  refs.original=structuredCloneSafe(character);
  const privateSnapshot=await transaction.get(refs.private);
  refs.privateExists=privateSnapshot.exists();
  refs.privateData=refs.privateExists?privateSnapshot.data():null;
  if(refs.privateExists && refs.privateData.ownerUid!==character.ownerUid) throw new Error('Character ownership does not match.');
  const encounterSnapshot=await transaction.get(doc(db,'campaigns',campaignId,'systems','encounter'));
  refs.encounter=encounterSnapshot.exists()?encounterSnapshot.data():{status:'ready'};
  Object.assign(character,reconcileCharacterSystems(character,buildTalentCatalog(character,context.catalog),{grantIncrease:true,encounter:refs.encounter}));
  return {privateRef:refs.private,privateSnapshot:null};
}

// The requester may not own the other side of a trade. Resolve that
// character's private sheet from the trusted campaign owner, not from the
// caller's UID, and use the same transaction to update both mirrors.
async function verifyLiveTradeCounterparty(transaction,campaignId,characterId,character,refs){
  if(!character.ownerUid) throw new Error('The other character has no verified owner.');
  refs.campaign=doc(db,'campaigns',campaignId,'characters',characterId);
  refs.private=doc(db,'users',character.ownerUid,'characters',ownedCharacterSourceId(characterId,character));
  refs.original=structuredCloneSafe(character);
  refs.verifiedOwner=true;
  const privateSnapshot=await transaction.get(refs.private);
  refs.privateExists=privateSnapshot.exists();
  refs.privateData=refs.privateExists?privateSnapshot.data():null;
  if(!refs.privateExists) throw new Error('The other character owner record is unavailable. No items or currency were moved.');
  if(refs.privateData.ownerUid!==character.ownerUid) throw new Error('The other character owner record does not match.');
  const encounterSnapshot=await transaction.get(doc(db,'campaigns',campaignId,'systems','encounter'));
  refs.encounter=encounterSnapshot.exists()?encounterSnapshot.data():{status:'ready'};
  Object.assign(character,reconcileCharacterSystems(character,buildTalentCatalog(character,context.catalog),{grantIncrease:true,encounter:refs.encounter}));
}

// Older, already-resolved item requests might predate atomic owner mirroring.
// An acknowledgement may repair only gameplay fields; it must never copy
// unrelated private profile, journal or account metadata over the owner.
function repairLegacyTradeMirror(transaction,refs,character){
  if(!refs.privateExists || !refs.privateData ||
     Number(refs.privateData.coreRevision||0)>Number(character.coreRevision||0)) return;
  const fields=['inventory','equipment','coins','coinPouch','quickSlots','actionLog','coreRevision'];
  const patch={};
  for(const key of fields) if(Object.hasOwn(character,key) && !isDeepStrictEqual(refs.privateData[key],character[key])) patch[key]=character[key];
  if(Object.keys(patch).length) transaction.update(refs.private,{...patch,updatedAt:serverTimestamp()});
}

function writeLiveCharacter(transaction,refs,character){
  const clean=reconcileCharacterSystems(character,buildTalentCatalog(character,context.catalog),{encounter:refs.encounter});
  clean.inventory=normalizeInventoryItems(clean.inventory,clean);
  if(clean.equipment&&typeof clean.equipment==='object') clean.equipment=Object.fromEntries(Object.entries(clean.equipment).map(([slot,item],index)=>[
    slot,
    item&&typeof item==='object'?normalizeLiveItem(Object.assign({},item,{equipped:true,equippedSlot:item.equippedSlot||slot}),index,clean):item
  ]));
  const patch={};
  for(const [key,value] of Object.entries(clean)) if(!['id','ownerUid','sourceCharacterId','updatedAt'].includes(key) && !isDeepStrictEqual(refs.original?.[key],value)) patch[key]=value;
  if(!Object.keys(patch).length) return;
  patch.coreRevision=Number(refs.original?.coreRevision || 0)+1;
  patch.updatedAt=serverTimestamp();
  // Archive new activity in the existing targeted campaign event stream.
  const previousIds=new Set((refs.original?.actionLog || []).map(row=>row.id));
  for(const row of clean.actionLog || []) if(row.id && !previousIds.has(row.id)) {
    const id=`activity-${clean.id}-${row.id}`;
    transaction.set(doc(db,'campaigns',refs.campaign.path.split('/')[1],'events',id),{id,type:row.type || 'activity',targetCharacterId:clean.id,targetOwnerUid:clean.ownerUid,payload:{message:row.message || '',activityId:row.id},acknowledged:false,createdAt:serverTimestamp(),createdBy:currentUser.uid});
  }
  transaction.update(refs.campaign,patch);
  if(refs.privateExists) transaction.update(refs.private,patch);
}
async function talentAction(campaignId,characterId,operation){
  if(!db || !currentUser || !campaignId || !characterId) return {ok:false,error:'Sign in and choose a linked character.'};
  const refs=liveCharacterRefs(campaignId,characterId);
  try{
    const result=await runTransaction(db,async transaction=>{
      const session=await requireLiveSession(transaction,campaignId);
      const snapshot=await transaction.get(refs.campaign);
      if(!snapshot.exists()) throw new Error('Character not found.');
      const character={id:characterId,...snapshot.data()};
      await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
      const catalog=buildTalentCatalog(character,context.catalog);
      const result=await operation({character,catalog,refs,transaction,session});
      writeLiveCharacter(transaction,refs,character);
      return result;
    });
    return {ok:true,...result};
  }catch(error){return {ok:false,error:error.message||String(error)};}
}
function trustedCustomItem(source = {}) {
  const name=String(source.name || source.title || '').trim().slice(0,160);
  if(!name) throw new Error('Enter an item name.');
  const item=createAsteriaItem({
    name, title:name,
    type:String(source.type || 'Item').slice(0,80),
    itemClass:String(source.itemClass || source.rarity || 'Common').slice(0,80),
    description:String(source.description || '').slice(0,10000),
    marketValue:source.marketValue ?? 0,
    marketPrice:source.marketPrice ?? 0,
    isSpellbook:source.isSpellbook === true,
    category:source.isSpellbook === true ? 'Spellbook' : String(source.category || source.type || 'Item').slice(0,80),
    itemType:source.isSpellbook === true ? 'Spellbook' : String(source.itemType || source.type || 'Item').slice(0,80),
    image:String(source.image || '').slice(0,1000),
    compendiumSpellId:source.isSpellbook ? String(source.compendiumSpellId || source.spell?.id || '').slice(0,160) : '',
    compendiumSpellSlug:source.isSpellbook ? String(source.compendiumSpellSlug || source.spell?.slug || '').slice(0,160) : '',
    compendiumSpellRoute:source.isSpellbook ? String(source.compendiumSpellRoute || source.spell?.route || '').slice(0,500) : '',
    sourceSpellPath:source.isSpellbook ? String(source.sourceSpellPath || source.spell?.sourcePath || '').slice(0,500) : '',
    spell:source.isSpellbook === true ? Object.fromEntries(
      ['id','slug','name','title','element','magicType','rank','manaCost','cost','image','summary','route','sourcePath']
        .map(key=>[key,String(source.spell?.[key] ?? (key==='name' ? source.spellName || name : key==='element' ? source.element || '' : key==='rank' ? 'Rank I' : '')).slice(0,key==='summary'?1000:500)])
    ) : null,
    basicName:String(source.basicName || (source.isSpellbook ? 'Book' : source.type || 'Item')).slice(0,80)
  });
  const id=`custom-${liveSlug(name)||'item'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;
  return Object.assign({},item,{
    id, catalogId:id, definitionId:`custom-item:${id}`, slug:id,
    name, title:name, trueName:name,
    custom:true, visibility:'public',
    createdBy:currentUser.uid
  });
}

function characterInventory(character){
  return normalizeInventoryItems((Array.isArray(character.inventory) ? character.inventory : []).map((item,index)=>
    typeof item === 'string' ? {id:liveSlug(item)||`item-${index}`,name:item,qty:1} : Object.assign({qty:Number(item.qty ?? item.quantity ?? 1)},item)
  ),character);
}
const LIVE_CURRENCY=[['royal_platinum',10000000000],['royal_crown',100000000],['platinum_crown',1000000],['gold',10000],['silver',100],['copper',1]];
function currencyTotal(character){
  const coins=character.coins || character.coinPouch || {};
  return LIVE_CURRENCY.reduce((sum,[key,value])=>sum+Number(coins[key] ?? coins[key.replaceAll('_',' ')] ?? coins[key.split('_').map(part=>part[0]?.toUpperCase()+part.slice(1)).join(' ')] ?? 0)*value,0);
}
function setCurrencyTotal(character,total){
  let remainder=Math.max(0,Math.floor(Number(total||0)));
  character.coins=Object.assign({},character.coins || {});
  LIVE_CURRENCY.forEach(([key,value])=>{character.coins[key]=Math.floor(remainder/value);remainder%=value;});
}
function liveItemId(item,index=0){return stableInventoryItemId(item,index);}
function appendActivity(character,entry){
  const rows=Array.isArray(character.actionLog) ? character.actionLog : [];
  character.actionLog=[Object.assign({id:`action-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,at:new Date().toISOString()},entry),...rows].slice(0,100);
}
// Public marketplace data is intentionally distinct from private trade terms.
// Never expose player requests or their escrowed items in a campaign-readable doc.
function publicItemEcosystem(ecosystem={}){
  return {
    version:'asteria-item-public-v1',
    shops:Array.isArray(ecosystem.shops)?ecosystem.shops:[],
    partyLoot:Array.isArray(ecosystem.partyLoot)?ecosystem.partyLoot:[],
    sharedStorages:Array.isArray(ecosystem.sharedStorages)?ecosystem.sharedStorages:[]
  };
}
function itemRequestRef(campaignId,id){
  return doc(db,'campaigns',campaignId,'itemRequests',String(id));
}
function requirePrivateItemRequest(snapshot,requestId){
  if(!snapshot.exists()) throw new Error('This item request is no longer available.');
  const request=structuredCloneSafe(snapshot.data());
  if(String(request.id)!==String(requestId)) throw new Error('This item request does not match.');
  return request;
}
function savePublicItemEcosystem(transaction,campaignId,ecosystem){
  transaction.set(doc(db,'campaigns',campaignId,'systems','itemPublic'),{
    ...publicItemEcosystem(ecosystem),updatedAt:serverTimestamp()
  },{merge:true});
}
function placeCharacterItem(character,source,options={}){
  const qty=Math.max(1,Number(source?.qty ?? source?.quantity ?? 1));
  character.storageLimit=Math.max(3,Number(character.storageLimit||3));
  character.storages=normalizeCharacterStorages(character);
  const preferred=character.storages.find(value=>String(value.id)===String(options.storageId||''));
  const candidates=[preferred,...character.storages].filter((value,index,rows)=>value&&rows.findIndex(row=>row && String(row.id)===String(value.id))===index);
  if(!candidates.length) throw new Error(`${character.name||'This character'} needs a storage container before receiving items.`);
  const inventory=characterInventory(character);
  const baseSource=Object.assign({},structuredCloneSafe(source),{qty,location:'inventory',equipped:false,equippedSlot:''});
  if(!options.noStack){
    for(const storage of candidates){
      const cleanSource=Object.assign({},baseSource,{storageId:storage.id});
      const stacked=stackableStorageItem(inventory,cleanSource,storage.id);
      if(stacked){
        stacked.qty=Number(stacked.qty||1)+qty;
        character.inventory=inventory;
        return stacked;
      }
    }
  }
  let storage=null;
  let storageSlot=-1;
  for(const candidate of candidates){
    const capacity=Math.max(1,Number(candidate.maxSlots||Number(candidate.rows||4)*Number(candidate.cols||4)));
    const requestedSlot=Number(options.storageSlot);
    const requestedAvailable=String(candidate.id)===String(preferred?.id||'')&&Number.isInteger(requestedSlot)&&requestedSlot>=0&&requestedSlot<capacity&&!inventory.some(value=>!value.equipped&&String(value.storageId)===String(candidate.id)&&Number(value.storageSlot)===requestedSlot);
    const nextSlot=requestedAvailable?requestedSlot:firstFreeStorageSlot(inventory,candidate);
    if(nextSlot>=0){storage=candidate;storageSlot=nextSlot;break;}
  }
  if(!storage) throw new Error('Every storage container is full. Create space before accepting this item.');
  const cleanSource=Object.assign({},baseSource,{storageId:storage.id});
  const preserveId=Boolean(options.preserveId)&&!inventory.some(value=>liveItemId(value)===liveItemId(cleanSource));
  const received=Object.assign({},cleanSource,{
    id:preserveId?liveItemId(cleanSource):`${liveSlug(cleanSource.trueName||cleanSource.name||'item')}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    instanceId:`item-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    storageSlot
  });
  character.inventory=[...inventory,received];
  return received;
}



// Returning an escrowed item must not depend on having an empty container.
// Try the original slot (or a compatible stack), then keep the complete item
// as visible overflow when bags have been filled or removed in the meantime.
// The action containing this helper commits the return and request status
// together, so retries cannot return the same escrow more than once.
function restoreEscrowItem(character,escrow,operationId){
  if(!escrow||!escrow.name) throw new Error('The escrowed item is unavailable.');
  const options={storageId:String(escrow.storageId||''),storageSlot:escrow.storageSlot,preserveId:true};
  try {
    return {item:placeCharacterItem(character,escrow,options),overflow:false};
  } catch(error) {
    if(!/full|needs a storage container/i.test(error.message||'')) throw error;
  }
  const inventory=characterInventory(character);
  const storages=normalizeCharacterStorages(character);
  const storage=storages.find(row=>String(row.id)===String(escrow.storageId||''))||storages[0];
  const used=new Set(inventory.map(row=>liveItemId(row)));
  const desired=String(escrow.instanceId||escrow.id||'');
  const base=desired&&!used.has(desired)?desired:`escrow-return-${operationId}`;
  let id=base,index=1;
  while(used.has(id)) {index+=1;id=`${base}-${index}`;}
  const item={...structuredCloneSafe(escrow),id,instanceId:id,
    qty:Math.max(1,Number(escrow.qty||1)),storageId:storage?.id||'',storageSlot:-1,
    equipped:false,equippedSlot:'',location:'inventory'};
  character.inventory=[...inventory,item];
  return {item,overflow:true};
}


function applyQuestRewards(character,quest,questId,characterId) {
  let rewardApplied=false;
  let summary='';
  if(quest.status==='Completed'&&!questRewardClaimed(quest)){
    const reward=normalizeQuestReward(quest.reward);
    summary=questRewardSummary(reward);
    if(reward.xp){
      if(!window.AsteriaProgression?.grantXP) throw new Error('The XP progression service is unavailable. The quest was not completed.');
      window.AsteriaProgression.grantXP(character,reward.xp);
    }
    if(reward.currency.amount){
      character.coins={...(character.coins||character.coinPouch||{})};
      character.coins[reward.currency.key]=Math.max(0,Number(character.coins[reward.currency.key]||0)+reward.currency.amount);
    }
    reward.items.forEach(item=>placeCharacterItem(character,item,{}));
    const claimed=markQuestRewardClaimed(quest,`quest-reward-${questId}-${characterId}`);
    Object.assign(quest,claimed.quest);
    rewardApplied=claimed.applied;
    appendActivity(character,{type:'quest-reward',message:`Completed ${quest.title||quest.name||'quest'}${summary?` and received ${summary}`:''}.`});
  }
  return {rewardApplied,rewardSummary:summary};
}
async function mutateQuest(campaignId,characterId,questId,operation,{gm=false,note='',award=false}={}) {
  const refs=liveCharacterRefs(campaignId,characterId);
  const eventRef=doc(collection(db,'campaigns',campaignId,'events'));
  try {
    const result=await runTransaction(db,async transaction=>{
      if(gm) await requireCampaignGM(transaction,campaignId);
      else await requireLiveSession(transaction,campaignId);
      const snapshot=await transaction.get(refs.campaign);
      if(!snapshot.exists()) throw new Error('Character not found.');
      const character={...snapshot.data(),id:characterId};
      let ownerSnapshot=null;
      if(gm) {
        refs.original=structuredCloneSafe(character);
        refs.private=doc(db,'users',character.ownerUid,'characters',ownedCharacterSourceId(characterId,character));
        ownerSnapshot=await transaction.get(refs.private);
        refs.privateExists=ownerSnapshot.exists();
        if(ownerSnapshot.exists() && ownerSnapshot.data().ownerUid!==character.ownerUid) throw new Error('The owner record needs review before this quest can be changed.');
      } else await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
      const quests=Array.isArray(character.quests||character.questLog)?structuredCloneSafe(character.quests||character.questLog):[];
      const index=quests.findIndex((quest,index)=>String(quest?.id||quest?.slug||index)===String(questId));
      if(index<0) throw new Error('Quest not found.');
      const quest=operation(quests[index]);
      const outcome=award?applyQuestRewards(character,quest,questId,characterId):{rewardApplied:false,rewardSummary:''};
      quests[index]=quest;character.quests=quests;
      writeLiveCharacter(transaction,refs,character);
      transaction.set(eventRef,{id:eventRef.id,campaignId,targetCharacterId:characterId,targetOwnerUid:character.ownerUid,type:'quest-updated',payload:{questId,title:quest.title||quest.name||'Quest',objective:quest.objective||quest.description||'',status:quest.status,note:String(note||'').slice(0,1000),rewardSummary:outcome.rewardSummary},acknowledged:false,createdBy:currentUser.uid,createdAt:serverTimestamp()});
      return {...outcome,status:quest.status};
    });
    return {ok:true,...result};
  } catch(error) {return {ok:false,error:error.message||String(error)};}
}

const commands = {
  // Bootstrap the public shop projection and migrate historical requests away
  // from the broadly readable legacy ecosystem. Safe to call outside a session.
  syncCampaignItemPrivacy: async function(campaignId,characterId){
    if(!db||!currentUser||!campaignId||!characterId) return {ok:false};
    const ecosystemRef=doc(db,'campaigns',campaignId,'systems','itemEcosystem');
    const publicRef=doc(db,'campaigns',campaignId,'systems','itemPublic');
    try{
      const result=await runTransaction(db,async transaction=>{
        await requireCampaignGM(transaction,campaignId);
        const [legacySnapshot,publicSnapshot]=await Promise.all([
          transaction.get(ecosystemRef),transaction.get(publicRef)
        ]);
        const legacy=structuredCloneSafe(legacySnapshot.exists()?legacySnapshot.data():{});
        const pending=Array.isArray(legacy.playerItemRequests)?legacy.playerItemRequests:[];
        const previousTrades=Array.isArray(legacy.directTrades)?legacy.directTrades:[];
        const uniqueRows=[...new Map([...pending,...previousTrades]
          .filter(row=>row&&typeof row.id==='string'&&/^[A-Za-z0-9_-]{1,180}$/.test(row.id))
          .map(row=>[row.id,row])).values()];
        const ready=uniqueRows.filter(row=>row.fromOwnerUid && row.toOwnerUid &&
          typeof row.fromCharacterId==='string' && typeof row.toCharacterId==='string').slice(0,60);
        const references=ready.map(row=>itemRequestRef(campaignId,row.id));
        const existing=await Promise.all(references.map(ref=>transaction.get(ref)));
        for(let i=0;i<ready.length;i++) if(!existing[i].exists()){
          transaction.set(references[i],ready[i]);
        }
        const migratedIds=new Set(ready.map(row=>row.id));
        if(migratedIds.size){
          transaction.update(ecosystemRef,{
            playerItemRequests:pending.filter(row=>!migratedIds.has(row.id)),
            directTrades:previousTrades.filter(row=>!migratedIds.has(row.id)),
            updatedAt:serverTimestamp()
          });
        }
        const projected=publicItemEcosystem(legacy);
        if(!publicSnapshot.exists() || Object.keys(projected).some(key=>!isDeepStrictEqual(projected[key],publicSnapshot.data()[key]))){
          transaction.set(publicRef,{...projected,updatedAt:serverTimestamp()},{merge:true});
        }
        return {migrated:migratedIds.size,remaining:uniqueRows.length-migratedIds.size};
      });
      return {ok:true,...result};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  identifyLootReward: async function(campaignId,characterId,eventId){
    if(!db || !currentUser || !campaignId || !characterId || !eventId) return {ok:false};
    const refs=liveCharacterRefs(campaignId,characterId);
    const eventRef=doc(db,'campaigns',campaignId,'events',eventId);
    try{
      await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const [eventSnapshot,characterSnapshot]=await Promise.all([transaction.get(eventRef),transaction.get(refs.campaign)]);
        if(!eventSnapshot.exists()||!characterSnapshot.exists()) throw new Error('This reward is no longer available.');
        const event=structuredCloneSafe(eventSnapshot.data());
        const character=Object.assign({id:characterId},characterSnapshot.data());
        if(event.type!=='loot-reward'||event.resolvedAt||event.targetCharacterId!==characterId||event.targetOwnerUid!==currentUser.uid) throw new Error('This reward is not assigned to this character.');
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
        if(!characterKnowsIdentify(character)) throw new Error('Learn the Identify spell before identifying loot.');
        const item=Object.assign({},event.payload?.item||{});
        item.identified=true;item.name=item.trueName||item.name;item.identifiedAt=new Date().toISOString();item.identifiedBy=characterId;
        event.payload=Object.assign({},event.payload||{},{item});
        transaction.set(eventRef,{payload:event.payload,updatedAt:serverTimestamp()},{merge:true});
        character.pendingItemRewards=(character.pendingItemRewards||[]).map(value=>String(value.id)===String(eventId)?Object.assign({},value,{item}):value);
        writeLiveCharacter(transaction,refs,character);
      });
      return {ok:true};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  spendCharacteristicPoints: async function(campaignId,characterId,key,amount=1){
    if(!db || !currentUser || !campaignId || !characterId) return {ok:false};
    const refs=liveCharacterRefs(campaignId,characterId);
    try{
      const result=await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const snapshot=await transaction.get(refs.campaign);
        if(!snapshot.exists()) throw new Error('Character not found.');
        const current=Object.assign({id:characterId},snapshot.data());
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,current,refs);
        const applied=applyCharacteristicPoints(current,key,amount);
        appendActivity(applied.character,{type:'cp-spent',message:`Spent ${applied.applied} CP on ${key}.`});
        writeLiveCharacter(transaction,refs,applied.character);
        return applied;
      });
      return {ok:true,applied:result.applied};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  spendCharacteristicAllocations: async function(campaignId,characterId,allocations={}){
    if(!db || !currentUser || !campaignId || !characterId) return {ok:false};
    const refs=liveCharacterRefs(campaignId,characterId);
    try{
      const result=await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const snapshot=await transaction.get(refs.campaign);
        if(!snapshot.exists()) throw new Error('Character not found.');
        const current=Object.assign({id:characterId},snapshot.data());
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,current,refs);
        const applied=applyCharacteristicAllocations(current,allocations);
        const summary=Object.entries(applied.applied).map(([name,value])=>`${name} +${value}`).join(', ');
        appendActivity(applied.character,{type:'cp-spent',message:`Applied ${applied.total} CP: ${summary}.`});
        writeLiveCharacter(transaction,refs,applied.character);
        return applied;
      });
      return {ok:true,applied:result.applied,total:result.total};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  purchaseTalentRank: (campaignId,characterId,input={})=>talentAction(campaignId,characterId,async({character,catalog,refs})=>{
    const matches=catalog.filter(row=>input.id?row.id===input.id:liveSlug(row.name)===liveSlug(input.name) && (!input.className || liveSlug(row.className)===liveSlug(input.className)));
    if(matches.length!==1) throw new Error('Choose a talent from this character’s class tree.');
    const talent=matches[0], rank=talentRank(character,talent,catalog);
    if(input.expectedRank!==undefined && input.expectedRank!==rank) throw new Error('Talent rank changed. Refresh before purchasing again.');
    if(rank>=talent.maxRank) throw new Error('Talent is already at maximum rank.');
    if(!talentTierUnlocked(character.level,talent.tier)) throw new Error(`Tier ${talent.tier} is locked at this level.`);
    const prerequisite=prerequisiteProblem(character,talent,catalog);
    if(prerequisite) throw new Error(prerequisite);
    if(!rankDefined(talent,rank+1)) throw new Error('This rank has not been written yet. No TP was spent.');
    const cost=talentRankCost(rank+1,talent.tier);
    if(!Number.isFinite(Number(character.tp)) || Number(character.tp)<cost) throw new Error(`Rank ${rank+1} costs ${cost} TP.`);
    character.tp=Number(character.tp)-cost;
    Object.assign(character,reconcileTalentEffects(saveTalentRank(character,talent,rank+1,catalog),catalog,{grantIncrease:true,encounter:refs.encounter}));
    appendActivity(character,{type:'talent-rank',message:`Unlocked ${talent.name} Rank ${rank+1} for ${cost} TP.`});
    return {rank:rank+1,cost};
  }),
  useCharacterTalent: (campaignId,characterId,input={},selection={})=>talentAction(campaignId,characterId,async({character,catalog,refs,transaction,session})=>{
    const talent=catalog.find(row=>row.id===input.id);
    if(!talent) throw new Error('Choose a talent from this character’s class tree.');
    const rank=talentRank(character,talent,catalog);
    if(input.expectedRank!==undefined && input.expectedRank!==rank) throw new Error('Talent rank changed. Reopen the talent before using it.');
    let spellCosts;
    if(talentRules(talent,rank).needsSpell){
      const source=character.spells||character.activeSpells||character.knownSpells||[];
      const rows=Array.isArray(source)?source:Object.entries(source).map(([name,value])=>({name,...(typeof value==='object'?value:{})}));
      const known=rows.find(row=>liveSlug(row.name||row.title||row)===liveSlug(selection.spell));
      const entry=context.catalog.find(row=>row.type==='spell' && liveSlug(row.title)===liveSlug(selection.spell));
      const cost=known && (known.costs??known.resourceCosts??known.cost??known.manaCost??entry?.metadata?.manaCost??entry?.metadata?.cost);
      if(cost===undefined || cost===false) throw new Error('Choose a known spell with a recorded resource cost.');
      spellCosts=parseResourceCosts(cost,'mp',true);
    }
    const used=useLearnedTalent(character,talent,selection,{catalog,encounter:refs.encounter,sessionId:session.id||String(timestampMs(session.startedAt)),spellCosts});
    if(selection.targetId && selection.targetId!==characterId){
      if(!talentRules(talent,rank).targetChoice || !used.effect) throw new Error('This talent cannot apply a sheet effect to another character.');
      const campaignSnapshot=await transaction.get(doc(db,'campaigns',campaignId));
      const targetRef=doc(db,'campaigns',campaignId,'characters',selection.targetId);
      const targetSnapshot=await transaction.get(targetRef);
      if(!targetSnapshot.exists()) throw new Error('Target character not found.');
      const target={id:selection.targetId,...targetSnapshot.data()}, campaign=campaignSnapshot.data();
      if(!target.ownerUid || !(campaign.playerCharacterLinks?.[selection.targetId]===target.ownerUid || campaign.characters?.[selection.targetId]?.ownerUid===target.ownerUid || (campaign.players?.[target.ownerUid]?.characterIds||[]).includes(selection.targetId))) throw new Error('Target is not linked to this campaign.');
      const privateRef=doc(db,'users',target.ownerUid,'characters',ownedCharacterSourceId(target.id,target));
      const privateSnapshot=await transaction.get(privateRef);
      if(!privateSnapshot.exists() || privateSnapshot.data().ownerUid!==target.ownerUid) throw new Error('The target’s saved character is unavailable or has a different owner.');
      const targetOriginal=structuredCloneSafe(target);
      target.talentEffects=[...(target.talentEffects||[]).filter(row=>row.id!==used.effect.id),{...used.effect,sourceCharacterId:characterId}];
      writeLiveCharacter(transaction,{campaign:targetRef,private:privateRef,privateExists:true,original:targetOriginal,encounter:refs.encounter},target);
      used.character.talentEffects=(used.character.talentEffects||[]).filter(row=>row.id!==used.effect.id);
    }
    Object.assign(character,used.character);
    appendActivity(character,{type:'talent-use',message:`Used ${talent.name} Rank ${rank}.`,costs:used.costs,bpGain:used.bpGain,restored:used.restored,choice:selection.choice||'',targetId:selection.targetId||characterId});
    return {costs:used.costs,bpGain:used.bpGain,restored:used.restored};
  }),
  endCharacterTalentEffect: (campaignId,characterId,effectId)=>talentAction(campaignId,characterId,async({character})=>{
    const effect=(character.talentEffects||[]).find(row=>row.id===effectId);
    if(!effect) throw new Error('Effect not found.');
    effect.ended=true;
    appendActivity(character,{type:'talent-end',message:`Ended ${effect.name}.`});
    return {};
  }),
  refreshCharacterTalents: (campaignId,characterId)=>talentAction(campaignId,characterId,async()=>({})),
  recordSkillSuccess: async function(campaignId,characterId,skill={}){
    if(!db || !currentUser || !campaignId || !characterId || !skill.name) return {ok:false};
    const refs=liveCharacterRefs(campaignId,characterId);
    try{
      const progress=await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const snapshot=await transaction.get(refs.campaign);
        if(!snapshot.exists()) throw new Error('Character not found.');
        const character=Object.assign({id:characterId},snapshot.data());
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
        const key=liveSlug(skill.name);
        character.skillProgress=Object.assign({},character.skillProgress||{});
        const skillSource=character.skills||character.selectedSkills||[];
        const skillRows=Array.isArray(skillSource)?skillSource:Object.entries(skillSource).map(([name,value])=>typeof value==='object'?{name,...value}:{name,rank:value});
        const known=skillRows.find(value=>liveSlug(value?.name||value?.title||value)===key);
        if(!known) throw new Error('This skill is not on the character sheet.');
        const existing=character.skillProgress[key]||{name:skill.name,rank:known.rank||known.rankName||1,successes:0};
        const next=nextSkillProgress(existing);
        character.skillProgress[key]=next;
        if(Array.isArray(character.skills)) character.skills=character.skills.map(value=>liveSlug(value?.name||value?.title||value)===key ? Object.assign(typeof value==='object'?value:{name:value},{rank:next.rank,rankName:next.rankName}) : value);
        appendActivity(character,{type:'skill-success',message:`${skill.name}: successful check${next.rankedUp?` - advanced to ${next.rankName}`:''}.`});
        writeLiveCharacter(transaction,refs,character);
        return next;
      });
      return {ok:true,progress};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  castCharacterSpell: async function(campaignId,characterId,spell={},costs={}){
    if(!db || !currentUser || !campaignId || !characterId || !spell.name) return {ok:false};
    const refs=liveCharacterRefs(campaignId,characterId);
    try{
      const result=await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const snapshot=await transaction.get(refs.campaign);
        if(!snapshot.exists()) throw new Error('Character not found.');
        const character=Object.assign({id:characterId},snapshot.data());
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
        const spellSource=character.spells||character.activeSpells||character.knownSpells||[];
        const spellRows=Array.isArray(spellSource)?spellSource:Object.entries(spellSource).map(([name,value])=>typeof value==='object'?{name,...value}:{name});
        const known=spellRows.find(value=>liveSlug(value?.name||value?.title||value)===liveSlug(spell.name));
        if(!known) throw new Error('This spell is not on the character sheet.');
        const canonical=context.catalog.find(entry=>entry.type==='spell' && liveSlug(entry.title)===liveSlug(spell.name));
        const savedCost=known.costs??known.resourceCosts??known.cost??known.manaCost??canonical?.metadata?.manaCost??canonical?.metadata?.cost;
        if(savedCost===undefined) throw new Error('Spell cost is missing from this character sheet. Ask the GM to correct it.');
        costs=parseResourceCosts(savedCost,'mp',true);
        const paid=costs;
        Object.assign(character,applyResourceChanges(character,{costs,restore:known.restoreResources || known.resourceRestoration || {}}));
        appendActivity(character,{type:'spell-cast',message:`Cast ${spell.name}.`,costs:paid});
        writeLiveCharacter(transaction,refs,character);
        return paid;
      });
      return {ok:true,paid:result};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  grantGMRewardBundle: async function(campaignId,characterId,input={}){
    if(!db || !currentUser || !campaignId || !characterId) return {ok:false,error:'Choose a linked character.'};
    const refs=liveCharacterRefs(campaignId,characterId);
    try {
      const reward=validateGMRewardPayload(input);
      const ids=reward.items.map((_,index)=>`gm-reward-${requestId}-${index}`);
      const eventRefs=ids.map(id=>doc(db,'campaigns',campaignId,'events',id));
      const currencyRef=reward.currency.amount
        ? doc(db,'campaigns',campaignId,'events',`gm-currency-${requestId}`) : null;
      const result=await runTransaction(db,async transaction=>{
        const session=await requireLiveSession(transaction,campaignId);
        const campaign=await requireCampaignGM(transaction,campaignId);
        const snapshot=await transaction.get(refs.campaign);
        if(!snapshot.exists()) throw new Error('The linked campaign character was not found.');
        const character={...snapshot.data(),id:characterId};
        if(!character.ownerUid ||
          !(campaign.playerCharacterLinks?.[characterId]===character.ownerUid ||
            campaign.characters?.[characterId]?.ownerUid===character.ownerUid ||
            (campaign.players?.[character.ownerUid]?.characterIds||[]).includes(characterId)))
          throw new Error('The recipient is not linked to this campaign.');
        // Reuse the established GM review owner-mirror guard.
        refs.original=structuredCloneSafe(character);
        refs.private=doc(db,'users',character.ownerUid,'characters',ownedCharacterSourceId(characterId,character));
        const owner=await transaction.get(refs.private);
        if(!owner.exists()||owner.data().ownerUid!==character.ownerUid)
          throw new Error('The saved character owner record is unavailable. No rewards were sent.');
        refs.privateExists=true;
        const pending=Array.isArray(character.pendingItemRewards)?structuredCloneSafe(character.pendingItemRewards):[];
        const now=new Date().toISOString();
        reward.items.forEach((source,index)=>{
          const item=normalizeMarketPricing(structuredCloneSafe(source),{legacy:true,removeLegacy:true,migratedRecord:true});
          const trueName=String(item.trueName||item.name||item.title);
          const unknown=Object.assign({},item,{
            trueName,basicName:String(item.basicName||unidentifiedItemName({...item,identified:false})),
            identified:false,
            name:String(item.basicName||unidentifiedItemName({...item,identified:false})),
            equipped:false,equippedSlot:'',location:'inventory'
          });
          pending.push({
            id:ids[index],campaignId,item:unknown,
            message:reward.message||'The GM awarded an item.',status:'pending',
            bundleName:reward.bundleName,createdAt:now
          });
          transaction.set(eventRefs[index],{
            id:ids[index],campaignId,sessionId:session.id||'',
            targetCharacterId:characterId,targetOwnerUid:character.ownerUid,
            type:'loot-reward',
            payload:{item:unknown,message:reward.message||'The GM awarded an item.',bundleName:reward.bundleName},
            status:'pending',deliveryStatus:'delivered',acknowledged:false,
            createdBy:currentUser.uid,createdAt:serverTimestamp(),resolvedAt:null
          });
        });
        if(reward.items.length)character.pendingItemRewards=pending;
        if(reward.currency.amount){
          character.coins={...(character.coins||character.coinPouch||{})};
          const key=reward.currency.key;
          const current=Number(character.coins[key]||0);
          if(!Number.isSafeInteger(current)||current<0 ||
            !Number.isSafeInteger(current+reward.currency.amount))
            throw new Error('The character currency balance is invalid or would overflow.');
          character.coins[key]=current+reward.currency.amount;
          appendActivity(character,{
            type:'gm-currency-reward',message:`GM awarded ${reward.currency.amount} ${key.replaceAll('_',' ')}.`,
            rewardId:currencyRef.id
          });
          transaction.set(currencyRef,{
            id:currencyRef.id,campaignId,sessionId:session.id||'',
            targetCharacterId:characterId,targetOwnerUid:character.ownerUid,
            type:'currency-reward',
            payload:{key,amount:reward.currency.amount,bundleName:reward.bundleName,message:reward.message},
            status:'resolved',deliveryStatus:'delivered',acknowledged:false,
            createdBy:currentUser.uid,createdAt:serverTimestamp(),resolvedAt:serverTimestamp()
          });
        }
        writeLiveCharacter(transaction,refs,character);
        return {itemEvents:ids,currencyEvent:currencyRef?.id||'',itemCount:reward.items.length,currency:reward.currency};
      });
      return {ok:true,...result};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  createCustomLootReward: async function(campaignId,characterId,source={},metadata={}){
    if(!db || !currentUser || !campaignId || !characterId) return {ok:false};
    const targetRef=doc(db,'campaigns',campaignId,'characters',characterId);
    const eventId=`loot-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
    const eventRef=doc(db,'campaigns',campaignId,'events',eventId);
    try {
      const result=await runTransaction(db,async transaction=>{
        const session=await requireLiveSession(transaction,campaignId);
        await requireCampaignGM(transaction,campaignId);
        const target=await transaction.get(targetRef);
        if(!target.exists()) throw new Error('The linked campaign character was not found.');
        const record=trustedCustomItem(source);
        const qty=Number(source.qty ?? source.quantity ?? 1);
        if(!Number.isSafeInteger(qty) || qty<1 || qty>1000000) throw new Error('Choose a valid reward quantity.');
        const full=Object.assign({},record,{qty});
        const rewardItem=Object.assign({},full,{
          trueName:full.name,
          basicName:String(full.basicName||unidentifiedItemName({...full,identified:false})),
          identified:false,
          name:String(full.basicName||unidentifiedItemName({...full,identified:false}))
        });
        const message=String(metadata.message||'The GM awarded an unidentified custom item.').slice(0,500);
        const pending=Array.isArray(target.data().pendingItemRewards)?target.data().pendingItemRewards:[];
        const reward={id:eventId,campaignId,item:rewardItem,message,status:'pending',createdAt:new Date().toISOString()};
        const event={
          id:eventId,campaignId,sessionId:session.id||'',
          targetCharacterId:characterId,targetOwnerUid:target.data().ownerUid||'',
          type:'loot-reward',payload:{item:rewardItem,message,campaignName:''},
          status:'pending',deliveryStatus:'delivered',acknowledged:false,
          createdBy:currentUser.uid,createdAt:serverTimestamp(),resolvedAt:null
        };
        // One transaction: no orphan catalog item and no undelivered GM reward.
        transaction.set(doc(db,'customItems',record.id),{...record,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
        transaction.set(targetRef,{pendingItemRewards:[...pending,reward],updatedAt:serverTimestamp()},{merge:true});
        transaction.set(eventRef,event);
        return {itemId:record.id,eventId};
      });
      return {ok:true,...result};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  updateCharacterInventory: async function(campaignId,characterId,operation={}){
    if(!db || !currentUser || !campaignId || !characterId) return {ok:false};
    const refs=liveCharacterRefs(campaignId,characterId);
    try{
      const result=await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const snapshot=await transaction.get(refs.campaign);
        if(!snapshot.exists()) throw new Error('Character not found.');
        const character=Object.assign({id:characterId},snapshot.data());
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs,true);
        const gmManagement=character.ownerUid!==currentUser.uid;
        if(gmManagement && !['equip','unequip','move-storage','set-quantity'].includes(operation.type)) throw new Error('This action is reserved for the character owner.');
        const inventory=characterInventory(character);
        character.storageLimit=Math.max(3,Number(character.storageLimit||3));
        character.storages=normalizeCharacterStorages(character);
        if(operation.type==='create-storage'){
          if(character.storages.length>=character.storageLimit) throw new Error('The GM must unlock another storage slot first.');
          const name=String(operation.name||'').trim().slice(0,80);
          if(!name) throw new Error('Enter a storage name.');
          const rows=Math.max(1,Math.min(20,Math.floor(Number(operation.rows||4))));
          const cols=Math.max(1,Math.min(20,Math.floor(Number(operation.cols||4))));
          const storage={id:`storage-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,name,order:character.storages.length,rows,cols,maxSlots:rows*cols};
          character.storages.push(storage);
          const knownStorageIds=new Set(character.storages.map(value=>String(value.id)));
          let nextSlot=0;
          inventory.filter(item=>!item.equipped&&!knownStorageIds.has(String(item.storageId||''))).forEach(item=>{
            if(nextSlot>=storage.maxSlots) return;
            item.storageId=storage.id;item.storageSlot=nextSlot;item.location='inventory';nextSlot+=1;
          });
          character.inventory=inventory;
          writeLiveCharacter(transaction,refs,character);
          return;
        }
        if(operation.type==='rename-storage'){
          const storage=character.storages.find(row=>String(row.id)===String(operation.storageId||''));
          if(!storage) throw new Error('Storage container not found.');
          const name=String(operation.name||'').trim();
          if(!name||name.length>80||Array.from(name).some(character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127)) throw new Error('Enter a storage name of 1 to 80 characters.');
          if(character.storages.some(row=>row.id!==storage.id&&String(row.name||'').trim().toLowerCase()===name.toLowerCase()))
            throw new Error('Another container already has that name.');
          if(storage.name===name) return {storageId:storage.id,name};
          storage.name=name;
          appendActivity(character,{type:'storage-renamed',message:`Renamed a storage container to ${name}.`});
          character.inventory=inventory;
          writeLiveCharacter(transaction,refs,character);
          return {storageId:storage.id,name};
        }
        if(operation.type==='reorder-storages'){
          const order=[...new Set((Array.isArray(operation.storageIds)?operation.storageIds:[]).map(String))];
          const rank=value=>{const index=order.indexOf(String(value.id));return index<0?order.length+Number(value.order||0):index;};
          character.storages.sort((left,right)=>rank(left)-rank(right)).forEach((storage,index)=>{storage.order=index;});
          character.inventory=inventory;
          writeLiveCharacter(transaction,refs,character);
          return;
        }
        if(operation.type==='create-custom-item'){
          if(gmManagement) throw new Error('Create custom inventory items for your own character.');
          const record=trustedCustomItem(operation.item || {});
          const added=placeCharacterItem(character,record,{storageId:String(operation.storageId||''),noStack:true});
          appendActivity(character,{type:'custom-item-added',message:`Created custom item ${added.name} in inventory.`});
          // Publishing and inventory delivery succeed or fail in the same transaction.
          transaction.set(doc(db,'customItems',record.id),{
            ...record,createdAt:serverTimestamp(),updatedAt:serverTimestamp()
          });
          writeLiveCharacter(transaction,refs,character);
          return {itemId:record.id};
        }
        if(operation.type==='add-item'){
          const source=structuredCloneSafe(operation.item||{});
          if(!source.name&&!source.title) throw new Error('Item data is incomplete.');
          const added=placeCharacterItem(character,source,{storageId:String(operation.storageId||'')});
          appendActivity(character,{type:'custom-item-added',message:`Added custom item ${added.name} to inventory.`});
          writeLiveCharacter(transaction,refs,character);
          return;
        }
        const item=inventory.find((value,index)=>liveItemId(value,index)===String(operation.itemId||''));
        if(!item) throw new Error('Inventory item not found.');
        if(operation.type==='split-stack'){
          if(item.equipped || item.stackable===false || item.unique===true || item.bound===true ||
             item.questItem===true || Number(item.maxStack||0)===1)
            throw new Error('This item cannot be divided into separate stacks.');
          const available=Number(item.qty);
          const quantity=Number(operation.quantity);
          if(!Number.isSafeInteger(available)||available<2||!Number.isSafeInteger(quantity)||quantity<1||quantity>=available)
            throw new Error('Choose a whole quantity smaller than the existing stack.');
          if(operation.expectedQuantity!==undefined&&Number(operation.expectedQuantity)!==available)
            throw new Error('This stack changed. Select it again before splitting.');
          const storage=character.storages.find(row=>String(row.id)===String(operation.storageId||item.storageId||''));
          if(!storage) throw new Error('Choose a valid destination container.');
          const capacity=Number(storage.maxSlots||storage.rows*storage.cols||16);
          const explicit=operation.storageSlot!==undefined&&operation.storageSlot!==null&&operation.storageSlot!=='';
          const requested=Number(operation.storageSlot);
          if(explicit&&(!Number.isInteger(requested)||requested<0||requested>=capacity))
            throw new Error('Choose a valid destination slot.');
          const slot=explicit?requested:firstFreeStorageSlot(inventory,storage);
          if(slot<0) throw new Error(`${storage.name} is full. Choose another container or free a slot.`);
          if(inventory.some(value=>!value.equipped&&String(value.storageId)===String(storage.id)&&Number(value.storageSlot)===slot))
            throw new Error('The selected destination slot is already occupied.');
          const splitId=`split-${requestId}`;
          if(inventory.some(value=>liveItemId(value)===splitId)) throw new Error('This split has already been applied.');
          const divided={...structuredCloneSafe(item),id:splitId,instanceId:splitId,qty:quantity,
            storageId:storage.id,storageSlot:slot,location:'inventory',equipped:false,equippedSlot:''};
          item.qty=available-quantity;
          inventory.push(divided);
          appendActivity(character,{type:'item-stack-split',message:`Split ${quantity} x ${item.name} into ${storage.name}.`});
          character.inventory=inventory;
          writeLiveCharacter(transaction,refs,character);
          return {itemId:splitId,quantity,remaining:item.qty,storageId:storage.id,storageSlot:slot};
        }
        if(operation.type==='set-quantity'){
          await requireCampaignGM(transaction,campaignId);
          const quantity=Number(operation.quantity);
          if(!Number.isSafeInteger(quantity)||quantity<0||quantity>1000000) throw new Error('Enter a whole quantity from 0 to 1000000.');
          if(Number(operation.expectedQuantity)!==Number(item.qty)) throw new Error('This stack changed. Reopen the item before adjusting it.');
          item.qty=quantity;
          if(character.equipment) for(const [slot,equipped] of Object.entries(character.equipment)) if(equipped?.id===item.id) {
            if(quantity===0) delete character.equipment[slot]; else character.equipment[slot]={...equipped,qty:quantity};
          }
          if(quantity===0 && Array.isArray(character.quickSlots)) character.quickSlots=character.quickSlots.map(slot=>(slot===item.id || slot?.itemId===item.id)?null:slot);
          appendActivity(character,{type:'inventory-adjusted',message:`GM changed ${item.name} quantity to ${quantity}.`});
        }else if(operation.type==='equip'){
          const slot=String(operation.slot||item.slot||item.allowedSlots?.[0]||'').trim();
          equipCharacterInventoryItem(character,liveItemId(item),slot);
          appendActivity(character,{type:'item-equipped',message:`Equipped ${item.name} in ${slot}.`});
          writeLiveCharacter(transaction,refs,character);
          return;
        }else if(operation.type==='unequip'){
          const slot=item.equippedSlot||item.slot;
          item.equipped=false;item.equippedSlot='';item.location='inventory';
          if(slot&&character.equipment) delete character.equipment[slot];
          appendActivity(character,{type:'item-unequipped',message:`Unequipped ${item.name}.`});
        }else if(operation.type==='quick'){
          const index=Math.max(0,Math.min(3,Number(operation.index||0)));
          character.quickSlots=Array.isArray(character.quickSlots)?character.quickSlots.slice(0,4):[];
          while(character.quickSlots.length<4) character.quickSlots.push(null);
          character.quickSlots[index]=item;
          appendActivity(character,{type:'quick-slot',message:`Assigned ${item.name} to Quick Slot ${index+1}.`});
        }else if(operation.type==='use'){
          const effect=item.effect||item.effects||{};
          const parsed=effect.resource ? {[String(effect.resource).toLowerCase()]:Number(effect.amount||0)} : parseResourceCost(effect);
          const changes=Object.entries(parsed).filter(([,amount])=>Number(amount)>0);
          if(!changes.length) throw new Error('This item does not have a usable resource effect.');
          Object.assign(character,applyResourceChanges(character,{restore:Object.fromEntries(changes)}));
          item.qty=Math.max(0,Number(item.qty||1)-1);
          appendActivity(character,{type:'item-used',message:`Used ${item.name}: ${changes.map(([resource,amount])=>`+${amount} ${resource.toUpperCase()}`).join(', ')}.`});
        }else if(operation.type==='move-storage'){
          if(item.equipped) throw new Error('Unequip this item before moving it between containers.');
          const storage=character.storages.find(value=>String(value.id)===String(operation.storageId||''));
          if(!storage) throw new Error('Destination container not found.');
          if(operation.expectedStorageId!==undefined&&String(operation.expectedStorageId)!==String(item.storageId||''))
            throw new Error('This item has moved since you selected it. Select it again.');
          if(operation.expectedStorageSlot!==undefined&&Number(operation.expectedStorageSlot)!==Number(item.storageSlot))
            throw new Error('The item position has changed. Select it again.');
          const explicit=operation.storageSlot!==undefined&&operation.storageSlot!==null&&operation.storageSlot!=='';
          const requested=Number(operation.storageSlot);
          const capacity=Number(storage.maxSlots||storage.rows*storage.cols||16);
          if(explicit&&(!Number.isInteger(requested)||requested<0||requested>=capacity))
            throw new Error('Choose a valid storage grid slot.');
          const slot=explicit?requested:firstFreeStorageSlot(inventory,storage,item.id);
          if(slot<0) throw new Error(`${storage.name} is full. Choose another container or swap two occupied slots.`);
          if(String(item.storageId)===String(storage.id)&&Number(item.storageSlot)===slot) return {unchanged:true};
          const occupied=inventory.filter(value=>!value.equipped&&liveItemId(value)!==liveItemId(item)&&
            String(value.storageId)===String(storage.id)&&Number(value.storageSlot)===slot);
          if(occupied.length>1) throw new Error('The destination contains overlapping items. Resolve the overflow before moving items here.');
          if(occupied.length){
            const source=character.storages.find(value=>String(value.id)===String(item.storageId||''));
            const sourceSlot=item.storageSlot===null||item.storageSlot===undefined?NaN:Number(item.storageSlot);
            const sourceCapacity=Number(source?.maxSlots||source?.rows*source?.cols||0);
            if(!source||!Number.isInteger(sourceSlot)||sourceSlot<0||sourceSlot>=sourceCapacity ||
              inventory.some(value=>!value.equipped&&liveItemId(value)!==liveItemId(item)&&
                String(value.storageId)===String(source.id)&&Number(value.storageSlot)===sourceSlot))
              throw new Error('This item has no free, valid source position for a swap. Move it to an empty slot instead.');
            occupied[0].storageId=source.id;
            occupied[0].storageSlot=sourceSlot;
            occupied[0].location='inventory';
          }
          item.storageId=storage.id;item.storageSlot=slot;item.location='inventory';
          appendActivity(character,{type:occupied.length?'item-storage-swapped':'item-stored',
            message:occupied.length?`Swapped ${item.name} with ${occupied[0].name} between storage slots.`:`Moved ${item.name} to ${storage.name}.`});
        }else if(operation.type==='identify'){
          if(item.identified!==false) throw new Error('This item is already identified.');
          if(!characterKnowsIdentify(character)) throw new Error('This character does not know the Identify spell.');
          item.identified=true;item.name=item.trueName||item.name;item.identifiedAt=new Date().toISOString();item.identifiedBy=characterId;
          appendActivity(character,{type:'item-identified',message:`Identified ${item.name}.`});
        }else if(operation.type==='read-spellbook'){
          if(item.identified===false) throw new Error('Identify this spellbook before reading it.');
          if(!item.isSpellbook&&!item.spell) throw new Error('This item is not a spellbook.');
          const spell=structuredCloneSafe(item.spell||item.spellData||{});
          spell.name=spell.name||item.spellName||item.trueName||item.name;
          if(!spell.name) throw new Error('This spellbook has no linked spell.');
          const known=Array.isArray(character.spells)?character.spells:[];
          if(known.some(value=>liveSlug(value?.name||value?.title||value)===liveSlug(spell.name))) throw new Error(`${spell.name} is already known.`);
          character.spells=[...known,spell];
          item.qty=Math.max(0,Number(item.qty||1)-1);
          appendActivity(character,{type:'spell-learned',message:`Learned ${spell.name} from a spellbook.`});
        }else throw new Error('Unsupported inventory action.');
        character.inventory=inventory.filter(value=>Number(value.qty??1)>0);
        writeLiveCharacter(transaction,refs,character);
      });
      return {ok:true,...(result||{})};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  buyLiveShopItem: async function(campaignId,characterId,shopId,stockIndex,quantity=1,quote={}){
    const refs=liveCharacterRefs(campaignId,characterId);
    const shopRef=doc(db,'campaigns',campaignId,'shops',String(shopId));
    try{
      const result=await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const characterSnapshot=await transaction.get(refs.campaign);
        const shopSnapshot=await transaction.get(shopRef);
        if(!characterSnapshot.exists()||!shopSnapshot.exists()) throw new Error('Shop data is not available.');
        const character=Object.assign({id:characterId},characterSnapshot.data());
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
        const shop=structuredCloneSafe(shopSnapshot.data());
        if(shop.deleted)throw new Error('This shop is closed.');
        const stock=shop?.stock?.[Number(stockIndex)];
        if(!shop||!stock||shop.status!=='open') throw new Error('This shop is not open.');
        if(Array.isArray(shop.visitorCharacterIds)&&shop.visitorCharacterIds.length&&!shop.visitorCharacterIds.includes(characterId)) throw new Error('This character is not visiting the shop.');
        if(!Number.isSafeInteger(Number(quantity)) || Number(quantity)<1) throw new Error('Choose a whole item quantity.');
        if(Number(stock.qty||0)<1) throw new Error('This item is out of stock.');
        if(Number(quantity)>Number(stock.qty)) throw new Error('Not enough shop stock for the requested quantity.');
        const qty=Number(quantity);
        const item=normalizeMarketPricing(Object.assign({},structuredCloneSafe(stock.item||{}),{qty,location:'inventory',equipped:false}),{legacy:true,removeLegacy:true,migratedRecord:true});
        item.name=item.name||item.title||'Shop Item';
        const unitCost=merchantPriceCopper(shop,item,'buy');
        if(quote.variantKey && quote.variantKey!==shopVariantKey(stock.item)) throw new Error('The selected shop item changed. Review the offer again.');
        if(quote.unitPriceCopper!==undefined && Number(quote.unitPriceCopper)!==unitCost) throw new Error('The merchant price changed. Review the new price before buying.');
        if(unitCost===null) throw new Error(`${item.name} needs a Market Price before it can be sold.`);
        if(unitCost===0&&marketPricingStatus(item).id==='not-tradeable') throw new Error(`${item.name} is not normally tradeable.`);
        const cost=unitCost*qty;
        if(!Number.isSafeInteger(cost)||cost<0) throw new Error('Purchase total is outside the supported range.');
        const total=currencyTotal(character);
        if(total<cost) throw new Error('Not enough currency.');
        const received=placeCharacterItem(character,item,{});
        setCurrencyTotal(character,total-cost);
        stock.qty=Number(stock.qty||0)-qty;
        shop.currencyCopper=Number(shop.currencyCopper||0)+cost;
        appendActivity(character,{type:'shop-purchase',message:`Purchased ${qty} x ${item.name} for ${cost} copper.`});
        writeLiveCharacter(transaction,refs,character);
        transaction.set(shopRef,{...shop,updatedBy:currentUser.uid,updatedAt:serverTimestamp()});
        return {item:received,cost,quantity:qty,unitPriceCopper:unitCost};
      });
      return {ok:true,...result};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  sellLiveShopItem: async function(campaignId,characterId,shopId,itemId,quantity=1,quote={}){
    const refs=liveCharacterRefs(campaignId,characterId);
    const shopRef=doc(db,'campaigns',campaignId,'shops',String(shopId));
    try{
      const result=await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const characterSnapshot=await transaction.get(refs.campaign);
        const shopSnapshot=await transaction.get(shopRef);
        if(!characterSnapshot.exists()||!shopSnapshot.exists()) throw new Error('Shop data is not available.');
        const character=Object.assign({id:characterId},characterSnapshot.data());
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
        const shop=structuredCloneSafe(shopSnapshot.data());
        if(shop.deleted)throw new Error('This shop is closed.');
        const inventory=characterInventory(character);
        const item=inventory.find((value,index)=>liveItemId(value,index)===String(itemId));
        if(!shop||shop.status!=='open'||!item) throw new Error('The shop or item is unavailable.');
        if(Array.isArray(shop.visitorCharacterIds)&&shop.visitorCharacterIds.length&&!shop.visitorCharacterIds.includes(characterId)) throw new Error('This character is not visiting the shop.');
        if(!Number.isSafeInteger(Number(quantity))||Number(quantity)<1||Number(quantity)>Number(item.qty||0)) throw new Error('Choose a quantity available in your inventory.');
        const qty=Number(quantity);
        if(item.equipped||item.locked||item.bound||item.questItem) throw new Error('This item cannot be sold.');
        const unitValue=merchantPriceCopper(shop,item,'sell');
        if(quote.variantKey && quote.variantKey!==shopVariantKey(item)) throw new Error('This inventory item changed. Review the sale again.');
        if(quote.unitPriceCopper!==undefined && Number(quote.unitPriceCopper)!==unitValue) throw new Error('The merchant offer changed. Review the new price before selling.');
        const value=unitValue*qty;
        if(!Number.isSafeInteger(value)||value<0) throw new Error('Sale total is outside the supported range.');
        if(value===0) throw new Error(`${item.name} has no Market Value and cannot normally be sold.`);
        if(Number(shop.currencyCopper??Infinity)<value) throw new Error('The merchant cannot afford this item.');
        const stockItem=Object.assign({},structuredCloneSafe(item),{qty:1,equipped:false,equippedSlot:'',location:'shop'});
        // Do not expose the seller's private inventory position or ownership
        // through the campaign-visible merchant stock projection.
        delete stockItem.ownerUid;
        delete stockItem.storageId;
        delete stockItem.storageSlot;
        delete stockItem.bagId;
        delete stockItem.bagSlot;
        delete stockItem.instanceId;
        item.qty=Number(item.qty||1)-qty;
        character.inventory=inventory.filter(record=>Number(record.qty??1)>0);
        setCurrencyTotal(character,currencyTotal(character)+value);
        shop.currencyCopper=Number(shop.currencyCopper||0)-value;
        shop.stock=Array.isArray(shop.stock)?shop.stock:[];
        const existing=shop.stock.find(row=>shopStockCompatible(row.item,stockItem));
        if(existing) existing.qty=Number(existing.qty||0)+qty;
        else shop.stock.push({item:stockItem,qty,priceCopper:merchantPriceCopper(shop,stockItem,'buy')});
        appendActivity(character,{type:'shop-sale',message:`Sold ${qty} x ${item.name} for ${value} copper.`});
        writeLiveCharacter(transaction,refs,character);
        transaction.set(shopRef,{...shop,updatedBy:currentUser.uid,updatedAt:serverTimestamp()});
        return {value,quantity:qty,unitPriceCopper:unitValue};
      });
      return {ok:true,...result};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  createLiveItemRequest: async function(campaignId,characterId,recipientId,itemId,mode='give',details={}){
    if(!db||!currentUser||!campaignId||!characterId||!recipientId) return {ok:false};
    const refs=liveCharacterRefs(campaignId,characterId);
    const id=`item-request-${currentUser.uid}-${requestId}`;
    const requestRef=itemRequestRef(campaignId,id);
    const recipientRef=doc(db,'campaigns',campaignId,'characters',recipientId);
    try{
      const request=await runTransaction(db,async transaction=>{
        const session=await requireLiveSession(transaction,campaignId);
        const [characterSnapshot,recipientSnapshot,requestSnapshot]=await Promise.all([transaction.get(refs.campaign),transaction.get(recipientRef),transaction.get(requestRef)]);
        if(requestSnapshot.exists()) throw new Error('Item request already exists. Use the original result.');
        if(!characterSnapshot.exists()||!recipientSnapshot.exists()) throw new Error('One of the linked characters is unavailable.');
        if(String(characterId)===String(recipientId)) throw new Error('Choose another linked character.');
        const character=Object.assign({id:characterId},characterSnapshot.data());
        const recipient=Object.assign({id:recipientId},recipientSnapshot.data());
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
        const inventory=characterInventory(character);
        const item=inventory.find((value,index)=>liveItemId(value,index)===String(itemId));
        const quantity=Math.max(1,Math.min(Number(details.quantity||1),Number(item?.qty||0)));
        if(!item||Number(item.qty||0)<1||item.equipped||item.locked||item.bound||item.questItem||!quantity) throw new Error('This item cannot be offered.');
        const action=['trade','sell','give','identify'].includes(mode)?mode:'give';
        if(action==='identify'&&item.identified!==false) throw new Error('Only unidentified items can be sent for identification.');
        const snapshot=Object.assign({},structuredCloneSafe(item),{sourceItemId:liveItemId(item),qty:action==='identify'?1:quantity,equipped:false,equippedSlot:'',location:action==='identify'?'inventory':'player-request-escrow'});
        if(action!=='identify') item.qty=Number(item.qty||1)-quantity;
        character.inventory=inventory.filter(value=>Number(value.qty??1)>0);
        if(!recipient.ownerUid) throw new Error('The recipient must have a linked owner.');
        const row={id,version:2,sessionId:session.id,mode:action,fromCharacterId:characterId,fromCharacterName:character.name||'Party Member',fromOwnerUid:character.ownerUid||currentUser.uid,toCharacterId:recipientId,toCharacterName:recipient.name||'Party Member',toOwnerUid:recipient.ownerUid||'',item:snapshot,quantity:snapshot.qty,note:String(details.note||'').slice(0,1000),priceCopper:Math.max(0,Math.floor(Number(details.priceCopper||0))),requestedItem:String(details.requestedItem||'').slice(0,200),status:'pending',recipientNotice:'unread',senderNotice:'waiting',createdAt:new Date().toISOString(),createdBy:currentUser.uid};
        appendActivity(character,{type:`item-${action}-requested`,message:`Sent ${recipient.name||'a party member'} a ${action} request for ${snapshot.name}.`});
        writeLiveCharacter(transaction,refs,character);
        transaction.set(requestRef,row);
        return row;
      });
      return {ok:true,request,offer:request};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  respondLiveItemRequest: async function(campaignId,characterId,requestId,accepted,details={}){
    if(!db||!currentUser||!campaignId||!characterId||!requestId) return {ok:false};
    const requestRef=itemRequestRef(campaignId,requestId);
    const recipientRef=doc(db,'campaigns',campaignId,'characters',characterId);
    try{
      const result=await runTransaction(db,async transaction=>{
        // Declining and returning escrow is always permitted, even between sessions.
        if(accepted) await requireLiveSession(transaction,campaignId);
        const request=requirePrivateItemRequest(await transaction.get(requestRef),requestId);
        if(!request||request.status!=='pending'||String(request.toCharacterId)!==String(characterId)) throw new Error('This item request is no longer pending for this character.');
        const senderRef=doc(db,'campaigns',campaignId,'characters',request.fromCharacterId);
        const [recipientSnapshot,senderSnapshot]=await Promise.all([transaction.get(recipientRef),transaction.get(senderRef)]);
        if(!recipientSnapshot.exists()||!senderSnapshot.exists()) throw new Error('One of the linked characters is unavailable.');
        const recipient=Object.assign({id:characterId},recipientSnapshot.data());
        const sender=Object.assign({id:request.fromCharacterId},senderSnapshot.data());
        if(String(request.fromOwnerUid||'')!==String(sender.ownerUid||'') ||
           String(request.toOwnerUid||'')!==String(recipient.ownerUid||''))
          throw new Error('One of the trade participants has changed ownership.');
        const recipientRefs={campaign:recipientRef,private:doc(db,'users',currentUser.uid,'characters',characterId)};
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,recipient,recipientRefs);
        const senderRefs={campaign:senderRef};
        await verifyLiveTradeCounterparty(transaction,campaignId,request.fromCharacterId,sender,senderRefs);
        let revealedItem=null;
        let receivedItem=null;
        let exchangeItem=null;
        if(accepted&&request.mode==='identify'){
          if(!characterKnowsIdentify(recipient)) throw new Error('This character does not know the Identify spell.');
          const senderInventory=characterInventory(sender);
          const original=senderInventory.find(value=>liveItemId(value)===String(request.item?.sourceItemId||liveItemId(request.item)));
          if(!original) throw new Error('The item is no longer available to identify.');
          original.identified=true;original.name=original.trueName||original.name;original.identifiedAt=new Date().toISOString();original.identifiedBy=characterId;
          sender.inventory=senderInventory;
          revealedItem=structuredCloneSafe(original);
          appendActivity(sender,{type:'item-identified',message:`${recipient.name||'A party member'} identified ${original.name}.`});
        }else if(accepted){
          if(request.mode==='sell'){
            const price=Math.max(0,Number(request.priceCopper||0));
            if(currencyTotal(recipient)<price) throw new Error('Not enough currency for this purchase.');
            setCurrencyTotal(recipient,currencyTotal(recipient)-price);setCurrencyTotal(sender,currencyTotal(sender)+price);
          }
          if(request.mode==='trade'){
            const recipientInventory=characterInventory(recipient);
            const exchange=recipientInventory.find((value,index)=>liveItemId(value,index)===String(details.exchangeItemId||''));
            if(!exchange||exchange.equipped||exchange.locked||exchange.bound||exchange.questItem) throw new Error('Choose an available item to trade.');
            const exchangeQuantity=Math.max(1,Math.min(Number(details.exchangeQuantity||1),Number(exchange.qty||1)));
            exchangeItem=Object.assign({},structuredCloneSafe(exchange),{sourceItemId:liveItemId(exchange),qty:exchangeQuantity,equipped:false,equippedSlot:'',location:'player-request-escrow'});
            exchange.qty=Math.max(0,Number(exchange.qty||1)-exchangeQuantity);
            recipient.inventory=recipientInventory.filter(value=>Number(value.qty??1)>0);
            request.exchangeItem=exchangeItem;
            request.recipientStorageId=String(details.storageId||'');
            request.status='awaiting-sender';request.recipientNotice='acknowledged';request.senderNotice='unread';request.recipientReadyAt=new Date().toISOString();request.recipientReadyBy=currentUser.uid;
            appendActivity(recipient,{type:'item-trade-ready',message:`Confirmed an exchange offer for ${request.item?.name||'an item'}.`});
            writeLiveCharacter(transaction,recipientRefs,recipient);
            transaction.set(requestRef,request);
            return {awaitingSender:true};
          }
          receivedItem=placeCharacterItem(recipient,request.item,{storageId:details.storageId||''});
          appendActivity(recipient,{type:`item-${request.mode}-accepted`,message:`Accepted ${receivedItem.name} from ${sender.name||'a party member'}.`});
        }else if(request.mode!=='identify'){
          const restored=restoreEscrowItem(sender,request.item,request.id);
          request.returnedToOverflow=restored.overflow;
        }
        request.status=accepted?'accepted':'declined';request.recipientNotice='acknowledged';request.senderNotice='unread';request.resolvedAt=new Date().toISOString();request.resolvedBy=currentUser.uid;
        request.resolution={accepted:Boolean(accepted),receivedItem:receivedItem?{name:receivedItem.name,qty:receivedItem.qty}:null,exchangeItem:exchangeItem?{name:exchangeItem.name,qty:exchangeItem.qty}:null,revealedItem:revealedItem?{name:revealedItem.name,rarity:revealedItem.rarity}:null,priceCopper:request.mode==='sell'?Number(request.priceCopper||0):0};
        writeLiveCharacter(transaction,senderRefs,sender);
        writeLiveCharacter(transaction,recipientRefs,recipient);
        transaction.set(requestRef,request);
        return {revealedItem};
      });
      return {ok:true,...result};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  finalizeLiveItemTrade: async function(campaignId,characterId,requestId,accepted){
    if(!db||!currentUser||!campaignId||!characterId||!requestId) return {ok:false};
    const senderRefs=liveCharacterRefs(campaignId,characterId);
    const requestRef=itemRequestRef(campaignId,requestId);
    try{
      await runTransaction(db,async transaction=>{
        // Rejecting the counteroffer must remain possible after the GM ends a session.
        if(accepted) await requireLiveSession(transaction,campaignId);
        const [requestSnapshot,senderSnapshot]=await Promise.all([transaction.get(requestRef),transaction.get(senderRefs.campaign)]);
        if(!senderSnapshot.exists()) throw new Error('Character not found.');
        const request=requirePrivateItemRequest(requestSnapshot,requestId);
        if(!request||request.status!=='awaiting-sender'||String(request.fromCharacterId)!==String(characterId)) throw new Error('This trade is no longer awaiting your confirmation.');
        const recipientRef=doc(db,'campaigns',campaignId,'characters',request.toCharacterId);
        const recipientSnapshot=await transaction.get(recipientRef);
        if(!recipientSnapshot.exists()) throw new Error('The other linked character is unavailable.');
        const sender=Object.assign({id:characterId},senderSnapshot.data());
        const recipient=Object.assign({id:request.toCharacterId},recipientSnapshot.data());
        if(String(request.fromOwnerUid||'')!==String(sender.ownerUid||'') ||
           String(request.toOwnerUid||'')!==String(recipient.ownerUid||''))
          throw new Error('One of the trade participants has changed ownership.');
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,sender,senderRefs);
        const recipientRefs={campaign:recipientRef};
        await verifyLiveTradeCounterparty(transaction,campaignId,request.toCharacterId,recipient,recipientRefs);
        let senderReceived=null;let recipientReceived=null;
        if(accepted){
          senderReceived=placeCharacterItem(sender,request.exchangeItem,{});
          recipientReceived=placeCharacterItem(recipient,request.item,{storageId:request.recipientStorageId||''});
          appendActivity(sender,{type:'item-trade-completed',message:`Completed a trade with ${recipient.name||'a party member'}.`});
          appendActivity(recipient,{type:'item-trade-completed',message:`Completed a trade with ${sender.name||'a party member'}.`});
        }else{
          const first=restoreEscrowItem(sender,request.item,request.id+'-sender');
          const second=restoreEscrowItem(recipient,request.exchangeItem,request.id+'-recipient');
          request.returnedToOverflow=first.overflow||second.overflow;
          appendActivity(sender,{type:'item-trade-declined',message:`Declined the final trade with ${recipient.name||'a party member'}.`});
          appendActivity(recipient,{type:'item-trade-declined',message:`${sender.name||'The other player'} declined the final trade.`});
        }
        request.status=accepted?'accepted':'declined';request.senderNotice='acknowledged';request.recipientNotice='unread';request.resolvedAt=new Date().toISOString();request.resolvedBy=currentUser.uid;
        request.resolution={accepted:Boolean(accepted),receivedItem:recipientReceived?{name:recipientReceived.name,qty:recipientReceived.qty}:null,exchangeItem:senderReceived?{name:senderReceived.name,qty:senderReceived.qty}:null};
        writeLiveCharacter(transaction,senderRefs,sender);
        writeLiveCharacter(transaction,recipientRefs,recipient);
        transaction.set(requestRef,request);
      });
      return {ok:true};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  cancelLiveItemRequest: async function(campaignId,characterId,requestId){
    if(!db||!currentUser||!campaignId||!characterId||!requestId) return {ok:false};
    const requestRef=itemRequestRef(campaignId,requestId);
    try{
      const result=await runTransaction(db,async transaction=>{
        // Recovery is available even when a campaign session is paused, ended or expired.
        const request=requirePrivateItemRequest(await transaction.get(requestRef),requestId);
        const pending=request.status==='pending';
        const awaiting=request.status==='awaiting-sender'&&request.mode==='trade';
        if(!pending&&!awaiting) throw new Error('This request is no longer open.');
        const isSender=String(request.fromCharacterId)===String(characterId);
        const isRecipient=String(request.toCharacterId)===String(characterId);
        if((!isSender&&!isRecipient)||(pending&&!isSender))
          throw new Error('Only the sender can withdraw a pending request. Either participant can withdraw a counteroffer.');
        const senderRef=doc(db,'campaigns',campaignId,'characters',request.fromCharacterId);
        const recipientRef=doc(db,'campaigns',campaignId,'characters',request.toCharacterId);
        const [senderSnapshot,recipientSnapshot]=await Promise.all([
          transaction.get(senderRef),transaction.get(recipientRef)
        ]);
        if(!senderSnapshot.exists()||!recipientSnapshot.exists())
          throw new Error('Both linked characters must be available to return escrow.');
        const sender={id:request.fromCharacterId,...senderSnapshot.data()};
        const recipient={id:request.toCharacterId,...recipientSnapshot.data()};
        if(String(request.fromOwnerUid||'')!==String(sender.ownerUid||'')||
           String(request.toOwnerUid||'')!==String(recipient.ownerUid||''))
          throw new Error('A trade participant has changed ownership. Contact the GM to recover escrow.');
        const own=isSender?sender:recipient;
        const ownRefs={campaign:isSender?senderRef:recipientRef};
        const other=isSender?recipient:sender;
        const otherRefs={campaign:isSender?recipientRef:senderRef};
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,own,ownRefs);
        await verifyLiveTradeCounterparty(transaction,campaignId,other.id,other,otherRefs);
        let returnedToOverflow=false;
        if(request.mode!=='identify'){
          const original=restoreEscrowItem(sender,request.item,request.id+'-sender');
          returnedToOverflow=original.overflow;
        }
        if(awaiting){
          if(!request.exchangeItem) throw new Error('The offered exchange item is missing.');
          const exchange=restoreEscrowItem(recipient,request.exchangeItem,request.id+'-recipient');
          returnedToOverflow=returnedToOverflow||exchange.overflow;
        }
        request.status='cancelled';
        request.senderNotice=isSender?'acknowledged':'unread';
        request.recipientNotice=isRecipient?'acknowledged':'unread';
        request.resolvedAt=new Date().toISOString();
        request.resolvedBy=currentUser.uid;
        request.resolution={accepted:false,cancelled:true,escrowReturned:true,
          receivedItem:null,exchangeItem:null,priceCopper:0};
        request.returnedToOverflow=returnedToOverflow;
        appendActivity(own,{type:'item-request-cancelled',
          message:`Withdrew the ${request.mode} request for ${request.item?.name||'an item'}; escrow returned.`});
        const senderRefs=isSender?ownRefs:otherRefs;
        const recipientRefs=isRecipient?ownRefs:otherRefs;
        writeLiveCharacter(transaction,senderRefs,sender);
        writeLiveCharacter(transaction,recipientRefs,recipient);
        transaction.set(requestRef,request);
        return {cancelled:true,escrowReturned:true,returnedToOverflow};
      });
      return {ok:true,...result};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  acknowledgeLiveItemRequest: async function(campaignId,characterId,requestId){
    if(!db||!currentUser||!campaignId||!characterId||!requestId) return {ok:false};
    const refs=liveCharacterRefs(campaignId,characterId);
    const requestRef=itemRequestRef(campaignId,requestId);
    try{
      await runTransaction(db,async transaction=>{
        const [requestSnapshot,characterSnapshot]=await Promise.all([transaction.get(requestRef),transaction.get(refs.campaign)]);
        if(!characterSnapshot.exists()) throw new Error('Character not found.');
        const request=requirePrivateItemRequest(requestSnapshot,requestId);
        if(!request||request.status==='pending'||String(request.fromCharacterId)!==String(characterId)) throw new Error('This result cannot be acknowledged.');
        const character=Object.assign({id:characterId},characterSnapshot.data());
        if(String(request.fromOwnerUid||'')!==String(character.ownerUid||'')) throw new Error('The item request owner has changed.');
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
        request.senderNotice='acknowledged';request.senderAcknowledgedAt=new Date().toISOString();request.senderAcknowledgedBy=currentUser.uid;
        // New item transactions already mirror both owners immediately.
        // For historic requests, repair only gameplay fields when the owner's
        // stored revision is not newer than the campaign revision.
        repairLegacyTradeMirror(transaction,refs,character);
        transaction.set(requestRef,request);
      });
      return {ok:true};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  acknowledgeLiveItemRecipientUpdate: async function(campaignId,characterId,requestId){
    if(!db||!currentUser||!campaignId||!characterId||!requestId) return {ok:false};
    const refs=liveCharacterRefs(campaignId,characterId);
    const requestRef=itemRequestRef(campaignId,requestId);
    try{
      await runTransaction(db,async transaction=>{
        const [requestSnapshot,characterSnapshot]=await Promise.all([transaction.get(requestRef),transaction.get(refs.campaign)]);
        if(!characterSnapshot.exists()) throw new Error('Character not found.');
        const request=requirePrivateItemRequest(requestSnapshot,requestId);
        if(!request||!['accepted','declined','cancelled'].includes(request.status)||String(request.toCharacterId)!==String(characterId)) throw new Error('This recipient update cannot be acknowledged.');
        const character=Object.assign({id:characterId},characterSnapshot.data());
        if(String(request.toOwnerUid||'')!==String(character.ownerUid||'')) throw new Error('The item request owner has changed.');
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
        request.recipientNotice='acknowledged';request.recipientAcknowledgedAt=new Date().toISOString();request.recipientAcknowledgedBy=currentUser.uid;
        // New item transactions already mirror both owners immediately.
        // For historic requests, repair only gameplay fields when the owner's
        // stored revision is not newer than the campaign revision.
        repairLegacyTradeMirror(transaction,refs,character);
        transaction.set(requestRef,request);
      });
      return {ok:true};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  updateCharacterQuest: async function(campaignId,characterId,questId,status){
    return mutateQuest(campaignId,characterId,questId,quest=>changeQuestStatus(quest,status,{uid:currentUser.uid}),{award:status==='Completed'});
  },
  updateQuestProgress: async function(campaignId,characterId,questId,patch){
    return mutateQuest(campaignId,characterId,questId,quest=>changeQuestProgress(quest,patch));
  },
  reviewCharacterQuest: async function(campaignId,characterId,questId,status,note=''){
    if(!['Completed','Failed','Active','On Hold'].includes(status)) return {ok:false,error:'Choose a valid review outcome.'};
    return mutateQuest(campaignId,characterId,questId,quest=>changeQuestStatus(quest,status,{gm:true,uid:currentUser.uid,note}),{gm:true,note,award:status==='Completed'});
  },
  resolveLootReward: async function(campaignId,characterId,eventId,action='inventory',destination=''){
    if(!db || !currentUser || !campaignId || !characterId || !eventId) return {ok:false};
    const refs=liveCharacterRefs(campaignId,characterId);
    const eventRef=doc(db,'campaigns',campaignId,'events',eventId);
    try{
      if(!['inventory','equip','declined'].includes(action)) throw new Error('Choose a valid reward action.');
      const result=await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const eventSnapshot=await transaction.get(eventRef);
        const characterSnapshot=await transaction.get(refs.campaign);
        if(!eventSnapshot.exists() || !characterSnapshot.exists()) throw new Error('This loot reward is no longer available.');
        const event=eventSnapshot.data();
        const character=Object.assign({id:characterId},characterSnapshot.data());
        if(event.type!=='loot-reward'||event.targetCharacterId!==characterId||event.targetOwnerUid!==currentUser.uid)
          throw new Error('This reward is not assigned to this character.');
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
        if(event.resolvedAt||['accepted','equipped','declined','resolved'].includes(String(event.status||'').toLowerCase()))
          return {applied:false};
        const pending=Array.isArray(character.pendingItemRewards)?character.pendingItemRewards:[];
        if(action!=='declined'){
          const source=structuredCloneSafe(event.payload?.item||{});
          if(!source.name&&!source.title) throw new Error('The reward item is missing its name.');
          const quantity=Number(source.qty??source.quantity??1);
          if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1000000)
            throw new Error('The reward has an invalid quantity.');
          const item=normalizeMarketPricing({...source,qty:quantity},{legacy:true,removeLegacy:true,migratedRecord:true});
          item.name=item.name||item.title;
          item.equipped=false;item.equippedSlot='';item.location='inventory';
          character.storageLimit=Math.max(3,Number(character.storageLimit||3));
          character.storages=normalizeCharacterStorages(character);
          if(action==='equip'){
            if(quantity!==1) throw new Error('Store multiple reward items before equipping one.');
            const received=stageDirectEquipReward(character,item,eventId);
            equipCharacterInventoryItem(character,received.id,destination,{reward:true});
          }else{
            const storage=character.storages.find(value=>String(value.id)===String(destination||''));
            if(!storage) throw new Error('Choose an existing inventory storage container.');
            placeCharacterItem(character,item,{storageId:storage.id});
          }
          appendActivity(character,{type:'loot-received',message:`Received ${item.name}${action==='equip'?' and equipped it':''}.`});
        }
        character.pendingItemRewards=pending.filter(value=>String(value?.id||'')!==String(eventId));
        character.resolvedItemRewardIds=uniqueValues(character.resolvedItemRewardIds,[eventId]);
        writeLiveCharacter(transaction,refs,character);
        transaction.set(eventRef,{
          status:action==='declined'?'declined':action==='equip'?'equipped':'accepted',
          deliveryStatus:'acknowledged',acknowledged:true,acknowledgedBy:currentUser.uid,
          acknowledgedAt:serverTimestamp(),resolvedAt:serverTimestamp(),updatedAt:serverTimestamp()
        },{merge:true});
        return {applied:true};
      });
      return {ok:true,applied:result.applied};
    }catch(error){return {ok:false,applied:false,error:error.message||String(error)};}
  },
  respondMagicElementReward: async function(campaignId, characterId, eventId, accepted){
    if(!db || !currentUser || !campaignId || !characterId || !eventId) return { ok:false };
    const characterRef=doc(db, 'campaigns', campaignId, 'characters', characterId);
    const eventRef=doc(db, 'campaigns', campaignId, 'events', eventId);
    try{
      const result=await runTransaction(db, async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const eventSnapshot=await transaction.get(eventRef);
        const characterSnapshot=await transaction.get(characterRef);
        if(!eventSnapshot.exists() || !characterSnapshot.exists()) throw new Error('The magic reward is no longer available.');
        const reward=eventSnapshot.data();
        const character=Object.assign({ id:characterId }, characterSnapshot.data());
        if(reward.type !== 'magic-element-reward' || reward.targetCharacterId !== characterId || reward.targetOwnerUid !== currentUser.uid) throw new Error('This magic reward is not assigned to this character.');
        if(reward.resolvedAt || ['accepted','declined','resolved'].includes(String(reward.status || '').toLowerCase())) return { applied:false, character };
        const magicType=String(reward.payload?.magicType || '').trim();
        const granted=accepted ? addGrantedMagicElement(character,magicType) : {character,added:false};
        if(accepted){
          const refs={campaign:characterRef,private:doc(db,'users',currentUser.uid,'characters',ownedCharacterSourceId(characterId,character)),verifiedOwner:true};
          writeLiveCharacter(transaction,refs,granted.character);
        }
        transaction.set(eventRef, {
          status:accepted ? 'accepted' : 'declined',
          deliveryStatus:'acknowledged',
          acknowledged:true,
          acknowledgedBy:currentUser.uid,
          acknowledgedAt:serverTimestamp(),
          resolvedAt:serverTimestamp(),
          updatedAt:serverTimestamp()
        }, { merge:true });
        return { applied:true, character:granted.character };
      });
      return { ok:true, applied:result.applied, character:result.character };
    }catch(error){
      reportSyncError('campaign-magic-reward-response', error, { campaignId, characterId, eventId });
      return { ok:false, applied:false, error:error.message || String(error) };
    }
  },
  updateCampaignCharacterResource: async function(campaignId, characterId, key, amount, metadata={}){
    if(!db || !currentUser || !campaignId || !characterId) return { ok:false };
    const resource=resourceId(key);
    const refs=liveCharacterRefs(campaignId,characterId);
    const characterRef=refs.campaign;
    const eventRef=doc(collection(db, 'campaigns', campaignId, 'events'));
    try{
      const result=await runTransaction(db, async transaction=>{
        const live=await requireLiveSession(transaction,campaignId);
        const snapshot=await transaction.get(characterRef);
        if(!snapshot.exists()) throw new Error('The linked campaign character was not found.');
        const character=Object.assign({ id:characterId }, snapshot.data());
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
        Object.assign(character,applyResourceChanges(character,{delta:{[resource]:Number(amount || 0)}}));
        const state=resourceSnapshot(character,resource),next=[state.current,state.maximum];
        writeLiveCharacter(transaction,refs,character);
        transaction.set(eventRef, {
          id:eventRef.id, campaignId, sessionId:live.id || '', targetCharacterId:characterId, targetOwnerUid:character.ownerUid || '',
          type:'resource-update', payload:{ resource, value:next, delta:Number(amount || 0), source:metadata.source || 'Dashboard' },
          status:'delivered', deliveryStatus:'delivered', acknowledged:false, createdBy:currentUser.uid,
          createdAt:serverTimestamp(), resolvedAt:serverTimestamp()
        });
        return next;
      });
      return { ok:true, applied:true, value:result };
    }catch(error){
      reportSyncError('campaign-resource-transaction', error, { campaignId, characterId, resource });
      return { ok:false, applied:false, error:error.message || String(error) };
    }
  },
  updateCampaignCharacterCurrency: async function(campaignId, characterId, key, amount, metadata={}){
    if(!db || !currentUser || !campaignId || !characterId) return {ok:false};
    const currency=liveSlug(key).replaceAll('-','_');
    if(!LIVE_CURRENCY.some(([name])=>name===currency)) return {ok:false,error:'Unsupported currency.'};
    const refs=liveCharacterRefs(campaignId,characterId);
    try{
      const value=await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const snapshot=await transaction.get(refs.campaign);
        if(!snapshot.exists()) throw new Error('The linked campaign character was not found.');
        const character=Object.assign({id:characterId},snapshot.data());
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
        character.coins={...(character.coins||character.coinPouch||{})};
        const storedKey=Object.keys(character.coins).find(value=>liveSlug(value).replaceAll('-','_')===currency) || currency;
        character.coins[storedKey]=Math.max(0,Number(character.coins[storedKey]||0)+Number(amount||0));
        const label=currency.replaceAll('_',' ').replace(/\b\w/g,value=>value.toUpperCase());
        appendActivity(character,{type:'currency-adjusted',message:`${label} ${Number(amount||0)>=0?'+':''}${Number(amount||0)}.`});
        writeLiveCharacter(transaction,refs,character);
        return character.coins[storedKey];
      });
      return {ok:true,applied:true,value};
    }catch(error){
      reportSyncError('campaign-currency-transaction',error,{campaignId,characterId,currency});
      return {ok:false,applied:false,error:error.message||String(error)};
    }
  },
  createPartyOrganization: async function(campaignId,characterId,details={}){
    if(!db || !currentUser || !campaignId || !characterId) return {ok:false};
    const workspaceRef=doc(db,'campaigns',campaignId,'systems','party-workspace');
    const characterRef=doc(db,'campaigns',campaignId,'characters',characterId);
    try{
      const organization=await runTransaction(db,async transaction=>{
        const session=await requireLiveSession(transaction,campaignId);
        const [workspaceSnapshot,characterSnapshot]=await Promise.all([transaction.get(workspaceRef),transaction.get(characterRef)]);
        if(!characterSnapshot.exists()) throw new Error('Character not found.');
        const character=characterSnapshot.data();
        if(character.ownerUid && character.ownerUid!==currentUser.uid) throw new Error('You can only create an organization for your own character.');
        const workspace=structuredCloneSafe(workspaceSnapshot.exists()?workspaceSnapshot.data():{});
        const name=String(details.name||'').trim().slice(0,120);
        if(!name) throw new Error('Enter an organization name.');
        const row={id:`organization-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,name,type:String(details.type||'Adventure Party').slice(0,80),ownerCharacterId:characterId,memberCharacterIds:[characterId],createdBy:currentUser.uid,createdAt:new Date().toISOString()};
        workspace.organizations=[...(Array.isArray(workspace.organizations)?workspace.organizations:[]),row];
        transaction.set(workspaceRef,Object.assign({},workspace,{sessionId:session.id,updatedBy:currentUser.uid,updatedAt:serverTimestamp()}),{merge:true});
        return row;
      });
      return {ok:true,organization};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
};
return {...commands,...createCoreCommands(context),...createInformationCommands(context),...createCombatCommands(context),...createItemStoreCommands(context)};
}
