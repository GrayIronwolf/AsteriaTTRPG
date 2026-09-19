import { isCampaignGM as gm, isCampaignMember as member, isLinkedCharacter, GM_CHARACTER_ACTIONS, GM_ONLY_ACTIONS } from './characterPermissions.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import { createCommands } from './commands.mjs';
import { validateEquipmentChange } from '../src/systems/armour/armourSystem.mjs';

// Reuse the existing, trusted repository progression implementation. No request
// text is evaluated and this context has no network, filesystem or credentials.
const progressionContext={window:{}};
vm.runInNewContext(fs.readFileSync(new URL('../js/asteria-progression.js',import.meta.url),'utf8'),progressionContext);
const catalog=[...JSON.parse(fs.readFileSync(new URL('../data/compendium-index-clean.json',import.meta.url),'utf8')).entries,...JSON.parse(fs.readFileSync(new URL('../data/universal-compendium-index.json',import.meta.url),'utf8')).entries];
const id=value=>typeof value==='string' && /^[A-Za-z0-9_-]{1,160}$/.test(value);


export function validateRequest(data) {
  if(!data || !Array.isArray(data.args) || data.args.length>8 || !id(data.args[0]) || !id(data.args[1]) || !id(data.requestId)) throw new Error('Invalid action request.');
  if(JSON.stringify(data).length>32000) throw new Error('Action request is too large.');
  const visit=(value,depth=0)=>{
    if(depth>12) throw new Error('Action data is nested too deeply.');
    if(typeof value==='number' && !Number.isFinite(value)) throw new Error('Numbers must be finite.');
    if(value && typeof value==='object') for(const [key,child] of Object.entries(value)) {
      if(['__proto__','constructor','prototype'].includes(key)) throw new Error('Invalid field.');
      visit(child,depth+1);
    }
  };
  visit(data);
}

export async function executeAction(db,uid,data,serverTimestamp) {
  if(!uid) throw new Error('Sign in to use this action.');
  validateRequest(data);
  const {action,requestId}=data;
  const args=data.args.map(value=>value===null?undefined:value);
  const campaignId=args[0];
  const segment=value=>{if(!id(value))throw new Error('Invalid document identifier.');return value;};
  const pathFor=(base,parts)=>[...(base===db?[]:[base.path]),...parts.map(segment)].join('/');
  const doc=(base,...parts)=>parts.length?db.doc(pathFor(base,parts)):base.doc();
  const collection=(base,...parts)=>db.collection(pathFor(base,parts));
  const wrapSnapshot=snapshot=>({id:snapshot.id,exists:()=>snapshot.exists,data:()=>snapshot.data()});
  const runTransaction=(_db,callback)=>db.runTransaction(async transaction=>{
    const campaignRef=db.doc(`campaigns/${campaignId}`);
    const characterRef=db.doc(`campaigns/${campaignId}/characters/${args[1]}`);
    const receiptRef=db.doc(`campaigns/${campaignId}/actionReceipts/${uid}_${requestId}`);
    const [campaignSnapshot,characterSnapshot,receipt]=await Promise.all([transaction.get(campaignRef),transaction.get(characterRef),transaction.get(receiptRef)]);
    if(!campaignSnapshot.exists || !member(campaignSnapshot.data(),uid)) throw new Error('Campaign membership is required.');
    if(!characterSnapshot.exists) throw new Error('Character not found.');
    const campaign=campaignSnapshot.data();
    const character=characterSnapshot.data();
    // Character ownership comes from Firestore, never a caller-supplied private copy.
    const linked=isLinkedCharacter(campaign,args[1],character,campaignId);
    const gmAccess=GM_CHARACTER_ACTIONS.has(action) && gm(campaign,uid) && linked;
    if(GM_ONLY_ACTIONS.has(action) && !gmAccess) throw new Error('Only the GM of this linked character can make this change.');
    if(character.ownerUid!==uid && !gmAccess) throw new Error('This character belongs to another account.');
    if(receipt.exists){
      if(receipt.data().action!==action || receipt.data().input!==JSON.stringify(args)) throw new Error('Request ID has already been used.');
      return receipt.data().result;
    }
    for(const detail of args.slice(2)) if(detail && typeof detail==='object' && detail.expectedCoreRevision!==undefined) {
      if(!Number.isSafeInteger(detail.expectedCoreRevision) || detail.expectedCoreRevision!==Number(character.coreRevision || 0)) throw new Error('The character changed. Wait for live sync before trying again.');
    }
    if(action==='updateCharacterInventory' && args[2]?.type==='add-item' && !gm(campaign,uid)) throw new Error('Ask the GM to grant new items.');
    if(action==='updateCampaignCharacterCurrency' && (!Number.isSafeInteger(args[3]) || Math.abs(args[3])>1e9)) throw new Error('Choose a whole currency amount within range.');
    if(action==='updateCampaignCharacterResource' && (!Number.isFinite(args[3]) || Math.abs(args[3])>1e9)) throw new Error('Invalid resource amount.');
    for(const detail of args.slice(2)) if(detail && typeof detail==='object') for(const key of ['quantity','exchangeQuantity','priceCopper','rows','cols','soulRecovery']) {
      if(detail[key]!==undefined && (!Number.isSafeInteger(detail[key]) || detail[key]<0 || detail[key]>1e9)) throw new Error('Invalid '+key+'.');
    }
    const adapter={get:async ref=>wrapSnapshot(await transaction.get(ref)),set:(...values)=>transaction.set(...values),update:(...values)=>transaction.update(...values)};
    const result=await callback(adapter);
    transaction.set(receiptRef,{action,input:JSON.stringify(args),result:result===undefined?null:JSON.parse(JSON.stringify(result)),createdAt:serverTimestamp()});
    return result;
  });
  const commands=createCommands({db,currentUser:{uid},requestId,doc,collection,runTransaction,serverTimestamp,
    window:{AsteriaProgression:progressionContext.window.AsteriaProgression,AsteriaArmour:{validateEquipmentChange}},
    reportSyncError:()=>{},catalog});
  if(!Object.hasOwn(commands,action)) throw new Error('Unsupported action.');
  return commands[action](...args);
}
