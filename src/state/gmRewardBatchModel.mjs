import {validateGMRewardPayload} from './gmRewardModel.mjs';

export const MAX_GM_BATCH_TARGETS=50;

export function linkedGMRewardRecipients(characters={},query=''){
  const term=String(query||'').trim().toLocaleLowerCase();
  return Object.values(characters||{}).filter(row=>row&&typeof row.id==='string'&&row.id.length>0)
    .filter(row=>!term||[row.name,row.id,row.klass,row.class].some(value=>String(value||'').toLocaleLowerCase().includes(term)))
    .sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id)));
}

export function normalizeGMRewardRecipients(recipientIds=[],characters={}){
  if(!Array.isArray(recipientIds))throw Error('Choose one or more linked characters.');
  const distinct=[...new Set(recipientIds.map(value=>String(value||'').trim()))];
  if(!distinct.length||distinct.some(value=>!value))throw Error('Choose at least one player.');
  if(distinct.length>MAX_GM_BATCH_TARGETS)throw Error('Choose 50 or fewer characters per award.');
  if(distinct.some(value=>!characters?.[value]||String(characters[value].id)!==value))
    throw Error('A selected recipient is no longer linked to this campaign. Refresh the player list.');
  return distinct;
}

export function previewGMRewardBatch({recipientIds=[],characters={},reward={}}={}){
  const ids=normalizeGMRewardRecipients(recipientIds,characters);
  const payload=validateGMRewardPayload(reward);
  const totalItems=payload.items.reduce((total,item)=>total+item.qty,0);
  return {
    recipientIds:ids,
    recipients:ids.map(id=>({id,name:String(characters[id].name||id)})),
    reward:payload,
    characters:ids.length,
    itemTypes:payload.items.length,
    itemUnitsPerCharacter:totalItems,
    totalItemUnits:totalItems*ids.length,
    currencyPerCharacter:payload.currency.amount,
    totalCurrency:payload.currency.amount*ids.length
  };
}

// The existing Firebase command is atomic for each character, not for the
// entire group. Stop immediately on a failure; never automatically retry a
// failed/ambiguous call or replay rewards to already completed recipients.
export async function deliverGMRewardBatch(plan,sendOne,onProgress=()=>{}){
  if(!plan?.recipientIds?.length||!plan?.reward||typeof sendOne!=='function')
    throw Error('Review recipients and rewards before sending.');
  const completed=[];
  for(let index=0;index<plan.recipientIds.length;index++){
    const characterId=plan.recipientIds[index];
    onProgress({stage:'sending',characterId,index:index+1,total:plan.recipientIds.length,completed:[...completed]});
    let result;
    try{result=await sendOne(characterId,plan.reward);}
    catch(error){result={ok:false,error:error?.message||'The request did not return a confirmed success.'};}
    if(result?.ok!==true){
      const failed={characterId,error:String(result?.error||'The server did not confirm this award.')};
      const summary={ok:false,completed,failed,remaining:plan.recipientIds.slice(index+1),total:plan.recipientIds.length};
      onProgress({stage:'stopped',...summary});
      return summary;
    }
    completed.push({characterId,itemCount:Number(result.itemCount??plan.reward.items.length)});
    onProgress({stage:'delivered',characterId,index:index+1,total:plan.recipientIds.length,completed:[...completed]});
  }
  const summary={ok:true,completed,failed:null,remaining:[],total:plan.recipientIds.length};
  onProgress({stage:'completed',...summary});
  return summary;
}
