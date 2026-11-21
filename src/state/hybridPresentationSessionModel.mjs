/**
 * Phase 7.2 — temporary, authenticated presentation-only viewer grants.
 * The remote screen never reads the member dashboard, map, party, or combat
 * documents; unsupported scenes render as blackout until later phases.
 */
export const HYBRID_SESSION_MODES=Object.freeze(['in-person','hybrid','remote']);
export const HYBRID_SESSION_MAX_VIEWERS=24;
export const HYBRID_SESSION_MIN_MINUTES=15;
export const HYBRID_SESSION_MAX_MINUTES=600;
export const HYBRID_SESSION_DEFAULT=Object.freeze({
  revision:0,status:'closed',mode:'in-person',epoch:'',
  expiresAt:null,grantCount:0
});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export const hybridViewerId=value=>typeof value==='string'&&
  /^[A-Za-z0-9_-]{1,128}$/.test(value);
const exact=(value,allowed)=>{
  if(!object(value)||Object.keys(value).some(key=>!allowed.includes(key)))
    throw Error('Unsupported hybrid viewer session fields.');
};
const revision=value=>{
  if(!Number.isSafeInteger(value)||value<0||value>1000000)
    throw Error('Invalid hybrid session revision.');
  return value;
};
export function validateHybridSessionAction(action={}){
  if(!object(action)||!['open','close','grant','revoke'].includes(action.type))
    throw Error('Unsupported hybrid session action.');
  const fields={
    open:['type','expectedRevision','mode','durationMinutes'],
    close:['type','expectedRevision'],
    grant:['type','expectedRevision','uid','durationMinutes'],
    revoke:['type','expectedRevision','uid']
  };
  exact(action,fields[action.type]);
  revision(action.expectedRevision);
  if(action.type==='open'){
    if(!HYBRID_SESSION_MODES.includes(action.mode))
      throw Error('Choose an in-person, hybrid or remote session.');
  }
  if(['open','grant'].includes(action.type)){
    if(!Number.isSafeInteger(action.durationMinutes)||
      action.durationMinutes<HYBRID_SESSION_MIN_MINUTES||
      action.durationMinutes>HYBRID_SESSION_MAX_MINUTES)
      throw Error('Viewer access duration must be 15 to 600 minutes.');
  }
  if(['grant','revoke'].includes(action.type)&&!hybridViewerId(action.uid))
    throw Error('Choose a valid authenticated viewer UID.');
  return action;
}
export function restrictedPresentationProjection(scene={},revision=0){
  const safe=['title','announcement'].includes(scene?.scene);
  const title=safe&&typeof scene?.title==='string'?
    scene.title.slice(0,120):'';
  const subtitle=safe&&typeof scene?.subtitle==='string'?
    scene.subtitle.slice(0,380):'';
  const theme=['obsidian','slate','parchment'].includes(scene?.theme)?
    scene.theme:'obsidian';
  return Object.freeze({
    version:1,revision:Number.isSafeInteger(revision)&&revision>=0?revision:0,
    scene:safe?'title':'blank',title,subtitle,theme
  });
}
export function sessionTimestampMs(value){
  if(value instanceof Date)return value.getTime();
  if(value&&typeof value.toMillis==='function')return value.toMillis();
  if(value&&Number.isFinite(value.seconds))
    return value.seconds*1000+Number(value.nanoseconds||0)/1e6;
  return Number.isSafeInteger(value)?value:0;
}
export function hybridViewerCanRead(session={},grant={},uid='',now=Date.now()){
  if(!hybridViewerId(uid)||!Number.isFinite(now))return false;
  return session.status==='open'&&hybridViewerId(session.epoch)&&
    session.expiresAt&&sessionTimestampMs(session.expiresAt)>now&&
    grant.uid===uid&&grant.status==='active'&&
    grant.epoch===session.epoch&&grant.expiresAt&&
    sessionTimestampMs(grant.expiresAt)>now;
}
export function sanitizeRestrictedPresentation(raw={}){
  const safe=restrictedPresentationProjection(raw,raw.revision);
  // The viewer must not receive a different or unknown scene type from a
  // compromised source. Original documents remain GM controlled.
  return safe;
}
