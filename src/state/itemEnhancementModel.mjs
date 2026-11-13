// Phase 11.2 — Item-bound enchanting and upgrades.
// Rank costs are Asteria rules; GM decisions determine success and spell effects.
// No automatic dice, success chance, combat modifiers or item quality changes.
import {craftingInventoryPlan} from './craftingRecipeModel.mjs';

export const ENCHANTMENT_RANKS=Object.freeze([
  {name:'Weak',mpMin:1,mpMax:49,dc:10,minutes:10,crystal:'Powdered Crystal',crystals:1,soul:'Poor'},
  {name:'Minor',mpMin:50,mpMax:149,dc:12,minutes:20,crystal:'Powdered Crystal',crystals:1,soul:'Weak'},
  {name:'Greater',mpMin:150,mpMax:299,dc:14,minutes:40,crystal:'Powdered Crystal',crystals:2,soul:'Basic'},
  {name:'Strengthened',mpMin:300,mpMax:599,dc:16,minutes:80,crystal:'Powdered Crystal',crystals:2,soul:'Common'},
  {name:'Enhanced',mpMin:600,mpMax:999,dc:18,minutes:160,crystal:'Refined Crystal',crystals:3,soul:'Luminous'},
  {name:'Superior',mpMin:1000,mpMax:1499,dc:20,minutes:320,crystal:'Refined Crystal',crystals:3,soul:'Brilliant'},
  {name:'Grand',mpMin:1500,mpMax:2499,dc:22,minutes:640,crystal:'Refined Crystal',crystals:6,soul:'Special'},
  {name:'World',mpMin:2500,mpMax:3999,dc:25,minutes:1280,crystal:'Refined Crystal',crystals:6,soul:'Resplendent'}
]);
const trim=(value,max=160)=>typeof value==='string'?value.trim().slice(0,max):'';
const validId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(s)&&
  !['__proto__','constructor','prototype'].includes(s);
const list=value=>Array.isArray(value)?value:[];
const hasInteger=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const norm=s=>trim(s,160).toLocaleLowerCase('en');
export const enhancementRank=value=>ENCHANTMENT_RANKS.find(row=>row.name===value)||null;

export function normalizeEnhancementPlan(source={},id='',previous={}){
  const planId=id||source.id;
  if(!validId(planId))throw Error('Choose a valid enhancement plan ID.');
  const mode=source.mode;
  if(!['enchantment','upgrade'].includes(mode))throw Error('Choose enchanting or upgrading.');
  if(!['draft','published'].includes(source.status))throw Error('Choose draft or published status.');
  if(!trim(source.name)||String(source.name).length>160)
    throw Error('Provide a plan name (160 characters maximum).');
  if(typeof source.description!=='string'||source.description.length>1000)
    throw Error('Plan description cannot exceed 1,000 characters.');
  if(!trim(source.effectName)||String(source.effectName).length>160)
    throw Error('Specify the enchantment or upgrade name.');
  if(typeof source.effectDescription!=='string'||source.effectDescription.length>1000)
    throw Error('Effect description cannot exceed 1,000 characters.');
  if(source.targetType!==undefined&&(typeof source.targetType!=='string'||source.targetType.length>100))
    throw Error('Target item type is invalid.');
  if(source.stationId!==undefined&&source.stationId!==''&&!validId(source.stationId))
    throw Error('Choose a valid crafting station.');
  const materials=list(source.materials);
  if(materials.length>12||(mode==='upgrade'&&!materials.length))
    throw Error('Upgrades need materials (maximum 12 requirements).');
  const cleanMaterials=materials.map(row=>{
    if(!row||typeof row.name!=='string'||!trim(row.name)||row.name.length>160||
      (row.itemCode!==undefined&&(typeof row.itemCode!=='string'||row.itemCode.length>128))||
      !hasInteger(row.quantity,1,1000))
      throw Error('Every additional ingredient needs a name and quantity from 1 to 1,000.');
    return {name:trim(row.name),itemCode:trim(row.itemCode,128).toLocaleLowerCase('en'),
      quantity:row.quantity};
  });
  let rank='',spellName='',spellMana=0,manaCost=0,stoneMode=source.allowStoneSubstitution===true;
  if(mode==='enchantment'){
    const rule=enhancementRank(source.spellRank);
    if(!rule)throw Error('Choose one of the eight Asteria spell ranks.');
    if(!trim(source.spellName)||String(source.spellName).length>160)
      throw Error('Enter the spell to bind to this item.');
    if(!hasInteger(source.spellMana,rule.mpMin,rule.mpMax))
      throw Error(rule.name+' spell MP must fall between '+rule.mpMin+' and '+rule.mpMax+'.');
    rank=rule.name;spellName=trim(source.spellName);spellMana=source.spellMana;
    manaCost=2*spellMana;
    if(stoneMode&&rule.name==='Weak')throw Error('A Weak enchantment has no lower soul stone tier.');
  }else{
    if(!hasInteger(source.manaCost??0,0,100000))
      throw Error('Upgrade mana must be a whole number from 0 to 100,000.');
    manaCost=source.manaCost??0;stoneMode=false;
  }
  return {id:planId,name:trim(source.name),description:trim(source.description,1000),
    mode,status:source.status,stationId:source.stationId||'',effectName:trim(source.effectName),
    effectDescription:trim(source.effectDescription,1000),targetType:trim(source.targetType,100),
    spellRank:rank,spellName,spellMana,manaCost,allowStoneSubstitution:stoneMode,
    materials:cleanMaterials,createdAt:previous.createdAt||null};
}

export function enchantmentRequirements(plan={},stoneMode='standard'){
  if(!['standard','lower-stone'].includes(stoneMode))throw Error('Unsupported soul stone option.');
  const additions=list(plan.materials).map(x=>({...x}));
  if(plan.mode==='upgrade'){
    if(stoneMode!=='standard')throw Error('Upgrades cannot substitute soul stones.');
    return additions;
  }
  const rule=enhancementRank(plan.spellRank);
  if(!rule)throw Error('Unknown spell rank.');
  if(stoneMode==='lower-stone'&&(!plan.allowStoneSubstitution||
    ENCHANTMENT_RANKS.indexOf(rule)<1))
    throw Error('This enchantment cannot use lower soul stones.');
  const stoneName=stoneMode==='lower-stone'?
    ENCHANTMENT_RANKS[ENCHANTMENT_RANKS.indexOf(rule)-1].soul:rule.soul;
  return [
    {name:rule.crystal,itemCode:'',quantity:rule.crystals},
    {name:stoneName+' Soul Stone',itemCode:'',quantity:stoneMode==='lower-stone'?4:1},
    ...additions
  ];
}

export function enchantmentPreview(plan={},affinity='None',stoneMode='standard'){
  const rule=enhancementRank(plan.spellRank);
  if(!rule)return {manaCost:plan.manaCost||0,dc:null,minutes:null,notes:'GM approves upgrade.'};
  enchantmentRequirements(plan,stoneMode);
  const name=affinity||'None';
  // Only two affinity modifiers/caps are locked. Leave other affinity
  // modifiers to GM adjudication rather than inventing intermediate tables.
  if(name==='None'&&ENCHANTMENT_RANKS.indexOf(rule)>1)
    throw Error('An item without enchantment affinity cannot hold above Minor.');
  const base=rule.dc+(stoneMode==='lower-stone'?4:0);
  const modifier=name==='None'?8:name==='Extreme'?-4:null;
  return {manaCost:plan.manaCost,minutes:rule.minutes,baseDC:rule.dc,
    dc:modifier===null?null:base+modifier,stoneSubstitutionDC:stoneMode==='lower-stone'?4:0,
    affinity:name,notes:modifier===null?'GM must determine material affinity modifier.':''};
}

export function enhancementTargetEligible(item={},plan={}){
  if(!item||typeof item!=='object')return false;
  const quantity=Number(item.qty??item.quantity??1);
  if(quantity!==1||item.identified===false||item.equipped||
    item.bound||item.locked||item.questItem||item.unique===false&&quantity>1||
    ['trade-escrow','player-request-escrow','shop','merchant'].includes(item.location))return false;
  if(plan.targetType&&norm(item.type||item.itemType||item.category)!==norm(plan.targetType))
    return false;
  const current=list(plan.mode==='upgrade'?item.upgrades:item.enchantments);
  return !current.some(row=>row?.planId===plan.id);
}
export function enhancementTargetFingerprint(item={}){
  return JSON.stringify([
    item.instanceId||item.id||'',item.definitionId||item['Asteria ID Index Code']||'',
    item.name||'',item.type||'',item.material||'',item.quality||'',Number(item.qty??1),
    Boolean(item.equipped),Boolean(item.bound),Boolean(item.locked),
    item.identified!==false,item.enchantmentAffinity||item.materialAffinity||'None',
    list(item.enchantments),list(item.upgrades)
  ]);
}
export function enhancementPlanSignature(plan){
  return JSON.stringify([plan.mode,plan.status,plan.stationId||'',plan.materials,plan.effectName,
    plan.effectDescription,plan.targetType,plan.spellRank,plan.spellName,
    plan.spellMana,plan.manaCost,plan.allowStoneSubstitution]);
}
export function enhancementInventoryPlan(plan,items=[],targetIndex=-1,stoneMode='standard'){
  const sources=list(items).map((item,i)=>i===targetIndex?{...item,qty:0}:item);
  return craftingInventoryPlan({materials:enchantmentRequirements(plan,stoneMode)},sources);
}
export function applyApprovedEnhancement(item={},plan={}){
  if(!enhancementTargetEligible(item,plan))throw Error('Item cannot receive this enhancement.');
  const record={planId:plan.id,name:plan.effectName,description:plan.effectDescription,
    ...(plan.mode==='enchantment'?{spellName:plan.spellName,spellRank:plan.spellRank}:{}),
    appliedAt:new Date().toISOString()};
  const key=plan.mode==='enchantment'?'enchantments':'upgrades';
  return {...item,[key]:[...list(item[key]),record]};
}
