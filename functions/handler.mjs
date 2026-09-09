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
const gm=(campaign,uid)=>campaign.ownerUid===uid || (campaign.gmUids||[]).includes(uid) || campaign.roles?.[uid]==='gm';
const member=(campaign,uid)=>gm(campaign,uid) || (campaign.playerUids||[]).includes(uid) || campaign.roles?.[uid]==='player';

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
    if(character.ownerUid!==uid) throw new Error('This character belongs to another account.');
    if(receipt.exists){
      if(receipt.data().action!==action || receipt.data().input!==JSON.stringify(args)) throw new Error('Request ID has already been used.');
      return receipt.data().result;
    }
    if(action==='updateCharacterInventory' && args[2]?.type==='add-item' && !gm(campaign,uid)) throw new Error('Ask the GM to grant new items.');
    if(action==='updateCampaignCharacterCurrency' && (!Number.isSafeInteger(args[3]) || Math.abs(args[3])>1e9)) throw new Error('Choose a whole currency amount within range.');
    if(action==='updateCampaignCharacterResource' && (!Number.isFinite(args[3]) || Math.abs(args[3])>1e9)) throw new Error('Invalid resource amount.');
    for(const detail of args.slice(2)) if(detail && typeof detail==='object') for(const key of ['quantity','exchangeQuantity','priceCopper','rows','cols','soulRecovery']) {
      if(detail[key]!==undefined && (!Number.isSafeInteger(detail[key]) || detail[key]<0 || detail[key]>1e9)) throw new Error('Invalid '+key+'.');
    }
    const adapter={get:async ref=>wrapSnapshot(await transaction.get(ref)),set:(...values)=>transaction.set(...values)};
    const result=await callback(adapter);
    transaction.set(receiptRef,{action,input:JSON.stringify(args),result:result===undefined?null:JSON.parse(JSON.stringify(result)),createdAt:serverTimestamp()});
    return result;
  });
  const commands=createCommands({db,currentUser:{uid},doc,collection,runTransaction,serverTimestamp,
    window:{AsteriaProgression:progressionContext.window.AsteriaProgression,AsteriaArmour:{validateEquipmentChange}},
    reportSyncError:()=>{},catalog});
  if(!Object.hasOwn(commands,action)) throw new Error('Unsupported action.');
  return commands[action](...args);
}
