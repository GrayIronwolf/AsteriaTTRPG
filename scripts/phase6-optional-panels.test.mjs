import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 DASHBOARD_PANEL_REGISTRY,defaultDashboardLayout,normalizeDashboardLayout,
 visibleDashboardPanels,toggleDashboardPanel,moveDashboardGridPanel,
 resizeDashboardGridPanel,lockDashboardGridPanel
} from '../src/state/dashboardLayoutModel.mjs';
import {dashboardGridRule,gridRectanglesOverlap} from '../src/state/dashboardGridModel.mjs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const optional=['combatOverview','explorationOverview','questTracker','inventoryOverview'];
for(const role of ['player','gm']){
 test(role+' focus panels are optional without modifying any existing or older layouts',()=>{
  const original=defaultDashboardLayout(role);
  const visible=visibleDashboardPanels(original,role);
  const before=role==='gm'?['restRequests','encounter','xp','specialDamage']:
   ['armour','weapons','quick','talents','spells','skills','conditions','effects','specialDamage','rest','currency','quests','journal','party'];
  assert.deepEqual(visible,before,'Existing dashboard remains unchanged');
  assert.ok(optional.every(id=>!visible.includes(id)));
  assert.equal(DASHBOARD_PANEL_REGISTRY[role].filter(item=>optional.includes(item.id)).length,4);
  for(const id of optional){
   assert.ok(dashboardGridRule(role,id));
   assert.ok(original.hidden.includes(id));
   assert.equal(DASHBOARD_PANEL_REGISTRY[role].find(item=>item.id===id)?.category,'Focus Panels');
  }
  const legacy=normalizeDashboardLayout({version:3,mode:'custom',order:before,hidden:[],placements:original.placements},role);
  assert.ok(optional.every(id=>legacy.hidden.includes(id)),'Opt-in panels stay hidden for old layouts');
  assert.deepEqual(visibleDashboardPanels(legacy,role),before);
  assert.equal(original.order.includes('resources'),false);
  assert.equal(original.order.includes('partySidebar'),false);
 });
 test(role+' focus panels add, remove, resize and lock without touching fixed resources',()=>{
  let layout=defaultDashboardLayout(role);
  layout=toggleDashboardPanel(layout,role,'combatOverview',true);
  layout=toggleDashboardPanel(layout,role,'questTracker',true);
  assert.ok(visibleDashboardPanels(layout,role).includes('combatOverview'));
  assert.ok(visibleDashboardPanels(layout,role).includes('questTracker'));
  const before=layout.placements.combatOverview;
  layout=lockDashboardGridPanel(layout,role,'combatOverview',true);
  assert.deepEqual(moveDashboardGridPanel(layout,role,'combatOverview',0,120).placements.combatOverview,before);
  assert.deepEqual(resizeDashboardGridPanel(layout,role,'combatOverview',6,5).placements.combatOverview,before);
  layout=lockDashboardGridPanel(layout,role,'combatOverview',false);
  layout=moveDashboardGridPanel(layout,role,'combatOverview',0,120);
  assert.equal(layout.placements.combatOverview.y,120);
  layout=resizeDashboardGridPanel(layout,role,'combatOverview',6,5);
  assert.deepEqual({w:layout.placements.combatOverview.w,h:layout.placements.combatOverview.h},{w:6,h:5});
  const ids=visibleDashboardPanels(layout,role);
  for(const id of ids)for(const other of ids)if(id!==other)
    assert.equal(gridRectanglesOverlap(layout.placements[id],layout.placements[other]),false,id+' overlaps '+other);
  layout=toggleDashboardPanel(layout,role,'combatOverview',false);
  assert.ok(!visibleDashboardPanels(layout,role).includes('combatOverview'));
  assert.ok(layout.order.includes('combatOverview'));
  assert.equal(dashboardGridRule(role,'resources'),null);
  assert.equal(dashboardGridRule(role,'partySidebar'),null);
 });
}
test('Both renderers map all four IDs to existing gameplay data and preserve the approved frame wrapper',()=>{
 const player=read('src/dashboards/PlayerDashboardOverview.jsx');
 const gm=read('src/dashboards/GMDashboard.jsx');
 const component=read('src/dashboards/DashboardFocusPanels.jsx');
 for(const id of optional){
   assert.ok(player.includes("case '"+id+"'"),id+' Player');
   assert.ok(gm.includes("case '"+id+"'"),id+' GM');
   assert.ok(component.includes("export function "+({combatOverview:'PlayerCombatOverview',explorationOverview:'PlayerExplorationOverview',
     questTracker:'PlayerQuestTracker',inventoryOverview:'PlayerInventoryOverview'})[id]));
 }
 for(const componentName of ['GMCombatOverview','GMExplorationOverview','GMQuestTracker','GMInventoryOverview'])
   assert.ok(component.includes('export function '+componentName));
 for(const forbidden of ['setDoc','updateDoc','writeBatch','runTransaction','firebaseService','localStorage'])
   assert.ok(!component.includes(forbidden),'Focus panels must remain read-only: '+forbidden);
 assert.match(component,/DashboardPanel/);
 assert.match(player,/DashboardLayoutWorkspace/);
 assert.match(gm,/DashboardLayoutWorkspace/);
 assert.match(read('src/components/DashboardCustomisation.jsx'),/DashboardPanelFrameContext\.Provider/);
 const html=read('index.html');
 for(const asset of ['asteria-panel-headers.css','asteria-button-images.css','asteria-dashboard-panel-images.css'])
   assert.ok(html.includes(asset),asset);
});
