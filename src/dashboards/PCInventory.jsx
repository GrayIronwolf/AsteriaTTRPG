import React, { useState } from 'react';
import { Panel, EmptyState, SearchField, StatusPill } from '../components/WorkspaceUI.jsx';
import { inventoryItems } from './characterWorkspaceData.js';
import { ItemDetailModal } from './InventoryWorkspace.jsx';
const category=item=>/weapon|arrow|bolt|ammunition/i.test(item.type)?'Weapons':/armour|armor|shield/i.test(item.type)?'Armour':/consum|potion|food/i.test(item.type)?'Consumables':/material|metal|ore|crystal|ingredient/i.test(item.type)?'Materials':'Other Items';
export function PCInventory({campaignId,characters,selectedId,onSelect,editable,rewards}) {
  const [query,setQuery]=useState(''),[details,setDetails]=useState(null);
  const character=characters[selectedId] || Object.values(characters)[0];
  const items=character?inventoryItems(character).filter(item=>item.name.toLowerCase().includes(query.toLowerCase())):[];
  return <div className="react-pc-inventory"><Panel title="PC Inventory">
    <div className="react-filter-tabs" aria-label="Player inventories">{Object.values(characters).map(c=><button key={c.id} aria-pressed={character?.id===c.id} className={character?.id===c.id?'active':''} onClick={()=>{setDetails(null);onSelect(c.id);}}>{c.name}</button>)}</div>
    {character?<><h2>{character.name}’s Inventory</h2><SearchField value={query} onChange={setQuery} placeholder="Search this inventory…"/>
      {['Weapons','Armour','Consumables','Materials','Other Items'].map(group=>{const rows=items.filter(item=>category(item)===group);return rows.length?<section key={group}><h3>{group}</h3><div className="react-pc-items">{rows.map(item=><button key={item.id} onClick={()=>setDetails(item)}><span><b>{item.name}</b><small>{item.equipped?'Equipped':item.type}</small></span><StatusPill>×{item.qty}</StatusPill></button>)}</div></section>:null;})}
      {!items.length?<EmptyState title={query?'No matching items':'Inventory is empty'}/>:null}
    </>:<EmptyState title="No linked characters"/>}
    </Panel>{rewards}
    {details&&character?<ItemDetailModal key={`${character.id}-${details.id}`} campaignId={campaignId} character={character} item={items.find(item=>item.id===details.id)||details} editable={editable} isGM onClose={()=>setDetails(null)} onAction={()=>setDetails(null)}/>:null}
  </div>;
}
