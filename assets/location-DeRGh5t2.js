const o=1,e="location",n=[{id:"location:locations-realms-asteria-ironvale-ironvale",title:"Ironvale",slug:"ironvale",domain:"location",summary:"Ironvale is a forge-town built around black stone roads, old mineworks, and trade caravans.",categoryPath:["Realms","Asteria"],sections:[{title:"Overview",body:"Ironvale is a forge-town built around black stone roads, old mineworks, and trade caravans."},{title:"Map Notes",body:"Information coming soon."},{title:"Regions",body:"Information coming soon."},{title:"Factions",body:"The Emberwright Guild has strong influence here."},{title:"Lore",body:"Information coming soon."},{title:"Encounters",body:"Information coming soon."}]},{id:"location:content-phase-4-advanced-world-systems",title:"Phase 4 Advanced World Systems",slug:"phase-4-advanced-world-systems",domain:"location",summary:"Phase 4 adds the first Living Fantasy World Engine foundation for Asteria.",categoryPath:[],sections:[{title:"Overview",body:`Phase 4 adds the first Living Fantasy World Engine foundation for Asteria.

The world systems are campaign-aware, metadata-driven, and designed to connect to the Universal Compendium Engine, gameplay tools, GM dashboards, and future multiplayer persistence.`},{title:"Systems",body:`- Dynamic World State
- World Economy
- Reputation and Factions
- Dynamic Events
- Interactive World Map
- Settlement Management
- Trade and Merchants
- Campaign Persistence
- Knowledge and Discovery
- Advanced GM Controls
- World Timeline
- AI NPC Foundations`},{title:"Data Sources",body:`The living world reads from existing compendium domains:

- Locations create world regions, settlements, and map nodes.
- Factions and religions create reputation targets.
- Items create merchant stock and economy hooks.
- Creatures create discovery records and future spawn hooks.
- Lore entries create knowledge unlock records.`},{title:"Campaign Persistence",body:"Each campaign receives its own world state. Player actions can be recorded as permanent world changes, completed events, destroyed locations, faction changes, NPC deaths, unlocked lore, and regional conditions."},{title:"GM Visibility",body:"The system supports player-safe preview, GM-only notes, hidden events, lore locks, encounter secrecy, and future campaign-specific overrides."},{title:"Backend Readiness",body:"Phase 4 saves locally for now and calls the existing Asteria save/sync hooks when available. The state model is isolated so Firebase or a future backend can sync campaign world data later."}]}],a={version:1,domain:e,entries:n};export{a as default,e as domain,n as entries,o as version};
