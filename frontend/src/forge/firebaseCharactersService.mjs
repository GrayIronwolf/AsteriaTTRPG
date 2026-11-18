import {validateOwnedRecord} from '../../../src/state/ownedCharacterRecords.mjs';
import {timestampValue} from '../../../src/state/characterIntegrityModel.mjs';
import {composeCharacter} from './forgeModel.mjs';

/** Only the existing Firebase app, Firestore owner path and Auth user. */
export function createFirebaseCharactersService({auth,db,firestoreSdk,readCanonical,enabled=false}){
 if(!auth||!db||!firestoreSdk||typeof readCanonical!=='function')
  throw new Error('Existing Firebase Auth and Firestore required.');
 const flags=Object.freeze({enabled:enabled===true});
 const owner=async()=>{
  if(!flags.enabled)throw new Error('Character Forge preview is not enabled.');
  const user=auth.currentUser;
  if(!user?.uid)throw new Error('Sign in to access your characters.');
  const account=await readCanonical(user);
  if(!account||auth.currentUser?.uid!==user.uid)
   throw new Error('The private account profile could not be verified.');
  return user.uid;
 };
 const same=uid=>{
  if(auth.currentUser?.uid!==uid)throw new Error('Account switched during Character Forge operation.');
 };
 const reference=(uid,id)=>firestoreSdk.doc(db,'users',uid,'characters',id);
 const readShared=async (uid,campaignId,characterId)=>{
  if(!/^[a-zA-Z0-9_-]{1,160}$/.test(String(campaignId))||
     !/^[a-zA-Z0-9_-]{1,160}$/.test(String(characterId)))return null;
  try{
   const snap=await firestoreSdk.getDocFromServer(
    firestoreSdk.doc(db,'campaigns',campaignId,'characters',characterId));
   same(uid);
   return snap.exists()?snap.data():null;
  }catch{
   same(uid);
   return null;
  }
 };
 const verify=async(uid,item)=>{
  if(!item||item.ownerUid!==uid||!item.id)return false;
  return validateOwnedRecord(item,uid,(campaignId,characterId)=>
   readShared(uid,campaignId,characterId));
 };
 const load=async(id)=>{
  const uid=await owner();
  if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,160}$/.test(id))
   throw new Error('Invalid saved character ID.');
  const snap=await firestoreSdk.getDocFromServer(reference(uid,id));
  same(uid);
  if(!snap.exists())throw new Error('Character was not found.');
  const record={...snap.data(),id:snap.id};
  if(!await verify(uid,record))throw new Error('The character owner could not be verified.');
  same(uid);
  return record;
 };
 async function list(){
  const uid=await owner();
  const snapshot=await firestoreSdk.getDocsFromServer(
   firestoreSdk.collection(db,'users',uid,'characters'));
  same(uid);
  const accepted=[];
  let excluded=0;
  for(const doc of snapshot.docs){
   const record={...doc.data(),id:doc.id};
   if(!await verify(uid,record)){excluded++;continue;}
   accepted.push({
    id:doc.id,ownerUid:uid,name:typeof record.name==='string'?record.name:'Unnamed',
    race:typeof record.race==='string'?record.race:'',
    klass:typeof record.klass==='string'?record.klass:'',
    level:Number.isFinite(Number(record.level))?Number(record.level):0,
    campaign:typeof record.campaign==='string'?record.campaign:'',
    updatedAt:record.updatedAt||null,
    linked:Array.isArray(record.linkedCampaignIds)&&record.linkedCampaignIds.length>0||
      Boolean(record.sharedCampaignId||record.campaignId)
   });
  }
  same(uid);
  return {items:accepted.sort((a,b)=>a.name.localeCompare(b.name)),excluded};
 }
 async function save(draft,rules,editingId=null){
  const uid=await owner();
  const id=editingId||'forge-'+crypto.randomUUID();
  const existing=editingId?await load(id):null;
  same(uid);
  composeCharacter(draft,rules,uid,id,existing);
  const ref=reference(uid,id);
  // This is a full owner-scoped transaction: another browser saving after
  // this form loaded cannot be overwritten silently.
  await firestoreSdk.runTransaction(db,async transaction=>{
   const snap=await transaction.get(ref);
   same(uid);
   if(editingId&&!snap.exists())throw new Error('Character no longer exists.');
   if(!editingId&&snap.exists())throw new Error('Generated character ID already exists.');
   const canonical=snap.exists()?{...snap.data(),id:snap.id}:null;
   if(canonical?.ownerUid!==undefined&&canonical.ownerUid!==uid)
    throw new Error('Character belongs to a different account.');
   if(editingId&&timestampValue(canonical?.updatedAt)!==
      timestampValue(existing?.updatedAt))
    throw new Error('Character changed in another session. Refresh before saving.');
   if(editingId&&canonical?.sourceCharacterId!==existing?.sourceCharacterId)
    throw new Error('Character link changed. Refresh before saving.');
   const final=composeCharacter(draft,rules,uid,id,canonical);
   transaction.set(ref,{...final,updatedAt:firestoreSdk.serverTimestamp()});
  });
  same(uid);
  return load(id);
 }
 return Object.freeze({availability:()=>flags,list,load,save});
}
