import {DiceRoller} from 'open-dice-dnd';
import {attachDiceTray} from '../../src/dice/diceTrayScene.mjs';
import {attachDiceTower} from '../../src/dice/diceTowerScene.mjs';
import {defaultDiceTrayAppearance} from '../../src/dice/diceTrayCatalogue.mjs';
import {defaultDiceTowerAppearance,TOWER_FAMILIES}
 from '../../src/dice/diceTowerCatalogue.mjs';
import {inspectDiceTowerRecording} from '../../src/dice/diceTowerLayout.mjs';

window.runAsteriaPhysicalStress=async onStep=>{
 const output={version:1,type:'real-cannon-physics',requested:112,
  executed:0,passed:0,failed:0,peakBodyCount:0,configurations:[],
  checks:[],startedAt:Date.now()};
 const root=document.getElementById('stress-scene');
 root.textContent='';
 const engine=new DiceRoller({container:root,pixelRatio:.75,powerPreference:'low-power'});
 const variations=['standard','detailed','grand'],sides=[4,6,8,10,12,20,100];
 let tray=null,tower=null;
 try{
  for(let i=0;i<112;i++){
   const family=TOWER_FAMILIES[i%TOWER_FAMILIES.length];
   const variation=variations[Math.floor(i/TOWER_FAMILIES.length)%variations.length];
   const die=sides[i%sides.length];
   const target=i%17===0?1:i%19===0?die:(i*13)%die+1;
   const config={...defaultDiceTowerAppearance(family.id),variation,
    quality:'performance'};
   if(tower)tower.dispose();
   if(tray)tray.dispose();
   tray=attachDiceTray(engine,defaultDiceTrayAppearance(config.pairedTray));
   tower=attachDiceTower(engine,tray.outline,config);
   const before=engine.world.bodies.length;
   let result;
   try{
    const predicted=await engine._predict([{dice:'d'+die,rolled:target}]);
    const observed=inspectDiceTowerRecording(tower.layout,predicted.recording);
    const expectedBodies=die===100?2:1;
    const bodyCount=engine.world.bodies.length;
    const pass=Boolean(observed?.exitComplete&&
      observed.diceCount===expectedBodies&&
      predicted.recording.steps>=60&&
      predicted.recording.states?.length>=
        predicted.recording.steps*predicted.recording.bodies*14&&
      before===bodyCount);
    result={index:i+1,tower:family.id,variation,die,
      target,steps:predicted.recording.steps,
      dice:observed?.diceCount,exitComplete:observed?.exitComplete,
      candidateAttempts:tower.getAttempts(),bodyCount,before,pass};
   }catch(error){
    result={index:i+1,tower:family.id,variation,die,target,
      pass:false,error:String(error?.message||error).slice(0,250)};
   }
   output.checks.push(result);
   output.executed++;output[result.pass?'passed':'failed']++;
   output.peakBodyCount=Math.max(output.peakBodyCount,engine.world.bodies.length);
   const key=family.id+':'+variation;
   if(!output.configurations.includes(key))output.configurations.push(key);
   onStep?.({executed:output.executed,passed:output.passed,
    failed:output.failed,last:result});
   // Yield between long worker calls for the browser's UI/GC.
   if(i%8===7)await new Promise(resolve=>setTimeout(resolve,20));
  }
 }finally{
  tower?.dispose();tray?.dispose();
  engine.destroy();
  output.completedAt=Date.now();
  output.elapsedMs=output.completedAt-output.startedAt;
  output.cleaned=root.querySelectorAll('canvas').length===0;
 }
 return output;
};
document.getElementById('status').textContent='Ready for 112 physical Cannon predictions';
