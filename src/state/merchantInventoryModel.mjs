// Phase 10.1 — deterministic merchant inventory and restocking previews.
// These helpers never transfer items or currency. Only the GM-only callable
// commits the results inside a trusted Firestore transaction.
import {shopVariantKey} from './shopTransactionModel.mjs';

export const MAX_MERCHANT_STOCK_QUANTITY=1000000;
export const MAX_MERCHANT_RESTOCK_AUDIT=25;
const whole=(value,min=0,max=MAX_MERCHANT_STOCK_QUANTITY)=>
  Number.isSafeInteger(value)&&value>=min&&value<=max;
const pieces=value=>Array.isArray(value)?value:[];
const label=value=>typeof value==='string'?value.trim().slice(0,160):'';

// Keep a stable identity even for a legacy item without a definition index.
// This protects index-based GM stock edits from switching to another item.
export function merchantStockIdentity(item={}){
  const identified=shopVariantKey(item);
  if(identified)return identified;
  return JSON.stringify([
    label(item?.id||item?.definitionId||item?.name||item?.title),
    label(item?.material),
    label(item?.quality),
    label(item?.condition),
    label(item?.enchantment)
  ]);
}

export function validateRestockPolicy(target,low){
  if(!whole(target))throw Error('Restock target must be a whole quantity between 0 and 1,000,000.');
  if(!whole(low,0,target))throw Error('Low-stock alert must be a whole quantity between 0 and the target.');
  return {restockTarget:target,lowStockAt:low};
}

export function merchantStockHealth(row={}){
  const qty=Number(row.qty);
  const target=Number(row.restockTarget??0);
  const low=Number(row.lowStockAt??0);
  if(!whole(qty))return {status:'invalid',qty:0,target:0,low:0,needed:0};
  const managed=whole(target,1);
  return {
    status:qty===0?'out':managed&&qty<=low?'low':managed?'stocked':'unmanaged',
    qty,target:managed?target:0,low:managed&&whole(low,0,target)?low:0,
    needed:managed?Math.max(0,target-qty):0
  };
}

// Always restock to target, not by a fixed quantity; repeated GM requests
// cannot duplicate stock. A "restock all" does not affect unmanaged rows.
export function merchantRestockPlan(stock=[],selectedIndex=null){
  const changes=pieces(stock).flatMap((row,index)=>{
    if(selectedIndex!==null&&index!==selectedIndex)return [];
    const health=merchantStockHealth(row);
    if(health.status==='invalid'||health.target<=0||health.needed<=0)return [];
    return [{
      index,itemName:row.item?.identified===false?'Unidentified Item':
        label(row.item?.name||row.item?.title)||'Item',
      from:health.qty,to:health.target,added:health.needed
    }];
  });
  return {
    changes,lines:changes.length,
    units:changes.reduce((sum,change)=>sum+change.added,0)
  };
}

export function merchantInventorySummary(stock=[]){
  return pieces(stock).reduce((totals,row)=>{
    const health=merchantStockHealth(row);
    totals.lines++;
    if(health.status==='out')totals.out++;
    if(health.status==='low')totals.low++;
    if(health.status==='invalid')totals.invalid++;
    return totals;
  },{lines:0,out:0,low:0,invalid:0});
}
