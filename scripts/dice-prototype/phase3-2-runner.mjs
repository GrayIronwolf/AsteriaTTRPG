import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const output=path.join(process.cwd(),'dice-phase3-2-evidence');
const checks=[],errors=[];
function log(name,okay,detail={}) {
  checks.push({name,okay,detail});
  console.log((okay?'PASS':'FAIL')+' | '+name+' | '+JSON.stringify(detail));
}
let server,browser;
try{
  server=await createServer({root:path.join(process.cwd(),'scripts','dice-prototype'),
    configFile:false,server:{host:'127.0.0.1',port:0},logLevel:'warn'});
  await server.listen();
  browser=await chromium.launch({channel:'chrome',headless:true,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage','--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1180,height:930}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/phase3-2.html');
  const preview=page.locator('.asteria-core-dice-preview-canvas canvas');
  await preview.waitFor({state:'visible',timeout:90000});
  const styles=await page.locator('select[aria-label="Core dice design"] option').count();
  log('All fourteen Asteria dice designs are selectable',styles===14,{styles});
  await page.waitForTimeout(1500);
  log('Real Three.js die preview mounts',
    await preview.count()===1 && await page.locator('.asteria-core-dice-preview p[role=status]').count()===0);
  await page.getByRole('combobox',{name:'Core dice design'}).selectOption('dice-emerald');
  await page.waitForTimeout(1000);
  log('Switching family recreates PBR preview without an error',
    await preview.count()===1&&await page.locator('.asteria-core-dice-preview p[role=status]').count()===0);
  await page.getByRole('combobox',{name:'Preview dice type'}).selectOption('d4');
  await page.waitForTimeout(800);
  log('d4 3D preview renders',await preview.count()===1&&
    await page.locator('.asteria-core-dice-preview p[role=status]').count()===0);
  await page.getByRole('combobox',{name:'Preview dice type'}).selectOption('d100');
  await page.waitForTimeout(900);
  log('d100 3D preview renders',await preview.count()===1&&
    await page.locator('.asteria-core-dice-preview p[role=status]').count()===0);
  await page.getByRole('combobox',{name:'Preview dice type'}).selectOption('d20');
  await page.locator('input[aria-label="Dice body colour"]').fill('#aabbcc');
  await page.waitForTimeout(750);
  await page.click('#server-roll');
  await page.waitForFunction(()=>document.querySelector('[data-roll-state=settled]'),
    null,{timeout:140000});
  const result=await page.locator('.asteria-advanced-dice-official strong').textContent();
  log('Custom PBR material roll preserves server-confirmed 25',result==='25',
    {result,serverCalls:await page.evaluate(()=>window.phase32Metrics.officialCalls)});
  await fs.mkdir(output,{recursive:true});
  await page.screenshot({path:path.join(output,'desktop.png')});
  await page.click('#resize');
  await page.waitForTimeout(700);
  const widths=await page.evaluate(()=>({
    panel:document.querySelector('#dice-workspace').getBoundingClientRect().width,
    content:document.querySelector('#dice-workspace').scrollWidth,
    preview:document.querySelector('.asteria-core-dice-preview-canvas').getBoundingClientRect().width
  }));
  log('Resized dashboard panel contains 3D picker',
    widths.content<=widths.panel+1&&widths.preview<=widths.panel+1,widths);
  await page.setViewportSize({width:390,height:820});
  await page.screenshot({path:path.join(output,'mobile.png')});
  const mobile=await page.evaluate(()=>({
    screen:window.innerWidth,content:document.documentElement.scrollWidth
  }));
  log('Mobile viewport has no horizontal overflow',mobile.content<=mobile.screen+1,mobile);
  log('No uncaught browser exceptions',errors.length===0,{errors});
}catch(e){checks.push({name:'Browser execution',okay:false,error:String(e)});
  console.error('FATAL '+String(e?.stack||e));
}finally{
  await browser?.close().catch(()=>{});
  await server?.close().catch(()=>{});
  await fs.mkdir(output,{recursive:true});
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(checks,null,2));
}
const failures=checks.filter(x=>!x.okay).length;
console.log('PHASE 3.2 BROWSER SUMMARY '+JSON.stringify({passed:checks.length-failures,failed:failures}));
if(failures)process.exitCode=1;
