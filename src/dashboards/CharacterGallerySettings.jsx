import { ThemeControls } from '../components/ThemeControls.jsx';
import { DashboardLayoutEditor } from '../components/DashboardCustomisation.jsx';
import React, { useMemo, useState } from 'react';
import { EmptyState, Modal, Panel, StatusPill } from '../components/WorkspaceUI.jsx';
import { firebaseService } from '../firebase/asteriaFirebaseService.js';
import { OPTIONAL_INFORMATION_FIELDS, normalizeDashboardPreferences } from '../state/liveWorkspaceModel.mjs';
import { visibleDashboardPanels } from '../state/dashboardLayoutModel.mjs';

const INFORMATION_LABELS = {
  portrait:'Character portrait', title:'Displayed player title', party:'Adventure Party membership',
  currency:'Currency summary', campaignDetails:'Location, region, date, and time', liveSync:'Live sync status'
};

const repairedGalleryLinks = new Set();

function useSaveAction() {
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const run=async (operation,success)=>{setBusy(true);setMessage('Saving...');try{const result=await operation();setMessage(result?.ok?success:result?.error||'The change could not be saved.');return result;}catch(error){setMessage(error.message||String(error));return {ok:false};}finally{setBusy(false);}};
  return {busy,message,setMessage,run};
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
    firebaseService.syncGalleryMedia(campaignId,character.id).then(result=>{
      if(!result?.ok) action.setMessage(result?.error||'Gallery references could not be synchronized.');
    }).catch(error=>action.setMessage(error.message||'Gallery references could not be synchronized.'));
  },[campaignId,character.id]);
  const upload=event=>{
    const file=event.target.files?.[0];
    if(file) action.run(()=>firebaseService.uploadGalleryImage(campaignId,character.id,file),'Image added to the gallery.');
    event.target.value='';
  };
  return <div className="react-gallery-workspace">
    <Panel title="Character Gallery" action={<StatusPill>{gallery.length} images</StatusPill>}>
      <div className="react-gallery-toolbar"><label className={`react-upload-button ${!editable||action.busy?'disabled':''}`}>Add Image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={!editable||action.busy} onChange={upload}/></label><span>PNG, JPG, WEBP or GIF, up to 8 MB.</span></div>
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
  React.useEffect(()=>setPreferences(saved),[saved]);
  const titles=(Array.isArray(character.titles)?character.titles:[]).map((title,index)=>typeof title==='string'?{id:`title-${index}`,text:title}:title);
  const updateLayout=update=>setPreferences(current=>({...current,dashboardLayout:typeof update==='function'?update(current.dashboardLayout):update}));
  const toggleInformation=key=>setPreferences(current=>({...current,hiddenInformationFields:current.hiddenInformationFields.includes(key)?current.hiddenInformationFields.filter(value=>value!==key):[...current.hiddenInformationFields,key]}));
  const save=()=>action.run(()=>firebaseService.updateDashboardPreferences(campaignId,character.id,preferences),'Dashboard settings saved.');
  return <div className="react-settings-workspace"><ThemeControls/>
    <Panel title="Dashboard Customisation" action={<StatusPill>{visibleDashboardPanels(preferences.dashboardLayout,'player').length} panels</StatusPill>}>
      <DashboardLayoutEditor role="player" layout={preferences.dashboardLayout} onChange={updateLayout} disabled={!editable}/>
      <p className="react-help">These settings affect only this character. Open the Visual Grid Editor to move, resize and lock panels. Select Apply Layout, then Save Dashboard Settings. Reset Layout restores the recommended defaults.</p>
    </Panel>
    <Panel title="Sidebar Identity">
      <label>Displayed Title<select disabled={!editable} value={preferences.visibleTitleId} onChange={event=>setPreferences(current=>({...current,visibleTitleId:event.target.value}))}><option value="">No player title</option>{titles.map(title=><option key={title.id} value={title.id}>{title.text}</option>)}</select></label>
      <label className="react-check-row"><input type="checkbox" disabled={!editable} checked={preferences.showPartyMembership} onChange={event=>setPreferences(current=>({...current,showPartyMembership:event.target.checked}))}/>Show Adventure Party membership</label>
      {!titles.length?<p className="react-help">Titles granted by the GM will appear here.</p>:null}
    </Panel>
    <Panel title="Player Information Bar">
      <p className="react-help">Character name, level, experience, core resources, campaign name, and navigation always remain visible. These controls change optional details, never the resource or level widgets.</p>
      <div className="react-information-field-list">{OPTIONAL_INFORMATION_FIELDS.map(key=><label className="react-check-row" key={key}><input type="checkbox" disabled={!editable} checked={!preferences.hiddenInformationFields.includes(key)} onChange={()=>toggleInformation(key)}/>{INFORMATION_LABELS[key]}</label>)}</div>
    </Panel>
    <div className="react-settings-save"><button className="primary" disabled={!editable||action.busy} onClick={save}>Save Dashboard Settings</button><span role="status">{action.message}</span></div>
  </div>;
}
