import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const output=path.join(process.cwd(),'dice-phase3-7-evidence'),results=[],errors=[];
const check=(name,passed,details={})=>{
 results.push({name,passed,details});console.log((passed?'PASS':'FAIL')+' | '+name+' | '+JSON.stringify(details));
};
let server,browser;
try{
 server=await createServer({root:path.join(process.cwd(),'scripts','dice-prototype'),
  configFile:false,server:{host:'127.0.0.1',port:0},logLevel:'warn'});
 await server.listen();
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1100,height:880}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/phase3-7.html');
 await page.getByRole('heading',{name:'Saved appearance collections'}).waitFor();
 await page.getByRole('textbox',{name:'Collection name'}).fill('Royal Court');
 await page.getByRole('button',{name:'Save collection'}).click();
 await page.waitForFunction(()=>document.querySelector('#metrics')?.dataset.count==='1');
 check('Save creates account appearance collection',await page.locator('#metrics[data-count="1"]').count()===1);
 check('First saved collection becomes account default',await page.locator('#metrics[data-default=""]').count()===0);
 await page.getByRole('button',{name:'Assign selected collection'}).click();
 await page.waitForFunction(()=>document.querySelector('#metrics')?.dataset.assigned!=='');
 check('Character appearance assignment works',await page.locator('#metrics[data-assigned=""]').count()===0);
 await page.getByRole('button',{name:'Save As'}).click();
 await page.waitForFunction(()=>document.querySelector('#metrics')?.dataset.count==='2');
 await page.getByRole('button',{name:'Duplicate'}).click();
 await page.waitForFunction(()=>document.querySelector('#metrics')?.dataset.count==='3');
 check('Save As and Duplicate create separate saved collections',await page.locator('#metrics[data-count="3"]').count()===1);
 await page.getByRole('button',{name:'Load',exact:true}).click();
 check('Loading visual collection does not call official dice roll',
  await page.evaluate(()=>window.phase37Metrics.officialCalls)===0);
 await page.getByRole('button',{name:'Use account default'}).click();
 await page.waitForFunction(()=>document.querySelector('#metrics')?.dataset.assigned==='');
 check('Character assignment can be cleared',await page.locator('#metrics[data-assigned=""]').count()===1);
 await fs.mkdir(output,{recursive:true});
 await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:820});
 await page.screenshot({path:path.join(output,'mobile.png'),fullPage:true});
 const mobile=await page.evaluate(()=>({screen:innerWidth,content:document.documentElement.scrollWidth}));
 check('No mobile overflow',mobile.content<=mobile.screen+1,mobile);
 check('No browser exceptions',errors.length===0,{errors});
}catch(error){
 console.error('FATAL '+String(error?.stack||error));
 results.push({name:'Browser run',passed:false,error:String(error)});
}finally{
 await browser?.close().catch(()=>{});await server?.close().catch(()=>{});
 await fs.mkdir(output,{recursive:true});
 await fs.writeFile(path.join(output,'report.json'),JSON.stringify(results,null,2));
}
const failures=results.filter(x=>!x.passed).length;
console.log('PHASE 3.7 BROWSER SUMMARY '+JSON.stringify({passed:results.length-failures,failed:failures}));
if(failures)process.exitCode=1;
