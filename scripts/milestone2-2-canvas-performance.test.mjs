import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import React from 'react';
import {act,create} from 'react-test-renderer';
import {defaultCombatWorkspaceLayout,combatWindowAlignment} from '../src/dashboards/combat/combatWorkspaceLayoutModel.mjs';
import {GM_DASHBOARD_CANVAS_CONFIG,PLAYER_DASHBOARD_CANVAS_CONFIG} from '../src/state/dashboardLayoutModel.mjs';

// Execute the real JSX handlers with controlled animation frames and host nodes.
// No browser, Firebase account, timers or production test hooks are required.
const compiled=await build({entryPoints:['src/dashboards/combat/CombatCommandCentre.jsx'],
 bundle:true,write:false,platform:'node',format:'cjs',external:['react'],
 plugins:[{name:'test-css',setup(builder){builder.onLoad({filter:/\.css$/},()=>({
  contents:'export default new Proxy({}, {get:(_,key)=>key});',loader:'js'}));}}]});
const module={exports:{}};
new Function('require','module','exports',compiled.outputFiles[0].text)(
 createRequire(import.meta.url),module,module.exports);
const {CombatCommandCentre,CombatCommandPanel}=module.exports;

function fixture(config=null,preferences={},options={}){
 const globals=['window','document','localStorage','requestAnimationFrame','cancelAnimationFrame'];
 const original=Object.fromEntries(globals.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const frames=new Map(),listeners=new Map(),storage=new Map();let nextFrame=0;
 const saves=[];let commits=0;
 const layout={...defaultCombatWorkspaceLayout(config||undefined),...preferences};
 const ids=(config?.ids||Object.keys(layout.freeform.positions)).filter(id=>!layout.hidden.includes(id));
 const id=ids[0];
 // The test canvas is 1000px wide, so one world unit is one CSS pixel at 100%.
 const style=()=>({setProperty(key,value){this[key]=value;}});
 const classes=()=>new Set();
 const nodes=Object.fromEntries(ids.map(key=>{const list=classes();return [key,{
  style:style(),classList:{add:name=>list.add(name),remove:name=>list.delete(name),contains:name=>list.has(name)}
 }];}));
 const overlay={children:['x','y'].map(axis=>({dataset:{axis},hidden:true,style:style()}))};
 const viewport={clientWidth:1000,clientHeight:800,style:style(),dataset:{},
  classList:{add(){},remove(){}},
  getBoundingClientRect:()=>({left:0,top:0}),
  setPointerCapture(){},releasePointerCapture(){},closest:()=>null,
  querySelector:selector=>nodes[selector.match(/="([^"]+)"/)?.[1]],
  addEventListener:(type,handler)=>listeners.set(type,handler),
  removeEventListener:(type,handler)=>{if(listeners.get(type)===handler)listeners.delete(type);}};
 const stage={style:style(),classList:{add(){},remove(){}}};
 const host={clientWidth:1000,closest:()=>null};
 const noop=()=>{};
 globalThis.window={addEventListener:noop,removeEventListener:noop,matchMedia:()=>({matches:false})};
 globalThis.document={addEventListener:noop,removeEventListener:noop};
 globalThis.localStorage={getItem:key=>key.endsWith(':camera')?JSON.stringify({x:0,y:0,scale:options.scale||1}):JSON.stringify(layout),
  setItem:(key,value)=>{storage.set(key,value);
   // Camera persistence is independent of the layout save under test. Its
   // debounce may fire during a slow CI run without creating a layout edit.
   if(!key.endsWith(':camera'))saves.push(JSON.parse(value));}};
 globalThis.requestAnimationFrame=callback=>{frames.set(++nextFrame,callback);return nextFrame;};
 globalThis.cancelAnimationFrame=key=>frames.delete(key);
 let renderer;
 act(()=>{renderer=create(React.createElement(React.Profiler,{id:'canvas',onRender:()=>commits++},
  React.createElement(CombatCommandCentre,{uid:'perf-user',campaignId:'perf-campaign',
   canvasScopeId:'perf-character',canvasConfig:config,layoutValue:config?layout:null,
   onSaveLayout:value=>{saves.push(value);return {ok:true};}},
   ids.map(key=>React.createElement(CombatCommandPanel,{id:key,key},React.createElement('p',null,key))))),
  {createNodeMock:element=>element.props.className==='canvas'?viewport:
   element.props.className==='centre'?host:element.props['data-stage']?stage:
   element.props.className==='alignmentOverlay'?overlay:element.props['data-combat-panel']?
   nodes[element.props['data-combat-panel']]:{}});});
 const canvas=()=>renderer.root.findByProps({'aria-label':config?.kind==='player'?
  'Player dashboard freeform canvas':config?'GM dashboard freeform canvas':'Combat freeform canvas'});
 const event=(type,x=100,y=100)=>({type,clientX:x,clientY:y,pointerId:1,button:0,
  isPrimary:true,timeStamp:1000,target:{closest:()=>null},preventDefault:noop,stopPropagation:noop});
 return {id,ids,layout,nodes,overlay,viewport,stage,saves,frames,
  get commits(){return commits;},
  start(kind='move',edge='se'){
   act(()=>{const e=event('pointerdown');
    if(kind==='move')renderer.root.findByProps({'data-testid':'combat-drag-header-'+id}).props.onPointerDown(e);
    else renderer.root.findAllByProps({'data-resize-edge':edge})[0].props.onPointerDown(e);});
  },
  pan(x=100,y=100,extra={}){act(()=>canvas().props.onPointerDown({...event('pointerdown',x,y),...extra,target:viewport}));},
  move(x,y,extra={}){act(()=>canvas().props.onPointerMove({...event('pointermove',x,y),...extra}));},
  flush(){act(()=>{const pending=[...frames.values()];frames.clear();for(const callback of pending)callback();});},
  end(type='pointerup',x=100,y=100,extra={}){act(()=>canvas().props[
   type==='lostpointercapture'?'onLostPointerCapture':type==='pointercancel'?'onPointerCancel':'onPointerUp']({...event(type,x,y),...extra}));},
  button(label){act(()=>renderer.root.findByProps({'aria-label':label}).props.onClick());},
  toolbar(){return renderer.root.findByProps({role:'toolbar','aria-label':config?.kind==='player'?
   'Player dashboard canvas controls':config?'GM dashboard canvas controls':'Combat canvas controls'})
   .findAllByType('button').map(node=>node.props['aria-label']);},
  wheel(){let prevented=false;act(()=>listeners.get('wheel')?.({preventDefault(){prevented=true;}}));return prevented;},
  contentMode(value,id=null){act(()=>renderer.root.findByProps({'aria-label':id?
    'Content layout for '+(config?.labels?.[id]||'GM Player Resources'):'Default canvas content layout'})
    .props.onChange({target:{value}}));},
  undo(){act(()=>renderer.root.findByProps({'aria-label':'Undo canvas change'}).props.onClick());},
  close(){act(()=>renderer.unmount());for(const key of globals){
   if(original[key])Object.defineProperty(globalThis,key,original[key]);else delete globalThis[key];}}
 };
}

for(const [role,config] of [['Combat',null],['GM',GM_DASHBOARD_CANVAS_CONFIG],['Player',PLAYER_DASHBOARD_CANVAS_CONFIG]]){
 test(role+': pointer bursts paint once per frame, skip React renders and save once on release',async()=>{
  const f=fixture(config);try{
   f.start();const commits=f.commits;
   for(let n=1;n<=120;n++)f.move(100+n,100+n);
   assert.equal(f.frames.size,1,'one pending frame for the entire pointer burst');
   assert.equal(f.saves.length,0);
   assert.equal(f.nodes[f.id].style.transform,undefined,'nothing paints before the scheduled frame');
   f.flush();
   assert.equal(f.nodes[f.id].style.transform,'translate3d(120px,120px,0)');
   assert.equal(f.commits,commits,'guides and geometry must not rerender React during movement');
   assert.equal(f.saves.length,0,'no persistence during movement');
   f.move(240,240);
   f.end('pointerup',250,260);
   await act(async()=>{});
   assert.equal(f.frames.size,0,'release cancels the queued frame');
   assert.equal(f.saves.length,1);
   assert.equal(f.saves[0].freeform.positions[f.id].x,f.layout.freeform.positions[f.id].x+150);
   assert.equal(f.saves[0].freeform.positions[f.id].y,f.layout.freeform.positions[f.id].y+160);
   assert.equal(f.nodes[f.id].style.transform,'');
   assert.ok(f.overlay.children.every(node=>node.hidden));
   f.undo();await act(async()=>{});
   assert.equal(f.saves.length,2);
   assert.deepEqual(f.saves[1].freeform.positions,f.layout.freeform.positions,'one undo restores the whole drag');
  }finally{f.close();}
 });
}

test('cancel and lost pointer capture restore geometry and never persist pending movement',()=>{
 for(const type of ['pointercancel','lostpointercapture']){
  const f=fixture();try{
   f.start();f.move(240,260);f.flush();f.move(500,500);f.end(type);
   assert.equal(f.frames.size,0);
   assert.equal(f.saves.length,0);
   assert.equal(f.nodes[f.id].style.transform,'');
   assert.equal(f.nodes[f.id].style['--combat-x'],f.layout.freeform.positions[f.id].x/10+'%');
   assert.ok(f.overlay.children.every(node=>node.hidden));
  }finally{f.close();}
 }
});

test('resize flushes release coordinates without React renders during movement',()=>{
 const f=fixture();try{
  f.start('resize');const commits=f.commits;f.move(130,140);f.flush();
  assert.equal(f.nodes[f.id].style['--combat-w'],(f.layout.freeform.positions[f.id].w+30)/10+'%');
  assert.equal(f.commits,commits);
  f.end('pointerup',150,170);
  assert.equal(f.saves[0].freeform.positions[f.id].h,f.layout.freeform.positions[f.id].h+70);
 }finally{f.close();}
});

test('magnetic snapping and guide offsets use the painted position and camera scale',()=>{
 const f=fixture(null,{magneticSnap:true});try{
  const before=f.layout.freeform.positions[f.id];
  const neighbour=f.layout.freeform.positions[f.ids[1]];
  const point={x:neighbour.x+3,y:neighbour.y+3};
  const aligned=combatWindowAlignment(f.layout,f.id,point,{snap:true});
  f.start();f.move(100+point.x-before.x,100+point.y-before.y);f.flush();
  assert.equal(f.nodes[f.id].style.transform,
   'translate3d('+(aligned.position.x-before.x)+'px,'+(aligned.position.y-before.y)+'px,0)');
  for(const guide of aligned.guides){
   const node=f.overlay.children.find(item=>item.dataset.axis===guide.axis);
   assert.equal(node.hidden,false);
   assert.equal(node.style.transform,guide.axis==='x'?'translateX('+guide.line+'px)':
    'translateY('+(guide.line+60)+'px)');
  }
  f.end('pointerup',100+point.x-before.x,100+point.y-before.y);
  assert.deepEqual({x:f.saves[0].freeform.positions[f.id].x,y:f.saves[0].freeform.positions[f.id].y},aligned.position);
 }finally{f.close();}
});

test('alignment selects the same nearest edge, centre and stable tie at every snap strength',()=>{
 // Reference the previous stable-sort behaviour over a broad set of positions.
 const layout=defaultCombatWorkspaceLayout(),id='controls',current=layout.freeform.positions[id];
 for(const strength of ['gentle','medium','strong'])for(let x=-40;x<=1100;x+=17)for(let y=-30;y<=800;y+=29){
  const candidates={x:[],y:[]},threshold={gentle:8,medium:16,strong:28}[strength];
  for(const [otherId,rect] of Object.entries(layout.freeform.positions)){
   if(otherId===id||layout.hidden.includes(otherId))continue;
   for(const [axis,size] of [['x','w'],['y','h']])for(const source of [{x,y}[axis],{x,y}[axis]+current[size]/2,{x,y}[axis]+current[size]])
    for(const target of [rect[axis],rect[axis]+rect[size]/2,rect[axis]+rect[size]]){
     const delta=target-source;if(Math.abs(delta)<=threshold)candidates[axis].push({delta,line:target});
    }
  }
  const nearest=axis=>candidates[axis].sort((a,b)=>Math.abs(a.delta)-Math.abs(b.delta))[0];
  const a=nearest('x'),b=nearest('y');
  assert.deepEqual(combatWindowAlignment(layout,id,{x,y},{snap:true,strength}),{
   position:{x:x+(a?.delta||0),y:y+(b?.delta||0)},
   guides:[...(a?[{axis:'x',line:a.line}]:[]),...(b?[{axis:'y',line:b.line}]:[])]});
 }
});


for(const [role,config] of [['Combat',null],['GM',GM_DASHBOARD_CANVAS_CONFIG],['Player',PLAYER_DASHBOARD_CANVAS_CONFIG]]){
 for(const scale of [.5,.75,1])for(const edge of ['n','s','e','w','ne','nw','se','sw']){
  test(`Milestone 2.3 ${role}: ${edge} resize at ${scale*100}% keeps batching and geometry`,async()=>{
   const f=fixture(config,{}, {scale});try{
    const before=f.layout.freeform.positions[f.id];
    const dx=edge.includes('w')?-30:edge.includes('e')?30:0;
    const dy=edge.includes('n')?-40:edge.includes('s')?40:0;
    f.start('resize',edge);const commits=f.commits;
    for(let n=1;n<=40;n++)f.move(100+dx*scale*n/40,100+dy*scale*n/40);
    assert.equal(f.frames.size,1);f.flush();
    assert.equal(f.commits,commits,'resizing must not rerender React');
    assert.equal(f.saves.length,0);
    f.end('pointerup',100+dx*scale,100+dy*scale);await act(async()=>{});
    assert.equal(f.saves.length,1);
    const after=f.saves[0].freeform.positions[f.id];
    assert.equal(after.w,before.w+(dx?30:0));
    assert.equal(after.h,before.h+(dy?40:0));
    assert.equal(after.x,before.x+(edge.includes('w')?-30:0));
    assert.equal(after.y,before.y+(edge.includes('n')?-40:0));
   }finally{f.close();}
  });
 }
 test('Milestone 2.3 '+role+': competing resize and wheel do not disturb an active drag',async()=>{
  const f=fixture(config);try{
   f.start();f.start('resize');assert.equal(f.wheel(),true,'wheel is contained during a gesture');
   f.move(140,150);f.flush();f.end('pointerup',140,150);await act(async()=>{});
   assert.equal(f.saves.length,1);
   assert.equal(f.saves[0].freeform.positions[f.id].w,f.layout.freeform.positions[f.id].w);
   assert.equal(f.saves[0].freeform.positions[f.id].x,f.layout.freeform.positions[f.id].x+40);
  }finally{f.close();}
 });
 test('Milestone 2.3 '+role+': content preferences persist and undo without changing geometry',async()=>{
  const f=fixture(config);try{
   f.contentMode('fixed');await act(async()=>{});
   assert.equal(f.saves[0].defaultContentSizing,'fixed');
   assert.deepEqual(f.saves[0].freeform.positions,f.layout.freeform.positions);
   f.contentMode('proportional',f.id);await act(async()=>{});
   assert.equal(f.saves[1].contentSizing[f.id],'proportional');
   assert.deepEqual(f.saves[1].contentScale,f.layout.contentScale);
   f.undo();await act(async()=>{});
   assert.equal(f.saves[2].contentSizing[f.id],undefined);
   assert.equal(f.saves[2].defaultContentSizing,'fixed');
  }finally{f.close();}
 });
}

for(const [role,config] of [['Combat',null],['GM',GM_DASHBOARD_CANVAS_CONFIG],['Player',PLAYER_DASHBOARD_CANVAS_CONFIG]]){
 test('Milestone 2.4 '+role+': seven approved toolbar controls and navigation never edits layout',()=>{
  const f=fixture(config);try{
   assert.equal(f.toolbar().length,7);
   assert.deepEqual(f.toolbar().slice(1),['Undo canvas change','Lock Canvas','Redo canvas change','Zoom into canvas','Fit Canvas','Zoom out of canvas']);
   f.button('Zoom into canvas');f.button('Zoom out of canvas');f.button('Fit Canvas');
   assert.equal(f.saves.length,0);
   f.pan();const commits=f.commits;
   for(let n=1;n<=100;n++)f.move(100+n,100+n);
   assert.equal(f.frames.size,1);f.flush();
   assert.equal(f.commits,commits);assert.equal(f.saves.length,0);
   f.end('pointercancel');assert.equal(f.saves.length,0);
  }finally{f.close();}
 });
 test('Milestone 2.4 '+role+': touch pinch batches, rebases to one finger, and keeps geometry private',()=>{
  const f=fixture(config,{}, {scale:.5});try{
   f.pan(100,100,{pointerType:'touch'});
   f.pan(200,100,{pointerType:'touch',pointerId:2,isPrimary:false});
   const commits=f.commits;
   f.move(300,100,{pointerType:'touch',pointerId:2,isPrimary:false});f.flush();
   assert.equal(f.stage.style.transform,'translate3d(-100px,-40px,0) scale(1)');
   assert.equal(f.commits,commits);assert.equal(f.saves.length,0);
   f.end('pointerup',300,100,{pointerType:'touch',pointerId:2});
   f.move(120,130,{pointerType:'touch'});f.flush();
   assert.equal(f.stage.style.transform,'translate3d(-80px,-10px,0) scale(1)');
   f.end('pointerup',120,130,{pointerType:'touch'});
   assert.equal(f.saves.length,0);
  }finally{f.close();}
 });
 test('Milestone 2.4 '+role+': toolbar zoom cannot change coordinates during a geometry gesture',()=>{
  const f=fixture(config);try{
   f.start();f.button('Zoom into canvas');f.move(140,150);f.flush();
   assert.equal(f.nodes[f.id].style.transform,'translate3d(40px,50px,0)');
   f.end('pointercancel');assert.equal(f.saves.length,0);
  }finally{f.close();}
 });
}
