// Phase 5.3 — reviewed merchant inventory integration; no Firestore writes.
import {merchantStockIdentity} from './merchantInventoryModel.mjs';
import {merchantTemplateStock} from './merchantTemplateModel.mjs';
const list=value=>Array.isArray(value)?value:[];
export function mergeGeneratedMerchantStock(existing=[],incoming=[],mode='append'){
  if(!['append','replace'].includes(mode))throw Error('Choose append or replace.');
  const stock=merchantTemplateStock(incoming);
  if(!stock.length)throw Error('Generate at least one stock line.');
  const merged=mode==='replace'?[]:structuredClone(list(existing));
  let added=0,combined=0;
  for(const row of stock){
    const identity=merchantStockIdentity(row.item);
    const index=merged.findIndex(old=>merchantStockIdentity(old.item)===identity);
    if(index>=0){
      const previous=merged[index];
      const qty=Number(previous.qty)+row.qty;
      if(!Number.isSafeInteger(qty)||qty>1000000)
        throw Error('Generated inventory exceeds the stock quantity limit.');
      merged[index]={...previous,qty};
      combined++;
    }else{
      merged.push(structuredClone(row));added++;
    }
  }
  if(merged.length>200)throw Error('Shop stock line limit exceeded.');
  return {stock:merged,added,combined,mode};
}
export function merchantGeneratedStockPreview(existing=[],incoming=[],mode='append'){
  const result=mergeGeneratedMerchantStock(existing,incoming,mode);
  return {...result,linesBefore:list(existing).length,linesAfter:result.stock.length,
    unitsAdded:list(incoming).reduce((sum,row)=>sum+Number(row.qty||0),0)};
}
