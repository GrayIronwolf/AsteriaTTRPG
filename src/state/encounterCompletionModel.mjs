import {validateGMRewardPayload} from './gmRewardModel.mjs';

// Private, immutable combat snapshots and explicitly approved award proposals.
// Gameplay changes are made only by the existing grantCharacterXP and
// grantGMRewardBundle transactions; this model never alters a character.
export const ENCOUNTER_COMPLETION_HISTORY_PAGE_SIZE=30;
export const ENCOUNTER_COMPLETION_MAX_RECIPIENTS=60;
export const ENCOUNTER_COMPLETION_OUTCOMES=Object.freeze([
  'unresolved','victory','defeat','retreat','stalemate'
]);
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value)&&
  !['__proto__','prototype','constructor'].includes(value);
const list=value=>Array.isArray(value)?value:[];
const label=(value,max=160)=>String(value||'').trim().slice(0,max);
const number=value=>Number.isFinite(Number(value))?Math.max(0,Math.trunc(Number(value))):0;
const valuePair=value=>Array.isArray(value)&&value.length>=2?
  [number(value[0]),number(value[1])]:null;
const text=value=>typeof value==='string'?value:'';

export function captureEncounterCompletion(encounter={},privateState={},characters=new Map(),
  {endedAt=Date.now(),endedBy='',sessionId=''}={}){
  if(encounter.status!=='active'||!validId(encounter.combatId)||
    !Number.isSafeInteger(endedAt)||endedAt<=0||!validId(endedBy))
    throw Error('Only an identified, active encounter may be completed.');
  const all=list(encounter.combatants).slice(0,160);
  if(!all.length||all.some(row=>!validId(row.id)))
    throw Error('The encounter has no valid participants to archive.');
  const participants=all.map(row=>{
    const pc=validId(row.characterId);
    const live=pc?(characters.get(row.characterId)||row):row;
    const hp=valuePair(live.hp),sp=valuePair(live.sp),mp=valuePair(live.mp);
    const downed=live.downed?.dead===true||(!hp?false:hp[0]<=0);
    const outcome=row.defeated===true||(downed&&!pc)?'defeated':
      downed?'downed':'surviving';
    const xp=Number(row.xpReward);
    return {
      id:row.id,characterId:pc?row.characterId:'',kind:pc?'player':'enemy',
      name:label(row.name||live.name||'Participant',120),
      initiative:Number.isFinite(Number(row.initiative))?Number(row.initiative):null,
      outcome,...(hp?{hp}:{}),...(sp?{sp}:{}),...(mp?{mp}:{}),
      ...(!pc&&Number.isSafeInteger(xp)&&xp>=0&&xp<=1000000000?
        {xpReward:xp}:{})
    };
  });
  const enemies=participants.filter(row=>row.kind==='enemy');
  const defeated=enemies.filter(row=>row.outcome==='defeated');
  const schedule=privateState.encounterSchedule||{};
  const waves=list(schedule.waves).slice(0,8).map(wave=>({
    id:label(wave.id),name:label(wave.name,100),
    status:wave.status==='released'?'released':'not-released',
    ...(wave.triggerRound?{triggerRound:number(wave.triggerRound)}:{})
  }));
  const events=list(schedule.events).slice(0,16).map(event=>({
    id:label(event.id),name:label(event.name,100),
    type:['narrative','environment','objective'].includes(event.type)?
      event.type:'narrative',
    status:event.status==='triggered'?'triggered':'not-triggered',
    ...(event.triggerRound?{triggerRound:number(event.triggerRound)}:{})
  }));
  const recipientIds=[...new Set(participants.filter(row=>row.characterId)
    .map(row=>row.characterId))];
  if(recipientIds.length>ENCOUNTER_COMPLETION_MAX_RECIPIENTS)
    throw Error('Too many linked players for reward review.');
  return {
    id:encounter.combatId,status:'pending-review',revision:1,
    endedAt,endedBy,sessionId:label(sessionId),
    preparedEncounterId:label(encounter.preparedEncounterId),
    name:label(encounter.name||'Combat Encounter',120),
    rounds:Math.max(1,number(encounter.round)),outcome:'unresolved',
    notes:label(privateState.preparedDetails?.rewardNotes,600),
    participants,actions:list(encounter.combat?.log).slice(0,80).map(row=>({
      id:label(row.id),at:number(row.at),message:label(row.message,300)
    })),waves,events,
    xpSuggested:defeated.reduce((sum,row)=>sum+number(row.xpReward),0),
    xpUnconfigured:defeated.filter(row=>row.xpReward===undefined).length,
    summary:{
      players:participants.filter(row=>row.kind==='player').length,
      enemies:enemies.length,defeatedEnemies:defeated.length,
      downedPlayers:participants.filter(row=>row.kind==='player'&&row.outcome==='downed').length
    },
    rewards:recipientIds.map(characterId=>({
      characterId,xp:0,currency:{key:'copper',amount:0},items:[]
    })),
    deliveries:{}
  };
}

export function validateEncounterCompletionAction(raw={}){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||
    !['review','approve'].includes(raw.type)||!validId(raw.encounterId)||
    !Number.isSafeInteger(raw.expectedRevision)||raw.expectedRevision<1)
    throw Error('Choose a valid encounter completion and current revision.');
  if(raw.type==='approve'){
    if(raw.confirmation!=='approve-rewards'||
      Object.keys(raw).some(key=>!['type','encounterId','expectedRevision','confirmation'].includes(key)))
      throw Error('Explicitly confirm the reviewed encounter rewards.');
    return {type:'approve',encounterId:raw.encounterId,
      expectedRevision:raw.expectedRevision};
  }
  if(Object.keys(raw).some(key=>![
    'type','encounterId','expectedRevision','outcome','notes','rewards'
  ].includes(key)))throw Error('Unsupported encounter review field.');
  if(!ENCOUNTER_COMPLETION_OUTCOMES.includes(raw.outcome))
    throw Error('Choose a valid encounter outcome.');
  if(typeof raw.notes!=='string'||raw.notes.length>1500)
    throw Error('Encounter notes must be 1,500 characters or fewer.');
  if(!Array.isArray(raw.rewards)||
    raw.rewards.length>ENCOUNTER_COMPLETION_MAX_RECIPIENTS)
    throw Error('Encounter rewards must be a bounded list of players.');
  const seen=new Set(),rewards=raw.rewards.map(row=>{
    if(!row||typeof row!=='object'||Array.isArray(row)||
      Object.keys(row).some(key=>!['characterId','xp','currency','items'].includes(key))||
      !validId(row.characterId)||seen.has(row.characterId))
      throw Error('Each reward recipient must be a distinct linked player.');
    seen.add(row.characterId);
    if(!Number.isSafeInteger(row.xp)||row.xp<0||row.xp>1000000)
      throw Error('XP must be a whole amount between 0 and 1,000,000 per player.');
    const items=row.items??[],currency=row.currency??{key:'copper',amount:0};
    if(!Array.isArray(items)||!currency||typeof currency!=='object'||
      Array.isArray(currency))throw Error('Invalid reward items or currency.');
    // The same validator used by the canonical GM delivery path owns item and
    // currency limits. Empty bundles are allowed for XP-only/no-reward review.
    const amount=currency.amount===undefined?0:currency.amount;
    const normalized=items.length||amount?
      validateGMRewardPayload({items,currency:{key:currency.key||'copper',amount}}):
      {items:[],currency:{key:'copper',amount:0}};
    return {characterId:row.characterId,xp:row.xp,
      currency:normalized.currency,items:normalized.items};
  });
  if(JSON.stringify(rewards).length>22000)
    throw Error('The encounter reward proposal exceeds the safe size limit.');
  return {type:'review',encounterId:raw.encounterId,
    expectedRevision:raw.expectedRevision,outcome:raw.outcome,
    notes:text(raw.notes).trim(),rewards};
}

// Asteria's GM reward validator deliberately rejects empty bundles. Accept an
// empty proposal for review but never for delivery.
export function hasEncounterBundle(row={}){
  return list(row.items).length>0||Number(row.currency?.amount)>0;
}

export function assertApprovedEncounterDelivery(history={},characterId='',kind='',payload){
  if(history.reopened===true)throw Error('Complete the reopened encounter before delivering rewards.');
  if(history.status!=='approved')throw Error('The GM must approve this encounter before awarding rewards.');
  if(!validId(characterId)||!['xp','bundle'].includes(kind))
    throw Error('Choose a valid encounter reward recipient and type.');
  const reward=list(history.rewards).find(row=>row.characterId===characterId);
  if(!reward)throw Error('This character is not in the approved reward proposal.');
  if(history.deliveries?.[characterId]?.[kind])
    throw Error('This encounter reward has already been delivered.');
  if(kind==='xp'){
    if(!Number.isSafeInteger(reward.xp)||reward.xp<1||reward.xp!==payload)
      throw Error('Requested XP differs from the approved encounter reward.');
  }else{
    if(!hasEncounterBundle(reward))
      throw Error('No item or currency reward was approved for this character.');
    const approved=validateGMRewardPayload({items:reward.items,currency:reward.currency});
    const proposed=validateGMRewardPayload(payload);
    if(JSON.stringify([approved.items,approved.currency])!==
      JSON.stringify([proposed.items,proposed.currency]))
      throw Error('Requested items or currency differ from the approved encounter reward.');
  }
  return reward;
}

export function encounterDeliveryPatch(history={},characterId,kind,requestId,at,by){
  if(!validId(characterId)||!validId(requestId)||!validId(by))
    throw Error('Invalid encounter reward delivery receipt.');
  return {
    revision:history.revision+1,
    deliveries:{...(history.deliveries||{}),
      [characterId]:{...(history.deliveries?.[characterId]||{}),
        [kind]:{requestId,at,by}}}
  };
}
