import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  DASHBOARD_PANEL_REGISTRY,GM_FOCUS_LIMIT,defaultDashboardLayout,
  normalizeDashboardLayout,visibleDashboardPanels,applyDashboardPreset,
  toggleDashboardPanel,dashboardLayoutForViewport,setDashboardViewportLayout
} from '../src/state/dashboardLayoutModel.mjs';
import {
  GM_FOCUS_BUILTINS,gmFocusSnapshot,gmFocusStatus,saveNamedGMFocus,
  updateNamedGMFocus,deleteNamedGMFocus,activateNamedGMFocus,
  activateBuiltinGMFocus,leaveGMFocus
} from '../src/state/gmFocusModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const focusIds=['combat','exploration','roleplaying','encounter'];

test('Four built-in GM Focuses reuse existing GM-only presets and preserve the original dashboard',()=>{
  const before=defaultDashboardLayout('gm');
  assert.deepEqual(GM_FOCUS_BUILTINS.map(entry=>entry.id),focusIds);
  assert.deepEqual(visibleDashboardPanels(before,'gm'),['restRequests','encounter','xp','specialDamage']);
  for(const key of focusIds){
    const result=activateBuiltinGMFocus(before,key);
    assert.equal(result.ok,true,key);
    const active=result.layout;
    assert.deepEqual(active.focusHome,gmFocusSnapshot(before));
    assert.equal(active.preset,key);
    assert.ok(visibleDashboardPanels(active,'gm').length>=4);
    assert.ok(visibleDashboardPanels(dashboardLayoutForViewport(active,'gm','tablet'),'gm').length>=4);
    assert.ok(visibleDashboardPanels(dashboardLayoutForViewport(active,'gm','mobile'),'gm').length>=4);
    assert.deepEqual(leaveGMFocus(active).layout,before);
  }
  assert.equal(activateBuiltinGMFocus(before,'invented').ok,false);
});

test('Named Focus snapshots persist across normalisation and restore original GM layout',()=>{
  let layout=defaultDashboardLayout('gm');
  layout=toggleDashboardPanel(layout,'gm','partySummary',true);
  const home=gmFocusSnapshot(layout);
  const saved=saveNamedGMFocus(layout,'  Dragon   Council  ','focus-council');
  assert.equal(saved.ok,true);
  const normalized=normalizeDashboardLayout(JSON.parse(JSON.stringify(saved.layout)),'gm');
  assert.equal(normalized.focusModes.length,1);
  assert.equal(normalized.focusModes[0].name,'Dragon Council');
  assert.equal(normalized.activeFocusId,'focus-council');
  assert.equal(gmFocusStatus(normalized).changed,false);
  const switched=activateBuiltinGMFocus(normalized,'combat').layout;
  assert.equal(switched.focusModes.length,1);
  assert.equal(switched.focusHome.preset,home.preset);
  assert.notDeepEqual(visibleDashboardPanels(switched,'gm'),visibleDashboardPanels(home,'gm'));
  const reopened=activateNamedGMFocus(switched,'focus-council').layout;
  assert.deepEqual(gmFocusSnapshot(reopened),normalized.focusModes[0].layout);
  assert.equal(reopened.activeFocusId,'focus-council');
  const restored=leaveGMFocus(reopened).layout;
  assert.deepEqual(gmFocusSnapshot(restored),layout);
  assert.equal(restored.focusModes.length,1,'Returning to normal preserves the saved Focus library');
});

test('Focus mode switching keeps desktop, tablet and mobile choices instead of overwriting one viewport',()=>{
  const base=defaultDashboardLayout('gm');
  let layout=setDashboardViewportLayout(base,'gm','tablet',
    applyDashboardPreset(base,'gm','exploration'));
  layout=setDashboardViewportLayout(layout,'gm','mobile',
    applyDashboardPreset(base,'gm','roleplaying'));
  const original=gmFocusSnapshot(layout);
  const saved=saveNamedGMFocus(layout,'All devices','focus-devices').layout;
  const combat=activateBuiltinGMFocus(saved,'combat').layout;
  for(const viewport of ['desktop','tablet','mobile']){
    assert.equal(dashboardLayoutForViewport(combat,'gm',viewport).preset,'combat');
    assert.ok(visibleDashboardPanels(dashboardLayoutForViewport(combat,'gm',viewport),'gm').includes('encounter'));
  }
  const back=leaveGMFocus(combat).layout;
  assert.deepEqual(gmFocusSnapshot(back),original);
  assert.equal(dashboardLayoutForViewport(back,'gm','tablet').preset,'exploration');
  assert.equal(dashboardLayoutForViewport(back,'gm','mobile').preset,'roleplaying');
  const preset=activateNamedGMFocus(combat,'focus-devices').layout;
  assert.deepEqual(gmFocusSnapshot(preset),original);
});

test('Modifying a named Focus does not overwrite its saved snapshot until explicitly updated',()=>{
  const saved=saveNamedGMFocus(defaultDashboardLayout('gm'),'Town Council','focus-town').layout;
  const before=JSON.stringify(saved.focusModes[0].layout);
  const edited=toggleDashboardPanel(saved,'gm','partySummary',true);
  assert.equal(gmFocusStatus(edited).changed,true);
  assert.equal(JSON.stringify(edited.focusModes[0].layout),before);
  const applied=updateNamedGMFocus(edited,'focus-town').layout;
  assert.equal(gmFocusStatus(applied).changed,false);
  assert.notEqual(JSON.stringify(applied.focusModes[0].layout),before);
  assert.equal(updateNamedGMFocus(saved,'missing').ok,false);
  assert.equal(deleteNamedGMFocus(saved,'missing').ok,false);
  const removed=deleteNamedGMFocus(applied,'focus-town').layout;
  assert.equal(removed.focusModes,undefined);
  assert.equal(removed.activeFocusId,undefined);
  assert.ok(removed.focusHome);
  assert.equal(activateNamedGMFocus(removed,'focus-town').ok,false);
});

test('Saved Focus names, IDs, counts and nested content are bounded to the GM layout registry',()=>{
  let layout=defaultDashboardLayout('gm');
  assert.equal(saveNamedGMFocus(layout,'','focus-empty').ok,false);
  assert.equal(saveNamedGMFocus(layout,'abc','../invalid').ok,false);
  assert.equal(saveNamedGMFocus(layout,'X'.repeat(49),'focus-overlong').ok,false);
  for(let i=0;i<GM_FOCUS_LIMIT;i++){
    const result=saveNamedGMFocus(layout,'Named '+i,'focus-'+i);
    assert.equal(result.ok,true);
    layout=result.layout;
  }
  assert.equal(saveNamedGMFocus(layout,'Extra','focus-extra').ok,false);
  assert.equal(saveNamedGMFocus(layout,'NAMED 0','focus-duplicate').ok,false);
  assert.equal(new Set(layout.focusModes.map(mode=>mode.id)).size,GM_FOCUS_LIMIT);
  const malformed=normalizeDashboardLayout({
    ...layout,focusModes:[
      {id:'custom-1',name:'Intrusion',layout:{mode:'custom',order:['__proto__','fake','encounter'],hidden:[],focusModes:[{id:'deep',name:'bad'}]}},
      {id:'custom-1',name:'Duplicate',layout:{}},
      {id:'fake-with-html',name:'Bad',layout:{order:['__proto__']}}
    ],
    activeFocusId:'not-registered'
  },'gm');
  assert.equal(malformed.focusModes.length,2);
  assert.equal(malformed.focusModes[0].layout.order.includes('__proto__'),false);
  assert.equal(malformed.focusModes[0].layout.order.includes('fake'),false);
  assert.equal(malformed.focusModes[0].layout.focusModes,undefined);
  assert.equal(malformed.activeFocusId,undefined);
  assert.ok(DASHBOARD_PANEL_REGISTRY.gm.every(x=>typeof x.id==='string'));
});

test('Focus metadata stays private to GM layouts; existing Player presets are unchanged',()=>{
  const original=defaultDashboardLayout('player');
  const injected=normalizeDashboardLayout({...original,
    focusModes:[{id:'focus-X',name:'Unsafe',layout:defaultDashboardLayout('gm')}],
    focusHome:defaultDashboardLayout('gm'),activeFocusId:'focus-X'
  },'player');
  assert.equal(injected.focusModes,undefined);
  assert.equal(injected.focusHome,undefined);
  assert.equal(injected.activeFocusId,undefined);
  assert.deepEqual(applyDashboardPreset(null,'player','combat').order.slice(0,2),['armour','weapons']);
  assert.deepEqual(leaveGMFocus(defaultDashboardLayout('gm')).layout,defaultDashboardLayout('gm'));
});

test('GM layout editor saves viewport changes without losing Focus library or restore point',()=>{
  const stored=saveNamedGMFocus(defaultDashboardLayout('gm'),'Winter campaign','focus-winter').layout;
  const edited=setDashboardViewportLayout(stored,'gm','tablet',
    applyDashboardPreset(defaultDashboardLayout('gm'),'gm','combat'));
  assert.equal(edited.focusModes.length,1);
  assert.ok(edited.focusHome);
  assert.equal(edited.activeFocusId,'focus-winter');
  assert.equal(normalizeDashboardLayout(edited,'gm').focusModes.length,1);
});

test('Phase 2.2 is wired only into authorized GM Main and existing private layout saves',()=>{
  const gm=read('src/dashboards/GMDashboard.jsx');
  const focus=read('src/dashboards/GMFocusModes.jsx');
  const service=read('js/firebase-auth.js');
  const mount=read('src/app/mountDashboard.jsx');
  assert.match(gm,/AsteriaCharacterAccess\.isGM\(/);
  assert.match(gm,/<GMFocusModes key=\{campaignId\+':'\+accountUid\}/);
  assert.match(gm,/focusSavePending\.current/);
  assert.match(gm,/onCommit=\{commitGMFocus\}/);
  assert.match(gm,/firebaseService\.saveUserDashboardLayout\(campaignId,'gm',next\)/);
  assert.match(service,/users',ownerUid,'dashboardLayouts',role\+'-'\+campaignId/);
  assert.match(focus,/aria-label="GM Focus modes"/);
  assert.match(focus,/aria-pressed=/);
  assert.match(focus,/role="status"/);
  assert.match(mount,/import '\.\.\/styles\/gm-focus\.css'/);
  assert.doesNotMatch(focus,/firebaseService|setDoc|updateDoc|httpsCallable|localStorage/);
  const css=read('src/styles/gm-focus.css');
  assert.match(css,/\.react-gm-dashboard \.react-gm-focus/);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/:focus-visible/);
  assert.doesNotMatch(css,/\.react-dashboard-custom-grid\s*\{|\.react-workspace-sidebar\s*\{/);
});
