import {isDeepStrictEqual} from 'node:util';
import {battleMapTokens} from '../src/state/battleMapModel.mjs';

const idPattern=/^[A-Za-z0-9_-]{1,160}$/;
const validId=value=>typeof value==='string'&&idPattern.test(value);
const clone=value=>JSON.parse(JSON.stringify(value));
const mapGeometry=['gridColumns','gridRows','metresPerCell','storagePath','contentType','width','height','imagePath','imageUrl','mediaId'];
export const recoveryOperations=new Set(['reopen','save-snapshot','restore-snapshot','delete-snapshot']);

export function captureEncounterRecovery(encounter,privateState,map,now){
  const saved=clone(encounter);
  delete saved.updatedAt;
  saved.combat.pending=null;
  const timer=saved.turnTimer;
  const restartTimer=Boolean(timer?.enabled&&timer.endsAt>now||privateState.resumeTurnTimer);
  if(timer?.enabled) saved.turnTimer={...timer,enabled:false,paused:true,endsAt:null,
    remainingSeconds:Math.max(0,Math.ceil((timer.endsAt-now)/1000))};
  const checkpoint={encounter:saved,privateState:clone({
    encounterSchedule:privateState.encounterSchedule||null,preparedDetails:privateState.preparedDetails||null,
    preparations:privateState.preparations||{},apSpends:privateState.apSpends||{},
    resumeTurnTimer:restartTimer
  }),map:map&&map.combatId===saved.combatId?{
    geometry:Object.fromEntries(mapGeometry.filter(key=>map[key]!==undefined).map(key=>[key,map[key]])),
    tokens:battleMapTokens(map.tokens||[]).filter(token=>token.combatantId),
    fogEnabled:map.fogEnabled===true,fogCells:map.fogCells||''
  }:null};
  if(Buffer.byteLength(JSON.stringify(checkpoint))>700000)
    throw Error('This encounter is too large to save a recovery checkpoint.');
  return checkpoint;
}

function recoverMap(map,saved,encounterId,reopening){
  if(!map||(!reopening&&map.combatId!==encounterId)||
    (reopening&&map.combatId&&map.combatId!==encounterId))
    throw Error('The saved battle map is unavailable or linked to another encounter.');
  const geometry=Object.fromEntries(mapGeometry.filter(key=>map[key]!==undefined).map(key=>[key,map[key]]));
  if(!isDeepStrictEqual(geometry,saved.geometry))
    throw Error('The battle map image or grid changed. Recover the original map configuration first.');
  const mapped=saved.tokens;
  const tokenIds=new Set(mapped.map(token=>token.id));
  const manual=battleMapTokens(map.tokens||[]).filter(token=>!token.combatantId);
  if(manual.some(token=>tokenIds.has(token.id))||manual.length+mapped.length>60)
    throw Error('Remove conflicting markers before restoring the map.');
  return {combatId:encounterId,tokens:battleMapTokens([...manual,...mapped]),
    fogEnabled:saved.fogEnabled,fogCells:saved.fogCells};
}

export async function applyEncounterRecovery({tx,db,doc,campaignId,encounterRef,gmRef,gmSnap,
  encounter,privateState,input,now,uid,requestId,serverTimestamp,isLinked}){
  const requested=input.operation;
  const reopening=requested==='reopen';
  const id=reopening?input.encounterId:encounter.combatId;
  if(!validId(id))throw Error('Choose an identified encounter.');
  if(reopening){
    if(encounter.status==='active'||privateState.pending)
      throw Error('Complete the active encounter and resolve any pending action first.');
  }else if(encounter.status!=='active')throw Error('Start combat before using encounter snapshots.');
  const mode=requested==='save-snapshot'?'save':requested==='delete-snapshot'?'delete':'restore';
  if(!reopening&&mode==='restore'&&privateState.pending)
    throw Error('Resolve the pending action before restoring a snapshot.');
  const name=typeof input.name==='string'?input.name.trim():'';
  if(mode==='save'&&(!name||name.length>80))throw Error('Enter a snapshot name of up to 80 characters.');
  const actorReason=typeof input.reason==='string'?input.reason.trim():'';
  if(mode==='restore'&&(!actorReason||actorReason.length>160))
    throw Error('Enter a recovery reason of up to 160 characters.');
  const revision=encounter.combat.revision||0;
  const historyRef=doc(db,'campaigns',campaignId,'encounterHistory',id);
  const listRef=doc(db,'campaigns',campaignId,'encounterHistory',id,'recovery','snapshotIndex');
  const snapshotId=reopening?'latest':mode==='save'?requestId:input.snapshotId;
  if(!validId(snapshotId)||(!reopening&&['latest','snapshotIndex'].includes(snapshotId)))
    throw Error('Choose a valid snapshot.');
  const snapshotRef=doc(db,'campaigns',campaignId,'encounterHistory',id,'recovery',snapshotId);
  const [indexSnap,snapshot,historySnap]=await Promise.all([
    tx.get(listRef),tx.get(snapshotRef),reopening?tx.get(historyRef):null
  ]);
  const entries=indexSnap.data()?.entries||[];
  const checkpoint=snapshot.data();
  const history=historySnap?.data();
  if(reopening&&(!history||history.reopened===true||history.revision!==input.expectedHistoryRevision))
    throw Error('The completion changed. Review the latest record before reopening.');
  if(mode==='save'&&snapshot.exists())return {ok:true,revision};
  if(mode==='save'&&entries.length>=8)throw Error('Remove a snapshot before saving another. Up to eight are kept per encounter.');
  if(mode!=='save'&&(!checkpoint||(!reopening&&!entries.some(row=>row.id===snapshotId))))
    throw Error('This encounter has no matching recovery checkpoint.');
  const savedEncounter=checkpoint?.encounter;
  if(mode==='restore'&&savedEncounter?.combatId!==id)throw Error('The checkpoint belongs to another encounter.');

  const mapId=mode==='restore'?savedEncounter.battleMapId:encounter.battleMapId;
  const mapRef=validId(mapId)?doc(db,'campaigns',campaignId,'battleMaps',mapId):null;
  const map=mapRef?(await tx.get(mapRef)).data():null;
  if(mode==='delete'){
    tx.delete(snapshotRef);
    tx.set(listRef,{entries:entries.filter(row=>row.id!==snapshotId)});
    return {ok:true,revision,message:'Snapshot removed.'};
  }
  if(mode==='save'){
    if(mapId&&map?.combatId!==id)throw Error('The linked battle map is unavailable.');
    const record=captureEncounterRecovery(encounter,privateState,map,now);
    tx.set(snapshotRef,record);
    tx.set(listRef,{entries:[{id:snapshotId,name,at:now,by:uid,revision},...entries]});
    return {ok:true,revision,message:'Private snapshot saved.'};
  }

  if(reopening){
    for(const row of savedEncounter.combatants.filter(row=>row.characterId)){
      const character=await tx.get(doc(db,'campaigns',campaignId,'characters',row.characterId));
      if(!character.exists()||!isLinked(row.characterId,character.data()))
        throw Error('A saved participant is no longer linked to this campaign.');
    }
  }else{
    const roster=rows=>rows.map(row=>[row.id,row.characterId||'']).sort(([a],[b])=>a.localeCompare(b));
    if(!isDeepStrictEqual(roster(encounter.combatants),roster(savedEncounter.combatants))||
      encounter.battleMapId!==savedEncounter.battleMapId)
      throw Error('The roster or linked map changed. Use individual GM corrections instead.');
  }
  if(Boolean(mapId)!==Boolean(checkpoint.map))throw Error('The checkpoint has no matching map data.');
  const mapPatch=checkpoint.map?recoverMap(map,checkpoint.map,id,reopening):null;
  const next=reopening?{
    ...savedEncounter,status:'active',paused:true,reopened:true
  }:{...encounter,combatants:[...encounter.combatants]};
  if(reopening){
    const state={...privateState,...checkpoint.privateState,pending:null};
    if(gmSnap.exists())tx.update(gmRef,{combatState:state});
    else tx.set(gmRef,{combatState:state});
    tx.update(historyRef,{reopened:true,reopenedAt:now,reopenedBy:uid,
      reopenReason:actorReason,revision:history.revision+1,updatedAt:serverTimestamp()});
  }else{
    const initiatives=new Map(savedEncounter.combatants.map(row=>[row.id,row]));
    const ordered=new Map(savedEncounter.combatants.map((row,index)=>[row.id,index]));
    const current=encounter.combatants[encounter.turnIndex]?.id;
    const turnsTaken=encounter.combat.turnsTaken||Object.fromEntries(
      encounter.combatants.slice(0,encounter.turnIndex+1).map(row=>[row.id,true])
    );
    next.combat={...encounter.combat,turnsTaken};
    next.combatants=next.combatants.map(row=>{
      const {initiative,initiativeSet}=initiatives.get(row.id);
      return {...row,...(initiative===undefined?{}:{initiative}),initiativeSet:initiativeSet===true};
    }).sort((a,b)=>ordered.get(a.id)-ordered.get(b.id));
    const adjusted=new Map(next.combatants.map(row=>[row.id,row]));
    next.enemies=(next.enemies||[]).map(row=>adjusted.get(row.id)||row);
    next.turnIndex=next.combatants.findIndex(row=>row.id===current);
  }
  if(mapPatch)tx.update(mapRef,{...mapPatch,updatedAt:serverTimestamp()});
  next.combat={...next.combat,revision:revision+1,log:[{
    id:requestId,at:now,actorUid:uid,reason:actorReason,snapshotId,
    message:reopening?'GM reopened the original encounter: '+actorReason:
      'GM restored snapshot positions, fog and initiative: '+actorReason
  },...(next.combat.log||[])].slice(0,80)};
  tx.set(encounterRef,{...next,updatedBy:uid,updatedAt:serverTimestamp()});
  return {ok:true,revision:revision+1,message:reopening?'Original encounter reopened in a paused state.':
    'Snapshot positions, fog and initiative restored. Current resources and turn progress were kept.'};
}

export function nextCompletionRecord(history,previous){
  const completionNumber=Number(previous?.completionNumber||0)+1;
  if(!previous)return {...history,completionNumber,recoveryAvailable:true,reopened:false};
  if(previous.reopened!==true)throw Error('This encounter was already completed and archived.');
  const approved=previous.status==='approved';
  const existingRewards=new Map((previous.rewards||[]).map(row=>[row.characterId,row]));
  return {...history,completionNumber,recoveryAvailable:true,reopened:false,
    revision:previous.revision+1,status:previous.status,outcome:previous.outcome,notes:previous.notes,
    rewards:approved?previous.rewards:history.rewards.map(row=>existingRewards.get(row.characterId)||row),
    deliveries:previous.deliveries||{},
    ...(approved?{approvedBy:previous.approvedBy,approvedAt:previous.approvedAt}:{})};
}
