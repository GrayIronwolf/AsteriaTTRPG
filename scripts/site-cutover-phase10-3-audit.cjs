/* Phase 10.3: offline mobile, accessibility and performance verification. */
'use strict';
const assert=require('node:assert/strict');

function createReport(){
 return {
  schemaVersion:1,phase:'10.3',
  environment:'isolated Vite preview and synthetic Firebase emulator identities',
  productionAccessed:false,deployed:false,cutoverApproved:false,
  legacyAuthenticated:'not-captured',checks:[],accessibility:[],keyboard:[],screenshots:[],
  budgets:{maxOverflowPx:1,maxDomReadyMs:16000,minHeaderTouchTargetPx:40},
  outstanding:[
   'Authorized redacted legacy GM and player production visual baselines are still required',
   'Phase 10.4 entry-point, cache compatibility and rollback approval is required',
   'Phase 10.5 deployment remains manual and user-controlled'
  ]
 };
}

function validateMetrics(m){
 assert.ok(m.documentWidth<=m.viewport+1,'horizontal overflow at '+m.viewport+
  'px: document '+m.documentWidth+'px');
 assert.equal(m.mainLandmarks,1,'A route must have exactly one main landmark');
 assert.equal(m.missingNames,0,'Visible interactive controls need accessible names');
 assert.equal(m.missingAlts,0,'Images require an alt attribute');
 assert.equal(m.duplicateIds,0,'Duplicate IDs break accessible references');
 assert.equal(m.brokenImages,0,'A visible image failed to load');
 assert.ok(m.targetHeight>=40,'Header touch target smaller than 40px');
 if(m.viewport<1280){
  assert.equal(m.visibleMenu,true,'Compact navigation must be visible on mobile/tablet');
  assert.equal(m.visibleDesktopNav,false,'Desktop navigation must not overlap compact navigation');
 }else{
  assert.equal(m.visibleMenu,false,'Compact menu should not show on desktop');
  assert.equal(m.visibleDesktopNav,true,'Desktop navigation must be visible');
 }
 if(m.domReadyMs!=null)assert.ok(m.domReadyMs<=16000,
  'DOM readiness exceeded generous CI regression budget: '+m.domReadyMs+'ms');
 return true;
}

async function auditSnapshot(page,{role,surface,size}){
 const m=await page.evaluate(()=>{
  const visible=el=>{
   const style=getComputedStyle(el);
   return style.display!=='none' && style.visibility!=='hidden' &&
    el.getClientRects().length>0 && !el.closest('[hidden],[inert],[aria-hidden="true"]');
  };
  const named=el=>{
   const label=el.getAttribute('aria-label')||el.getAttribute('title');
   if(label?.trim())return true;
   const linked=(el.getAttribute('aria-labelledby')||'').split(/\s+/)
    .map(id=>document.getElementById(id)?.textContent||'').join(' ').trim();
   return Boolean(linked||(el.innerText||el.textContent||'').trim()||
    el.querySelector('img[alt]:not([alt=""])'));
  };
  const ids=[...document.querySelectorAll('[id]')].map(el=>el.id).filter(Boolean);
  const nav=document.querySelector('[data-testid="site-primary-navigation"]');
  const menu=document.querySelector('[data-testid="site-mobile-menu"]');
  const target=innerWidth<1280?menu?.querySelector('summary'):
   document.querySelector('[data-testid="site-header-login"],[data-testid="site-header-profile"]');
  const timing=performance.getEntriesByType('navigation')[0];
  const resources=performance.getEntriesByType('resource');
  const js=resources.filter(e=>/\.(?:js|mjs)(?:\?|$)/.test(e.name));
  return {
   viewport:innerWidth,
   documentWidth:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),
   mainLandmarks:document.querySelectorAll('main').length,
   missingNames:[...document.querySelectorAll('button,a[href],summary')]
    .filter(visible).filter(el=>!named(el)).length,
   missingAlts:[...document.querySelectorAll('img:not([alt])')].filter(visible).length,
   duplicateIds:ids.length-new Set(ids).size,
   brokenImages:[...document.images].filter(el=>visible(el)&&el.complete&&
    Boolean(el.currentSrc)&&el.naturalWidth===0).length,
   targetHeight:Math.round(target?.getBoundingClientRect().height||0),
   visibleMenu:Boolean(menu&&visible(menu)),
   visibleDesktopNav:Boolean(nav&&visible(nav)),
   domReadyMs:timing?Math.round(timing.domContentLoadedEventEnd):null,
   resources:resources.length,jsResources:js.length,
   jsTransferBytes:js.reduce((total,e)=>total+(e.transferSize||0),0)
  };
 });
 validateMetrics(m);
 return {role,surface,size,...m};
}

async function auditAxe(page,{role,surface,size}){
 const axe=require('axe-core');
 await page.addScriptTag({content:axe.source});
 const violations=await page.evaluate(async()=>{
  const result=await window.axe.run(document,{
   runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}
  });
  return result.violations.map(v=>({rule:v.id,impact:v.impact,affected:v.nodes.length}));
 });
 const severe=violations.filter(v=>['critical','serious'].includes(v.impact));
 assert.equal(severe.length,0,'Serious WCAG 2.1 A/AA violations in '+
  role+'/'+surface+'/'+size+': '+JSON.stringify(severe));
 return {role,surface,size,serious:0,
  otherViolations:violations.filter(v=>!['critical','serious'].includes(v.impact))};
}

async function auditKeyboard(page,report,evidenceDir){
 const path=require('node:path');
 const base='http://127.0.0.1:4174/';
 await page.setViewportSize({width:390,height:844});
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'Asteria',level:1,exact:true}).waitFor();
 await page.keyboard.press('Tab');
 assert.equal(await page.evaluate(()=>document.activeElement?.textContent?.trim()),
  'Skip to main content','First keyboard stop must be skip navigation');
 await page.keyboard.press('Enter');
 assert.equal(await page.evaluate(()=>document.activeElement?.id),'site-main');
 report.keyboard.push('skip-to-main');
 const summary=page.getByTestId('site-mobile-menu').locator('summary');
 await summary.focus();
 await page.keyboard.press('Enter');
 assert.equal(await page.getByTestId('site-mobile-menu').evaluate(el=>el.open),true);
 const link=page.getByRole('navigation',{name:'Mobile navigation'})
  .getByRole('link',{name:'Asteria Compendium',exact:true});
 await link.focus();
 await page.keyboard.press('Enter');
 await page.getByTestId('site-mega-menu').waitFor();
 assert.equal(await page.getByTestId('site-mega-search').evaluate(
  el=>document.activeElement===el),true);
 await page.keyboard.press('Shift+Tab');
 assert.equal(await page.getByTestId('site-mega-cards').getByRole('link').last()
  .evaluate(el=>document.activeElement===el),true,'Dialog must trap reverse Tab');
 const mobileShot='phase10-3-mobile-menu-390.png';
 await page.screenshot({path:path.join(evidenceDir,mobileShot),animations:'disabled'});
 report.screenshots.push(mobileShot);
 await page.keyboard.press('Escape');
 await page.getByTestId('site-mega-menu').waitFor({state:'detached'});
 assert.equal(await summary.evaluate(el=>document.activeElement===el),true,
  'Escape must return focus to mobile menu trigger');
 report.keyboard.push('mobile-dialog-trap-and-focus-restoration');

 await page.emulateMedia({reducedMotion:'reduce'});
 await summary.focus();
 await page.keyboard.press('Enter');
 await link.focus();
 await page.keyboard.press('Enter');
 const duration=await page.getByTestId('site-mega-cards').getByRole('link').first()
  .evaluate(el=>getComputedStyle(el).transitionDuration);
 assert.ok(duration.split(',').every(x=>parseFloat(x)<=.001),
  'Reduced-motion preference must disable card transitions');
 report.keyboard.push('reduced-motion');
 await page.keyboard.press('Escape');
 await page.emulateMedia({reducedMotion:'no-preference'});

 await page.setViewportSize({width:1440,height:900});
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'Asteria',level:1,exact:true}).waitFor();
 const desktop=page.getByRole('navigation',{name:'Primary navigation'})
  .getByRole('link',{name:'Asteria Compendium',exact:true});
 await desktop.focus();
 await page.keyboard.press('Enter');
 await page.getByTestId('site-mega-menu').waitFor();
 const desktopShot='phase10-3-desktop-menu-1440.png';
 await page.screenshot({path:path.join(evidenceDir,desktopShot),animations:'disabled'});
 report.screenshots.push(desktopShot);
 await page.keyboard.press('Escape');
 assert.equal(await desktop.evaluate(el=>document.activeElement===el),true);
 report.keyboard.push('desktop-dialog-and-focus-restoration');
}
module.exports={createReport,validateMetrics,auditSnapshot,auditAxe,auditKeyboard};
