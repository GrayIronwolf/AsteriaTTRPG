import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  createGMLayoutBackup,parseGMLayoutBackup,previewGMLayoutBackup,
  GM_LAYOUT_BACKUP_FORMAT,GM_LAYOUT_BACKUP_VERSION,GM_LAYOUT_BACKUP_MAX_BYTES
} from '../src/state/gmLayoutBackupModel.mjs';
import {gmPartyRoster} from '../src/state/gmPartyControlModel.mjs';
import {
  defaultDashboardLayout,toggleDashboardPanel,setDashboardViewportLayout,
  applyDashboardPreset,normalizeDashboardLayout
} from '../src/state/dashboardLayoutModel.mjs';
import {saveNamedGMFocus} from '../src/state/gmFocusModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Party roster is sourced from existing campaign membership and character records',()=>{
  const characters={
    'a':{id:'a',name:'Arwen',klass:'Ranger',level:8},
    'b':{id:'b',name:'Borin',class:'Paladin',level:12},
    'c':{id:'c',name:'Caldor',klass:'Wizard',level:4}
  };
  const campaign={party:['b','a','missing','b']};
  const before=JSON.stringify({campaign,characters});
  assert.deepEqual(gmPartyRoster({campaign,characters}).rows.map(x=>x.id),['b','a']);
  assert.deepEqual(gmPartyRoster({campaign,characters,query:'PALADIN'}).rows.map(x=>x.id),['b']);
  assert.deepEqual(gmPartyRoster({campaign,characters,query:'arwen'}).rows.map(x=>x.id),['a']);
  assert.deepEqual(gmPartyRoster({campaign,characters,query:'nobody'}).rows,[]);
  assert.equal(gmPartyRoster({campaign,characters}).count,2);
  assert.deepEqual(gmPartyRoster({characters}).rows.map(x=>x.id),['a','b','c']);
  assert.deepEqual(gmPartyRoster().rows,[]);
  assert.equal(JSON.stringify({campaign,characters}),before,'Read-only party roster must not mutate records');
});

test('Layout backup round-trips GM panel data, Focus library and device layouts',()=>{
  let layout=toggleDashboardPanel(defaultDashboardLayout('gm'),'gm','partySummary',true);
  layout=setDashboardViewportLayout(layout,'gm','tablet',
    applyDashboardPreset(layout,'gm','exploration'));
  layout=setDashboardViewportLayout(layout,'gm','mobile',
    applyDashboardPreset(layout,'gm','roleplaying'));
  layout=saveNamedGMFocus(layout,'Storm Siege','focus-storm').layout;
  const json=createGMLayoutBackup(layout,'2026-11-13T00:00:00.000Z');
  const envelope=JSON.parse(json);
  assert.equal(envelope.format,GM_LAYOUT_BACKUP_FORMAT);
  assert.equal(envelope.formatVersion,GM_LAYOUT_BACKUP_VERSION);
  assert.equal(envelope.role,'gm');
  assert.equal(envelope.layoutVersion,4);
  assert.ok(!json.includes('campaignId')&&!json.includes('accountUid'));
  const result=parseGMLayoutBackup(json);
  assert.equal(result.ok,true,result.error);
  assert.deepEqual(result.layout,normalizeDashboardLayout(layout,'gm'));
  assert.equal(result.preview.namedFocuses,1);
  assert.equal(result.preview.savedViewports,2);
  assert.ok(result.preview.visiblePanels>=4);
});

test('Layout importer rejects malformed formats, wrong roles, unsupported future versions and oversized input',()=>{
  const blank=createGMLayoutBackup(defaultDashboardLayout('gm'));
  const obj=JSON.parse(blank);
  assert.equal(parseGMLayoutBackup('{broken').ok,false);
  assert.equal(parseGMLayoutBackup(null).ok,false);
  assert.equal(parseGMLayoutBackup('x'.repeat(GM_LAYOUT_BACKUP_MAX_BYTES+1)).ok,false);
  assert.equal(parseGMLayoutBackup(JSON.stringify({...obj,role:'player'})).ok,false);
  assert.equal(parseGMLayoutBackup(JSON.stringify({...obj,format:'other'})).ok,false);
  assert.equal(parseGMLayoutBackup(JSON.stringify({...obj,formatVersion:2})).ok,false);
  assert.equal(parseGMLayoutBackup(JSON.stringify({...obj,layoutVersion:999})).ok,false);
  assert.equal(parseGMLayoutBackup(JSON.stringify({...obj,layout:{...obj.layout,version:999}})).ok,false);
  assert.equal(parseGMLayoutBackup(JSON.stringify({...obj,layout:{...obj.layout,order:['encounter','no-such-panel']}})).ok,false);
  assert.equal(parseGMLayoutBackup(JSON.stringify({...obj,layout:{...obj.layout,hidden:['unknown']}})).ok,false);
  assert.equal(parseGMLayoutBackup(JSON.stringify({...obj,layout:{...obj.layout,focusModes:Array(9).fill({id:'f',name:'one'})}})).ok,false);
  assert.equal(parseGMLayoutBackup(JSON.stringify({...obj,layout:null})).ok,false);
});

test('Backup is sanitized through canonical allowlisted dashboard normalization',()=>{
  const layout=defaultDashboardLayout('gm');
  const input=JSON.parse(createGMLayoutBackup(layout));
  input.layout.injected='do not persist';
  input.layout.viewportLayouts={
    mobile:{...layout,order:['restRequests','encounter'],injected:'bad'}
  };
  const restored=parseGMLayoutBackup(JSON.stringify(input));
  assert.equal(restored.ok,true);
  assert.equal(restored.layout.injected,undefined);
  assert.equal(restored.layout.viewportLayouts.mobile.injected,undefined);
  assert.deepEqual(Object.keys(restored.layout).includes('session'),false);
});

test('Phase 2.3 does not add independent gameplay writes, or move existing permissions',()=>{
  const gm=read('src/dashboards/GMDashboard.jsx');
  const party=read('src/dashboards/GMPartyControl.jsx');
  const backup=read('src/dashboards/GMLayoutBackup.jsx');
  const mount=read('src/app/mountDashboard.jsx');
  const focus=read('src/state/gmLayoutBackupModel.mjs');
  const css=read('src/styles/gm-phase2-3.css');
  assert.match(gm,/AsteriaCharacterAccess\.isGM\(/);
  assert.match(gm,/<GMPartyControl key=\{campaignId\+':'\+accountUid\+':party'\}/);
  assert.match(gm,/<GMLayoutBackup key=\{campaignId\+':'\+accountUid\+':backup'\}/);
  assert.match(gm,/onRestore=\{commitGMFocus\}/);
  assert.match(gm,/firebaseService\.saveUserDashboardLayout\(campaignId,'gm',next\)/);
  assert.match(party,/onSelect\(row\.id\)/);
  assert.match(party,/onNavigate\(\{tab\}\)/);
  assert.match(party,/onOpenCharacter\(row\.character\)/);
  assert.match(backup,/await onRestore\(candidate\.layout\)/);
  assert.match(backup,/Confirm Restore/);
  assert.match(backup,/URL\.createObjectURL/);
  assert.match(backup,/file\.size>GM_LAYOUT_BACKUP_MAX_BYTES/);
  assert.match(mount,/import '\.\.\/styles\/gm-phase2-3\.css'/);
  assert.match(css,/\.react-gm-dashboard \.react-gm-party-control/);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/:focus-visible/);
  assert.doesNotMatch(party+backup+focus,/httpsCallable|setDoc\(|updateDoc\(|writeBatch\(|runTransaction\(|firebaseService/);
  assert.doesNotMatch(css,/\.react-dashboard-custom-grid\s*\{/);
});

test('Existing GM Layout and Player Layout are unaffected by backup preview',()=>{
  const gm=defaultDashboardLayout('gm');
  const player=defaultDashboardLayout('player');
  const before=JSON.stringify(gm);
  const summary=previewGMLayoutBackup(gm);
  assert.equal(summary.visiblePanels,4);
  assert.equal(summary.namedFocuses,0);
  assert.equal(JSON.stringify(gm),before);
  assert.equal(player.focusModes,undefined);
});
