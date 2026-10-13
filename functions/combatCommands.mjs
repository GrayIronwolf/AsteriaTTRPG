import { isDeepStrictEqual } from 'node:util';
import { randomInt } from 'node:crypto';
import { isCampaignGM, isLinkedCharacter } from './characterPermissions.mjs';
import { reconcileCharacterSystems } from '../src/state/characterSystems.mjs';
import { buildTalentCatalog } from '../src/state/talentModel.mjs';
import { useLearnedTalent } from '../src/state/talentMechanics.mjs';
import { applyResourceChanges, parseResourceCosts, resourceSnapshot } from '../src/state/resourceEngine.mjs';
import { resourcePair } from '../src/state/resourceValues.mjs';
import { activeConditions, makeCondition, applyCondition, removeCondition } from '../src/state/conditionModel.mjs';
import { effectTimeMs } from '../src/state/effectsEngine.mjs';
import { calculateCharacterAC, validateEquipmentChange } from '../src/systems/armour/armourSystem.mjs';
import { normalizeInventoryItems, slug } from '../src/state/liveWorkspaceModel.mjs';
import { encounterSourceResources, setEncounterResource } from '../src/state/encounterResourceModel.mjs';
import { currentCombatant, initiativeResult, initiativeOrder, combatOptions, combatRestriction, skillCheck, rollD20, checkResult, attackResult, counterspellResult, validateReactionEquipment, payCombatCosts, changeCombatHP, deathSave, feedback, mixedDamage, rows, SPELL_RANKS, SPELL_SKILL_ACCESS } from '../src/state/combatRules.mjs';

const copy=value=>JSON.parse(JSON.stringify(value));
const text=(value,max=1000)=>String(value||'').trim().slice(0,max);
const bounded=(value,min=0,max=1e9)=>{const n=Number(value);if(!Number.isFinite(n)||n<min||n>max)throw new Error('Choose a numeric value within range.');return n;};
const roll=()=>randomInt(1,21);
const numberDie=()=> (roll()-1)/20;
const combatCharacterFields=new Set(['hp','sp','mp','bp','zp','resources','resourceDefinitions','resourceState','conditions','downed','activeEffects','effects','talentResourceEffects','talentResourceState','talentStateVersion','talentEffects','talentRestBonus','talentSavingThrows','talentUsage','acModifiers','specialDamage','soulDamage','coreStateVersion','inventory','equipment']);
const management=new Set(['save','start','next','end','clear','approve','reject','window','close-window','resolve','roll','resolve-reaction','correct','condition','ambush','trigger-prepared']);
const publicPending=p=>p?{id:p.id,actorId:p.actorId,actorName:p.actorName,optionId:p.actorKind==='player'?p.optionId:'',name:p.actorKind==='player'?p.name:'Creature action',status:p.status,targetIds:p.targetIds,ap:p.ap,bonus:p.bonus,costs:p.actorKind==='player'?p.costs:{},reactionWindow:p.status==='reactions',reactorId:p.window?.[p.windowIndex||0]?.actorId||'',reactionChoices:p.window?.[p.windowIndex||0]?.choices||[],reaction:p.reaction?{actorId:p.reaction.actorId,name:p.reaction.name}:null,message:p.publicMessage||''}:null;

// An extension of asteriaAction: one encounter document, existing resource/effect
// mutations and request receipts. NPC adjudication stays in the existing GM workspace.
export function createCombatCommands(context) {
  const {db,currentUser,doc,runTransaction,serverTimestamp}=context;
  return {combatCommand:async(campaignId,actorId,input={})=>{
    try{return await runTransaction(db,async tx=>{
      const encounterRef=doc(db,'campaigns',campaignId,'systems','encounter'),gmRef=doc(db,'campaigns',campaignId,'systems','gmWorkspace');
      const [campaignSnap,encounterSnap,sessionSnap,gmSnap]=await Promise.all([tx.get(doc(db,'campaigns',campaignId)),tx.get(encounterRef),tx.get(doc(db,'campaigns',campaignId,'liveSession','current')),tx.get(gmRef)]);
      const campaign=campaignSnap.data()||{},session=sessionSnap.data()||{},gm=isCampaignGM(campaign,currentUser.uid),now=Date.now();
      if(session.status!=='active'||effectTimeMs(session.expiresAt)<=now)throw new Error('The GM must start the live session first.');
      if(management.has(input.operation)&&!gm)throw new Error('Only the campaign GM can use this combat control.');
      let encounter={status:'ready',round:1,turnIndex:0,combatants:[],enemies:[],...encounterSnap.data()};
      const oldRevision=Number(encounter.combat?.revision||0);
      if(input.revision!==oldRevision)throw new Error('Combat changed. Wait for live sync and try again.');
      encounter.combat={participants:{},log:[],...encounter.combat};
      const privateState=copy(gmSnap.data()?.combatState||{pending:null});
      privateState.preparations=privateState.preparations||{};
      const incoming=input.operation==='save'?input.encounter?.combatants||[]:[];
      const entries=[...encounter.combatants,...incoming];
      const characterIds=[...new Set(entries.map(row=>row.characterId).filter(Boolean))];
      if(characterIds.length>60||entries.length>160)throw new Error('This encounter has too many participants.');
      const documents=new Map(),characters=new Map();
      for(const id of characterIds){
        const ref=doc(db,'campaigns',campaignId,'characters',id),snapshot=await tx.get(ref);
        if(!snapshot.exists()||!isLinkedCharacter(campaign,id,snapshot.data(),campaignId))throw new Error('An encounter character is no longer linked to this campaign.');
        const original=snapshot.data(),privateRef=doc(db,'users',original.ownerUid,'characters',original.sourceCharacterId||id),privateSnap=await tx.get(privateRef);
        if(privateSnap.exists()&&privateSnap.data().ownerUid!==original.ownerUid)throw new Error('Character ownership does not match.');
        documents.set(id,{ref,original,privateRef,privateExists:privateSnap.exists()});
        characters.set(id,reconcileCharacterSystems({...original,id},buildTalentCatalog(original,context.catalog),{now,encounter}));
      }
      const entry=id=>encounter.combatants.find(row=>row.id===id);
      const get=id=>{const row=entry(id);if(!row)throw new Error('Participant is not in this encounter.');return row.characterId?characters.get(row.characterId):{...row,...encounterSourceResources(row),kind:'enemy'};};
      const put=(id,value)=>{
        const row=entry(id),before=get(id),hp=resourcePair(value.hp)[0];
        if(value.hp!==undefined&&value.hp!==null){
          if(hp>0){if(before.downed?.dead&&input.operation!=='correct')throw new Error('Ordinary healing cannot resurrect a dead participant.');delete value.downed;if(hp>resourcePair(before.hp)[0])value.conditions=rows(value.conditions).map(condition=>condition.id==='combat-nonlethal'?{...condition,active:false}:condition);}
          else if(!value.downed)value.downed={successes:0,failures:0,dead:false};
        }
        if(row.characterId)characters.set(row.characterId,value);else{Object.assign(row,value);encounter.enemies=encounter.enemies.map(enemy=>enemy.id===id?{...row}:enemy);}
      };
      const state=id=>encounter.combat.participants[id]||{ap:0,bonus:false,turns:0};
      const setState=(id,value)=>{encounter.combat.participants[id]={...state(id),...value};};
      const log=(message,details={})=>{encounter.combat.log=[{id:context.requestId,at:now,message,...details},...encounter.combat.log].slice(0,80);};
      const controlled=()=>{const actor=entry(actorId);if(!actor||(!gm&&(!actor.characterId||get(actorId).ownerUid!==currentUser.uid)))throw new Error('You cannot control this encounter participant.');return actor;};
      const requireActive=()=>{if(encounter.status!=='active')throw new Error('Combat is not active.');};
      const noPending=()=>{if(privateState.pending)throw new Error('Resolve the pending action before continuing.');};
      const conditionBoundary=(id,boundary)=>{
        let character=get(id);const turns=state(id).turns||0;
        for(const condition of activeConditions(character,{now,encounter}))if(!condition.pendingGMExpiry&&condition.tick?.boundary===boundary){
          const tick=condition.tick,key=`${encounter.combatId}:${id}:${turns}:${boundary}`;
          if(condition.lastTick===key)continue;
          if(tick.damage)character=changeCombatHP(character,mixedDamage(tick.damage,character.damageDefences),{damage:true,now});
          if(tick.restore)character=applyResourceChanges(character,{restore:tick.restore});
          character.conditions=rows(character.conditions).map(row=>row.id===condition.id?{...row,lastTick:key}:row);
        }
        character.conditions=rows(character.conditions).map(row=>!row.pendingGMExpiry&&row.boundary===boundary&&row.throughOwnTurn!==undefined&&row.throughOwnTurn<=turns?{...row,expired:true}:row);
        put(id,character);
      };
      const startTurn=()=>{
        const current=currentCombatant(encounter);if(!current)return;
        const previous=state(current.id),turns=(previous.turns||0)+1;
        setState(current.id,{ap:3,bonus:true,turns,prepared:null,disengaged:false,movement:null,turnStartedAt:now,pendingDeathSave:false,turnComplete:false});
        delete privateState.preparations[current.id];
        conditionBoundary(current.id,'start');
        let character=get(current.id);
        if(previous.grappleTarget){try{character=applyResourceChanges(character,{costs:{sp:5}});log(`${current.name} maintains the grapple: 5 SP.`);}catch{setState(previous.grappleTarget,{grappledBy:null});setState(current.id,{grappleTarget:null});log(`${current.name}'s grapple ends: maintenance unpaid.`);}}
        if(character.hp!==undefined&&resourcePair(character.hp)[0]<=0&&!character.downed?.dead)setState(current.id,{pendingDeathSave:true});
        put(current.id,character);
        log(`${current.name}'s turn · round ${encounter.round}. AP refreshed to 3; bonus available.`);
      };
      const validateTargets=p=>{for(const id of p.targetIds)if(!entry(id))throw new Error('A selected target has left the encounter.');};
      const findOption=(id,optionId)=>{const option=combatOptions(get(id),context.catalog).find(row=>row.id===optionId);if(!option)throw new Error('Choose an owned action or a defined combat action.');return option;};
      const validateAction=(id,option,p,approval={})=>{
        const character=get(id),s=state(id),restriction=combatRestriction(character,{now,encounter});
        if(restriction)throw new Error(`${restriction}: voluntary actions are unavailable.`);
        if(s.pendingDeathSave)throw new Error('Resolve the turn-start death save first.');
        if(option.blocked&&!approval.sourceReason)throw new Error(option.blocked);
        const ap=approval.apOverride===undefined?option.ap:bounded(approval.apOverride,0,3);
        if(approval.apOverride!==undefined&&!approval.sourceReason)throw new Error('An explicit AP override needs its source and reason.');
        if(!Number.isInteger(ap)||(!p.ambush&&s.ap<ap))throw new Error('Not enough AP.');
        if(option.bonus&&!s.bonus)throw new Error('The shared bonus action has already been used.');
        validateTargets(p);
        if(option.key==='shove'&&!['push','prone'].includes(p.choice))throw new Error('Choose push or prone before rolling.');
        if(['grapple','shove','disarm','drag'].includes(option.key)){
          const target=get(p.targetIds[0]);
          if(character.sizeRank!==undefined&&target.sizeRank!==undefined&&target.sizeRank>character.sizeRank+1)throw new Error('Target is more than one size rank larger.');
          if((character.sizeRank===undefined||target.sizeRank===undefined)&&!approval.sizeEligible)throw new Error('The GM must confirm size eligibility from the size chart.');
        }
        if(option.key==='drag'&&s.grappleTarget!==p.targetIds[0])throw new Error('Drag requires an existing hold on that target.');
        if(option.key==='escape'&&!s.grappledBy)throw new Error('No grapple to escape.');
        if(option.key==='jump'&&!s.movement)throw new Error('A meaningful jump must be part of already paid movement.');
        if(option.key==='stand'&&!activeConditions(character,{now,encounter}).some(row=>/prone/i.test(row.name)))throw new Error('This participant is not prone.');
        if(['fly','swim','mount-move','climb','climb-dash','hide','mount','dismount','accessory','pickup','receive','hand','attack','disarm','first-aid','draw','swap'].includes(option.key)&&!approval.feasible)throw new Error('The GM must confirm capability, reach, hands, equipment and feasibility.');
        if(option.key==='first-aid'){
          if(resourcePair(get(p.targetIds[0]).hp)[0]>0)throw new Error('First aid requires a Downed target.');
          if(get(p.targetIds[0]).downed?.dead)throw new Error('First aid cannot resurrect a dead target.');
          if(encounter.combat.firstAid?.[`${id}:${p.targetIds[0]}`]===encounter.round)throw new Error('This helper already attempted first aid on this target this round.');
          if(!approval.skill||!Number.isFinite(approval.dc))throw new Error('First aid needs an appropriate skill and a numeric GM DC.');
        }
        if(option.key==='attack'){
          const weapon=rows(character.inventory).find(row=>row.id===p.itemId);
          if(!weapon||!weapon.equipped||weapon.destroyed||weapon.durability!==undefined&&resourcePair(weapon.durability)[0]<=0)throw new Error('Choose an intact wielded weapon.');
          if(weapon.ammunitionType&&!approval.consume?.length)throw new Error('Select the required ammunition before attacking.');
          if((weapon.weaponSkill||weapon.skill)&&slug(approval.skill)!==slug(weapon.weaponSkill||weapon.skill))throw new Error('Use this weapon’s recorded attack skill.');
        }
        if(option.kind==='spell'){
          const rankIndex=SPELL_RANKS.indexOf(option.rank);if(rankIndex<0)throw new Error('The exact learned spell rank is missing.');
          if(!approval.rankEligible)throw new Error(`Confirm ${option.element||'elemental'} skill access: ${SPELL_SKILL_ACCESS[rankIndex]}${rankIndex===7?' and World unlock':''}.`);
          if(!approval.castingMethod)throw new Error('Confirm the actual class casting method and its focus, pact, conduit or recipe.');
          if(approval.personalMP!==undefined&&approval.personalMP!==option.baseMP&&!approval.sourceReason)throw new Error('A casting reduction requires its source and approved class method.');
          if(approval.castingMethod==='sorcerer'&&(!approval.consume?.length||!approval.recipeConfirmed))throw new Error('Sorcerer casting needs the exact component recipe and quantities.');
          if(approval.castingMethod==='summoner'&&(!approval.channelSkill||!Number.isFinite(approval.channelDC)))throw new Error('Summoner casting needs its fixed Focus (WIS) channel DC.');
          if(!approval.feasible)throw new Error('Confirm range, sight, eligible targets and casting time.');
          const fixed=option.fields.dc??String(option.fields.check||'').match(/\bDC\s*(\d+)/i)?.[1];
          if(fixed!==undefined&&Number(approval.dc)!==Number(fixed))throw new Error(`This source has a fixed DC of ${fixed}.`);
          if(/^(none|n\/a)$/i.test(option.fields.check||'')&&approval.checkType!=='none')throw new Error('This source has no general casting check.');
        }
        if(option.kind==='scroll'){
          if(!option.item.creatorStatistics)throw new Error('This scroll has no creator-stored casting statistics.');
          if(option.item.spell?.counterspell||/counterspell/i.test(option.item.spell?.name||''))throw new Error('A scroll cannot perform Counterspell.');
          if(!approval.feasible||(option.rank==='World'&&!approval.rankEligible))throw new Error('Confirm scroll reading, targeting and any World unlock.');
        }
        if(['item','scroll'].includes(option.kind)&&!option.item.equipped&&!['held','potion-belt'].includes(option.item.location))throw new Error('Retrieve the item before using it.');
        if(option.kind==='item'&&option.bonus&&option.item.location==='potion-belt'&&option.item.accessible!==true)throw new Error('The potion belt must be accessible.');
        if(approval.nonlethal&&!approval.feasible)throw new Error('Nonlethal intent needs GM feasibility before rolling.');
        return ap;
      };
      const begin=(p,approval)=>{
        const option=findOption(p.actorId,p.optionId),s=state(p.actorId),ap=validateAction(p.actorId,option,p,approval);
        if(option.key==='attack'&&approval.checkType!=='attack')throw new Error('Weapon attacks use a named weapon skill against AC.');
        const opposed={grapple:[['grappling'],['grappling','acrobatics']],escape:[['grappling','acrobatics'],['grappling']],shove:[['athletics'],['athletics','acrobatics']],hide:[['stealth','stealth-combat'],['perception']]};
        if(opposed[option.key]){const [acting,defending]=opposed[option.key];if(approval.checkType!=='opposed'||!acting.includes(slug(approval.skill))||!defending.includes(slug(approval.opposedSkill)))throw new Error(`Use ${acting.join(' / ')} vs ${defending.join(' / ')}.`);}
        if(option.key==='disarm'&&approval.checkType!=='opposed')throw new Error('Disarm requires the opposing weapon skill / Athletics contest.');
        let character=get(p.actorId),costs={...option.costs};
        if(approval.resourceCosts!==undefined){if(!approval.sourceReason)throw new Error('A cost adjustment needs its source.');costs=parseResourceCosts(approval.resourceCosts,'mp',true);}
        if(option.kind==='spell'&&approval.personalMP!==undefined)costs.mp=bounded(approval.personalMP);
        if(approval.checkType==='fixed'&&(!approval.skill||!Number.isFinite(approval.dc)))throw new Error('Set the named skill and numeric DC before beginning.');
        if(['opposed','attack'].includes(approval.checkType)&&(!approval.skill||!p.targetIds.length))throw new Error('A named skill and target are required.');
        if(approval.checkType==='opposed'&&!approval.opposedSkill)throw new Error('Name the opposing skill before beginning.');
        if(approval.skill)skillCheck(character,approval.skill,{catalog:context.catalog,characteristic:approval.characteristic,secondaryApproved:approval.secondaryApproved,clock:{now,encounter}});
        if(approval.opposedSkill)skillCheck(get(p.targetIds[0]),approval.opposedSkill,{catalog:context.catalog,clock:{now,encounter}});
        if(option.kind==='scroll')delete costs.mp;
        if(option.kind==='scroll')p.creatorStatistics=copy(option.item.creatorStatistics);
        p.ap=p.ambush?0:ap;p.bonus=Boolean(option.bonus);p.costs=costs;p.approval=copy(approval);p.begunAt=now;p.baseMP=option.baseMP||0;p.kind=option.kind;p.key=option.key||'';p.rank=option.rank||'';
        if(option.kind==='spell'&&approval.castingMethod==='summoner'){
          const check=skillCheck(character,approval.channelSkill,{catalog:context.catalog,clock:{now,encounter}}),dice=rollD20(check,numberDie),result={...dice,total:dice.die+check.modifier};
          p.channelResult={...result,dc:approval.channelDC,success:checkResult(result,approval.channelDC)};
          if(!p.channelResult.success){const available=resourceSnapshot(character,'mp').current;if(available>=option.baseMP)costs.mp=option.baseMP;else{const fee=Math.ceil(option.baseMP/2);costs.mp=Math.min(available,fee);p.paymentShortfall=Math.max(0,fee-available);p.failedBeforeManifestation=true;if(p.paymentShortfall)p.publicMessage='Failed casting: remaining payment needs GM resolution.';}}
        }
        if(option.kind==='talent'){
          const used=useLearnedTalent(character,option.talent,{choice:option.choice,triggerConfirmed:approval.triggerConfirmed},{catalog:buildTalentCatalog(character,context.catalog),encounter,now,sessionId:session.id,deferEffects:true});
          character=used.character;p.costs=used.costs;p.deferred={restore:{...used.restored,...(used.bpGain?{bp:used.bpGain}:{})},effect:used.effect};
        }else{const paid=payCombatCosts(character,costs,approval.hpPayment===true);character=paid.character;p.paid=paid.paid;}
        const consumptions=[...(approval.consume||[])];
        if(option.kind==='scroll'||option.kind==='item'&&(/potion|consumable/i.test(option.item.type||'')||option.item.consumable===true))consumptions.push({itemId:option.itemId,quantity:1});
        if(consumptions.length){character.inventory=copy(rows(character.inventory));for(const c of consumptions){const item=character.inventory.find(row=>row.id===c.itemId),quantity=bounded(c.quantity,1,100000);if(!Number.isInteger(quantity)||!item||Number(item.qty??1)<quantity)throw new Error('A required component, scroll or ammunition is missing.');item.qty=Number(item.qty??1)-quantity;}character.inventory=character.inventory.filter(row=>row.qty!==0);}
        if(option.kind==='item'&&option.item.charges!==undefined){const item=character.inventory.find(row=>row.id===option.itemId);if(!item||Number(item.charges)<1)throw new Error('No charges remaining.');item.charges--;}
        if(option.kind==='item'){const effect=option.item.effect||option.item.effects||{};p.deferred={restore:effect.resource?{[effect.resource]:Number(effect.amount)}:parseResourceCosts(effect)};}
        if(!p.ambush)setState(p.actorId,{ap:s.ap-ap,bonus:option.bonus?false:s.bonus,prepared:p.prepared?null:s.prepared});
        if(option.key==='first-aid')encounter.combat.firstAid={...encounter.combat.firstAid,[`${p.actorId}:${p.targetIds[0]}`]:encounter.round};
        put(p.actorId,character);
        p.status=['attack','spell','scroll'].includes(option.key||option.kind)||approval.voluntaryLeavesReach?'reactions':'awaiting-roll';p.window=[];p.windowIndex=0;
        if(p.failedBeforeManifestation){p.status='awaiting-resolution';p.result={success:false,channel:p.channelResult};}
        log(`${p.actorName} begins ${p.actorKind==='player'?p.name:'an action'} · ${p.ap} AP${p.bonus?' · bonus used':''}.`);
      };
      const makePending=(id,option,input)=>({id:context.requestId,actorId:id,actorName:entry(id).name,actorKind:entry(id).kind,optionId:option.id,name:option.name,ap:option.ap,bonus:Boolean(option.bonus),costs:option.costs,status:'awaiting-approval',targetIds:[...new Set(input.targetIds||[])],choice:text(input.choice,100),itemId:text(input.itemId,160),swapItemId:text(input.swapItemId,160),slot:text(input.slot,80),note:text(input.note),declaredAt:now});

      if(input.operation==='save'){
        noPending();const requested=input.encounter||{};
        const oldCurrent=currentCombatant(encounter)?.id,oldIds=new Set(encounter.combatants.map(row=>row.id));
        const nextRows=(requested.combatants||[]).map(row=>{if(!/^[A-Za-z0-9_-]{1,160}$/.test(row.id))throw new Error('Invalid participant ID.');const old=entry(row.id);const next=old?{...old,defeated:Boolean(row.defeated)}:row.characterId?{id:row.id,characterId:row.characterId,name:characters.get(row.characterId)?.name||'Character',kind:'player',initiative:0}: {...copy(row),kind:'enemy',...encounterSourceResources(row)};if(encounter.status!=='active'&&row.initiativeSet===true){next.initiative=bounded(row.initiative,-100,1000);next.initiativeSet=true;}return next;});
        if(new Set(nextRows.map(row=>row.id)).size!==nextRows.length)throw new Error('Duplicate participant.');
        encounter.combatants=nextRows;
        for(const row of nextRows)if(!oldIds.has(row.id)){
          if(encounter.status==='active'&&!row.initiativeSet){const result=initiativeResult(get(row.id),roll(),roll(),{now,encounter});row.initiative=result.total;row.initiativeRoll=result;}
          setState(row.id,{ap:0,bonus:false,turns:0});
        }
        if(encounter.status==='active'){
          encounter.combatants.sort(initiativeOrder);
          if(!nextRows.some(row=>row.id===oldCurrent))throw new Error('Advance the current turn before removing its participant.');
          encounter.turnIndex=encounter.combatants.findIndex(row=>row.id===oldCurrent);
        }
        encounter.enemies=encounter.combatants.filter(row=>row.kind!=='player').map(copy);
        if(encounter.status==='ended'&&requested.status==='ready')encounter.status='ready';
        log('GM updated encounter participants.');
      }else if(input.operation==='start'){
        noPending();if(encounter.status==='active'&&encounter.combat?.version===1)throw new Error('The encounter is already active.');
        if(!encounter.combatants.length)throw new Error('Add participants first.');
        if(!['ready','ended','active'].includes(encounter.status))throw new Error('Prepare the encounter before starting combat.');
        encounter.status='active';encounter.round=1;encounter.turnIndex=0;encounter.combatId=context.requestId;encounter.combat.participants={};encounter.combat.firstAid={};encounter.combat.version=1;
        for(const row of encounter.combatants){if(!row.initiativeSet){const result=initiativeResult(get(row.id),roll(),roll(),{now,encounter});row.initiative=result.total;row.initiativeRoll=result;}setState(row.id,{ap:0,bonus:false,turns:0,turnComplete:false});}
        encounter.combatants.sort(initiativeOrder);startTurn();
      }else if(input.operation==='end-turn'){
        requireActive();controlled();noPending();
        if(currentCombatant(encounter)?.id!==actorId)throw new Error('Only the current participant can end their turn.');
        if(state(actorId).pendingDeathSave)throw new Error('Resolve the pending death save before ending this turn.');
        if(state(actorId).turnComplete)throw new Error('This turn is already complete.');
        setState(actorId,{turnComplete:true});log(`${entry(actorId).name} ends their turn; unused AP held for reactions. Waiting for the GM to advance.`);
      }else if(input.operation==='next'){
        requireActive();noPending();const current=currentCombatant(encounter);if(state(current.id).pendingDeathSave)throw new Error('Resolve the pending death save before ending this turn.');conditionBoundary(current.id,'end');
        encounter.turnIndex=(encounter.turnIndex+1)%encounter.combatants.length;if(encounter.turnIndex===0)encounter.round++;startTurn();
      }else if(input.operation==='end'||input.operation==='clear'){
        if(input.operation==='end')requireActive();
        if(privateState.pending)log(`GM closes the pending ${privateState.pending.status} action at combat end; committed costs remain spent.`);
        privateState.pending=null;privateState.preparations={};
        for(const row of encounter.combatants){const character=get(row.id);character.conditions=rows(character.conditions).map(condition=>condition.encounterId||condition.throughOwnTurn!==undefined?{...condition,encounterId:'',untilRound:0,pendingGMExpiry:true}:condition);put(row.id,character);}
        encounter.status=input.operation==='end'?'ended':'ready';encounter.turnIndex=null;encounter.combat.participants={};encounter.combat.firstAid={};
        for(const key of ['turnTimer','timer'])if(encounter[key])encounter[key]={...encounter[key],enabled:false,endsAt:null};
        if(input.operation==='clear'){encounter.combatants=[];encounter.enemies=[];encounter.turnIndex=0;encounter.round=1;}log('Combat ended; remaining resources and conditions retained.');
      }else if(input.operation==='correct'){
        const reason=text(input.reason);if(!reason)throw new Error('A GM correction needs a recorded reason.');
        const id=input.targetId||actorId,character=get(id);
        if(input.resource){let next=input.current!==undefined?setEncounterResource(character,input.resource,bounded(input.current),input.maximum===undefined?undefined:bounded(input.maximum)):changeCombatHP(character,bounded(input.amount),{damage:input.damage===true,nonlethal:input.nonlethal===true,now});if(input.resource==='hp'&&input.current!==undefined){if(resourcePair(next.hp)[0]>0)delete next.downed;else if(!next.downed)next.downed={successes:0,failures:0,dead:false};}put(id,next);}
        if(input.ap!==undefined)setState(id,{ap:bounded(input.ap,0,3)});
        if(input.bonus!==undefined)setState(id,{bonus:input.bonus===true});
        if(input.initiative!==undefined){if(encounter.status==='active')throw new Error('Initiative positions cannot be delayed or reordered during combat.');entry(id).initiative=bounded(input.initiative,-100,1000);}
        log(`GM correction for ${entry(id).name}: ${reason}`);
      }else if(input.operation==='condition'){
        const id=input.targetId||actorId;let character=get(id);
        if(input.condition.action==='remove')character=removeCondition(character,input.condition.id,{isGM:true,uid:currentUser.uid,now});
        else character=applyCondition(character,makeCondition(input.condition,currentUser.uid,{now,encounter},`condition-${context.requestId}`),{now,encounter});
        put(id,character);log(`GM updated ${entry(id).name}'s conditions.`);
      }else if(input.operation==='death-save'){
        requireActive();controlled();if(currentCombatant(encounter)?.id!==actorId||!state(actorId).pendingDeathSave)throw new Error('No death save is due for this participant.');const die=roll();put(actorId,deathSave(get(actorId),die));setState(actorId,{pendingDeathSave:false});log(`${entry(actorId).name} death save: ${die}.`);
      }else if(input.operation==='declare'||input.operation==='prepare'||input.operation==='ambush'){
        if(input.operation!=='ambush')requireActive();controlled();noPending();
        const option=findOption(actorId,input.optionId),s=state(actorId);
        if(input.operation==='ambush'){
          if(encounter.status==='active'||s.ambushUsed||!input.approval?.feasible||!input.approval?.unnoticed||option.key!=='attack')throw new Error('An opening ambush requires GM approval, an unnoticed attacker and one attack before initiative.');
        }else if(currentCombatant(encounter)?.id!==actorId||s.turnComplete)throw new Error('Ordinary actions and preparation are available only on your own turn before it is completed.');
        if(combatRestriction(get(actorId),{now,encounter}))throw new Error('This participant cannot act.');
        const p=makePending(actorId,option,input);validateTargets(p);
        if(input.operation==='prepare'){
          if(s.prepared)throw new Error('One prepared action may be declared per turn.');
          if(s.ap<option.ap||option.bonus&&!s.bonus)throw new Error('Retain enough AP and bonus use to execute this action.');
          if(!text(input.trigger)||!text(input.response))throw new Error('Enter an observable trigger and target / response conditions.');
          privateState.preparations[actorId]={...p,trigger:text(input.trigger),response:text(input.response),expiresOnTurn:s.turns+1};
          setState(actorId,{prepared:{name:entry(actorId).kind==='player'?option.name:'Prepared action',ap:option.ap,trigger:entry(actorId).kind==='player'?text(input.trigger):'GM trigger',expiresOnTurn:s.turns+1}});log(`${entry(actorId).name} prepares an action; no AP spent.`);
        }else{
          privateState.pending=p;
          if(input.operation==='ambush'){p.ambush=true;setState(actorId,{ambushUsed:true});begin(p,input.approval);}
          else if(['command','disengage'].includes(option.key))begin(p,{});
          log(`${entry(actorId).name} declares ${entry(actorId).kind==='player'?option.name:'an action'}.`);
        }
      }else if(input.operation==='approve'){
        const p=privateState.pending;if(!p||p.status!=='awaiting-approval')throw new Error('No declaration awaits approval.');
        if(!p.prepared&&!p.ambush&&currentCombatant(encounter)?.id!==p.actorId)throw new Error('The declaring actor is no longer active.');
        begin(p,input.approval||{});
      }else if(input.operation==='reject'||input.operation==='cancel'){
        const p=privateState.pending;if(!p||p.status!=='awaiting-approval')throw new Error('A begun action cannot be freely cancelled or refunded.');
        if(!gm){controlled();if(p.actorId!==actorId)throw new Error('This is another participant’s declaration.');}
        privateState.pending=null;log('Unbegun declaration cancelled; no costs spent.');
      }else if(input.operation==='trigger-prepared'){
        if(!gm)throw new Error('The GM confirms observable prepared triggers.');requireActive();noPending();
        const p=privateState.preparations[actorId];if(!p||state(actorId).turns>=p.expiresOnTurn)throw new Error('No unexpired prepared action.');
        if(!text(input.reason))throw new Error('Record how the declared trigger occurred.');
        privateState.pending={...copy(p),id:context.requestId,prepared:true,status:'awaiting-approval'};log(`Prepared trigger confirmed for ${entry(actorId).name}: ${text(input.reason)}`);
      }else if(input.operation==='window'){
        const p=privateState.pending;if(!p||p.status!=='reactions'||p.reaction)throw new Error('No open pre-roll reaction window.');
        if(p.window?.length)throw new Error('Resolve the current reaction queue first.');
        const seen=new Set();p.window=(input.reactors||[]).map(row=>{if(!entry(row.actorId)||seen.has(row.actorId)||row.actorId===p.actorId)throw new Error('Choose distinct participating reactors.');seen.add(row.actorId);return {actorId:row.actorId,choices:rows(row.choices).map(value=>value.name),reason:text(row.reason),approval:row.approval||{},abilityIds:row.abilityIds||[]};}).sort((a,b)=>encounter.combatants.findIndex(row=>row.id===a.actorId)-encounter.combatants.findIndex(row=>row.id===b.actorId));p.windowIndex=0;
        for(const row of p.window)if(!row.reason||!row.choices.length)throw new Error('Each reactor needs actual permitted choices and an awareness / range / trigger reason.');
        for(const row of p.window){
          if(row.choices.some(choice=>['dodge','block','parry'].includes(choice))&&p.approval?.checkType!=='attack')throw new Error('Ordinary active defence requires an individual incoming attack.');
          if(row.choices.includes('opportunity')&&(!p.approval?.voluntaryLeavesReach||!['walk','swim','fly','climb','dash','climb-dash','mount-move','drag'].includes(p.key)||state(p.actorId).disengaged))throw new Error('Opportunity attacks require voluntary leaving-reach movement without Disengage.');
        }
      }else if(input.operation==='pass'||input.operation==='react'||input.operation==='react-ability'){
        controlled();const p=privateState.pending,window=p?.window?.[p.windowIndex||0];if(!p?.ambush)requireActive();
        if(!p||p.status!=='reactions'||p.reaction||window?.actorId!==actorId)throw new Error('No eligible trigger is currently open for this participant.');
        if(input.operation==='pass'){p.windowIndex++;log(`${entry(actorId).name} passes the reaction.`);}
        else if(input.operation==='react-ability'){
          const option=findOption(actorId,input.optionId);
          if(!window.abilityIds.includes(option.id)&&!option.reaction)throw new Error('This owned ability does not permit reaction use.');
          if(!window.choices.includes('ability')&&!window.choices.includes('counterspell'))throw new Error('No ability reaction is available for this trigger.');
          const counter=window.choices.includes('counterspell');
          if(counter){if(p.kind!=='spell'&&p.kind!=='scroll')throw new Error('No incoming casting window.');if(SPELL_RANKS.indexOf(p.rank)>SPELL_RANKS.indexOf(option.rank)+1)throw new Error('Incoming spell exceeds your actual Counterspell rank limit.');}
          const response=makePending(actorId,option,{...input,targetIds:counter?[p.actorId]:input.targetIds});response.reaction=true;
          begin(response,{...window.approval,apOverride:window.approval.apOverride??(option.bonus?0:1),sourceReason:window.approval.sourceReason||'Defined reaction default',triggerConfirmed:true});
          p.reaction={actorId,key:counter?'counterspell':'ability',name:option.name,action:response};
        }else{
          if(combatRestriction(get(actorId),{now,encounter}))throw new Error('This participant cannot react.');
          const key=input.reaction;if(!window.choices.includes(key))throw new Error('This reaction is not permitted for the trigger.');
          if(p.ambush&&key==='dodge')throw new Error('An unaware target cannot Dodge an opening ambush.');
          if(key==='prepared'){
            const prepared=privateState.preparations[actorId];if(!prepared||state(actorId).turns>=prepared.expiresOnTurn)throw new Error('No unexpired prepared action.');
            const response={...copy(prepared),id:context.requestId,prepared:true};begin(response,window.approval||{});p.reaction={actorId,key:'ability',name:prepared.name,action:response};delete privateState.preparations[actorId];
          }else{
          if(!['dodge','block','parry','opportunity'].includes(key))throw new Error('Select a defined owned reaction ability through its source panel.');
          validateReactionEquipment(get(actorId),key);
          if(state(actorId).ap<1)throw new Error('No held AP.');
          if(key==='opportunity'&&!window.reason)throw new Error('Opportunity requires perceived voluntary leaving-reach movement.');
          put(actorId,applyResourceChanges(get(actorId),{costs:key==='opportunity'?parseResourceCosts(window.approval.resourceCosts||{}):{sp:10}}));setState(actorId,{ap:state(actorId).ap-1});
          p.reaction={actorId,key,name:key,ap:1,costs:key==='opportunity'?{}:{sp:10}};log(`${entry(actorId).name} commits ${key}: 1 held AP${key==='opportunity'?'':' + 10 SP'}.`);
          }
        }
      }else if(input.operation==='resolve-reaction'){
        const p=privateState.pending,r=p?.reaction;if(!r)throw new Error('No reaction awaits resolution.');
        if(r.key==='counterspell'){
          const a=p.approval||{},b=r.action.approval||{};
          if(!a.elementalSkill||!b.elementalSkill)throw new Error('Choose both casters’ actual elemental skills.');
          const makeRoll=(id,skill)=>{const check=skillCheck(get(id),skill,{catalog:context.catalog,clock:{now,encounter}}),d=rollD20(check,numberDie);return {...d,total:d.die+check.modifier};};
          const incoming=makeRoll(p.actorId,a.elementalSkill),counter=makeRoll(r.actorId,b.elementalSkill);
          if(b.elementRelation!=='same'&&b.elementRelation!=='opposite'&&!b.sourceReason)throw new Error('Other element relationships need approved content.');
          const result=counterspellResult(incoming,counter,p.rank,r.action.rank,b.elementRelation==='same'?-2:b.elementRelation==='opposite'?0:Number(b.elementModifier||0));
          privateState.lastClash={incoming,counter,result};
          if(result.incomingFeedback)put(p.actorId,feedback(get(p.actorId),p.rank,state(p.actorId).turns,now));
          if(result.counterFeedback)put(r.actorId,feedback(get(r.actorId),r.action.rank,state(r.actorId).turns,now));
          if(result.reroll){p.reaction={...r,reroll:true};log('Magical clash tied; reroll without additional costs.');}
          else {p.prevented=!result.incomingSurvives;p.feedbackApplied=Boolean(result.incomingFeedback);p.reaction=null;p.windowIndex++;if(p.prevented){p.windowIndex=p.window.length;p.status='awaiting-resolution';p.result={success:false,counterspell:result};}}
        }else if(['dodge','block','parry'].includes(r.key)){p.defences=[...(p.defences||[]),r];}
        else {if(!text(input.reason))throw new Error('Record the source-specific reaction result.');if(r.action?.deferred&&input.success===true){let character=applyResourceChanges(get(r.actorId),{restore:r.action.deferred.restore||{}});if(r.action.deferred.effect)character.talentEffects=[...(character.talentEffects||[]),r.action.deferred.effect];put(r.actorId,character);}for(const change of input.results||[])put(change.targetId,changeCombatHP(get(change.targetId),bounded(change.amount),{damage:change.damage===true,now}));}
        if(r.key!=='counterspell'){p.reaction=null;p.windowIndex++;}log('Reaction recorded. Later triggers must be revalidated.');
      }else if(input.operation==='close-window'){
        const p=privateState.pending;if(!p||p.status!=='reactions'||p.reaction)throw new Error('Resolve the committed reaction first.');
        if((p.windowIndex||0)<(p.window||[]).length&&!text(input.reason))throw new Error('Record why remaining reactions are closed or invalidated.');p.status='awaiting-roll';
      }else if(input.operation==='roll'){
        const p=privateState.pending;if(!p||p.status!=='awaiting-roll')throw new Error('Close pre-roll reactions before rolling.');
        const a=p.approval||{},character=get(p.actorId);
        if(a.checkType==='none'){p.result={success:true,check:'None / N/A'};}
        else{
          if(!a.skill)throw new Error('A named skill and check type are required.');
          const check=p.kind==='scroll'?{skill:a.skill,modifier:bounded(p.creatorStatistics?.modifier,-100,1000),advantage:Boolean(a.advantage&&!a.disadvantage),disadvantage:Boolean(a.disadvantage&&!a.advantage)}:skillCheck(character,a.skill,{catalog:context.catalog,characteristic:a.characteristic,secondaryApproved:a.secondaryApproved,modifier:a.modifier,advantage:a.advantage||p.ambush,disadvantage:a.disadvantage,clock:{now,encounter}}),dice=rollD20(check,numberDie),attack={...dice,total:dice.die+check.modifier,...check};
          if(a.checkType==='attack'){
            const target=get(p.targetIds[0]);if(a.cover==='full'&&!a.bypassCover)throw new Error('Full cover blocks direct delivery.');
            const ac=target.kind==='enemy'?Number(target.ac):calculateCharacterAC(target).finalAC;
            if(!Number.isFinite(ac))throw new Error('The target’s applicable AC is missing.');
            attack.total+=a.flanking===true?2:0;let defence;
            if(attackResult(attack,ac+(a.cover==='partial'?2:a.cover==='substantial'?4:0)).hit){const reaction=p.defences?.find(row=>row.actorId===p.targetIds[0]);if(reaction){const skill={dodge:'Dodging',block:'Shield Use',parry:'Parrying'}[reaction.key],dc=skillCheck(target,skill,{catalog:context.catalog,clock:{now,encounter}}),d=rollD20(dc,numberDie);defence={...d,total:d.die+dc.modifier,key:reaction.key};}}
            p.result={attack,ac,defence:defence||null,...attackResult(attack,ac+(a.cover==='partial'?2:a.cover==='substantial'?4:0),defence)};p.result.success=p.result.hit;
          }else if(a.checkType==='opposed'){
            if(!a.opposedSkill)throw new Error('Name the opposing skill.');const check2=skillCheck(get(p.targetIds[0]),a.opposedSkill,{catalog:context.catalog,clock:{now,encounter}}),d=rollD20(check2,numberDie),opponent={...d,total:d.die+check2.modifier,...check2};p.result={roll:attack,opponent,success:checkResult(attack,opponent.total,{opposed:true})};
          }else{if(!Number.isFinite(a.dc))throw new Error('Set the numeric DC before rolling.');p.result={roll:attack,dc:a.dc,success:checkResult(attack,a.dc)};}
        }
        p.status='awaiting-resolution';log(`${p.actorName}'s check rolled; awaiting effects.`);
      }else if(input.operation==='resolve'){
        const p=privateState.pending;if(!p||!['awaiting-resolution','awaiting-roll'].includes(p.status))throw new Error('Handle reactions and rolls before resolving.');
        const reason=text(input.reason);if(!p.result&&!reason)throw new Error('Record the GM adjudication for an unresolved source effect.');
        validateTargets(p);const success=p.result?.success??input.success===true;
        if(p.paymentShortfall)put(p.actorId,payCombatCosts(get(p.actorId),{mp:p.paymentShortfall},p.approval.hpPayment===true).character);
        if(!['manifested','failed-before-manifestation','feedback','countered'].includes(input.outcome||'manifested'))throw new Error('Choose the casting outcome.');
        if(p.kind==='spell'&&!p.failedBeforeManifestation&&input.outcome==='failed-before-manifestation'){
          const fee=Math.ceil(p.baseMP/2),paidMP=Number(p.paid?.mp||0),difference=fee-paidMP;
          put(p.actorId,difference>0?payCombatCosts(get(p.actorId),{mp:difference},p.approval.hpPayment).character:applyResourceChanges(get(p.actorId),{restore:{mp:-difference}}));
        }
        if(input.outcome==='feedback'&&!p.feedbackApplied)put(p.actorId,feedback(get(p.actorId),p.rank,state(p.actorId).turns,now));
        const manifests=success&&!p.prevented&&!['failed-before-manifestation','feedback','countered'].includes(input.outcome);
        if(new Set((input.results||[]).map(row=>row.targetId)).size!==(input.results||[]).length)throw new Error('Resolve each target once per damage event.');
        if(manifests){
          if(p.deferred){const targetId=p.approval.effectTargetId||p.actorId;if(![p.actorId,...p.targetIds].includes(targetId))throw new Error('Effect target changed.');let target=applyResourceChanges(get(targetId),{restore:p.deferred.restore||{}});if(p.deferred.effect)target.talentEffects=[...(target.talentEffects||[]).filter(row=>row.id!==p.deferred.effect.id),p.deferred.effect];put(targetId,target);}
          if(p.key==='first-aid')put(p.targetIds[0],deathSave(get(p.targetIds[0]),10,{firstAid:true}));
          if(p.key==='disengage')setState(p.actorId,{disengaged:true});
          if(['walk','swim','fly','climb','dash','climb-dash','mount-move'].includes(p.key))setState(p.actorId,{movement:{actionId:p.id,kind:p.key,remaining:p.approval.distance??null}});
          if(p.key==='grapple'){setState(p.actorId,{grappleTarget:p.targetIds[0]});setState(p.targetIds[0],{grappledBy:p.actorId});}
          if(p.key==='escape'){const holder=state(p.actorId).grappledBy;if(holder)setState(holder,{grappleTarget:null});setState(p.actorId,{grappledBy:null});}
          if(p.key==='stand'){const target=get(p.actorId);target.conditions=rows(target.conditions).map(row=>/prone/i.test(row.name)?{...row,active:false}:row);put(p.actorId,target);}
          if(p.key==='shove'&&p.choice==='prone'){const target=get(p.targetIds[0]);target.conditions=[...(target.conditions||[]),{id:`prone-${p.id}`,name:'Prone',source:'Shove',active:true,effects:[]}];put(p.targetIds[0],target);}
          if(['draw','stow','swap','retrieve','drop','disarm','hand','accessory'].includes(p.key)){
            const ownerId=p.key==='disarm'?p.targetIds[0]:p.actorId;let character=copy(get(ownerId));const item=rows(character.inventory).find(row=>row.id===p.itemId);if(!item)throw new Error('Selected item is no longer available.');
            const detach=which=>{which.equipped=false;which.equippedSlot='';for(const [slot,value] of Object.entries(character.equipment||{}))if(value?.id===which.id)delete character.equipment[slot];};
            if(['draw','swap','accessory'].includes(p.key)){
              const valid=validateEquipmentChange(character,item,p.slot);if(!valid.ok)throw new Error(valid.reason||valid.error||'Equipment change is not permitted.');
              if(p.key==='swap'){const previous=character.inventory.find(row=>row.id===p.swapItemId&&row.equipped);if(!previous)throw new Error('Select the currently wielded weapon to stow.');detach(previous);previous.location='inventory';}
              item.equipped=true;item.equippedSlot=p.slot;item.location='equipment';character.equipment={...character.equipment,[p.slot]:item};
            }else {detach(item);item.location=p.key==='retrieve'?'held':['drop','disarm'].includes(p.key)?'ground':'inventory';}
            if(p.key==='hand'){const target=copy(get(p.targetIds[0]));target.inventory=[...rows(target.inventory),{...item,location:'held'}];character.inventory=character.inventory.filter(row=>row.id!==item.id);put(p.targetIds[0],target);}
            put(ownerId,character);
          }
          for(const result of input.results||[]){if(!p.targetIds.includes(result.targetId)&&result.targetId!==p.actorId)throw new Error('Results must use the declared targets.');let target=get(result.targetId);const amount=result.damage?mixedDamage(result.damage,target.damageDefences):bounded(result.healing||0);target=changeCombatHP(target,amount,{damage:Boolean(result.damage),nonlethal:p.approval.nonlethal===true,now});put(result.targetId,target);}
        }
        // Interception resolves before the selected item's durability is changed.
        for(const hit of input.durability||[]){const target=copy(get(hit.targetId)),item=rows(target.inventory).find(row=>row.id===hit.itemId);if(!item||item.durability===undefined)throw new Error('Select the struck item with recorded durability.');const [current,max]=resourcePair(item.durability);item.durability=[Math.max(0,current-bounded(hit.amount)),max];if(item.durability[0]===0){item.destroyed=true;item.equipped=false;for(const [slot,value]of Object.entries(target.equipment||{}))if(value?.id===item.id)delete target.equipment[slot];}put(hit.targetId,target);}
        log(`${p.actorName}: ${p.actorKind==='player'?p.name:'action'} ${manifests?'resolved':'failed / prevented'}.${reason?` ${reason}`:''}`);
        privateState.lastResult={id:p.id,name:p.name,result:p.result||null,reason,outcome:input.outcome||'manifested'};privateState.pending=null;
      }else throw new Error('Unsupported combat operation.');

      encounter.combat.revision=oldRevision+1;encounter.combat.pending=publicPending(privateState.pending);
      for(const [id,character]of characters){const refs=documents.get(id),next=reconcileCharacterSystems(character,buildTalentCatalog(character,context.catalog),{now,encounter}),patch={};
        next.inventory=normalizeInventoryItems(next.inventory||[],next);
        for(const [key,value]of Object.entries(next))if(combatCharacterFields.has(key)&&value!==undefined&&!isDeepStrictEqual(refs.original[key],value))patch[key]=value;
        if(refs.original.downed&&next.downed===undefined)patch.downed=null;
        if(Object.keys(patch).length){patch.coreRevision=Number(refs.original.coreRevision||0)+1;patch.updatedAt=serverTimestamp();tx.update(refs.ref,patch);if(refs.privateExists)tx.update(refs.privateRef,patch);}
      }
      tx.set(encounterRef,{...encounter,updatedBy:currentUser.uid,updatedAt:serverTimestamp()},{merge:true});
      tx.set(gmRef,{combatState:privateState},{merge:true});
      return {ok:true,revision:encounter.combat.revision};
    });}catch(error){return {ok:false,error:error.message||String(error)};}
  }};
}
