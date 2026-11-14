import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GM_TOOLKIT_GROUPS,GM_TOOLKIT_TOOLS,gmToolkitTool,filterGMToolkit,gmToolkitOverview} from '../src/state/gmToolkitModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Phase 2.1 catalog contains only existing GM Dashboard tabs with distinct tool IDs',()=>{
  const source=read('src/dashboards/GMDashboard.jsx');
  const workspace=read('src/dashboards/GMWorkspacePanels.jsx');
  const tabs=[...source.matchAll(/\{ id:\s*'([^']+)', label:/g)].map(item=>item[1]);
  assert.ok(tabs.includes('main')&&tabs.includes('toolkit')&&tabs.includes('inventory'));
  assert.equal(GM_TOOLKIT_GROUPS.length,4);
  assert.equal(new Set(GM_TOOLKIT_GROUPS.map(g=>g.id)).size,4);
  assert.equal(new Set(GM_TOOLKIT_TOOLS.map(t=>t.id)).size,GM_TOOLKIT_TOOLS.length);
  assert.ok(GM_TOOLKIT_TOOLS.length>=12);
  for(const tool of GM_TOOLKIT_TOOLS){
    assert.ok(tabs.includes(tool.tab),'Unknown GM tab: '+tool.id);
    assert.ok(tool.label&&tool.description,'Tool has no accessible label: '+tool.id);
    if(tool.targetId)assert.ok([source,workspace].some(s=>s.includes('id="'+tool.targetId+'"')),'Missing target: '+tool.targetId);
    assert.equal(gmToolkitTool(tool.id),tool);
  }
  assert.equal(gmToolkitTool('not-registered'),null);
});

test('Search and category filters are presentation-only and do not mutate entries',()=>{
  const initial=JSON.stringify(GM_TOOLKIT_GROUPS);
  const all=filterGMToolkit();
  assert.equal(all.reduce((sum,g)=>sum+g.tools.length,0),GM_TOOLKIT_TOOLS.length);
  assert.deepEqual(filterGMToolkit({query:'merchant'}).flatMap(g=>g.tools.map(t=>t.id)),['shops']);
  assert.deepEqual(filterGMToolkit({group:'world'}).flatMap(g=>g.tools.map(t=>t.id)),['world-atlas','weather-environment','asteria-calendar','world','layout']);
  assert.deepEqual(filterGMToolkit({query:'aRmOuR'}).flatMap(g=>g.tools.map(t=>t.id)),['gm-controls']);
  assert.equal(filterGMToolkit({query:'not a real feature'}).length,0);
  assert.equal(filterGMToolkit({group:'missing-category'}).length,0);
  assert.equal(JSON.stringify(GM_TOOLKIT_GROUPS),initial);
});

test('Live GM Toolkit counters read existing campaign data without side effects',()=>{
  const data={
    session:{status:'paused'},
    characters:{a:{id:'a'},b:{id:'b'}},
    workspace:{quests:[{status:'Active'},{status:'Completed'},{status:'Pending'},{status:'Failed'}]},
    itemEcosystem:{shops:[{id:'shop1'},{id:'shop2'}]},
    partyLoot:{drafts:[{visibility:'hidden',status:'available'},
      {visibility:'revealed',status:'available'},{visibility:'hidden',status:'delivered'}]}
  };
  const before=JSON.stringify(data);
  assert.deepEqual(gmToolkitOverview(data),{
    sessionStatus:'paused',linkedCharacters:2,openQuests:2,shops:2,hiddenDrafts:1
  });
  assert.equal(JSON.stringify(data),before);
  assert.deepEqual(gmToolkitOverview(),{
    sessionStatus:'idle',linkedCharacters:0,openQuests:0,shops:0,hiddenDrafts:0
  });
});

test('GM Toolkit is in authenticated GM view, with no independent data collection',()=>{
  const dashboard=read('src/dashboards/GMDashboard.jsx');
  const hub=read('src/dashboards/GMToolkitHub.jsx');
  const mount=read('src/app/mountDashboard.jsx');
  assert.ok(dashboard.indexOf("if(!window.AsteriaCharacterAccess.isGM(")<dashboard.indexOf('return <AsteriaAppShell'));
  assert.match(dashboard,/<GMToolkitHub key=\{campaignId\+':'\+accountUid\}/);
  assert.match(dashboard,/<GMToolkitQuickAccess onNavigate=\{openGMHubLink\}/);
  assert.match(dashboard,/GM_TABS\.some\(item=>item\.id===link\?\.tab\)/);
  assert.match(dashboard,/setTab\(link\.tab\)/);
  assert.match(dashboard,/setGMHubDestination\(link\.targetId/);
  assert.match(hub,/filterGMToolkit\(\{query,group\}\)/);
  assert.match(hub,/aria-pressed=\{group===option\.id\}/);
  assert.match(hub,/onClick=\{\(\)=>onNavigate\(tool\)\}/);
  assert.match(hub,/No existing GM tools match those filters/);
  assert.match(mount,/import '\.\.\/styles\/gm-toolkit\.css'/);
  assert.doesNotMatch(hub+read('src/state/gmToolkitModel.mjs'),/firebaseService|fetch\(|httpsCallable|setDoc|localStorage|window\.session/);
});

test('Toolkit CSS is GM-scoped, responsive, and does not edit dashboard frame styles',()=>{
  const css=read('src/styles/gm-toolkit.css');
  assert.match(css,/\.react-gm-dashboard \.react-gm-toolkit/);
  assert.match(css,/@container \(max-width:580px\)/);
  assert.match(css,/@media \(max-width:720px\)/);
  assert.match(css,/:focus-visible/);
  assert.doesNotMatch(css,/\.react-workspace-sidebar\s*\{|\.react-dashboard-grid\s*\{/);
});
