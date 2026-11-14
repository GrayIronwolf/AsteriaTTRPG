import {randomInt} from 'node:crypto';
import {
  diceResult,normalizedDiceWorkspace,validateDiceAction,
  MAX_DICE_HISTORY,MAX_DICE_PRESETS
} from '../src/state/diceRollModel.mjs';

/** Signed-in user's private dice journal. No browser writes and no campaign
 * identity spoofing. Calling again with the same roll request ID is idempotent.
 */
export async function advancedDiceAction(db,uid,input,clock=()=>Date.now(),
  stamp=()=>new Date(),randomFace=sides=>randomInt(1,sides+1)){
  if(typeof uid!=='string'||!/^[A-Za-z0-9]{3,160}$/.test(uid))
    throw Error('Sign in to use the dice roller.');
  const request=validateDiceAction(input);
  const ref=db.doc('users/'+uid+'/diceWorkspace/current');
  return db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    const previous=normalizedDiceWorkspace(snap.exists?snap.data():{});
    let presets=previous.presets,history=previous.history,result=null;
    if(request.action==='roll'){
      const existing=history.find(entry=>entry.id===request.requestId);
      if(existing)return {ok:true,roll:existing,repeat:true};
      const now=clock();
      if(!Number.isSafeInteger(now)||now<0)throw Error('Invalid roll timestamp.');
      if(history.length&&now-Number(history[0].at)<250)
        throw Error('Please allow a moment between dice rolls.');
      result=diceResult(request,randomFace,now,request.requestId);
      history=[result,...history].slice(0,MAX_DICE_HISTORY);
    }else if(request.action==='save-preset'){
      const item=request.preset,existing=presets.findIndex(p=>p.id===item.id);
      if(existing<0&&presets.length>=MAX_DICE_PRESETS)
        throw Error('Remove an existing preset before adding another.');
      presets=existing>=0?presets.map(p=>p.id===item.id?item:p):[item,...presets];
    }else if(request.action==='delete-preset'){
      presets=presets.filter(row=>row.id!==request.presetId);
    }else if(request.action==='clear-history'){
      history=[];
    }
    tx.set(ref,{version:1,presets,history,updatedAt:stamp()});
    return {ok:true,...(result?{roll:result}:{}),
      presetCount:presets.length,historyCount:history.length};
  });
}
