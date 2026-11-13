// Phase 12.3: read-only final release gates for the existing inventory suite.
// No cloud calls, data seeding, feature flags, migrations or deployments.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {readManifest,checkWebsite} from './asteria-release-source.mjs';

const path=name=>new URL('../'+name,import.meta.url);
const read=name=>readFileSync(path(name),'utf8');
const packageFile=()=>JSON.parse(read('package.json'));
const coveredPhases=[
  '1-1',...[3,4,5,6,7,8,9,10,11].flatMap(phase=>
    [1,2,3].map(step=>phase+'-'+step)),'12-2'
];

test('12.3: every completed inventory phase retains its unit regression gate',()=>{
  const scripts=packageFile().scripts;
  for(const phase of coveredPhases){
    const name='test:inventory-phase-'+phase;
    assert.ok(existsSync(path('scripts/inventory-phase-'+phase+'.test.mjs')),
      'Missing regression coverage for Phase '+phase);
    assert.equal(scripts[name],
      'node --test scripts/inventory-phase-'+phase+'.test.mjs',
      'Regression test command for Phase '+phase+' was removed or changed');
    assert.ok(scripts.test.includes('npm run '+name),
      'Full npm test no longer runs Phase '+phase);
  }
  assert.match(scripts.test,/npm run test:inventory-phase-12-3/);
});

test('12.3: real player and GM Firebase transactions remain in the emulator gate',()=>{
  const scripts=packageFile().scripts;
  assert.match(scripts['test:firebase'],/firebase emulators:exec --project demo-asteria/);
  assert.match(scripts['test:firebase'],/scripts\/firebase-integration\.test\.mjs/);
  assert.match(scripts['test:firebase'],/scripts\/inventory-phase-12-1-emulator\.test\.mjs/);
  const workflows=read('scripts/inventory-phase-12-1-emulator.test.mjs');
  for(const phrase of [
    'GM publishes stations/NPC services',
    'Need/Greed loot feeds a station-bound recipe',
    'changed service and item state',
    'depleted funds, restricted station',
    'merchant reputation and inventory purchases'
  ])assert.ok(workflows.includes(phrase),
    'Connected GM/player transaction scenario missing: '+phrase);
  for(const action of [
    'requestNPCRepair','reviewNPCRepair','reviewCraftingRequest',
    'requestEnhancement','reviewEnhancement','buyLiveShopItem',
    'createLiveItemRequest','respondLiveItemRequest'
  ])assert.ok(workflows.includes("'"+action+"'"),
    'Emulator must exercise the real callable '+action);
});

test('12.3: server still enforces membership, receipt idempotency and ownership',()=>{
  const handler=read('functions/handler.mjs');
  const actions=read('functions/commands.mjs');
  const permissions=read('functions/characterPermissions.mjs');
  assert.match(handler,/readCampaignMember\(/);
  assert.match(handler,/if\(!member\(/);
  assert.match(handler,/if\(receipt\.exists\)/);
  assert.match(handler,/if\(receipt\.data\(\)\.action!==action/);
  assert.match(handler,/transaction\.set\(receiptRef/);
  assert.match(handler,/GM_CHARACTER_ACTIONS\.has\(action\)/);
  assert.match(handler,/isLinkedCharacter\(/);
  assert.match(permissions,/membershipSchemaVersion|membership\?\.status/);
  for(const guard of [
    'requireLiveSession','verifyOwnedLiveCharacter',
    'verifyLiveTradeCounterparty','writeLiveCharacter','createCraftingCommands',
    'createEnhancementCommands','createCraftingServiceCommands',
    'createPartyLootCommands'
  ])assert.ok(actions.includes(guard),'Trusted server safeguard missing: '+guard);
});

test('12.3: sensitive trading and crafting collections cannot be edited by clients',()=>{
  const rules=read('firestore.rules');
  const restricted=[
    'shops','merchantRelationships','craftingRecipes','craftingRequests',
    'craftingStations','npcCraftingServices','npcRepairRequests',
    'enhancementPlans','enhancementRequests'
  ];
  for(const collection of restricted){
    const start=rules.indexOf('match /'+collection+'/{');
    assert.ok(start>=0,'Missing Firestore collection policy: '+collection);
    const block=rules.slice(start,rules.indexOf('\n      }',start)+8);
    assert.match(block,/allow create, update, delete: if false;/,
      'Client write protection missing: '+collection);
  }
  for(const collection of [
    'merchantRelationships','craftingRequests','npcRepairRequests','enhancementRequests'
  ]){
    const start=rules.indexOf('match /'+collection+'/{');
    const block=rules.slice(start,rules.indexOf('\n      }',start)+8);
    assert.match(block,/resource\.data\.ownerUid == request\.auth\.uid/,
      'Private request or reputation visibility is no longer owner-scoped: '+collection);
  }
});

test('12.3: player and GM screens expose the completed feature family',()=>{
  const player=read('src/dashboards/CharacterDashboard.jsx');
  const inventory=read('src/dashboards/InventoryWorkspace.jsx');
  const gm=read('src/dashboards/GMWorkspacePanels.jsx');
  const trade=read('src/dashboards/PlayerItemExchange.jsx');
  const merchant=read('src/dashboards/ShopWorkspace.jsx');
  const crafting=read('src/dashboards/CraftingServicesWorkspace.jsx');
  const css=read('src/styles/asteria-react.css');
  for(const name of [
    'PlayerCraftingRecipes','PlayerEnhancementWorkshop','PlayerCraftingServices',
    'InventoryWorkspace','PlayerItemRequestCenter'
  ])assert.ok(player.includes(name),'Missing player workspace: '+name);
  for(const name of ['GMCraftingRecipeManager','GMEnhancementWorkshop','GMCraftingServices'])
    assert.ok(gm.includes(name),'Missing GM workspace: '+name);
  for(const name of ['InventoryQuickActions','ShopWorkspace','PartyLootPlayerPanel'])
    assert.ok(inventory.includes(name),'Missing inventory workflow: '+name);
  assert.match(trade,/Review Both Sides/);
  assert.match(merchant,/Confirm Purchase|Confirm Buy/);
  assert.match(crafting,/Approve & Repair/);
  assert.match(css,/Phase 12\.2 — mobile inventory, merchant and crafting usability/);
  assert.match(css,/@media \(hover:none\), \(pointer:coarse\)/);
  assert.match(css,/min-height: 44px/);
});

test('12.3: production release remains explicitly approved and website parity checked',()=>{
  const manifest=readManifest();
  assert.equal(checkWebsite(read('index.html'),manifest).productionChanged,false);
  assert.equal(manifest.project,'asteria-ttrpg');
  assert.equal(manifest.mode,'manual-approval-required');
  const deploy=read('.github/workflows/firebase-deploy.yml');
  assert.match(deploy,/workflow_dispatch:/);
  assert.match(deploy,/github\.ref == 'refs\/heads\/main'/);
  assert.match(deploy,/firebase-production/);
  assert.match(deploy,/--project asteria-ttrpg --only functions,firestore,storage --non-interactive/);
  const firebase=JSON.parse(read('firebase.json'));
  assert.equal(firebase.functions[0].runtime,'nodejs22');
  assert.equal(firebase.firestore.rules,'firestore.rules');
  assert.equal(firebase.storage.rules,'storage.rules');
  const checks=read('.github/workflows/firebase-checks.yml');
  for(const command of [
    'npm run audit:production','npm run release:check','npm run lint',
    'npm test','npm run test:firebase','npm run build'
  ])assert.ok(checks.includes(command),'Missing CI release gate: '+command);
  assert.match(checks,/git diff --exit-code -- react-dist/);
  assert.match(packageFile().scripts.prebuild,/npm run release:check/);
  const runbook=read('docs/releases/inventory-phase-12-3.md');
  assert.match(runbook,/Production browser verification/);
  assert.match(runbook,/Rollback/);
  assert.match(runbook,/No automatic Firebase deployment/);
});
