import {eventTime} from './liveEventReducer.mjs';

export const GM_REWARD_CURRENCIES=Object.freeze([
  {key:'copper',label:'Copper Penny'},
  {key:'silver',label:'Silver Mark'},
  {key:'gold',label:'Gold Crown'},
  {key:'platinum_crown',label:'Platinum Crown'},
  {key:'royal_crown',label:'Royal Crown'},
  {key:'royal_platinum',label:'Royal Platinum'}
]);
export const MAX_GM_REWARD_BUNDLES=20;
export const MAX_GM_REWARD_ITEMS=8;
const historyTypes=new Set(['loot-reward','currency-reward','xp-reward','magic-element-reward']);
const privateItemFields=new Set([
  'owner','ownerUid','userId','storageId','storageSlot','bagId','bagSlot',
  'equipped','equippedSlot','location','history','acquiredAt','receivedAt',
  'lastEquippedAt','createdBy','createdAt','updatedAt','playerNotes'
]);
const copy=value=>JSON.parse(JSON.stringify(value));
const name=value=>String(value||'').trim();

export function gmRewardCurrencyLabel(key){
  return GM_REWARD_CURRENCIES.find(row=>row.key===key)?.label||String(key||'');
}

export function validateGMRewardPayload(input={}){
  if(!input || typeof input!=='object'||Array.isArray(input))throw Error('Choose a valid reward.');
  if(input.items!==undefined&&!Array.isArray(input.items))throw Error('Reward items must be a list.');
  const source=Array.isArray(input.items)?input.items:[];
  if(source.length>MAX_GM_REWARD_ITEMS)throw Error('Use eight or fewer item types per reward bundle.');
  const items=source.map((item,index)=>{
    if(!item || typeof item!=='object'||Array.isArray(item))throw Error('Reward item '+(index+1)+' is invalid.');
    const realName=name(item.trueName||item.name||item.title);
    if(!realName||realName.length>160)throw Error('Choose an item with a valid name.');
    const qty=item.qty??item.quantity??1;
    if(!Number.isSafeInteger(qty)||qty<1||qty>1000000)
      throw Error('Choose a whole item quantity from 1 to 1000000.');
    const output=Object.fromEntries(Object.entries(copy(item)).filter(([key])=>!privateItemFields.has(key)));
    delete output.quantity;
    return {...output,name:realName,qty};
  });
  const currency=input.currency&&typeof input.currency==='object'&&!Array.isArray(input.currency)?input.currency:{};
  const key=currency.key||'gold',amount=currency.amount??0;
  if(!GM_REWARD_CURRENCIES.some(row=>row.key===key))throw Error('Choose a valid Asteria currency.');
  if(!Number.isSafeInteger(amount)||amount<0||amount>1000000000)
    throw Error('Enter a whole currency amount between 0 and 1000000000.');
  if(!items.length&&!amount)throw Error('Add an item or currency before awarding.');
  const bundleName=name(input.bundleName||'');
  const message=name(input.message||'');
  if(bundleName.length>100||message.length>500)throw Error('Reward title or note is too long.');
  return {items,currency:{key,amount},bundleName,message};
}

export function prepareGMRewardBundle(draft={},existing={}){
  const bundleName=name(draft.name||draft.bundleName);
  if(!bundleName||bundleName.length>100)throw Error('Enter a bundle name (1 to 100 characters).');
  const reward=validateGMRewardPayload({...draft,bundleName});
  const id=String(existing.id||draft.id||'');
  if(!/^[a-zA-Z0-9_-]{1,160}$/.test(id))throw Error('Bundle ID is invalid.');
  return {
    id,name:bundleName,
    currency:reward.currency,items:reward.items,message:reward.message,
    createdAt:existing.createdAt||new Date().toISOString(),
    updatedAt:new Date().toISOString()
  };
}

export function rewardEventStatus(event={}){
  const status=String(event.status||'').toLowerCase();
  if(event.type==='currency-reward')return 'Credited';
  if(event.type==='xp-reward')return event.acknowledged?'Seen':'Delivered';
  if(event.type==='quest-updated')return 'Claimed';
  return ({
    pending:'Pending',delivered:'Delivered',accepted:'Claimed',
    equipped:'Equipped',declined:'Declined',resolved:'Claimed',failed:'Failed'
  })[status]||'Pending';
}

export function rewardEventLabel(event={}){
  const payload=event.payload||{};
  if(event.type==='loot-reward'){
    const item=payload.item||{};
    return String(item.trueName||item.name||item.title||'Item')+
      ' x '+String(item.qty??item.quantity??1);
  }
  if(event.type==='currency-reward'){
    return String(payload.amount??0)+' '+gmRewardCurrencyLabel(payload.key);
  }
  if(event.type==='xp-reward')return String(payload.amount||0)+' XP';
  if(event.type==='magic-element-reward')return String(payload.magicType||'Magic element');
  if(event.type==='quest-updated')return String(payload.rewardSummary||'Quest reward');
  return '';
}

export function filterGMRewardEvents(events=[],filters={},characters={}){
  const seen=new Set();
  const text=name(filters.search).toLowerCase(),status=name(filters.status).toLowerCase();
  return (Array.isArray(events)?events:[]).filter(row=>{
    if(!row?.id||seen.has(row.id))return false;
    seen.add(row.id);
    return historyTypes.has(row.type)||
      (row.type==='quest-updated'&&Boolean(row.payload?.rewardSummary));
  }).filter(row=>{
    if(filters.characterId&&row.targetCharacterId!==filters.characterId)return false;
    if(filters.type&&row.type!==filters.type)return false;
    if(status&&rewardEventStatus(row).toLowerCase()!==status)return false;
    if(!text)return true;
    const recipient=characters?.[row.targetCharacterId]?.name||'';
    return [
      recipient,row.targetCharacterId, row.payload?.bundleName,row.payload?.message,
      rewardEventLabel(row),rewardEventStatus(row),row.type
    ].some(value=>String(value||'').toLowerCase().includes(text));
  }).sort((a,b)=>eventTime(b)-eventTime(a));
}
