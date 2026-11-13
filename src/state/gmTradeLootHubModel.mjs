// Phase 8.2: GM-only navigation summary of existing campaign inventory systems.
// This module is read-only. It returns counts and navigation labels, never item
// payloads, GM notes, private player data or permission decisions.
const rows=value=>Array.isArray(value)?value:[];

export function gmTradeLootOverview({itemEcosystem={},partyLoot={}}={}){
  const shops=rows(itemEcosystem?.shops);
  const openShops=shops.filter(shop=>shop?.status==='open');
  const stashes=rows(partyLoot?.stashes).filter(stash=>stash?.status!=='deleted');
  const openStashes=stashes.filter(stash=>stash?.status==='open');
  const hiddenDrafts=rows(partyLoot?.drafts).filter(drop=>
    drop?.visibility==='hidden'&&drop?.status==='available');
  const revealedDrops=rows(partyLoot?.loot).filter(drop=>
    drop?.visibility==='revealed'&&drop?.status==='available');
  const awaitingCopper=revealedDrops.filter(drop=>drop.kind==='currency');

  return {
    hiddenDrafts:hiddenDrafts.length,
    revealedDrops:revealedDrops.length,
    awaitingCopper:awaitingCopper.length,
    openStashes:openStashes.length,
    openShops:openShops.length,
    links:[
      {
        id:'gm-treasure',tab:'inventory',targetId:'react-gm-party-loot',
        label:'Treasure & Stashes',
        detail:hiddenDrafts.length+' hidden drafts · '+revealedDrops.length+
          ' available drops · '+openStashes.length+' open stashes'
      },
      {
        id:'gm-shops',tab:'economy',targetId:'react-gm-shops',
        label:'Merchant Shops',
        detail:openShops.length+' open shops · '+shops.length+' total shops'
      },
      {
        id:'gm-tables',tab:'economy',targetId:'react-gm-loot-tables',
        label:'Loot Tables',
        detail:'Manage saved tables and generate hidden treasure'
      },
      {
        id:'gm-audit',tab:'inventory',targetId:'react-gm-inventory-audit',
        label:'Inventory & Trade Audit',
        detail:'Review recent campaign inventory transactions'
      }
    ]
  };
}
