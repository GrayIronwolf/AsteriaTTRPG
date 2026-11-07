import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  DASHBOARD_GRID_COLUMNS, dashboardPointerProposal, dashboardGridRule,
  gridRectanglesOverlap
} from '../src/state/dashboardGridModel.mjs';
import {
  defaultDashboardLayout,normalizeDashboardLayout,moveDashboardGridPanel,
  resizeDashboardGridPanel,lockDashboardGridPanel,toggleDashboardPanel,
  autoArrangeDashboardLayout,visibleDashboardPanels
} from '../src/state/dashboardLayoutModel.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const editor=read('src/components/DashboardCustomisation.jsx');
const playerSettings=read('src/dashboards/CharacterGallerySettings.jsx');

test('A click without movement leaves existing layout identity and default mode intact',()=>{
  const layout=defaultDashboardLayout('player');
  const p=layout.placements.weapons;
  assert.equal(dashboardPointerProposal('player','weapons',p,'move',0,0).x,p.x);
  assert.equal(moveDashboardGridPanel(layout,'player','weapons',p.x,p.y).mode,'default');
  assert.equal(resizeDashboardGridPanel(layout,'player','weapons',p.w,p.h).mode,'default');
  assert.equal(lockDashboardGridPanel(layout,'player','weapons',false).mode,'default');
  assert.equal(toggleDashboardPanel(layout,'player','weapons',true).mode,'default');
});

test('Touch/mouse move uses pointer release displacement and clamps into twelve columns',()=>{
  const p=defaultDashboardLayout('player').placements.weapons;
  assert.deepEqual(dashboardPointerProposal('player','weapons',p,'move',3,7),{
    ...p,x:Math.min(DASHBOARD_GRID_COLUMNS-p.w,p.x+3),y:p.y+7
  });
  assert.equal(dashboardPointerProposal('player','weapons',p,'move',999,0).x,12-p.w);
  assert.equal(dashboardPointerProposal('player','weapons',p,'move',-999,-999).y,0);
  assert.equal(dashboardPointerProposal('player','unknown',p,'move',1,1),null);
  assert.equal(dashboardPointerProposal('player','weapons',p,'delete',1,1),null);
});

test('Resize respects role limits, compact shortcut sizes, and portrait armour',()=>{
  const l=defaultDashboardLayout('player'),p=l.placements.weapons;
  const max=dashboardPointerProposal('player','weapons',p,'resize',100,100);
  assert.equal(max.w,dashboardGridRule('player','weapons').maxW);
  assert.equal(max.h,dashboardGridRule('player','weapons').maxH);
  const min=dashboardPointerProposal('player','weapons',p,'resize',-100,-100);
  assert.equal(min.w,dashboardGridRule('player','weapons').minW);
  assert.equal(min.h,dashboardGridRule('player','weapons').minH);
  const armour=l.placements.armour;
  const portrait=dashboardPointerProposal('player','armour',armour,'resize',-1,2);
  assert.deepEqual({w:portrait.w,h:portrait.h},{w:3,h:6});
  const shortcut=l.placements.shortcutInventory;
  assert.deepEqual(
    (({w,h})=>({w,h}))(dashboardPointerProposal('player','shortcutInventory',shortcut,'resize',5,5)),
    {w:4,h:4}
  );
});

test('Dragging cannot override lock, colliding positions, or removed panel visibility',()=>{
  let l=defaultDashboardLayout('player');
  const originals={...l.placements},p=l.placements.weapons;
  l=lockDashboardGridPanel(l,'player','weapons',true);
  assert.deepEqual(moveDashboardGridPanel(l,'player','weapons',0,27).placements.weapons,p);
  assert.deepEqual(resizeDashboardGridPanel(l,'player','weapons',5,4).placements.weapons,p);
  l=lockDashboardGridPanel(l,'player','weapons',false);
  assert.deepEqual(moveDashboardGridPanel(l,'player','weapons',originals.armour.x,originals.armour.y).placements.weapons,p);
  l=toggleDashboardPanel(l,'player','weapons',false);
  assert.equal(visibleDashboardPanels(l,'player').includes('weapons'),false);
  l=toggleDashboardPanel(l,'player','weapons',true);
  assert.equal(visibleDashboardPanels(l,'player').includes('weapons'),true);
  const arranged=autoArrangeDashboardLayout(l,'player');
  for(const id of visibleDashboardPanels(arranged,'player'))
    for(const other of visibleDashboardPanels(arranged,'player'))
      if(id!==other)assert.equal(gridRectanglesOverlap(arranged.placements[id],arranged.placements[other]),false);
  assert.deepEqual(normalizeDashboardLayout(arranged,'player').placements,arranged.placements);
});
test('Grid editor uses final pointer event, preserves keyboard and numeric input, and handles removal',()=>{
  assert.match(editor,/const propose=\(g,e\)=>dashboardPointerProposal/);
  assert.match(editor,/const next=propose\(g,e\)/);
  assert.doesNotMatch(editor,/const next=preview\?\.id===g\.id\?preview\.rect:g\.rect/);
  assert.match(editor,/next\.x!==g\.rect\.x\|\|next\.y!==g\.rect\.y/);
  assert.match(editor,/const activeSelected=ids\.includes\(selected\)\?selected:/);
  assert.match(editor,/onPointerCancel=/);
  assert.match(editor,/onKeyDown=\{e=>\{/);
  assert.match(editor,/e\.altKey/);
  assert.match(editor,/dashboardPanelSizeChoices\(role,id\)/);
  assert.match(editor,/lockDashboardGridPanel\(old,role,id,!lock\)/);
  assert.match(editor,/react-grid-editor-library-item/);
  assert.match(editor,/Apply Changes/);
  assert.match(editor,/onApply\(combined\)/);
});
test('Live resource updates cannot overwrite an in-progress Player settings draft',()=>{
  assert.match(playerSettings,/const savedPreferencesKey=JSON\.stringify\(character\.dashboardPreferences\|\|\{\}\)/);
  assert.match(playerSettings,/\[savedPreferencesKey\]/);
  assert.doesNotMatch(playerSettings,/normalizeDashboardPreferences\(character\),\[character\]/);
  assert.match(playerSettings,/updateDashboardPreferences\(campaignId,character\.id,preferences\)/);
  assert.match(editor,/setDashboardViewportLayout\(layout,role,viewport,draft\)/);
});
