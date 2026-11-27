import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const out=path.join(process.cwd(),'dice-phase3-10-stress-evidence');
let server,browser,report=null,errors=[];
try{
 server=await createServer({root:path.join(process.cwd(),'scripts','dice-prototype'),
  configFile:false,server:{host:'127.0.0.1',port:0},logLevel:'warn'});
 await server.listen();
 browser=await chromium.launch({channel:'chrome',headless:true,args:[
  '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
  '--disable-dev-shm-usage','--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1050,height:800}});
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',msg=>{if(msg.type()==='error')console.error('CHROME '+msg.text().slice(0,400));});
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/phase3-10-stress.html');
 await page.waitForFunction(()=>typeof window.runAsteriaPhysicalStress==='function',null,{timeout:120000});
 page.setDefaultTimeout(3000000);
 report=await page.evaluate(async()=>{
  const result=await window.runAsteriaPhysicalStress(status=>{
   document.getElementById('status').textContent=
    status.executed+' / 112; passed '+status.passed+', failed '+status.failed;
  });
  return result;
 });
 await fs.mkdir(out,{recursive:true});
 await page.screenshot({path:path.join(out,'final-physics-stress.png'),fullPage:true});
 report.browserErrors=errors;
 report.pass=report.executed===112&&report.passed===112&&
  report.failed===0&&report.cleaned&&errors.length===0&&
  report.configurations.length===18;
 console.log('PHASE 3.10 REAL PHYSICS STRESS '+JSON.stringify({
  executed:report.executed,passed:report.passed,failed:report.failed,
  configurations:report.configurations.length,cleaned:report.cleaned,
  durationSeconds:Math.round(report.elapsedMs/1000),pass:report.pass}));
 for(const failure of report.checks.filter(x=>!x.pass).slice(0,30))
  console.error('PHYSICAL FAIL '+JSON.stringify(failure));
}catch(error){
 report={pass:false,executed:report?.executed||0,error:String(error?.stack||error)};
 console.error('FATAL PHYSICS STRESS '+report.error);
}finally{
 await browser?.close().catch(()=>{});await server?.close().catch(()=>{});
 await fs.mkdir(out,{recursive:true});
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
}
if(!report?.pass)process.exitCode=1;
