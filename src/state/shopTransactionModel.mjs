import { itemDefinitionKey, itemStackFingerprint } from './liveWorkspaceModel.mjs';
import { getPlayerPurchasePriceCopper, getPlayerSaleValueCopper } from '../systems/items/marketPricing.mjs';

// Asteria ID Index Codes identify item definitions, not individual instances.
// Merchant stock may consolidate only matching item variants, never merely
// matching display names or definition IDs.
export function shopVariantKey(item = {}) {
  const definition=itemDefinitionKey(item);
  if(!definition) return '';
  return JSON.stringify([definition,itemStackFingerprint(item)]);
}

export function shopStockCompatible(left = {},right = {}) {
  const first=shopVariantKey(left);
  if(!first || first!==shopVariantKey(right)) return false;
  return ![left,right].some(item =>
    item.stackable===false || item.unique===true || item.bound===true ||
    item.questItem===true || Number(item.maxStack||0)===1
  );
}

export function merchantPriceCopper(shop = {},item = {},direction = 'buy') {
  return direction==='sell'
    ? getPlayerSaleValueCopper(item,shop.sellModifier??1)
    : getPlayerPurchasePriceCopper(item,shop.buyModifier??1);
}

export function characterCurrencyCopper(character = {}) {
  const coins=character.coins||character.coinPouch||{};
  const factors=[
    ['royal_platinum',10000000000],
    ['royal_crown',100000000],
    ['platinum_crown',1000000],
    ['gold',10000],
    ['silver',100],
    ['copper',1]
  ];
  return factors.reduce((sum,[key,multiplier])=>{
    const title=key.split('_').map(x=>x.charAt(0).toUpperCase()+x.slice(1)).join(' ');
    return sum+Number(coins[key]??coins[key.replaceAll('_',' ')]??coins[title]??0)*multiplier;
  },0);
}

export function shopVariantLabel(item = {}) {
  const values=[item.material,item.quality,item.condition,item.enchantment];
  const details=values.map(value=>typeof value==='string'?value:
    typeof value==='object'&&value!==null?value.name||value.title||'':''
  ).filter(Boolean);
  const enchantments=Array.isArray(item.enchantments)
    ? item.enchantments.map(x=>typeof x==='string'?x:x?.name||x?.title||'').filter(Boolean)
    : [];
  const result=[...new Set([...details,...enchantments])];
  if(item.identified===false)result.push('Unidentified');
  return result.length?result.join(' · '):'Standard';
}
