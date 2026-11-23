import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';

const output=path.join(process.cwd(),'dice-phase3-3-evidence');
const results=[],errors=[];
const check=(name,passed,details={})=>{
  results.push({name,passed,details});
  console.log((passed?'PASS':'FAIL')+' | '+name+' | '+JSON.stringify(details));
};
let server,browser;
try{
  server=await createServer({root:path.join(process.cwd(),'scripts','dice-prototype'),
    configFile:false,server:{host:'127.0.0.1',port:0},logLevel:'warn'});
  await server.listen();
  browser=await chromium.launch({channel:'chrome',headless:true,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage','--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1200,height:1000}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/phase3-2.html');
  await page.getByRole('combobox',{name:'Core dice design'}).selectOption('dice-familiar');
  const canvas=page.locator('.asteria-core-dice-preview-canvas canvas');
  await canvas.waitFor({state:'visible',timeout:100000});
  await page.waitForTimeout(1200);
  check('Familiar Dice has a real WebGL preview and no fallback error',
    await canvas.count()===1&&await page.locator('.asteria-core-dice-preview p[role=status]').count()===0);
  check('Twelve core designs and Familiar coexist in one selector',
    await page.getByRole('combobox',{name:'Core dice design'}).locator('option').count()===13);
  check('Eight coat patterns and eight cat poses selectable',
    await page.getByRole('combobox',{name:'Cat coat pattern'}).locator('option').count()===8&&
    await page.getByRole('combobox',{name:'Cat pose'}).locator('option').count()===8);
  check('Coat, eye, paw and numeral colour pickers available',
    (await page.getByRole('group',{name:'Cat coat swatches'}).locator('button').count())===12&&
    (await page.getByRole('group',{name:'Cat eyes swatches'}).locator('button').count())===8&&
    (await page.getByRole('group',{name:'Paw prints swatches'}).locator('button').count())===12&&
    (await page.getByRole('group',{name:'Familiar numerals swatches'}).locator('button').count())===12);
  await page.getByRole('combobox',{name:'Cat coat pattern'}).selectOption('calico');
  await page.getByRole('combobox',{name:'Cat pose'}).selectOption('pouncing');
  await page.getByRole('combobox',{name:'Familiar resin transparency'}).selectOption('translucent');
  await page.getByRole('combobox',{name:'Familiar decorative motif'}).selectOption('moon');
  await page.getByRole('button',{name:'Cat eyes #247858'}).click();
  await page.waitForTimeout(650);
  check('Changing pose, markings, resin and eyes recreates a readable 3D model',
    await canvas.count()===1&&await page.locator('.asteria-core-dice-preview p[role=status]').count()===0);
  await page.getByRole('combobox',{name:'Preview dice type'}).selectOption('d100');
  await page.waitForTimeout(550);
  check('Familiar d100 geometry displays in real 3D',
    await canvas.count()===1&&await page.locator('.asteria-core-dice-preview p[role=status]').count()===0);
  await page.getByRole('combobox',{name:'Preview dice type'}).selectOption('d20');
  await page.getByRole('checkbox',{name:'Animate Familiar Dice shimmer'}).check();
  check('Shimmer opt-in toggles visual preview without rolling',
    await page.locator('.asteria-core-dice-preview[data-familiar-shimmer=true]').count()===1&&
    (await page.evaluate(()=>window.phase32Metrics.officialCalls))===0);
  await page.emulateMedia({reducedMotion:'reduce'});
  const animation=await page.locator('.asteria-core-dice-preview-canvas').evaluate(node=>
    getComputedStyle(node,'::after').animationName);
  check('Reduced-motion preference disables shimmer',animation==='none',{animation});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.click('#server-roll');
  await page.waitForFunction(()=>document.querySelector('[data-roll-state=settled]'),
    null,{timeout:140000});
  const total=await page.locator('.asteria-advanced-dice-official strong').textContent();
  check('Familiar 3D roll preserves official server total and history',
    total==='25'&&(await page.evaluate(()=>window.phase32Metrics.officialCalls))===1,{total});
  await fs.mkdir(output,{recursive:true});
  await page.screenshot({path:path.join(output,'familiar-desktop.png'),fullPage:true});
  await page.click('#resize');
  await page.waitForTimeout(500);
  const narrow=await page.evaluate(()=>{
    const box=document.querySelector('#dice-workspace');
    return {width:box.getBoundingClientRect().width,scrollWidth:box.scrollWidth};
  });
  check('Familiar editor fits resized dashboard canvas',
    narrow.scrollWidth<=narrow.width+1,narrow);
  await page.setViewportSize({width:390,height:820});
  await page.screenshot({path:path.join(output,'familiar-mobile.png'),fullPage:true});
  const mobile=await page.evaluate(()=>({width:innerWidth,content:document.documentElement.scrollWidth}));
  check('Familiar editor has no horizontal overflow on mobile',
    mobile.content<=mobile.width+1,mobile);
  check('No uncaught browser errors',errors.length===0,{errors});
}catch(error){
  console.error('FATAL '+String(error?.stack||error));
  results.push({name:'Browser run',passed:false,error:String(error)});
}finally{
  await browser?.close().catch(()=>{});
  await server?.close().catch(()=>{});
  await fs.mkdir(output,{recursive:true});
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(results,null,2));
}
const failed=results.filter(x=>!x.passed).length;
console.log('PHASE 3.3 BROWSER SUMMARY '+JSON.stringify({passed:results.length-failed,failed}));
if(failed)process.exitCode=1;
