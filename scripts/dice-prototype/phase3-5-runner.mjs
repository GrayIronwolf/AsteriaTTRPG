import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';

const output=path.join(process.cwd(),'dice-phase3-5-evidence');
const results=[],errors=[];
const check=(name,passed,detail={})=>{
  results.push({name,passed,detail});
  console.log((passed?'PASS':'FAIL')+' | '+name+' | '+JSON.stringify(detail));
};
let server,browser;
try{
  server=await createServer({root:path.join(process.cwd(),'scripts','dice-prototype'),
    configFile:false,server:{host:'127.0.0.1',port:0},logLevel:'warn'});
  await server.listen();
  browser=await chromium.launch({channel:'chrome',headless:true,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage','--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1200,height:990}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/phase3-2.html');
  await page.waitForFunction(()=>document.querySelector('[data-roll-state=ready]'),null,{timeout:95000});
  check('3D physical Obsidian Hexagon replaces generic table',
    await page.locator('.asteria-advanced-dice-scene[data-tray-shape=hexagon] canvas').count()===1);
  await page.getByRole('button',{name:'Customise tray'}).click();
  check('Unified tray studio offers six design buttons',
    await page.getByRole('group',{name:'Six dice tray designs'}).locator('button').count()===6);
  check('Independent materials, colours, trim and sound controls available',
    await page.getByRole('combobox',{name:'Frame material'}).count()===1&&
    await page.getByRole('combobox',{name:'Interior material'}).count()===1&&
    await page.getByRole('combobox',{name:'Impact sound'}).count()===1&&
    await page.getByRole('group',{name:'Metallic trim presets'}).locator('button').count()===16);
  for(const [name,shape] of [
    ["Walnut Octagon",'octagon'],
    ["Knight's Iron Tray",'rectangle'],
    ["Arcane Circle",'circle'],
    ["Royal Marble Square",'square'],
    ["Hunter's Leather Oval",'oval'],
    ["Obsidian Hexagon",'hexagon']
  ]){
    await page.getByRole('button',{name,exact:true}).click();
    await page.waitForFunction(x=>document.querySelector('.asteria-advanced-dice-scene')?.dataset.trayShape===x,
      shape,{timeout:11000});
    check('Shape '+shape+' rebuilds actual 3D collision tray',
      await page.locator('.asteria-advanced-dice-scene[data-tray-shape='+shape+'] canvas').count()===1);
  }
  await page.getByRole('combobox',{name:'Frame material'}).selectOption('gold');
  await page.getByRole('combobox',{name:'Interior material'}).selectOption('leather');
  await page.getByRole('combobox',{name:'Wall height'}).selectOption('high');
  await page.getByRole('combobox',{name:'Impact sound'}).selectOption('off');
  await page.getByRole('combobox',{name:'Lighting'}).selectOption('medium');
  await page.getByRole('button',{name:'Interior colour #AE3241'}).click();
  check('Studio edits affect the same live tray without a Firebase roll',
    await page.getByRole('combobox',{name:'Interior material'}).inputValue()==='leather'&&
    await page.locator('.asteria-advanced-dice-scene canvas').count()===1&&
    await page.evaluate(()=>window.phase32Metrics.officialCalls)===0);
  await page.getByRole('button',{name:'Close tray studio'}).click();
  await page.click('#server-roll');
  await page.waitForFunction(()=>['settled','mismatch','unavailable'].includes(
    document.querySelector('[data-roll-state]')?.getAttribute('data-roll-state')),null,{timeout:140000});
  const value=await page.locator('.asteria-advanced-dice-official strong').textContent();
  const state=await page.locator('[data-roll-state]').getAttribute('data-roll-state');
  check('3D tray walls settle authoritative d20 without mismatch',
    state==='settled'&&value==='25'&&await page.evaluate(()=>window.phase32Metrics.officialCalls)===1,{state,value});
  await fs.mkdir(output,{recursive:true});
  await page.screenshot({path:path.join(output,'tray-obsidian-desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'Customise tray'}).click();
  await page.getByRole('combobox',{name:'Dice tray size'}).first().selectOption('compact');
  await page.waitForTimeout(250);
  const compact=await page.locator('.asteria-advanced-dice-stage').evaluate(x=>x.clientHeight);
  await page.getByRole('combobox',{name:'Dice tray size'}).first().selectOption('expanded');
  await page.waitForTimeout(250);
  const expanded=await page.locator('.asteria-advanced-dice-stage').evaluate(x=>x.clientHeight);
  check('Existing compact and expanded stage sizes retained',expanded>compact+80,{compact,expanded});
  await page.click('#resize');await page.waitForTimeout(400);
  const narrow=await page.evaluate(()=>{
    const panel=document.querySelector('#dice-workspace');
    return {width:panel.clientWidth,scroll:panel.scrollWidth};
  });
  check('3D tray editor fits resized dashboard window',narrow.scroll<=narrow.width+1,narrow);
  await page.setViewportSize({width:390,height:820});
  await page.screenshot({path:path.join(output,'tray-mobile.png'),fullPage:true});
  const mobile=await page.evaluate(()=>({screen:innerWidth,width:document.documentElement.scrollWidth}));
  check('Tray studio has no mobile horizontal overflow',mobile.width<=mobile.screen+1,mobile);
  check('No browser errors',errors.length===0,{errors});
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
console.log('PHASE 3.5 BROWSER SUMMARY '+JSON.stringify({passed:results.length-failed,failed}));
if(failed)process.exitCode=1;
