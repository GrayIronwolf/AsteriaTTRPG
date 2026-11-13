// Phase 7.2 — read-only inventory journal receipts and local CSV export.
// Consume only the owner-scoped, normalized Phase 7.1 journal records.
// Do not export raw Firestore events, character sheets, secret item metadata,
// GM notes, barter escrow details, or unpublished loot table fields.

export const INVENTORY_JOURNAL_DATE_RANGES=Object.freeze([
  {id:'all',label:'All available dates',days:null},
  {id:'7d',label:'Last 7 days',days:7},
  {id:'30d',label:'Last 30 days',days:30},
  {id:'90d',label:'Last 90 days',days:90}
]);

const DATE_MILLISECONDS=24*60*60*1000;
const CATEGORIES=Object.freeze({
  loot:'Treasure',trade:'Trading',shop:'Merchants',stash:'Stashes',
  currency:'Currency',equipment:'Equipment',inventory:'Inventory'
});
const safeString=(value,max)=>String(value??'').slice(0,max);
const formatUtc=(time)=>{
  const ms=Number(time);
  return Number.isFinite(ms)&&ms>0&&ms<=8.64e15?new Date(ms).toISOString():'';
};

export function filterInventoryJournalDate(records=[],range='all',now=Date.now()){
  const choice=INVENTORY_JOURNAL_DATE_RANGES.find(v=>v.id===range);
  if(!choice)return [];
  const rows=Array.isArray(records)?records:[];
  if(choice.days===null)return rows;
  const current=Number(now);
  if(!Number.isFinite(current)||current<=0)return [];
  const cutoff=current-choice.days*DATE_MILLISECONDS;
  return rows.filter(row=>{
    const at=Number(row?.at);
    return Number.isFinite(at)&&at>0&&at>=cutoff&&at<=current;
  });
}

export function inventoryJournalReceipt(row={}){
  const reference=safeString(row.id,180);
  if(!reference)throw Error('An activity reference is required.');
  return {
    reference,
    dateUtc:formatUtc(row.at),
    category:CATEGORIES[row.category]||CATEGORIES.inventory,
    activity:safeString(row.title,220),
    origin:row.source==='event'?'Campaign event':'Character activity'
  };
}

// Quote every cell; prefix potential spreadsheet formulas even when preceded
// by whitespace/control characters. RFC-4180 escaping plus CRLF output.
function csvCell(value=''){
  const raw=safeString(value,500).split(String.fromCharCode(0)).join('');
  const unsafe=/^[\s\u200B-\u200D\uFEFF]*[=+\-@]/u.test(raw)||
    /^[\t\r\n]/u.test(raw);
  const safe=(unsafe?"'":'')+raw;
  return '"'+safe.replaceAll('"','""')+'"';
}

export function exportInventoryJournalCsv(rows=[]){
  const header=['Date (UTC)','Category','Activity','Reference','Source'];
  const lines=[header.map(csvCell).join(',')];
  for(const row of (Array.isArray(rows)?rows:[]).slice(0,100)){
    const receipt=inventoryJournalReceipt(row);
    lines.push([
      receipt.dateUtc,receipt.category,receipt.activity,
      receipt.reference,receipt.origin
    ].map(csvCell).join(','));
  }
  // UTF-8 BOM keeps non-English item names readable in spreadsheet software.
  return '\uFEFF'+lines.join('\r\n')+'\r\n';
}

export function inventoryJournalFilename(characterName='',now=Date.now()){
  const name=safeString(characterName,100).normalize('NFKD')
    .replace(/[^A-Za-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'')
    .slice(0,48).toLowerCase()||'character';
  const date=formatUtc(now).slice(0,10)||'undated';
  return 'asteria-inventory-journal-'+name+'-'+date+'.csv';
}
