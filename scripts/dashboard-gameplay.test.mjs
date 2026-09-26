import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resourceDefinitions,applyResourceChanges} from '../src/state/resourceEngine.mjs';
import {ownedTalents,buildTalentCatalog} from '../src/state/talentModel.mjs';
import {talentRules} from '../src/state/talentMechanics.mjs';
import {talentGraph} from '../src/state/talentGraph.mjs';
const character={hp:[100,100],sp:[100,100],mp:[100,100],bp:[10,20],zp:[5,10]};
test('resource ownership is shared, class aware, and supports custom resources',()=>{
  for(const [classes,expected] of [[[],[]],[['Fighter'],[]],[['Blood Hunter'],['bp']],[['Paladin'],['zp']],[['Bloodhunter','Paladin'],['bp','zp']]]) {
    const c={...character,classes};assert.deepEqual(resourceDefinitions(c).map(r=>r.id),['hp','sp','mp',...expected]);
    if(!expected.includes('bp'))assert.throws(()=>applyResourceChanges(c,{costs:{bp:1}}),/Unknown resource/);
  }
  assert.equal(resourceDefinitions({...character,resources:{focus:[1,3]},resourceDefinitions:{focus:{name:'Focus'}}}).at(-1).id,'focus');
});
test('locked rows are excluded and highest purchased ranks stay deduplicated',()=>{
  for(const rank of [1,2,5]) {
    const c={classes:['Mage'],talents:[{name:'A',rank:1},{name:'A',rank}],unlockedTalents:[{name:'A',rank}],classTalents:[{name:'Locked',rank:5,unlocked:false}]};
    const owned=ownedTalents(c);assert.equal(owned.length,1);assert.equal(owned[0].rank,rank);
  }
  assert.deepEqual(ownedTalents({}),[]);
});
test('canonical authored costs support every resource and multiple costs without a component table',()=>{
  for(const key of ['hp','sp','mp','bp','zp','focus']) {
    const talent={id:'mage:example',type:'Active',metadata:{resourceCosts:{[key]:3}},ranks:{1:'### Effects\nAn authored effect.'}};
    assert.deepEqual(talentRules(talent,1).costs,{[key]:3});
  }
  const talent={id:'mage:example',type:'Active',metadata:{resourceCosts:{mp:1},rankMechanics:{2:{resourceCosts:{bp:2,sp:15}}}},ranks:{2:'### Effects\nAn authored effect.'}};
  assert.deepEqual(talentRules(talent,2).costs,{bp:2,sp:15});
});
test('one graph retains all classes, all five tiers, and prerequisite edges on mobile',()=>{
  const catalog=buildTalentCatalog({classes:['Mage','Warrior']},['Mage','Warrior'].flatMap(className=>[1,2,3,4,5].map(tier=>({type:'talent',title:`Talent ${tier}`,className,metadata:{tier,prerequisite:tier===2?'Talent 1 Rank I':'None'},body:'## Rank 1\n### Effects\nEffect'}))));
  for(const compact of [false,true]) {
    const g=talentGraph(catalog,compact);assert.equal(g.nodes.length,10);assert.equal(g.tiers.length,5);assert.equal(g.edges.length,2);if(compact)assert.equal(g.width,350);
  }
});
