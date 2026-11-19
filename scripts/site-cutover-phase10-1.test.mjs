import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';

const dir=resolve(process.env.RUNNER_TEMP||process.cwd(),'asteria-phase-10-1-baselines');
const source='scripts/site-cutover-phase10-1-browser.cjs';
const read=path=>readFileSync(path,'utf8');

test('baseline runner uses both local entries, real emulator identities and explicit no-cutover boundaries',()=>{
 const code=read(source);
 assert.match(code,/127\.0\.0\.1:4174/);
 assert.match(code,/127\.0\.0\.1:8123/);
 assert.match(code,/getByTestId\('site-gm-dashboard'\)/);
 assert.match(code,/getByTestId\('site-player-dashboard'\)/);
 assert.match(code,/site-gm-error/);
 assert.match(code,/site-player-error/);
 assert.doesNotMatch(code,/firebaseapp\.com|asteriat[rp]pg\.web\.app|https:\/\/asteria/);
 const workflow=read('.github/workflows/frontend-phase10-1-acceptance.yml');
 assert.match(workflow,/VITE_FIREBASE_MODE: emulator/);
 assert.match(workflow,/emulators:exec --project demo-asteria/);
 assert.match(workflow,/if-no-files-found: error/);
 assert.match(read('index.html'),/src="js\/app\.js\?/);
 assert.match(read('frontend\/index.html'),/src="\/src\/main\.jsx"/);
});

test('successful capture contains redacted, role-scoped screenshots and an honest comparison report',()=>{
 assert.ok(existsSync(join(dir,'phase-10-1-baselines.json')),'Phase 10.1 evidence missing');
 const report=JSON.parse(read(join(dir,'phase-10-1-baselines.json')));
 assert.equal(report.phase,'10.1');
 assert.equal(report.schemaVersion,1);
 assert.equal(report.productionAccessed,false);
 assert.equal(report.deployed,false);
 assert.equal(report.cutoverApproved,false);
 assert.equal(report.legacyAuthenticated,'not-captured');
 assert.equal(report.comparisons.guestHome.status,'compared-offline');
 for(const role of ['gm','player']){
  assert.equal(report.comparisons[role].legacyAuthenticated,'not-captured');
  assert.equal(report.comparisons[role].reactEmulator,'captured');
  assert.equal(report.comparisons[role].signoff,false);
 }
 for(const file of [
  'legacy-guest-home-desktop.png','legacy-guest-home-mobile.png',
  'react-guest-home-desktop.png','react-guest-home-mobile.png',
  'react-gm-signed-in-home-desktop.png','react-gm-campaign-forge-desktop.png',
  'react-gm-dashboard-desktop.png','react-gm-dashboard-mobile.png',
  'react-player-signed-in-home-desktop.png',
  'react-player-character-forge-desktop.png',
  'react-player-dashboard-desktop.png','react-player-dashboard-mobile.png'
 ]) {
  assert.ok(report.screenshots.includes(file),file+' missing from evidence index');
  assert.ok(existsSync(join(dir,file)),file+' screenshot not captured');
 }
 assert.equal(report.screenshots.length,12);
 assert.ok(report.outstanding.some(x=>/Authenticated legacy/.test(x)));
 assert.ok(!JSON.stringify(report).includes('ExamplePassword123!'),'Passwords must not appear in evidence');
});
