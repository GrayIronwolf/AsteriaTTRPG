import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
const dir=resolve(process.env.RUNNER_TEMP||process.cwd(),'asteria-phase-10-1-baselines');
const read=name=>JSON.parse(readFileSync(join(dir,name),'utf8'));
test('Phase 10.3 records real role, viewport, accessibility and keyboard evidence',()=>{
 const r=read('phase-10-3-audit.json');
 assert.equal(r.schemaVersion,1);
 assert.equal(r.phase,'10.3');
 assert.equal(r.result,'passed');
 assert.equal(r.productionAccessed,false);
 assert.equal(r.deployed,false);
 assert.equal(r.cutoverApproved,false);
 assert.equal(r.legacyAuthenticated,'not-captured');
 assert.equal(r.checks.length,16);
 assert.equal(r.accessibility.length,6);
 assert.equal(r.keyboard.length,4);
 for(const role of ['guest','gm','player']){
  for(const size of ['desktop','mobile','small','tablet']){
   assert.ok(r.checks.some(x=>x.role===role&&x.size===size),
    role+'/'+size+' viewport missing');
  }
 }
 for(const m of r.checks){
  assert.ok(m.documentWidth<=m.viewport+1);
  assert.equal(m.missingNames,0);
  assert.equal(m.duplicateIds,0);
  assert.equal(m.brokenImages,0);
  assert.ok(m.domReadyMs==null||m.domReadyMs<=r.budgets.maxDomReadyMs);
 }
 for(const a of r.accessibility)assert.equal(a.serious,0);
 for(const name of ['phase10-3-mobile-menu-390.png','phase10-3-desktop-menu-1440.png']){
  assert.ok(r.screenshots.includes(name));
  assert.ok(existsSync(join(dir,name)),name+' evidence missing');
 }
 const baseline=read('phase-10-1-baselines.json');
 assert.equal(baseline.legacyAuthenticated,'not-captured');
 assert.equal(baseline.productionAccessed,false);
 assert.ok(r.outstanding.some(x=>/legacy GM and player/.test(x)));
 const content=JSON.stringify(r);
 assert.doesNotMatch(content,/ExamplePassword123!|firebaseapp\.com|@example\.test/);
});
test('Phase 10.3 CI is emulator-only, no deployment, and previous baseline gate remains intact',()=>{
 const workflow=readFileSync('.github/workflows/frontend-phase10-3-acceptance.yml','utf8');
 assert.match(workflow,/VITE_FIREBASE_MODE: emulator/);
 assert.match(workflow,/emulators:exec --project demo-asteria/);
 assert.doesNotMatch(workflow,/firebase deploy|hosting:channel:deploy/);
 assert.match(workflow,/if-no-files-found: error/);
 const baseline=readFileSync('scripts/site-cutover-phase10-1-browser.cjs','utf8');
 assert.match(baseline,/ASTERIA_PHASE_10_3_AUDIT/);
 assert.match(baseline,/phase-10-3-audit.json/);
});
