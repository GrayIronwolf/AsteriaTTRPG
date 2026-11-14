/** Standalone dice tools for authenticated accounts. They never adjudicate
 * combat or Universal Check Requests and do not change character resources.
 * Only the callable server is allowed to author digital results.
 */
export const DICE_SIDES=Object.freeze([4,6,8,10,12,20,100]);
export const MAX_DICE_PER_ROLL=40;
export const MAX_DICE_GROUPS=8;
export const MAX_DICE_PRESETS=24;
export const MAX_DICE_HISTORY=80;
export const MAX_DICE_MODIFIER=999;

const cleanString=(value,max,field)=>{
  if(typeof value!=='string')throw Error(field+' must be text.');
  const cleaned=value.trim().replace(/\s+/g,' ');
  if(cleaned.length>max)throw Error(field+' is too long.');
  return cleaned;
};
const validId=(value,field)=>{
  if(typeof value!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(value))
    throw Error('Invalid '+field+'.');
  return value;
};
export function dicePool(value){
  if(!Array.isArray(value)||!value.length||value.length>MAX_DICE_GROUPS)
    throw Error('Choose between one and eight dice groups.');
  let total=0;
  const pools=value.map(row=>{
    if(!row||typeof row!=='object'||Array.isArray(row)||
       !Object.keys(row).every(key=>['sides','count'].includes(key)))
      throw Error('Invalid dice group.');
    const {count,sides}=row;
    if(!Number.isSafeInteger(count)||count<1||count>MAX_DICE_PER_ROLL||
       !DICE_SIDES.includes(sides))
      throw Error('Dice groups must use supported sides and whole counts.');
    total+=count;
    return {sides,count};
  });
  if(total>MAX_DICE_PER_ROLL)throw Error('A roll may contain at most 40 dice.');
  return pools;
}
export function diceModifier(value){
  if(!Number.isSafeInteger(value)||Math.abs(value)>MAX_DICE_MODIFIER)
    throw Error('Use a whole modifier between -999 and +999.');
  return value;
}
export function diceConfig(data={}){
  if(!data||typeof data!=='object'||Array.isArray(data)||
    Object.keys(data).some(key=>!['pool','modifier','label'].includes(key)))
    throw Error('Invalid dice configuration.');
  return {pool:dicePool(data.pool),modifier:diceModifier(data.modifier),
    label:cleanString(data.label,80,'Roll label')};
}
export function diceExpression(data){
  const {pool,modifier}=diceConfig(data);
  const expression=pool.map(group=>String(group.count)+'d'+group.sides).join(' + ');
  return modifier===0?expression:expression+(modifier>0?' + ':' - ')+Math.abs(modifier);
}
export function diceResult(config,die,now=Date.now(),id){
  const value=diceConfig(config);
  validId(id,'roll ID');
  if(typeof die!=='function')throw Error('Dice need a secure roller.');
  const results=value.pool.map(({count,sides})=>{
    const faces=Array.from({length:count},()=>{
      const face=die(sides);
      if(!Number.isInteger(face)||face<1||face>sides)
        throw Error('The dice source returned an invalid face.');
      return face;
    });
    return {sides,count,faces,sum:faces.reduce((a,b)=>a+b,0)};
  });
  const subtotal=results.reduce((sum,row)=>sum+row.sum,0);
  const natural=value.pool.length===1&&value.pool[0].count===1&&value.pool[0].sides===20
    ?(results[0].faces[0]===20?'natural-20':results[0].faces[0]===1?'natural-1':''):'';
  return {id,at:now,label:value.label,pool:value.pool,modifier:value.modifier,
    expression:diceExpression(value),results,subtotal,total:subtotal+value.modifier,
    natural,source:'server-digital'};
}
export function dicePreset(data={}){
  if(!data||typeof data!=='object'||Array.isArray(data)||
     Object.keys(data).some(key=>!['id','name','pool','modifier','label'].includes(key)))
    throw Error('Invalid saved roll preset.');
  const value=diceConfig({pool:data.pool,modifier:data.modifier,label:data.label});
  const name=cleanString(data.name,60,'Preset name');
  if(!name)throw Error('Name the roll preset.');
  return {id:validId(data.id,'preset ID'),name,...value};
}
export function normalizedDiceWorkspace(data={}){
  return {version:1,presets:Array.isArray(data?.presets)?data.presets.slice(0,MAX_DICE_PRESETS):[],
    history:Array.isArray(data?.history)?data.history.slice(0,MAX_DICE_HISTORY):[]};
}
export function validateDiceAction(input){
  if(!input||typeof input!=='object'||Array.isArray(input))
    throw Error('Invalid dice action.');
  const {action}=input;
  const keys={
    roll:['action','requestId','pool','modifier','label'],
    'save-preset':['action','preset'],
    'delete-preset':['action','presetId'],
    'clear-history':['action','confirmed']
  }[action];
  if(!keys||Object.keys(input).some(key=>!keys.includes(key)))
    throw Error('Unsupported dice action or fields.');
  if(action==='roll')return {action,requestId:validId(input.requestId,'roll ID'),
    ...diceConfig({pool:input.pool,modifier:input.modifier,label:input.label})};
  if(action==='save-preset')return {action,preset:dicePreset(input.preset)};
  if(action==='delete-preset')return {action,presetId:validId(input.presetId,'preset ID')};
  if(input.confirmed!==true)throw Error('Confirm history clearing first.');
  return {action,confirmed:true};
}
