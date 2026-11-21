'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validateMetrics,createReport}=require('./site-cutover-phase10-3-audit.cjs');
const sample={
 viewport:390,documentWidth:390,mainLandmarks:1,missingNames:0,missingAlts:0,
 duplicateIds:0,brokenImages:0,visibleMenu:true,visibleDesktopNav:false,
 domReadyMs:1400,targetHeight:44
};
test('valid responsive viewport passes the release gate',()=>{
 assert.doesNotThrow(()=>validateMetrics(sample));
});
test('horizontal overflow fails',()=>{
 assert.throws(()=>validateMetrics({...sample,documentWidth:402}),/overflow/);
});
test('missing interactive accessible names fails',()=>{
 assert.throws(()=>validateMetrics({...sample,missingNames:1}),/accessible names/);
});
test('undersized touch target fails',()=>{
 assert.throws(()=>validateMetrics({...sample,targetHeight:28}),/touch target/);
});
test('the compact layout hides the desktop navigation row',()=>{
 assert.throws(()=>validateMetrics({...sample,viewport:1440,documentWidth:1440,
  visibleMenu:true,visibleDesktopNav:true}),/desktop/);
});
test('the desktop layout keeps Navigation and Appearance access',()=>{
 const desktop={...sample,viewport:1680,documentWidth:1680,visibleDesktopNav:true};
 assert.doesNotThrow(()=>validateMetrics(desktop));
 assert.throws(()=>validateMetrics({...desktop,visibleMenu:false}),/Appearance/);
});
test('the report cannot approve production without legacy authenticated comparison',()=>{
 const r=createReport();
 assert.equal(r.cutoverApproved,false);
 assert.equal(r.legacyAuthenticated,'not-captured');
 assert.ok(r.outstanding.some(x=>/legacy GM and player/.test(x)));
});
