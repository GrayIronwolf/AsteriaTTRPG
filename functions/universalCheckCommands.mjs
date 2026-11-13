import {createHash,randomInt,randomUUID} from 'node:crypto';
import {resolveUniversalCheckContext} from './universalCheckContext.mjs';
import {isCampaignGM,isCampaignMember,isLinkedCharacter,readCampaignMember} from './characterPermissions.mjs';
import {UNIVERSAL_CHECK_TYPES,universalAutomaticModifiers,universalDiceChoice,universalCheckOutcome,universalGroupAdjudication} from '../src/state/universalCheckModel.mjs';

const identifier=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(v);
const clientId=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/i.test(v);
const safeText=(v,max=400)=>typeof v==='string'?v.trim().slice(0,max):'';
const ensure=(condition,message)=>{if(!condition)throw Error(message);};
const attemptReceipt=(db,campaignId,uid,operationId)=>db.doc('campaigns/'+campaignId+'/checkCommandReceipts/'+uid+'_'+operationId);
const checkRef=(db,campaignId,id)=>db.doc('campaigns/'+campaignId+'/checkRequests/'+id);
const groupRef=(db,campaignId,id)=>db.doc('campaigns/'+campaignId+'/checkGroups/'+id);
const signature=input=>createHash('sha256').update(JSON.stringify(input)).digest('hex');
const modeResult=(row,input)=>{
  const mode=input.mode;
  ensure(['digital','physical','manual'].includes(mode),'Invalid dice mode.');
  ensure(!(mode==='manual'&&row.type==='opposed'),'Opposed checks require numeric dice.');
  let dice=null,result;
  if(mode==='manual'){
    ensure(['success','failure'].includes(input.reported),'Select a reported outcome.');
    result={die:null,modifier:row.modifierTotal,dc:row.dc,total:null,
      success:input.reported==='success',outcome:input.reported,selfReported:true};
  }else{
    if(mode==='digital'){
      const first=randomInt(1,21),second=row.advantage||row.disadvantage?randomInt(1,21):null;
      dice=universalDiceChoice(first,second,row.advantage,row.disadvantage);
    }else{
      dice=universalDiceChoice(input.die,input.secondDie,row.advantage,row.disadvantage);
    }
    result=universalCheckOutcome(dice.die,row.modifierTotal,row.dc,{opposed:row.type==='opposed'});
  }
  return {mode,dice,result,selfReported:mode!=='digital'};
};
function validateCreate(input){
  ensure(UNIVERSAL_CHECK_TYPES.includes(input.type),'Invalid check type.');
  const ids=input.type==='group'||input.type==='opposed'?input.characterIds:[input.characterId];
  ensure(Array.isArray(ids)&&ids.every(identifier)&&new Set(ids).size===ids.length,
    'Select unique linked characters.');
  ensure(ids.length>=(input.type==='group'||input.type==='opposed'?2:1)&&ids.length<=(input.type==='opposed'?2:input.type==='group'?10:1),
    'Choose the required number of participants.');
  ensure(Number.isSafeInteger(input.dc)&&input.dc>=0&&input.dc<=1000,'Invalid DC.');
  ensure(input.type!=='opposed'||input.dc===0,'Opposed checks compare participant totals, not a DC.');
  ensure(!input.rankOverride||typeof input.rankOverride==='string','Invalid rank override.');
  ensure(!input.modifiers||Array.isArray(input.modifiers),'Invalid modifiers.');
  const requiredSuccesses=input.type==='group'?Number(input.requiredSuccesses||Math.ceil(ids.length/2)):0;
  ensure(!requiredSuccesses||(Number.isInteger(requiredSuccesses)&&requiredSuccesses>=1&&requiredSuccesses<=ids.length),
    'Invalid group success threshold.');
  return {ids,requiredSuccesses};
}
const resultSummary=row=>({id:row.id,result:row.result||null});
export async function universalCheckAction(db,uid,input,stamp=()=>new Date()){
  ensure(uid&&identifier(input?.campaignId),'Invalid campaign or sign-in.');
  const campaignId=input.campaignId,action=input.action;
  ensure(['create','submit','cancel','acknowledge','override','reroll','resend'].includes(action),'Unknown check action.');
  // Required for safe client retries, and for preventing duplicated digital rolls.
  ensure(clientId(input.operationId),'A unique operation ID is required.');
  if(action!=='create')ensure(identifier(input.requestId),'Invalid check request.');
  const requestId=action==='create'?null:input.requestId;
  const receiptRef=attemptReceipt(db,campaignId,uid,input.operationId);
  const digest=signature(input);
  return db.runTransaction(async tx=>{
    const campaignSnap=await tx.get(db.doc('campaigns/'+campaignId));
    ensure(campaignSnap.exists,'Campaign not found.');
    const campaign=campaignSnap.data();
    const membership=await readCampaignMember(tx,db,campaignId,campaign,uid);
    ensure(isCampaignMember(campaign,uid,membership),'Campaign membership required.');
    const gm=isCampaignGM(campaign,uid,membership);
    const previous=await tx.get(receiptRef);
    if(previous.exists){
      ensure(previous.data().signature===digest,'Operation ID was reused for different input.');
      return previous.data().response;
    }
    let response;
    if(action==='create'){
      ensure(gm,'GM permission required.');
      const {ids,requiredSuccesses}=validateCreate(input);
      const characterSnapshots=[];
      for(const id of ids)characterSnapshots.push(await tx.get(db.doc('campaigns/'+campaignId+'/characters/'+id)));
      const ownerMemberships=new Map();
      if(campaign.membershipSchemaVersion===2){
        for(const snap of characterSnapshots){
          if(!snap.exists)continue;
          const owner=snap.data().ownerUid;
          if(!ownerMemberships.has(owner))ownerMemberships.set(owner,await readCampaignMember(tx,db,campaignId,campaign,owner));
        }
      }
      const context=await resolveUniversalCheckContext(tx,db,campaignId,input.context,ids,input.type);
      const groupId=ids.length>1?randomUUID():null;
      const rows=[];
      for(let index=0;index<ids.length;index++){
        const snap=characterSnapshots[index],id=ids[index];
        ensure(snap.exists&&isLinkedCharacter(campaign,id,snap.data(),campaignId),'Character is not linked.');
        const character=snap.data(),ownerUid=character.ownerUid;
        ensure(identifier(ownerUid),'Linked character has no owner.');
        ensure(isCampaignMember(campaign,ownerUid,ownerMemberships.get(ownerUid)||null),'Target owner is not an active campaign member.');
        const modifier=universalAutomaticModifiers(character,{
          type:input.type,skill:safeText(input.skill,100),characteristic:input.characteristic,
          rankOverride:input.rankOverride,modifiers:input.modifiers,
          advantage:input.advantage===true,disadvantage:input.disadvantage===true
        });
        const idForRequest=randomUUID();
        rows.push({
          id:idForRequest,campaignId,characterId:id,ownerUid,characterName:safeText(character.name,100)||id,
          gmUid:uid,type:input.type,skill:modifier.skill,characteristic:modifier.characteristic,
          description:safeText(input.description,500),npcName:context?.npcId?context.label:safeText(input.npcName,100),
          ...(context?{context}:{}),
          dc:input.type==='opposed'?null:input.dc,modifiers:modifier.entries,modifierTotal:modifier.total,
          advantage:modifier.advantage,disadvantage:modifier.disadvantage,advantageSources:modifier.advantageSources,
          groupId,participantIndex:index,participantCount:ids.length,requiredSuccesses,
          status:'pending',attempt:1,history:[],notificationRevision:0,createdAt:stamp(),updatedAt:stamp()
        });
      }
      if(groupId)tx.create(groupRef(db,campaignId,groupId),{
        id:groupId,campaignId,type:input.type,gmUid:uid,participantIds:rows.map(row=>row.id),
        results:{},requiredSuccesses,status:'pending',createdAt:stamp(),updatedAt:stamp()
      });
      for(const row of rows)tx.create(checkRef(db,campaignId,row.id),row);
      response={ok:true,id:rows[0].id,ids:rows.map(row=>row.id),groupId};
    }else{
      const ref=checkRef(db,campaignId,requestId),snap=await tx.get(ref);
      ensure(snap.exists,'Check request not found.');
      const row=snap.data();
      ensure(row.campaignId===campaignId,'Invalid request campaign.');
      let group=null,groupDoc=null;
      if(row.groupId){
        groupDoc=groupRef(db,campaignId,row.groupId);
        const groupSnap=await tx.get(groupDoc);
        ensure(groupSnap.exists,'Group metadata missing.');
        group=groupSnap.data();
        ensure(group.participantIds?.includes(requestId),'Invalid group membership.');
      }
      if(action==='submit'){
        ensure(row.ownerUid===uid,'Only the target player can roll.');
        ensure(row.status==='pending','This request is no longer pending.');
        const submitted=modeResult(row,input);
        const patch={...submitted,status:'submitted',submittedAt:stamp(),updatedAt:stamp()};
        if(group){
          const results={...group.results,[row.id]:resultSummary({...row,...patch})};
          const members=group.participantIds;
          const complete=members.every(id=>results[id]?.result);
          const adjudication=complete?universalGroupAdjudication(group.type,members.map(id=>results[id]),group.requiredSuccesses):null;
          tx.update(groupDoc,{results,status:complete?'resolved':'pending',adjudication:adjudication||null,updatedAt:stamp()});
          if(adjudication){
            patch.groupOutcome=adjudication;
            // Reveal adjudication only, never another participant's hidden dice.
            for(const id of members)if(id!==row.id)tx.update(checkRef(db,campaignId,id),{groupOutcome:adjudication,updatedAt:stamp()});
          }
        }
        tx.update(ref,patch);
        response={ok:true,result:submitted.result,dice:submitted.dice};
      }else{
        ensure(gm,'GM permission required.');
        if(action==='resend'){
          ensure(row.status==='pending','Only pending checks can be resent.');
          tx.update(ref,{notificationRevision:(row.notificationRevision||0)+1,updatedAt:stamp()});
        }else if(action==='cancel'){
          ensure(row.status==='pending','Only pending requests can be cancelled.');
          if(group){
            ensure(group.status==='pending','Resolved groups cannot be cancelled.');
            for(const id of group.participantIds)tx.update(checkRef(db,campaignId,id),{status:'cancelled',updatedAt:stamp()});
            tx.update(groupDoc,{status:'cancelled',updatedAt:stamp()});
          }else tx.update(ref,{status:'cancelled',updatedAt:stamp()});
        }else if(action==='reroll'){
          ensure(['submitted','acknowledged'].includes(row.status),'Only completed checks can be rerolled.');
          const restart=entry=>({
            history:[...(entry.history||[]),{
              attempt:entry.attempt,mode:entry.mode||null,dice:entry.dice||null,result:entry.result||null,
              gmOutcome:entry.gmOutcome||null,submittedAt:entry.submittedAt||null
            }].slice(-30),
            status:'pending',attempt:(entry.attempt||1)+1,dice:null,result:null,mode:null,selfReported:null,
            groupOutcome:null,gmOutcome:null,gmOverrideReason:null,submittedAt:null,notificationRevision:(entry.notificationRevision||0)+1,updatedAt:stamp()
          });
          if(group){
            // In a grouped check all submissions must reset together to prevent mixed attempts.
            const others=[];
            for(const id of group.participantIds)others.push(id===row.id?{id,data:row}:{
              id,data:(await tx.get(checkRef(db,campaignId,id))).data()
            });
            for(const entry of others)tx.update(checkRef(db,campaignId,entry.id),restart(entry.data));
            tx.update(groupDoc,{results:{},status:'pending',adjudication:null,updatedAt:stamp()});
          }else tx.update(ref,restart(row));
        }else{
          ensure(['submitted','acknowledged'].includes(row.status),'Check has no result.');
          if(action==='override'){
            ensure(['success','failure','critical-success','critical-failure'].includes(input.outcome),'Invalid override.');
            ensure(safeText(input.reason,300).length>=3,'An override reason is required.');
            tx.update(ref,{gmOutcome:input.outcome,gmOverrideReason:safeText(input.reason,300),
              status:'acknowledged',acknowledgedAt:stamp(),updatedAt:stamp()});
          }else tx.update(ref,{status:'acknowledged',acknowledgedAt:stamp(),updatedAt:stamp()});
        }
        response={ok:true};
      }
    }
    tx.create(receiptRef,{uid,campaignId,action,signature:digest,response,createdAt:stamp()});
    return response;
  });
}
