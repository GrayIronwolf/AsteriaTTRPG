import {inventoryActivityRecords,filterInventoryActivityRecords} from './inventoryActivityModel.mjs';
import {filterInventoryJournalDate,inventoryJournalReceipt,inventoryJournalCsvCell} from './inventoryJournalReceiptModel.mjs';

// Phase 7.3: GM-facing read-only view over the campaign's existing, retained
// character histories and targeted events. No cross-campaign fetch or writes.
export const GM_INVENTORY_AUDIT_LIMIT=200;
const safe=(value,max=160)=>String(value??'').slice(0,max);
const array=value=>Array.isArray(value)?value:[];

export function gmInventoryAuditRows(characters={},events=[],limit=GM_INVENTORY_AUDIT_LIMIT){
  const roster=Object.values(characters||{}).filter(c=>c&&typeof c==='object'&&c.id);
  const rows=[];
  for(const character of roster){
    // Apply the existing owner/character targeting checks to each record.
    const history=inventoryActivityRecords(character,events,100);
    for(const entry of history){
      rows.push({
        id:String(character.id)+':'+entry.id,
        receiptId:entry.id,
        characterId:String(character.id),
        characterName:safe(character.name||character.id,100),
        category:entry.category,
        title:safe(entry.title,220),
        type:entry.type,
        at:entry.at,
        source:entry.source,
        pending:entry.pending===true
      });
    }
  }
  // Do not conflate different characters' matching transaction IDs: both sides
  // of a trade need their own distinct history entry.
  return rows.sort((a,b)=>b.at-a.at||a.id.localeCompare(b.id))
    .slice(0,Math.max(0,Math.min(GM_INVENTORY_AUDIT_LIMIT,Number.isSafeInteger(limit)?limit:0)));
}

export function filterGMInventoryAudit(rows=[],{characterId='all',category='all',query='',dateRange='all',now=Date.now()}={}){
  const scoped=array(rows).filter(row=>characterId==='all'||row.characterId===characterId);
  const filtered=filterInventoryActivityRecords(scoped,{category,query});
  return filterInventoryJournalDate(filtered,dateRange,now);
}

export function gmInventoryAuditReceipt(row={}){
  const base=inventoryJournalReceipt({...row,id:row.receiptId||row.id});
  return {...base,character:safe(row.characterName,100),characterId:safe(row.characterId,160),
    pending:row.pending===true};
}

export function exportGMInventoryAuditCsv(rows=[]){
  const header=['Date (UTC)','Character','Character ID','Category','Activity','Reference','Source'];
  const lines=[header.map(inventoryJournalCsvCell).join(',')];
  for(const row of array(rows).slice(0,GM_INVENTORY_AUDIT_LIMIT)){
    const receipt=gmInventoryAuditReceipt(row);
    lines.push([
      receipt.dateUtc,receipt.character,receipt.characterId,
      receipt.category,receipt.activity,receipt.reference,receipt.origin
    ].map(inventoryJournalCsvCell).join(','));
  }
  return '\uFEFF'+lines.join('\r\n')+'\r\n';
}
