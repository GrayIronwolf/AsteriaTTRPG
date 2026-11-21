import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  STUDIO_PANEL_IDS,defaultStudioLayout,normalizeStudioLayout,editStudioLayout,
  lockStudioPanel,toggleStudioPanel,setStudioSnap,studioStorageKey
} from '../src/state/presentationStudioModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Improvement 2: fixed allowlist and bounded distinct default studio panels',()=>{
  const state=defaultStudioLayout();
  assert.deepEqual(STUDIO_PANEL_IDS,['scene','preview','output','media','viewers']);
  assert.equal(state.positions.scene.w,570);
  assert.deepEqual(normalizeStudioLayout(state),state);
  assert.deepEqual(normalizeStudioLayout(null),state);
  assert.deepEqual(normalizeStudioLayout({version:900}),state);
});
test('Improvement 2: moves, resize, snap, lock and collision controls',()=>{
  const original=defaultStudioLayout();
  const changed=editStudioLayout(original,'scene','move',{x:20,y:0});
  assert.equal(changed.positions.scene.x,20);
  assert.equal(editStudioLayout(changed,'scene','move',{x:600,y:0}).positions.scene.x,20);
  assert.equal(editStudioLayout(changed,'unknown','move',{x:0,y:0}).positions.scene.x,20);
  const locked=lockStudioPanel(changed,'scene',true);
  assert.equal(editStudioLayout(locked,'scene','resize',{w:800,h:800}).positions.scene.w,570);
  assert.equal(setStudioSnap(locked,false).snap,false);
});
test('Improvement 2: safe visibility, valid storage scope, malicious layout repair',()=>{
  const state=defaultStudioLayout();
  assert.deepEqual(toggleStudioPanel(state,'scene',false),state);
  assert.deepEqual(toggleStudioPanel(state,'media',false).hidden,['media']);
  assert.notEqual(studioStorageKey('gm-1','campaign-a'),studioStorageKey('gm-2','campaign-a'));
  assert.notEqual(studioStorageKey('gm-1','campaign-a'),studioStorageKey('gm-1','campaign-b'));
  const corrupted={version:1,positions:{...state.positions,
    scene:{x:0,y:0,w:1000,h:900},unknown:{x:0,y:0,w:1000,h:1000}},
    hidden:['scene','media','unknown'],locked:['scene','unknown']};
  assert.deepEqual(normalizeStudioLayout(corrupted),state);
});
test('Improvement 2: controller preserves emergency stop and approved publish path',()=>{
  const src=read('frontend/src/dashboard/CampaignPresentationWorkspace.jsx');
  const studio=read('frontend/src/dashboard/GMPresentationStudio.jsx');
  const page=read('frontend/src/pages/GMDashboardPage.jsx');
  assert.match(src,/<GMScreenCaptureControls api=\{api\} campaignId=\{campaignId\}\/>/);
  assert.match(src,/<GMPresentationStudio uid=\{uid\}/);
  assert.match(src,/data-testid="site-presentation-publish"/);
  assert.match(src,/api\.managePresentation\(campaignId,action\)/);
  assert.match(src,/api\.rebuildPresentationProjections\(campaignId\)/);
  assert.match(src,/data-testid="site-gm-studio-preview"/);
  assert.match(src,/connected or watching/);
  assert.match(studio,/window\.localStorage\.setItem\(studioStorageKey\(uid,campaignId\)/);
  assert.match(studio,/panels\[id\]/);
  assert.match(page,/uid=\{uid\} party=\{snapshot\.party\}/);
});
