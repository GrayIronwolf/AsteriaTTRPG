/* Asteria Race Compendium manifest generated from the provided race folder screenshots. */
(function(){
  'use strict';

  function category(name, children){
    return { type:'category', name, children:children || [] };
  }

  function race(name, extra){
    return Object.assign({ type:'race', name }, extra || {});
  }

  window.ASTERIA_RACE_COMPENDIUM_DATA = {
    version:'asteria-race-compendium-v1',
    source:'Race Iamges screenshots provided 2026-05-23',
    loreLevels:['Common Knowledge','Discovered Lore','Rare Lore','Forbidden Lore','GM Only'],
    relationshipStatuses:['Allied','Friendly','Neutral','Tense','Distrusted','Hostile','Ancient Enemy'],
    categories:[
      category('Small Races', [
        category('Gnome Races', [
          race('Arcane Gnome'), race('Builder Gnome'), race('Cave Gnome'), race('Field Gnome'), race('Forest Gnome'), race('Frost Gnome')
        ]),
        category('Goblin Races', [
          race('Green Goblin'), race('Gray Goblin'), race('Night Goblin'), race('Red Goblin'), race('White Goblin')
        ]),
        race('Halfling'),
        category('Hobbit Races', [
          race('Arcane Hobbit'), race('Forrest Hobbit'), race('Hill Hobbit'), race('Swamp Hobbit')
        ]),
        race('Kinder'),
        category('Kobold Races', [
          race('Ashbold'), race('Firbold'), race('Kobold'), race('Sandbold'), race('Seabold'), race('Snowbold'), race('Vampbold')
        ]),
        race('Mossling'),
        race('Myconiod'),
        category('Sprite Races', [
          race('Cavern Sprite', {
            image:'assets/races/cavern-sprite/cavern-sprite-female-adult.png',
            images:{
              female:'assets/races/cavern-sprite/cavern-sprite-female-adult.png',
              male:'assets/races/cavern-sprite/cavern-sprite-male-adult.png'
            }
          }),
          race('Forest Sprite'), race('Hill Sprite'), race('River Sprite'), race('Storm Sprite'), race('Wood Spring')
        ])
      ]),
      category('Medium Races', [
        category('Dwarf Races', [
          race('Arcgar - Arcane Dwarf'), race('Duergar - Dark Dwarf'), race('Fosgar - Artic Dwarf'), race('Hilgar - Hill Dwarf'), race('Magar - Fire Dwarf'), race('Sealgar - Sea Dwarf'), race('Wolgar - Wood Dwarf')
        ]),
        category('Elf Races', [
          race('Blood Elf'), race('Celestial Elf'), race('Dark Elf'), race('Drow'), race('Fae Elf'), race('High Elf'), race('Ice Elf'), race('Light Elf'), race('Moon Elf'), race('Sea Elf'), race('Sky Elf'), race('Sun Elf'), race('Wood Elf')
        ]),
        category('Human Races', [
          race('Artic Human'), race('Coastal Human'), race('Desert Human'), race('Jungle Human'), race('Mountain Human'), race('Planes Human')
        ])
      ]),
      category('Large Races', [
        race('Oger'), race('Orc'), race('Urgel')
      ]),
      category('Extra Large Races', [
        race('Giant'), race('Titan'), race('Troll')
      ]),
      category('Beastkin Races', [
        category('Bat Races', [
          race('Batlin'), race('Chirolin'), race('Craglin'), race('Drakilin'), race('Ghoslin'), race('Phyllilin')
        ]),
        category('Bird Races', [
          race('Aarakocra Avian'), race('Cavarin Avian'), race('Gallari Avian'), race('Halkan Avian'), race('Kenku Avian'), race('Owlin Avian'), race('Pavari Avian'), race('Psittin Avian'), race('Sphenis Avian'), race('Strigon Avian'), race('Titikan Avian'), race('Vulkan Avian')
        ]),
        category('Canine Races', [
          category('Dog Races', [
            race('Anibin'), race('Carnin'), race('Chrypin'), race('Dapin'), race('Latrin'), race('Lupin')
          ]),
          category('Fox Races', [
            race('Artic Vulpin'), race('Kitsuna'), race('Vulpin')
          ]),
          category('Hyena Races', [
            race('Gnoll'), race('Kaftar')
          ])
        ]),
        category('Feline Races', [
          race('Attari'), race('Cheexi'), race('Cobaxi'), race('Felaxi'), race('Jabaxi'), race('Lyaxi'), race('Lynaxi'), race('Pabaxi'), race('Tabaxi')
        ]),
        category('Fish & Amphibian Races', [
          category('Fish Races', [
            race('Eereth'), race('Krakari'), race('Locthri'), race("Ma'kori"), race('Nautri'), race('Raynari'), race('Zynari')
          ]),
          category('Amphibian Races', [
            race('Grung'), race('Grummock'), race('Salthri'), race('Nythri'), race('Axolari')
          ])
        ]),
        category('Hooved Races', [
          race('Ceren'), race('Equine'), race('Faun'), race('Minotaur'), race('Porcine'), race('Ramren'), race('Buren')
        ]),
        category('Insect & Arachnid Races', [
          category('Arachnid Races', [
            race('Skornid'), race('Aranid')
          ]),
          category('Insect Races', [
            race("Ar'Zari"), race('Korvari'), race('Lazari'), race('Orakai'), race('Terkari'), race('Theskar'), race('Vespari'), race('Vexari'), race('Zhakar')
          ])
        ]),
        category('Lagomor & Rodent Races', [
          race("Brek'Oth/Castoth"), race('Harengon'), race('Hybaran'), race('Musran'), race('Rattaran')
        ]),
        category('Megafaun Races', [
          race('Loxodon'), race('Mammoren'), race('Rhadon'), race('Goradon')
        ]),
        category('Mephitidae Races', [
          race('Menphin')
        ]),
        category('Mustelidae Races', [
          race('Fentra'), race('Lutetra'), race('Meletra'), race('Vulontra')
        ]),
        category('Reptilian Races', [
          race('Chamaris'), race('Gekaris'), race('Naga'), race('Sauriss'), race('Sobekai'), race('Tortle'), race('Vorakai')
        ]),
        category('Ursa Races', [
          race('Ailura Ursa'), race('Arctura Ursa'), race('Polaris Ursa'), race('Solara Ursa'), race('Terra Ursa')
        ]),
        category('Xenarthra Races', [
          race('Cingudun'), race('Folodun'), race('Myrmodun')
        ])
      ]),
      category('Celestial Races'),
      category('Dark Races', [
        race('Changeling'), race('Gorgon'), race('Jinn'), race('Vampire')
      ]),
      category('Demi Races', [
        race('Aasimar'), race('Demi-Demon'), race('Demi-God'), race('Dhampir'), race('Drakan'), race('Goliath'), race('Half Elf'), race('Half Orc'), race('Hobgoblin'), race('Tiefling'),
        category('Undien Races', [race('Undien')])
      ]),
      category('Demonic Races'),
      category('Dragon Races'),
      category('Fae Races', [
        race('Brownie'), race('Fairy'), race('Leprechaun'), race('Pixie'), race('Pux')
      ]),
      category('Hybrid Races', [
        race('Bugbear'), race('Centaur'), race('Harpy'), race('Lamia'), race('Mermaid/Merman'), race('Satyr')
      ]),
      category('Spirit Races'),
      category('Undead Races', [
        race('Skeleton'), race('Ghoul')
      ])
    ]
  };
})();
