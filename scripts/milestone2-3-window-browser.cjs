/* Real shared-canvas sizing acceptance; fixture-only, all external requests blocked. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
require('./local-static-server.js');
const base='http://127.0.0.1:8123/?reactFixture=1';
const geometry=locator=>locator.evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
const painted=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
 const results=[];
 const timeout=setTimeout(()=>{console.error('Canvas sizing browser acceptance timed out');browser.close().finally(()=>process.exit(1));},300000);
 for(const role of ['gm','player','combat'])for(const scale of [.5,.75,1]){
  console.log('START sizing',role,scale);
  const page=await browser.newPage({viewport:{width:1600,height:1100},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const scope=role==='player'?'asteria:player-main-canvas:v1:player-demo:demo-campaign:kael':
   role==='gm'?'asteria:gm-main-canvas:v1:player-demo:demo-campaign':
    'asteria:gm-combat-workspace:v1:player-demo:demo-campaign';
  const open=async()=>{
   await page.goto(base,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.AsteriaReactMigration?.available);
   if(role==='player')await page.evaluate(()=>window.AsteriaReactMigration.openCharacter('demo-campaign','kael'));
   else await page.evaluate(()=>window.AsteriaReactMigration.openGM('demo-campaign'));
   if(role==='combat')await page.getByRole('button',{name:'Combat Command Centre',exact:true}).click();
   await page.getByTestId(role==='player'?'site-player-main-canvas':role==='gm'?'site-gm-main-canvas':'site-gm-combat-command-centre').waitFor();
  };
  await open();
  const root=page.getByTestId(role==='player'?'site-player-main-canvas':role==='gm'?'site-gm-main-canvas':'site-gm-combat-command-centre');
  const id=role==='player'?'armour':role==='gm'?'combatOverview':'controls';
  const panel=root.locator('[data-canvas-window="'+id+'"]');
  // Centre the chosen saved rectangle without changing its layout geometry.
  const camera=await panel.evaluate((el,scale)=>{
   const viewport=el.closest('[data-layout-mode]'),width=viewport.clientWidth;
   const x=parseFloat(el.style.getPropertyValue('--combat-x'))*width/100;
   const y=parseFloat(el.style.getPropertyValue('--combat-y'))*width/100;
   const w=parseFloat(el.style.getPropertyValue('--combat-w'))*width/100;
   const h=parseFloat(el.style.getPropertyValue('--combat-h'))*width/100;
   return {scale,x:width/2-(x+w/2)*scale,y:(viewport.clientHeight-60)/2-(y+h/2)*scale};
  },scale);
  await page.addInitScript(({scope,camera})=>localStorage.setItem(scope+':camera',JSON.stringify(camera)),{scope,camera});
  await open();await painted(page);console.log('CENTRED',role,scale);
  assert.equal((await root.locator('output[aria-label="Canvas zoom"]').textContent()).trim(),Math.round(scale*100)+'%');
  const resize=async(edge,dx,dy)=>{
   // Select the window first when adjacent windows' outer grips overlap.
   const header=panel.locator('header').first(),h=await geometry(header);
   await page.mouse.click(h.x+Math.min(35,h.w/4),h.y+h.h/2);await painted(page);
   const handle=panel.locator('[data-resize-edge="'+edge+'"]'),r=await geometry(handle);
   assert.ok(r.w>=18&&r.h>=18,'corner grips remain usable at '+scale);
   await page.mouse.move(r.x+r.w/2,r.y+r.h/2);await page.mouse.down();
   await page.mouse.move(r.x+r.w/2+dx,r.y+r.h/2+dy,{steps:12});await page.mouse.up();
   await painted(page);
  };
  const original=await geometry(panel);console.log('RESIZE',role,scale);
  await resize('se',40,30);let rect=await geometry(panel);
  assert.ok(Math.abs(rect.w-original.w-40)<3&&Math.abs(rect.h-original.h-30)<3,'SE resize tracks the pointer at '+scale+' '+JSON.stringify({original,rect}));
  assert.ok(Math.abs(rect.x-original.x)<2&&Math.abs(rect.y-original.y)<2);
  await root.getByRole('button',{name:'Undo canvas change',exact:true}).click();await painted(page);
  await resize('nw',-40,-30);rect=await geometry(panel);
  assert.ok(Math.abs(rect.x+rect.w-original.x-original.w)<3,'NW holds the right edge');
  assert.ok(Math.abs(rect.y+rect.h-original.y-original.h)<3,'NW holds the bottom edge');
  await root.getByRole('button',{name:'Undo canvas change',exact:true}).click();await painted(page);
  if(scale===.5){
   const before=await panel.evaluate(el=>['--combat-x','--combat-y','--combat-w','--combat-h'].map(key=>el.style.getPropertyValue(key)));
   const header=await geometry(panel.locator('header').first());
   await page.mouse.click(header.x+35,header.y+header.h/2);await painted(page);
   const handle=await geometry(panel.locator('[data-resize-edge="se"]'));
   await page.mouse.move(handle.x+handle.w/2,handle.y+handle.h/2);await page.mouse.down();
   await page.mouse.move(handle.x+handle.w/2+20,handle.y+handle.h/2+20);await painted(page);
   await page.setViewportSize({width:1280,height:1100});await painted(page);await page.mouse.up();
   assert.equal(await root.locator('[data-layout-mode]').getAttribute('data-dragging-window'),null,
    'viewport changes must cancel a gesture measured at the previous width');
   assert.deepEqual(await panel.evaluate(el=>['--combat-x','--combat-y','--combat-w','--combat-h'].map(key=>el.style.getPropertyValue(key))),before);
   await page.setViewportSize({width:1600,height:1100});await painted(page);
  }
  console.log('MODES',role,scale);
  const options=panel.locator('summary');await options.click();
  const select=panel.locator('select[aria-label^="Content layout for"]');
  await select.selectOption('fixed');await options.click();await painted(page);
  const body=panel.locator('[data-combat-scroll]>div');
  await page.waitForFunction(id=>parseFloat(getComputedStyle(document.querySelector(
   '[data-canvas-window="'+id+'"] [data-combat-scroll]')).getPropertyValue('--combat-design-width'))>0,id);
  const fixedWidth=await body.evaluate(el=>parseFloat(getComputedStyle(el).width));
  for(const overflow of ['scroll','hidden','auto']){
   await panel.locator('[data-combat-scroll]').evaluate((el,value)=>{el.style.overflowY=value;},overflow);
   await painted(page);
   assert.ok(Math.abs((await body.evaluate(el=>parseFloat(getComputedStyle(el).width)))-fixedWidth)<2,
    'scrollbar changes do not alter the fixed design width');
  }
  await resize('se',40,30);
  const afterFixedWidth=await body.evaluate(el=>parseFloat(getComputedStyle(el).width));
  assert.ok(Math.abs(afterFixedWidth-fixedWidth)<2,'fixed content keeps its width while the window grows '+JSON.stringify({fixedWidth,afterFixedWidth,role,scale}));
  await options.click();await select.selectOption('proportional');await options.click();await painted(page);
  const fitted=await body.evaluate(el=>({body:el.getBoundingClientRect().width,viewport:el.parentElement.getBoundingClientRect().width}));
  assert.ok(fitted.body<=fitted.viewport+3,'proportional content fits its scroll viewport');
  await options.click();await select.selectOption('responsive');await options.click();await painted(page);
  assert.equal(await panel.getAttribute('data-content-sizing'),'responsive');
  assert.ok(await panel.locator('[data-combat-scroll]').evaluate(el=>getComputedStyle(el).overflowY==='auto'));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no page overflow');
  // Layout dimensions use world coordinates and survive viewport changes.
  const saved=await panel.evaluate(el=>['--combat-x','--combat-y','--combat-w','--combat-h'].map(key=>el.style.getPropertyValue(key)));
  console.log('VIEWPORTS',role,scale);
  for(const width of [1280,900,390,1600]){
   await page.setViewportSize({width,height:1100});await painted(page);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no overflow at '+width);
   assert.deepEqual(await panel.evaluate(el=>['--combat-x','--combat-y','--combat-w','--combat-h'].map(key=>el.style.getPropertyValue(key))),saved);
  }
  if(role==='combat'){
   await open();await painted(page);console.log('CENTRED',role,scale);
   assert.deepEqual(await panel.evaluate(el=>['--combat-x','--combat-y','--combat-w','--combat-h'].map(key=>el.style.getPropertyValue(key))),saved,'Combat layout reload');
   assert.equal(await panel.getAttribute('data-content-sizing'),'responsive');
  }
  assert.deepEqual(errors,[],'no browser runtime errors');
  results.push({role,zoom:scale,resize:true,contentModes:true,viewportRestoration:true});
  await page.close();console.log('PASS sizing',role,scale);
 }
 console.log('Milestone 2.3 browser sizing:',JSON.stringify(results));
 clearTimeout(timeout);await browser.close();process.exit(0);
})().catch(error=>{console.error(error);process.exit(1);});
