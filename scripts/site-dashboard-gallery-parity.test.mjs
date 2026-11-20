import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectGallery,mergedGalleryRows,validateGalleryUpload,
  galleryStoragePath,assertOwnedGalleryPath} from '../frontend/src/player/playerGalleryModel.mjs';
import {playerCharacterProjection} from '../frontend/src/player/playerDashboardModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Phase 2.2 preserves older gallery and portrait without duplicates',()=>{
  const row={id:'gallery-one',url:'https://example.com/image.png',name:'Hero'};
  const character={gallery:[row],image:'https://example.com/image.png'};
  const source={gallery:[row,'https://example.com/old.png']};
  const rows=projectGallery(character,source,true);
  assert.equal(rows.length,2);assert.equal(rows[0].rawId,'gallery-one');
  assert.equal(rows[1].managed,false);
  assert.equal(mergedGalleryRows(character.gallery,source.gallery).length,2);
  assert.deepEqual(projectGallery(character,source,false),[]);
  assert.equal(projectGallery({image:'https://example.com/portrait.png'}, {},true)[0].managed,false);
});
test('Phase 2.2 projects owner gallery but not to a GM read-only route',()=>{
  const character={id:'hero',ownerUid:'person',name:'Hero',
    gallery:[{id:'gallery-one',url:'https://example.com/hidden.png',name:'Private Sketch'}]};
  const owned=playerCharacterProjection(character,{owned:true});
  const gm=playerCharacterProjection(character,{owned:false});
  assert.equal(owned.gallery[0].name,'Private Sketch');
  assert.equal(gm.gallery.length,0);
  assert.equal(JSON.stringify(gm).includes('Private Sketch'),false);
});
test('Phase 2.2 rejects unsupported, empty and oversized uploads',()=>{
  assert.equal(validateGalleryUpload({name:'drawing.png',type:'image/png',size:1024}).extension,'png');
  assert.throws(()=>validateGalleryUpload({name:'script.svg',type:'image/svg+xml',size:64}),/PNG/);
  assert.throws(()=>validateGalleryUpload({name:'empty.png',type:'image/png',size:0}),/between 1 byte/);
  assert.throws(()=>validateGalleryUpload({name:'oversize.png',type:'image/png',size:8*1024*1024+1}),/8 MB/);
});
test('Phase 2.2 storage paths cannot cross owners or original character boundaries',()=>{
  const path=galleryStoragePath('ownerABC','source1','gallery-abcdef01','png');
  assert.equal(assertOwnedGalleryPath(path,'ownerABC','source1'),path);
  assert.throws(()=>assertOwnedGalleryPath(path,'anotherOwner','source1'),/does not belong/);
  assert.throws(()=>assertOwnedGalleryPath('users/ownerABC/characters/source1/gallery/../../evil.png','ownerABC','source1'),/does not belong/);
});
test('Phase 2.2 React gallery uses shared Storage, owner and session checks',()=>{
  const adapter=read('frontend/src/auth/firebaseAuthAdapter.mjs');
  const service=read('frontend/src/player/firebasePlayerDashboardService.mjs');
  const page=read('frontend/src/pages/PlayerDashboardPage.jsx');
  const ui=read('frontend/src/player/PlayerGalleryWorkspace.jsx');
  assert.match(adapter,/storage,storageSdk:safeStorageSdk/);
  assert.match(service,/async function uploadGalleryImage/);
  assert.match(service,/async function setGalleryPortrait/);
  assert.match(service,/async function deleteGalleryImage/);
  assert.match(service,/async function refreshGalleryImage/);
  assert.match(service,/galleryTransaction/);
  assert.match(service,/linkedCharacterAccess/);
  assert.match(service,/gmSessionState\(sessionSnap\.data\(\)\)\.editable!==true/);
  assert.match(ui,/site-player-gallery/);
  assert.match(ui,/Use as Portrait/);
  assert.match(ui,/Confirm Gallery Deletion/);
  assert.match(page,/PlayerGalleryWorkspace/);
  assert.doesNotMatch(ui,/window\.AsteriaFirebase|initializeApp\(/);
});
