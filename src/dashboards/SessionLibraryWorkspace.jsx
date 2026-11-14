import React,{useEffect,useMemo,useState} from 'react';
import {Panel} from '../components/WorkspaceUI.jsx';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {
  sessionLibraryRows,sessionPdfFileError,SESSION_NOTE_KINDS
} from '../state/sessionLibraryModel.mjs';
import '../styles/session-library.css';

const blankNote=()=>({title:'',body:'',kind:'prep',sessionLabel:''});
const label=value=>String(value||'').replaceAll('-',' ').replace(/^./,c=>c.toUpperCase());
function useSessionLibrary(campaignId,mode='gm'){
  const [notes,setNotes]=useState([]),[pdfs,setPdfs]=useState([]);
  useEffect(()=>{
    setNotes([]);setPdfs([]);
    if(!campaignId)return;
    const stops=[firebaseService.subscribeSessionPdfs(campaignId,setPdfs,mode)];
    if(mode==='gm')stops.push(firebaseService.subscribeSessionNotes(campaignId,setNotes));
    return()=>stops.forEach(stop=>stop?.());
  },[campaignId,mode]);
  return {notes:sessionLibraryRows(notes),pdfs:sessionLibraryRows(pdfs)};
}
async function previewPdf(campaignId,record){
  const response=await firebaseService.fetchSessionPdf(campaignId,record);
  if(!response?.ok)throw Error(response?.error||'Unable to open PDF.');
  // A user gesture opens the tab before asynchronous authenticated blob loading.
  return URL.createObjectURL(new Blob([response.blob],{type:'application/pdf'}));
}
function PdfOpenButton({campaignId,record,onMessage}){
  const [busy,setBusy]=useState(false);
  return <button type="button" disabled={busy||record.status!=='ready'} onClick={async()=>{
    const win=window.open('','_blank');
    if(!win){onMessage('Allow pop-ups to preview the PDF.');return;}
    win.opener=null;setBusy(true);
    let url='';
    try{
      url=await previewPdf(campaignId,record);
      win.location.replace(url);
      // Keep the object URL alive while the PDF viewer is opening.
      window.setTimeout(()=>URL.revokeObjectURL(url),120000);
    }catch(error){win.close();if(url)URL.revokeObjectURL(url);onMessage(error.message||String(error));}
    finally{setBusy(false);}
  }}>{busy?'Opening...':'Open PDF'}</button>;
}
export function GMSessionLibraryWorkspace({campaignId}){
  const {notes,pdfs}=useSessionLibrary(campaignId,'gm');
  const [note,setNote]=useState(blankNote);
  const [editing,setEditing]=useState(null);
  const [search,setSearch]=useState('');
  const [file,setFile]=useState(null),[pdfDetails,setPdfDetails]=useState({title:'',description:''});
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const filteredNotes=useMemo(()=>notes.filter(row=>
    (row.title+' '+row.body+' '+row.kind+' '+row.sessionLabel).toLowerCase().includes(search.toLowerCase())),[notes,search]);
  const filteredPdfs=useMemo(()=>pdfs.filter(row=>
    (row.title+' '+row.fileName+' '+row.description).toLowerCase().includes(search.toLowerCase())),[pdfs,search]);
  const command=async action=>{
    if(busy)return null;
    setBusy(true);setMessage('');
    try{
      const response=await firebaseService.manageSessionLibrary(campaignId,'gm-scope',action);
      if(!response?.ok)throw Error(response?.error||'Library update failed.');
      setMessage('Campaign library synchronized.');
      return response;
    }catch(error){setMessage(error.message||String(error));return null;}
    finally{setBusy(false);}
  };
  const saveNote=async event=>{
    event.preventDefault();
    const id=editing?.id||crypto.randomUUID();
    const action=editing?{type:'update-note',id,expectedRevision:editing.revision,note}
      :{type:'create-note',id,note};
    if(await command(action)){setEditing(null);setNote(blankNote());}
  };
  const editNote=row=>{setEditing(row);setNote({title:row.title,body:row.body,kind:row.kind,sessionLabel:row.sessionLabel||''});};
  const upload=async event=>{
    event.preventDefault();
    const error=sessionPdfFileError(file);
    if(error){setMessage(error);return;}
    setBusy(true);setMessage('');
    try{
      const result=await firebaseService.uploadSessionPdf(campaignId,file,pdfDetails);
      if(!result?.ok)throw Error(result?.error||'Upload failed.');
      setMessage('Private PDF uploaded. Publish only when it is ready for players.');
      setFile(null);setPdfDetails({title:'',description:''});
      event.currentTarget?.reset?.();
    }catch(error){setMessage(error.message||String(error));}
    finally{setBusy(false);}
  };
  return <section className="asteria-session-library" aria-label="GM session notes and PDF library">
    <header><h2>Session Notes & PDF Library</h2><p>Structured notes are always GM-private. Uploaded PDFs are private until you explicitly publish them to campaign members.</p></header>
    <label>Search notes and PDFs<input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search this campaign library"/></label>
    <p role="status" aria-live="polite">{message}</p>
    <div className="asteria-session-library-grid">
      <Panel title="Structured GM Notes" eyebrow="Private campaign records">
        <form onSubmit={saveNote} className="asteria-session-library-form">
          <label>Note title<input required maxLength={140} value={note.title} onChange={event=>setNote({...note,title:event.target.value})}/></label>
          <div className="asteria-session-library-grid">
            <label>Category<select value={note.kind} onChange={event=>setNote({...note,kind:event.target.value})}>{SESSION_NOTE_KINDS.map(kind=><option key={kind} value={kind}>{label(kind)}</option>)}</select></label>
            <label>Session reference<input maxLength={100} placeholder="Session 12" value={note.sessionLabel} onChange={event=>setNote({...note,sessionLabel:event.target.value})}/></label>
          </div>
          <label>Note<textarea rows={6} maxLength={16000} value={note.body} onChange={event=>setNote({...note,body:event.target.value})}/></label>
          <div className="asteria-session-library-actions"><button type="submit" className="primary" disabled={busy}>{editing?'Update Note':'Create Note'}</button>{editing?<button type="button" onClick={()=>{setEditing(null);setNote(blankNote());}}>Cancel editing</button>:null}</div>
        </form>
        <div className="asteria-session-library-records">{filteredNotes.map(row=><article key={row.id}>
          <header><strong>{row.title}</strong><small>{label(row.kind)}{row.sessionLabel?' · '+row.sessionLabel:''}</small></header>
          <p>{row.body||'No additional text.'}</p>
          <div className="asteria-session-library-actions"><button disabled={busy} onClick={()=>editNote(row)}>Edit</button><button className="danger" disabled={busy} onClick={()=>{if(window.confirm('Archive this private note?'))command({type:'delete-note',id:row.id,expectedRevision:row.revision});}}>Archive</button></div>
        </article>)}{!filteredNotes.length?<p>No matching structured notes.</p>:null}</div>
      </Panel>
      <Panel title="PDF Document Library" eyebrow="Private upload and GM-approved player handouts">
        <form onSubmit={upload} className="asteria-session-library-form">
          <label>PDF title<input required maxLength={140} value={pdfDetails.title} onChange={event=>setPdfDetails({...pdfDetails,title:event.target.value})}/></label>
          <label>Description<input maxLength={600} value={pdfDetails.description} onChange={event=>setPdfDetails({...pdfDetails,description:event.target.value})}/></label>
          <label>Choose PDF (maximum 20 MB)<input type="file" accept=".pdf,application/pdf" onChange={event=>setFile(event.target.files?.[0]||null)}/></label>
          <button type="submit" className="primary" disabled={busy||!file}>Upload Private PDF</button>
        </form>
        <div className="asteria-session-library-records">{filteredPdfs.map(row=><article key={row.id}>
          <header><strong>{row.title}</strong><small>{row.fileName} · {row.visibility==='players'?'Shared with players':'GM private'} · {row.status}</small></header>
          <p>{row.description}</p>
          <div className="asteria-session-library-actions">
            <PdfOpenButton campaignId={campaignId} record={row} onMessage={setMessage}/>
            {row.status==='ready'?<button disabled={busy} onClick={()=>command({type:row.visibility==='players'?'unpublish-pdf':'publish-pdf',id:row.id,expectedRevision:row.revision})}>{row.visibility==='players'?'Unpublish':'Publish to Players'}</button>:null}
            <button className="danger" disabled={busy} onClick={async()=>{
              if(!window.confirm('Archive this PDF and revoke all player access?'))return;
              const result=await command({type:'archive-pdf',id:row.id,expectedRevision:row.revision});
              if(result){
                const removed=await firebaseService.removeSessionPdfBytes(campaignId,row);
                if(!removed?.ok)setMessage('PDF archived, but file cleanup requires a GM retry: '+(removed?.error||'Storage error'));
              }
            }}>Archive</button>
          </div>
        </article>)}{!filteredPdfs.length?<p>No matching PDFs.</p>:null}</div>
      </Panel>
    </div>
  </section>;
}
export function PlayerSessionLibraryWorkspace({campaignId}){
  const {pdfs}=useSessionLibrary(campaignId,'player');
  const [message,setMessage]=useState('');
  return <section className="asteria-session-library" aria-label="Campaign PDF handouts">
    <header><h2>Campaign Library</h2><p>Only documents deliberately shared by your GM appear here. Private GM notes and draft documents are never shown.</p></header>
    {message?<p role="alert">{message}</p>:null}
    <div className="asteria-session-library-records">{pdfs.filter(row=>row.visibility==='players'&&row.status==='ready').map(row=><article key={row.id}>
      <header><strong>{row.title}</strong><small>{row.fileName}</small></header>
      <p>{row.description}</p><PdfOpenButton campaignId={campaignId} record={row} onMessage={setMessage}/>
    </article>)}{!pdfs.length?<p>No campaign documents have been published yet.</p>:null}</div>
  </section>;
}
