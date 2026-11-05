import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DASHBOARD_PANEL_REGISTRY, DASHBOARD_SIZE_COLUMNS, DASHBOARD_LAYOUT_PRESETS,
  applyDashboardPreset, dashboardPanelIds, dashboardSizeForColumns, defaultDashboardLayout,
  layoutFromPlayerPreferences, moveDashboardPanel, normalizeDashboardLayout,
  nudgeDashboardPanel, resizeDashboardPanel, toggleDashboardPanel, visibleDashboardPanels
} from '../src/state/dashboardLayoutModel.mjs';
import {normalizeDashboardPreferences} from '../src/state/liveWorkspaceModel.mjs';

test('Player and GM defaults preserve their current main dashboard panels',()=>{
  const player=visibleDashboardPanels(defaultDashboardLayout('player'),'player');
  const gm=visibleDashboardPanels(defaultDashboardLayout('gm'),'gm');
  assert.deepEqual(player.slice(0,5),['armour','weapons','quick','talents','spells']);
  assert.deepEqual(player.slice(-3),['quests','journal','party']);
  assert.deepEqual(gm,['restRequests','encounter','xp','specialDamage']);
  assert.equal(player.includes('shortcutInventory'),false);
  assert.equal(gm.includes('shortcutNotes'),false);
  assert.equal(dashboardPanelIds('player').includes('resources'),false);
  assert.equal(dashboardPanelIds('gm').includes('partySidebar'),false);
});

test('Legacy five-category hidden preference survives migration without changing default mode',()=>{
  const settings=normalizeDashboardPreferences({dashboardPreferences:{panelOrder:['spells','weapons'],hiddenPanels:['weapons']}});
  assert.equal(settings.dashboardLayout.mode,'default');
  const hidden=new Set(settings.dashboardLayout.hidden);
  for(const id of ['armour','weapons','quick'])assert.equal(hidden.has(id),true);
  assert.deepEqual(settings.panelOrder.slice(0,2),['spells','weapons']);
});

test('Panel library can add, hide and restore optional shortcuts without removing any underlying data',()=>{
  let layout=defaultDashboardLayout('player');
  layout=toggleDashboardPanel(layout,'player','shortcutQuest',true);
  assert.equal(layout.mode,'custom');
  assert.equal(visibleDashboardPanels(layout,'player').includes('shortcutQuest'),true);
  layout=toggleDashboardPanel(layout,'player','shortcutQuest',false);
  assert.equal(visibleDashboardPanels(layout,'player').includes('shortcutQuest'),false);
  assert.equal(layout.order.includes('shortcutQuest'),true);
  assert.equal(toggleDashboardPanel(layout,'player','fake',true).order.includes('fake'),false);
});

test('Presets are role-specific, optionally add shortcuts, and Restore Default truly resets',()=>{
  const exploration=applyDashboardPreset(null,'player','exploration');
  assert.equal(exploration.preset,'exploration');
  assert.equal(visibleDashboardPanels(exploration,'player').includes('shortcutInventory'),true);
  assert.equal(visibleDashboardPanels(exploration,'player').includes('encounter'),false);
  const encounter=applyDashboardPreset(null,'gm','encounter');
  assert.equal(visibleDashboardPanels(encounter,'gm').includes('loot'),true);
  assert.deepEqual(applyDashboardPreset(encounter,'gm','default'),defaultDashboardLayout('gm'));
  assert.equal(Object.hasOwn(DASHBOARD_LAYOUT_PRESETS.player,'encounter'),false);
});

test('Drag reorder and accessible nudge operate only on allowlisted IDs',()=>{
  let layout=applyDashboardPreset(null,'player','combat');
  layout=moveDashboardPanel(layout,'player','spells','armour');
  assert.equal(visibleDashboardPanels(layout,'player')[0],'spells');
  layout=nudgeDashboardPanel(layout,'player','spells',1);
  assert.equal(visibleDashboardPanels(layout,'player')[1],'spells');
  const before=JSON.stringify(layout);
  assert.equal(JSON.stringify(moveDashboardPanel(layout,'player','resources','armour')),before);
});

test('Size presets snap to allowed columns and reject arbitrary dimensions',()=>{
  const layout=resizeDashboardPanel(null,'gm','encounter','full');
  assert.equal(layout.sizes.encounter,'full');
  assert.equal(DASHBOARD_SIZE_COLUMNS[layout.sizes.encounter],12);
  assert.equal(resizeDashboardPanel(layout,'gm','encounter','999px').sizes.encounter,'full');
  assert.equal(dashboardSizeForColumns(3),'compact');
  assert.equal(dashboardSizeForColumns(6),'standard');
  assert.equal(dashboardSizeForColumns(9),'wide');
  assert.equal(dashboardSizeForColumns(12),'full');
});

test('Invalid or old saved layout records cannot inject unauthorized panels or layout values',()=>{
  const layout=normalizeDashboardLayout({
    order:['__proto__','encounter','partySummary','encounter','resources','shortcutNotes'],
    hidden:['resources','partySummary','partySummary'],
    sizes:{encounter:'fullscreen',partySummary:'wide'},
    mode:'custom'
  },'gm');
  assert.equal(layout.order.includes('resources'),false);
  assert.equal(layout.order.includes('__proto__'),false);
  assert.equal(layout.order.filter(id=>id==='encounter').length,1);
  assert.equal(layout.sizes.encounter,'wide');
  assert.equal(layout.sizes.partySummary,'wide');
  assert.equal(layout.hidden.includes('partySummary'),true);
  assert.equal(normalizeDashboardLayout(null,'gm').mode,'default');
  assert.equal(DASHBOARD_PANEL_REGISTRY.gm.every(item=>typeof item.id==='string'),true);
});

test('Already saved Player layout wins over legacy display flags',()=>{
  const saved=layoutFromPlayerPreferences({dashboardLayout:resizeDashboardPanel(null,'player','armour','full'),hiddenPanels:['weapons']});
  assert.equal(saved.sizes.armour,'full');
  assert.equal(saved.hidden.includes('armour'),false);
});
