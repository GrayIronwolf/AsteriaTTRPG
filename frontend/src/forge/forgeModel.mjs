/**
 * Phase 5.1 Character Forge model, preserving the existing 11-step shape.
 * All persistent writes are reserved for the owner-scoped Firebase adapter.
 */
export const STATS=['strength','dexterity','agility','constitution','endurance','intelligence','wisdom','charisma','luck'];
export const TABS=['Race','Class','Patron','Appearance','Origin','Characteristics','Magic','Skills','Affinity Rolls','Equipment','Review'];
export const MAGIC=['Air Magic','Earth Magic','Water Magic','Fire Magic','Life Magic','Death Magic','Light Magic','Dark Magic','Celestial Magic','Infernal Magic','Blood Magic','Chaos Magic','Eldritch Magic','Fae Magic','Fate Magic','Space Magic','Spirit Magic','Time Magic','Abyssal Magic'];
export const PACKS=[
 {slug:'adventurer-pack',title:'Adventurer Pack',items:['Iron Rations','Health Potion','Longsword','Wooden Shield']},
 {slug:'scholar-pack',title:'Scholar Pack',items:['Mana Potion','Health Potion']},
 {slug:'explorer-pack',title:'Explorer Pack',items:['Iron Rations','Stamina Potion','Longbow']},
 {slug:'soldier-pack',title:'Soldier Pack',items:['Longsword','Wooden Shield','Health Potion']},
 {slug:'hunter-pack',title:'Hunter Pack',items:['Longbow','Stamina Potion','Iron Rations']}];
const SLOTS={'rogue-classes':1,'religious-classes':2,'ranger-classes':1,'martial-classes':1,'magical-classes':4,'dark-classes':2};
const REQUIRED={druid:['Earth Magic'],bloodhunter:['Blood Magic'],primal:['Chaos Magic'],reaper:['Death Magic']};
export const ORIGIN_FIELDS=['birthplace','history','backstory','personality','goals','ideals','flaws','notes'];
export const FAMILY_FIELDS=['father','mother','siblings','partner','children'];
export const APPEARANCE_FIELDS=['height','weight','body_type','skin_colour','fur_colour','scale_colour','feather_colour','hair_style','hair_colour','eye_colour','facial_features','scars','tattoos','markings','clothing_style','voice_notes'];
const slug=s=>String(s||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const read=(rules,domain,value)=>rules?.[domain]?.find(row=>row.slug===value);
const find=(rules,domain,title)=>rules?.[domain]?.find(row=>row.title.toLowerCase()===String(title).toLowerCase());
const fields=(data,names,max=600)=>Object.fromEntries(names.map(key=>[key,String(data?.[key]||'').trim().slice(0,max)]));
const clone=value=>JSON.parse(JSON.stringify(value));
const validRoll=value=>Number.isInteger(Number(value))&&Number(value)>=1&&Number(value)<=100;
const rank=n=>n<=9?'Novice':n<=24?'Initiate':n<=44?'Apprentice':n<=69?'Journeyman':n<=84?'Adept':n<=97?'Master':'Grandmaster';
export function newDraft(){return {
 editCharacterId:'',raceSlug:'',classSlug:'',classMode:'single',extraClassSlugs:[],
 classPatrons:{},patronMagicType:'',mancerAdvantageMagicType:'',
 originSlug:'',equipmentPackSlug:'',cardColour:'#26d9ff',
 details:{name:'',age:'',pronouns:''},
 characteristics:Object.fromEntries(STATS.map(key=>[key,10])),
 magicTypes:[],skills:[],affinityRolls:{magic:{},skills:{}},
 origin:fields({},ORIGIN_FIELDS),family_tree:fields({},FAMILY_FIELDS),appearance:{}
};}
export function classEntries(d,rules){
 const keys=[d.classSlug,...(d.classMode==='multi'?d.extraClassSlugs:[])].filter(Boolean);
 return keys.map(x=>read(rules,'class',x)).filter(Boolean).slice(0,2);
}
export function patronClasses(d,rules){
 return classEntries(d,rules).filter(row=>slug(row.rules.classCategory)==='religious-classes');
}
export function visibleTabs(d,rules){return patronClasses(d,rules).length?TABS:TABS.filter(x=>x!=='Patron');}
export function magicRules(d,rules){
 const classes=classEntries(d,rules);
 let slots=0;const required=[];
 classes.forEach((row,i)=>{
   const category=slug(row.rules.classCategory);
   slots+=i===0?(SLOTS[category]||1):(category==='magical-classes'?2:1);
   required.push(...(REQUIRED[row.slug]||[]));
 });
 return {slots,required:[...new Set(required)],
  patronRequired:classes.some(row=>slug(row.rules.classCategory)==='religious-classes'),
  mancer:classes.some(row=>row.slug==='mancer')};
}
export function affinityItems(d){
 return [...(d.magicTypes||[]).map(name=>({kind:'magic',name})),
 ...(d.skills||[]).map(name=>({kind:'skills',name}))];
}
export function validForge(d,rules,existing=null){
 const errors=[];
 const race=read(rules,'race',d.raceSlug),primary=read(rules,'class',d.classSlug);
 if(!race)errors.push({step:'Race',message:'Choose a playable race.'});
 if(!primary)errors.push({step:'Class',message:'Choose a playable class.'});
 const classes=classEntries(d,rules);
 if(d.classMode==='multi'&&(d.extraClassSlugs?.length!==1||classes.length!==2||classes[0].slug===classes[1].slug))
  errors.push({step:'Class',message:'Choose one distinct secondary class.'});
 if(existing&&d.classSlug!==(existing.primaryClassSlug||existing.classSlug||existing.character?.class?.slug))
  errors.push({step:'Class',message:'Primary class cannot change on an existing character.'});
 if(!d.details?.name?.trim()||d.details.name.trim().length<2||d.details.name.length>80)
  errors.push({step:'Review',message:'Enter a character name of 2–80 characters.'});
 for(const row of patronClasses(d,rules))
  if(!read(rules,'religion',d.classPatrons?.[row.slug]))
   errors.push({step:'Patron',message:'Choose a patron for '+row.title+'.'});
 for(const key of STATS){
  const value=Number(d.characteristics?.[key]);
  const modifier=Number(race?.rules.rollModifiers?.[key]||0);
  const cap=Number(race?.rules.tierCaps?.[key]??100);
  if(!Number.isInteger(value)||value<0||value>100||value+modifier>cap)
   errors.push({step:'Characteristics',message:'Invalid '+key+' score or racial tier cap.'});
 }
 const mr=magicRules(d,rules),chosen=[...new Set(d.magicTypes||[])];
 if(chosen.length!==mr.slots||chosen.some(x=>!MAGIC.includes(x)))
  errors.push({step:'Magic',message:'Choose exactly '+mr.slots+' magical elements.'});
 for(const element of mr.required)
  if(!chosen.includes(element))errors.push({step:'Magic',message:element+' is required.'});
 if(mr.patronRequired&&!chosen.includes(d.patronMagicType))
  errors.push({step:'Magic',message:'Choose a patron-linked selected element.'});
 if(mr.mancer&&!chosen.includes(d.mancerAdvantageMagicType))
  errors.push({step:'Magic',message:'Choose a Mancer advantage element.'});
 const skills=[...new Set(d.skills||[])];
 if(skills.length!==4||skills.some(name=>!find(rules,'skill',name)))
  errors.push({step:'Skills',message:'Select exactly four public starting skills.'});
 for(const item of affinityItems({...d,magicTypes:chosen,skills})){
  const value=d.affinityRolls?.[item.kind]?.[item.name];
  if(value?.locked!==true||!validRoll(value.value))
   errors.push({step:'Affinity Rolls',message:'Confirm the affinity roll for '+item.name+'.'});
 }
 if(!PACKS.some(pack=>pack.slug===d.equipmentPackSlug))
  errors.push({step:'Equipment',message:'Choose an equipment pack.'});
 return errors;
}
function affinityRecords(d){
 const map={magic:{},skills:{}};
 for(const item of affinityItems(d)){
  const value=Number(d.affinityRolls[item.kind][item.name].value);
  map[item.kind][item.name]={title:item.name,value,locked:true,rank:rank(value)};
 }
 return map;
}
export function draftFromCharacter(record){
 if(!record?.ownerUid||!record?.id)throw Error('Verified owned character required.');
 const schema=record.character||{},draft=newDraft();
 const primary=record.primaryClassSlug||record.classSlug||schema.class?.slug||'';
 const extras=Array.isArray(record.secondaryClassSlugs)?record.secondaryClassSlugs:
  schema.secondaryClassSlugs||[];
 const skills=Array.isArray(record.skills)?record.skills:Object.keys(record.skills||{});
 return {...draft,
  editCharacterId:record.id,raceSlug:schema.race?.slug||slug(record.race),
  classSlug:primary,classMode:extras.length?'multi':'single',
  extraClassSlugs:extras.filter(x=>x!==primary).slice(0,1),
  classPatrons:Array.isArray(record.classPatrons)?
   Object.fromEntries(record.classPatrons.map(row=>[row.classSlug,row.patronSlug])):
   clone(record.classPatrons||schema.classPatrons||{}),
  originSlug:schema.origin?.slug||record.origin||'',
  equipmentPackSlug:schema.equipment?.pack?.slug||'',
  cardColour:record.cardColour||draft.cardColour,
  patronMagicType:record.patronMagicType||schema.magic?.patronLinkedType||'',
  mancerAdvantageMagicType:record.mancerAffinity?.advantage||'',
  details:{name:record.name||'',age:record.age||'',pronouns:record.pronouns||''},
  characteristics:{...draft.characteristics,...(record.characteristics||schema.characteristics||{})},
  magicTypes:clone(record.magicTypes||schema.magic?.types||[]),
  skills:skills.slice(0,4),affinityRolls:clone(record.affinityRolls||schema.affinityRolls||draft.affinityRolls),
  appearance:clone(record.appearance||schema.appearance||{}),
  origin:fields(schema.origin?.data||record.backstory,ORIGIN_FIELDS,1500),
  family_tree:fields(record.family_tree||schema.family_tree,FAMILY_FIELDS)
 };
}
/** Never replace an existing campaign-linked character document with a draft. */
export function composeCharacter(d,rules,uid,id,existing=null){
 if(typeof uid!=='string'||!uid||!id||!/^[a-zA-Z0-9_-]{1,160}$/.test(id))
  throw Error('Invalid character owner or ID.');
 if(existing&&(existing.ownerUid!==uid||existing.id!==id))
  throw Error('Character owner mismatch.');
 const problems=validForge(d,rules,existing);
 if(problems.length)throw Error(problems[0].message);
 const race=read(rules,'race',d.raceSlug),classes=classEntries(d,rules),cls=classes[0];
 const origin=read(rules,'origin',d.originSlug),name=d.details.name.trim();
 const classSlugs=classes.map(c=>c.slug),klass=classes.map(c=>c.title).join(' / ');
 const stats=Object.fromEntries(STATS.map(key=>{
  const value=Number(d.characteristics[key])+Number(race.rules.rollModifiers?.[key]||0);
  return [key,Math.max(0,Math.min(Number(race.rules.tierCaps?.[key]??100),value))];
 }));
 const pack=PACKS.find(p=>p.slug===d.equipmentPackSlug);
 const inventory=pack.items.map(title=>{
  const item=find(rules,'item',title);
  return {id:item?.slug||slug(title),catalogId:item?.id||slug(title),
    name:item?.title||title,title:item?.title||title,qty:1,equipped:false,equippedSlot:''};
 });
 const created=existing?.created||existing?.character?.created||new Date().toISOString();
 const affinities=affinityRecords(d),mr=magicRules(d,rules);
 const appearance=fields(d.appearance,APPEARANCE_FIELDS,300);
 const backstory=fields(d.origin,ORIGIN_FIELDS,1500);
 const family_tree=fields(d.family_tree,FAMILY_FIELDS);
 const classPatrons=patronClasses(d,rules).map(row=>({
  classSlug:row.slug,className:row.title,patronSlug:d.classPatrons[row.slug],
  patronName:read(rules,'religion',d.classPatrons[row.slug]).title
 }));
 const info={title:race.title,naturalAC:race.rules.naturalAC,
  movement:race.rules.movement,languages:race.rules.languages,
  magicAffinity:race.rules.magicAffinity,traits:race.rules.racialTraits,
  tierCaps:race.rules.tierCaps,rollModifiers:race.rules.rollModifiers};
 const classInfo={slug:cls.slug,key:cls.slug,title:klass,category:cls.rules.classCategory,
  lockedPrimary:true,maxClasses:2,
  classes:classes.map(row=>({slug:row.slug,title:row.title,key:row.slug,category:row.rules.classCategory}))};
 const dashboard=existing?.dashboard||{id:'dashboard-'+id,characterId:id,route:'player',
   title:name+' Dashboard',created};
 const schema={id,name,created,race:{slug:race.slug,title:race.title,info,traits:info.traits},
  naturalAC:race.rules.naturalAC,class:{slug:cls.slug,title:klass,key:cls.slug,info:classInfo,patrons:classPatrons},
  classSlugs,primaryClassSlug:cls.slug,secondaryClassSlugs:classSlugs.slice(1),classMode:d.classMode,
  classLimit:{max:2,primaryLocked:true},characteristics:stats,appearance,
  origin:{slug:origin?.slug||'',title:origin?.title||'',data:backstory},backstory,family_tree,
  magic:{types:d.magicTypes.slice(),affinities:affinities.magic,rules:mr,
   patronLinkedType:d.patronMagicType,classPatrons,mancerAffinity:{advantage:d.mancerAdvantageMagicType}},
  classPatrons,skills:d.skills.slice(),affinityRolls:affinities,
  magicAffinities:affinities.magic,skillAffinities:affinities.skills,
  equipment:{pack:{slug:pack.slug,title:pack.title},items:inventory},dashboard,
  cardColour:/^#[0-9a-f]{6}$/i.test(d.cardColour)?d.cardColour:'#26d9ff'};
 const patch={id,ownerUid:uid,initial:name[0].toUpperCase(),name,race:race.title,klass,
  classSlug:cls.slug,classSlugs,primaryClassSlug:cls.slug,
  secondaryClassSlugs:classSlugs.slice(1),classMode:d.classMode,
  classLimit:{max:2,primaryLocked:true},classInfo,
  age:String(d.details.age||'').slice(0,40),pronouns:String(d.details.pronouns||'').slice(0,70),
  origin:origin?.slug||'',originTitle:origin?.title||'',originNotes:backstory.notes,
  characteristics:stats,raceInfo:info,naturalAC:race.rules.naturalAC,
  racialTraits:info.traits,skills:Object.fromEntries(d.skills.map(s=>[s,Number(existing?.skills?.[s]||1)])),
  affinityRolls:affinities,magicAffinities:affinities.magic,skillAffinities:affinities.skills,
  magicTypes:d.magicTypes.slice(),magicRules:mr,patronMagicType:d.patronMagicType,
  classPatrons,religiousPatrons:classPatrons,
  mancerAffinity:{advantage:d.mancerAdvantageMagicType},
  appearance,family_tree,backstory,cardColour:schema.cardColour,dashboard,
  character:schema
 };
 if(!existing){
  const max={hp:10+stats.constitution*10,sp:10+stats.endurance*10,mp:10+stats.wisdom*10};
  Object.assign(patch,{created,level:0,xp:0,xpMax:1000,cp:0,tp:0,
   hp:[max.hp,max.hp],sp:[max.sp,max.sp],mp:[max.mp,max.mp],
   campaign:'Unassigned',session:'No active session',
   resourceMods:{hp:0,sp:0,mp:0},
   inventory,equipment:{},bags:[],coins:{},conditions:[],
   talents:{},spells:[],professions:[],
   professionSlots:['No Profession Learned','No Profession Learned','No Profession Learned']});
 }
 return {...existing,...patch};
}
