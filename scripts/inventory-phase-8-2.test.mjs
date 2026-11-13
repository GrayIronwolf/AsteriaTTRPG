import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gmTradeLootOverview} from '../src/state/gmTradeLootHubModel.mjs';

const fixture={
  itemEcosystem:{shops:[
    {id:'open-shop',status:'open',gmNotes:'Merchant secret'},
    {id:'closed-shop',status:'closed',name:'Hidden vendor'},
    {id:'open-shop-2',status:'open'}
  ]},
  partyLoot:{
    drafts:[
      {id:'draft-one',visibility:'hidden',status:'available',item:{name:'Secret Sword'}},
      {id:'cancelled',visibility:'hidden',status:'cancelled'},
      {id:'revealed-draft',visibility:'revealed',status:'available'}
    ],
    loot:[
      {id:'item',visibility:'revealed',status:'available',kind:'item'},
      {id:'copper',visibility:'revealed',status:'available',kind:'currency'},
      {id:'claimed',visibility:'revealed',status:'claimed',kind:'item'},
      {id:'unrevealed',visibility:'hidden',status:'available',gmNotes:'Hidden GM clue'}
    ],
    stashes:[
      {id:'open',status:'open',name:'Party chest'},
      {id:'locked',status:'locked'},
      {id:'deleted',status:'deleted',name:'Old secret vault'}
    ]
  }
};

test('Phase 8.2 GM overview counts current campaign records, not historic or hidden public drops',()=>{
  const result=gmTradeLootOverview(fixture);
  assert.equal(result.hiddenDrafts,1);
  assert.equal(result.revealedDrops,2);
  assert.equal(result.awaitingCopper,1);
  assert.equal(result.openStashes,1);
  assert.equal(result.openShops,2);
  assert.deepEqual(result.links.map(link=>link.id),
    ['gm-treasure','gm-shops','gm-tables','gm-audit']);
  assert.deepEqual(result.links.map(link=>link.tab),
    ['inventory','economy','economy','inventory']);
});

test('Phase 8.2 never copies item identities, secret notes or other private payloads into its shortcut labels',()=>{
  const output=JSON.stringify(gmTradeLootOverview(fixture));
  for(const secret of ['Secret Sword','Merchant secret','Hidden vendor','Hidden GM clue','Old secret vault'])
    assert.equal(output.includes(secret),false);
});

test('Phase 8.2 handles missing data and empty campaigns without inventing pending work',()=>{
  const result=gmTradeLootOverview();
  assert.equal(result.hiddenDrafts,0);
  assert.equal(result.revealedDrops,0);
  assert.equal(result.awaitingCopper,0);
  assert.equal(result.openStashes,0);
  assert.equal(result.openShops,0);
  assert.equal(result.links.length,4);
  assert.equal(gmTradeLootOverview({partyLoot:{drafts:{not:'array'}},itemEcosystem:{shops:null}}).hiddenDrafts,0);
});

test('Phase 8.2 GM shortcuts navigate only to existing, focusable GM sections',()=>{
  const dashboard=readFileSync(new URL('../src/dashboards/GMDashboard.jsx',import.meta.url),'utf8');
  const economy=readFileSync(new URL('../src/dashboards/GMWorkspacePanels.jsx',import.meta.url),'utf8');
  const model=readFileSync(new URL('../src/state/gmTradeLootHubModel.mjs',import.meta.url),'utf8');
  const styles=readFileSync(new URL('../src/styles/asteria-react.css',import.meta.url),'utf8');
  const targets=gmTradeLootOverview().links;
  assert.match(dashboard,/AsteriaCharacterAccess\.isGM/);
  assert.match(dashboard,/GMTradeLootHub/);
  assert.match(dashboard,/gmHubDestination/);
  assert.match(dashboard,/setTab\(link\.tab\)/);
  assert.match(dashboard,/scrollIntoView/);
  assert.match(dashboard,/focus\(\{preventScroll:true\}\)/);
  assert.match(dashboard,/id="react-gm-party-loot" tabIndex=\{-1\}/);
  assert.match(dashboard,/id="react-gm-inventory-audit" tabIndex=\{-1\}/);
  assert.match(economy,/id="react-gm-shops" tabIndex=\{-1\}/);
  assert.match(economy,/id="react-gm-loot-tables" tabIndex=\{-1\}/);
  for(const link of targets){
    assert.ok(['economy','inventory'].includes(link.tab));
    assert.ok((dashboard+economy).includes('id="'+link.targetId+'"'));
  }
  assert.match(styles,/\.react-gm-trade-hub/);
  assert.doesNotMatch(model,/runTransaction|setDoc|updateDoc|firebaseService|managePartyLoot|manageShop/);
});
