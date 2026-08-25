import assert from 'node:assert/strict';
import {
  ARMOUR_PIECES,
  ARMOUR_TYPES,
  calculateArmourPieceAC,
  calculateCharacterAC,
  craftArmourBaseAC,
  migrateCharacterArmour,
  migrateLegacyArmourItem,
  normalizeEquipmentLocation,
  previewEquipmentChange,
  resolveNaturalAC,
  validateEquipmentChange
} from '../src/systems/armour/armourSystem.mjs';

const tests = [];
const test = (name, run) => tests.push({ name, run });
const closeTo = (actual, expected, message = '') => assert.ok(Math.abs(actual - expected) < 1e-9, `${message} expected ${expected}, received ${actual}`);

function armourItem({
  id = 'armour-item',
  name,
  piece = 'cuirass',
  slot = ARMOUR_PIECES[piece]?.location,
  materialBaseAC = 3,
  quality = 'Average',
  armourType = 'Heavy Armour',
  equipped = true,
  ...extra
} = {}) {
  return {
    id,
    name:name || `High Steel ${ARMOUR_PIECES[piece]?.name || 'Armour'}`,
    type:'Armour',
    armourPieceType:piece,
    material:'High Steel',
    materialBaseAC,
    quality,
    armourType,
    equipped,
    equippedSlot:slot,
    ...extra
  };
}

test('quality modifiers and destruction threshold are exact', () => {
  assert.equal(craftArmourBaseAC(3, 'Trash').craftedBaseAC, -3);
  assert.equal(craftArmourBaseAC(3, 'Trash').destroyed, true);
  assert.equal(craftArmourBaseAC(3, 'Poor').craftedBaseAC, 0);
  assert.equal(craftArmourBaseAC(3, 'Poor').survives, true);
  assert.equal(craftArmourBaseAC(3, 'Masterwork').craftedBaseAC, 8);
});

test('every configured armour piece applies its exact percentage', () => {
  for(const piece of Object.values(ARMOUR_PIECES)) {
    const result = calculateArmourPieceAC(armourItem({
      id:piece.id,
      name:`High Steel ${piece.name}`,
      piece:piece.id,
      slot:piece.location,
      materialBaseAC:10,
      armourType:piece.location === 'Off-Hand' ? '' : 'Heavy Armour'
    }));
    closeTo(result.contribution, 10 * piece.percentile, piece.name);
  }
});

test('reference High Steel calculations match the requested examples', () => {
  closeTo(calculateArmourPieceAC(armourItem()).contribution, 3, 'Cuirass');
  closeTo(calculateArmourPieceAC(armourItem({ name:'High Steel Helm', piece:'helm', slot:'Head' })).contribution, 1.5, 'Helm');
  closeTo(calculateArmourPieceAC(armourItem({ name:'High Steel Heavy Gauntlet', piece:'heavyGauntlet', slot:'Hands' })).contribution, 0.6, 'Heavy Gauntlet');
  closeTo(calculateArmourPieceAC(armourItem({ name:'High Steel Breastplate', piece:'breastplate', slot:'Torso' })).contribution, 1.5, 'Breastplate');
  closeTo(calculateArmourPieceAC(armourItem({ quality:'Masterwork' })).contribution, 8, 'Masterwork Cuirass');
  closeTo(calculateArmourPieceAC(armourItem({ name:'High Steel Greave', piece:'greave', slot:'Lower Legs' })).contribution, 0.6, 'Average Greave');
  closeTo(calculateArmourPieceAC(armourItem({ quality:'Superb' })).contribution, 6, 'Superb Cuirass');
});

test('only equipped pieces count and one armour type set bonus is applied', () => {
  const character = {
    naturalAC:2,
    armourType:'Heavy Armour',
    inventory:[
      armourItem(),
      armourItem({ id:'helm', name:'High Steel Helm', piece:'helm', slot:'Head' }),
      armourItem({ id:'spare', name:'Spare High Steel Greave', piece:'greave', slot:'Lower Legs', equipped:false })
    ]
  };
  const result = calculateCharacterAC(character);
  closeTo(result.armourAC, 4.5);
  assert.equal(result.armourTypeSetBonus, ARMOUR_TYPES.heavyArmour.setBonusAC);
  assert.equal(result.rawAC, 10.5);
  assert.equal(result.finalAC, 10);
});

test('final AC is floored once and cannot fall below one', () => {
  const fractional = calculateCharacterAC({
    naturalAC:1,
    armourType:'Cloth',
    inventory:[armourItem({ materialBaseAC:3, piece:'helm', slot:'Head', armourType:'Cloth' })]
  });
  assert.equal(fractional.rawAC, 2.5);
  assert.equal(fractional.finalAC, 2);

  const penalised = calculateCharacterAC({
    naturalAC:1,
    acModifiers:[{ id:'curse', type:'AC_MODIFIER', name:'Curse', value:-50, active:true }]
  });
  assert.equal(penalised.finalAC, 1);
});

test('unconditional active modifiers apply while conditional modifiers stay separate', () => {
  const result = calculateCharacterAC({
    naturalAC:5,
    acModifiers:[
      { id:'shielding', type:'AC_MODIFIER', sourceType:'spell', name:'Shielding', value:2, active:true },
      { id:'cover', type:'AC_MODIFIER_CONDITIONAL', sourceType:'status_effect', name:'Cover', value:4, active:true, condition:'Behind cover' },
      { id:'expired', type:'AC_MODIFIER', name:'Expired Ward', value:9, active:false },
      { id:'timed-out', type:'AC_MODIFIER', name:'Timed Out', value:9, active:true, expiresAt:new Date(Date.now()-1000).toISOString() }
    ],
    enchantments:[{ id:'enchanted-mail', name:'Defence Enchantment', effects:[{ type:'AC_MODIFIER', value:1 }] }]
  });
  assert.equal(result.modifierTotal, 3);
  assert.equal(result.finalAC, 8);
  assert.equal(result.conditionalModifiers.length, 1);
  assert.equal(result.conditionalModifiers[0].name, 'Cover');
});

test('natural AC is race-driven, clamped to 1-12, and has a safe fallback', () => {
  assert.equal(resolveNaturalAC({ raceInfo:{ naturalAC:8 } }).value, 8);
  assert.equal(resolveNaturalAC({ naturalAC:99 }).value, 12);
  assert.equal(resolveNaturalAC({ naturalAC:-4 }).value, 1);
  const fallback = resolveNaturalAC({ race:'Unknown Test Race' }, { races:[] });
  assert.equal(fallback.value, 1);
  assert.equal(fallback.configured, false);
});

test('equipment locations and shield off-hand validation use canonical slots', () => {
  assert.equal(normalizeEquipmentLocation('Chest Armour'), 'Torso');
  assert.equal(normalizeEquipmentLocation('Shield'), 'Off-Hand');
  const shield = armourItem({ id:'shield', name:'High Steel Kite Shield', piece:'kiteShield', slot:'Off-Hand', armourType:'' });
  assert.equal(validateEquipmentChange({ naturalAC:1, inventory:[] }, shield, 'Off-Hand').ok, true);
  const invalid = validateEquipmentChange({ naturalAC:1, inventory:[] }, shield, 'Torso');
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /Off-Hand/);
});

test('piece limits and duplicate occupied locations are rejected', () => {
  const pieces = [
    ['helm','Head'], ['chainmailCoif','Neck'], ['cuirass','Torso'], ['pauldron','Shoulders'],
    ['rerebrace','Upper Arms'], ['couter','Elbows'], ['vambrace','Forearms']
  ].map(([piece,slot], index) => armourItem({ id:`cloth-${index}`, name:`Cloth ${ARMOUR_PIECES[piece].name}`, piece, slot, materialBaseAC:1, armourType:'Cloth' }));
  const tooMany = calculateCharacterAC({ naturalAC:1, armourType:'Cloth', inventory:pieces });
  assert.equal(tooMany.validation.valid, false);
  assert.ok(tooMany.validation.errors.some(error => /at most 6/.test(error)));

  const duplicate = calculateCharacterAC({
    naturalAC:1,
    inventory:[
      armourItem({ id:'cuirass', piece:'cuirass', slot:'Torso' }),
      armourItem({ id:'breastplate', piece:'breastplate', slot:'Torso' })
    ]
  });
  assert.ok(duplicate.validation.errors.some(error => /duplicates/.test(error)));
});

test('equipment preview reports AC, mobility, and stealth changes', () => {
  const item = armourItem({ id:'preview-cuirass' });
  const preview = previewEquipmentChange({ naturalAC:2, inventory:[] }, item, 'Torso');
  assert.equal(preview.before.finalAC, 2);
  assert.equal(preview.result.finalAC, 9);
  assert.deepEqual(preview.delta, { ac:7, rawAC:7, mobility:-5, stealth:-4 });
  const removed=calculateCharacterAC({...preview.result,inventory:preview.result.armourPieces.map(piece=>({...piece.item,equipped:false,equippedSlot:''})),equipment:{},naturalAC:2});
  assert.equal(removed.finalAC,2);
});

test('malformed legacy armour is preserved and explicitly flagged', () => {
  const legacy = { id:'old-helm', name:'Old Helm', type:'Armour' };
  const migrated = migrateLegacyArmourItem(legacy, { materials:[] });
  assert.equal(migrated.item.id, legacy.id);
  assert.equal(migrated.item.name, legacy.name);
  assert.equal(migrated.item.quality, 'Average');
  assert.equal(migrated.mapped, false);
  assert.ok(migrated.warnings.length >= 1);

  const result = calculateCharacterAC({ naturalAC:3, inventory:[{ ...migrated.item, equipped:true, equippedSlot:'Head' }] }, { materials:[] });
  assert.equal(result.finalAC, 3);
  assert.equal(result.validation.valid, false);
  assert.ok(result.validation.warnings.some(warning => /Material Base AC/.test(warning)));

  const characterMigration=migrateCharacterArmour({naturalAC:3,inventory:[legacy]},{materials:[]});
  assert.equal(characterMigration.character.inventory[0].id,'old-helm');
  assert.equal(characterMigration.reports.length,1);
  assert.equal(characterMigration.reports[0].mapped,false);
});

let failures = 0;
for(const { name, run } of tests) {
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch(error) {
    failures += 1;
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message || error);
  }
}

if(failures) {
  console.error(`\n${failures} of ${tests.length} armour tests failed.`);
  process.exitCode = 1;
} else {
  console.log(`\n${tests.length} armour system tests passed.`);
}
