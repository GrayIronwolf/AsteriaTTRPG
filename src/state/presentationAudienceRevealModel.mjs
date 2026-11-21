/** Improvement 7: per-UID, per-scene player-safe text reveals. No media or GM notes. */
export const AUDIENCE_REVEAL_TYPES=Object.freeze(['member','restricted']);
export const AUDIENCE_REVEAL_MAX_TITLE=120;
export const AUDIENCE_REVEAL_MAX_BODY=380;
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export const audienceRevealUid=value=>typeof value==='string'&&
  /^[A-Za-z0-9_-]{1,128}$/.test(value);
const revision=value=>Number.isSafeInteger(value)&&value>=1&&value<=1000000;
const exact=(value,keys)=>record(value)&&
  Object.keys(value).every(key=>keys.includes(key));

export function validateAudienceRevealAction(raw={}){
  if(!record(raw)||!['show','clear'].includes(raw.type)||
    !audienceRevealUid(raw.targetUid))throw Error('Invalid recipient or reveal action.');
  if(raw.type==='clear'){
    if(!exact(raw,['type','targetUid']))throw Error('Unsupported revoke fields.');
    return {type:'clear',targetUid:raw.targetUid};
  }
  if(!exact(raw,['type','targetUid','audience','sceneRevision','title','body'])||
    !AUDIENCE_REVEAL_TYPES.includes(raw.audience)||
    !revision(raw.sceneRevision)||typeof raw.title!=='string'||
    !raw.title.trim()||raw.title.length>AUDIENCE_REVEAL_MAX_TITLE||
    typeof raw.body!=='string'||raw.body.length>AUDIENCE_REVEAL_MAX_BODY)
    throw Error('Invalid audience, scene revision or reveal text.');
  return {type:'show',targetUid:raw.targetUid,audience:raw.audience,
    sceneRevision:raw.sceneRevision,title:raw.title.trim(),body:raw.body.trim()};
}

/** Only explicitly approved display text survives projection; never spread records. */
export function safeAudienceReveal(raw={},uid='',audience='',scene={},sessionEpoch=''){
  if(!record(raw)||!audienceRevealUid(uid)||raw.targetUid!==uid||
    !AUDIENCE_REVEAL_TYPES.includes(audience)||raw.audience!==audience||
    !revision(raw.sceneRevision)||!record(scene)||
    !revision(scene.revision)||scene.revision!==raw.sceneRevision||
    scene.scene==='blank'||typeof scene.scene!=='string'||!scene.scene||
    typeof raw.title!=='string'||!raw.title.trim()||
    raw.title.length>AUDIENCE_REVEAL_MAX_TITLE||
    typeof raw.body!=='string'||raw.body.length>AUDIENCE_REVEAL_MAX_BODY)
    return null;
  if(audience==='restricted'&&
    (!sessionEpoch||raw.sessionEpoch!==sessionEpoch))return null;
  return Object.freeze({title:raw.title.trim(),body:raw.body.trim(),
    sceneRevision:raw.sceneRevision});
}
export function gmAudienceRevealRows(rows=[],scene={}){
  if(!Array.isArray(rows)||!record(scene)||scene.scene==='blank')return [];
  return rows.filter(row=>record(row)&&audienceRevealUid(row.targetUid)&&
    AUDIENCE_REVEAL_TYPES.includes(row.audience)&&
    row.sceneRevision===scene.revision&&typeof row.title==='string'&&
    row.title.trim()&&row.title.length<=AUDIENCE_REVEAL_MAX_TITLE)
    .map(row=>Object.freeze({
      targetUid:row.targetUid,audience:row.audience,
      title:row.title.trim(),sceneRevision:row.sceneRevision
    }));
}
