/**
 * Phase 6.7: GM-only encounter waves/events. An encounter template is copied
 * into the private GM combat workspace at load time, never into public combat.
 * Round numbers are reminders; only explicit audited GM commands trigger them.
 */
export const ENCOUNTER_MAX_WAVES=8;
export const ENCOUNTER_MAX_EVENTS=16;
export const ENCOUNTER_MAX_WAVE_ENEMIES=20;
export const ENCOUNTER_MAX_TOTAL_ENEMIES=160;
export const ENCOUNTER_EVENT_TYPES=Object.freeze(['narrative','environment','objective']);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
const scheduledId=(value,type)=>typeof value==='string'&&
  new RegExp('^'+type+'-[A-Za-z0-9_-]{1,95}$').test(value);
const text=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
const validText=(value,max)=>typeof value==='string'&&value.trim().length>0&&
  value.trim().length<=max;
const round=value=>Number.isSafeInteger(value)&&value>=1&&value<=999;

export function validatePreparedWaves(value=[],normalizeEnemy,initialEnemyCount=0,mapId=''){
  if(!Array.isArray(value)||value.length>ENCOUNTER_MAX_WAVES)
    throw Error('Prepare no more than eight encounter waves.');
  if(typeof normalizeEnemy!=='function')throw Error('An enemy validator is required.');
  const seen=new Set();
  const waves=value.map(item=>{
    if(!object(item)||!scheduledId(item.id,'wave')||seen.has(item.id))
      throw Error('Every encounter wave needs a distinct valid ID.');
    seen.add(item.id);
    if(!validText(item.name,100))throw Error('Wave names must be 1–100 characters.');
    if(item.notes!==undefined&&(typeof item.notes!=='string'||item.notes.trim().length>400))
      throw Error('Wave notes must be at most 400 characters.');
    if(!round(item.round))throw Error('Wave round reminders must be from 1 to 999.');
    if(!Array.isArray(item.enemies)||item.enemies.length<1||
       item.enemies.length>ENCOUNTER_MAX_WAVE_ENEMIES)
      throw Error('Each wave needs between 1 and 20 enemies.');
    const enemies=item.enemies.map(normalizeEnemy);
    if(enemies.some(enemy=>!enemy))throw Error('Wave enemies need valid names, stats and map positions.');
    if(!mapId&&enemies.some(enemy=>enemy.spawn))
      throw Error('Select an encounter battle map before positioning wave enemies.');
    return {id:item.id,name:text(item.name,100),notes:text(item.notes||'',400),
      round:item.round,enemies};
  });
  const count=waves.reduce((n,item)=>n+item.enemies.length,Number(initialEnemyCount)||0);
  if(count>ENCOUNTER_MAX_TOTAL_ENEMIES)
    throw Error('An encounter and all its waves may contain at most 160 enemies.');
  return waves;
}
export function validatePreparedEvents(value=[]){
  if(!Array.isArray(value)||value.length>ENCOUNTER_MAX_EVENTS)
    throw Error('Prepare no more than sixteen encounter events.');
  const seen=new Set();
  return value.map(item=>{
    if(!object(item)||!scheduledId(item.id,'event')||seen.has(item.id))
      throw Error('Every encounter event needs a distinct valid ID.');
    seen.add(item.id);
    if(!validText(item.name,100))throw Error('Encounter event names must be 1–100 characters.');
    if(item.notes!==undefined&&(typeof item.notes!=='string'||item.notes.trim().length>600))
      throw Error('Event notes must be at most 600 characters.');
    if(!round(item.round))throw Error('Event round reminders must be from 1 to 999.');
    if(item.announce!==undefined&&typeof item.announce!=='boolean')
      throw Error('The event announcement setting must be on or off.');
    const type=item.type??'narrative';
    if(!ENCOUNTER_EVENT_TYPES.includes(type))throw Error('Choose a supported event type.');
    return {id:item.id,name:text(item.name,100),notes:text(item.notes||'',600),
      round:item.round,type,announce:item.announce===true};
  });
}

/** Captured once during the protected prepared-encounter load transaction. */
export function stageEncounterSchedule(plan,now=Date.now()){
  if(!object(plan)||!id(plan.id)||!Number.isSafeInteger(plan.revision)||
    plan.revision<1||!Number.isFinite(now))
    throw Error('A verified prepared encounter revision is required.');
  return {
    preparedId:plan.id,preparedRevision:plan.revision,stagedAt:now,
    waves:(plan.waves||[]).map(wave=>({...structuredClone(wave),
      status:'ready',processedAt:0,triggerRound:0})),
    events:(plan.events||[]).map(event=>({...structuredClone(event),
      status:'ready',processedAt:0,triggerRound:0}))
  };
}
export function encounterScheduleForGM(privateState){
  const state=privateState?.encounterSchedule;
  if(!object(state)||!id(state.preparedId))return null;
  const waves=(Array.isArray(state.waves)?state.waves:[]).slice(0,ENCOUNTER_MAX_WAVES)
    .filter(wave=>scheduledId(wave?.id,'wave')).map(wave=>({
      id:wave.id,name:text(wave.name,100),notes:text(wave.notes,400),
      round:round(wave.round)?wave.round:1,
      status:wave.status==='released'?'released':'ready',
      processedAt:Number.isFinite(wave.processedAt)?wave.processedAt:0,
      triggerRound:round(wave.triggerRound)?wave.triggerRound:0,
      enemies:(Array.isArray(wave.enemies)?wave.enemies:[]).slice(0,ENCOUNTER_MAX_WAVE_ENEMIES)
        .map(row=>({name:text(row.name,120),hp:Array.isArray(row.hp)?[...row.hp]:null,
          spawn:row.spawn&&typeof row.spawn.x==='number'?
            {x:row.spawn.x,y:row.spawn.y}:null}))
    }));
  const events=(Array.isArray(state.events)?state.events:[]).slice(0,ENCOUNTER_MAX_EVENTS)
    .filter(event=>scheduledId(event?.id,'event')).map(event=>({
      id:event.id,name:text(event.name,100),notes:text(event.notes,600),
      type:ENCOUNTER_EVENT_TYPES.includes(event.type)?event.type:'narrative',
      announce:event.announce===true,
      round:round(event.round)?event.round:1,
      status:event.status==='triggered'?'triggered':'ready',
      processedAt:Number.isFinite(event.processedAt)?event.processedAt:0,
      triggerRound:round(event.triggerRound)?event.triggerRound:0
    }));
  return Object.freeze({
    preparedId:state.preparedId,preparedRevision:state.preparedRevision,
    waves:Object.freeze(waves),events:Object.freeze(events)
  });
}

export function releaseEncounterWave(state,waveId,requestId,now=Date.now(),combatRound=1){
  if(!object(state)||!id(state.preparedId)||!scheduledId(waveId,'wave')||
    !id(requestId)||requestId.length>100||!round(combatRound))
    throw Error('This encounter has no valid prepared wave to release.');
  const wave=(Array.isArray(state.waves)?state.waves:[]).find(row=>row.id===waveId);
  if(!wave)throw Error('The chosen wave is not in the loaded encounter.');
  if(wave.status!=='ready')throw Error('This wave was already released.');
  if(!Array.isArray(wave.enemies)||wave.enemies.length<1||
    wave.enemies.length>ENCOUNTER_MAX_WAVE_ENEMIES)
    throw Error('The staged wave enemy roster is invalid.');
  const enemies=wave.enemies.map((enemy,index)=>{
    const enemyId='enemy-'+requestId+'-'+(index+1);
    if(!id(enemyId))throw Error('The generated wave participant ID is too long.');
    return {...structuredClone(enemy),id:enemyId,kind:'enemy',defeated:false};
  });
  const updated={...state,waves:state.waves.map(row=>row.id===waveId?
    {...row,status:'released',processedAt:now,triggerRound:combatRound}:row)};
  return {updated,wave,enemies};
}
export function triggerEncounterEvent(state,eventId,now=Date.now(),combatRound=1){
  if(!object(state)||!id(state.preparedId)||!scheduledId(eventId,'event')||
    !round(combatRound))
    throw Error('This encounter has no valid prepared event to trigger.');
  const event=(Array.isArray(state.events)?state.events:[]).find(row=>row.id===eventId);
  if(!event)throw Error('The event is not part of the loaded encounter.');
  if(event.status!=='ready')throw Error('This event was already triggered.');
  return {event,updated:{...state,events:state.events.map(row=>row.id===eventId?
    {...row,status:'triggered',processedAt:now,triggerRound:combatRound}:row)}};
}
