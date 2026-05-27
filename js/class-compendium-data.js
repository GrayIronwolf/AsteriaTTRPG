/* Asteria Class Compendium manifest v1. */
(function(){
  'use strict';

  function category(name, children){
    return { type:'category', name, children:children || [] };
  }

  function cls(name, data){
    return Object.assign({ type:'class', name }, data || {});
  }

  function talent(name, tier, data){
    return Object.assign({
      name,
      tier,
      ranks:3,
      prerequisite:'None',
      cost:'1 Talent Point',
      cooldown:'Passive',
      scaling:'Improves by rank',
      synergy:'Information coming soon',
      gmNotes:'Information coming soon'
    }, data || {});
  }

  const sharedTalents = name => [
    talent(`${name} Foundation`, 'Tier 1', { scaling:'+1 class control per rank' }),
    talent(`${name} Discipline`, 'Tier 1', { synergy:'Core class identity talent' }),
    talent(`${name} Technique`, 'Tier 2', { prerequisite:`${name} Foundation Rank 2` }),
    talent(`${name} Mastery`, 'Tier 4', { prerequisite:`Two ${name} talents` })
  ];

  window.ASTERIA_CLASS_COMPENDIUM_DATA = {
    version:'asteria-class-compendium-v1.1',
    source:'Class folder screenshots provided by Jaida',
    loreLevels:['Common Knowledge','Discovered Lore','Rare Lore','Forbidden Lore','GM Only'],
    categories:[
      category('Dark Classes', [
        cls('Bloodhunter', {
          role:'Blood rite monster hunter',
          primary_stat:'END',
          secondary_stat:'DEX',
          combat_style:'Blood rites and weapons',
          magic_type:'Hemomancy',
          difficulty:'Advanced',
          class_colour:'#bf2747',
          symbol:'BH',
          playable:true,
          tags:['dark','blood','hunter'],
          starting_equipment:['Ritual blade','Hunter coat','Blood rite kit'],
          recommended_professions:['Monster Hunter','Occult Investigator'],
          talents:[
            talent('Blood Rite', 'Tier 1', { scaling:'Blood rite damage improves by rank' }),
            talent('Hunter Sense', 'Tier 1', { synergy:'Tracks cursed, demonic, and undead targets' }),
            talent('Crimson Brand', 'Tier 2', { prerequisite:'Blood Rite Rank 2' }),
            talent('Sanguine Ward', 'Tier 3', { prerequisite:'Hunter Sense' }),
            talent('Exsanguinate', 'Tier 5', { prerequisite:'Two Tier 4 dark talents' })
          ]
        }),
        cls('Primal', { role:'Savage dark channeler', primary_stat:'STR', secondary_stat:'END', combat_style:'Feral pressure', magic_type:'Primal', difficulty:'Intermediate', class_colour:'#7f1d1d', symbol:'P', tags:['dark','primal','feral'], talents:sharedTalents('Primal') }),
        cls('Reaper', { role:'Execution and death-mark striker', primary_stat:'DEX', secondary_stat:'WIS', combat_style:'Scythes, marks, and finishers', magic_type:'Death', difficulty:'Advanced', class_colour:'#6b1026', symbol:'R', tags:['dark','death','execution'], talents:sharedTalents('Reaper') })
      ]),
      category('Magical Classes', [
        cls('Artificer', { role:'Magical engineer', primary_stat:'INT', secondary_stat:'DEX', combat_style:'Tools and devices', magic_type:'Artifice', difficulty:'Intermediate', class_colour:'#f59e0b', symbol:'A', tags:['magical','craft','device'], talents:sharedTalents('Artificer') }),
        cls('Druid', { role:'Nature caster and shapeshifter', primary_stat:'WIS', secondary_stat:'END', combat_style:'Nature magic and forms', magic_type:'Nature', difficulty:'Intermediate', class_colour:'#35dd86', symbol:'D', tags:['magical','nature','forms'], talents:sharedTalents('Druid') }),
        cls('Mancer', { role:'Focused school caster', primary_stat:'INT', secondary_stat:'WIS', combat_style:'Specialised spellcasting', magic_type:'Arcane', difficulty:'Intermediate', class_colour:'#36d7ff', symbol:'M', tags:['magical','caster','school'], talents:sharedTalents('Mancer') }),
        cls('Occultist', { role:'Ritual and forbidden knowledge caster', primary_stat:'INT', secondary_stat:'LCK', combat_style:'Rituals, signs, and bargains', magic_type:'Occult', difficulty:'Advanced', class_colour:'#8b5cf6', symbol:'O', tags:['magical','occult','ritual'], talents:sharedTalents('Occultist') }),
        cls('Sorcerer', { role:'Innate power caster', primary_stat:'CHA', secondary_stat:'END', combat_style:'Raw spell force', magic_type:'Innate Arcane', difficulty:'Intermediate', class_colour:'#a855f7', symbol:'S', tags:['magical','innate','arcane'], talents:sharedTalents('Sorcerer') }),
        cls('Spellblade', { role:'Blade and spell hybrid', primary_stat:'DEX', secondary_stat:'INT', combat_style:'Weapon and spell weaving', magic_type:'Arcane', difficulty:'Intermediate', class_colour:'#22d3ee', symbol:'SB', tags:['magical','blade','hybrid'], talents:sharedTalents('Spellblade') }),
        cls('Summoner', { role:'Conjuration and companion caster', primary_stat:'INT', secondary_stat:'CHA', combat_style:'Summons and battlefield control', magic_type:'Conjuration', difficulty:'Advanced', class_colour:'#67e8f9', symbol:'SU', tags:['magical','summon','control'], talents:sharedTalents('Summoner') }),
        cls('Warlock', { role:'Pact magic caster', primary_stat:'CHA', secondary_stat:'WIS', combat_style:'Pacts, curses, and invocations', magic_type:'Pact', difficulty:'Intermediate', class_colour:'#9333ea', symbol:'W', tags:['magical','pact','curse'], talents:sharedTalents('Warlock') }),
        cls('Wizard', { role:'Prepared arcane scholar', primary_stat:'INT', secondary_stat:'WIS', combat_style:'Prepared spells and rituals', magic_type:'Arcane', difficulty:'Intermediate', class_colour:'#1f7dff', symbol:'WZ', tags:['magical','wizard','arcane'], talents:sharedTalents('Wizard') })
      ]),
      category('Martial Classes', [
        cls('Barbarian', { role:'Rage-driven melee striker', primary_stat:'STR', secondary_stat:'END', combat_style:'Heavy melee and endurance', magic_type:'None', difficulty:'Beginner', class_colour:'#bf2747', symbol:'B', tags:['martial','rage','melee'], talents:sharedTalents('Barbarian') }),
        cls('Duelist', { role:'Precision weapon striker', primary_stat:'DEX', secondary_stat:'AGI', combat_style:'Finesse weapons', magic_type:'None', difficulty:'Intermediate', class_colour:'#35dd86', symbol:'D', tags:['martial','duel','precision'], talents:sharedTalents('Duelist') }),
        cls('Fighter', {
          role:'Frontline weapon specialist',
          primary_stat:'STR',
          secondary_stat:'END',
          combat_style:'Weapon mastery',
          magic_type:'None',
          difficulty:'Beginner',
          class_colour:'#d4a24a',
          symbol:'F',
          playable:true,
          tags:['martial','weapon','frontline'],
          starting_equipment:['Training weapon','Light armour','Adventuring kit'],
          recommended_professions:['Soldier','Guard','Mercenary'],
          talents:[
            talent('Weapon Discipline','Tier 1',{scaling:'+1 weapon control per rank'}),
            talent('Guarded Stance','Tier 1',{cooldown:'Once per round', synergy:'Pairs with shields and heavy armour'}),
            talent('Battle Rhythm','Tier 2',{prerequisite:'Weapon Discipline Rank 2'}),
            talent('Exploit Opening','Tier 3',{prerequisite:'Battle Rhythm'}),
            talent('Master of Arms','Tier 5',{prerequisite:'Two Tier 4 martial talents'})
          ]
        }),
        cls('Guardian', { role:'Defender and protector', primary_stat:'END', secondary_stat:'STR', combat_style:'Shield and control', magic_type:'None', difficulty:'Beginner', class_colour:'#7ab3ff', symbol:'G', tags:['martial','shield','defender'], talents:sharedTalents('Guardian') }),
        cls('Monk', { role:'Discipline and unarmed combatant', primary_stat:'AGI', secondary_stat:'WIS', combat_style:'Unarmed techniques', magic_type:'Ki', difficulty:'Intermediate', class_colour:'#f2d78a', symbol:'M', tags:['martial','unarmed','discipline'], talents:sharedTalents('Monk') }),
        cls('Warrior', { role:'Versatile combatant', primary_stat:'STR', secondary_stat:'CON', combat_style:'Arms and battlefield grit', magic_type:'None', difficulty:'Beginner', class_colour:'#b88445', symbol:'W', tags:['martial','weapon','versatile'], talents:sharedTalents('Warrior') })
      ]),
      category('Ranger Classes', [
        cls('Ranger', { role:'Tracker and survival combatant', primary_stat:'DEX', secondary_stat:'WIS', combat_style:'Ranged and fieldcraft', magic_type:'Nature', difficulty:'Beginner', class_colour:'#35dd86', symbol:'R', tags:['ranger','tracking','wilderness'], talents:sharedTalents('Ranger') }),
        cls('Scout', { role:'Recon and ambush specialist', primary_stat:'AGI', secondary_stat:'DEX', combat_style:'Mobility and ambush', magic_type:'None', difficulty:'Beginner', class_colour:'#9bd96b', symbol:'S', tags:['ranger','scout','ambush'], talents:sharedTalents('Scout') }),
        cls('Warden', { role:'Nature defender', primary_stat:'END', secondary_stat:'WIS', combat_style:'Weapon and nature magic', magic_type:'Nature', difficulty:'Intermediate', class_colour:'#4ade80', symbol:'W', tags:['ranger','nature','defender'], talents:sharedTalents('Warden') })
      ]),
      category('Religious Classes', [
        cls('Cleric', { role:'Healer and divine caster', primary_stat:'WIS', secondary_stat:'CHA', combat_style:'Prayer magic', magic_type:'Divine', difficulty:'Beginner', class_colour:'#f2d78a', symbol:'C', tags:['religious','divine','healing'], talents:sharedTalents('Cleric') }),
        cls('Creed', { role:'Doctrine-bound divine specialist', primary_stat:'WIS', secondary_stat:'CHA', combat_style:'Oaths and doctrine rites', magic_type:'Divine', difficulty:'Intermediate', class_colour:'#d8b4fe', symbol:'CR', tags:['religious','creed','rite'], talents:sharedTalents('Creed') }),
        cls('Inquisitor', { role:'Faith hunter and investigator', primary_stat:'WIS', secondary_stat:'DEX', combat_style:'Judgement, weapons, and pursuit', magic_type:'Divine', difficulty:'Intermediate', class_colour:'#f59e0b', symbol:'I', tags:['religious','hunter','judgement'], talents:sharedTalents('Inquisitor') }),
        cls('Paladin', { role:'Holy warrior', primary_stat:'STR', secondary_stat:'CHA', combat_style:'Weapon and oath magic', magic_type:'Divine', difficulty:'Intermediate', class_colour:'#f5c542', symbol:'P', tags:['religious','martial','oath'], talents:sharedTalents('Paladin') }),
        cls('Sentinel', { role:'Sacred defender', primary_stat:'END', secondary_stat:'WIS', combat_style:'Protection and warding', magic_type:'Divine', difficulty:'Beginner', class_colour:'#eab308', symbol:'S', tags:['religious','defender','ward'], talents:sharedTalents('Sentinel') })
      ]),
      category('Rogue Classes', [
        cls('Nightstalker', { role:'Shadow ambusher', primary_stat:'DEX', secondary_stat:'AGI', combat_style:'Stealth and opening strikes', magic_type:'Shadow', difficulty:'Advanced', class_colour:'#581c87', symbol:'N', tags:['rogue','shadow','ambush'], talents:sharedTalents('Nightstalker') }),
        cls('Phantom', { role:'Evasion and apparition specialist', primary_stat:'AGI', secondary_stat:'LCK', combat_style:'Mobility and misdirection', magic_type:'Spectral', difficulty:'Advanced', class_colour:'#64748b', symbol:'P', tags:['rogue','phantom','evasion'], talents:sharedTalents('Phantom') }),
        cls('Rogue', { role:'Skillful infiltrator', primary_stat:'DEX', secondary_stat:'LCK', combat_style:'Precision and tools', magic_type:'None', difficulty:'Beginner', class_colour:'#35dd86', symbol:'R', tags:['rogue','tools','precision'], talents:sharedTalents('Rogue') }),
        cls('Shadow Blade', { role:'Assassin and shadow striker', primary_stat:'DEX', secondary_stat:'CHA', combat_style:'Blades and shadow arts', magic_type:'Shadow', difficulty:'Intermediate', class_colour:'#7c3aed', symbol:'SB', tags:['rogue','blade','shadow'], talents:sharedTalents('Shadow Blade') })
      ])
    ]
  };
})();

