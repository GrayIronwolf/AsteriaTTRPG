import { isDeepStrictEqual } from 'node:util';
import { isCampaignGM, isLinkedCharacter } from './characterPermissions.mjs';
import { buildTalentCatalog } from '../src/state/talentModel.mjs';
import { applyCondition, makeCondition, removeCondition } from '../src/state/conditionModel.mjs';
import { reconcileCharacterSystems, processCharacterRest } from '../src/state/characterSystems.mjs';
import { storedResource, writeResource, validateResourceDefinition } from '../src/state/resourceEngine.mjs';
import { resourcePair } from '../src/state/resourceValues.mjs';
import { effectTimeMs } from '../src/state/effectsEngine.mjs';

const CORE_FIELDS=['hp','sp','mp','bp','zp','resourceDefinitions','resources','resourceState','conditions','activeEffects','effects','talentResourceEffects','talentResourceState','talentStateVersion','talentEffects','talentRestBonus','talentSavingThrows','talentUsage','acModifiers','specialDamage','soulDamage','restState','coreStateVersion'];
const copy=value=>JSON.parse(JSON.stringify(value));
export function createCoreCommands(context) {
  const {db,currentUser,doc,collection,runTransaction,serverTimestamp}=context;
  const mutate=async(campaignId,characterId,operation)=>{
    try {
      return await runTransaction(db,async tx=>{
        const campaignRef=doc(db,'campaigns',campaignId),characterRef=doc(db,'campaigns',campaignId,'characters',characterId);
        const [campaignSnapshot,characterSnapshot,sessionSnapshot,encounterSnapshot]=await Promise.all([tx.get(campaignRef),tx.get(characterRef),tx.get(doc(db,'campaigns',campaignId,'liveSession','current')),tx.get(doc(db,'campaigns',campaignId,'systems','encounter'))]);
        if(!campaignSnapshot.exists() || !characterSnapshot.exists()) throw new Error('Linked character not found.');
        const campaign=campaignSnapshot.data(),original=characterSnapshot.data(),session=sessionSnapshot.data() || {};
        if(!isLinkedCharacter(campaign,characterId,original,campaignId)) throw new Error('This character is not linked to the campaign.');
        const isGM=isCampaignGM(campaign,currentUser.uid),isOwner=original.ownerUid===currentUser.uid;
        if(!isOwner && !isGM) throw new Error('Character access is not permitted.');
        if(session.status!=='active' || effectTimeMs(session.expiresAt)<=Date.now()) throw new Error('The GM must start the session before this dashboard can be edited.');
        const privateRef=doc(db,'users',original.ownerUid,'characters',original.sourceCharacterId || characterId),privateSnapshot=await tx.get(privateRef);
        if(privateSnapshot.exists() && privateSnapshot.data().ownerUid!==original.ownerUid) throw new Error('Character ownership does not match.');
        const clock={now:Date.now(),encounter:encounterSnapshot.exists()?encounterSnapshot.data():{status:'ready'}};
        const catalog=buildTalentCatalog(original,context.catalog);
        let character=reconcileCharacterSystems({...original,id:characterId},catalog,clock);
        const result=await operation({character,original,catalog,clock,isGM,isOwner});
        if(result.character) character=result.character;
        character=reconcileCharacterSystems(character,catalog,clock);
        const patch={};
        for(const key of CORE_FIELDS) if(character[key]!==undefined&&!isDeepStrictEqual(original[key],character[key])) patch[key]=copy(character[key]);
        if(result.message) patch.actionLog=[{id:context.requestId,at:new Date(clock.now).toISOString(),type:result.type || 'character-system',message:result.message},...(original.actionLog || [])].slice(0,100);
        if(Object.keys(patch).length) {
          patch.coreRevision=Number(original.coreRevision || 0)+1;patch.updatedAt=serverTimestamp();
          tx.update(characterRef,patch);
          if(privateSnapshot.exists()) tx.update(privateRef,patch);
        }
        if(result.message) {
          const eventRef=doc(collection(db,'campaigns',campaignId,'events'));
          tx.set(eventRef,{id:eventRef.id,campaignId,sessionId:session.id || '',targetCharacterId:characterId,targetOwnerUid:original.ownerUid,type:result.type || 'character-system',payload:{message:result.message},status:'delivered',deliveryStatus:'delivered',acknowledged:false,createdBy:currentUser.uid,createdAt:serverTimestamp()});
        }
        const response={...result};delete response.character;
        return {ok:true,...response};
      });
    } catch(error) {return {ok:false,error:error.message || String(error)};}
  };
  const commands={
    refreshCharacterSystems:(campaignId,characterId)=>mutate(campaignId,characterId,async()=>({})),
    manageCharacterCondition:(campaignId,characterId,input={})=>mutate(campaignId,characterId,async({character,clock,isGM})=>{
      if(input.action==='remove') return {character:removeCondition(character,input.id,{isGM,uid:currentUser.uid,now:clock.now}),message:'Condition removed.',type:'condition-removed'};
      if(!isGM) throw new Error('Only the GM can apply conditions.');
      const condition=makeCondition(input,currentUser.uid,clock,`condition-${context.requestId}`),next=applyCondition(character,condition,clock);
      return {character:next,id:next.conditions.at(-1).id,message:`Applied ${condition.name}.`,type:'condition-applied'};
    }),
    configureCharacterResource:(campaignId,characterId,input={})=>mutate(campaignId,characterId,async({character,isGM,clock})=>{
      if(!isGM) throw new Error('Only the GM can configure resource rules.');
      const definition=validateResourceDefinition(input),{id,maximum,...rules}=definition;
      const stored=storedResource(character,id),current=stored===undefined?definition.minimum:resourcePair(stored)[0];
      character.resourceDefinitions={...character.resourceDefinitions,[id]:rules};
      character.resourceState={...character.resourceState,[id]:{baseMaximum:maximum,maximum,recoveryAt:clock.now,combatId:clock.encounter.status==='active'?(clock.encounter.combatId || 'legacy-combat'):''}};
      writeResource(character,id,current,maximum);
      return {character,message:`Updated ${definition.name} resource rules.`,type:'resource-rules'};
    }),
    takeCampaignCharacterRest:(campaignId,characterId,type='short',input={})=>mutate(campaignId,characterId,async({character,original,clock,catalog,isOwner})=>{
      if(!isOwner) throw new Error('Only the character owner can request a rest.');
      if(!['short','long'].includes(type)) throw new Error('Choose a short or long rest.');
      const rest={sequence:0,...original.restState};
      if(rest.request?.status==='pending') {
        if(type==='long') return {request:rest.request};
        throw new Error('Wait for the GM to resolve your Long Rest request.');
      }
      if(input.expectedSequence!==undefined && input.expectedSequence!==rest.sequence) throw new Error('Rest state changed. Refresh before resting again.');
      if(input.expectedSequence===undefined && clock.now-Number(rest.lastActionAt || 0)<5000) throw new Error('This rest was already submitted.');
      character.restState={...rest,sequence:rest.sequence+1,lastActionAt:clock.now};
      if(type==='long') {
        const recovery=Number(input.soulRecovery || 0);
        if(!Number.isSafeInteger(recovery)||recovery<0||recovery>1e9) throw new Error('Invalid Soul recovery request.');
        const request={id:context.requestId,status:'pending',requestedBy:currentUser.uid,requestedAt:clock.now,soulRecovery:recovery};
        character.restState.request=request;
        return {character,request,message:'Long Rest requested. Waiting for GM approval.',type:'long-rest-request'};
      }
      character=processCharacterRest(character,'short',catalog,clock).entity;
      return {character,message:'Short Rest completed.',type:'short-rest'};
    }),
    reviewCharacterRest:(campaignId,characterId,input={})=>mutate(campaignId,characterId,async({character,clock,catalog,isGM})=>{
      if(!isGM) throw new Error('Only the GM can review a Long Rest.');
      const request=character.restState?.request;
      if(!request || request.id!==input.id) throw new Error('Long Rest request not found.');
      if(request.status!=='pending') return {request};
      if(!['approved','denied'].includes(input.status)) throw new Error('Approve or deny the request.');
      if(input.status==='approved') {
        const recovery=Number(input.soulRecovery ?? request.soulRecovery ?? 0);
        if(!Number.isSafeInteger(recovery)||recovery<0||recovery>1e9) throw new Error('Invalid Soul recovery amount.');
        character=processCharacterRest(character,'long',catalog,clock,recovery).entity;
      }
      const reviewed={...request,status:input.status,reviewedBy:currentUser.uid,reviewedAt:clock.now,note:String(input.note || '').slice(0,500)};
      character.restState={...character.restState,request:reviewed};
      return {character,request:reviewed,message:`Long Rest ${input.status}${reviewed.note?`: ${reviewed.note}`:'.'}`,type:'long-rest-review'};
    })
  };
  // A new callable name safely fails on an old backend instead of invoking its
  // former immediate Long Rest behaviour during a frontend/backend rollout.
  return {...commands,requestCharacterRest:commands.takeCampaignCharacterRest};
}
