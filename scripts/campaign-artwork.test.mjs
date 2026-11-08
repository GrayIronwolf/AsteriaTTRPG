import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  CAMPAIGN_ARTWORK_MAX_BYTES, campaignArtworkFileError, campaignArtworkImage
} from '../src/state/campaignArtwork.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const file=(type,size)=>({type,size});
test('campaign artwork accepts supported images and rejects unsafe uploads',()=>{
  for(const type of ['image/png','image/jpeg','image/webp','image/gif'])
    assert.equal(campaignArtworkFileError(file(type,CAMPAIGN_ARTWORK_MAX_BYTES)),'');
  assert.match(campaignArtworkFileError(file('image/svg+xml',100)),/PNG/);
  assert.match(campaignArtworkFileError(file('text/html',100)),/PNG/);
  assert.match(campaignArtworkFileError(file('image/png',CAMPAIGN_ARTWORK_MAX_BYTES+1)),/8 MB/);
  assert.match(campaignArtworkFileError(file('image/png',0)),/zero/);
});
test('existing campaign image fields continue to render without a migration',()=>{
  assert.equal(campaignArtworkImage({image:'cover.png',art:'old.png'}),'cover.png');
  assert.equal(campaignArtworkImage({art:'old.png'}),'old.png');
  assert.equal(campaignArtworkImage({banner:'banner.png'}),'banner.png');
  assert.equal(campaignArtworkImage({}), '');
});
test('Campaign Forge and GM Campaign Manager expose one campaign artwork service',()=>{
  const forge=read('js/clean-compendium.js');
  const gm=read('src/dashboards/GMWorkspacePanels.jsx');
  const service=read('src/firebase/asteriaFirebaseService.js');
  const auth=read('js/firebase-auth.js');
  const player=read('src/components/DashboardInformation.jsx');
  assert.match(forge,/workspaceCampaignArtwork/);
  assert.match(forge,/workspaceCampaignDetailImage/);
  assert.match(forge,/await saveCampaign\?\.\(id,campaign\)/);
  assert.match(forge,/uploadCampaignArtwork/);
  assert.match(gm,/react-campaign-artwork-editor/);
  assert.match(gm,/uploadCampaignArtwork/);
  assert.match(gm,/removeCampaignArtwork/);
  assert.match(service,/uploadCampaignArtwork/);
  assert.match(service,/removeCampaignArtwork/);
  assert.match(auth,/campaignArtworkFileError\(file\)/);
  assert.match(auth,/currentUserIsCampaignGM/);
  assert.match(auth,/campaigns\/\$\{campaignId\}\/artwork\//);
  assert.match(player,/campaign\.image, campaign\.art, campaign\.banner/);
});
test('Firebase rules restrict artwork writes to campaign GMs',()=>{
  const firestore=read('firestore.rules'),storage=read('storage.rules');
  assert.match(storage,/match \/campaigns\/\{campaignId\}\/artwork\/\{fileName\}/);
  assert.match(storage,/allow create: if campaignGM\(campaignId\)/);
  assert.match(storage,/allow read: if campaignMember\(campaignId\)/);
  assert.match(firestore,/isCampaignGM\(campaignId\)/);
  assert.match(firestore,/\['image','imagePath','art','banner'/);
});
