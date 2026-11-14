import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 sessionLibraryId,sessionNoteInput,sessionPdfInput,sessionPdfPath,sessionPdfFileError,
 publicSessionPdf,validateSessionLibraryAction
} from '../src/state/sessionLibraryModel.mjs';
import {createSessionLibraryCommands} from '../functions/sessionLibraryCommands.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const note={title:'Altarin preparation',body:'GM secret plans',kind:'prep',sessionLabel:'Session 1'};
const pdf={title:'Player handout',description:'Public history',fileName:'handout.pdf',size:1234};
function harness(denied=false){
 const store=new Map(),writes=[],reads=[];
 const doc=(_db,...parts)=>({path:parts.join('/')});
 const tx={
  get:async ref=>{reads.push(ref.path);const v=store.get(ref.path);return {exists:()=>v!==undefined,data:()=>v};},
  set:(ref,value,options)=>{writes.push(ref.path);store.set(ref.path,options?.merge?{...store.get(ref.path),...value}:value);},
  update:(ref,value)=>{writes.push(ref.path);store.set(ref.path,{...store.get(ref.path),...value});},
  delete:ref=>{writes.push(ref.path);store.delete(ref.path);}
 };
 const context={db:{},doc,currentUser:{uid:'gm'},serverTimestamp:()=>123,runTransaction:async(_db,callback)=>callback(tx)};
 const commands=createSessionLibraryCommands(context,{requireCampaignGM:async()=>{
  if(denied)throw Error('GM only');
 }});
 return {store,writes,reads,run:action=>commands.manageSessionLibrary('test-campaign','gm-scope',action)};
}
test('Strict note validation and filename/path constraints',()=>{
 assert.deepEqual(sessionNoteInput(note),note);
 assert.throws(()=>sessionNoteInput({...note,secretOverride:true}));
 assert.throws(()=>sessionNoteInput({...note,kind:'public'}));
 assert.throws(()=>sessionNoteInput({...note,title:' '}));
 assert.throws(()=>sessionNoteInput({...note,body:'x'.repeat(16001)}));
 assert.deepEqual(sessionPdfInput(pdf),pdf);
 assert.equal(sessionLibraryId('../bad'),false);
 assert.equal(sessionPdfPath('camp','pdf-one'),'campaigns/camp/sessionPdfs/pdf-one/document.pdf');
 assert.throws(()=>sessionPdfPath('../camp','doc'));
 assert.equal(sessionPdfFileError({name:'note.pdf',type:'application/pdf',size:500}),'');
 assert.match(sessionPdfFileError({name:'bad.txt',type:'text/plain',size:500}),/PDF/);
 assert.match(sessionPdfFileError({name:'big.pdf',type:'application/pdf',size:21*1024*1024}),/20 MB/);
 assert.throws(()=>sessionPdfInput({...pdf,fileName:'../bad.pdf'}));
});
test('No arbitrary fields or stale revision can be forged',()=>{
 assert.equal(validateSessionLibraryAction({type:'create-note',id:'note1',note}),'create-note');
 assert.throws(()=>validateSessionLibraryAction({type:'create-note',id:'note1',note,visibility:'players'}));
 assert.throws(()=>validateSessionLibraryAction({type:'publish-pdf',id:'doc',expectedRevision:0}));
 assert.throws(()=>validateSessionLibraryAction({type:'publish-pdf',id:'doc',expectedRevision:1,gmNotes:'secret'}));
});
test('Create, edit, and archive private GM notes with optimistic locking',async()=>{
 const h=harness();
 assert.equal((await h.run({type:'create-note',id:'a',note})).ok,true);
 assert.equal(h.store.get('campaigns/test-campaign/sessionNotes/a').createdBy,'gm');
 assert.equal((await h.run({type:'update-note',id:'a',expectedRevision:1,note:{...note,title:'New title'}})).ok,true);
 assert.equal((await h.run({type:'update-note',id:'a',expectedRevision:1,note})).ok,false);
 assert.equal((await h.run({type:'delete-note',id:'a',expectedRevision:2})).ok,true);
 assert.equal(h.store.get('campaigns/test-campaign/sessionNotes/a').status,'archived');
});
test('PDF staging is always private until explicit publication and revocable',async()=>{
 const h=harness(),id='doc1',base={id,expectedRevision:1};
 assert.equal((await h.run({type:'reserve-pdf',id,details:pdf})).ok,true);
 let row=h.store.get('campaigns/test-campaign/sessionPdfs/'+id);
 assert.equal(row.visibility,'gm');assert.equal(row.status,'uploading');
 assert.equal((await h.run({type:'publish-pdf',...base})).ok,false);
 assert.equal((await h.run({type:'finish-pdf',...base})).ok,true);
 assert.equal((await h.run({type:'publish-pdf',id,expectedRevision:2})).ok,true);
 row=h.store.get('campaigns/test-campaign/sessionPdfsShared/'+id);
 assert.deepEqual(Object.keys(row).sort(),['description','fileName','id','revision','size','status','storagePath','title','visibility'].sort());
 assert.equal(JSON.stringify(row).includes('createdBy'),false);
 assert.equal((await h.run({type:'unpublish-pdf',id,expectedRevision:3})).ok,true);
 assert.equal(h.store.has('campaigns/test-campaign/sessionPdfsShared/'+id),false);
 assert.equal((await h.run({type:'archive-pdf',id,expectedRevision:4})).ok,true);
 assert.equal(h.store.get('campaigns/test-campaign/sessionLibraryConfig/current').pdfs,0);
 assert.throws(()=>publicSessionPdf({...row,visibility:'gm'}));
});
test('Rejected non-GM requests cannot read or mutate library data',async()=>{
 const h=harness(true);
 const result=await h.run({type:'create-note',id:'secret',note});
 assert.equal(result.ok,false);
 assert.equal(h.writes.length,0);assert.equal(h.reads.length,0);
});
test('Both dashboards and trusted service routes are wired',()=>{
 const source=['src/dashboards/GMDashboard.jsx','src/dashboards/CharacterDashboard.jsx',
  'src/dashboards/SessionLibraryWorkspace.jsx','src/state/gmToolkitModel.mjs',
  'js/firebase-auth.js','src/firebase/asteriaFirebaseService.js',
  'functions/handler.mjs','functions/commands.mjs','firestore.rules','storage.rules']
  .map(read).join('\n');
 for(const term of ['GMSessionLibraryWorkspace','PlayerSessionLibraryWorkspace','manageSessionLibrary',
  'subscribeSessionNotes','subscribeSessionPdfs','sessionPdfsShared','sessionPdfPath'])
  assert.ok(source.includes(term),'Missing '+term);
 assert.match(read('storage.rules'),/20 \* 1024 \* 1024/);
});
