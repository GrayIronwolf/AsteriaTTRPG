import React, { useMemo, useState } from 'react';
import { EmptyState, Modal, Panel, StatusPill } from '../components/WorkspaceUI.jsx';
import { firebaseService } from '../firebase/asteriaFirebaseService.js';
import { DEFAULT_DASHBOARD_PANELS, OPTIONAL_INFORMATION_FIELDS, normalizeDashboardPreferences } from '../state/liveWorkspaceModel.mjs';

const PANEL_LABELS = {
  weapons:'Equipment, Weapons & Quick Items',
  talents:'Class Talents', spells:'Active Spells', skills:'Skills', conditions:'Conditions'
};

const INFORMATION_LABELS = {
  portrait:'Character portrait', title:'Displayed player title', party:'Adventure Party membership',
  currency:'Currency summary', campaignDetails:'Location, region, date, and time', liveSync:'Live sync status'
};

const repairedGalleryLinks = new Set();

function useSaveAction() {
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const run=async (operation,success)=>{setBusy(true);setMessage('Saving...');try{const result=await operation();setMessage(result?.ok?success:result?.error||'The change could not be saved.');return result;}catch(error){setMessage(error.message||String(error));return {ok:false};}finally{setBusy(false);}};
  return {busy,message,run};
}

function imageSource(value) {
  if (!value) return '';
  const source = typeof value === 'string' ? value : value.url || value.downloadURL || value.src || value.image || '';
  return String(source).replace(/\\/g, '/');
}

export function galleryRecords(character = {}) {
  const records = (Array.isArray(character.gallery) ? character.gallery : []).map((value, index) => {
    const record = typeof value === 'string' ? { url: value } : value || {};
    return {
      ...record,
      id: record.id || `legacy-gallery-${index}`,
      rawId: record.id || '',
      url: imageSource(record),
      name: record.name || `Character Image ${index + 1}`
    };
  }).filter(record => record.url || record.path);
  const portrait = imageSource(character.image || character.portrait || character.characterImage);
  if (portrait && !records.some(record => record.url === portrait)) {
    records.unshift({ id: 'current-portrait', rawId: '', url: portrait, name: 'Current Portrait', portraitOnly: true });
  }
  return records;
}

function GalleryImage({ campaignId, character, image, active, editable, busy, run, onPreview, onDelete }) {
  const [source, setSource] = useState(image.url);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  React.useEffect(() => { setSource(image.url); setFailed(false); }, [image.url]);
  const recover = async () => {
    if (!image.path || refreshing) return setFailed(true);
    setRefreshing(true);
    const result = await firebaseService.refreshGalleryImage(campaignId, character.id, image.rawId || image.id);
    if (result?.ok && result.url) {
      setSource(result.url);
      setFailed(false);
    } else setFailed(true);
    setRefreshing(false);
  };
  return <article className={active ? 'active' : ''}>
    <div className="react-gallery-image-frame">
      {source && !failed ? <button type="button" className="react-gallery-media-button" onClick={() => onPreview({ ...image, url:source })} aria-label={`Open ${image.name || 'character image'}`}><img src={source} alt={image.name || `${character.name} gallery`} onError={recover} /></button> : <div className="react-gallery-image-error"><b>Image unavailable</b><small>{image.path ? 'Retry the Firebase image.' : 'Upload this image again.'}</small>{image.path ? <button disabled={refreshing} onClick={recover}>{refreshing ? 'Loading...' : 'Retry'}</button> : null}</div>}
    </div>
    <b>{image.name || 'Character Image'}</b>
    <div>
      <button disabled={!editable || busy || active || !image.rawId || failed} onClick={() => run(() => firebaseService.setGalleryPortrait(campaignId, character.id, image.rawId), 'Character portrait updated.')}>Use as Portrait</button>
      <button className="danger" disabled={!editable || busy || !image.rawId} onClick={() => onDelete(image)}>Delete</button>
    </div>
  </article>;
}

export function GalleryTab({ campaignId, character, editable }) {
  const action=useSaveAction();
  const [preview,setPreview]=useState(null);
  const [deleteTarget,setDeleteTarget]=useState(null);
  const gallery=galleryRecords(character);
  const portrait=imageSource(character.image||character.portrait||character.characterImage||'');
  React.useEffect(()=>{
    const key=`${campaignId}:${character.id}`;
    if(!campaignId||!character.id||repairedGalleryLinks.has(key)) return;
    repairedGalleryLinks.add(key);
    firebaseService.syncGalleryMedia(campaignId,character.id).catch(()=>{});
  },[campaignId,character.id]);
  const upload=event=>{
    const file=event.target.files?.[0];
    if(file) action.run(()=>firebaseService.uploadGalleryImage(campaignId,character.id,file),'Image added to the gallery.');
    event.target.value='';
  };
  return <div className="react-gallery-workspace">
    <Panel title="Character Gallery" action={<StatusPill>{gallery.length} images</StatusPill>}>
      <div className="react-gallery-toolbar"><label className={`react-upload-button ${!editable||action.busy?'disabled':''}`}>Add Image<input type="file" accept="image/*" disabled={!editable||action.busy} onChange={upload}/></label><span>PNG, JPG, WEBP or GIF, up to 8 MB.</span></div>
      <div className="react-gallery-grid">{gallery.map(image=><GalleryImage key={image.id} campaignId={campaignId} character={character} image={image} active={portrait===image.url} editable={editable} busy={action.busy} run={action.run} onPreview={setPreview} onDelete={setDeleteTarget}/>)}{!gallery.length?<EmptyState title="No gallery images">Add artwork during a live session, then choose any image as the character portrait.</EmptyState>:null}</div>
      <p className="react-action-message">{action.message}</p>
    </Panel>
    {preview?<Modal title={preview.name||'Character Image'} eyebrow="Character Gallery" onClose={()=>setPreview(null)} footer={<button className="primary" onClick={()=>setPreview(null)}>Close</button>}><img className="react-gallery-lightbox-image" src={preview.url} alt={preview.name||`${character.name} gallery image`}/></Modal>:null}
    {deleteTarget?<Modal title="Delete Gallery Image?" eyebrow="Confirm Removal" busy={action.busy} onClose={()=>setDeleteTarget(null)} footer={<><button onClick={()=>setDeleteTarget(null)}>Cancel</button><button className="danger" disabled={action.busy} onClick={async()=>{const result=await action.run(()=>firebaseService.deleteGalleryImage(campaignId,character.id,deleteTarget.rawId),'Image removed.');if(result?.ok)setDeleteTarget(null);}}>Delete Image</button></>}><p>This permanently removes <b>{deleteTarget.name}</b>. If it is your active portrait, the next gallery image will become the character image.</p></Modal>:null}
  </div>;
}

export function DashboardSettingsTab({ campaignId, character, editable }) {
  const saved=useMemo(()=>normalizeDashboardPreferences(character),[character]);
  const [preferences,setPreferences]=useState(saved);
  const action=useSaveAction();
  const [draggedPanel,setDraggedPanel]=useState('');
  React.useEffect(()=>setPreferences(saved),[saved]);
  const titles=(Array.isArray(character.titles)?character.titles:[]).map((title,index)=>typeof title==='string'?{id:`title-${index}`,text:title}:title);
  const move=(index,direction)=>setPreferences(current=>{const rows=[...current.panelOrder];const target=index+direction;if(target<0||target>=rows.length)return current;[rows[index],rows[target]]=[rows[target],rows[index]];return {...current,panelOrder:rows};});
  const toggle=key=>setPreferences(current=>({...current,hiddenPanels:current.hiddenPanels.includes(key)?current.hiddenPanels.filter(value=>value!==key):[...current.hiddenPanels,key]}));
  const toggleInformation=key=>setPreferences(current=>({...current,hiddenInformationFields:current.hiddenInformationFields.includes(key)?current.hiddenInformationFields.filter(value=>value!==key):[...current.hiddenInformationFields,key]}));
  const dropPanel=target=>setPreferences(current=>{
    if(!draggedPanel||draggedPanel===target)return current;
    const rows=current.panelOrder.filter(key=>key!==draggedPanel);
    const targetIndex=rows.indexOf(target);
    rows.splice(targetIndex,0,draggedPanel);
    return {...current,panelOrder:rows};
  });
  return <div className="react-settings-workspace">
    <Panel title="Dashboard Layout" action={<StatusPill>{DEFAULT_DASHBOARD_PANELS.length-preferences.hiddenPanels.length} visible</StatusPill>}>
      <p className="react-help">Choose which dashboard panels are visible and arrange their display order.</p>
      <div className="react-panel-order-list">{preferences.panelOrder.map((key,index)=><article key={key} draggable={editable} className={draggedPanel===key?'dragging':''} onDragStart={()=>setDraggedPanel(key)} onDragEnd={()=>setDraggedPanel('')} onDragOver={event=>editable&&event.preventDefault()} onDrop={()=>dropPanel(key)}><label><input type="checkbox" disabled={!editable} checked={!preferences.hiddenPanels.includes(key)} onChange={()=>toggle(key)}/><b>{PANEL_LABELS[key]}</b></label><div><button title="Move up" disabled={!editable||index===0} onClick={()=>move(index,-1)}>Up</button><button title="Move down" disabled={!editable||index===preferences.panelOrder.length-1} onClick={()=>move(index,1)}>Down</button></div></article>)}</div>
    </Panel>
    <Panel title="Sidebar Identity">
      <label>Displayed Title<select disabled={!editable} value={preferences.visibleTitleId} onChange={event=>setPreferences(current=>({...current,visibleTitleId:event.target.value}))}><option value="">No player title</option>{titles.map(title=><option key={title.id} value={title.id}>{title.text}</option>)}</select></label>
      <label className="react-check-row"><input type="checkbox" disabled={!editable} checked={preferences.showPartyMembership} onChange={event=>setPreferences(current=>({...current,showPartyMembership:event.target.checked}))}/>Show Adventure Party membership</label>
      {!titles.length?<p className="react-help">Titles granted by the GM will appear here.</p>:null}
    </Panel>
    <Panel title="Player Information Bar">
      <p className="react-help">Character name, level, experience, core resources, campaign name, and navigation always remain visible.</p>
      <div className="react-information-field-list">{OPTIONAL_INFORMATION_FIELDS.map(key=><label className="react-check-row" key={key}><input type="checkbox" disabled={!editable} checked={!preferences.hiddenInformationFields.includes(key)} onChange={()=>toggleInformation(key)}/>{INFORMATION_LABELS[key]}</label>)}</div>
    </Panel>
    <div className="react-settings-save"><button className="primary" disabled={!editable||action.busy} onClick={()=>action.run(()=>firebaseService.updateDashboardPreferences(campaignId,character.id,preferences),'Dashboard settings saved.')}>Save Dashboard Settings</button><span>{action.message}</span></div>
  </div>;
}
