import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  battleMapFileError,battleMapFileKind,battleMapAssetPath,battleMapEditableSettings,
  battleMapDimensions,battleMapPoint,battleMapCanPreview,BATTLE_MAP_VIDEO_MAX_BYTES,
  BATTLE_MAP_IMAGE_MAX_BYTES,BATTLE_MAP_MAX_TOKENS
} from '../src/state/battleMapModel.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const file=(type,size)=>({type,size});
test('image maps accept only known types and <=8 MB',()=>{
  for(const type of ['image/png','image/jpeg','image/webp','image/gif'])
    assert.equal(battleMapFileError(file(type,BATTLE_MAP_IMAGE_MAX_BYTES)),'');
  assert.match(battleMapFileError(file('image/svg+xml',100)),/PNG/);
  assert.match(battleMapFileError(file('text/html',100)),/PNG/);
  assert.match(battleMapFileError(file('image/png',BATTLE_MAP_IMAGE_MAX_BYTES+1)),/8 MB/);
  assert.match(battleMapFileError(file('image/png',0)),/empty/);
});
test('looping video format cap is bounded to 48MB',()=>{
  for(const type of ['video/mp4','video/webm']){
    assert.equal(battleMapFileError(file(type,BATTLE_MAP_VIDEO_MAX_BYTES)),'');
    assert.equal(battleMapFileKind(type),'video');
    assert.match(battleMapFileError(file(type,BATTLE_MAP_VIDEO_MAX_BYTES+1)),/48 MB/);
  }
  assert.match(battleMapFileError(file('video/quicktime',1000)),/MP4/);
});
test('battle map paths can never escape their campaign namespace',()=>{
  assert.equal(battleMapAssetPath('campaign','mapId','video/mp4'),'campaigns/campaign/battleMaps/mapId/scene.mp4');
  assert.throws(()=>battleMapAssetPath('campaign/other','mapId','video/webm'),/Invalid/);
  assert.throws(()=>battleMapAssetPath('campaign','../../evil','video/mp4'),/Invalid/);
  assert.equal(battleMapCanPreview({id:'mapId',kind:'video',contentType:'video/mp4',storagePath:'campaigns/campaign/battleMaps/mapId/scene.mp4'},'campaign'),true);
  assert.equal(battleMapCanPreview({id:'mapId',kind:'video',contentType:'video/mp4',storagePath:'campaigns/other/battleMaps/mapId/scene.mp4'},'campaign'),false);
});
test('GM grid controls and map dimensions enforce bounded integers',()=>{
  const original=battleMapEditableSettings({name:'Glacier cavern',gridColumns:22,gridRows:18,gridOpacity:75});
  assert.equal(original.visibility,'gm');
  assert.equal(original.gridRows,18);
  assert.throws(()=>battleMapEditableSettings({...original,gridColumns:81}),/grid columns/);
  assert.throws(()=>battleMapEditableSettings({...original,name:''}),/Map name/);
  assert.throws(()=>battleMapEditableSettings({...original,visibility:'everyone'}),/visibility/);
  assert.deepEqual(battleMapDimensions(1920,1080),{width:1920,height:1080});
  assert.throws(()=>battleMapDimensions(9000,1080),/map width/);
  assert.deepEqual(battleMapPoint(13,18,{columns:10,rows:10,snap:true}),{x:15,y:15});
  assert.deepEqual(battleMapPoint(101,-20),{x:100,y:0});
});
test('manual player/creature/marker tokens preserve identity and stay on map',()=>{
  const markers=[{id:'hero',label:'Hero',kind:'character',refId:'pc-a',x:24.127,y:49.999},
    {id:'ogre',label:'Ogre',kind:'creature',x:50,y:50}];
  const result=battleMapEditableSettings({name:'Ogre fight',tokens:markers});
  assert.equal(result.tokens[0].x,24.13);
  assert.equal(result.tokens[0].y,50);
  assert.equal(result.tokens[1].kind,'creature');
  assert.throws(()=>battleMapEditableSettings({name:'Bad',tokens:[markers[0],markers[0]]}),/unique/);
  assert.throws(()=>battleMapEditableSettings({name:'Bad',tokens:[{...markers[0],x:101}]}),/position/);
  assert.throws(()=>battleMapEditableSettings({name:'Bad',tokens:Array.from({length:BATTLE_MAP_MAX_TOKENS+1},(_,i)=>({...markers[0],id:'t'+i}))}),/60 tokens/);
});
test('GM and player dashboard mounts and loop playback are wired to authenticated Firebase',()=>{
  const gm=read('src/dashboards/GMDashboard.jsx');
  const player=read('src/dashboards/CharacterDashboard.jsx');
  const map=read('src/dashboards/BattleMapWorkspace.jsx');
  const auth=read('js/firebase-auth.js');
  const rules=read('firestore.rules');
  const storage=read('storage.rules');
  assert.match(gm,/GMBattleMapManager/);
  assert.match(player,/PlayerBattleMapView/);
  assert.match(map,/<video[\s\S]{0,280}loop muted playsInline/);
  assert.match(map,/fetchBattleMapMedia/);
  assert.match(auth,/getBlob\(storageRef\(storage,path\)\)/);
  assert.match(auth,/subscribeBattleMaps/);
  assert.match(storage,/match \/campaigns\/\{campaignId\}\/battleMaps\/\{mapId\}/);
  assert.match(storage,/campaignGM\(campaignId\)/);
  assert.match(rules,/match \/battleMaps\/\{mapId\}/);
});
