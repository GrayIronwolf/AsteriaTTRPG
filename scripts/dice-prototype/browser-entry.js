import React from 'react';
import {createRoot} from 'react-dom/client';
import {DiceRoller} from 'open-dice-dnd';

let root=null,roller=null,lastCompletion=null;
const state={ready:false,error:null};
function DiceHost(){
  const container=React.useRef(null);
  React.useEffect(()=>{
    let r;
    try{
      r=new DiceRoller({container:container.current,pixelRatio:1,
        onRollComplete:(total,result)=>{lastCompletion={total,result};}});
      roller=r;
      state.ready=true;
    }catch(error){state.error=String(error);}
    return ()=>{
      state.ready=false;roller=null;
      if(r)r.destroy();
    };
  },[]);
  return React.createElement('div',{
    id:'dice-container',ref:container,
    style:{width:'100%',height:'min(470px,65vh)',position:'relative',overflow:'hidden',
      background:'#182534'}
  });
}
window.diceProbe={
  state,
  mount(){
    if(root)throw Error('Already mounted');
    state.ready=false;state.error=null;lastCompletion=null;
    root=createRoot(document.getElementById('app'));
    root.render(React.createElement(DiceHost));
  },
  unmount(){if(root){root.unmount();root=null;}},
  snapshot(){
    const tray=document.querySelector('#dice-container');
    const canvas=document.querySelector('#app canvas');
    return {ready:state.ready,error:state.error,
      canvasCount:document.querySelectorAll('#app canvas').length,
      canvasWidth:canvas?.getBoundingClientRect().width??null,
      trayWidth:tray?.getBoundingClientRect().width??null,
      gpu:roller?.getGpuInfo?.()??null,
      memoryBytes:performance.memory?.usedJSHeapSize??null};
  },
  setPixelRatio(x){return roller?.setPixelRatio?.(x);},
  async roll(config){
    if(!roller)throw Error('No active dice renderer');
    const gaps=[];let previous=0,raf=0,timer;
    const sample=now=>{
      if(previous)gaps.push(now-previous);
      previous=now;raf=requestAnimationFrame(sample);
    };
    raf=requestAnimationFrame(sample);
    const started=performance.now();
    try{
      const total=await Promise.race([
        roller.roll(config),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Dice roll did not settle within 120s')),120000);})
      ]);
      const elapsedMs=Math.round(performance.now()-started);
      const result=roller.getCurrentResults();
      return {total,result,callback:lastCompletion,elapsedMs,
        frameCount:gaps.length,slowFrames:gaps.filter(x=>x>33.4).length,
        maxFrameGapMs:Math.round(Math.max(0,...gaps))};
    }finally{clearTimeout(timer);cancelAnimationFrame(raf);}
  }
};
window.diceProbe.mount();
