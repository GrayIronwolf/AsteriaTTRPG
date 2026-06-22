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
      ranks:5,
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

  function classText(){
    return Array.from(arguments).filter(Boolean).join('\n\n');
  }

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
        cls('Artificer', {
          role:'Inventor, enchanter, researcher, and magical engineer',
          primary_stat:'INT',
          secondary_stat:'DEX',
          combat_style:'Tools, devices, constructs, alchemy, and engineered magic',
          magic_type:'Artifice',
          difficulty:'Advanced',
          class_colour:'#f59e0b',
          symbol:'A',
          playable:true,
          tags:['magical','artifice','crafting','constructs','alchemy','enchanting','soul-stones','engineer'],
          starting_equipment:['Artificer tools','Field notebook','Basic crafting kit','Mana vial','Iron rations'],
          recommended_professions:['Artificer','Blacksmith','Alchemist','Enchanter','Engineer'],
          overview:classText(
            '# Class Overview',
            'The Artificer is a master inventor, engineer, researcher, and creator who blends magic, science, craftsmanship, and innovation into a single discipline. Unlike traditional spellcasters who channel magic through faith, instinct, or study alone, Artificers view magic as a resource to be understood, refined, and engineered.',
            'Where a Wizard studies spells, an Artificer studies systems.',
            'Through experimentation and invention, Artificers create gadgets, constructs, enchanted equipment, dimensional technologies, alchemical compounds, and soul-powered creations capable of reshaping the world around them. Their workshops produce wonders that many consider impossible, while their inventions often blur the line between magic and technology.',
            'Artificers are natural problem-solvers. Every challenge presents an opportunity for innovation. Every obstacle is simply a puzzle waiting to be solved.',
            'Whether constructing mechanical companions, crafting legendary artifacts, manipulating matter itself through Arcane Exchange, or carrying entire buildings in their pockets, Artificers are defined by one principle:',
            '> If it does not exist, build it.',
            '## Class Identity',
            'The Artificer excels through preparation, creativity, and invention rather than direct magical power.',
            '### Primary Roles',
            '- Crafter\n- Inventor\n- Enchanter\n- Researcher\n- Support Specialist\n- Resource Manager\n- Utility Expert',
            '### Secondary Roles',
            '- Construct Commander\n- Battlefield Controller\n- Alchemist\n- Engineer\n- Explorer',
            '## Artificer Motto',
            '> "Magic is not a mystery. It is a system waiting to be understood."'
          ),
          lore:classText(
            '# Origins of the Artificers',
            'Long before the modern age, magic was viewed as a force to be worshipped, feared, or studied. Few considered building with it.',
            'The earliest Artificers were craftsmen, miners, alchemists, blacksmiths, and scholars who became frustrated by the limitations of conventional magic. While Wizards debated theory and Clerics sought divine guidance, these pioneers sought practical solutions.',
            'They asked questions others ignored: why cast the same spell every day when a device could perform the task indefinitely, why rely on magical talent alone when power could be stored, and why learn a spell when a machine could replicate its effect?',
            '## The First Innovators',
            'The first true Artificers appeared during the Age of Discovery. These individuals began combining smithing, enchanting, alchemy, runecraft, engineering, and arcane theory into a new field of study.',
            'The earliest inventions were simple: self-heating cookware, enchanted lanterns, automated pumps, and reinforced tools. Over time these creations became more ambitious, eventually producing devices capable of rivaling spellcasters.',
            '## The Great Debate',
            'The rise of the Artificers sparked controversy across Asteria. Traditional scholars argued that magic should be studied. Artificers argued that magic should be used. Traditional enchanters argued that magic is sacred. Artificers argued that magic is a resource.',
            '## The Age of Invention',
            'As Artifice spread throughout the world, entire industries emerged around Artificer creations: arcane lighting systems, mana-powered tools, mechanical transports, automated workshops, and dimensional storage devices.',
            'Many cities owe their growth to inventions developed by Artificers. Some kingdoms owe their survival to them. Others blame them for countless disasters. Both are often correct.',
            '## The Soul Revolution',
            'The greatest breakthrough in Artificer history came with the discovery of Soul Integration. Researchers discovered that soul energy could be captured, refined, and utilized within crafted objects.',
            'This led to the creation of Soul-Bound Items, Arcane Reactors, Scaling Creations, Living Constructs, and Sentient Artifacts. The discovery revolutionized the profession, and also created some of its greatest dangers.',
            '## The Philosophy of Creation',
            'Artificers do not view creation as a finished act. Nothing is truly complete. Everything can be improved. Every invention may be refined. Every design may evolve. Every problem has a solution.',
            '## Artificers and Society',
            'Artificers may become master craftsmen, guild engineers, royal inventors, researchers, explorers, merchants, treasure hunters, relic seekers, dungeon delvers, monster researchers, or independent inventors.',
            'Many travel the world searching for lost schematics, ancient technologies, rare materials, and forgotten knowledge. To an Artificer, every ruin is a library, every artifact is a lesson, and every mystery is an opportunity.',
            '## The Artificer Creed',
            '> We build.\n>\n> We improve.\n>\n> We discover.\n>\n> We create.\n>\n> We fail.\n>\n> We learn.\n>\n> We build again.',
            '## Legacy',
            'The greatest Artificers are remembered for what they leave behind: a bridge that still stands, a reactor that still burns, a construct that still walks, a fortress that still protects, or an invention that changed the world.'
          ),
          talents:[
            talent('Artificer Discipline','Tier 1',{ ranks:5, cost:'3 TP to unlock; rank costs scale by progression rules', scaling:'Crafting-related D100 skill checks improve as the discipline ranks up.', synergy:'Foundation talent for crafting, smithing, alchemy, enchanting, runecrafting, salvaging, construct creation, reverse engineering, and item analysis.', rankDetails:['Gain +5 to all crafting-related D100 skill checks.','Increase the discipline bonus and broaden reliable crafting applications.','Improve complex crafting, salvaging, and analysis checks.','Strengthen advanced creation workflows and specialist crafting checks.','Master the discipline of creation across Artificer systems.'] }),
            talent("Gadgeteer's Gambit",'Tier 1',{ ranks:5, cost:'3 TP to unlock; rank costs scale by progression rules', cooldown:'Passive', scaling:'Adds stronger and more flexible mechanical effects to crafted items by rank.', synergy:'Pairs with gadgets, triggers, timers, devices, and engineered equipment.', rankDetails:['Unlock Gadgeteering and add 1 simple mechanical effect to a crafted item.','Improve gadget reliability and add more practical mechanical options.','Create more complex linked gadget functions.','Build advanced multi-step device effects.','Master compact gadget systems and high-complexity mechanical effects.'] }),
            talent('Increase Number of Charges','Tier 1',{ ranks:5, prerequisite:"Gadgeteer's Gambit or an Artificer device feature", scaling:'Increases the number of charges available to Artificer devices.', synergy:'Supports gadgets, reactors, enchanted tools, and charge-based inventions.', rankDetails:['Increase available charges for eligible Artificer creations.','Improve charge storage and field reliability.','Expand charge capacity for more advanced devices.','Boost charge retention for larger inventions.','Maximize charge capacity for masterwork Artificer devices.'] }),
            talent('Increase Soul Stone Yield','Tier 1',{ ranks:5, scaling:'Improves Soul Stone yield from eligible harvesting, extraction, and refining work.', synergy:'Supports Soul Integration, crafting, enchanting, and advanced Artificer resource loops.', rankDetails:['Improve Soul Stone yield from eligible sources.','Increase efficiency during soul-material collection.','Recover more useful soul fragments from difficult sources.','Improve advanced soul refinement yield.','Maximize Soul Stone extraction and refinement efficiency.'] }),
            talent('Resources','Tier 1',{ ranks:5, scaling:'Improves access to, recovery of, and efficient use of crafting resources.', synergy:'Supports long-term crafting, field repairs, workshop play, and campaign resource management.', rankDetails:['Improve basic material recovery and resource preparation.','Reduce waste while crafting and salvaging.','Recover more usable materials from field work.','Improve rare material preparation and storage.','Master resource efficiency across Artificer projects.'] }),

            talent('Construct Creation','Tier 2',{ ranks:5, prerequisite:'Artificer Discipline Rank 2', scaling:'Construct slots, complexity, and capability improve by rank.', synergy:'Core construct pathway for utility constructs, workshop support, and future companion systems.', rankDetails:['Unlock Construct Creation and maintain 1 utility construct slot.','Improve construct reliability and task range.','Create more capable constructs with better instructions.','Support advanced construct designs and multiple roles.','Master living workshop support through advanced constructs.'] }),
            talent('False Description','Tier 2',{ ranks:5, prerequisite:'Item Analysis or Artificer Discipline Rank 2', scaling:'Improves crafted misdirection, disguised functions, and misleading item reads.', synergy:'Pairs with traps, hidden devices, deceptive enchantments, and rogue-style preparation.', rankDetails:['Create simple false readings or misleading item descriptions.','Improve hidden function masking.','Build more convincing deceptive item signatures.','Mask complex crafted or enchanted functions.','Master high-grade deception for Artificer creations.'] }),
            talent('Item Analysis','Tier 2',{ ranks:5, prerequisite:'Artificer Discipline Rank 2', scaling:'Analysis accuracy and detail improve by rank.', synergy:'Feeds Reverse Engineering, crafting, relic research, enchantment extraction, and GM investigation play.', rankDetails:['Identify basic item function, construction, and likely use.','Improve insight into materials and craftsmanship.','Reveal deeper mechanical, magical, or alchemical design clues.','Analyze advanced enchantments, devices, and hidden construction features.','Master item diagnosis and design interpretation.'] }),
            talent('Quick Assembly','Tier 2',{ ranks:5, prerequisite:'Resources or Gadgeteering', scaling:'Reduces setup time and improves field assembly options by rank.', synergy:'Supports field gadgets, emergency repairs, quick workshop setup, and combat preparation.', rankDetails:['Assemble simple Artificer devices faster in the field.','Improve rapid repair and temporary build reliability.','Create more complex field-ready devices.','Reduce setup time for advanced creations.','Master rapid assembly under pressure.'] }),
            talent('Scavenger','Tier 2',{ ranks:5, prerequisite:'Resources', scaling:'Improves salvaging results and material recovery by rank.', synergy:'Pairs with dungeon delving, battlefield cleanup, crafting, and economy systems.', rankDetails:['Recover useful parts from broken items, ruins, and scrap.','Improve salvage quality and reduce waste.','Recover rarer materials from eligible sources.','Extract specialist components from damaged creations.','Master salvage recovery from complex magical and mechanical objects.'] }),

            talent('Combat Alchemy','Tier 3',{ ranks:5, prerequisite:'Artificer Discipline Rank 3 or Alchemy access', cooldown:'Depends on formula or device', scaling:'Combat alchemy effects improve by rank.', synergy:'Connects Artificer crafting to potions, bombs, catalysts, reagents, and battlefield utility.', rankDetails:['Unlock basic combat-ready alchemical applications.','Improve potency, handling, and deployment reliability.','Create stronger tactical alchemical effects.','Support advanced battlefield mixtures and catalysts.','Master dangerous, high-impact combat alchemy.'] }),
            talent('Enchantment Extraction','Tier 3',{ ranks:5, prerequisite:'Item Analysis Rank 2', scaling:'Extraction safety and quality improve by rank.', synergy:'Feeds enchanting, crafting, item recovery, and rare material systems.', rankDetails:['Attempt to extract simple enchantment traces from eligible items.','Improve extraction stability and usable residue.','Recover stronger enchantment patterns.','Extract advanced enchantment components with lower risk.','Master high-grade enchantment extraction.'] }),
            talent('Reverse Engineering','Tier 3',{ ranks:5, prerequisite:'Item Analysis Rank 2', cooldown:'Cantrip / GM-defined', scaling:'Reverse Engineering rolls and knowledge fragment recovery improve by rank.', synergy:'Destroys items to learn schematics, formulas, and construction principles.', rankDetails:['Spend MP to destroy an eligible item and attempt to gain a knowledge fragment.','Improve Reverse Engineering rolls and fragment recovery.','Study more complex crafted, alchemical, and enchanted objects.','Recover deeper schematic and formula knowledge.','Master destructive study of advanced creations.'] }),
            talent('Soul Bond Object','Tier 3',{ ranks:5, prerequisite:'Soul Stone access and Artificer Discipline Rank 3', scaling:'Soul-bound object stability and capability improve by rank.', synergy:'Feeds Soul Integration, enchanted item growth, scaling creations, and advanced campaign artifacts.', rankDetails:['Bind a simple object to a soul catalyst or soul-linked function.','Improve stability and connection strength.','Add more meaningful soul-linked properties.','Support complex bonded object behavior.','Master high-grade Soul-Bound object creation.'] }),

            talent('Arcane Reactor','Tier 4',{ ranks:5, prerequisite:'Soul Bond Object or Construct Creation Rank 3', cooldown:'Permanent creation', scaling:'Reactor capacity, stability, and supported creations improve by rank.', synergy:'Powers advanced Artificer creations, armor systems, constructs, prosthetics, and field technologies.', rankDetails:['Build a basic personal Arcane Reactor with dedicated reactor energy.','Increase reactor capacity and reliability.','Power more advanced devices and creations.','Stabilize high-output reactor applications.','Master reactor design for elite Artificer technology.'] }),
            talent('Dimensional Warehouse','Tier 4',{ ranks:5, prerequisite:'Arcane Reactor or advanced Artifice access', scaling:'Dimensional storage capacity and safety improve by rank.', synergy:'Supports storage, logistics, travel, workshop play, and portable infrastructure.', rankDetails:['Create a limited dimensional storage solution.','Improve storage capacity and access control.','Store larger or more delicate materials safely.','Support advanced workshop and travel logistics.','Master portable dimensional infrastructure.'] }),
            talent('Scaling Creation','Tier 4',{ ranks:5, prerequisite:'Soul Bond Object Rank 3', scaling:'Allows creations to improve through investment, soul energy, or campaign progression.', synergy:'Connects Artificer creations to item growth, soul systems, and long-term character progression.', rankDetails:['Create an item or device with early scaling potential.','Improve scaling stability and growth path clarity.','Support more advanced upgrade routes.','Connect creations to stronger campaign progression hooks.','Master scaling creations suitable for legendary development.'] }),

            talent('Arcane Exchange','Tier 5',{ ranks:5, prerequisite:'Arcane Reactor Rank 4 or Scaling Creation Rank 4', cooldown:'Active / GM-defined', scaling:'Transmutation scope, safety, and value ceiling improve by rank.', synergy:'Material transmutation based on equivalent exchange; connects to crafting, soul catalysts, and rare materials.', rankDetails:['Transmute simple and common materials through equivalent exchange.','Improve exchange efficiency and material range.','Transmute more complex crafted or refined materials.','Work with rare materials under stricter exchange limits.','Master high-tier Arcane Exchange with GM-approved limits.'] }),
            talent('Portable Structure','Tier 5',{ ranks:5, prerequisite:'Dimensional Warehouse Rank 4', scaling:'Portable structure size, deployment stability, and complexity improve by rank.', synergy:'Turns Artificer logistics into shelters, mobile workshops, field bases, and campaign infrastructure.', rankDetails:['Deploy a small portable structure or field shelter.','Improve structure capacity and reliability.','Support workshop-grade portable infrastructure.','Deploy more complex and durable structures.','Master portable bases and high-tier Artificer field architecture.'] })
          ]
        }),
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
