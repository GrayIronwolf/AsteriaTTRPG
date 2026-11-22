import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {orderedCombatPartyIds} from '../src/dashboards/combat/combatWorkspaceLayoutModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('All zoom levels preserve window content and controls in GM, Player, and Combat canvases',()=>{
 const css=read('src/dashboards/combat/CombatCommandCentre.module.css');
 const canvas=read('src/dashboards/combat/CombatCommandCentre.jsx');
 assert.doesNotMatch(css,/\.canvas\[data-overview/);
 assert.doesNotMatch(canvas,/data-overview=\{/);
 assert.match(css,/\.minimised \.windowContent\{visibility:hidden/);
 assert.match(canvas,/zoomCombatCamera/);
 assert.match(canvas,/data-layout-mode=\{wide\?'freeform':'stacked'\}/);
});

test('GM Player Resources canvas cards are slimmer and taller without action buttons',()=>{
 const gm=read('src/dashboards/GMDashboard.jsx');
 const css=read('src/styles/asteria-react.css');
 assert.match(css,/\.react-party-sidebar-in-canvas>\.react-party-list\{\s*display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/\.react-party-sidebar-in-canvas \.react-party-card\{\s*min-width:0;width:100%;height:auto;min-height:340px/);
 assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(css,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
 assert.match(gm,/\{!embedded\?<div className="react-party-card-actions">/);
 assert.match(gm,/selected\?'Selected':'Select'/);
 assert.match(gm,/>Open Character<\/button>/);
 assert.match(gm,/kind="xp"/);
 assert.match(gm,/resourceDefinitions\(character\)/);
 assert.match(gm,/onFocus=\{onFocus\?\(\)=>onFocus\(character\):null\}/);
});

test('Full-card lifted drag image, pointer capture, animated reorder and keyboard access',()=>{
 const gm=read('src/dashboards/GMDashboard.jsx');
 const css=read('src/styles/asteria-react.css');
 assert.match(gm,/source\.cloneNode\(true\)/);
 assert.match(gm,/gesture\.overlay\.style\.transform/);
 assert.match(gm,/setPointerCapture\(event\.pointerId\)/);
 assert.match(gm,/document\.elementFromPoint\(gesture\.x,gesture\.y\)/);
 assert.match(gm,/requestAnimationFrame/);
 assert.match(gm,/onPointerCancel=\{onEndDrag\}/);
 assert.match(gm,/onLostPointerCapture=\{onEndDrag\}/);
 assert.match(gm,/if\(event\.type==='pointerup'&&gesture\.moved&&to\)reorder/);
 assert.match(gm,/card\.animate\?\.\(/);
 assert.match(gm,/event\.altKey/);
 assert.match(css,/\.react-party-drag-overlay\{/);
 assert.match(css,/\.react-party-card\.is-lifted\{/);
 assert.match(css,/\.react-party-card\.is-drop-target\{/);
 assert.deepEqual(orderedCombatPartyIds(['a','b','c'],['c','a','b']),['c','a','b']);
});
