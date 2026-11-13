import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  PARTY_LOOT_VOTE_LIMIT,PARTY_LOOT_CHOICES,validatedLootChoices,startLootDistribution,
  castLootChoice,eligibleLootWinners,awardLootDistribution,lootVoteTally,publicLootVoteSummary
} from '../src/state/partyLootDistributionModel.mjs';
import {playerAvailableLoot} from '../src/state/partyLootViewModel.mjs';
import {inventoryActivityCategory} from '../src/state/inventoryActivityModel.mjs';
const load=file=>readFileSync(new URL(file,import.meta.url),'utf8');
const item={id:'sword',kind:'item',status:'available',visibility:'revealed',
  title:'Hidden Cache',source:'Ruins',item:{name:'Unidentified Item',identified:false,qty:1}};
test('Phase 9.2: only available revealed items can be put into GM review',()=>{
  assert.deepEqual(startLootDistribution(item),{status:'open',choices:{}});
  for(const patch of [{kind:'currency'},{status:'claimed'},{visibility:'hidden'},
    {distribution:{status:'open'}},{distribution:{status:'awarded'}}])
    assert.throws(()=>startLootDistribution({...item,...patch}));
});
test('Phase 9.2: Need Greed Pass remains distinct, bounded and deterministic',()=>{
  assert.deepEqual(PARTY_LOOT_CHOICES,['need','greed','pass']);
  let vote={status:'open',choices:{}};
  vote=castLootChoice(vote,'bob','greed');
  vote=castLootChoice(vote,'alice','need');
  vote=castLootChoice(vote,'charlie','pass');
  assert.deepEqual(lootVoteTally(vote),{need:1,greed:1,pass:1});
  assert.deepEqual(eligibleLootWinners(vote),[
    {characterId:'alice',choice:'need'},{characterId:'bob',choice:'greed'}
  ]);
  vote=castLootChoice(vote,'bob','need');
  assert.deepEqual(lootVoteTally(vote),{need:2,greed:0,pass:1});
  assert.throws(()=>castLootChoice(vote,'bad/id','need'),/valid linked/);
  assert.throws(()=>castLootChoice(vote,'alice','other'),/Need, Greed or Pass/);
  assert.throws(()=>castLootChoice({status:'awarded',choices:{}},'alice','need'),/not open/);
  assert.throws(()=>validatedLootChoices({choices:[]}),/invalid/);
  const full={status:'open',choices:Object.fromEntries(Array.from({length:PARTY_LOOT_VOTE_LIMIT},(_,i)=>['p'+i,'pass']))};
  assert.throws(()=>castLootChoice(full,'extra','greed'),/limit/);
  assert.equal(castLootChoice(full,'p0','need').choices.p0,'need');
});
test('Phase 9.2: GM may choose a Need or Greed participant but never a Pass or nonparticipant',()=>{
  const votes={status:'open',choices:{alice:'pass',bob:'greed',charlie:'need'}};
  assert.throws(()=>awardLootDistribution(votes,'alice'),/Need or Greed/);
  assert.throws(()=>awardLootDistribution(votes,'stranger'),/Need or Greed/);
  const resolved=awardLootDistribution(votes,'bob');
  assert.equal(resolved.status,'awarded');
  assert.equal(resolved.winnerCharacterId,'bob');
  assert.equal(resolved.winnerChoice,'greed');
  assert.throws(()=>awardLootDistribution(resolved,'charlie'),/not open/);
});
test('Phase 9.2: public vote display shows only totals and the current character own-round action',()=>{
  const source={...item,distribution:{status:'open',roundId:'round2',tally:{need:1,greed:2,pass:1}}};
  const character={actionLog:[
    {type:'party-loot-vote',lootId:'sword',roundId:'round1',choice:'greed'},
    {type:'party-loot-vote',lootId:'sword',roundId:'round2',choice:'need'}
  ]};
  assert.deepEqual(publicLootVoteSummary(source,character),{
    status:'open',tally:{need:1,greed:2,pass:1},ownChoice:'need'
  });
  assert.equal(publicLootVoteSummary(source,{actionLog:[]}).ownChoice,'');
  assert.equal(publicLootVoteSummary({...source,distribution:{status:'cancelled'}},character),null);
  const projected=playerAvailableLoot({loot:[source],drafts:[{secretItem:{name:'Doombringer'}}]})[0];
  assert.equal(JSON.stringify(projected).includes('Doombringer'),false);
  assert.equal(JSON.stringify(projected).includes('choices'),false);
  assert.equal(projected.distribution.status,'open');
  assert.deepEqual(projected.distribution.tally,{need:1,greed:2,pass:1});
});
test('Phase 9.2: server actions are authoritative and maintain owner/GM permissions and journal types',()=>{
  const source=load('../functions/partyLootCommands.mjs');
  const handler=load('../functions/handler.mjs');
  const react=load('../src/dashboards/PartyLootWorkspace.jsx');
  const auth=load('../js/firebase-auth.js');
  const adapter=load('../src/firebase/asteriaFirebaseService.js');
  const css=load('../src/styles/asteria-react.css');
  assert.match(source,/votePartyLoot:async/);
  assert.match(source,/verifyOwnedLiveCharacter\(tx,campaignId,characterId/);
  assert.match(source,/requireCampaignGM\(tx,campaignId\)/);
  assert.match(source,/verifyLiveTradeCounterparty\(tx,campaignId,winnerCharacterId/);
  assert.match(source,/requireLiveSession\(tx,campaignId\)/);
  assert.match(source,/distribution\?\.status==='open'/);
  assert.match(source,/type==='award-distribution'/);
  assert.match(source,/writeLiveCharacter\(tx,refs,character\)/);
  assert.match(source,/claimedByCharacterId:winnerCharacterId/);
  assert.match(source,/appendActivity\(character,\{type:'party-loot-vote'/);
  assert.match(source,/appendActivity\(character,\{type:'party-loot-awarded'/);
  assert.match(handler,/campaignOnlyGMAction/);
  assert.match(react,/Start Need \/ Greed \/ Pass/);
  assert.match(react,/Confirm &amp; Award/);
  assert.match(react,/Review Award/);
  assert.match(react,/votePartyLoot\(campaignId,character.id/);
  assert.match(react,/aria-pressed=/);
  assert.match(auth,/votePartyLoot: \(\.\.\.args\) => callTrustedAction\('votePartyLoot',args\)/);
  assert.match(adapter,/votePartyLoot: \(campaignId,characterId,action\)/);
  assert.match(css,/\.react-party-loot-vote/);
  assert.equal(inventoryActivityCategory('party-loot-vote'),'loot');
  assert.equal(inventoryActivityCategory('party-loot-awarded'),'loot');
});
