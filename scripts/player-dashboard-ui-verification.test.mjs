import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeCombatWorkspace} from '../src/dashboards/combat/combatWorkspaceLayoutModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('canvas appearance options preserve the selected custom colour',()=>{
  for(const name of ['midnight','obsidian','slate','navy','black','custom']){
    const result=normalizeCombatWorkspace({canvasBackground:name,canvasCustomColor:'#29425D'});
    assert.equal(result.canvasBackground,name);
    assert.equal(result.canvasCustomColor,'#29425D');
  }
  assert.equal(normalizeCombatWorkspace({canvasBackground:'custom',canvasCustomColor:'invalid'}).canvasCustomColor,'#060D15');
});

test('player HUD characteristics use three columns, shared across menu routes',()=>{
  const css=read('src/styles/asteria-react.css');
  assert.match(css,/react-character-dashboard \.react-player-hud-information \.react-player-characteristic-grid\{\s*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/react-character-dashboard \.react-player-topbar\.react-player-cinematic-hud/);
  assert.match(css,/grid-template-rows:minmax\(190px,auto\)/);
  assert.match(css,/background-color:#060D15/);
});

test('player toolbar uses transparent vertical icon controls and quiet resize handles',()=>{
  const css=read('src/dashboards/combat/CombatCommandCentre.module.css');
  assert.match(css,/site-player-main-canvas.*?\.canvasActions\{[\s\S]*?flex-direction:column/);
  assert.match(css,/site-player-main-canvas.*?\.resizeHandle\{[\s\S]*?opacity:0/);
  assert.match(css,/data-background='custom'/);
});

test('canvas settings and add window have separate drawer modes',()=>{
  const jsx=read('src/dashboards/combat/CombatCommandCentre.jsx');
  assert.match(jsx,/setSidebarMode\('settings'\)/);
  assert.match(jsx,/setSidebarMode\('windows'\)/);
  assert.match(jsx,/sidebarMode==='settings'\?<details/);
  assert.match(jsx,/sidebarMode==='windows'\?<>/);
});
