/* Asteria Creature Compendium manifest v1. */
(function(){
  'use strict';

  function category(name, children){
    return { type:'category', name, children:children || [] };
  }

  function creature(name, data){
    return Object.assign({ type:'creature', name }, data || {});
  }

  window.ASTERIA_CREATURE_COMPENDIUM_DATA = {
    version:'asteria-creature-compendium-v1',
    loreLevels:['Common Knowledge','Discovered Lore','Rare Lore','Forbidden Lore','GM Only'],
    threatTiers:['TT 0','TT 1','TT 2','TT 3','TT 4','TT 5','TT 6','TT 7','TT 8','TT 9','TT 10'],
    categories:[
      category('Animals', [
        category('Mammals', [
          creature('Dire Wolf', { creature_type:'Animal', threat_tier:'TT 2', level_range:'2-4', size:'Medium', biome:'Forest', habitat:'Woodlands', hostility:'Territorial', magical:false, boss:false, soul_value:25, soul_tier:'Minor', encounter_role:'Skirmisher', hp:42, sp:30, mp:0, armour:12, attacks:['Bite','Pack Harry'], loot_tags:['hide','fang','meat'] }),
          creature('Cave Bear', { creature_type:'Animal', threat_tier:'TT 3', level_range:'3-6', size:'Large', biome:'Mountain', habitat:'Caves', hostility:'Defensive', magical:false, boss:false, soul_value:40, soul_tier:'Minor', encounter_role:'Brute', hp:85, sp:45, mp:0, armour:13, attacks:['Claw','Maul'], loot_tags:['hide','claw','fat'] }),
          creature('Moon Elk', { creature_type:'Animal', threat_tier:'TT 1', level_range:'1-3', size:'Large', biome:'Forest', habitat:'Moonlit groves', hostility:'Passive', magical:true, boss:false, soul_value:30, soul_tier:'Minor', encounter_role:'Support', hp:38, sp:25, mp:20, armour:11, attacks:['Antler Bash','Moonlit Step'], loot_tags:['antler','moon essence'] })
        ]),
        category('Birds', [
          creature('Ironbeak Hawk', { creature_type:'Animal', threat_tier:'TT 1', level_range:'1-2', size:'Small', biome:'Cliff', habitat:'High nests', hostility:'Territorial', magical:false, boss:false, soul_value:10, soul_tier:'Lesser', encounter_role:'Scout', hp:18, sp:25, mp:0, armour:12, attacks:['Dive','Talons'], loot_tags:['feather','talon'] }),
          creature('Ashwing Vulture', { creature_type:'Animal', threat_tier:'TT 2', level_range:'2-4', size:'Medium', biome:'Wasteland', habitat:'Ash fields', hostility:'Opportunistic', magical:true, boss:false, soul_value:25, soul_tier:'Minor', encounter_role:'Harrier', hp:32, sp:35, mp:12, armour:12, attacks:['Beak','Ash Cloud'], loot_tags:['ash feather','beak'] })
        ]),
        category('Reptiles', [
          creature('Glassback Lizard', { creature_type:'Animal', threat_tier:'TT 1', level_range:'1-2', size:'Small', biome:'Desert', habitat:'Warm stone', hostility:'Passive', magical:false, boss:false, soul_value:8, soul_tier:'Lesser', encounter_role:'Minion', hp:14, sp:18, mp:0, armour:13, attacks:['Bite','Camouflage'], loot_tags:['scale','glassback hide'] })
        ]),
        category('Fish', [
          creature('Gloomfin Pike', { creature_type:'Animal', threat_tier:'TT 1', level_range:'1-3', size:'Small', biome:'Swamp', habitat:'Dark water', hostility:'Aggressive', magical:false, boss:false, soul_value:8, soul_tier:'Lesser', encounter_role:'Ambusher', hp:16, sp:20, mp:0, armour:11, attacks:['Bite','Bleed'], loot_tags:['fish oil','teeth'] })
        ]),
        category('Insects', [
          creature('Shard Mantis', { creature_type:'Animal', threat_tier:'TT 2', level_range:'2-5', size:'Medium', biome:'Crystal fields', habitat:'Shard nests', hostility:'Aggressive', magical:true, boss:false, soul_value:35, soul_tier:'Minor', encounter_role:'Striker', hp:40, sp:45, mp:10, armour:14, attacks:['Razor Claw','Crystal Leap'], loot_tags:['chitin','crystal blade'] })
        ]),
        category('Amphibians', [
          creature('Bog Croaker', { creature_type:'Animal', threat_tier:'TT 1', level_range:'1-3', size:'Small', biome:'Swamp', habitat:'Bog pools', hostility:'Defensive', magical:false, boss:false, soul_value:10, soul_tier:'Lesser', encounter_role:'Controller', hp:22, sp:18, mp:0, armour:10, attacks:['Tongue Lash','Croak'], loot_tags:['poison gland','slick hide'] })
        ])
      ]),
      category('Beasts', [
        creature('Woodling Scout', { creature_type:'Beast', threat_tier:'TT 1', level_range:'1-3', size:'Small', biome:'Forest', habitat:'Old woods', hostility:'Territorial', magical:true, boss:false, soul_value:20, soul_tier:'Minor', encounter_role:'Scout', hp:45, sp:25, mp:8, armour:13, attacks:['Needle Jab','Root Snare'], loot_tags:['living bark','sap'] }),
        creature('Woodling Brute', { creature_type:'Beast', threat_tier:'TT 2', level_range:'2-5', size:'Medium', biome:'Forest', habitat:'Old woods', hostility:'Aggressive', magical:true, boss:false, soul_value:35, soul_tier:'Minor', encounter_role:'Brute', hp:70, sp:35, mp:10, armour:14, attacks:['Branch Slam','Root Pin'], loot_tags:['living bark','heartwood'] })
      ]),
      category('Constructs', [
        creature('Rustbound Sentinel', { creature_type:'Construct', threat_tier:'TT 3', level_range:'4-7', size:'Medium', biome:'Ruins', habitat:'Ancient halls', hostility:'Programmed', magical:true, boss:false, soul_value:0, soul_tier:'None', encounter_role:'Defender', hp:90, sp:0, mp:25, armour:17, attacks:['Iron Fist','Guard Protocol'], loot_tags:['scrap metal','core fragment'] })
      ]),
      category('Monsters', [
        creature('Umbral Stalker', { creature_type:'Monster', threat_tier:'TT 2', level_range:'3-6', size:'Medium', biome:'Shadow', habitat:'Dim ruins', hostility:'Predatory', magical:true, boss:false, soul_value:60, soul_tier:'Lesser', encounter_role:'Ambusher', hp:120, sp:60, mp:35, armour:16, attacks:['Shadow Claw','Dim Step'], loot_tags:['shadow hide','umbral fang'] }),
        creature('Grave Maw', { creature_type:'Monster', threat_tier:'TT 4', level_range:'6-9', size:'Large', biome:'Graveyard', habitat:'Burial pits', hostility:'Hostile', magical:true, boss:true, soul_value:150, soul_tier:'Greater', encounter_role:'Boss', hp:220, sp:80, mp:55, armour:18, attacks:['Devour','Fear Howl'], loot_tags:['grave ichor','bone plates'] })
      ]),
      category('Undead', [
        creature('Skeleton Guard', { creature_type:'Undead', threat_tier:'TT 1', level_range:'1-3', size:'Medium', biome:'Ruins', habitat:'Crypts', hostility:'Hostile', magical:true, boss:false, soul_value:15, soul_tier:'Lesser', encounter_role:'Minion', hp:28, sp:0, mp:10, armour:12, attacks:['Rusty Blade','Bone Rattle'], loot_tags:['bone','rusted weapon'] }),
        creature('Ghoul', { creature_type:'Undead', threat_tier:'TT 2', level_range:'2-5', size:'Medium', biome:'Graveyard', habitat:'Tombs', hostility:'Hostile', magical:true, boss:false, soul_value:30, soul_tier:'Minor', encounter_role:'Striker', hp:55, sp:35, mp:10, armour:13, attacks:['Claws','Carrion Bite'], loot_tags:['ghoul claw','grave dust'] })
      ]),
      category('Dragons', [
        creature('Ember Drake', { creature_type:'Dragon', threat_tier:'TT 5', level_range:'8-12', size:'Large', biome:'Volcanic', habitat:'Lava caverns', hostility:'Territorial', magical:true, boss:true, soul_value:300, soul_tier:'Major', encounter_role:'Boss', hp:320, sp:120, mp:140, armour:19, attacks:['Flame Bite','Wing Buffet','Ember Breath'], loot_tags:['dragon scale','ember core'] })
      ]),
      category('Elementals', [
        creature('Cinder Elemental', { creature_type:'Elemental', threat_tier:'TT 3', level_range:'4-7', size:'Medium', biome:'Fire', habitat:'Burning zones', hostility:'Unstable', magical:true, boss:false, soul_value:75, soul_tier:'Minor', encounter_role:'Blaster', hp:80, sp:40, mp:80, armour:14, attacks:['Cinder Bolt','Flame Body'], loot_tags:['fire mote','cinder ash'] })
      ]),
      category('Aberrations', [
        creature('Whispering Eye', { creature_type:'Aberration', threat_tier:'TT 3', level_range:'4-8', size:'Small', biome:'Void-touched', habitat:'Forbidden ruins', hostility:'Alien', magical:true, boss:false, soul_value:90, soul_tier:'Minor', encounter_role:'Controller', hp:58, sp:30, mp:95, armour:15, attacks:['Mind Needle','Unblinking Gaze'], loot_tags:['eye lens','void mucus'] })
      ]),
      category('Celestials', [
        creature('Dawn Warden', { creature_type:'Celestial', threat_tier:'TT 4', level_range:'6-10', size:'Medium', biome:'Sanctified', habitat:'Shrines', hostility:'Conditional', magical:true, boss:false, soul_value:120, soul_tier:'Greater', encounter_role:'Defender', hp:150, sp:70, mp:110, armour:18, attacks:['Radiant Spear','Ward Pulse'], loot_tags:['radiant feather','holy ember'] })
      ]),
      category('Demons', [
        creature('Ash Imp', { creature_type:'Demon', threat_tier:'TT 1', level_range:'1-4', size:'Small', biome:'Infernal', habitat:'Burned thresholds', hostility:'Hostile', magical:true, boss:false, soul_value:25, soul_tier:'Minor', encounter_role:'Minion', hp:24, sp:30, mp:30, armour:12, attacks:['Claw','Cinder Spit'], loot_tags:['imp horn','ash gland'] })
      ]),
      category('Spirits', [
        creature('Lantern Wisp', { creature_type:'Spirit', threat_tier:'TT 1', level_range:'1-3', size:'Tiny', biome:'Haunted', habitat:'Old roads', hostility:'Curious', magical:true, boss:false, soul_value:20, soul_tier:'Minor', encounter_role:'Support', hp:18, sp:0, mp:45, armour:13, attacks:['Cold Light','Lure'], loot_tags:['wisp mote','ectoplasm'] })
      ]),
      category('Plants', [
        creature('Briar Strangler', { creature_type:'Plant', threat_tier:'TT 2', level_range:'2-5', size:'Medium', biome:'Forest', habitat:'Overgrown paths', hostility:'Predatory', magical:false, boss:false, soul_value:20, soul_tier:'Lesser', encounter_role:'Controller', hp:65, sp:20, mp:0, armour:13, attacks:['Vine Lash','Root Grasp'], loot_tags:['thorn vine','briar seed'] })
      ])
    ]
  };
})();
