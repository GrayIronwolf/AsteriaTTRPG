// Pure and bounded journal projection; no legacy global state or data writes.
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=(value,max)=>typeof value==='string'?value.slice(0,max):'';
export function projectJournal(value){
  if(!Array.isArray(value))return Object.freeze([]);
  return Object.freeze(value.slice(0,500).map((row,index)=>{
    if(typeof row==='string')return Object.freeze({id:'legacy-'+index,title:'Journal Entry',content:row.slice(0,20000),createdAt:''});
    if(!plain(row))return null;
    return Object.freeze({
      id:text(row.id,160)||'legacy-'+index,
      title:text(row.title||row.name||'Journal Entry',120),
      content:text(row.body||row.content||row.text||row.note,20000),
      createdAt:typeof row.createdAt==='string'?text(row.createdAt,64):'',
      updatedAt:typeof row.updatedAt==='string'?text(row.updatedAt,64):''
    });
  }).filter(Boolean));
}
export function validateJournalDraft(draft={}){
  const title=typeof draft.title==='string'?draft.title.trim():'';
  const body=typeof draft.body==='string'?draft.body.trim():'';
  if(title.length>120)throw Error('Journal title must be 120 characters or fewer.');
  if(!body||body.length>20000)throw Error('Journal entry must contain 1–20,000 characters.');
  return Object.freeze({title:title||'Journal Entry',body});
}

/** Pure stale-write guard used by BOTH owner and campaign journal copies.
 * Never update a different legacy row if concurrent activity changed its index.
 */
export function changeJournalRows(rows,{action,entryId,expected,draft,replacementId,updatedAt}={}){
  if(!Array.isArray(rows)||rows.length>500)throw Error('Journal records are unavailable.');
  if(!['update','delete'].includes(action))throw Error('Unsupported journal operation.');
  if(typeof entryId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(entryId))
    throw Error('Choose an existing journal entry.');
  if(!plain(expected)||typeof expected.title!=='string'||
    typeof expected.content!=='string'||typeof expected.createdAt!=='string')
    throw Error('The journal entry must be refreshed before changing it.');
  const projections=projectJournal(rows);
  const indices=projections.flatMap((entry,index)=>entry.id===entryId?[index]:[]);
  if(indices.length!==1)throw Error('Journal entry was removed or is ambiguous. Refresh before editing.');
  const index=indices[0],current=projections[index];
  if(current.title!==expected.title||current.content!==expected.content||
    current.createdAt!==expected.createdAt)
    throw Error('This journal entry changed in another session. Reload before editing.');
  if(action==='delete')return Object.freeze(rows.filter((_,position)=>position!==index));
  const value=validateJournalDraft(draft);
  const legacy=entryId.startsWith('legacy-');
  const stableId=legacy?replacementId:entryId;
  if(typeof stableId!=='string'||!/^journal-[A-Za-z0-9-]{4,150}$/.test(stableId)&&legacy)
    throw Error('Cannot safely migrate this legacy journal entry.');
  const raw=plain(rows[index])?rows[index]:{};
  const next={...raw,id:stableId,title:value.title,updatedAt:String(updatedAt||'').slice(0,64)};
  // Retain the original text field when old readers use content or text.
  const fields=['body','content','text','note'].filter(key=>
    Object.prototype.hasOwnProperty.call(raw,key));
  if(!fields.length)next.body=value.body;
  else for(const field of fields)next[field]=value.body;
  const changed=rows.slice();changed[index]=next;
  return Object.freeze(changed);
}
