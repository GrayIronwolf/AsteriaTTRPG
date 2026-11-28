import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('GM Battle Maps editor remounts media for each saved map id and path',()=>{
 const source=load('src/dashboards/BattleMapWorkspace.jsx');
 assert.match(source,/\{selected\?<MapCanvas key=\{campaignId\+':'\+selected\.id\+':'\+selected\.storagePath\}/);
 assert.match(source,/map=\{viewMap\} session=\{session\}/);
});

test('shared campaign map viewer remounts for selected media and player/GM preview',()=>{
 const source=load('src/dashboards/presentation/CampaignMapWorkspace.jsx');
 assert.match(source,/\{preview\?<CampaignMapCanvas key=\{campaignId\+':'\+map\.id\+':'\+map\.storagePath/);
 assert.match(source,/mediaMap=\{map\}/);
});

test('CCC updates prepared preview without navigation while live link stays authoritative',()=>{
 const component=load('src/dashboards/combat/CombatBattleMapPanel.jsx');
 const workspace=load('src/dashboards/combat/CombatWorkspace.jsx');
 assert.match(workspace,/previewMapId=\{selectedBattleMap\}/);
 assert.match(component,/combat\?\.battleMapId\|\|\(previewMapId===null\?combat\?\.preparedMapId\|\|'':previewMapId\)/);
 assert.match(component,/<CampaignMapCanvas key=\{campaignId\+':'\+map\.id\+':'\+map\.storagePath/);
});
