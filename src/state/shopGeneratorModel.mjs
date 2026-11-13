// Phase 5.2: deterministic, preview-first GM shop stock generator.
// This module does not write to Firestore or alter a live merchant.
import {merchantStockIdentity} from './merchantInventoryModel.mjs';
import {merchantTemplateStock} from './merchantTemplateModel.mjs';
export const SHOP_GENERATOR_MAX_LINES=50;
const list=value=>Array.isArray(value)?value:[];
const word=value=>String(value??'').trim().toLowerCase();
const integer=(value,min,max,label)=>{
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<min||n>max)throw Error(label+' must be between '+min+' and '+max+'.');
  return n;
};
const hash=value=>{
  let h=2166136261;
  for(const c of String(value)){h=Math.imul(h^c.charCodeAt(0),16777619);}
  return h>>>0;
};
function rng(seed){let s=hash(seed)||1;return ()=>{s=(s+0x6D2B79F5)|0;let t=Math.imul(s^(s>>>15),1|s);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};}
const weighted=(rows,random)=>{
  const total=rows.reduce((sum,row)=>sum+row.weight,0);
  let pick=random()*total;
  for(const row of rows){pick-=row.weight;if(pick<0)return row;}
  return rows.at(-1);
};
export function normalizeShopGeneratorOptions(options={}){
  const seed=String(options.seed||'asteria').slice(0,120);
  const lines=integer(options.lines??8,1,SHOP_GENERATOR_MAX_LINES,'Stock lines');
  const minQuantity=integer(options.minQuantity??1,1,10000,'Minimum quantity');
  const maxQuantity=integer(options.maxQuantity??5,minQuantity,10000,'Maximum quantity');
  const maxUnitValue=integer(options.maxUnitValue??100000000,0,100000000,'Maximum unit value');
  const minUnitValue=integer(options.minUnitValue??0,0,maxUnitValue,'Minimum unit value');
  const categories=list(options.categories).map(word).filter(Boolean).slice(0,30);
  const rarities=list(options.rarities).map(word).filter(Boolean).slice(0,30);
  const types=list(options.types).map(word).filter(Boolean).slice(0,30);
  return {seed,lines,minQuantity,maxQuantity,minUnitValue,maxUnitValue,categories,rarities,types,
    restockTarget:integer(options.restockTarget??0,0,10000,'Restock target')};
}
export function generateMerchantStock(catalog=[],options={}){
  const config=normalizeShopGeneratorOptions(options);
  const random=rng(config.seed);
  const accepted=[];
  const seen=new Set();
  for(const entry of list(catalog)){
    if(!entry||typeof entry!=='object'||entry.identified===false)continue;
    const name=String(entry.name||entry.title||'').trim();
    if(!name)continue;
    if(config.categories.length&&!config.categories.includes(word(entry.category)))continue;
    if(config.rarities.length&&!config.rarities.includes(word(entry.rarity)))continue;
    if(config.types.length&&!config.types.includes(word(entry.type)))continue;
    const value=Number(entry.marketValue??entry.marketPrice??entry.priceCopper??0);
    if(!Number.isFinite(value)||value<config.minUnitValue||value>config.maxUnitValue)continue;
    const identity=merchantStockIdentity(entry);
    if(seen.has(identity))continue;
    seen.add(identity);
    const weight=Number(entry.generatorWeight??1);
    if(!Number.isFinite(weight)||weight<=0||weight>1000)continue;
    accepted.push({entry,weight});
  }
  const pool=accepted.slice();
  const stock=[];
  while(pool.length&&stock.length<config.lines){
    const chosen=weighted(pool,random);
    pool.splice(pool.indexOf(chosen),1);
    const qty=config.minQuantity+Math.floor(random()*(config.maxQuantity-config.minQuantity+1));
    const item=JSON.parse(JSON.stringify(chosen.entry));
    // Quantity is kept in the stock row, not embedded in the item definition.
    delete item.qty;
    delete item.quantity;
    const restockTarget=config.restockTarget?Math.max(config.restockTarget,qty):0;
    stock.push({item,qty,restockTarget,lowStockAt:restockTarget?Math.floor(restockTarget/4):0,
      minStanding:0,opportunityLabel:''});
  }
  return {stock:merchantTemplateStock(stock),eligible:accepted.length,
    requested:config.lines,generated:stock.length,seed:config.seed,
    warning:stock.length<config.lines?'Not enough matching distinct items in the compendium.':''};
}
export function merchantGeneratorCatalogFacets(catalog=[]){
  const unique=key=>[...new Set(list(catalog).map(row=>String(row?.[key]||'').trim()).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b));
  return {categories:unique('category'),rarities:unique('rarity'),types:unique('type')};
}
