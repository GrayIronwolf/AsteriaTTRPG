import React,{useEffect,useState} from 'react';
import {SurfacePanel} from '../components/ui/SurfacePanel.jsx';
import {BodyText} from '../components/ui/Typography.jsx';
import styles from '../pages/PlayerDashboardPage.module.css';

/** Authenticated gallery workspace; the existing dashboard service owns all writes. */
export function PlayerGalleryWorkspace({api,character,campaignId,characterId,editable=false}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),
    [message,setMessage]=useState(''),[preview,setPreview]=useState(null),
    [deleteTarget,setDeleteTarget]=useState(null),[recovered,setRecovered]=useState({});
  useEffect(()=>{setBusy(false);setError('');setMessage('');setPreview(null);
    setDeleteTarget(null);setRecovered({});},[campaignId,characterId]);
  const rows=character.gallery||[];
  const portrait=character.image||'';
  const run=async(work,success)=>{
    if(busy||!editable||!campaignId)return {ok:false};
    setBusy(true);setError('');setMessage('');
    try{
      const result=await work();
      setMessage(result.storageCleanupPending?success+' Storage cleanup needs retry.':success);
      return result;
    }catch(e){setError(e?.message||'Gallery action failed.');return {ok:false};}
    finally{setBusy(false);}
  };
  const upload=async event=>{
    const file=event.target.files?.[0];event.target.value='';
    if(file)await run(()=>api.uploadGalleryImage(campaignId,characterId,file),
      'Image added to the gallery.');
  };
  const recover=async image=>{
    try{setError('');
      const result=await api.refreshGalleryImage(campaignId,characterId,image.rawId);
      setRecovered(current=>({...current,[image.id]:result.url}));
    }catch(error){setError(error?.message||'Gallery image could not be recovered.');}
  };
  const remove=async()=>{
    if(!deleteTarget)return;
    const result=await run(()=>api.deleteGalleryImage(campaignId,characterId,
      deleteTarget.rawId),'Gallery image removed.');
    if(result?.ok){setDeleteTarget(null);if(preview?.id===deleteTarget.id)setPreview(null);}
  };
  return <SurfacePanel as="section" className={styles.panel} data-testid="site-player-gallery">
    <h3>Character Gallery</h3>
    <div className={styles.galleryToolbar}>
      <label>Add Image <input aria-label="Add Gallery Image" type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        disabled={!editable||busy||!campaignId} onChange={upload}/></label>
      <span>{rows.length} images · PNG, JPG, WEBP or GIF · Maximum 8 MB</span>
    </div>
    {error?<p role="alert">{error}</p>:null}
    {message?<p role="status">{message}</p>:null}
    {!editable?<BodyText muted>Gallery changes require an owned character linked to an active campaign session.</BodyText>:null}
    {rows.length?<div className={styles.galleryGrid}>
      {rows.map(image=>{
        const url=recovered[image.id]||image.url;
        const active=Boolean(url&&portrait===url);
        return <article key={image.id} className={styles.galleryCard}>
          {url?<button className={styles.galleryImageButton} type="button"
            aria-label={'Preview '+image.name} onClick={()=>setPreview({...image,url})}>
            <img src={url} alt={image.name} loading="lazy"
              onError={()=>{if(image.path&&image.rawId&&!recovered[image.id])recover(image);}}/>
          </button>:<div className={styles.galleryUnavailable}>
            <span>Image unavailable</span>
            {image.path&&image.rawId?<button type="button" disabled={busy}
              onClick={()=>recover(image)}>Retry image</button>:null}
          </div>}
          <strong>{image.name}</strong>
          {active?<span>Current portrait</span>:null}
          <div className={styles.galleryActions}>
            <button type="button" disabled={!editable||busy||!image.managed||active||!url}
              onClick={()=>run(()=>api.setGalleryPortrait(campaignId,characterId,
                image.rawId),'Character portrait updated.')}>Use as Portrait</button>
            <button type="button" disabled={!editable||busy||!image.managed}
              onClick={()=>setDeleteTarget(image)}>Delete</button>
          </div>
        </article>;
      })}
    </div>:<BodyText muted>No gallery images recorded. Upload an image to select your character portrait.</BodyText>}
    {preview?<div role="dialog" aria-modal="true" aria-label="Character Gallery Preview"
      className={styles.galleryPreview}>
      <button type="button" onClick={()=>setPreview(null)}>Close Preview</button>
      <img src={preview.url} alt={preview.name}/>
    </div>:null}
    {deleteTarget?<div role="dialog" aria-modal="true" aria-label="Confirm Gallery Deletion"
      className={styles.galleryConfirm}>
      <p>Delete {deleteTarget.name} permanently?</p>
      <div className={styles.galleryActions}>
        <button type="button" disabled={busy} onClick={()=>setDeleteTarget(null)}>Cancel</button>
        <button type="button" disabled={busy} onClick={remove}>Delete Image</button>
      </div>
    </div>:null}
  </SurfacePanel>;
}
