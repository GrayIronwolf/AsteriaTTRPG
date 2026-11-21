import React,{useEffect,useMemo,useState} from 'react';
import {
  CAMPAIGN_MEDIA_LIBRARY_TYPES,filterCampaignMediaLibrary,
  campaignMediaLibraryCounts
} from '../../../src/state/campaignMediaLibraryModel.mjs';
import styles from './GMMediaLibrary.module.css';

const names=Object.freeze({
  'battle-map':'Battle Map','atlas-map':'Atlas Map',image:'Image',
  'video-cinematic':'Cinematic Video','pdf-handout':'PDF Handout',
  audio:'Audio',recording:'Recording',scene:'Scene'
});
const stamp=time=>time?new Date(time).toLocaleDateString():'No update date';

export function GMMediaLibrary({api,campaignId,onNavigate}){
  const [items,setItems]=useState([]),[loading,setLoading]=useState(true);
  const [error,setError]=useState(''),[category,setCategory]=useState('all');
  const [visibility,setVisibility]=useState('all'),[query,setQuery]=useState('');
  const [preview,setPreview]=useState(null),[previewBusy,setPreviewBusy]=useState(false);
  const [previewError,setPreviewError]=useState('');
  useEffect(()=>{
    setItems([]);setLoading(true);setError('');setPreview(null);
    if(!api?.watchGMMediaLibrary){
      setLoading(false);setError('Media Library is not enabled in this build.');return;
    }
    return api.watchGMMediaLibrary(campaignId,rows=>{
      setItems(rows);setLoading(false);setError('');
    },failure=>{
      setItems([]);setLoading(false);
      setPreview(null);
      setError(failure?.message||'GM media library access was revoked.');
    });
  },[api,campaignId]);
  useEffect(()=>()=>{
    if(preview?.url)URL.revokeObjectURL(preview.url);
  },[preview]);
  const filtered=useMemo(()=>filterCampaignMediaLibrary(items,{
    category,visibility,query
  }),[items,category,visibility,query]);
  const counts=useMemo(()=>campaignMediaLibraryCounts(items),[items]);
  const inspect=async item=>{
    setPreview(null);setPreviewError('');setPreviewBusy(true);
    try{
      if(!item.previewable)throw Error('Finish uploading this file before previewing.');
      const result=await api.fetchGMMediaLibraryPreview(campaignId,item);
      const url=URL.createObjectURL(result.blob);
      setPreview({id:item.id,url,kind:item.mediaKind,contentType:result.contentType});
    }catch(failure){
      setPreviewError(failure?.message||'Media preview failed.');
    }finally{setPreviewBusy(false);}
  };
  return <section className={styles.library} data-testid="site-gm-media-library">
    <header>
      <h2>Campaign Media Library</h2>
      <p>One private, read-only catalogue of your campaign’s original media.
        Files stay in their existing libraries. Only the GM can view this index.</p>
    </header>
    <div className={styles.stats} aria-label="Media library totals">
      <span>{counts.total} assets</span>
      <span>{counts.private} GM only</span>
      <span>{counts.shared} currently published</span>
      <span>{counts.pending} pending upload</span>
    </div>
    <div className={styles.filters}>
      <label>Search media
        <input type="search" maxLength={120} value={query}
          onChange={event=>setQuery(event.target.value)}
          placeholder="Search title, source or description"/>
      </label>
      <label>Media category
        <select value={category} onChange={event=>setCategory(event.target.value)}>
          <option value="all">All categories</option>
          {CAMPAIGN_MEDIA_LIBRARY_TYPES.map(type=>
            <option value={type} key={type}>{names[type]}</option>)}
        </select>
      </label>
      <label>Visibility
        <select value={visibility} onChange={event=>setVisibility(event.target.value)}>
          <option value="all">All media</option>
          <option value="gm">GM only</option>
          <option value="players">Published to players</option>
        </select>
      </label>
    </div>
    {loading?<p role="status">Verifying GM membership and indexing existing media…</p>:null}
    {error?<p role="alert">{error}</p>:null}
    {!loading&&!error&&!filtered.length?<p role="status">
      {items.length?'No media match the current filters.':
        'No existing campaign media found. Use the original media tabs to add files.'}
    </p>:null}
    <div className={styles.grid} aria-label="Campaign media catalogue">
      {filtered.map(item=><article className={styles.asset} key={item.id}>
        <div className={styles.assetHead}>
          <strong>{item.title}</strong>
          <span>{names[item.category]}</span>
        </div>
        {item.description?<p>{item.description}</p>:null}
        <dl>
          <div><dt>Visibility</dt><dd>{item.shared?'Published':'GM only'}</dd></div>
          <div><dt>Status</dt><dd>{item.status}</dd></div>
          <div><dt>Original library</dt><dd>{item.source}</dd></div>
          <div><dt>Updated</dt><dd>{stamp(item.updatedAt)}</dd></div>
        </dl>
        <div className={styles.actions}>
          <button type="button" onClick={()=>onNavigate?.(item.originalTab)}>
            Open original workspace
          </button>
          <button type="button" disabled={previewBusy||!item.previewable}
            onClick={()=>inspect(item)}>Private preview</button>
        </div>
        {preview?.id===item.id?<div className={styles.preview}>
          {preview.kind==='image'?<img src={preview.url} alt={item.title}/>:
            preview.kind==='video'?<video src={preview.url} controls muted playsInline/>:
            preview.kind==='audio'?<audio src={preview.url} controls preload="metadata"/>:
            preview.kind==='pdf'?<a href={preview.url} target="_blank"
              rel="noopener noreferrer">Open authenticated PDF preview</a>:null}
          <button type="button" onClick={()=>setPreview(null)}>Close preview</button>
        </div>:null}
      </article>)}
    </div>
    {previewError?<p role="alert">{previewError}</p>:null}
    <p className={styles.footnote}>Preview does not publish or share media.
      Use the original source workspace for upload, editing, visibility and removal.
      Temporary preview URLs are revoked when closed.</p>
  </section>;
}
