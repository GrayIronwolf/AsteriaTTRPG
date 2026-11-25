/**
 * Private NPC/creature combat profile. Definitions are data, not client-executable
 * commands. The server remains responsible for validating every combat action.
 */
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const list=value=>Array.isArray(value)?value:[];
const label=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const cost=(value,max=1000000000)=>Number.isSafeInteger(Number(value))&&Number(value)>=0&&Number(value)<=max?Number(value):null;
export const ENEMY_PROFILE_FIELDS=Object.freeze([
  'portrait','characteristics','nac','attacks','spells','abilities','equipment','resistances','immunities'
]);
const characteristics=Object.freeze(['str','dex','agi','con','end','int','wis','cha','luck']);
function entries(value,kind){
  if(!Array.isArray(value)||value.length>32)throw Error('Keep up to 32 '+kind+' entries.');
  const seen=new Set();
  return value.map((item,index)=>{
    if(!record(item))throw Error('Invalid '+kind+' entry.');
    const name=label(item.name,100),key=id(item.id)?item.id:kind+'-'+index;
    if(!name||seen.has(key))throw Error('Each '+kind+' entry needs a unique name/ID.');
    seen.add(key);
    const entry={id:key,name};
    for(const field of ['description','range','damage','requirement','effect','rank','category','skill']){
      if(item[field]!==undefined){
        if(typeof item[field]!=='string'||item[field].length>500)
          throw Error('Invalid '+kind+' '+field+'.');
        entry[field]=label(item[field],500);
      }
    }
    for(const field of ['ap','mp','sp','charges']){
      if(item[field]!==undefined){
        const value=cost(item[field],field==='ap'?3:1000000);
        if(value===null)throw Error('Invalid '+kind+' '+field+' cost.');
        entry[field]=value;
      }
    }
    return entry;
  });
}
/** Strict, bounded, serializable snapshot shared by Library and prepared encounters. */
export function normalizeEnemyProfile(value={}){
  if(!record(value))throw Error('Invalid creature profile.');
  const result={};
  if(value.portrait!==undefined){
    if(typeof value.portrait!=='string'||value.portrait.length>1000)
      throw Error('Invalid creature portrait.');
    result.portrait=value.portrait.trim();
  }
  if(value.nac!==undefined){
    const nac=cost(value.nac,1000);
    if(nac===null)throw Error('Invalid NAC.');result.nac=nac;
  }
  if(value.characteristics!==undefined){
    if(!record(value.characteristics))throw Error('Invalid creature characteristics.');
    result.characteristics={};
    for(const key of characteristics){
      if(value.characteristics[key]===undefined)continue;
      const n=cost(value.characteristics[key],1000);
      if(n===null)throw Error('Invalid '+key+' characteristic.');
      result.characteristics[key]=n;
    }
  }
  for(const key of ['attacks','spells','abilities','equipment','resistances','immunities'])
    if(value[key]!==undefined)result[key]=entries(value[key],key);
  return result;
}
export function enemyProfileSnapshot(source={}){
  const candidate=Object.fromEntries(ENEMY_PROFILE_FIELDS.filter(field=>
    source[field]!==undefined).map(field=>[field,source[field]]));
  return structuredClone(normalizeEnemyProfile(candidate));
}
/** Read-only field comparison. Apply only selected changes to the private draft. */
export function compareEnemyProfile(saved={},latest={}){
  const before=enemyProfileSnapshot(saved),after=enemyProfileSnapshot(latest);
  return ENEMY_PROFILE_FIELDS.filter(field=>
    JSON.stringify(before[field]??null)!==JSON.stringify(after[field]??null))
    .map(field=>({field,before:structuredClone(before[field]??null),
      after:structuredClone(after[field]??null)}));
}
export function refreshEnemyProfile(saved,latest,fields=[]){
  const snapshot=enemyProfileSnapshot(latest),chosen=new Set(fields);
  if([...chosen].some(field=>!ENEMY_PROFILE_FIELDS.includes(field)))
    throw Error('Unsupported creature refresh field.');
  const next=structuredClone(saved);
  for(const field of chosen){
    if(snapshot[field]===undefined)delete next[field];
    else next[field]=structuredClone(snapshot[field]);
  }
  return next;
}

/**
 * Commands are derived only from the canonical stored encounter creature.
 * These identifiers never grant a player access to GM creature actions.
 */
export function enemyCombatOptions(source={}){
  let profile;
  try{profile=enemyProfileSnapshot(source);}catch{return [];}
  const groups=['attacks','spells','abilities'];
  return groups.flatMap(group=>(profile[group]||[]).filter(item=>
    group!=='abilities'||item.category!=='passive'
  ).map(item=>{
    const ap=item.ap??(group==='spells'?2:1);
    const costs={...(item.mp?{mp:item.mp}:{}),...(item.sp?{sp:item.sp}:{})};
    return {
      id:'enemy:'+group+':'+item.id,
      name:item.name,kind:group==='spells'?'spell':'creature-action',
      key:group==='attacks'?'creature-attack':
        group==='spells'?'creature-spell':'creature-ability',
      creatureAction:true,group,ap,costs,bonus:false,reaction:false,
      requiresTarget:group==='attacks',rank:item.rank||'',
      baseMP:costs.mp||0,description:item.description||'',
      fields:{...item},blocked:group==='spells'&&!item.rank?
        'This creature spell needs an explicit rank.':''
    };
  }));
}
