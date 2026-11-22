// Isolated Open Dice 3D prototype QA. Not imported by the Asteria app.
import fs from 'node:fs/promises';
import path from 'node:path';
import {build,createServer} from 'vite';
import {chromium} from 'playwright';
import {diceResult} from '../../src/state/diceRollModel.mjs';

const repo=process.cwd();
const root=path.join(repo,'scripts','dice-prototype');
const evidence=path.join(repo,'dice-prototype-evidence');
const report={date:new Date().toISOString(),package:'open-dice-dnd@1.13.0',
  branch:process.env.GITHUB_REF_NAME||'local',checks:[],notes:[]};
function log(name,condition,details={}){
  report.checks.push({name,status:condition?'PASS':'FAIL',details});
  console.log((condition?'PASS':'FAIL')+' | '+name+' | '+JSON.stringify(details));
}
let server,browser;
try{
  for(const sides of [4,6,8,10,12,20,100]){
    const row=diceResult({pool:[{count:1,sides}],modifier:5,label:''},
      ()=>sides,Date.now(),'prototype-'+sides);
    log('Asteria server result d'+sides,row.total===sides+5,
      {face:row.results[0].faces[0],total:row.total});
  }
  await build({root,configFile:false,
    build:{outDir:path.join(evidence,'vite-dist'),emptyOutDir:true},logLevel:'warn'});
  log('React 18 + Vite 5 Open Dice bundle',true);
  server=await createServer({root,configFile:false,
    server:{host:'127.0.0.1',port:0},logLevel:'warn'});
  await server.listen();
  const url='http://127.0.0.1:'+server.httpServer.address().port+'/';
  browser=await chromium.launch({channel:'chrome',headless:true,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage','--no-sandbox','--enable-precise-memory-info']});
  const ctx=await browser.newContext({viewport:{width:1200,height:760}});
  const page=await ctx.newPage();
  const browserErrors=[];
  page.on('pageerror',e=>browserErrors.push(e.message));
  page.setDefaultTimeout(150000);
  await page.goto(url,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.diceProbe?.state.ready||window.diceProbe?.state.error);
  const init=await page.evaluate(()=>window.diceProbe.snapshot());
  report.desktop=init;
  log('WebGL mounts inside React',init.ready && init.canvasCount===1,init);
  if(!init.ready)throw Error('Dice renderer unavailable: '+init.error);
  const cases=[
    {name:'seven polyhedral dice',dice:[['d4',4],['d6',6],['d8',8],['d10',7],['d12',12],['d20',17],['d100',42]]},
    {name:'natural 20',dice:[['d20',20]]},
    {name:'natural 1',dice:[['d20',1]]},
    {name:'five d6',dice:[['d6',1],['d6',2],['d6',3],['d6',4],['d6',5]]},
    {name:'custom body and numeral colors',dice:[['d20',15]],colors:true},
    {name:'40 dice stress',dice:Array.from({length:40},(_,i)=>['d6',i%6+1])}
  ];
  for(const item of cases){
    try{
      const config=item.dice.map(([dice,rolled])=>({dice,rolled,
        ...(item.colors?{diceColor:0x273d59,textColor:'#f4e6c2',
          backgroundColor:'#111a28'}:{})}));
      const observed=await page.evaluate(value=>window.diceProbe.roll(value),config);
      const expected=item.dice.reduce((sum,row)=>sum+row[1],0);
      const values=observed.result?.results?.map(x=>x.value)||[];
      const ok=observed.total===expected && observed.result?.total===expected &&
        values.length===item.dice.length &&
        values.every((v,i)=>v===item.dice[i][1]);
      log(item.name,ok,{expected,total:observed.total,values,
        elapsedMs:observed.elapsedMs,frameCount:observed.frameCount,
        slowFrames:observed.slowFrames,maxFrameGapMs:observed.maxFrameGapMs,
        visibleVariances:observed.result?.variances?.length??null});
      if(item.name==='seven polyhedral dice'){
        await fs.mkdir(evidence,{recursive:true});
        await page.screenshot({path:path.join(evidence,'desktop.png')});
      }
    }catch(error){log(item.name,false,{error:String(error)});}
  }
  for(const die of ['d10','d100']){
    try{
      const outcome=await page.evaluate(value=>window.diceProbe.roll([value]),
        {dice:die,rolled:0});
      log(die+' zero-based API',outcome.total===0 &&
        outcome.result?.results?.[0]?.value===0,
        {total:outcome.total,value:outcome.result?.results?.[0]?.value,
          conversionRequiredForAsteria:true});
    }catch(error){log(die+' zero-based API',false,{error:String(error)});}
  }
  const ratio=await page.evaluate(()=>window.diceProbe.setPixelRatio(0.75));
  log('Adaptive pixel ratio function',Number(ratio)>0&&Number(ratio)<=1,{returned:ratio});
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(500);
  const mobile=await page.evaluate(()=>window.diceProbe.snapshot());
  report.mobile=mobile;
  log('Mobile 390px canvas fits',mobile.canvasCount===1&&
    Number.isFinite(mobile.canvasWidth)&&mobile.canvasWidth<=390&&mobile.canvasWidth>0,mobile);
  try{
    const m=await page.evaluate(()=>window.diceProbe.roll([{dice:'d20',rolled:13}]));
    log('Mobile d20 roll',m.total===13&&m.result?.results?.[0]?.value===13,
      {total:m.total,elapsedMs:m.elapsedMs,visibleVariances:m.result?.variances?.length??null});
    await page.screenshot({path:path.join(evidence,'mobile.png')});
  }catch(error){log('Mobile d20 roll',false,{error:String(error)});}
  await page.evaluate(()=>window.diceProbe.unmount());
  const after=await page.evaluate(()=>window.diceProbe.snapshot());
  log('destroy() releases canvas',after.canvasCount===0&&!after.ready,after);
  for(let i=0;i<3;i++){
    await page.evaluate(()=>window.diceProbe.mount());
    await page.waitForFunction(()=>window.diceProbe?.state.ready||window.diceProbe?.state.error);
    await page.evaluate(()=>window.diceProbe.unmount());
  }
  const end=await page.evaluate(()=>window.diceProbe.snapshot());
  log('Repeat mount/unmount without stray canvas',end.canvasCount===0&&!end.error,end);
  log('No uncaught browser exceptions',browserErrors.length===0,
    {errors:browserErrors.slice(0,10)});
  await ctx.close();
}catch(error){
  report.fatal=String(error?.stack||error);
  console.error('FATAL '+report.fatal);
}finally{
  if(browser)await browser.close().catch(()=>{});
  if(server)await server.close().catch(()=>{});
  await fs.mkdir(evidence,{recursive:true});
  report.notes.push('Headless Linux/SwiftShader performance is not equivalent to real mobile GPU performance.');
  report.notes.push('Backend authority tested using existing Asteria diceResult model; no Firebase writes performed.');
  report.notes.push('Touch drag gestures, face text legibility and long-session memory require physical-device QA.');
  await fs.writeFile(path.join(evidence,'report.json'),JSON.stringify(report,null,2));
}
const failures=report.checks.filter(x=>x.status==='FAIL').length;
console.log('PROTOTYPE SUMMARY '+JSON.stringify({passed:report.checks.length-failures,
  failed:failures,fatal:report.fatal||null}));
if(failures||report.fatal)process.exitCode=1;
