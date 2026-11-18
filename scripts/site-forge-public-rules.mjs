/**
 * Phase 5.1: derive only explicitly-public playable Forge rule fields from the
 * SAME canonical Compendium partitions. Raw bodies, notes, images, GM metadata
 * and entire source partitions must never enter the static React build.
 */
import assert from 'node:assert/strict';
import {mkdirSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isPublishedDefinition} from '../frontend/src/compendium/publicationPolicy.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=resolve(root,'data/compendium-parts');
const target=resolve(root,'frontend/src/forge/public-rules');
const DOMAINS=['race','class','religion','origin','skill','item','talent'];
const byDomain=new Map(DOMAINS.map(domain=>[domain,[]]));
const asText=(v,max=160)=>typeof v==='string'?v.slice(0,max):'';
const asList=(v,max=12)=>Array.isArray(v)?
  v.filter(item=>typeof item==='string').slice(0,max).map(v=>v.slice(0,120)):[];
const bool=v=>v===true||v==='true';
const clamp=(v,min,max,fallback)=>{
 const number=Number(v);
 return Number.isFinite(number)?Math.max(min,Math.min(max,Math.trunc(number))):fallback;
};
const STATS=['strength','dexterity','agility','constitution','endurance',
 'intelligence','wisdom','charisma','luck'];
const tierCap=value=>{
 if(value&&typeof value==='object')return clamp(value.maxScore??value.max,0,100,100);
 if(typeof value==='string'){
  const names={'tier 0':19,'tier 1':39,'tier 2':59,
   'tier 3':79,'tier 4':99,'tier 5':100,
   'tier i':39,'tier ii':59,'tier iii':79,'tier iv':99,'tier v':100};
  const parsed=names[value.trim().toLowerCase()];
  if(parsed!==undefined)return parsed;
 }
 return clamp(value,0,100,100);
};
const statMap=(v,kind)=>{
 const out={};
 if(!v||typeof v!=='object'||Array.isArray(v))return out;
 for(const key of STATS){
  if(!Object.hasOwn(v,key))continue;
  out[key]=kind==='modifier'?clamp(v[key],-30,30,0):
   kind==='cap'?tierCap(v[key]):
     asText(v[key],80);
 }
 return out;
};
function project(entry,domain){
 const m=entry.metadata||{},filters=entry.filters||{};
 const rules={};
 if(domain==='race'){
  rules.naturalAC=clamp(m.naturalAC ?? m.natural_ac,1,12,1);
  rules.naturalACSource=asText(m.naturalACSource,80);
  rules.movement=asText(m.movement,150);
  rules.languages=asList(m.languages,12);
  rules.magicAffinity=asList(m.magicAffinity,20);
  rules.racialTraits=(Array.isArray(m.racialTraits)?m.racialTraits:[])
   .filter(trait=>trait&&typeof trait==='object'&&typeof trait.name==='string')
   .slice(0,12).map(t=>({name:asText(t.name,110),description:asText(t.description,280)}));
  rules.rollModifiers=statMap(m.rollModifiers||m.characteristicModifiers,'modifier');
  rules.statRolls=statMap(m.statRolls||m.characteristicStatRolls,'text');
  rules.tierCaps=statMap(m.tierCaps||m.characteristicTierCaps,'cap');
  rules.heightRange=asText(m.heightRange||m.height_range,70);
  rules.weightRange=asText(m.weightRange||m.weight_range,70);
  for(const key of ['bodyTypes','skinColours','furColours','scaleColours','featherColours',
   'hairStyles','hairColours','eyeColours','facialFeatures']){
   rules[key]=asList(m[key],20);
  }
 }else if(domain==='class'){
  rules.classCategory=asText(m.classCategory||filters.category||entry.category,90);
  rules.role=asText(m.role,200);
  rules.primaryStat=asText(m.primaryStat,40);
  rules.secondaryStat=asText(m.secondaryStat,40);
  rules.combatStyle=asText(m.combatStyle,140);
  rules.recommendedSkills=asList(m.recommendedSkills,20);
  rules.startingEquipment=asList(m.startingEquipment,24);
 }else if(domain==='religion'){
  rules.pantheon=asText(m.pantheon||entry.category,100);
  rules.deityTitle=asText(m.deityTitle||m.divineDomain,130);
 }else if(domain==='skill'){
  rules.primaryStat=asText(m.primaryStat,60);
  rules.secondaryStat=asText(m.secondaryStat,60);
 }else if(domain==='talent'){
  rules.classSlug=asText(m.classSlug,70);
  rules.tier=asText(m.talentTier||m.tier,40);
  rules.prerequisite=asText(m.prerequisite,90);
 }
 // Item names are linked to existing public item definitions by slug only.
 return {
  id:entry.id,domain,title:asText(entry.title,140),slug:asText(entry.slug,160),
  category:asText(entry.category,130),categoryPath:asList(entry.categoryPath,6),
  summary:asText(entry.summary,360),playable:domain!=='race'&&domain!=='class' ? true :
    m.playable!==false && !['false','hidden','gm-only'].includes(
      String(m.availability||filters.availability||'').toLowerCase()),
  rules
 };
}
const seen=new Set(),counts={};
const parts=readdirSync(source).filter(name=>/^[a-z]+-[a-f0-9]+\.json$/.test(name)).sort();
assert.ok(parts.length>=14);
for(const file of parts){
 const part=JSON.parse(readFileSync(join(source,file),'utf8'));
 if(!byDomain.has(part.domain))continue;
 for(const entry of part.entries){
  if(!isPublishedDefinition(entry))continue;
  assert.ok(!seen.has(entry.id),'Duplicate public Forge identity');
  seen.add(entry.id);
  const row=project(entry,part.domain);
  assert.ok(row.title&&row.slug,'Forge entry missing public title or slug');
  assert.ok(row.id.startsWith(part.domain+':') || part.domain==='creature',
    'Forge definition unexpectedly changed namespace');
  byDomain.get(part.domain).push(row);
 }
}
mkdirSync(target,{recursive:true});
for(const [domain,entries] of byDomain){
 entries.sort((a,b)=>a.title.localeCompare(b.title,'en')||a.id.localeCompare(b.id));
 assert.ok(entries.length>0,'Missing public Forge domain '+domain);
 writeFileSync(join(target,domain+'.json'),
  JSON.stringify({version:1,domain,entries})+'\n','utf8');
 counts[domain]=entries.length;
}
assert.ok(counts.race>=30&&counts.class>=20&&counts.skill>=30);
console.log('PASS: generated public-only Character Forge rules: '+JSON.stringify(counts));
