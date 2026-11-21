import React,{useEffect,useState} from 'react';
import {
  PRESENTATION_PLAYLIST_LIMIT,PRESENTATION_PLAYLIST_STEP_LIMIT,
  presentationPlaylistLibrary,playlistStepIndex
} from '../../../src/state/presentationPlaylistModel.mjs';
import {presentationDraft} from '../../../src/state/playerPresentationModel.mjs';
import {useCampaignStream} from './CampaignMapWorkspace.jsx';
import styles from './GMPresentationPlaylists.module.css';

const uniqueId=()=>crypto.randomUUID().replaceAll('-','').slice(0,24);
const newPlaylist=()=>({id:'playlist_'+uniqueId(),name:'New Playlist',steps:[]});
const clean=source=>({id:source.id,name:source.name,
  steps:source.steps.map(step=>({id:step.id,label:step.label,draft:step.draft}))});

/** Explicit, GM-only playback. No timers, auto-advance or unpublished assets. */
export function GMPresentationPlaylists({api,campaignId,draft,onStage,onPresent,publishing=false}){
  const result=useCampaignStream(api,'watchPresentationPlaylists',[campaignId]);
  const [selectedId,setSelectedId]=useState('');
  const [working,setWorking]=useState(null);
  const [selectedStep,setSelectedStep]=useState(0);
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  let library=null,loadError='';
  try{if(result.data)library=presentationPlaylistLibrary(result.data);}
  catch(e){loadError=e.message||'Playlist data is invalid.';}
  const saved=(library?.playlists||[]).find(item=>item.id===selectedId);
  const playlist=working||saved||null;
  useEffect(()=>{
    setSelectedId('');setWorking(null);setSelectedStep(0);
    setNotice('');setError('');
  },[campaignId]);
  const select=id=>{
    setSelectedId(id);setWorking(null);setSelectedStep(0);setNotice('');setError('');
  };
  const edit=update=>{
    if(!playlist)return;
    setWorking(clean(update(playlist)));setNotice('');setError('');
  };
  const addStep=()=>{
    try{
      if(playlist.steps.length>=PRESENTATION_PLAYLIST_STEP_LIMIT)
        throw Error('The playlist already has the maximum number of scenes.');
      const safe=presentationDraft(draft);
      edit(previous=>({...previous,steps:[...previous.steps,{
        id:'step_'+uniqueId(),label:safe.title||safe.scene.replaceAll('-',' '),
        draft:safe
      }]}));
      setSelectedStep(playlist.steps.length);
    }catch(e){setError(e.message||'Complete the current scene before adding it.');}
  };
  const move=(index,delta)=>{
    const destination=playlistStepIndex(playlist.steps,index,delta);
    if(destination<0)return;
    edit(previous=>{
      const steps=[...previous.steps];
      [steps[index],steps[destination]]=[steps[destination],steps[index]];
      return {...previous,steps};
    });
    setSelectedStep(destination);
  };
  const save=async(type='save')=>{
    if(!library||saving||result.loading||result.error||loadError||!playlist)return;
    setSaving(true);setError('');setNotice('');
    try{
      await api.managePresentationPlaylist(campaignId,type==='save'
        ?{type,expectedRevision:library.revision,playlist:clean(playlist)}
        :{type,expectedRevision:library.revision,id:playlist.id});
      if(type==='delete'){select('');setNotice('Playlist deleted.');}
      else{setWorking(null);setNotice('Playlist saved for this campaign.');}
    }catch(e){setError(e.message||'Playlist update failed.');}
    finally{setSaving(false);}
  };
  const stage=index=>{
    const step=playlist?.steps[index];
    if(!step)return;
    onStage({...step.draft});setSelectedStep(index);
    setNotice('Scene staged privately. Players cannot see it until you present.');
  };
  const present=async index=>{
    const step=playlist?.steps[index];
    if(!step||saving||publishing||result.loading||result.error||loadError)return;
    setSaving(true);setError('');setNotice('');
    try{
      await onPresent(step.draft);
      setSelectedStep(index);
      setNotice('Scene published to the player display.');
    }catch(e){setError(e.message||'Scene could not be published.');}
    finally{setSaving(false);}
  };
  const disabled=saving||publishing||result.loading||Boolean(result.error)||Boolean(loadError);
  return <section className={styles.root} data-testid="site-gm-presentation-playlists">
    <h3>Scene Playlists &amp; Quick Transitions</h3>
    <p>Organise approved presentation scenes. Staging never shares content.
      Every transition requires a GM click and is checked again by the server.</p>
    {result.loading?<p role="status">Checking private playlists…</p>:null}
    {result.error||loadError?<p role="alert">{result.error||loadError}</p>:null}
    <div className={styles.actions}>
      <label>Saved playlists
        <select aria-label="Saved playlists" value={selectedId} disabled={disabled}
          onChange={e=>select(e.target.value)}>
          <option value="">Select a playlist</option>
          {(library?.playlists||[]).map(item=><option value={item.id} key={item.id}>
            {item.name}</option>)}
        </select>
      </label>
      <button type="button" disabled={disabled||
        (library?.playlists||[]).length>=PRESENTATION_PLAYLIST_LIMIT}
        onClick={()=>{
          const next=newPlaylist();
          setSelectedId(next.id);setWorking(next);setSelectedStep(0);
          setError('');setNotice('New playlist is unsaved.');
        }}>New Playlist</button>
    </div>
    {playlist?<div className={styles.editor}>
      <label>Playlist name<input maxLength={80} value={playlist.name}
        disabled={disabled} onChange={e=>edit(old=>({...old,name:e.target.value}))}/></label>
      <div className={styles.actions}>
        <button type="button" disabled={disabled} onClick={addStep}>
          Add Current Draft as Scene</button>
        <button type="button" disabled={disabled||!working} onClick={()=>save()}>
          Save Playlist</button>
        <button type="button" disabled={disabled||!saved} onClick={()=>{
          if(window.confirm('Delete this saved scene playlist?'))void save('delete');
        }}>Delete Playlist</button>
      </div>
      <ol className={styles.steps}>
        {playlist.steps.map((step,index)=><li key={step.id}>
          <label>Scene {index+1}
            <input maxLength={80} value={step.label} disabled={disabled}
              onChange={e=>edit(old=>({...old,steps:old.steps.map(item=>
                item.id===step.id?{...item,label:e.target.value}:item)}))}/>
          </label>
          <small>{step.draft.scene} · {step.draft.title||'Untitled'}</small>
          <div className={styles.actions}>
            <button type="button" disabled={disabled||index===0}
              onClick={()=>move(index,-1)}>Move Up</button>
            <button type="button" disabled={disabled||index===playlist.steps.length-1}
              onClick={()=>move(index,1)}>Move Down</button>
            <button type="button" disabled={disabled} onClick={()=>stage(index)}>
              Stage</button>
            <button type="button" disabled={disabled} onClick={()=>void present(index)}>
              Present</button>
            <button type="button" disabled={disabled}
              onClick={()=>edit(old=>({...old,steps:old.steps.filter(x=>x.id!==step.id)}))}>
              Remove</button>
          </div>
        </li>)}
      </ol>
      <div className={styles.actions}>
        <button type="button" disabled={disabled||selectedStep<=0||
          !playlist.steps.length} onClick={()=>void present(selectedStep-1)}>
          Present Previous</button>
        <button type="button" disabled={disabled||selectedStep>=playlist.steps.length-1}
          onClick={()=>void present(selectedStep+1)}>Present Next</button>
      </div>
      <p>Use the existing Emergency Stop for immediate blackout and revocation.
        Transitions never bypass media permissions or resume stopped sessions.</p>
    </div>:null}
    {notice?<p role="status">{notice}</p>:null}
    {error?<p role="alert">{error}</p>:null}
  </section>;
}
