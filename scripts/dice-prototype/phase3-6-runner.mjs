import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';

const output=path.join(process.cwd(),'dice-phase3-6-evidence');
const checks=[],errors=[];
function check(name,okay,detail={}){
  checks.push({name,okay,detail});
  console.log((okay?'PASS':'FAIL')+' | '+name+' | '+JSON.stringify(detail));
}
let server,browser;
try{
  server=await createServer({root:path.join(process.cwd(),'scripts','dice-prototype'),
    configFile:false,server:{host:'127.0.0.1',port:0},logLevel:'warn'});
  await server.listen();
  browser=await chromium.launch({channel:'chrome',headless:true,args:[
    '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage','--no-sandbox'
  ]});
  const page=await browser.newPage({viewport:{width:1200,height:950}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/phase3-6.html');
  await page.locator('.asteria-core-dice-preview-canvas canvas').waitFor({timeout:95000});
  await page.waitForFunction(()=>document.querySelector('[data-roll-state=ready]'),
    null,{timeout:95000});
  check('Basic mode is active and Advanced mode is available',
    await page.getByRole('tab',{name:'Basic'}).getAttribute('aria-selected')==='true'&&
    await page.getByRole('tab',{name:'Advanced'}).count()===1);
  check('All fourteen dice families are available in Basic',
    await page.locator('select[aria-label="Core dice design"] option').count()===14);
  await page.locator('input[aria-label="Dice body colour"]').fill('#AABBCC');
  check('Live appearance edits enable Undo without requesting a roll',
    await page.getByRole('button',{name:'Undo'}).isEnabled()&&
    await page.evaluate(()=>window.phase36Metrics.officialCalls)===0);
  await page.getByRole('button',{name:'Match tray colours to dice'}).click();
  await page.getByRole('button',{name:'Tray',exact:true}).click();
  check('Tray editor is shared and offers all six designs',
    await page.getByRole('group',{name:'Six dice tray designs'}).locator('button').count()===6);
  check('Basic tray mode hides advanced detailing but keeps size and colour',
    await page.getByRole('combobox',{name:'Wall height'}).count()===0&&
    await page.locator('input[aria-label="Frame colour custom colour"]').count()===1);
  await page.getByRole('button',{name:'Royal Court'}).click();
  await page.waitForFunction(()=>document.querySelector('.asteria-advanced-dice-scene')?.dataset.trayShape==='square',
    null,{timeout:12000});
  check('Named look changes both actual dice and physical tray',
    await page.getByRole('button',{name:'Royal Marble Square',exact:true}).getAttribute('aria-pressed')==='true'&&
    await page.locator('.asteria-advanced-dice-scene canvas').count()===1);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  check('Undo restores previous tray design',
    await page.getByRole('button',{name:'Obsidian Hexagon',exact:true}).getAttribute('aria-pressed')==='true');
  await page.getByRole('button',{name:'Redo',exact:true}).click();
  check('Redo restores matched look',
    await page.getByRole('button',{name:'Royal Marble Square',exact:true}).getAttribute('aria-pressed')==='true');
  await page.getByRole('tab',{name:'Advanced'}).click();
  check('Advanced tray controls activate real material and sound selectors',
    await page.getByRole('combobox',{name:'Wall height'}).count()===1&&
    await page.getByRole('combobox',{name:'Impact sound'}).count()===1);
  await page.getByRole('button',{name:'Dice',exact:true}).click();
  check('Advanced dice editor exposes mapped surface, pattern and override options',
    await page.getByRole('combobox',{name:'Core dice pattern'}).count()===1&&
    await page.getByRole('combobox',{name:'Override die type'}).count()===1);
  await page.getByRole('combobox',{name:'Core dice design'}).selectOption('dice-watcher');
  check('Watcher contextual eye controls open in the same Advanced editor',
    await page.getByRole('group',{name:'Watcher Dice customisation'}).count()===0&&
    await page.locator('[aria-label="Watcher Dice customisation"]').count()===1);
  await page.getByRole('combobox',{name:'Core dice design'}).selectOption('dice-familiar');
  check('Familiar contextual cat controls open in the same Advanced editor',
    await page.locator('[aria-label="Familiar Dice customisation"]').count()===1);
  await page.getByRole('combobox',{name:'Core dice design'}).selectOption('dice-ruby');
  await page.locator('.asteria-core-dice-preview-canvas').focus();
  await page.keyboard.press('ArrowLeft');
  check('Accessible preview supports keyboard orbit and camera reset',
    await page.getByRole('button',{name:'Reset dice preview camera'}).isEnabled());
  await page.getByRole('button',{name:'Reset dice preview camera'}).click();
  check('No preview or customisation action generated an official roll',
    await page.evaluate(()=>window.phase36Metrics.officialCalls)===0);
  await fs.mkdir(output,{recursive:true});
  await page.screenshot({path:path.join(output,'studio-desktop.png'),fullPage:true});
  await page.click('#resize');await page.waitForTimeout(500);
  const narrow=await page.evaluate(()=>({
    width:document.querySelector('#dice-workspace').clientWidth,
    scroll:document.querySelector('#dice-workspace').scrollWidth
  }));
  check('Resizable dashboard contains studio without horizontal overflow',
    narrow.scroll<=narrow.width+1,narrow);
  await page.setViewportSize({width:390,height:820});
  await page.screenshot({path:path.join(output,'studio-mobile.png'),fullPage:true});
  const mobile=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  check('Mobile viewport stays within its available width',mobile.scroll<=mobile.width+1,mobile);
  await page.click('#server-roll');
  await page.waitForFunction(()=>['settled','mismatch','unavailable'].includes(
    document.querySelector('[data-roll-state]')?.getAttribute('data-roll-state')),
    null,{timeout:140000});
  const value=await page.locator('.asteria-advanced-dice-official strong').textContent();
  const status=await page.locator('[data-roll-state]').getAttribute('data-roll-state');
  check('Authoritative Firebase-equivalent roll stays unchanged after customisations',
    status==='settled'&&value==='25'&&
    await page.evaluate(()=>window.phase36Metrics.officialCalls)===1,{status,value});
  check('No uncaught browser exceptions',errors.length===0,{errors});
}catch(error){
  console.error('FATAL '+String(error?.stack||error));
  checks.push({name:'Browser run',okay:false,error:String(error)});
}finally{
  await browser?.close().catch(()=>{});
  await server?.close().catch(()=>{});
  await fs.mkdir(output,{recursive:true});
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(checks,null,2));
}
const failed=checks.filter(x=>!x.okay).length;
console.log('PHASE 3.6 BROWSER SUMMARY '+JSON.stringify({passed:checks.length-failed,failed}));
if(failed)process.exitCode=1;
