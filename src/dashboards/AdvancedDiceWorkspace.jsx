import React,{useEffect,useRef,useState} from 'react';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {
  DICE_SIDES,MAX_DICE_GROUPS,MAX_DICE_PER_ROLL,MAX_DICE_HISTORY,
  MAX_DICE_PRESETS,diceConfig,diceExpression
} from '../state/diceRollModel.mjs';
import {AsteriaDiceTray} from '../dice/AsteriaDiceTray.jsx';
import {DiceEffectsControls} from '../dice/DiceEffectsControls.jsx';
import {DiceTowerStudio} from '../dice/DiceTowerStudio.jsx';
import {defaultDiceTowerAppearance,TOWER_FAMILIES} from '../dice/diceTowerCatalogue.mjs';
import {PRESENTATION_STORAGE_KEY,defaultDicePresentation,deviceDicePresentation,
  diceGraphicsProfile} from '../dice/dicePresentationModel.mjs';
import {DICE_WINDOW_STORAGE_KEY,defaultDiceWindowSettings,readDiceWindowSettings,
  validateDiceWindowSettings,addDiceToPool,removeDiceFromPool,formatShareableDiceResult}
  from '../dice/diceWindowModel.mjs';
import {DiceCustomizationStudio} from '../dice/DiceCustomizationStudio.jsx';
import {DiceAppearanceCollections} from '../dice/DiceAppearanceCollections.jsx';
import {appearanceForCharacter,normalizeDiceAppearanceLibrary} from '../dice/diceAppearanceCollections.mjs';
import {defaultDiceAppearance} from '../dice/diceAppearanceCatalogue.mjs';
import {defaultDiceTrayAppearance} from '../dice/diceTrayCatalogue.mjs';
import {createDiceStudioState,changeDiceStudio,undoDiceStudio,redoDiceStudio,
  applyDiceStudioLook,matchDiceTrayPalette,restoreDiceStudio} from '../dice/diceStudioModel.mjs';
import '../styles/advanced-dice.css';

const EMPTY={pool:[{count:1,sides:20}],modifier:0,label:''};
const visibleTime=timestamp=>Number.isFinite(Number(timestamp))?
  new Date(Number(timestamp)).toLocaleString():'';
const signed=value=>Number(value)>=0?'+'+value:String(value);
const readFailure=error=>error?.message||'Unable to complete the dice action.';
export function AdvancedDiceWorkspace({role='player',ownedCharacterId=''}){
  const [workspace,setWorkspace]=useState({presets:[],history:[]});
  const [config,setConfig]=useState(EMPTY),[presetName,setPresetName]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const windowRef=useRef(null);
  const [activePanel,setActivePanel]=useState(null);
  const [settingsTab,setSettingsTab]=useState('appearance');
  const [immersive,setImmersive]=useState(false);
  const [showResult,setShowResult]=useState(true);
  const [rollPhase,setRollPhase]=useState('idle');
  const [rollWarning,setRollWarning]=useState('');
  const rollInFlightRef=useRef(false);
  const [gmSharing,setGmSharing]=useState('private');
  const [shareStatus,setShareStatus]=useState('');
  const [windowSettings,setWindowSettings]=useState(()=>{
    try{return readDiceWindowSettings(window.localStorage.getItem(DICE_WINDOW_STORAGE_KEY));}
    catch{return defaultDiceWindowSettings();}
  });
  const [presentation,setPresentation]=useState(()=>{
    try{return deviceDicePresentation(window.localStorage.getItem(PRESENTATION_STORAGE_KEY));}
    catch{return defaultDicePresentation();}
  });
  const [towerAppearance,setTowerAppearance]=useState(()=>defaultDiceTowerAppearance());
  const setWindowPreference=(key,value)=>setWindowSettings(prev=>
    validateDiceWindowSettings({...prev,[key]:value}));
  useEffect(()=>{
    try{window.localStorage.setItem(DICE_WINDOW_STORAGE_KEY,JSON.stringify(windowSettings));}
    catch{/* Device storage can be unavailable. */}
  },[windowSettings]);
  useEffect(()=>{
    const changed=()=>{
      if(!document.fullscreenElement)setImmersive(false);
    };
    const keydown=event=>{
      if(event.key!=='Escape')return;
      if(activePanel)setActivePanel(null);
      else if(immersive&&!document.fullscreenElement)setImmersive(false);
    };
    document.addEventListener('fullscreenchange',changed);
    document.addEventListener('keydown',keydown);
    return ()=>{
      document.removeEventListener('fullscreenchange',changed);
      document.removeEventListener('keydown',keydown);
    };
  },[activePanel,immersive]);
  const toggleFullscreen=async()=>{
    if(document.fullscreenElement===windowRef.current){
      await document.exitFullscreen?.();return;
    }
    if(immersive){setImmersive(false);return;}
    try{
      if(windowRef.current?.requestFullscreen)await windowRef.current.requestFullscreen();
      setImmersive(true);
    }catch{setImmersive(true);}
  };
  const [animatedRoll,setAnimatedRoll]=useState(null);
  const [replayToken,setReplayToken]=useState(0);
  const [diceStudio,setDiceStudio]=useState(()=>createDiceStudioState());
  const [appearanceLibrary,setAppearanceLibrary]=useState(null);
  const [libraryReady,setLibraryReady]=useState(false);
  const [appearanceCharacters,setAppearanceCharacters]=useState([]);
  const [appearanceBusy,setAppearanceBusy]=useState(false);
  const [appearanceError,setAppearanceError]=useState('');
  const [appearanceNotice,setAppearanceNotice]=useState('');
  const [selectedAppearanceCharacter,setSelectedAppearanceCharacter]=useState('');
  const appearanceLoadedScope=useRef('');
  const appearanceUid=useRef('');
  const appearance=diceStudio.current.dice;
  const trayAppearance=diceStudio.current.tray;
  const setAppearance=next=>setDiceStudio(state=>changeDiceStudio(state,{
    dice:typeof next==='function'?next(state.current.dice):next
  }));
  const setTrayAppearance=next=>setDiceStudio(state=>changeDiceStudio(state,{
    tray:typeof next==='function'?next(state.current.tray):next
  }));
  useEffect(()=>{
    let unsubLibrary=()=>{},unsubCharacters=()=>{};
    const connect=()=>{
      const uid=firebaseService.currentUser()?.uid||'';
      if(!uid||uid===appearanceUid.current)return;
      appearanceUid.current=uid;appearanceLoadedScope.current='';
      unsubLibrary();unsubCharacters();
      setAppearanceLibrary(null);setLibraryReady(false);setAppearanceCharacters([]);
      setSelectedAppearanceCharacter('');
      unsubLibrary=firebaseService.subscribeDiceAppearanceLibrary(raw=>{
        try{setAppearanceLibrary(normalizeDiceAppearanceLibrary(raw));setLibraryReady(true);}
        catch(err){setAppearanceError(readFailure(err));setLibraryReady(false);}
      },err=>setAppearanceError(readFailure(err)));
      unsubCharacters=firebaseService.subscribeOwnedDiceCharacters(items=>
        setAppearanceCharacters(items),err=>setAppearanceError(readFailure(err)));
    };
    connect();
    window.addEventListener('asteria:firebase-ready',connect);
    return ()=>{window.removeEventListener('asteria:firebase-ready',connect);
      unsubLibrary();unsubCharacters();};
  },[]);
  useEffect(()=>{
    if(!libraryReady||!appearanceLibrary)return;
    const owned=appearanceCharacters.some(c=>c.id===ownedCharacterId);
    const active=owned?ownedCharacterId:'';
    const scope=appearanceUid.current+':'+active;
    if(appearanceLoadedScope.current===scope)return;
    if(ownedCharacterId&&!owned&&!appearanceCharacters.length)return;
    appearanceLoadedScope.current=scope;setSelectedAppearanceCharacter(active);
    const saved=appearanceForCharacter(appearanceLibrary,active);
    if(saved)setDiceStudio(createDiceStudioState(saved.dice,saved.tray));
  },[libraryReady,appearanceLibrary,appearanceCharacters,ownedCharacterId]);
  const loadSavedAppearance=collection=>{
    setDiceStudio(createDiceStudioState(collection.dice,collection.tray));
    setAppearanceError('');setAppearanceNotice('Loaded '+collection.name+'.');
  };
  const chooseAppearanceCharacter=id=>{
    setSelectedAppearanceCharacter(id);
    const saved=appearanceForCharacter(appearanceLibrary,id||null);
    setDiceStudio(createDiceStudioState(
      saved?.dice||defaultDiceAppearance(),saved?.tray||defaultDiceTrayAppearance()));
  };
  const executeAppearance=async(request,success)=>{
    if(appearanceBusy||!libraryReady||!appearanceLibrary)return false;
    setAppearanceBusy(true);setAppearanceError('');setAppearanceNotice('');
    try{
      const response=await firebaseService.advancedDiceAction({
        ...request,expectedRevision:appearanceLibrary.revision
      });
      if(!response?.ok)throw Error(response?.error||'Appearance action failed.');
      setAppearanceNotice(success||'Appearance updated.');return true;
    }catch(err){setAppearanceError(readFailure(err));return false;}
    finally{setAppearanceBusy(false);}
  };
  const [animateDice,setAnimateDice]=useState(()=>{
    if(typeof window==='undefined'||typeof window.matchMedia!=='function')return true;
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  const lastRequest=useRef(null);
  useEffect(()=>{
    setWorkspace({presets:[],history:[]});setError('');setNotice('');
    try{return firebaseService.subscribeDiceWorkspace(value=>
      setWorkspace({presets:Array.isArray(value?.presets)?value.presets:[],
        history:Array.isArray(value?.history)?value.history:[]}));}
    catch(err){setError(readFailure(err));return undefined;}
  },[]);
  const replaceConfig=value=>{
    setConfig({pool:value.pool.map(row=>({...row})),modifier:value.modifier,label:value.label});
    setError('');setNotice('Preset loaded. Roll when ready.');
  };
  const execute=async(input,success)=>{
    if(busy)return null;
    setBusy(true);setError('');setNotice('');
    try{
      const response=await firebaseService.advancedDiceAction(input);
      if(!response?.ok)throw Error(response?.error||'The dice action could not be saved.');
      setNotice(success||'Changes saved.');
      return response;
    }catch(err){setError(readFailure(err));return null;}
    finally{setBusy(false);}
  };
  const roll=async(override=null)=>{
    if(rollInFlightRef.current)return;
    let checked;
    try{checked=diceConfig(override||config);}catch(err){setError(readFailure(err));return;}
    // Preserve the request ID after a transient network failure to prevent
    // an ambiguous retry from creating a second roll on the server.
    const fingerprint=JSON.stringify(checked);
    if(lastRequest.current?.fingerprint!==fingerprint)
      lastRequest.current={fingerprint,requestId:crypto.randomUUID()};
    rollInFlightRef.current=true;
    setRollPhase('requesting');setRollWarning('');setShowResult(false);
    const response=await execute({action:'roll',...checked,requestId:lastRequest.current.requestId},
      'Digital roll recorded in your private history.');
    rollInFlightRef.current=false;
    if(response?.ok){
      lastRequest.current=null;
      if(response.roll){
        setRollPhase('animating');setAnimatedRoll(response.roll);
        setReplayToken(token=>token+1);
      }
    }else{setRollPhase('error');setShowResult(true);}
  };
  const savePreset=async()=>{
    let checked;
    try{checked=diceConfig(config);}catch(err){setError(readFailure(err));return;}
    const name=presetName.trim();
    if(!name||name.length>60){setError('Enter a preset name of 1–60 characters.');return;}
    const matching=(workspace.presets||[]).find(row=>row.name.toLowerCase()===name.toLowerCase());
    const result=await execute({action:'save-preset',preset:{
      id:matching?.id||crypto.randomUUID(),name,...checked
    }},'Saved dice preset: '+name);
    if(result?.ok)setPresetName('');
  };
  const deletePreset=async preset=>{
    await execute({action:'delete-preset',presetId:preset.id},'Preset removed.');
  };
  const clear=async()=>{
    if(!window.confirm('Permanently clear your private dice roll history? Saved presets will remain.'))return;
    const result=await execute({action:'clear-history',confirmed:true},'Private dice history cleared.');
    if(result?.ok)setAnimatedRoll(null);
  };
  let expression='',validation='';
  try{expression=diceExpression(config);}catch(err){validation=readFailure(err);}
  const totalDice=config.pool.reduce((total,row)=>total+(Number(row.count)||0),0);
  const latest=workspace.history?.[0];
  const replayLast=()=>{
    if(rollPhase==='requesting'||rollPhase==='animating')return;
    const saved=latest||animatedRoll;
    if(!saved)return;
    setShowResult(false);setRollWarning('');setRollPhase('animating');
    setAnimatedRoll(saved);setReplayToken(token=>token+1);
  };
  const clearTray=()=>{if(busy||rollPhase==='animating')return;
    setAnimatedRoll(null);setShowResult(false);setRollPhase('idle');};
  const shareResult=async()=>{
    if(role!=='gm'||gmSharing!=='shareable'||!latest)return;
    try{
      await navigator.clipboard.writeText(formatShareableDiceResult(latest));
      setShareStatus('Server-confirmed summary copied. Paste it into your campaign chat to share.');
    }catch{setShareStatus('Clipboard permission denied. Your roll remains private.');}
  };
  const currentResult=animatedRoll||latest;
  const handleTrayLifecycle=state=>{
    if(rollPhase!=='animating')return;
    if(state==='settled'){setRollPhase('settled');setShowResult(true);}
    else if(['mismatch','unavailable','oversized','unsupported','paused'].includes(state)){
      setRollPhase('fallback');
      setRollWarning('3D animation could not finish normally. The server-confirmed result is unchanged.');
      setShowResult(true);
    }
  };
  useEffect(()=>{
    if(rollPhase!=='animating')return undefined;
    const timer=window.setTimeout(()=>{
      setRollPhase('fallback');
      setRollWarning('3D animation timed out. Showing the verified result instead.');
      setShowResult(true);
    },20000);
    return ()=>window.clearTimeout(timer);
  },[rollPhase,animatedRoll?.id,replayToken]);
  useEffect(()=>{
    if(!showResult||!currentResult||!windowSettings.autoHideResult)return undefined;
    const timer=window.setTimeout(()=>setShowResult(false),7000);
    return ()=>window.clearTimeout(timer);
  },[showResult,currentResult?.id,windowSettings.autoHideResult]);
  const graphics=diceGraphicsProfile(presentation,{
    viewportWidth:typeof window!=='undefined'?window.innerWidth:1000,
    systemReducedMotion:typeof window!=='undefined'&&
      Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  });
  const chooseTower=id=>{
    setWindowPreference('towerId',id);
    if(id!=='off')setTowerAppearance(defaultDiceTowerAppearance(id));
  };
  const openPanel=name=>setActivePanel(value=>value===name?null:name);
  return <section ref={windowRef}
    className={'asteria-advanced-dice asteria-advanced-dice--'+role+
      ' asteria-advanced-dice--workspace'+(immersive?' asteria-dice-immersive':'')}
    data-dice-window-version="4" aria-label="Advanced Dice Roller">
    <div className="asteria-dice-window">
      <div className="asteria-dice-window-surface">
        <AsteriaDiceTray record={animatedRoll} enabled={animateDice}
          onLifecycleStatus={handleTrayLifecycle}
          appearance={appearance} trayAppearance={trayAppearance}
          onTrayAppearanceChange={setTrayAppearance} studioManaged windowMode
          windowSettings={windowSettings}
          onRollDie={sides=>roll({pool:[{count:1,sides}],modifier:0,label:''})}
          experimentalTowerAppearance={windowSettings.towerId!=='off'?
            towerAppearance:null}
          presentationPreferences={presentation} onPresentationPreferencesChange={setPresentation}
          replayToken={replayToken} canReplay={Boolean(latest||animatedRoll)}
          onToggleEnabled={setAnimateDice} onReplay={replayLast} onClear={clearTray}/>
        <div className="asteria-dice-window-header">
          <div className="asteria-dice-window-brand">
            <span className="asteria-advanced-dice-crystal" aria-hidden="true"/>
            <div><strong>Asteria Dice</strong><small>3D tabletop · server-confirmed rolls</small></div>
          </div>
          <div className="asteria-dice-window-toolbar" role="group" aria-label="Dice window tools">
            <button type="button" aria-expanded={activePanel==='dice'}
              aria-controls="asteria-dice-selection" onClick={()=>openPanel('dice')}
              aria-label="Open dice selection">Dice</button>
            <button type="button" aria-expanded={activePanel==='history'}
              aria-controls="asteria-dice-history" onClick={()=>openPanel('history')}
              aria-label="Open roll history">History</button>
            <button type="button" aria-expanded={activePanel==='settings'}
              aria-controls="asteria-dice-window-settings" onClick={()=>openPanel('settings')}
              aria-label="Open dice customisation settings">Settings</button>
            <button type="button" aria-pressed={immersive} onClick={toggleFullscreen}
              aria-label={immersive?'Exit immersive dice mode':'Enter immersive dice mode'}>
              {immersive?'Exit fullscreen':'Fullscreen'}</button>
          </div>
        </div>
        <button type="button" className="asteria-dice-window-edge-tab"
          aria-controls="asteria-dice-selection" aria-expanded={activePanel==='dice'}
          onClick={()=>openPanel('dice')}>Dice {activePanel==='dice'?'‹':'›'}</button>
        {(rollPhase==='requesting'||rollPhase==='animating')?
          <div className="asteria-dice-roll-progress" role="status" aria-live="polite"
            data-roll-phase={rollPhase}>
            <span className="asteria-dice-roll-progress-spinner" aria-hidden="true"/>
            {rollPhase==='requesting'?'Rolling dice…':'Dice tumbling…'}
          </div>:null}
        {currentResult&&showResult&&rollPhase!=='requesting'&&rollPhase!=='animating'?
          <div className="asteria-dice-window-result"
          aria-live="polite" data-result-visible="true">
          <button type="button" aria-label="Hide result overlay"
            className="asteria-dice-window-result-dismiss"
            onClick={()=>setShowResult(false)}>×</button>
          <small>Official result</small>
          <strong>{currentResult.total}</strong>
          <span>{currentResult.label||currentResult.expression}</span>
          {currentResult.natural?<b>{currentResult.natural==='natural-20'?
            'Natural 20':'Natural 1'}</b>:null}
        </div>:null}
        <div className="asteria-dice-window-bottom">
          <div className="asteria-dice-window-expression">
            <span>{validation||expression||'Choose your dice'}</span>
            <small>{totalDice} of {MAX_DICE_PER_ROLL} selected</small>
          </div>
          {currentResult&&!showResult?<button type="button"
            aria-label="Show latest dice result" onClick={()=>setShowResult(true)}>Result</button>:null}
          <button type="button" className="asteria-advanced-dice-primary"
            disabled={busy||Boolean(validation)||!totalDice}
            onClick={()=>roll()}>{busy?'Rolling…':'Roll All'}</button>
          <button type="button" disabled={!latest||busy}
            title="Replay the last verified roll. No new official roll is created."
            onClick={replayLast}>Replay</button>
          <button type="button" disabled={!animatedRoll||busy}
            onClick={clearTray}>Clear tray</button>
        </div>
        {activePanel==='dice'?<aside id="asteria-dice-selection"
          className="asteria-dice-window-drawer asteria-dice-window-drawer--left"
          aria-label="Dice selection">
          <div className="asteria-dice-window-drawer-heading">
            <h3>Choose dice</h3><button type="button" onClick={()=>setActivePanel(null)}
              aria-label="Close dice selection">×</button>
          </div>
          <div className="asteria-dice-window-dice-list">
            {DICE_SIDES.map(sides=>{
              const count=config.pool.find(row=>row.sides===sides)?.count||0;
              return <div className="asteria-dice-window-die-row" key={sides}>
                <button type="button" className="asteria-dice-window-die-add"
                  disabled={busy||totalDice>=MAX_DICE_PER_ROLL||
                    (count===0&&config.pool.length>=MAX_DICE_GROUPS)}
                  onClick={()=>setConfig(old=>({...old,
                    pool:addDiceToPool(old.pool,sides)}))} aria-label={'Add d'+sides}>
                  d{sides} <span>+</span></button>
                <strong aria-label={'d'+sides+' count'}>{count}</strong>
                <button type="button" disabled={busy||!count} aria-label={'Remove d'+sides}
                  onClick={()=>setConfig(old=>({...old,
                    pool:removeDiceFromPool(old.pool,sides)}))}>−</button>
                <button type="button" disabled={busy} title={'Roll one d'+sides}
                  aria-label={'Roll one d'+sides}
                  onClick={()=>roll({pool:[{count:1,sides}],modifier:0,label:''})}>Roll</button>
              </div>;
            })}
          </div>
          <div className="asteria-advanced-dice-fields asteria-dice-window-builder-fields">
            <label>Modifier<input type="number" min="-999" max="999" step="1"
              value={config.modifier} onChange={event=>setConfig(old=>({...old,
                modifier:Number(event.target.value)}))}/></label>
            <label>Roll label<input maxLength={80} value={config.label}
              placeholder="Optional roll name"
              onChange={event=>setConfig(old=>({...old,label:event.target.value}))}/></label>
          </div>
          <div className="asteria-advanced-dice-expression">
            <span>Roll expression</span><strong>{validation||expression||'No dice selected'}</strong>
            <small>{config.pool.length}/{MAX_DICE_GROUPS} groups</small>
          </div>
          <div className="asteria-advanced-dice-actions">
            <button type="button" disabled={busy}
              onClick={()=>setConfig(EMPTY)}>Reset builder</button>
            <button type="button" disabled={busy||Boolean(validation)||!totalDice}
              onClick={()=>{setActivePanel(null);roll();}}>Roll selection</button>
          </div>
          <section className="asteria-advanced-dice-presets" aria-label="Quick dice presets">
            <h3>Quick presets ({workspace.presets.length}/{MAX_DICE_PRESETS})</h3>
            <div className="asteria-advanced-dice-preset-save">
              <label>Preset name<input maxLength={60} value={presetName}
                onChange={event=>setPresetName(event.target.value)}
                placeholder="Save this combination"/></label>
              <button type="button" disabled={busy||Boolean(validation)||!presetName.trim()||
                (workspace.presets.length>=MAX_DICE_PRESETS&&!workspace.presets.some(
                  p=>p.name.toLowerCase()===presetName.trim().toLowerCase()))}
                onClick={savePreset}>Save</button>
            </div>
            <ul>{workspace.presets.map(preset=><li key={preset.id}>
              <span><b>{preset.name}</b><small>{diceExpression({pool:preset.pool,modifier:preset.modifier,label:preset.label})}</small></span>
              <button type="button" disabled={busy} onClick={()=>replaceConfig(preset)}>Load</button>
              <button type="button" disabled={busy}
                onClick={()=>{setActivePanel(null);roll({
                  pool:preset.pool,modifier:preset.modifier,label:preset.label
                });}}>Roll</button>
              <button type="button" disabled={busy} aria-label={'Remove '+preset.name}
                onClick={()=>deletePreset(preset)}>×</button>
            </li>)}</ul>
          </section>
          {role==='gm'?<section className="asteria-dice-window-gm-sharing"
            aria-label="GM roll sharing">
            <h3>GM result visibility</h3>
            <label>Sharing mode<select value={gmSharing}
              onChange={event=>setGmSharing(event.target.value)}>
              <option value="private">Private (account only)</option>
              <option value="shareable">Shareable summary (manual)</option>
            </select></label>
            {gmSharing==='shareable'?<button type="button"
              disabled={!latest} onClick={shareResult}>Copy result for players</button>:null}
            <p>All rolls remain private in Firebase. A copied summary is not sent
              to players automatically; paste it into your existing campaign chat.</p>
          </section>:null}
        </aside>:null}
        {activePanel==='history'?<aside id="asteria-dice-history"
          className="asteria-dice-window-drawer asteria-dice-window-drawer--right"
          aria-label="Private dice history">
          <div className="asteria-dice-window-drawer-heading">
            <h3>Roll history ({workspace.history.length}/{MAX_DICE_HISTORY})</h3>
            <button type="button" onClick={()=>setActivePanel(null)}
              aria-label="Close roll history">×</button>
          </div>
          {latest?<article className="asteria-advanced-dice-latest">
            <strong className="asteria-advanced-dice-total">{latest.total}</strong>
            <b>{latest.label||latest.expression}</b>
            <p>{latest.expression} · subtotal {latest.subtotal} · modifier {signed(latest.modifier)}</p>
            <div className="asteria-advanced-dice-faces">
              {latest.results.map((group,index)=><p key={index}>d{group.sides}: {group.faces.join(', ')} = {group.sum}</p>)}
            </div>
            <small>{visibleTime(latest.at)} · Server digital dice</small>
          </article>:<p>No digital rolls recorded yet.</p>}
          <ol className="asteria-dice-window-history-list">
            {workspace.history.map(row=><li key={row.id}>
              <span><b>{row.label||row.expression}</b><small>{visibleTime(row.at)}</small></span>
              <strong>{row.total}</strong>
              <button type="button" disabled={busy} title="Replay without creating a new roll"
                onClick={()=>{setAnimatedRoll(row);setReplayToken(token=>token+1);
                  setShowResult(true);}}>Replay</button>
            </li>)}
          </ol>
          {workspace.history.length?<button type="button" disabled={busy}
            onClick={clear}>Clear private roll history</button>:null}
          <p className="asteria-advanced-dice-help">History is private to your account.
            Physical dice and Universal Check Requests use separate records.</p>
        </aside>:null}
        {activePanel==='settings'?<aside id="asteria-dice-window-settings"
          className="asteria-dice-window-drawer asteria-dice-window-drawer--settings"
          aria-label="Dice window customisation settings">
          <div className="asteria-dice-window-drawer-heading">
            <h3>Dice Window Settings</h3><button type="button"
              onClick={()=>setActivePanel(null)} aria-label="Close customisation settings">×</button>
          </div>
          <div className="asteria-dice-window-settings-tabs" role="tablist"
            aria-label="Dice settings categories">
            {[
              ['appearance','Dice & tray'],['effects','Effects & performance'],
              ['camera','Camera & controls'],['towers','Dice towers'],
              ['collections','Saved styles']
            ].map(([key,label])=><button key={key} type="button" role="tab"
              aria-selected={settingsTab===key} className={settingsTab===key?'is-selected':''}
              onClick={()=>setSettingsTab(key)}>{label}</button>)}
          </div>
          {settingsTab==='appearance'?<DiceCustomizationStudio value={appearance}
            onChange={setAppearance} trayValue={trayAppearance}
            onTrayChange={setTrayAppearance}
            canUndo={diceStudio.past.length>0} canRedo={diceStudio.future.length>0}
            onUndo={()=>setDiceStudio(undoDiceStudio)}
            onRedo={()=>setDiceStudio(redoDiceStudio)}
            onApplyLook={id=>setDiceStudio(state=>applyDiceStudioLook(state,id))}
            onMatch={()=>setDiceStudio(matchDiceTrayPalette)}
            onRestore={target=>setDiceStudio(state=>restoreDiceStudio(state,target))}/>:null}
          {settingsTab==='effects'?<div>
            <label className="asteria-dice-window-check">
              <input type="checkbox" checked={animateDice}
                onChange={event=>setAnimateDice(event.target.checked)}/> Enable 3D animation
            </label>
            <DiceEffectsControls value={presentation} onChange={setPresentation}
              profile={graphics}/>
          </div>:null}
          {settingsTab==='camera'?<div className="asteria-dice-window-options">
            <label>Camera preset<select value={windowSettings.cameraPreset}
              onChange={event=>setWindowPreference('cameraPreset',event.target.value)}>
              <option value="classic">Classic angled</option>
              <option value="top-down">Top-down</option>
              <option value="cinematic">Cinematic low angle</option>
            </select></label>
            <label>Grab and flick sensitivity<select value={windowSettings.interactionSpeed}
              onChange={event=>setWindowPreference('interactionSpeed',event.target.value)}>
              <option value="gentle">Gentle throw</option>
              <option value="normal">Normal</option>
              <option value="fast">Fast throw</option>
            </select></label>
            <label className="asteria-dice-window-check"><input type="checkbox"
              checked={windowSettings.cinematicFollow}
              onChange={event=>setWindowPreference('cinematicFollow',event.target.checked)}/>
              Subtle camera follow after rolls</label>
            <label className="asteria-dice-window-check"><input type="checkbox"
              checked={windowSettings.autoHideResult}
              onChange={event=>setWindowPreference('autoHideResult',event.target.checked)}/>
              Automatically hide results after 7 seconds</label>
            <p>Click a die to roll it. Drag it to reposition. Flick it to throw a new
              server-confirmed roll. Right-drag or one-finger drag empty space to orbit;
              middle-drag to pan; scroll or pinch to zoom. All gestures are visual
              controls and never alter the official recorded result.</p>
          </div>:null}
          {settingsTab==='towers'?<div className="asteria-dice-window-options">
            <label>Experimental tower<select value={windowSettings.towerId}
              onChange={event=>chooseTower(event.target.value)}>
              <option value="off">Off — roll directly onto tray</option>
              {TOWER_FAMILIES.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
            </select></label>
            {windowSettings.towerId!=='off'?<DiceTowerStudio value={towerAppearance}
              onChange={setTowerAppearance}/>:null}
            <p className="asteria-tower-warning">Tower physics are experimental
              and may be slow on some devices. They are disabled by default.
              Personal tower edits remain local, not saved to your account.
              Official results are never changed by the tower.</p>
          </div>:null}
          {settingsTab==='collections'?<DiceAppearanceCollections library={appearanceLibrary}
            ready={libraryReady} characters={appearanceCharacters}
            characterId={selectedAppearanceCharacter}
            onCharacterChange={chooseAppearanceCharacter}
            current={diceStudio.current} onLoad={loadSavedAppearance}
            onAction={executeAppearance} busy={appearanceBusy}/>:null}
          {appearanceError?<p className="asteria-advanced-dice-message"
            role="alert">{appearanceError}</p>:null}
          {appearanceNotice?<p className="asteria-advanced-dice-message"
            role="status">{appearanceNotice}</p>:null}
        </aside>:null}
        {(error||rollWarning||notice||shareStatus)?<div className="asteria-dice-window-messages"
          role={error?'alert':'status'}>{error||rollWarning||shareStatus||notice}</div>:null}
      </div>
    </div>
  </section>;
}
