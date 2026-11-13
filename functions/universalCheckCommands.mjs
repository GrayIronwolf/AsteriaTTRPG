import {randomInt,randomUUID} from 'node:crypto';
import {isCampaignGM,isCampaignMember,isLinkedCharacter,readCampaignMember} from './characterPermissions.mjs';
import {UNIVERSAL_CHECK_TYPES,universalCheckModifierBreakdown,universalCheckOutcome} from '../src/state/universalCheckModel.mjs';
const identifier=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(v);
const text=(v,max=400)=>typeof v==='string'?v.slice(0,max):'';
export async function universalCheckAction(db,uid,input,stamp){
  if(!uid||!identifier(input?.campaignId))throw Error('Invalid campaign or sign-in.');
  const campaignId=input.campaignId,action=input.action;
  if(!['create','submit','cancel','acknowledge','override','reroll','resend'].includes(action))throw Error('Unknown check action.');
  const requestId=action==='create'?randomUUID():input.requestId;
  if(!identifier(requestId))throw Error('Invalid check request.');
  const ref=db.doc(`campaigns/${campaignId}/checkRequests/${requestId}`);
  return db.runTransaction(async tx=>{
    const campaignSnap=await tx.get(db.doc(`campaigns/${campaignId}`));
    if(!campaignSnap.exists)throw Error('Campaign not found.');
    const campaign=campaignSnap.data();
    const membership=await readCampaignMember(tx,db,campaignId,campaign,uid);
    if(!isCampaignMember(campaign,uid,membership))throw Error('Campaign membership required.');
    const gm=isCampaignGM(campaign,uid,membership);
    if(action==='create'){
      if(!gm)throw Error('GM permission required.');
      const characterId=input.characterId;
      if(!identifier(characterId))throw Error('Invalid target character.');
      const charSnap=await tx.get(db.doc(`campaigns/${campaignId}/characters/${characterId}`));
      if(!charSnap.exists||!isLinkedCharacter(campaign,characterId,charSnap.data(),campaignId))throw Error('Character is not linked.');
      const character=charSnap.data(),type=input.type;
      if(!UNIVERSAL_CHECK_TYPES.includes(type))throw Error('Invalid check type.');
      if(!Number.isSafeInteger(input.dc)||input.dc<0||input.dc>1000)throw Error('Invalid DC.');
      const breakdown=universalCheckModifierBreakdown(input.modifiers);
      if(breakdown.entries.some(e=>Math.abs(e.value)>100))throw Error('Modifier out of range.');
      const row={id:requestId,campaignId,characterId,ownerUid:character.ownerUid,characterName:text(character.name,100),
        gmUid:uid,type,skill:text(input.skill,100),description:text(input.description,500),npcName:text(input.npcName,100),
        dc:input.dc,modifiers:breakdown.entries,modifierTotal:breakdown.total,advantage:input.advantage===true,
        disadvantage:input.disadvantage===true,status:'pending',attempt:1,createdAt:stamp(),updatedAt:stamp()};
      tx.create(ref,row);
      return {ok:true,id:requestId};
    }
    const snap=await tx.get(ref);
    if(!snap.exists)throw Error('Check request not found.');
    const row=snap.data();
    if(row.campaignId!==campaignId)throw Error('Invalid request campaign.');
    if(action==='submit'){
      if(row.ownerUid!==uid)throw Error('Only the target player can roll.');
      if(row.status!=='pending')throw Error('This request is no longer pending.');
      const mode=input.mode;
      if(!['digital','physical','manual'].includes(mode))throw Error('Invalid dice mode.');
      let dice=null,result=null;
      if(mode==='digital'){
        const first=randomInt(1,21),second=row.advantage||row.disadvantage?randomInt(1,21):null;
        const die=second===null?first:row.advantage&&!row.disadvantage?Math.max(first,second):
          row.disadvantage&&!row.advantage?Math.min(first,second):first;
        dice={first,second,die};
        result=universalCheckOutcome(die,row.modifierTotal,row.dc,{opposed:row.type==='opposed'});
      }else if(mode==='physical'){
        if(!Number.isInteger(input.die)||input.die<1||input.die>20)throw Error('Enter a d20 result.');
        dice={die:input.die};
        result=universalCheckOutcome(input.die,row.modifierTotal,row.dc,{opposed:row.type==='opposed'});
      }else{
        if(!['success','failure'].includes(input.reported))throw Error('Select a reported outcome.');
        result={outcome:input.reported,success:input.reported==='success',total:null,
          modifier:row.modifierTotal,dc:row.dc,selfReported:true};
      }
      tx.update(ref,{status:'submitted',mode,dice,result,selfReported:mode!=='digital',
        submittedAt:stamp(),updatedAt:stamp()});
      return {ok:true,result,dice};
    }
    if(!gm)throw Error('GM permission required.');
    if(action==='resend'){
      if(row.status!=='pending')throw Error('Only pending checks can be resent.');
      tx.update(ref,{notificationRevision:(row.notificationRevision||0)+1,updatedAt:stamp()});
      return {ok:true};
    }
    if(action==='reroll'){
      if(!['submitted','acknowledged'].includes(row.status))throw Error('Only completed checks can be rerolled.');
      tx.update(ref,{status:'pending',attempt:(row.attempt||1)+1,dice:null,result:null,
        mode:null,selfReported:null,updatedAt:stamp()});
      return {ok:true};
    }
    if(action==='cancel'){
      if(row.status!=='pending')throw Error('Only pending requests can be cancelled.');
      tx.update(ref,{status:'cancelled',updatedAt:stamp()});
      return {ok:true};
    }
    if(!['submitted','acknowledged'].includes(row.status))throw Error('Check has no result.');
    if(action==='override'){
      if(!['success','failure','critical-success','critical-failure'].includes(input.outcome))throw Error('Invalid override.');
      tx.update(ref,{gmOutcome:input.outcome,gmOverrideReason:text(input.reason,300),status:'acknowledged',updatedAt:stamp()});
    }else{
      tx.update(ref,{status:'acknowledged',updatedAt:stamp()});
    }
    return {ok:true};
  });
}
