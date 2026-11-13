// Phase 11.1 — authoritative material definitions and inventory availability.
// No player-generated item rewards: published recipes originate with campaign GMs,
// and crafting only settles after a trusted GM approval.
export const MAX_RECIPE_MATERIALS=12;
export const MAX_RECIPE_QUANTITY=1000;
const trim=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
const list=value=>Array.isArray(value)?value:[];
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value)&&
  !['__proto__','prototype','constructor'].includes(value);
const positive=(n,max=MAX_RECIPE_QUANTITY)=>Number.isSafeInteger(n)&&n>=1&&n<=max;
const norm=value=>trim(value,160).toLocaleLowerCase('en');
const itemCode=value=>trim(value,128).toLocaleLowerCase('en');

// Prefer base definition identifiers. Inventory instance IDs must never be
// interpreted as a material definition: the source item ID changes on transfer.
export function craftingInventoryDefinition(item={}){
  const raw=item.raw&&typeof item.raw==='object'?item.raw:item;
  const meta=raw.metadata&&typeof raw.metadata==='object'?raw.metadata:{};
  return itemCode(raw['Asteria ID Index Code']||raw.asteriaIdIndexCode||
    raw.asteriaIdIndex||raw.asteriaId||raw.definitionId||
    raw.compediumId||raw.compendiumId||raw.baseDefinitionId||
    meta['Asteria ID Index Code']||meta.asteriaIdIndexCode||meta.definitionId);
}
export function craftingMaterialKey(requirement={}){
  return requirement.itemCode?'code:'+itemCode(requirement.itemCode):
    'name:'+norm(requirement.name);
}
export function normalizeCraftingRecipe(input={},id='',previous={}){
  const recipeId=id||input.id;
  if(!validId(recipeId))throw Error('Choose a valid recipe ID.');
  if(typeof input.name!=='string'||!input.name.trim()||input.name.length>160)
    throw Error('Enter a recipe name of 160 characters or fewer.');
  if(typeof input.description!=='string'||input.description.length>1000)
    throw Error('Recipe description must be 1,000 characters or fewer.');
  if(input.status!=='draft'&&input.status!=='published')
    throw Error('Choose draft or published recipe status.');
  if(input.stationId!==undefined&&input.stationId!==''&&!validId(input.stationId))
    throw Error('Choose a valid crafting station.');
  const rawMaterials=list(input.materials);
  if(!rawMaterials.length||rawMaterials.length>MAX_RECIPE_MATERIALS)
    throw Error('Recipes require 1–12 material requirements.');
  const materials=rawMaterials.map(row=>{
    if(!row||typeof row.name!=='string'||!row.name.trim()||row.name.length>160)
      throw Error('Enter each material name (160 characters maximum).');
    if(row.itemCode!==undefined && (typeof row.itemCode!=='string'||row.itemCode.length>128))
      throw Error('Use a valid material definition code.');
    if(!positive(row.quantity))throw Error('Material quantities must be whole numbers from 1 to 1,000.');
    return {name:trim(row.name,160),itemCode:itemCode(row.itemCode),quantity:row.quantity};
  });
  const output=input.output||{};
  if(typeof output.name!=='string'||!output.name.trim()||output.name.length>160)
    throw Error('Choose a crafted item name.');
  if(output.itemCode!==undefined && (typeof output.itemCode!=='string'||output.itemCode.length>128))
    throw Error('Crafted item definition code is too long.');
  if(output.type!==undefined&&(typeof output.type!=='string'||output.type.length>100))
    throw Error('Crafted item type is too long.');
  if(!positive(output.quantity,100))
    throw Error('Crafted output quantity must be a whole number from 1 to 100.');
  return {
    id:recipeId,name:trim(input.name,160),description:trim(input.description,1000),
    status:input.status,stationId:input.stationId||'',
    materials,output:{name:trim(output.name,160),itemCode:itemCode(output.itemCode),
      type:trim(output.type||'Item',100)||'Item',quantity:output.quantity},
    createdAt:previous.createdAt||null
  };
}
export function craftingMaterialEligible(item={}){
  const raw=item.raw&&typeof item.raw==='object'?item.raw:item;
  return item.identified!==false&&raw.identified!==false&&
    !item.equipped&&!raw.equipped&&!item.locked&&!raw.locked&&
    !item.bound&&!raw.bound&&!item.questItem&&!raw.questItem&&
    !['player-request-escrow','shop','merchant','trade-escrow'].includes(String(raw.location||''))&&
    positive(Number(item.qty??raw.qty??raw.quantity),1000000);
}
export function craftingMaterialMatches(item,requirement){
  if(!craftingMaterialEligible(item))return false;
  const code=itemCode(requirement.itemCode);
  if(code)return craftingInventoryDefinition(item)===code;
  return norm(item.name||item.raw?.name)===norm(requirement.name);
}
// A material stack can only be spent once even when multiple recipe lines refer
// to the same definition. All quantities are computed from the live character.
export function craftingInventoryPlan(recipe,inventory=[]){
  const rows=list(inventory);
  const available=rows.map(row=>craftingMaterialEligible(row)?
    Number(row.qty??row.raw?.qty??row.raw?.quantity):0);
  const totals=rows.map((row,i)=>available[i]);
  const allocations=new Map();
  const requirements=list(recipe?.materials).map(material=>{
    let required=Number(material.quantity)||0;
    let gathered=0;
    let total=0;
    rows.forEach((row,i)=>{
      if(craftingMaterialMatches(row,material))total+=totals[i];
    });
    rows.forEach((row,i)=>{
      if(!required||!craftingMaterialMatches(row,material))return;
      const take=Math.min(required,available[i]);
      if(take<=0)return;
      available[i]-=take;required-=take;gathered+=take;
      allocations.set(i,(allocations.get(i)||0)+take);
    });
    return {name:material.name,itemCode:material.itemCode||'',
      needed:material.quantity,available:Math.min(material.quantity,gathered),
      totalInInventory:total,missing:required};
  });
  return {
    ready:requirements.length>0&&requirements.every(row=>row.missing===0),
    requirements,
    allocations:[...allocations].map(([index,quantity])=>({index,quantity}))
  };
}
export function craftingResultItem(recipe={}){
  const item=recipe.output||{};
  return {
    name:item.name, type:item.type||'Item', qty:item.quantity,
    ...(item.itemCode?{definitionId:item.itemCode,'Asteria ID Index Code':item.itemCode}:{}),
    identified:true,equipped:false,equippedSlot:'',location:'inventory'
  };
}
