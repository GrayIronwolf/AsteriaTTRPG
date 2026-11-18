/* Full-browser smoke test for navigation regression on mobile.
 * Run against locally built static site, no real Firebase credentials. */
'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
require('./local-static-server.js');
const base='http://127.0.0.1:8123/';

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const jsErrors=[],consoleErrors=[],requestFailures=[];
  page.on('pageerror',error=>jsErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  page.on('requestfailed',req=>requestFailures.push({url:req.url(),reason:req.failure()?.errorText}));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  async function details(label){
    const state=await page.evaluate(()=>({
      view:document.querySelector('.view.show')?.id,
      visibleViews:[...document.querySelectorAll('.view.show')].map(e=>e.id),
      loginButtonText:document.getElementById('loginToggle')?.textContent?.trim(),
      setViewType:typeof window.setView,
      hardHomeType:typeof window.asteriaHardHome,
      coreRouterType:typeof window.AsteriaRouter,
      compendiumType:typeof window.AsteriaUniversalCompendium,
      libraryType:typeof window.AsteriaLibrary,
      workspaceType:typeof window.AsteriaWorkspace,
      settingsOpen:document.getElementById('settingsPanel')?.classList.contains('open'),
      megaMenuHidden:document.getElementById('aaaMegaMenu')?.hidden,
      navClickCapture:window.__smokeCapture||[],
      bodyRole:document.body.dataset.role,
    }));
    console.log('NAV_SMOKE '+label+': '+JSON.stringify({state,jsErrors,consoleErrors:consoleErrors.slice(-12),requestFailures:requestFailures.filter(x=>x.url.includes('127.0.0.1')).slice(-15)}));
    return state;
  }
  try{
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForTimeout(1600);
    await page.evaluate(()=>{
      window.__smokeCapture=[];
      window.addEventListener('click',event=>{
        window.__smokeCapture.push({target:event.target?.id||event.target?.textContent?.slice(0,32),trusted:event.isTrusted,phase:event.eventPhase});
      },true);
    });
    const initial=await details('initial');
    assert.equal(initial.view,'home','Guest page must open on Home');
    await page.locator('#loginToggle').click({timeout:12000});
    await page.waitForTimeout(400);
    const login=await details('login-click');
    assert.equal(login.view,'loginPage','Login button must open login page, not remain on Home');
    await page.locator('#loginPage button[onclick*="setView"]').first().click({timeout:10000});
    await page.waitForTimeout(350);
    const back=await details('back-home');
    assert.equal(back.view,'home','Back Home must return home');
    await page.locator('#settingsToggle').click({timeout:10000});
    await page.waitForTimeout(350);
    const nav=await details('hamburger-click');
    assert.equal(nav.settingsOpen,true,'Mobile navigation drawer must open');
    await page.locator('#asteriaHandbookTop').click({timeout:10000});
    await page.waitForTimeout(200);
    const menu=await details('handbook-click');
    assert.equal(menu.megaMenuHidden,false,'Handbook mega-menu must open');
    const rules=page.locator('#aaaMegaCards button').filter({hasText:'Rules'}).first();
    await rules.click({timeout:10000});
    await page.waitForTimeout(700);
    const library=await details('handbook-rules-click');
    assert.notEqual(library.view,'home','Selecting a library card must leave Home');
    console.log('PASS: mobile guest Login, Back Home, hamburger, dropdown, and content navigation');
  }catch(error){await details('FAILED');console.error('MOBILE_NAV_SMOKE_FAILED:',error.stack||String(error));process.exitCode=1;}
  finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
