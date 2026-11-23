import React,{useEffect,useId,useRef,useState} from 'react';
import {CORE_DICE_FAMILIES,CORE_DICE_TYPES,coreNumeralContrast} from './coreDiceDesigns.mjs';
import {MATERIALS,FINISHES,TRIMS,NUMBER_STYLES,defaultDiceAppearance,
  validateDiceAppearance} from './diceAppearanceCatalogue.mjs';
import {prepareCoreDesigns,releaseCoreDesigns} from './coreDiceRegistry.mjs';
import {FamiliarDiceControls} from './FamiliarDiceControls.jsx';
import {familiarVisualAnimationAllowed} from './familiarDiceDesign.mjs';

/** Live Three.js preview of the actual Open Dice PBR die mesh, not a CSS imitation.
 * The preview has no physics world and never requests or records gameplay dice.
 */
export function CoreDicePreview({appearance,dieType='d20'}){
  const node=useRef(null),id=useId().replace(/[^a-z0-9]/gi,'').toLowerCase()||'preview';
  const [error,setError]=useState('');
  const [zoom,setZoom]=useState(1);
  const viewRef=useRef(null);
  const zoomRef=useRef(zoom);
  useEffect(()=>{zoomRef.current=zoom;},[zoom]);
  useEffect(()=>{
    let cancelled=false,frame=0,view,registry,api,imageRegistry,scene,renderer,resizeObserver,mesh;
    const container=node.current;
    if(!container)return undefined;
    setError('');
    const init=async()=>{
      const [THREE,openDice]=await Promise.all([import('three'),import('open-dice-dnd')]);
      if(cancelled)return;
      api=openDice;
      imageRegistry=new openDice.DecalRegistry();
      registry=prepareCoreDesigns(openDice,appearance,'preview-'+id);
      const setId=registry[dieType];
      scene=new THREE.Scene();
      scene.background=new THREE.Color('#111c2b');
      const camera=new THREE.PerspectiveCamera(36,1,.1,60);
      camera.position.set(3.15,2.65,4.2);
      camera.lookAt(0,0,0);
      view={camera,THREE,angle:0,tilt:.16};
      viewRef.current=view;
      renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,
        powerPreference:'low-power'});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
      renderer.shadowMap.enabled=true;
      renderer.outputEncoding=THREE.sRGBEncoding;
      container.append(renderer.domElement);
      const ambient=new THREE.HemisphereLight(0xdcecff,0x273044,1.2);
      scene.add(ambient);
      const key=new THREE.DirectionalLight(0xffffff,2.1);
      key.position.set(3,6,7);scene.add(key);
      const rim=new THREE.DirectionalLight(0x7fa9dd,1.2);
      rim.position.set(-4,3,-4);scene.add(rim);
      const floor=new THREE.Mesh(new THREE.CircleGeometry(2.7,64),
        new THREE.MeshStandardMaterial({color:'#182b3b',roughness:.72,metalness:.12}));
      floor.rotation.x=-Math.PI/2;floor.position.y=-1.12;
      scene.add(floor);
      if(typeof openDice.prepareDiceSets==='function')
        await openDice.prepareDiceSets({renderer,scene,decalRegistry:imageRegistry,sets:[setId]});
      if(appearance.familyId==='dice-familiar'){
        const imageSrc=api.getDiceSet(setId)?.body?.image?.src;
        if(!imageSrc||!imageRegistry.has(imageSrc))throw Error('Familiar texture failed to load.');
        container.dataset.artReady='true';
      }else container.dataset.artReady='false';
      if(cancelled)return;
      const die=openDice.createDie(dieType,true,true,undefined,undefined,null,
        scene,null,null,null,null,false,null,imageRegistry,{set:setId});
      mesh=die.mesh;
      const size=()=>{
        if(!renderer||!container)return;
        const width=Math.max(1,container.clientWidth),height=Math.max(1,container.clientHeight);
        renderer.setSize(width,height,false);
        camera.aspect=width/height;camera.updateProjectionMatrix();
      };
      size();
      resizeObserver=new ResizeObserver(size);
      resizeObserver.observe(container);
      const clock=new THREE.Clock();
      const loop=()=>{
        if(cancelled)return;
        frame=requestAnimationFrame(loop);
        const seconds=Math.min(.05,clock.getDelta());
        // Slow idle motion. Pointer dragging rotates the same model.
        if(!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
          view.angle+=seconds*.22;
        mesh.rotation.set(view.tilt,view.angle,.12);
        camera.position.set(3.15*zoomRef.current,2.65*zoomRef.current,
          4.2*zoomRef.current);
        camera.lookAt(0,0,0);
        renderer.render(scene,camera);
      };
      loop();
    };
    init().catch(e=>{if(!cancelled)setError('3D preview unavailable: '+(e?.message||String(e)));});
    return ()=>{
      cancelled=true;
      if(frame)cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      if(mesh?.parent)mesh.parent.remove(mesh);
      if(scene)scene.traverse(obj=>{
        if(obj.isMesh&&!obj.geometry?.userData?.shared)obj.geometry?.dispose();
        if(obj.isMesh){
          const materials=Array.isArray(obj.material)?obj.material:[obj.material];
          materials.forEach(m=>m?.dispose?.());
        }
      });
      // Package unloads cached face textures when the design is unregistered.
      if(api&&registry)releaseCoreDesigns(api,registry);
      imageRegistry?.cache?.clear?.();
      imageRegistry?.loading?.clear?.();
      if(container)delete container.dataset.artReady;
      viewRef.current=null;
      renderer?.dispose();
      if(renderer?.domElement?.parentNode)renderer.domElement.remove();
    };
  },[appearance,dieType,id]);
  const pointer=useRef(null);
  const pointerDown=event=>{
    pointer.current={x:event.clientX,y:event.clientY};
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const pointerMove=event=>{
    if(!pointer.current||!viewRef.current)return;
    const dx=event.clientX-pointer.current.x;
    const dy=event.clientY-pointer.current.y;
    pointer.current={x:event.clientX,y:event.clientY};
    viewRef.current.angle+=dx*.012;
    viewRef.current.tilt=Math.max(-1,Math.min(1,viewRef.current.tilt+dy*.01));
  };
  const pointerUp=()=>{pointer.current=null;};
  return <div className="asteria-core-dice-preview" data-familiar-shimmer={familiarVisualAnimationAllowed(appearance)}>
    <div className="asteria-core-dice-preview-canvas" ref={node}
      role="img" aria-label={'Rotating 3D '+dieType+' preview'}
      onPointerDown={pointerDown} onPointerMove={pointerMove}
      onPointerUp={pointerUp} onPointerCancel={pointerUp}/>
    {error?<p role="status">{error}</p>:null}
    <div className="asteria-core-dice-preview-controls">
      <button type="button" onClick={()=>setZoom(z=>Math.max(.72,z-.1))}
        aria-label="Zoom closer to dice preview">+</button>
      <span>Live PBR preview</span>
      <button type="button" onClick={()=>setZoom(z=>Math.min(1.7,z+.1))}
        aria-label="Zoom out of dice preview">−</button>
    </div>
  </div>;
}

export function CoreDicePicker({value,onChange}){
  const [dieType,setDieType]=useState('d20');
  const selected=CORE_DICE_FAMILIES.find(x=>x.id===value.familyId);
  const familiar=value.familyId==='dice-familiar';
  const patch=part=>{
    try{onChange(validateDiceAppearance({...value,...part}));}catch{/* ignore unsupported edits */}
  };
  return <section className="asteria-core-dice-picker" aria-label="Core dice appearances">
    <div className="asteria-core-dice-picker-heading">
      <h3>Dice Appearance</h3>
      <small>12 core 3D designs + Familiar Dice · saved collections arrive in Phase 3.7</small>
    </div>
    <div className="asteria-core-dice-picker-layout">
      <div className="asteria-core-dice-selection">
        <label>Dice design<select aria-label="Core dice design" value={value.familyId}
          onChange={event=>onChange(defaultDiceAppearance(event.target.value))}>
          {CORE_DICE_FAMILIES.map(family=>
            <option key={family.id} value={family.id}>{family.name}</option>)}
          <option value="dice-familiar">Familiar Dice — Cats</option>
        </select></label>
        <div className="asteria-core-dice-swatches" role="group" aria-label="Thirteen available dice designs">
          {CORE_DICE_FAMILIES.map(family=><button key={family.id} type="button"
            className={value.familyId===family.id?'is-selected':''}
            style={{'--dice-swatch':family.primaryColor}}
            onClick={()=>onChange(defaultDiceAppearance(family.id))}
            aria-pressed={value.familyId===family.id}
            title={family.name} aria-label={family.name}>
            <span aria-hidden="true"/>
          </button>)}
          <button type="button" className={familiar?'is-selected':''}
            style={{'--dice-swatch':'#F2F3EE'}}
            aria-pressed={familiar} aria-label="Familiar Dice"
            title="Familiar Dice"
            onClick={()=>onChange(defaultDiceAppearance('dice-familiar'))}>
            <span aria-hidden="true"/></button>
        </div>
        {familiar?<FamiliarDiceControls value={value} onChange={onChange}/>:null}
        {!familiar?<div className="asteria-core-dice-controls">
          {[
            ['primaryColor','Dice body'],
            ['secondaryColor','Texture/accent'],
            ['numberColor','Numerals']
          ].map(([field,label])=><label key={field}>{label}
            <input type="color" value={value[field]} aria-label={label+' colour'}
              onChange={event=>patch({[field]:event.target.value.toUpperCase()})}/>
          </label>)}
          <label>Material<select aria-label="Core dice material"
            value={value.materialId} onChange={event=>{
              const materialId=event.target.value;
              patch({materialId,
                finish:materialId==='wood'?'satin':value.finish==='brushed'&&
                  !['steel','bronze'].includes(materialId)?'polished':value.finish});
            }}>
            {MATERIALS.map(x=><option key={x} value={x}>{x}</option>)}
          </select></label>
          <label>Finish<select value={value.finish} aria-label="Core dice finish"
            onChange={event=>patch({finish:event.target.value})}>
            {FINISHES.filter(x=>x!=='brushed'||['steel','bronze'].includes(value.materialId))
              .map(x=><option key={x}>{x}</option>)}
          </select></label>
          <label>Trim<select value={value.trim} aria-label="Core dice trim"
            onChange={event=>patch({trim:event.target.value})}>
            {TRIMS.map(x=><option key={x}>{x}</option>)}
          </select></label>
          <label>Numeral style<select value={value.numberStyle} aria-label="Core dice numeral style"
            onChange={event=>patch({numberStyle:event.target.value})}>
            {NUMBER_STYLES.map(x=><option key={x}>{x}</option>)}
          </select></label>
          <label>Preview die<select value={dieType} aria-label="Preview dice type"
            onChange={event=>setDieType(event.target.value)}>
            {CORE_DICE_TYPES.map(x=><option key={x}>{x}</option>)}
          </select></label>
        </div>:<label>Preview die<select value={dieType} aria-label="Preview dice type"
          onChange={event=>setDieType(event.target.value)}>
          {CORE_DICE_TYPES.map(x=><option key={x}>{x}</option>)}
        </select></label>}
        <button type="button" onClick={()=>onChange(defaultDiceAppearance(value.familyId))}>
          Restore {familiar?'Familiar Dice':selected?.name||'dice'} defaults
        </button>
        {coreNumeralContrast(value)<3?
          <p className="asteria-core-dice-contrast" role="status">
            Low numeral contrast: choose a brighter or darker numeral colour.
          </p>:null}
      </div>
      <CoreDicePreview appearance={value} dieType={dieType}/>
    </div>
    <p className="asteria-advanced-dice-help">Dice appearance changes affect future 3D rolls only. Familiar Dice are available now; the independently animated Watcher Dice are planned for Phase 3.4. Saved appearance collections are planned for Phase 3.7.</p>
  </section>;
}
