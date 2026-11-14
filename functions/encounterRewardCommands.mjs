import {randomInt} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {encounterCreatureCandidate,drawEncounterCreatures,validateEncounterPlanAction} from '../src/state/encounterRewardModel.mjs';
import {rollLootTable} from '../src/state/lootTableModel.mjs';
import {lootTableDropFromRoll} from '../src/state/lootTableDropModel.mjs';
import {rollRandomTable} from '../src/state/randomTableModel.mjs';

// The official Compendium manifest is checked into the repository and deployed
// with Firebase Functions. Never trust a client-supplied creature stat block.
const official=JSON.parse(readFileSync(new URL('../data/compendium-parts/creature-9449fc9d98a097d8.json',import.meta.url),'utf8')).entries;
const officialCandidates=official.map(row=>encounterCreatureCandidate(row,'official')).filter(Boolean);
const exists=s=>typeof s?.exists==='function'?s.exists():Boolean(s?.exists);
const identifier=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
export function createEncounterRewardCommands(context,{requireCampaignGM}){
  const {db,doc,runTransaction,currentUser,serverTimestamp,requestId}=context;
  return {
    manageEncounterReward:async(campaignId,_scope,action={})=>{
      try{
        const input=validateEncounterPlanAction(action);
        const result=await runTransaction(db,async tx=>{
          await requireCampaignGM(tx,campaignId);
          if(input.type==='generate'){
            if(!identifier(requestId)||requestId.length>95)
              throw Error('Request identifier is too long.');
            const planId='encounter-plan-'+requestId;
            const planRef=doc(db,'campaigns',campaignId,'encounterPlans',planId);
            const workspaceRef=doc(db,'campaigns',campaignId,'systems','gmWorkspace');
            const snapshots=await Promise.all([
              tx.get(planRef),tx.get(workspaceRef),
              ...(input.randomTableId?[tx.get(doc(db,'campaigns',campaignId,'randomTables',input.randomTableId))]:[])
            ]);
            if(exists(snapshots[0]))throw Error('This encounter generation has already been recorded.');
            const world=snapshots[1]?.data()?.world||{};
            const campaignCandidates=[...(Array.isArray(world.creatures)?world.creatures:[]),
              ...(Array.isArray(world.npcs)?world.npcs:[])]
              .map(row=>encounterCreatureCandidate(row,'campaign')).filter(Boolean);
            const encounter=drawEncounterCreatures([...officialCandidates,...campaignCandidates],input,randomInt);
            let prompt=null,lootTableId=input.lootTableId;
            if(input.randomTableId){
              const random=snapshots[2]?.data();
              if(!exists(snapshots[2])||random?.status!=='active'||
                random?.category!=='encounter'||random?.threatTier!==input.threatTier)
                throw Error('The linked encounter random table must be active and match the Threat Tier.');
              prompt=rollRandomTable(random,randomInt);
              if(!lootTableId&&prompt.lootTableId)lootTableId=prompt.lootTableId;
            }
            if(input.lootRolls&&!lootTableId)
              throw Error('Select an active loot table or an encounter table with a loot reference.');
            if(lootTableId&&!input.lootRolls)
              throw Error('Choose at least one loot roll.');
            let reward=null;
            if(lootTableId){
              const lootSnap=await tx.get(doc(db,'campaigns',campaignId,'lootTables',lootTableId));
              const table=lootSnap?.data();
              if(!exists(lootSnap)||table?.status!=='active')
                throw Error('The selected loot table is missing or archived.');
              const rolls=Array.from({length:input.lootRolls},(_,index)=>{
                const roll=rollLootTable(table,randomInt),lootId='party-loot-'+requestId+'-'+(index+1);
                const generated=lootTableDropFromRoll(table,roll,lootId);
                return {rollNumber:index+1,roll,lootId:generated?lootId:null,
                  ...(generated?{drop:generated.drop,secretItem:generated.secretItem}:{})};
              });
              reward={lootTableId,tableName:table.name,tableRevision:table.revision,
                rolls,generatedCount:rolls.filter(row=>row.lootId).length,
                emptyCount:rolls.filter(row=>!row.lootId).length};
            }
            // Read everything and generate validated snapshots before the first write.
            const plan={id:planId,status:'draft',revision:1,
              threatTier:input.threatTier,tolerance:input.tolerance,biome:input.biome,
              source:input.source,candidateCount:encounter.candidateCount,
              creatures:encounter.creatures,totalXP:encounter.totalXP,
              xpUnconfigured:encounter.xpUnconfigured,
              ...(prompt?{randomTableId:input.randomTableId,prompt}:{}),
              ...(reward?{reward}:{}),
              createdBy:currentUser.uid,createdAt:serverTimestamp(),
              updatedBy:currentUser.uid,updatedAt:serverTimestamp()};
            tx.set(planRef,plan);
            return {planId,revision:1,status:'draft',creatureCount:plan.creatures.length,
              rewardRollCount:reward?.rolls.length||0,preview:true,approved:false};
          }
          const planRef=doc(db,'campaigns',campaignId,'encounterPlans',input.planId);
          const snap=await tx.get(planRef),plan=snap?.data();
          if(!exists(snap))throw Error('This encounter plan no longer exists.');
          if(plan.revision!==input.expectedRevision)throw Error('The encounter plan changed. Refresh before continuing.');
          if(plan.status!=='draft')throw Error('Only draft encounter plans can be approved or archived.');
          if(input.type==='archive'){
            tx.update(planRef,{status:'archived',revision:plan.revision+1,
              updatedBy:currentUser.uid,updatedAt:serverTimestamp()});
            return {planId:plan.id,revision:plan.revision+1,status:'archived'};
          }
          // Hidden party-loot drafts are NOT public loot and never touch
          // characters, XP, currency, items or the combat engine.
          const drops=(plan.reward?.rolls||[]).filter(row=>row.lootId);
          if(drops.length>10)throw Error('The plan has too many reward drops.');
          const refs=drops.flatMap(row=>[
            doc(db,'campaigns',campaignId,'partyLootDrafts',row.lootId),
            doc(db,'campaigns',campaignId,'partyLoot',row.lootId)
          ]);
          const existing=await Promise.all(refs.map(ref=>tx.get(ref)));
          if(existing.some(exists))throw Error('This plan already has a staged treasure drop.');
          for(const row of drops){
            const metadata={tableId:plan.reward.lootTableId,
              revision:plan.reward.tableRevision,entryId:row.roll.entryId,
              encounterPlanId:plan.id,rollNumber:row.rollNumber};
            const docRef=doc(db,'campaigns',campaignId,'partyLootDrafts',row.lootId);
            tx.set(docRef,{...row.drop,visibility:'hidden',createdBy:currentUser.uid,
              createdAt:serverTimestamp(),updatedAt:serverTimestamp(),
              generatedFrom:metadata,
              ...(row.secretItem?{secretItem:row.secretItem}:{})});
          }
          tx.update(planRef,{status:'approved',revision:plan.revision+1,
            approvedBy:currentUser.uid,approvedAt:serverTimestamp(),
            updatedBy:currentUser.uid,updatedAt:serverTimestamp()});
          return {planId:plan.id,status:'approved',revision:plan.revision+1,
            stagedLoot:drops.length,appliedToCombat:false,distributed:false};
        });
        return {ok:true,...result};
      }catch(error){return {ok:false,error:error?.message||String(error)};}
    }
  };
}
