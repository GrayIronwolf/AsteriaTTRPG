import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {playerCharacterProjection,playerCampaignProjection} from '../frontend/src/player/playerDashboardModel.mjs';
import {gmCampaignSummary,gmPartySummary} from '../frontend/src/dashboard/gmDashboardModel.mjs';
import {safeDashboardArtwork} from '../src/state/playerHudMedia.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('approved image assets stay the original single dashboard style source',()=>{
  const css=read('frontend/src/layout/DashboardLayoutWorkspace.module.css');
  const grid=read('frontend/src/layout/DashboardLayoutWorkspace.jsx');
  for(const asset of ['panel-frame-3x3.webp','panel-frame-3x6.webp',
    'panel-frame-6x3.webp','panel-frame-9x3.webp',
    'panel-backdrop-obsidian.webp','panel-backdrop-slate.webp','panel-backdrop-arcane.webp','10004.png','10006.png']){
    assert.match(css,new RegExp(asset.replaceAll('.','\\.')));
  }
  assert.match(grid,/data-panel-size=\{\x60\$\{pos.w\}x\$\{pos.h\}\x60\}/);
});
test('player restores original portrait, campaign image, HP SP MP and 9 characteristics',()=>{
  const jsx=read('frontend/src/pages/PlayerDashboardPage.jsx');
  const css=read('frontend/src/pages/PlayerDashboardPage.module.css');
  for(const marker of ['classicHeader','portraitColumn','coreColumn','campaignColumn','Resources','StatPanel','sessionStrip'])
    assert.ok(jsx.includes(marker),marker);
  assert.match(css,/grid-template-columns:minmax\(200px,30%\)/);
  assert.doesNotMatch(jsx,/<h3>Dashboard Migration<\/h3>/);
});
test('GM has original resource sidebar, framed panels and reusable session backend',()=>{
  const jsx=read('frontend/src/pages/GMDashboardPage.jsx');
  assert.match(jsx,/partySidebar/);
  assert.match(jsx,/ResourceMeter/);
  assert.match(jsx,/gmSessionCommands/);
  assert.match(jsx,/GMCombatWorkspace/);
});
test('only safe image URLs cross React projection boundary, never expose private GM data',()=>{
  const owner='owner-1',id='hero-1';
  const character=playerCharacterProjection({id,ownerUid:owner,name:'Hero',
    image:'https://example.com/hero.webp',journal:[{title:'secret',content:'PRIVATE'}]},
  {owned:false});
  assert.equal(character.image,'https://example.com/hero.webp');
  assert.deepEqual(character.journal,[]);
  assert.equal(safeDashboardArtwork('javascript:alert(1)'),'');
  assert.equal(safeDashboardArtwork('//evil.example/img.png'),'');
  const c={id:'campaign-1',name:'Campaign',image:'/assets/campaign.webp'};
  assert.equal(playerCampaignProjection(c,{allowed:true,isGM:false},null).image,'/assets/campaign.webp');
  assert.equal(gmCampaignSummary({...c,ownerUid:owner},{allowed:true,role:'owner'}).image,'/assets/campaign.webp');
  assert.equal(gmPartySummary([{id,name:'Hero',image:'https://example.com/hero.webp'}])[0].image,'https://example.com/hero.webp');
});
