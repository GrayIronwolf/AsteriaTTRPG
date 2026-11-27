/** Phase 6.6: pure projections and server-enforced GM live combat timer rules. */
export const LIVE_COMBAT_TIMER_PRESETS=Object.freeze([30,60,90,120,180]);
export const LIVE_COMBAT_TIMER_MAX=600;
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const boundedText=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
const safeId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
const validSeconds=value=>Number.isSafeInteger(value)&&value>=15&&value<=LIVE_COMBAT_TIMER_MAX;
const int=value=>Number.isSafeInteger(value)&&value>=0?value:0;

/** A display timer never advances combat or spends AP automatically. */
export function liveCombatTimerState(raw={},now=Date.now()){
  const source=record(raw)?raw:{};
  const seconds=validSeconds(source.durationSeconds)?source.durationSeconds:0;
  const endsAt=Number.isSafeInteger(source.endsAt)&&source.endsAt>0?source.endsAt:0;
  const enabled=source.enabled===true&&Boolean(endsAt);
  const remaining=enabled?Math.max(0,Math.ceil((endsAt-now)/1000)):
    Math.min(LIVE_COMBAT_TIMER_MAX,(Number.isSafeInteger(source.remainingSeconds)&&source.remainingSeconds>=0?source.remainingSeconds:seconds));
  return Object.freeze({
    configured:seconds>0,durationSeconds:seconds,enabled,
    endsAt:enabled?endsAt:0,remainingSeconds:remaining,
    autoStart:seconds>0&&source.autoStart===true,
    paused:seconds>0&&source.paused===true&&!enabled
  });
}
export function resetLiveTurnTimer(raw={},now=Date.now()){
  const timer=liveCombatTimerState(raw,now);
  if(!timer.configured||!timer.autoStart)
    return {...raw,enabled:false,endsAt:null,paused:false,
      remainingSeconds:timer.durationSeconds||0};
  return {...raw,enabled:true,endsAt:now+timer.durationSeconds*1000,
    paused:false,remainingSeconds:timer.durationSeconds};
}
export function applyLiveTimerCommand(raw={},command={},status='ready',now=Date.now()){
  if(!record(command)||!['configure','pause','resume','disable'].includes(command.mode))
    throw Error('Choose a supported GM timer command.');
  const original=liveCombatTimerState(raw,now);
  if(command.mode==='configure'){
    if(!validSeconds(command.seconds))throw Error('Turn timers must be between 15 and 600 seconds.');
    const active=status==='active';
    return {durationSeconds:command.seconds,autoStart:command.autoStart!==false,
      enabled:active,endsAt:active?now+command.seconds*1000:null,
      remainingSeconds:command.seconds,paused:false};
  }
  if(command.mode==='disable')
    return {durationSeconds:original.durationSeconds,autoStart:false,enabled:false,
      endsAt:null,remainingSeconds:original.durationSeconds,paused:false};
  if(status!=='active')throw Error('Start combat before pausing or resuming the turn timer.');
  if(!original.configured)throw Error('Configure a turn timer first.');
  if(command.mode==='pause'){
    if(!original.enabled)throw Error('The timer is not running.');
    return {durationSeconds:original.durationSeconds,autoStart:original.autoStart,
      enabled:false,endsAt:null,remainingSeconds:original.remainingSeconds,paused:true};
  }
  if(original.enabled||!original.paused)
    throw Error('Only a paused turn timer may resume.');
  if(original.remainingSeconds<=0)throw Error('The timer expired. Reset it to continue.');
  return {durationSeconds:original.durationSeconds,autoStart:original.autoStart,
    enabled:true,endsAt:now+original.remainingSeconds*1000,
    remainingSeconds:original.remainingSeconds,paused:false};
}

/** Never send raw private GM approval data, inventories, sources or spell details to the browser. */
export function projectGMLivePending(state={}){
  const pending=record(state?.pending)?state.pending:null;
  if(!pending)return null;
  const status=boundedText(pending.status,40);
  if(!['awaiting-approval','reactions','awaiting-roll','awaiting-resolution'].includes(status))
    return null;
  const result=record(pending.result)?pending.result:null;
  const approval=record(pending.approval)?pending.approval:{};
  return Object.freeze({
    id:safeId(pending.id)?pending.id:'',
    actorId:safeId(pending.actorId)?pending.actorId:'',
    actorName:boundedText(pending.actorName,120),
    name:boundedText(pending.name,120),key:boundedText(pending.key,60),
    kind:boundedText(pending.kind,40),optionId:boundedText(pending.optionId,160),
    status,ap:int(pending.ap),bonus:pending.bonus===true,
    targetIds:Object.freeze((Array.isArray(pending.targetIds)?pending.targetIds:[])
      .filter(safeId).slice(0,24)),
    checkType:boundedText(approval.checkType,30),
    rollSuccess:typeof result?.success==='boolean'?result.success:null,
    hit:typeof result?.hit==='boolean'?result.hit:null,
    resultText:boundedText(result?.check,80),
    reactionActorId:safeId(pending.window?.[pending.windowIndex||0]?.actorId)?
      pending.window[pending.windowIndex||0].actorId:'',
    reactionChoices:Object.freeze((Array.isArray(pending.window?.[pending.windowIndex||0]?.choices)?
      pending.window[pending.windowIndex||0].choices:[]).filter(value=>
      typeof value==='string'&&value.length<=40).slice(0,8)),
    reactionCommitted:Boolean(pending.reaction),
    reactionCount:Array.isArray(pending.window)?Math.min(24,pending.window.length):0,
    reactionIndex:int(pending.windowIndex),
    reactionKey:boundedText(pending.reaction?.key,40)
  });
}
export function projectGMLiveLog(log){
  if(!Array.isArray(log))return [];
  return log.slice(0,30).filter(record).map(entry=>Object.freeze({
    id:safeId(entry.id)?entry.id:'',
    message:boundedText(entry.message,300),
    at:Number.isFinite(entry.at)&&entry.at>0?entry.at:0
  })).filter(entry=>entry.message);
}
export function gmMayAdvanceTurn(combat,pending){
  if(!combat||combat.status!=='active')return {allowed:false,reason:'Combat is not active.'};
  if(combat.paused)return {allowed:false,reason:'Combat is paused.'};
  if(!combat.sessionEditable)return {allowed:false,reason:'The campaign session is not editable.'};
  if(pending)return {allowed:false,reason:'Resolve the current action first.'};
  if(combat.current?.pendingDeathSave)return {
    allowed:false,reason:'Resolve the current combatant’s death save first.'
  };
  return {allowed:true,needsConfirmation:combat.current?.turnComplete!==true};
}
