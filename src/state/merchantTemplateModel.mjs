// Digital GM Toolkit 5.1 — private reusable merchant templates and catalog links.
// Templates are account-owned presets, not live shops. No trading operation uses them.
export const MERCHANT_TYPES=Object.freeze([
  'General Goods','Blacksmith','Armourer','Alchemist','Herbalist','Enchanter',
  'Jeweller','Tailor','Carpenter','Fletcher','Stable','Magical Goods',
  'Temple Services','Guild Store','Monster-Parts Merchant','Travelling Merchant'
]);
export const MAX_MERCHANT_TEMPLATE_STOCK=50;
export const MAX_MERCHANT_TEMPLATE_BYTES=80000;
const text=(value,max=160)=>String(value??'').trim().slice(0,max);
const list=value=>Array.isArray(value)?value:[];
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const safeId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{4,160}$/.test(value);
const clone=value=>JSON.parse(JSON.stringify(value));
const ITEM_FIELDS=[
  'id','definitionId','asteriaIdIndexCode','Asteria ID Index Code',
  'catalogId','slug','name','title','basicName','trueName','type','category',
  'subcategory','subCategory','itemClass','rarity','material','materials',
  'quality','condition','durability','maxDurability','enchantment','enchantments',
  'enchanted','effects','effect','properties','modifiers','bonuses','spell',
  'spellData','isSpellbook','identified','stackable','maxStack','marketValue',
  'marketPrice','weight','size','description','image','icon','art'
];
export function merchantTemplateStock(rows=[]){
  if(!Array.isArray(rows)||rows.length>MAX_MERCHANT_TEMPLATE_STOCK)
    throw Error('A reusable template supports up to 50 stock lines.');
  return rows.map((row,index)=>{
    if(!object(row)||!object(row.item))throw Error('Invalid merchant template stock.');
    if(row.item.identified===false)
      throw Error('Remove unidentified stock before saving this merchant as a template.');
    const qty=Number(row.qty);
    if(!Number.isSafeInteger(qty)||qty<0||qty>1000000)
      throw Error('Template stock quantity is invalid on line '+(index+1)+'.');
    const item=Object.fromEntries(ITEM_FIELDS.filter(key=>row.item[key]!==undefined)
      .map(key=>[key,clone(row.item[key])]));
    if(!text(item.name||item.title))throw Error('Template stock requires a named item.');
    if(JSON.stringify(item).length>7000)
      throw Error('An item in this template is too large.');
    const restockTarget=Number(row.restockTarget??0);
    const lowStockAt=Number(row.lowStockAt??0);
    if(!Number.isSafeInteger(restockTarget)||restockTarget<0||restockTarget>1000000||
       !Number.isSafeInteger(lowStockAt)||lowStockAt<0||lowStockAt>restockTarget)
      throw Error('Template restocking configuration is invalid.');
    const minStanding=Number(row.minStanding??0);
    if(!Number.isSafeInteger(minStanding)||minStanding<0||minStanding>100)
      throw Error('Template special-access standing is invalid.');
    return {item,qty,restockTarget,lowStockAt,minStanding,
      opportunityLabel:text(row.opportunityLabel,160)};
  });
}
export function normalizeMerchantTemplate(input={}){
  if(!object(input))throw Error('Invalid merchant template.');
  const id=text(input.id,160);
  if(!safeId(id))throw Error('Merchant template ID is invalid.');
  const name=text(input.name,100);
  if(!name)throw Error('Name the merchant template.');
  const type=text(input.type||'General Goods',90);
  const buyModifier=Number(input.buyModifier??1);
  const sellModifier=Number(input.sellModifier??1);
  if(!Number.isFinite(buyModifier)||buyModifier<0.1||buyModifier>10||
     !Number.isFinite(sellModifier)||sellModifier<0.1||sellModifier>10)
    throw Error('Merchant price modifiers must be between 0.1 and 10.');
  const record={
    id,name,type,buyModifier,sellModifier,
    description:text(input.description,2000),
    personality:text(input.personality,500),
    greeting:text(input.greeting,500),
    specialOffer:text(input.specialOffer,500),
    stock:merchantTemplateStock(input.stock||[])
  };
  if(JSON.stringify(record).length>MAX_MERCHANT_TEMPLATE_BYTES)
    throw Error('Merchant template is too large to save.');
  return record;
}
export function merchantTemplateFromShop(shop={},name='',id=''){
  if(!object(shop)||!text(shop.name))throw Error('Choose a merchant to save.');
  return normalizeMerchantTemplate({...shop,id,name:name||shop.name,stock:list(shop.stock)});
}
export function merchantBuiltInTemplates(){
  return MERCHANT_TYPES.map((type,index)=>normalizeMerchantTemplate({
    id:'preset-merchant-'+String(index+1).padStart(2,'0'),
    name:type+' Shop',type,buyModifier:1,sellModifier:1,stock:[]
  }));
}
export function merchantWorldNPCOptions(world={}){
  return list(world.npcs).filter(row=>object(row)&&text(row.name||row.title))
    .map((row,index)=>({id:text(row.id||row.slug||'legacy-npc-'+index,160),
      name:text(row.name||row.title,160)}))
    .sort((a,b)=>a.name.localeCompare(b.name));
}
export function merchantWorldLocationOptions(world={}){
  const locations=[...list(world.settlements).map((row,index)=>({
    ...row,id:row.id||row.slug||'settlement-'+index,kind:'Settlement'
  })),...list(world.regions).map((row,index)=>({
    ...row,id:row.id||row.slug||'region-'+index,kind:'Region'
  }))].filter(row=>object(row)&&text(row.name||row.title));
  const seen=new Set();
  return locations.map(row=>({id:text(row.id,160),name:text(row.name||row.title,160),
    kind:row.kind,region:text(row.kind==='Region'?row.name:(row.region||row.regionName),200)}))
    .filter(row=>{const key=row.kind+':'+row.id;if(seen.has(key))return false;seen.add(key);return true;})
    .sort((a,b)=>a.name.localeCompare(b.name));
}
