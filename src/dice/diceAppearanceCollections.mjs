/** Private account appearance collections. This data never affects rolls. */
import {MAX_APPEARANCE_COLLECTIONS,validateDiceAppearance} from './diceAppearanceCatalogue.mjs';
import {defaultDiceTrayAppearance,validateDiceTrayAppearance} from './diceTrayCatalogue.mjs';
export const DICE_LIBRARY_VERSION=2;
export const MAX_DICE_LIBRARY_BYTES=160000;
const actions=['appearance-save','appearance-duplicate','appearance-delete','appearance-default','appearance-assign','appearance-unassign'];
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
function fields(v,allowed){if(!plain(v)||Object.keys(v).some(k=>!allowed.includes(k)))throw Error('Invalid appearance fields.');}
function id(v){if(typeof v!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(v))throw Error('Invalid appearance ID.');return v;}
function title(v){if(typeof v!=='string')throw Error('Invalid collection name.');const name=v.trim().replace(/\s+/g,' ');if(!name||name.length>60)throw Error('Collection name must be 1-60 characters.');return name;}
function timestamp(v){if(!Number.isSafeInteger(v)||v<0)throw Error('Invalid timestamp.');return v;}
export function emptyDiceAppearanceLibrary(){return {version:2,revision:0,defaultCollectionId:null,collections:[],assignments:{}};}
function entry(v,index,legacy=false){
 fields(v,legacy?['version','id','name','dice','tray','createdAt','updatedAt']:['id','name','dice','tray','createdAt','updatedAt']);
 if(!legacy&&Object.keys(v).length!==6)throw Error('Incomplete collection.');
 if(legacy&&v.version!==1)throw Error('Unsupported legacy version.');
 return {id:id(v.id||'legacy-'+String(index).padStart(8,'0')),name:title(v.name),
  dice:validateDiceAppearance(v.dice),tray:validateDiceTrayAppearance(v.tray||defaultDiceTrayAppearance()),
  createdAt:timestamp(v.createdAt??0),updatedAt:timestamp(v.updatedAt??0)};
}
export function normalizeDiceAppearanceLibrary(raw={}){
 if(raw==null||plain(raw)&&Object.keys(raw).length===0)return emptyDiceAppearanceLibrary();
 if(!plain(raw))throw Error('Invalid appearance library.');
 const legacy=raw.version===1;
 if(!legacy&&raw.version!==2)throw Error('Unsupported appearance library version.');
 fields(raw,legacy?['version','collections','defaultCollectionId','assignments','updatedAt']:
  ['version','revision','defaultCollectionId','collections','assignments','updatedAt','ownerUid']);
 if(!Array.isArray(raw.collections)||raw.collections.length>MAX_APPEARANCE_COLLECTIONS)throw Error('Too many appearance collections.');
 const collections=raw.collections.map((x,i)=>entry(x,i,legacy)),known=new Set(collections.map(x=>x.id));
 if(known.size!==collections.length||new Set(collections.map(x=>x.name.toLowerCase())).size!==collections.length)throw Error('Duplicate appearance collection.');
 const defaultCollectionId=raw.defaultCollectionId??null;
 if(defaultCollectionId!==null&&(!id(defaultCollectionId)||!known.has(defaultCollectionId)))throw Error('Unknown default appearance.');
 const src=raw.assignments??{};
 if(!plain(src)||Object.keys(src).length>120)throw Error('Invalid appearance assignments.');
 const assignments={};
 for(const [character,collection] of Object.entries(src)){id(character);id(collection);if(!known.has(collection))throw Error('Unknown assigned collection.');assignments[character]=collection;}
 const revision=legacy?0:raw.revision;
 if(!Number.isSafeInteger(revision)||revision<0)throw Error('Invalid appearance revision.');
 const value={version:2,revision,defaultCollectionId,collections,assignments};
 if(JSON.stringify(value).length>MAX_DICE_LIBRARY_BYTES)throw Error('Appearance library too large.');
 return value;
}
export function appearanceForCharacter(raw,characterId=''){
 const library=normalizeDiceAppearanceLibrary(raw);
 const assigned=characterId?library.assignments[characterId]:null;
 return library.collections.find(x=>x.id===(assigned||library.defaultCollectionId))||null;
}
export function validateDiceAppearanceAction(req){
 if(!plain(req)||!actions.includes(req.action))throw Error('Unsupported appearance action.');
 const allowed={
  'appearance-save':['action','expectedRevision','collection'],
  'appearance-duplicate':['action','expectedRevision','collectionId','newId','name'],
  'appearance-delete':['action','expectedRevision','collectionId'],
  'appearance-default':['action','expectedRevision','collectionId'],
  'appearance-assign':['action','expectedRevision','collectionId','characterId'],
  'appearance-unassign':['action','expectedRevision','characterId']
 }[req.action];
 fields(req,allowed);
 if(Object.keys(req).length!==allowed.length||!Number.isSafeInteger(req.expectedRevision)||req.expectedRevision<0)throw Error('Invalid appearance revision.');
 const v={action:req.action,expectedRevision:req.expectedRevision};
 if(req.action==='appearance-save'){
  fields(req.collection,['id','name','dice','tray']);
  if(Object.keys(req.collection).length!==4)throw Error('Incomplete collection.');
  v.collection={id:id(req.collection.id),name:title(req.collection.name),
   dice:validateDiceAppearance(req.collection.dice),tray:validateDiceTrayAppearance(req.collection.tray)};
 }
 if(allowed.includes('collectionId'))v.collectionId=req.action==='appearance-default'&&req.collectionId===null?null:id(req.collectionId);
 if(allowed.includes('characterId'))v.characterId=id(req.characterId);
 if(allowed.includes('newId'))v.newId=id(req.newId);
 if(allowed.includes('name'))v.name=title(req.name);
 return v;
}
export function applyDiceAppearanceMutation(raw,input,now){
 const library=normalizeDiceAppearanceLibrary(raw),req=validateDiceAppearanceAction(input);
 if(library.revision!==req.expectedRevision)throw Error('Appearance library changed on another device. Review the updated list and retry.');
 timestamp(now);
 const collections=[...library.collections],assignments={...library.assignments};
 let defaultCollectionId=library.defaultCollectionId;
 const find=key=>collections.findIndex(c=>c.id===key);
 const required=key=>{const i=find(key);if(i<0)throw Error('Appearance collection not found.');return i;};
 const unique=(name,except)=>{if(collections.some(c=>c.id!==except&&c.name.toLowerCase()===name.toLowerCase()))throw Error('Collection name already exists.');};
 const add=c=>{if(collections.length>=20)throw Error('Maximum 20 appearance collections reached.');if(find(c.id)>=0)throw Error('Collection ID already exists.');unique(c.name,null);collections.push(c);if(!defaultCollectionId)defaultCollectionId=c.id;};
 switch(req.action){
  case 'appearance-save':{
   const c=req.collection,i=find(c.id);
   if(i>=0){unique(c.name,c.id);collections[i]={...collections[i],...c,updatedAt:now};}
   else add({...c,createdAt:now,updatedAt:now});break;
  }
  case 'appearance-duplicate':{
   const origin=collections[required(req.collectionId)];
   add({id:req.newId,name:req.name,dice:origin.dice,tray:origin.tray,createdAt:now,updatedAt:now});break;
  }
  case 'appearance-delete':{
   collections.splice(required(req.collectionId),1);
   if(defaultCollectionId===req.collectionId)defaultCollectionId=collections[0]?.id||null;
   for(const [key,value] of Object.entries(assignments))if(value===req.collectionId)delete assignments[key];break;
  }
  case 'appearance-default':{
   if(req.collectionId!==null)required(req.collectionId);defaultCollectionId=req.collectionId;break;
  }
  case 'appearance-assign':{
   required(req.collectionId);
   if(!assignments[req.characterId]&&Object.keys(assignments).length>=120)throw Error('Too many assignments.');
   assignments[req.characterId]=req.collectionId;break;
  }
  case 'appearance-unassign':delete assignments[req.characterId];break;
 }
 return normalizeDiceAppearanceLibrary({version:2,revision:library.revision+1,collections,assignments,defaultCollectionId});
}
