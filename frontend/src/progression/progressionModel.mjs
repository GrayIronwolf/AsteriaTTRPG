import {UNIVERSAL_CHECK_TYPES,UNIVERSAL_CHARACTERISTICS,UNIVERSAL_CHECK_RANKS} from '../../../src/state/universalCheckModel.mjs';
import {CHARACTERISTICS,characteristicCap,characteristicValue,talentRankCost,talentTierUnlocked,nextSkillProgress} from '../../../src/state/liveWorkspaceModel.mjs';
import {buildTalentCatalog,talentRank,rankDefined,prerequisiteProblem} from '../../../src/state/talentModel.mjs';
import {talentRules} from '../../../src/state/talentMechanics.mjs';
import {characterCheck} from '../../../src/state/effectsEngine.mjs';
import {talentEffectActive} from '../../../src/state/talentModel.mjs';

const array=v=>Array.isArray(v)?v:[];
const record=v=>v&&typeof v==='object'&&!Array.isArray(v);
const text=(v,max=120)=>typeof v==='string'?v.slice(0,max):'';
export const PROGRESSION_STATS=Object.freeze(CHARACTERISTICS.map(row=>Object.freeze({key:row.key,label:row.label})));
export const CHECK_TYPES=UNIVERSAL_CHECK_TYPES;
export const CHECK_STATS=UNIVERSAL_CHARACTERISTICS;
export const CHECK_RANKS=Object.freeze(Object.keys(UNIVERSAL_CHECK_RANKS));
export const MILESTONE_LEVELS=Object.freeze([10,30,50,70,90]);

export function progressionProjection(character={}){
  const level=Math.max(0,Math.floor(Number(character.level)||0));
  const stats=PROGRESSION_STATS.map(stat=>Object.freeze({
    ...stat,value:characteristicValue(character,stat.key),cap:characteristicCap(character,stat.key)
  }));
  const named=character.feats||character.unlockedFeats||character.selectedFeats||[];
  const feats=(Array.isArray(named)?named:Object.entries(named||{}).map(([name,v])=>record(v)?{name,...v}:{name}))
    .map(x=>text(typeof x==='string'?x:x.name||x.title,100)).filter(Boolean).slice(0,40);
  return Object.freeze({level,xp:Math.max(0,Number(character.xp)||0),
    xpMax:Math.max(0,Number(character.xpMax)||0),
    cp:Math.max(0,Math.floor(Number(character.cp)||0)),tp:Math.max(0,Math.floor(Number(character.tp)||0)),
    stats:Object.freeze(stats),feats:Object.freeze(feats),
    milestoneLevels:Object.freeze(MILESTONE_LEVELS.filter(n=>n<=level)),
    // The existing backend has no callable feat purchasing/selection command.
    // Display milestones without creating rewards or saving unauthorized fields.
    featSelectionEnabled:false,
    coreRevision:Math.max(0,Math.floor(Number(character.coreRevision)||0))});
}
const slug=v=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export function skillProjection(character={}){
  const source=character.skills??character.selectedSkills??[];
  const rows=array(source).length?source:record(source)?
    Object.entries(source).map(([name,value])=>record(value)?{...value,name:value.name||name}:{name,rank:value}):[];
  return Object.freeze(rows.filter(Boolean).slice(0,100).map((row,index)=>{
    const name=text(typeof row==='string'?row:row.name||row.title,100);
    const progress=character.skillProgress?.[slug(name)]||{};
    const oldRank=progress.rankName||row.rankName||progress.rank||row.rank||'Untrained';
    const projected=nextSkillProgress({...progress,rank:oldRank,successes:Number(progress.successes||0)-1});
    // Only display existing progress, never auto-advance it when viewing.
    const successes=Math.max(0,Number(progress.successes)||0);
    const target=Number(progress.target??projected.target)||0;
    const id=text(row.id,160)||slug(name)||'skill-'+index;
    const result=characterCheck(character,'skills.'+id,0);
    const techniques=array(row.techniques).slice(0,30).map(technique=>Object.freeze({
      name:text(typeof technique==='string'?technique:technique?.name||technique?.title,100),
      detail:text(technique?.description||technique?.summary,700)
    })).filter(technique=>technique.name);
    return Object.freeze({id,name,
      rank:String(oldRank),successes,target,
      category:text(row.category||row.type,80)||'Skill',
      summary:text(row.summary||row.description,700),
      modifier:Number.isFinite(result.value)?result.value:0,
      advantage:result.advantage===true,disadvantage:result.disadvantage===true,
      techniques:Object.freeze(techniques)});
  }).filter(row=>row.name));
}
/** Published rank text is public but backend still resolves its own catalog.
 * Never issue a purchase unless authored rank content is present. */
export function publishedTalentCatalog(character,forgeTalents=[],entryRows=[]){
  const bySlug=new Map(array(entryRows).map(row=>[row.slug,row]));
  const entries=array(forgeTalents).filter(x=>x.domain==='talent'&&x.playable===true).map(row=>{
    const entry=bySlug.get(row.slug);
    const body=entry?entry.sections.map(section=>'## '+section.title+'\n'+section.body).join('\n\n'):'';
    return {type:'talent',title:row.title,className:row.rules?.classSlug||'',
      id:row.id,body,metadata:{talentTier:row.rules?.tier||'1',
        prerequisite:row.rules?.prerequisite||'None',ranks:5}};
  });
  return Object.freeze(buildTalentCatalog(character,entries));
}
/** Owner-scoped, read-only active effects. Mutations go through the existing
 * endCharacterTalentEffect callable and must be independently authorised. */
export function activeTalentEffectProjection(character={}){
  return Object.freeze(array(character.talentEffects).filter(effect=>
    record(effect)&&typeof effect.id==='string'&&
    /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,159}$/.test(effect.id)&&
    talentEffectActive(effect)).slice(0,60).map(effect=>Object.freeze({
    id:effect.id,name:text(effect.name||'Talent effect',120),
    description:text(effect.description,1500),
    ac:Number.isFinite(Number(effect.ac))?Number(effect.ac):0,
    untilRound:Number.isSafeInteger(Number(effect.untilRound))?Number(effect.untilRound):0,
    expiresAt:Number.isFinite(Number(effect.expiresAt))?Number(effect.expiresAt):0
  })));
}
export function talentProjection(character,catalog=[]){
  return Object.freeze(array(catalog).map(talent=>{
    const rank=talentRank(character,talent,catalog);
    const next=rank+1,cost=talentRankCost(next,talent.tier);
    const prerequisite=prerequisiteProblem(character,talent,catalog);
    const reason=rank>=talent.maxRank?'Maximum rank learned':
      !talentTierUnlocked(character.level,talent.tier)?'Tier not yet unlocked':
      prerequisite?prerequisite:
      !rankDefined(talent,next)?'Authored rank details unavailable':
      Number(character.tp||0)<cost?'Insufficient Talent Points':'';
    const active=rank>0?talentRules(talent,rank):null;
    return Object.freeze({id:talent.id,name:talent.name,className:talent.className,
      tier:talent.tier,rank,maxRank:talent.maxRank,cost,reason,
      canBuy:!reason,canUse:rank>0&&active?.activation===true&&!active.blocked,
      activationBlocked:active?.blocked||'',kind:active?.passive?'Passive':'Active',
      requiresTrigger:active?.requiresTrigger===true,
      targetChoice:active?.targetChoice===true,
      requiresChoice:Boolean(active?.choices?.length),choices:active?.choices?.map(x=>({
        id:x.id,label:x.label
      }))||[],needsSpell:active?.needsSpell===true,sourceId:talent.sourceId
    });
  }));
}
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(id);
export function checkProjection(rows,mode='player',characterId=''){
  return Object.freeze(array(rows).filter(row=>record(row)&&validId(row.id)&&
    (mode==='gm'||row.characterId===characterId)).slice(0,100).map(row=>Object.freeze({
    id:row.id,characterId:row.characterId,characterName:text(row.characterName,100),
    type:text(row.type,40),skill:text(row.skill,100),characteristic:text(row.characteristic,50),
    status:text(row.status,40),dc:Number.isFinite(Number(row.dc))&&row.dc!==null?Number(row.dc):null,
    modifierTotal:Number(row.modifierTotal)||0,
    modifiers:Object.freeze(array(row.modifiers).slice(0,30).map(m=>Object.freeze({
      label:text(m.label,120),value:Number(m.value)||0}))),
    description:text(row.description,500),npcName:text(row.npcName,100),
    // Server-validated NPC origin; only the GM uses this ID to scope related history.
    contextNpcId:mode==='gm'&&row.context?.kind==='npc'&&validId(row.context?.npcId)?
      row.context.npcId:'',
    advantage:row.advantage===true,disadvantage:row.disadvantage===true,
    attempt:Number(row.attempt)||1,notificationRevision:Number(row.notificationRevision)||0,
    groupId:validId(row.groupId)?row.groupId:'',groupOutcome:row.groupOutcome||null,
    gmOutcome:text(row.gmOutcome,40),result:row.result||null,
    dice:row.dice||null,mode:text(row.mode,30),
    history:Object.freeze(array(row.history).slice(-30).map(x=>Object.freeze({
      attempt:x.attempt,mode:x.mode,result:x.result})))
  })));
}
export function assertCheckPayload(mode,input){
  if(!record(input)||!['create','submit','cancel','acknowledge','override','reroll','resend'].includes(input.action))
    throw Error('Unsupported universal check operation.');
  if(mode!=='gm'&&input.action!=='submit')throw Error('Only a GM can manage check requests.');
  if(input.action==='create'){
    if(!CHECK_TYPES.includes(input.type))throw Error('Invalid check type.');
    const ids=['group','opposed'].includes(input.type)?input.characterIds:[input.characterId];
    if(!array(ids).length||ids.some(id=>!validId(id)))throw Error('Choose linked characters.');
  }else if(!validId(input.requestId))throw Error('Select a valid check request.');
  if(JSON.stringify(input).length>20000)throw Error('Check request too large.');
  return input;
}
