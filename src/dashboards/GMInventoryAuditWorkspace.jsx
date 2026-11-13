import React,{useMemo,useState} from 'react';
import {Panel} from '../components/WorkspaceUI.jsx';
import {INVENTORY_ACTIVITY_CATEGORIES} from '../state/inventoryActivityModel.mjs';
import {INVENTORY_JOURNAL_DATE_RANGES,inventoryJournalFilename} from '../state/inventoryJournalReceiptModel.mjs';
import {
  gmInventoryAuditRows,filterGMInventoryAudit,
  gmInventoryAuditReceipt,exportGMInventoryAuditCsv
} from '../state/gmInventoryAuditModel.mjs';

export function GMInventoryAuditWorkspace({characters={},events=[]}){
  const [characterId,setCharacterId]=useState('all');
  const [category,setCategory]=useState('all');
  const [query,setQuery]=useState('');
  const [dateRange,setDateRange]=useState('all');
  const [selected,setSelected]=useState('');
  const roster=useMemo(()=>Object.values(characters||{}).filter(row=>row?.id),[characters]);
  const records=useMemo(()=>gmInventoryAuditRows(characters,events),[characters,events]);
  const visible=useMemo(()=>filterGMInventoryAudit(records,{characterId,category,query,dateRange}),[records,characterId,category,query,dateRange]);
  const chosen=visible.find(row=>row.id===selected);
  const receipt=chosen?gmInventoryAuditReceipt(chosen):null;
  const exportCsv=()=>{
    if(!visible.length)return;
    const blob=new Blob([exportGMInventoryAuditCsv(visible)],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;
    link.download=inventoryJournalFilename('gm-campaign-audit');
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };
  return <Panel title="Campaign Inventory & Trade Audit" eyebrow="GM-only · Existing transaction history">
    <p className="react-inventory-journal-help">Review the available inventory, shop, party-stash, treasure and trade history across linked campaign characters. This is read-only and does not reconstruct older records.</p>
    <div className="react-inventory-journal-controls">
      <label>Character<select value={characterId} onChange={event=>{setCharacterId(event.target.value);setSelected('');}}>
        <option value="all">All campaign characters</option>
        {roster.map(character=><option key={character.id} value={character.id}>{character.name||character.id}</option>)}
      </select></label>
      <label>Category<select value={category} onChange={event=>setCategory(event.target.value)}>
        {INVENTORY_ACTIVITY_CATEGORIES.map(row=><option key={row.id} value={row.id}>{row.label}</option>)}
      </select></label>
      <label>Date range<select value={dateRange} onChange={event=>setDateRange(event.target.value)}>
        {INVENTORY_JOURNAL_DATE_RANGES.map(row=><option key={row.id} value={row.id}>{row.label}</option>)}
      </select></label>
      <label>Search transactions<input type="search" maxLength="120" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Item, merchant or transaction"/></label>
    </div>
    <div className="react-inventory-journal-actions">
      <small>Showing {visible.length} of {records.length} available recent records.</small>
      <button type="button" disabled={!visible.length} onClick={exportCsv}>Export filtered GM CSV</button>
    </div>
    <div className="react-gm-audit-journal">
      {visible.map(row=><article key={row.id} className="react-gm-audit-journal-row">
        <div><b>{row.characterName}</b> · {INVENTORY_ACTIVITY_CATEGORIES.find(c=>c.id===row.category)?.label||'Inventory'}
          <p>{row.title}</p>
          {row.at?<time dateTime={new Date(row.at).toISOString()}>{new Date(row.at).toLocaleString()}</time>:null}
        </div>
        <button type="button" aria-expanded={selected===row.id} onClick={()=>setSelected(id=>id===row.id?'':row.id)}>{selected===row.id?'Hide receipt':'View receipt'}</button>
      </article>)}
      {!visible.length?<p>No available transactions match these filters.</p>:null}
    </div>
    {receipt?<section aria-label="Selected GM transaction receipt" className="react-inventory-journal-receipt">
      <h4>Transaction receipt</h4>
      <dl>
        <dt>Character</dt><dd>{receipt.character}</dd>
        <dt>Character ID</dt><dd>{receipt.characterId}</dd>
        <dt>Reference</dt><dd>{receipt.reference}</dd>
        <dt>Recorded (UTC)</dt><dd>{receipt.dateUtc||'Date unavailable'}</dd>
        <dt>Category</dt><dd>{receipt.category}</dd>
        <dt>Activity</dt><dd>{receipt.activity}</dd>
        <dt>Source</dt><dd>{receipt.origin}</dd>
      </dl>
      <small>Transaction details reflect retained character records and available campaign events.</small>
      <button type="button" onClick={()=>setSelected('')}>Close receipt</button>
    </section>:null}
    <small>Audit and CSV export cover at most 200 recent retained entries. GM notes, curses, unrevealed item lore and private table data are not included.</small>
  </Panel>;
}
