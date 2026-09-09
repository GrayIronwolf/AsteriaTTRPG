import { SESSION_LIMIT_MS, applyCharacteristicAllocations, applyCharacteristicPoints, characterKnowsIdentify, firstFreeStorageSlot, nextSkillProgress, normalizeCharacterStorages, normalizeDashboardPreferences, normalizeInventoryItems, normalizeLiveItem, parseResourceCost, slug as liveSlug, stableInventoryItemId, stackableStorageItem, structuredCloneSafe, talentRankCost, talentTierUnlocked, timestampMs, unidentifiedItemName } from '../src/state/liveWorkspaceModel.mjs';
import { applyRest, applySoulDamage, clampHpForSoulDamage, recoverSoulDamage, soulDamageValue } from '../src/state/specialDamageModel.mjs';
import { createAsteriaItem, getPlayerPurchasePriceCopper, getPlayerSaleValueCopper, marketPricingStatus, normalizeMarketPricing } from '../src/systems/items/marketPricing.mjs';
import { addGrantedMagicElement, incomingSnapshotIsStale, knownMagicElements, mergeLinkedCharacter, safeLinkedCharacterPatch, strictResourcePair } from '../src/state/characterIntegrityModel.mjs';
import { markQuestRewardClaimed, normalizeAssignedQuest, normalizeQuestReward, questRewardClaimed, questRewardSummary } from '../src/state/questRewardModel.mjs';
import { encounterResourcePair, preserveEncounterResources, setEncounterResource } from '../src/state/encounterResourceModel.mjs';

// Canonical player mutations. Executed only by the authenticated callable handler.
export function createCommands(context) {
const {db,currentUser,doc,collection,runTransaction,serverTimestamp,window,reportSyncError}=context;
const cleanData=value=>JSON.parse(JSON.stringify(value));
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
  const allowed=campaign.ownerUid===uid || campaign.roles?.[uid]==='gm' || (campaign.gmUids||[]).includes(uid);
  if(!allowed) throw new Error('Only a GM for this campaign can make this change.');
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
function campaignLinksCurrentUser(campaign={},characterId=''){
  const uid=currentUser?.uid || '';
  if(!uid) return false;
  if(String(campaign.playerCharacterLinks?.[characterId] || '')===uid) return true;
  if((campaign.players?.[uid]?.characterIds || []).map(String).includes(String(characterId))) return true;
  return String(campaign.characters?.[characterId]?.ownerUid || '')===uid;
}
async function verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs={}){
  if(character.ownerUid !== currentUser.uid) throw new Error('This character belongs to another account.');
  refs.private=doc(db,'users',currentUser.uid,'characters',ownedCharacterSourceId(characterId,character));
  refs.verifiedOwner=true;
  return {privateRef:refs.private,privateSnapshot:null};
}

function writeLiveCharacter(transaction,refs,character){
  const clean=structuredCloneSafe(character);
  clean.inventory=normalizeInventoryItems(clean.inventory,clean);
  if(clean.equipment&&typeof clean.equipment==='object') clean.equipment=Object.fromEntries(Object.entries(clean.equipment).map(([slot,item],index)=>[
    slot,
    item&&typeof item==='object'?normalizeLiveItem(Object.assign({},item,{equipped:true,equippedSlot:item.equippedSlot||slot}),index,clean):item
  ]));
  transaction.set(refs.campaign,Object.assign({},clean,{updatedAt:serverTimestamp()}),{merge:true});
  if(character.ownerUid === currentUser.uid || refs.verifiedOwner) transaction.set(refs.private,Object.assign({},clean,{id:ownedCharacterSourceId(character.id,character),ownerUid:currentUser.uid,updatedAt:serverTimestamp()}),{merge:true});
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
function playerItemRequests(ecosystem){
  ecosystem.playerItemRequests=Array.isArray(ecosystem.playerItemRequests)?ecosystem.playerItemRequests:[];
  return ecosystem.playerItemRequests;
}
function findPlayerItemRequest(ecosystem,requestId){
  const primary=playerItemRequests(ecosystem).find(value=>String(value.id)===String(requestId));
  if(primary) return primary;
  return (Array.isArray(ecosystem.directTrades)?ecosystem.directTrades:[]).find(value=>String(value.id)===String(requestId)&&String(value.id||'').startsWith('offer-')) || null;
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


const commands = {
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
  purchaseTalentRank: async function(campaignId,characterId,talent={}){
    if(!db || !currentUser || !campaignId || !characterId || !talent.name) return {ok:false};
    const refs=liveCharacterRefs(campaignId,characterId);
    try{
      const result=await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const snapshot=await transaction.get(refs.campaign);
        if(!snapshot.exists()) throw new Error('Character not found.');
        const character=Object.assign({id:characterId},snapshot.data());
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
        const classes=[character.klass,character.class,character.primaryClass,...(character.classNames||[]),...(character.classes||[]).map(value=>value?.name||value),...(character.secondaryClasses||[]).map(value=>value?.name||value)].filter(Boolean).map(liveSlug);
        const canonical=context.catalog.find(entry=>entry.type==='talent' && liveSlug(entry.title)===liveSlug(talent.name) && classes.includes(liveSlug(entry.metadata?.classname||entry.metadata?.className)));
        if(!canonical) throw new Error('Talent is not in the supported compendium.');
        talent={name:canonical.title,tier:Number(String(canonical.metadata?.tier||'').replace(/\D/g,'')),maxRank:Number(canonical.metadata?.ranks||5)};
        const tier=talent.tier;
        if(!Number.isInteger(tier)||tier<1||tier>5) throw new Error('Talent metadata is invalid.');
        if(!talentTierUnlocked(character.level,tier)) throw new Error(`Tier ${tier} unlocks at Level ${[0,1,10,20,30,40][tier]}.`);
        character.talents=Array.isArray(character.talents) ? Object.fromEntries(character.talents.map(value=>[value.name||value.title||value,{rank:Number(value.rank||1)}])) : Object.assign({},character.talents||{});
        const existing=character.talents[talent.name]||{};
        const rank=Math.max(0,Number(existing.rank||0));
        const maximum=Math.max(1,Number(talent.maxRank||talent.max||talent.ranks||5));
        if(rank>=maximum) throw new Error('Talent is already at maximum rank.');
        const cost=talentRankCost(rank+1);
        if(Number(character.tp||0)<cost) throw new Error(`Rank ${rank+1} costs ${cost} TP.`);
        character.tp=Number(character.tp||0)-cost;
        character.talents[talent.name]=Object.assign({},existing,structuredCloneSafe(talent),{name:talent.name,rank:rank+1,tier,maxRank:maximum,unlocked:true});
        character.unlockedTalents=Object.values(character.talents).filter(value=>Number(value.rank||0)>0);
        appendActivity(character,{type:'talent-rank',message:`Unlocked ${talent.name} Rank ${rank+1} for ${cost} TP.`});
        writeLiveCharacter(transaction,refs,character);
        return {rank:rank+1,cost};
      });
      return {ok:true,...result};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
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
        costs=parseResourceCost(savedCost);
        const paid={};
        Object.entries(costs||{}).forEach(([resource,raw])=>{
          if(!['hp','sp','mp','bp'].includes(resource)) return;
          const amount=Math.max(0,Number(raw||0));
          if(!amount) return;
          const pair=strictResourcePair(character[resource],resource);
          if(pair[0]<amount) throw new Error(`Not enough ${resource.toUpperCase()} to cast ${spell.name}.`);
          character[resource]=[pair[0]-amount,pair[1]];
          paid[resource]=amount;
        });
        appendActivity(character,{type:'spell-cast',message:`Cast ${spell.name}.`,costs:paid});
        writeLiveCharacter(transaction,refs,character);
        return paid;
      });
      return {ok:true,paid:result};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  updateCharacterInventory: async function(campaignId,characterId,operation={}){
    if(!db || !currentUser || !campaignId || !characterId) return {ok:false};
    const refs=liveCharacterRefs(campaignId,characterId);
    try{
      await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const snapshot=await transaction.get(refs.campaign);
        if(!snapshot.exists()) throw new Error('Character not found.');
        const character=Object.assign({id:characterId},snapshot.data());
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
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
        if(operation.type==='reorder-storages'){
          const order=[...new Set((Array.isArray(operation.storageIds)?operation.storageIds:[]).map(String))];
          const rank=value=>{const index=order.indexOf(String(value.id));return index<0?order.length+Number(value.order||0):index;};
          character.storages.sort((left,right)=>rank(left)-rank(right)).forEach((storage,index)=>{storage.order=index;});
          character.inventory=inventory;
          writeLiveCharacter(transaction,refs,character);
          return;
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
        if(operation.type==='equip'){
          const slot=String(operation.slot||item.slot||item.allowedSlots?.[0]||'').trim();
          if(!slot) throw new Error('Choose an equipment slot.');
          const armourValidation=window.AsteriaArmour?.validateEquipmentChange?.(character,item,slot);
          if(armourValidation && !armourValidation.ok) throw new Error(armourValidation.error||'This armour cannot be equipped in that location.');
          inventory.forEach(value=>{if(value.equippedSlot===slot){value.equipped=false;value.equippedSlot='';value.location='inventory';}});
          item.equipped=true;item.equippedSlot=slot;item.slot=slot;item.location='equipment';
          character.equipment=Object.assign({},character.equipment||{});
          Object.keys(character.equipment).forEach(key=>{if(key===slot||String(character.equipment[key]?.id||'')===String(item.id||'')) delete character.equipment[key];});
          character.equipment[slot]=item;
          appendActivity(character,{type:'item-equipped',message:`Equipped ${item.name} in ${slot}.`});
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
          const changes=Object.entries(parsed).filter(([resource,amount])=>['hp','sp','mp','bp'].includes(resource)&&Number(amount)>0);
          if(!changes.length) throw new Error('This item does not have a usable resource effect.');
          changes.forEach(([resource,amount])=>{const pair=strictResourcePair(character[resource],resource);const requested=pair[0]+Number(amount);character[resource]=[resource==='hp'?clampHpForSoulDamage(character,requested):Math.min(pair[1],requested),pair[1]];});
          item.qty=Math.max(0,Number(item.qty||1)-1);
          appendActivity(character,{type:'item-used',message:`Used ${item.name}: ${changes.map(([resource,amount])=>`+${amount} ${resource.toUpperCase()}`).join(', ')}.`});
        }else if(operation.type==='move-storage'){
          const storage=character.storages.find(value=>value.id===String(operation.storageId||''));
          if(!storage) throw new Error('Storage not found.');
          const requested=Number(operation.storageSlot);
          const capacity=Number(storage.maxSlots||storage.rows*storage.cols||16);
          const storageSlot=Number.isInteger(requested)&&requested>=0&&requested<capacity?requested:firstFreeStorageSlot(inventory,storage,item.id);
          if(storageSlot<0) throw new Error(`${storage.name} is full.`);
          const occupied=inventory.find(value=>!value.equipped&&String(value.id)!==String(item.id)&&value.storageId===storage.id&&Number(value.storageSlot)===storageSlot);
          if(occupied) throw new Error(`Slot ${storageSlot+1} is already occupied.`);
          item.storageId=storage.id;item.storageSlot=storageSlot;item.location='inventory';
          appendActivity(character,{type:'item-stored',message:`Moved ${item.name} to ${storage.name}.`});
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
      return {ok:true};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  buyLiveShopItem: async function(campaignId,characterId,shopId,stockIndex,quantity=1){
    const refs=liveCharacterRefs(campaignId,characterId);
    const ecosystemRef=doc(db,'campaigns',campaignId,'systems','itemEcosystem');
    try{
      const result=await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const characterSnapshot=await transaction.get(refs.campaign);
        const ecosystemSnapshot=await transaction.get(ecosystemRef);
        if(!characterSnapshot.exists()||!ecosystemSnapshot.exists()) throw new Error('Shop data is not available.');
        const character=Object.assign({id:characterId},characterSnapshot.data());
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
        const ecosystem=structuredCloneSafe(ecosystemSnapshot.data());
        const shop=(ecosystem.shops||[]).find(value=>String(value.id)===String(shopId));
        const stock=shop?.stock?.[Number(stockIndex)];
        if(!shop||!stock||shop.status!=='open') throw new Error('This shop is not open.');
        if(Array.isArray(shop.visitorCharacterIds)&&shop.visitorCharacterIds.length&&!shop.visitorCharacterIds.includes(characterId)) throw new Error('This character is not visiting the shop.');
        if(!Number.isSafeInteger(Number(quantity)) || Number(quantity)<1) throw new Error('Choose a whole item quantity.');
        if(Number(stock.qty||0)<1) throw new Error('This item is out of stock.');
        const qty=Math.min(Number(quantity),Number(stock.qty));
        const item=normalizeMarketPricing(Object.assign({},structuredCloneSafe(stock.item||{}),{qty,location:'inventory',equipped:false}),{legacy:true,removeLegacy:true,migratedRecord:true});
        item.name=item.name||item.title||'Shop Item';
        const unitCost=getPlayerPurchasePriceCopper(item,shop.buyModifier??1);
        if(unitCost===null) throw new Error(`${item.name} needs a Market Price before it can be sold.`);
        if(unitCost===0&&marketPricingStatus(item).id==='not-tradeable') throw new Error(`${item.name} is not normally tradeable.`);
        const cost=unitCost*qty;
        const total=currencyTotal(character);
        if(total<cost) throw new Error('Not enough currency.');
        const received=placeCharacterItem(character,item,{});
        setCurrencyTotal(character,total-cost);
        stock.qty=Number(stock.qty||0)-qty;
        shop.currencyCopper=Number(shop.currencyCopper||0)+cost;
        appendActivity(character,{type:'shop-purchase',message:`Purchased ${qty} x ${item.name} for ${cost} copper.`});
        writeLiveCharacter(transaction,refs,character);
        transaction.set(ecosystemRef,Object.assign({},ecosystem,{updatedBy:currentUser.uid,updatedAt:serverTimestamp()}),{merge:true});
        return {item:received,cost};
      });
      return {ok:true,...result};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  sellLiveShopItem: async function(campaignId,characterId,shopId,itemId){
    const refs=liveCharacterRefs(campaignId,characterId);
    const ecosystemRef=doc(db,'campaigns',campaignId,'systems','itemEcosystem');
    try{
      const result=await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const characterSnapshot=await transaction.get(refs.campaign);
        const ecosystemSnapshot=await transaction.get(ecosystemRef);
        if(!characterSnapshot.exists()||!ecosystemSnapshot.exists()) throw new Error('Shop data is not available.');
        const character=Object.assign({id:characterId},characterSnapshot.data());
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
        const ecosystem=structuredCloneSafe(ecosystemSnapshot.data());
        const shop=(ecosystem.shops||[]).find(value=>String(value.id)===String(shopId));
        const inventory=characterInventory(character);
        const item=inventory.find((value,index)=>liveItemId(value,index)===String(itemId));
        if(!shop||shop.status!=='open'||!item) throw new Error('The shop or item is unavailable.');
        if(item.equipped||item.locked||item.bound||item.questItem) throw new Error('This item cannot be sold.');
        const value=getPlayerSaleValueCopper(item,shop.sellModifier??1);
        if(value===0) throw new Error(`${item.name} has no Market Value and cannot normally be sold.`);
        if(Number(shop.currencyCopper??Infinity)<value) throw new Error('The merchant cannot afford this item.');
        item.qty=Math.max(0,Number(item.qty||1)-1);
        character.inventory=inventory.filter(record=>Number(record.qty??1)>0);
        setCurrencyTotal(character,currencyTotal(character)+value);
        shop.currencyCopper=Number(shop.currencyCopper||0)-value;
        shop.stock=Array.isArray(shop.stock)?shop.stock:[];
        const existing=shop.stock.find(row=>liveSlug(row.item?.name)===liveSlug(item.name));
        if(existing) existing.qty=Number(existing.qty||0)+1;
        else shop.stock.push({item:Object.assign({},structuredCloneSafe(item),{qty:1,equipped:false,equippedSlot:'',location:'shop'}),qty:1,priceCopper:getPlayerPurchasePriceCopper(item,shop.buyModifier??1)});
        appendActivity(character,{type:'shop-sale',message:`Sold ${item.name} for ${value} copper.`});
        writeLiveCharacter(transaction,refs,character);
        transaction.set(ecosystemRef,Object.assign({},ecosystem,{updatedBy:currentUser.uid,updatedAt:serverTimestamp()}),{merge:true});
        return {value};
      });
      return {ok:true,...result};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  createLiveItemRequest: async function(campaignId,characterId,recipientId,itemId,mode='give',details={}){
    if(!db||!currentUser||!campaignId||!characterId||!recipientId) return {ok:false};
    const refs=liveCharacterRefs(campaignId,characterId);
    const ecosystemRef=doc(db,'campaigns',campaignId,'systems','itemEcosystem');
    const recipientRef=doc(db,'campaigns',campaignId,'characters',recipientId);
    try{
      const request=await runTransaction(db,async transaction=>{
        const session=await requireLiveSession(transaction,campaignId);
        const [characterSnapshot,recipientSnapshot,ecosystemSnapshot]=await Promise.all([transaction.get(refs.campaign),transaction.get(recipientRef),transaction.get(ecosystemRef)]);
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
        const ecosystem=structuredCloneSafe(ecosystemSnapshot.exists()?ecosystemSnapshot.data():{});
        const row={id:`item-request-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,version:2,sessionId:session.id,mode:action,fromCharacterId:characterId,fromCharacterName:character.name||'Party Member',fromOwnerUid:character.ownerUid||currentUser.uid,toCharacterId:recipientId,toCharacterName:recipient.name||'Party Member',toOwnerUid:recipient.ownerUid||'',item:snapshot,quantity:snapshot.qty,note:String(details.note||'').slice(0,1000),priceCopper:Math.max(0,Math.floor(Number(details.priceCopper||0))),requestedItem:String(details.requestedItem||'').slice(0,200),status:'pending',recipientNotice:'unread',senderNotice:'waiting',createdAt:new Date().toISOString(),createdBy:currentUser.uid};
        playerItemRequests(ecosystem).push(row);
        appendActivity(character,{type:`item-${action}-requested`,message:`Sent ${recipient.name||'a party member'} a ${action} request for ${snapshot.name}.`});
        writeLiveCharacter(transaction,refs,character);
        transaction.set(ecosystemRef,Object.assign({},ecosystem,{updatedBy:currentUser.uid,updatedAt:serverTimestamp()}),{merge:true});
        return row;
      });
      return {ok:true,request,offer:request};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  respondLiveItemRequest: async function(campaignId,characterId,requestId,accepted,details={}){
    if(!db||!currentUser||!campaignId||!characterId||!requestId) return {ok:false};
    const ecosystemRef=doc(db,'campaigns',campaignId,'systems','itemEcosystem');
    const recipientRef=doc(db,'campaigns',campaignId,'characters',characterId);
    try{
      const result=await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const ecosystemSnapshot=await transaction.get(ecosystemRef);
        if(!ecosystemSnapshot.exists()) throw new Error('Item request data is unavailable.');
        const ecosystem=structuredCloneSafe(ecosystemSnapshot.data());
        const request=findPlayerItemRequest(ecosystem,requestId);
        if(!request||request.status!=='pending'||String(request.toCharacterId)!==String(characterId)) throw new Error('This item request is no longer pending for this character.');
        const senderRef=doc(db,'campaigns',campaignId,'characters',request.fromCharacterId);
        const [recipientSnapshot,senderSnapshot]=await Promise.all([transaction.get(recipientRef),transaction.get(senderRef)]);
        if(!recipientSnapshot.exists()||!senderSnapshot.exists()) throw new Error('One of the linked characters is unavailable.');
        const recipient=Object.assign({id:characterId},recipientSnapshot.data());
        const sender=Object.assign({id:request.fromCharacterId},senderSnapshot.data());
        const recipientRefs={campaign:recipientRef,private:doc(db,'users',currentUser.uid,'characters',characterId)};
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,recipient,recipientRefs);
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
            transaction.set(ecosystemRef,Object.assign({},ecosystem,{updatedBy:currentUser.uid,updatedAt:serverTimestamp()}),{merge:true});
            return {awaitingSender:true};
          }
          receivedItem=placeCharacterItem(recipient,request.item,{storageId:details.storageId||''});
          appendActivity(recipient,{type:`item-${request.mode}-accepted`,message:`Accepted ${receivedItem.name} from ${sender.name||'a party member'}.`});
        }else if(request.mode!=='identify'){
          const storages=normalizeCharacterStorages(sender);
          if(storages.length) placeCharacterItem(sender,request.item,{storageId:request.item?.storageId||'',storageSlot:request.item?.storageSlot,preserveId:true});
          else sender.inventory=[...characterInventory(sender),Object.assign({},structuredCloneSafe(request.item),{location:'inventory',storageId:'',storageSlot:-1,equipped:false,equippedSlot:''})];
        }
        request.status=accepted?'accepted':'declined';request.recipientNotice='acknowledged';request.senderNotice='unread';request.resolvedAt=new Date().toISOString();request.resolvedBy=currentUser.uid;
        request.resolution={accepted:Boolean(accepted),receivedItem:receivedItem?{name:receivedItem.name,qty:receivedItem.qty}:null,exchangeItem:exchangeItem?{name:exchangeItem.name,qty:exchangeItem.qty}:null,revealedItem:revealedItem?{name:revealedItem.name,rarity:revealedItem.rarity}:null,priceCopper:request.mode==='sell'?Number(request.priceCopper||0):0};
        transaction.set(senderRef,Object.assign({},structuredCloneSafe(sender),{updatedAt:serverTimestamp()}),{merge:true});
        writeLiveCharacter(transaction,recipientRefs,recipient);
        transaction.set(ecosystemRef,Object.assign({},ecosystem,{updatedBy:currentUser.uid,updatedAt:serverTimestamp()}),{merge:true});
        return {revealedItem};
      });
      return {ok:true,...result};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  finalizeLiveItemTrade: async function(campaignId,characterId,requestId,accepted){
    if(!db||!currentUser||!campaignId||!characterId||!requestId) return {ok:false};
    const senderRefs=liveCharacterRefs(campaignId,characterId);
    const ecosystemRef=doc(db,'campaigns',campaignId,'systems','itemEcosystem');
    try{
      await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const [ecosystemSnapshot,senderSnapshot]=await Promise.all([transaction.get(ecosystemRef),transaction.get(senderRefs.campaign)]);
        if(!ecosystemSnapshot.exists()||!senderSnapshot.exists()) throw new Error('Trade data is unavailable.');
        const ecosystem=structuredCloneSafe(ecosystemSnapshot.data());
        const request=findPlayerItemRequest(ecosystem,requestId);
        if(!request||request.status!=='awaiting-sender'||String(request.fromCharacterId)!==String(characterId)) throw new Error('This trade is no longer awaiting your confirmation.');
        const recipientRef=doc(db,'campaigns',campaignId,'characters',request.toCharacterId);
        const recipientSnapshot=await transaction.get(recipientRef);
        if(!recipientSnapshot.exists()) throw new Error('The other linked character is unavailable.');
        const sender=Object.assign({id:characterId},senderSnapshot.data());
        const recipient=Object.assign({id:request.toCharacterId},recipientSnapshot.data());
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,sender,senderRefs);
        let senderReceived=null;let recipientReceived=null;
        if(accepted){
          senderReceived=placeCharacterItem(sender,request.exchangeItem,{});
          recipientReceived=placeCharacterItem(recipient,request.item,{storageId:request.recipientStorageId||''});
          appendActivity(sender,{type:'item-trade-completed',message:`Completed a trade with ${recipient.name||'a party member'}.`});
          appendActivity(recipient,{type:'item-trade-completed',message:`Completed a trade with ${sender.name||'a party member'}.`});
        }else{
          placeCharacterItem(sender,request.item,{storageId:request.item?.storageId||'',storageSlot:request.item?.storageSlot,preserveId:true});
          placeCharacterItem(recipient,request.exchangeItem,{storageId:request.exchangeItem?.storageId||'',storageSlot:request.exchangeItem?.storageSlot,preserveId:true});
          appendActivity(sender,{type:'item-trade-declined',message:`Declined the final trade with ${recipient.name||'a party member'}.`});
          appendActivity(recipient,{type:'item-trade-declined',message:`${sender.name||'The other player'} declined the final trade.`});
        }
        request.status=accepted?'accepted':'declined';request.senderNotice='acknowledged';request.recipientNotice='unread';request.resolvedAt=new Date().toISOString();request.resolvedBy=currentUser.uid;
        request.resolution={accepted:Boolean(accepted),receivedItem:recipientReceived?{name:recipientReceived.name,qty:recipientReceived.qty}:null,exchangeItem:senderReceived?{name:senderReceived.name,qty:senderReceived.qty}:null};
        writeLiveCharacter(transaction,senderRefs,sender);
        transaction.set(recipientRef,Object.assign({},structuredCloneSafe(recipient),{updatedAt:serverTimestamp()}),{merge:true});
        transaction.set(ecosystemRef,Object.assign({},ecosystem,{updatedBy:currentUser.uid,updatedAt:serverTimestamp()}),{merge:true});
      });
      return {ok:true};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  cancelLiveItemRequest: async function(campaignId,characterId,requestId){
    if(!db||!currentUser||!campaignId||!characterId||!requestId) return {ok:false};
    const refs=liveCharacterRefs(campaignId,characterId);
    const ecosystemRef=doc(db,'campaigns',campaignId,'systems','itemEcosystem');
    try{
      await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const [ecosystemSnapshot,characterSnapshot]=await Promise.all([transaction.get(ecosystemRef),transaction.get(refs.campaign)]);
        if(!ecosystemSnapshot.exists()||!characterSnapshot.exists()) throw new Error('Item request data is unavailable.');
        const ecosystem=structuredCloneSafe(ecosystemSnapshot.data());
        const request=findPlayerItemRequest(ecosystem,requestId);
        if(!request||request.status!=='pending'||String(request.fromCharacterId)!==String(characterId)) throw new Error('This request can no longer be cancelled.');
        const character=Object.assign({id:characterId},characterSnapshot.data());
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
        if(request.mode!=='identify'){
          const storages=normalizeCharacterStorages(character);
          if(storages.length) placeCharacterItem(character,request.item,{storageId:request.item?.storageId||'',storageSlot:request.item?.storageSlot,preserveId:true});
          else character.inventory=[...characterInventory(character),Object.assign({},structuredCloneSafe(request.item),{location:'inventory',storageId:'',storageSlot:-1,equipped:false,equippedSlot:''})];
        }
        request.status='cancelled';request.recipientNotice='cancelled';request.senderNotice='acknowledged';request.resolvedAt=new Date().toISOString();request.resolvedBy=currentUser.uid;
        appendActivity(character,{type:'item-request-cancelled',message:`Cancelled the ${request.mode} request for ${request.item?.name||'an item'}.`});
        writeLiveCharacter(transaction,refs,character);
        transaction.set(ecosystemRef,Object.assign({},ecosystem,{updatedBy:currentUser.uid,updatedAt:serverTimestamp()}),{merge:true});
      });
      return {ok:true};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  acknowledgeLiveItemRequest: async function(campaignId,characterId,requestId){
    if(!db||!currentUser||!campaignId||!characterId||!requestId) return {ok:false};
    const refs=liveCharacterRefs(campaignId,characterId);
    const ecosystemRef=doc(db,'campaigns',campaignId,'systems','itemEcosystem');
    try{
      await runTransaction(db,async transaction=>{
        const [ecosystemSnapshot,characterSnapshot]=await Promise.all([transaction.get(ecosystemRef),transaction.get(refs.campaign)]);
        if(!ecosystemSnapshot.exists()||!characterSnapshot.exists()) throw new Error('Item request result is unavailable.');
        const ecosystem=structuredCloneSafe(ecosystemSnapshot.data());
        const request=findPlayerItemRequest(ecosystem,requestId);
        if(!request||request.status==='pending'||String(request.fromCharacterId)!==String(characterId)) throw new Error('This result cannot be acknowledged.');
        const character=Object.assign({id:characterId},characterSnapshot.data());
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
        request.senderNotice='acknowledged';request.senderAcknowledgedAt=new Date().toISOString();request.senderAcknowledgedBy=currentUser.uid;
        transaction.set(refs.private,Object.assign({},structuredCloneSafe(character),{id:ownedCharacterSourceId(characterId,character),ownerUid:currentUser.uid,updatedAt:serverTimestamp()}),{merge:true});
        transaction.set(ecosystemRef,Object.assign({},ecosystem,{updatedBy:currentUser.uid,updatedAt:serverTimestamp()}),{merge:true});
      });
      return {ok:true};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  acknowledgeLiveItemRecipientUpdate: async function(campaignId,characterId,requestId){
    if(!db||!currentUser||!campaignId||!characterId||!requestId) return {ok:false};
    const refs=liveCharacterRefs(campaignId,characterId);
    const ecosystemRef=doc(db,'campaigns',campaignId,'systems','itemEcosystem');
    try{
      await runTransaction(db,async transaction=>{
        const [ecosystemSnapshot,characterSnapshot]=await Promise.all([transaction.get(ecosystemRef),transaction.get(refs.campaign)]);
        if(!ecosystemSnapshot.exists()||!characterSnapshot.exists()) throw new Error('Item request update is unavailable.');
        const ecosystem=structuredCloneSafe(ecosystemSnapshot.data());
        const request=findPlayerItemRequest(ecosystem,requestId);
        if(!request||!['accepted','declined','cancelled'].includes(request.status)||String(request.toCharacterId)!==String(characterId)) throw new Error('This recipient update cannot be acknowledged.');
        const character=Object.assign({id:characterId},characterSnapshot.data());
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
        request.recipientNotice='acknowledged';request.recipientAcknowledgedAt=new Date().toISOString();request.recipientAcknowledgedBy=currentUser.uid;
        transaction.set(refs.private,Object.assign({},structuredCloneSafe(character),{id:ownedCharacterSourceId(characterId,character),ownerUid:currentUser.uid,updatedAt:serverTimestamp()}),{merge:true});
        transaction.set(ecosystemRef,Object.assign({},ecosystem,{updatedBy:currentUser.uid,updatedAt:serverTimestamp()}),{merge:true});
      });
      return {ok:true};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  updateCharacterQuest: async function(campaignId,characterId,questId,status){
    const refs=liveCharacterRefs(campaignId,characterId);
    try{
      const result=await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const snapshot=await transaction.get(refs.campaign);
        if(!snapshot.exists()) throw new Error('Character not found.');
        const character=Object.assign({id:characterId},snapshot.data());
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
        const quests=Array.isArray(character.quests||character.questLog)?structuredCloneSafe(character.quests||character.questLog):[];
        const index=quests.findIndex((quest,index)=>String(quest?.id||quest?.slug||index)===String(questId));
        if(index<0) throw new Error('Quest not found.');
        const quest=typeof quests[index]==='object'?quests[index]:{name:String(quests[index])};
        quest.status=String(status||'Active');
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
        quests[index]=quest;
        character.quests=quests;
        writeLiveCharacter(transaction,refs,character);
        return {rewardApplied,rewardSummary:summary};
      });
      return {ok:true,...result};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  resolveLootReward: async function(campaignId,characterId,eventId,action='inventory',destination=''){
    if(!db || !currentUser || !campaignId || !characterId || !eventId) return {ok:false};
    const refs=liveCharacterRefs(campaignId,characterId);
    const eventRef=doc(db,'campaigns',campaignId,'events',eventId);
    try{
      const result=await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const eventSnapshot=await transaction.get(eventRef);
        const characterSnapshot=await transaction.get(refs.campaign);
        if(!eventSnapshot.exists() || !characterSnapshot.exists()) throw new Error('This loot reward is no longer available.');
        const event=eventSnapshot.data();
        const character=Object.assign({id:characterId},characterSnapshot.data());
        if(event.type!=='loot-reward'||event.targetCharacterId!==characterId||event.targetOwnerUid!==currentUser.uid) throw new Error('This reward is not assigned to this character.');
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
        if(event.resolvedAt||['accepted','equipped','declined','resolved'].includes(String(event.status||'').toLowerCase())) return {applied:false};
        const pending=Array.isArray(character.pendingItemRewards)?character.pendingItemRewards:[];
        character.pendingItemRewards=pending.filter(value=>String(value?.id||'')!==String(eventId));
        character.resolvedItemRewardIds=uniqueValues(character.resolvedItemRewardIds,[eventId]);
        if(action!=='declined'){
          const item=normalizeMarketPricing(Object.assign({},structuredCloneSafe(event.payload?.item||{})),{legacy:true,removeLegacy:true,migratedRecord:true});
          item.id=item.id||item.instanceId||`${liveSlug(item.name||item.title)||'item'}-${Date.now()}`;
          item.instanceId=item.instanceId||item.id;
          item.name=item.name||item.title||'Reward Item';
          item.qty=Math.max(1,Number(item.qty||item.quantity||1));
          item.location='inventory';
          item.equipped=false;
          character.storageLimit=Math.max(3,Number(character.storageLimit||3));
          character.storages=normalizeCharacterStorages(character);
          item.storageId=String(action==='equip' ? item.storageId||character.storages[0]?.id||'' : destination||item.storageId||character.storages[0]?.id||'');
          const received=placeCharacterItem(character,item,{storageId:item.storageId,noStack:action==='equip'});
          if(action==='equip'){
            received.equippedSlot=destination||item.slot||item.allowedSlots?.[0]||'';
            if(!received.equippedSlot) throw new Error('Choose an equipment slot for this reward.');
            character.inventory.forEach(value=>{
              if(value!==received&&value.equippedSlot===received.equippedSlot){value.equipped=false;value.equippedSlot='';value.location='inventory';}
            });
            received.equipped=true;
            received.slot=received.equippedSlot;
            received.location='equipment';
            character.equipment=Object.assign({},character.equipment||{});
            character.equipment[received.equippedSlot]=received;
          }
          appendActivity(character,{type:'loot-received',message:`Received ${received.name}${action==='equip'?' and equipped it':''}.`});
        }
        writeLiveCharacter(transaction,refs,character);
        transaction.set(eventRef,{status:action==='declined'?'declined':action==='equip'?'equipped':'accepted',deliveryStatus:'acknowledged',acknowledged:true,acknowledgedBy:currentUser.uid,acknowledgedAt:serverTimestamp(),resolvedAt:serverTimestamp(),updatedAt:serverTimestamp()},{merge:true});
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
    const resource=String(key || '').toLowerCase();
    if(!['hp','sp','mp','bp'].includes(resource)) throw new Error('Unsupported character resource.');
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
        const pair=strictResourcePair(character[resource],resource);
        const maximum=pair[1];
        const requested=pair[0] + Number(amount || 0);
        const current=resource==='hp' ? clampHpForSoulDamage(character,requested) : Math.max(0,Math.min(maximum,requested));
        const next=[current,maximum];
        character[resource]=next;
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
  takeCampaignCharacterRest: async function(campaignId,characterId,type='short',metadata={}){
    if(!db || !currentUser || !campaignId || !characterId) return {ok:false};
    const restType=String(type||'short').toLowerCase();
    if(!['short','long'].includes(restType)) return {ok:false,error:'Choose a short or long rest.'};
    const refs=liveCharacterRefs(campaignId,characterId);
    try{
      const result=await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const snapshot=await transaction.get(refs.campaign);
        if(!snapshot.exists()) throw new Error('The linked campaign character was not found.');
        const character=Object.assign({id:characterId},snapshot.data());
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
        if(restType==='short') strictResourcePair(character.sp,'sp');
        else ['hp','sp','mp'].forEach(resource=>strictResourcePair(character[resource],resource));
        const rested=applyRest(character,restType,restType==='long'?Number(metadata.soulRecovery||0):0);
        appendActivity(rested.entity,{type:`${restType}-rest`,message:`${restType==='long'?'Long':'Short'} Rest completed${rested.recoveredSoul?`; ${rested.recoveredSoul} Soul Damage recovered naturally`:''}.`});
        writeLiveCharacter(transaction,refs,rested.entity);
        return {type:restType,recoveredSoul:rested.recoveredSoul,soulDamage:rested.soulDamage,hp:rested.entity.hp,sp:rested.entity.sp,mp:rested.entity.mp};
      });
      return {ok:true,...result};
    }catch(error){
      reportSyncError('campaign-character-rest',error,{campaignId,characterId,type:restType});
      return {ok:false,error:error.message||String(error)};
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
return commands;
}
