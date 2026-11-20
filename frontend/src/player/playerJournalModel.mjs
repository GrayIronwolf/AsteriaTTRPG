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
      createdAt:typeof row.createdAt==='string'?text(row.createdAt,64):''
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
