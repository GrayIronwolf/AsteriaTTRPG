import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';

const output=path.join(process.cwd(),'dice-phase3-4-evidence');
const results=[],errors=[];
function check(name,passed,detail={}){
  results.push({name,passed,detail});
  console.log((passed?'PASS':'FAIL')+' | '+name+' | '+JSON.stringify(detail));
}
let server,browser;
try{
  server=await createServer({root:path.join(process.cwd(),'scripts','dice-prototype'),
    configFile:false,server:{host:'127.0.0.1',port:0},logLevel:'warn'});
  await server.listen();
  browser=await chromium.launch({channel:'chrome',headless:true,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage','--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1140,height:960}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/phase3-2.html');
  await page.getByRole('combobox',{name:'Core dice design'}).selectOption('dice-watcher');
  await page.waitForFunction(()=>document.querySelector(
    '.asteria-core-dice-preview-canvas[data-eye-ready=true]'),null,{timeout:110000});
  const canvas=page.locator('.asteria-core-dice-preview-canvas canvas');
  check('Watcher renders a true THREE eye inside a PBR gel dice',
    await canvas.count()===1&&
    await page.locator('.asteria-core-dice-preview-canvas[data-eye-ready=true]').count()===1&&
    await page.locator('.asteria-core-dice-preview p[role=status]').count()===0);
  check('All fourteen dice designs offered',
    await page.getByRole('combobox',{name:'Core dice design'}).locator('option').count()===14);
  check('Six eye types and five pupil shapes are editable',
    await page.getByRole('combobox',{name:'Eye type'}).locator('option').count()===6&&
    await page.getByRole('combobox',{name:'Pupil shape'}).locator('option').count()===5);
  check('Custom iris, sclera and resin colours are available',
    await page.getByRole('group',{name:'Iris swatches'}).locator('button').count()===12&&
    await page.getByRole('group',{name:'Sclera swatches'}).locator('button').count()===6&&
    await page.getByRole('group',{name:'Resin swatches'}).locator('button').count()===16);
  await page.getByRole('combobox',{name:'Eye type'}).selectOption('dragon');
  await page.getByRole('combobox',{name:'Pupil shape'}).selectOption('horizontal-slit');
  await page.getByRole('combobox',{name:'Internal swirl'}).selectOption('nebula');
  await page.getByRole('combobox',{name:'Resin transparency'}).selectOption('clear');
  await page.getByRole('combobox',{name:'Blinking'}).selectOption('frequent');
  await page.getByRole('combobox',{name:'Eye movement'}).selectOption('normal');
  await page.getByRole('checkbox',{name:'Eye follows pointer'}).check();
  await page.getByRole('button',{name:'Iris #247858'}).click();
  await page.waitForFunction(()=>document.querySelector('.asteria-core-dice-preview-canvas[data-eye-ready=true]'),
    null,{timeout:60000});
  check('Eye, pupil, iris, resin and movement edits recreate the 3D eye',
    await page.locator('.asteria-core-dice-preview-canvas[data-eye-ready=true]').count()===1&&
    await page.locator('.asteria-core-dice-preview p[role=status]').count()===0);
  await page.getByRole('combobox',{name:'Preview dice type'}).selectOption('d4');
  await page.waitForFunction(()=>document.querySelector('.asteria-core-dice-preview-canvas[data-eye-ready=true]'),
    null,{timeout:65000});
  check('Watcher d4 remains a real 3D preview',
    await page.locator('.asteria-core-dice-preview-canvas[data-eye-ready=true]').count()===1);
  await page.getByRole('combobox',{name:'Preview dice type'}).selectOption('d100');
  await page.waitForFunction(()=>document.querySelector('.asteria-core-dice-preview-canvas[data-eye-ready=true]'),
    null,{timeout:65000});
  check('Watcher d100 remains a real 3D preview',
    await page.locator('.asteria-core-dice-preview-canvas[data-eye-ready=true]').count()===1);
  await page.getByRole('combobox',{name:'Preview dice type'}).selectOption('d20');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForTimeout(300);
  check('Reduced-motion retains the eye without browser failure',
    await page.locator('.asteria-core-dice-preview p[role=status]').count()===0);
  await page.emulateMedia({reducedMotion:'no-preference'});
  check('Appearance editor sends no official roll while previewing',
    (await page.evaluate(()=>window.phase32Metrics.officialCalls))===0);
  await page.click('#server-roll');
  await page.waitForFunction(()=>document.querySelector('[data-roll-state=settled]'),
    null,{timeout:140000});
  const total=await page.locator('.asteria-advanced-dice-official strong').textContent();
  check('Animated Watcher roll preserves the server-confirmed 25',
    total==='25'&&(await page.evaluate(()=>window.phase32Metrics.officialCalls))===1,{total});
  await fs.mkdir(output,{recursive:true});
  await page.screenshot({path:path.join(output,'watcher-desktop.png'),fullPage:true});
  await page.click('#resize');
  await page.waitForTimeout(400);
  const narrow=await page.evaluate(()=>{
    const box=document.querySelector('#dice-workspace');
    return {width:box.getBoundingClientRect().width,scrollWidth:box.scrollWidth};
  });
  check('Watcher controls fit resized dashboard canvas',
    narrow.scrollWidth<=narrow.width+1,narrow);
  await page.setViewportSize({width:390,height:820});
  await page.screenshot({path:path.join(output,'watcher-mobile.png'),fullPage:true});
  const mobile=await page.evaluate(()=>({screen:innerWidth,content:document.documentElement.scrollWidth}));
  check('Watcher fits 390px mobile viewport',mobile.content<=mobile.screen+1,mobile);
  check('No uncaught browser exceptions',errors.length===0,{errors});
}catch(e){
  console.error('FATAL '+String(e?.stack||e));
  results.push({name:'Browser execution',passed:false,error:String(e)});
}finally{
  await browser?.close().catch(()=>{});
  await server?.close().catch(()=>{});
  await fs.mkdir(output,{recursive:true});
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(results,null,2));
}
const failed=results.filter(x=>!x.passed).length;
console.log('PHASE 3.4 BROWSER SUMMARY '+JSON.stringify({passed:results.length-failed,failed}));
if(failed)process.exitCode=1;
