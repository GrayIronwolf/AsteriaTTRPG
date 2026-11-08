import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const model=requireModel();
function requireModel(){
  const context={module:{exports:{}},window:{}};
  vm.runInNewContext(fs.readFileSync('js/campaign-join-model.js','utf8'),context);
  return context.module.exports;
}

test('UCN parsing allows formatted twelve digit input without altering leading zeros',()=>{
  for(const input of ['000000000789','0000 0000 0789','0000-0000-0789',' 000000000789 ']){
    assert.equal(model.normalizeUCN(input),'000000000789');
  }
  for(const input of ['','12345678901','1234567890123','1234567890125','00000000078x','+000000000789','--','0000000/00789',123456789012]){
    if(input==='1234567890125') assert.equal(model.normalizeUCN(input),'');
    else assert.equal(model.normalizeUCN(input),'');
  }
});
test('preview requires server campaign identity and matching UCN',()=>{
  const code='000000000789';
  const valid={id:'campaign-x',name:' The Citadel ',ucn:code,joinMode:'request',players:{sensitive:true}};
  const result=model.verifiedPreview(valid,code);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{id:'campaign-x',name:'The Citadel',ucn:code,joinMode:'request'});
  assert.equal(Object.isFrozen(result),true);
  for(const patch of [
    {id:'bad/id'},{id:''},{name:'  '},{ucn:'999999999999'},
    {ucn:123456789012},{name:null}
  ]) assert.equal(model.verifiedPreview({...valid,...patch},code),null);
});
test('never infer legacy approval policy from a summary lacking joinMode',()=>{
  const result=model.verifiedPreview({id:'c',name:'Unknown',ucn:'123456789012'},'123456789012');
  assert.equal(result.joinMode,'unavailable');
  assert.equal(model.canJoinPreview(result,{uid:'alice'},{uid:'alice'},'123456789012'),false);
});
test('only verified matching accounts can continue a legacy join',()=>{
  const preview=model.verifiedPreview({id:'c',name:'Legacy',ucn:'000000000789',joinMode:'legacy'},'000000000789');
  assert.equal(model.canJoinPreview(preview,{uid:'alice'},{uid:'alice'},'0000-0000-0789'),true);
  assert.equal(model.canJoinPreview(preview,{uid:'alice'},{uid:'bob'},'000000000789'),false);
  assert.equal(model.canJoinPreview(preview,{uid:'alice'},null,'000000000789'),false);
  assert.equal(model.canJoinPreview(preview,{uid:'alice'},{uid:'alice'},'111111111111'),false);
  assert.equal(model.canJoinPreview(preview,{uid:'alice'},{uid:'alice'},'000000000789x'),false);
});
test('v2 join request and unavailable previews never authorize joining',()=>{
  for(const joinMode of ['request','unavailable']){
    const preview=model.verifiedPreview({id:'c',name:'Campaign',ucn:'000000000789',joinMode},'000000000789');
    assert.equal(model.canJoinPreview(preview,{uid:'alice'},{uid:'alice'},'000000000789'),false);
  }
});
test('workspace requires explicit preview then confirmation and does not join when searching',()=>{
  const source=fs.readFileSync('js/clean-compendium.js','utf8');
  const lookup=source.slice(source.indexOf('  async function lookupCampaignByUCN('),source.indexOf('  function renderCampaignJoinPreview('));
  const confirmation=source.slice(source.indexOf('  async function confirmCampaignJoin('),source.indexOf('  function setPendingCampaignJoin('));
  assert.match(lookup,/previewCampaignByUCN\(code\)/);
  assert.doesNotMatch(lookup,/joinCampaignByUCN\(code\)/);
  assert.match(confirmation,/canJoinPreview/);
  assert.match(confirmation,/firebase\.joinCampaignByUCN\(state\.preview\.ucn\)/);
  assert.match(source,/renderCampaignJoinPreview\(candidate,activeUser\)/);
  assert.match(source,/request submission is being added in Phase 3\.2/);
});
test('HTML loads the join model before clean compendium and preserves existing image/theme assets',()=>{
  const html=fs.readFileSync('index.html','utf8');
  const modelIndex=html.indexOf('js/campaign-join-model.js'),appIndex=html.indexOf('js/clean-compendium.js');
  assert.ok(modelIndex>0 && appIndex>modelIndex);
  assert.match(html,/js\/data-sync\.js/);
  assert.match(html,/js\/firebase-auth\.js/);
});
