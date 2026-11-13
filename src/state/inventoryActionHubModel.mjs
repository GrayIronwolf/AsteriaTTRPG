// Phase 8.1: player-facing shortcuts for already-authorised campaign data.
// Pure presentation data only: never read GM-private drops or modify records.
const list=value=>Array.isArray(value)?value:[];
const availableDrop=row=>row?.visibility==='revealed'&&row.status==='available';
const openStash=row=>row?.status==='open';
const accessibleShop=(shop,characterId)=>
  shop?.status==='open'&&(
    !list(shop.visitorCharacterIds).length||
    list(shop.visitorCharacterIds).some(id=>String(id)===characterId)
  );

export function playerTradeLootOverview({
  character={},characters={},ecosystem={},partyLoot={},activity=[]
}={}){
  const characterId=String(character.id||'');
  const roster=Object.values(characters||{}).filter(row=>
    row?.id&&String(row.id)!==characterId);
  const visibleDrops=list(partyLoot.loot).filter(availableDrop);
  const itemDrops=visibleDrops.filter(row=>row.kind==='item');
  const currencyDrops=visibleDrops.filter(row=>row.kind==='currency');
  const shops=list(ecosystem.shops).filter(row=>accessibleShop(row,characterId));
  const stashes=list(partyLoot.stashes).filter(openStash);
  const journalCount=list(activity).length;
  return {
    claimableItemDrops:itemDrops.length,
    awaitingCurrencyDrops:currencyDrops.length,
    availableTreasure:visibleDrops.length,
    sharedStashes:stashes.length,
    accessibleShops:shops.length,
    partyMembers:roster.length,
    recentActivity:journalCount,
    // Only minimal numeric presentation information leaves this selector:
    // no unrevealed loot, prices, owner UIDs or GM notes.
    links:[
      {
        id:'party-loot',
        label:'Treasure & Stashes',
        count:visibleDrops.length,
        detail:visibleDrops.length+' revealed drops · '+stashes.length+' open containers'
      },
      {
        id:'shops',
        label:'Merchants',
        count:shops.length,
        detail:shops.length===1?'1 accessible merchant':shops.length+' accessible merchants'
      },
      {
        id:'party',
        label:'Trade with Party',
        count:roster.length,
        detail:roster.length===1?'1 other character':roster.length+' other characters'
      },
      {
        id:'journal',
        label:'Transaction Journal',
        count:journalCount,
        detail:journalCount===1?'1 recent entry':journalCount+' recent entries'
      }
    ]
  };
}
