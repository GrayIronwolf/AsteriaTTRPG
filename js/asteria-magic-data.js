(function(){
  'use strict';

  const spellSamples = {
    air:[['Gale Thread','3 MP','Air Magic'],['Feather Step','2 MP','Air Magic']],
    earth:[['Stoneguard','4 MP','Earth Magic'],['Root Grip','5 MP','Earth Magic']],
    water:[['Ripple Mend','4 MP','Water Magic'],['Tide Push','5 MP','Water Magic']],
    fire:[['Ember Bolt','4 MP','Fire Magic'],['Cinder Ward','3 MP','Fire Magic']],
    life:[['Living Spark','5 MP','Life Magic']],
    death:[['Grave Whisper','5 MP','Death Magic']],
    light:[['Healing Light','6 MP','Light Magic'],['Radiant Mark','4 MP','Light Magic']],
    dark:[['Shadow Veil','4 MP','Dark Magic']],
    celestial:[['Starfall Sigil','8 MP','Celestial Magic']],
    infernal:[['Hellbrand','7 MP','Infernal Magic']],
    blood:[['Blood Rite','4 HP','Blood Magic'],['Vein Thread','3 HP','Blood Magic']],
    chaos:[['Fracture Pulse','7 MP','Chaos Magic']],
    eldritch:[['Void Needle','6 MP','Eldritch Magic']],
    fae:[['Glamour Flicker','5 MP','Fae Magic']],
    fate:[['Thread Tug','6 MP','Fate Magic']],
    space:[['Step Between','8 MP','Space Magic']],
    spirit:[['Soul Echo','5 MP','Spirit Magic']],
    time:[['Moment Slip','7 MP','Time Magic']],
    abyssal:[['Deep Call','8 MP','Abyssal Magic']]
  };

  const basic = [
    ['Air Magic','air','#9fdcff','Pale Blue','Soft sky hue; faint wisps of light trail movement.','Areomancer'],
    ['Earth Magic','earth','#2f8b4a','Green','Deep moss green with earthy undertones.','Geomancer'],
    ['Fire Magic','fire','#d12e23','Red','Bright ember red, occasionally flickers gold at edges.','Pyromancer'],
    ['Water Magic','water','#1e7fff','Blue','Oceanic blue, fluid and reflective with ripple-like shimmer.','Aquamancer'],
    ['Life Magic','life','#ffd84d','Yellow','Vibrant sun-glow, pulses rhythmically like a heartbeat.','Biomancer'],
    ['Death Magic','death','#5b2c89','Purple','Dark purple with smoky black undertones.','Necromancer'],
    ['Light Magic','light','#fff7de','White','Radiant, glows softly even in daylight.','Auramancer'],
    ['Dark Magic','dark','#08080d','Black','Absorbs nearby light, faint violet sheen in the dark.','Noctomancer']
  ];

  const higher = [
    ['Celestial Magic','celestial','#ffd86b','Luminous Gold','Shimmering gold with starlit flecks; divine radiance.','Caelemancer'],
    ['Infernal Magic','infernal','#a30f16','Crimson Red','Deep red with black smoke veins; faint heat distortion.','Infernamancer'],
    ['Blood Magic','blood','#7b0000','Deep Red','Viscous red with subtle pulsation; darkens with age.','Sangramancer'],
    ['Chaos Magic','chaos','#8c8b86','Ashen Grey','Constantly shifting hue; static flickers like distortion.','Anarcomancer'],
    ['Eldritch Magic','eldritch','#00543d','Dark Emerald','Blackened green that swirls inward like a vortex.','Eldomancer'],
    ['Fae Magic','fae','#ff8fc7','Rose Pink','Warm pink, with shifting iridescence under light.','Glamomancer'],
    ['Fate Magic','fate','#7b1635','Wine Red','Deep maroon with streaks of metallic copper; unpredictable shimmer.','Destimancer'],
    ['Space Magic','space','#061a48','Midnight Blue','Dark blue with silver-white star-specks scattered through.','Astromancer'],
    ['Spirit Magic','spirit','#dfefff','Silver White','Ethereal glow, faintly translucent, leaves mist trails.','Psychomancer'],
    ['Time Magic','time','#b98b35','Bronze Gold','Flickers like sand in an hourglass, faint ticking shimmer.','Chronomancer'],
    ['Abyssal Magic','abyssal','#020713','Obsidian Blue','Deep black with abyssal blue undertones, pulses faintly like a heartbeat.','Nyhlomancer']
  ];

  function entry(tuple, group){
    const [name, slug, color, colourName, description, mancer] = tuple;
    return {
      name,
      slug,
      label:name.replace(/\s+Magic$/i, ''),
      group,
      color,
      cssColor:color,
      colourName,
      mancer,
      cls:`magic-${slug}`,
      desc:colourName,
      description,
      spells:spellSamples[slug] || []
    };
  }

  const groups = [
    { label:'Basic Elements', elements:basic.map(item => entry(item, 'Basic Elements')) },
    { label:'Higher Elements', elements:higher.map(item => entry(item, 'Higher Elements')) }
  ];
  const all = groups.flatMap(group => group.elements);
  const bySlug = Object.fromEntries(all.map(item => [item.slug, item]));

  function slugFor(value){
    const text = String(value || '').trim().toLowerCase();
    if(!text) return '';
    if(bySlug[text]) return text;
    const clean = text.replace(/\s+magic$/i, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return bySlug[clean] ? clean : '';
  }

  window.ASTERIA_MAGIC_LIBRARY = { groups, basic:groups[0].elements, higher:groups[1].elements, all, bySlug, slugFor };
})();
