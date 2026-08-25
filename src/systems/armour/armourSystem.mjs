import {
  ARMOUR_LOCATIONS,
  ARMOUR_PIECES,
  ARMOUR_TYPES,
  EQUIPMENT_LOCATION_ALIASES,
  ITEM_QUALITY_AC_MODIFIERS,
  ITEM_QUALITY_RANKS
} from './armourConfig.mjs';

const finite = value => Number.isFinite(Number(value));
const number = (value, fallback = 0) => finite(value) ? Number(value) : fallback;
export const armourSlug = value => String(value || '').trim().toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const compact = value => armourSlug(value).replace(/-/g,'');
const list = value => Array.isArray(value) ? value : value ? [value] : [];
const clone = value => JSON.parse(JSON.stringify(value || {}));

function sources(value) {
  if(!value || typeof value !== 'object') return [];
  return [value, value.metadata, value.raw, value.raw?.metadata, value.character, value.character?.metadata].filter(source => source && typeof source === 'object');
}

function read(value, keys) {
  for(const source of sources(value)) {
    for(const key of keys) {
      if(source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
      const found = Object.keys(source).find(candidate => compact(candidate) === compact(key));
      if(found && source[found] !== undefined && source[found] !== null && source[found] !== '') return source[found];
    }
  }
  return undefined;
}

function universalEntries(domain = '') {
  const entries = globalThis.ASTERIA_UNIVERSAL_COMPENDIUM_INDEX?.entries;
  const values = Array.isArray(entries) ? entries : Object.values(entries || {}).flat();
  return domain ? values.filter(entry => String(entry.domain || entry.type || '').toLowerCase() === domain) : values;
}

function catalogEntries(options, key) {
  const provided = options?.[key];
  if(Array.isArray(provided)) return provided;
  if(provided && typeof provided === 'object') return Object.values(provided);
  return universalEntries(key === 'races' ? 'race' : 'item');
}

export function normalizeQuality(value) {
  if(finite(value)) {
    const rank = Math.max(1, Math.min(8, Math.floor(Number(value))));
    return Object.keys(ITEM_QUALITY_RANKS).find(key => ITEM_QUALITY_RANKS[key] === rank) || 'average';
  }
  const key = compact(value);
  return Object.keys(ITEM_QUALITY_AC_MODIFIERS).find(candidate => compact(candidate) === key) || '';
}

export function resolveQuality(item = {}) {
  const raw = read(item, ['quality','itemQuality','item_quality','qualityRank','quality_rank']);
  const id = normalizeQuality(raw);
  return {
    id,
    name:id ? id.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^\w/, value => value.toUpperCase()) : 'Missing',
    rank:id ? ITEM_QUALITY_RANKS[id] : null,
    modifier:id ? ITEM_QUALITY_AC_MODIFIERS[id] : 0,
    configured:Boolean(id)
  };
}

export function resolveArmourPiece(item = {}) {
  const requested = read(item, ['armourPieceType','armorPieceType','armour_piece_type','armor_piece_type','pieceType','piece_type']);
  const records = Object.values(ARMOUR_PIECES);
  const requestedKey = compact(requested);
  if(requestedKey) {
    const explicit = records.find(definition => [definition.id, definition.name, ...definition.aliases].some(name => compact(name) === requestedKey));
    if(explicit) return explicit;
  }
  const candidates = [item.name, item.title, item.trueName].filter(Boolean).map(compact);
  const matches = [];
  records.forEach(definition => {
    [definition.id, definition.name, ...definition.aliases].forEach(name => {
      const key = compact(name);
      candidates.forEach(candidate => {
        if(candidate === key || candidate.endsWith(key)) matches.push({ definition, exact:candidate === key, length:key.length });
      });
    });
  });
  matches.sort((left,right) => Number(right.exact) - Number(left.exact) || right.length - left.length);
  return matches[0]?.definition || null;
}

export function normalizeEquipmentLocation(value) {
  const key = compact(value);
  if(!key) return '';
  for(const location of ARMOUR_LOCATIONS) {
    const aliases = EQUIPMENT_LOCATION_ALIASES[location.toLowerCase()] || [location];
    if([location, ...aliases].some(alias => compact(alias) === key)) return location;
  }
  return '';
}

export function resolveArmourType(value) {
  const raw = typeof value === 'string' ? value : read(value, ['armourType','armorType','armour_type','armor_type','armourSet','armorSet']);
  const key = compact(raw);
  if(!key) return null;
  return Object.values(ARMOUR_TYPES).find(definition => [definition.id,definition.name,definition.name.replace(/ armour$/i,'')].some(name => compact(name) === key)) || null;
}

function materialName(item) {
  const explicit = read(item, ['materialName','material_name','material','materialFamily','material_family']);
  if(explicit && typeof explicit === 'object') return explicit.name || explicit.title || explicit.slug || '';
  if(explicit) return String(explicit).replace(/\s+Ingot$/i,'').trim();
  const title = String(item.trueName || item.name || item.title || '');
  const piece = resolveArmourPiece(item);
  if(piece) return title.replace(new RegExp(piece.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),'').trim();
  return '';
}

export function resolveMaterialBaseAC(item = {}, options = {}) {
  const direct = read(item, ['materialBaseAC','material_base_ac','materialAC','material_ac']);
  const material = materialName(item);
  if(finite(direct)) return { value:Number(direct), material:material || 'Item Material', source:'item', configured:true };
  const embedded = read(item, ['materialData','material_data']);
  const embeddedValue = read(embedded || {}, ['materialBaseAC','material_base_ac','armorModifier','armor_modifier','armourModifier','armour_modifier']);
  if(finite(embeddedValue)) return { value:Number(embeddedValue), material:material || embedded?.name || 'Item Material', source:'snapshot', configured:true };
  const key = compact(material);
  const entry = catalogEntries(options, 'materials').find(record => {
    const names = [record.title,record.name,record.slug,read(record,['materialFamily','material_family'])].map(compact);
    return key && names.some(name => name === key || name === `${key}ingot` || compact(name.replace(/ingot$/,'')) === key);
  });
  const fromEntry = read(entry || {}, ['materialBaseAC','material_base_ac','armorModifier','armor_modifier','armourModifier','armour_modifier']);
  return finite(fromEntry)
    ? { value:Number(fromEntry), material:material || entry.title || entry.name || 'Material', source:'compendium', configured:true, entry }
    : { value:0, material:material || 'Missing', source:'missing', configured:false, entry:null };
}

export function resolveNaturalAC(character = {}, options = {}) {
  const direct = read(character, ['naturalAC','natural_ac']);
  if(finite(direct)) return { value:Math.max(1,Math.min(12,Number(direct))), source:'character-snapshot', configured:true };
  const raceSnapshot = character.raceData || character.raceInfo || character.racial_info || (typeof character.race === 'object' ? character.race : character.character?.race);
  const snapshotValue = read(raceSnapshot || {}, ['naturalAC','natural_ac']);
  if(finite(snapshotValue)) return { value:Math.max(1,Math.min(12,Number(snapshotValue))), source:'race-snapshot', configured:true };
  const raceName = typeof character.race === 'string' ? character.race : character.race?.title || character.race?.name || character.character?.race?.title || character.raceSlug || character.character?.race?.slug;
  const key = compact(raceName);
  const race = catalogEntries(options, 'races').find(entry => [entry.title,entry.name,entry.slug].some(value => compact(value) === key));
  const catalogValue = read(race || {}, ['naturalAC','natural_ac']);
  return finite(catalogValue)
    ? { value:Math.max(1,Math.min(12,Number(catalogValue))), source:'race-compendium', configured:true, entry:race }
    : { value:1, source:'fallback', configured:false, entry:race || null };
}

export function craftArmourBaseAC(materialBaseAC, quality) {
  const qualityResult = typeof quality === 'object' && quality.modifier !== undefined ? quality : resolveQuality({ quality });
  const base = number(materialBaseAC);
  const craftedBaseAC = base + number(qualityResult.modifier);
  return { materialBaseAC:base, quality:qualityResult, craftedBaseAC, destroyed:craftedBaseAC < 0, survives:craftedBaseAC >= 0 };
}

export function calculateArmourPieceAC(item = {}, options = {}) {
  const piece = resolveArmourPiece(item);
  const material = resolveMaterialBaseAC(item, options);
  const quality = resolveQuality(item);
  const explicitPercentile = read(item, ['armourPiecePercentile','armorPiecePercentile','piecePercentile','piece_percentile']);
  const percentile = finite(explicitPercentile) ? Number(explicitPercentile) : piece?.percentile;
  const errors = [];
  if(!piece) errors.push('Missing or unknown armour-piece type.');
  if(!material.configured) errors.push('Missing material or Material Base AC.');
  if(!quality.configured) errors.push('Missing item quality; Average (+0) is used as a safe migration fallback.');
  if(!finite(percentile) || Number(percentile) < 0 || Number(percentile) > 1) errors.push('Invalid armour-piece percentile.');
  const crafting = craftArmourBaseAC(material.value, quality);
  const contribution = piece && material.configured && finite(percentile)
    ? crafting.craftedBaseAC * Number(percentile)
    : 0;
  return {
    itemId:String(item.id || item.instanceId || item.catalogId || armourSlug(item.name || item.title)),
    name:String(item.name || item.title || 'Armour Item'),
    item,
    piece,
    location:piece?.location || normalizeEquipmentLocation(item.equippedSlot || item.slot),
    materialName:material.material,
    materialBaseAC:material.value,
    materialSource:material.source,
    quality,
    modifiedBaseAC:crafting.craftedBaseAC,
    percentile:finite(percentile) ? Number(percentile) : 0,
    contribution,
    armourType:resolveArmourType(item),
    valid:errors.length === 0,
    errors
  };
}

function equippedItems(character = {}) {
  const output = [];
  const seen = new Set();
  const push = (source, slot = '') => {
    if(!source) return;
    const item = typeof source === 'string' ? { name:source } : source;
    const id = String(item.id || item.instanceId || `${armourSlug(item.name || item.title)}:${compact(slot || item.equippedSlot || item.slot)}`);
    if(seen.has(id)) return;
    seen.add(id);
    output.push({ ...item, equipped:true, equippedSlot:item.equippedSlot || item.slot || slot });
  };
  list(character.inventory).filter(item => item?.equipped).forEach(item => push(item));
  Object.entries(character.equipment || {}).forEach(([slot,item]) => push(item,slot));
  return output;
}

function modifierRecords(source, sourceType, output, seen) {
  list(source).forEach((modifier,index) => {
    if(!modifier || typeof modifier !== 'object') return;
    const type = String(modifier.type || modifier.effectType || '').toUpperCase();
    if(['AC_MODIFIER','AC_MODIFIER_CONDITIONAL'].includes(type)) {
      const active = modifier.active !== false && !modifier.expired && (!modifier.expiresAt || new Date(modifier.expiresAt).getTime() > Date.now());
      const id = String(modifier.id || `${sourceType}-${index}-${modifier.sourceId || modifier.name || modifier.source || ''}`);
      if(!seen.has(id)) {
        seen.add(id);
        output.push({
          id,
          sourceType:String(modifier.sourceType || sourceType || 'other'),
          sourceId:modifier.sourceId || '',
          name:String(modifier.name || modifier.source || `${sourceType} AC modifier`),
          value:number(modifier.value),
          active,
          temporary:Boolean(modifier.temporary || modifier.duration || modifier.expiresAt),
          conditional:type === 'AC_MODIFIER_CONDITIONAL' || Boolean(modifier.condition),
          condition:modifier.condition || ''
        });
      }
    }
    const parentName=modifier.name || modifier.source || '';
    [...list(modifier.effects),...list(modifier.modifiers)].forEach((effect,nestedIndex)=>{
      if(!effect || typeof effect!=='object')return;
      modifierRecords([{...effect,id:effect.id||`${modifier.id||sourceType}-${nestedIndex}`,name:effect.name||parentName,sourceId:effect.sourceId||modifier.id||modifier.sourceId}],modifier.sourceType||sourceType,output,seen);
    });
  });
}

export function collectACModifiers(character = {}, armourPieces = []) {
  const output = [];
  const seen = new Set();
  modifierRecords(character.acModifiers || character.armourModifiers || character.armorModifiers, 'other', output, seen);
  modifierRecords(character.enchantments, 'enchantment', output, seen);
  modifierRecords(character.activeEffects || character.effects, 'other', output, seen);
  modifierRecords(character.spells || character.activeSpells, 'spell', output, seen);
  modifierRecords(character.talents || character.unlockedTalents, 'talent', output, seen);
  modifierRecords(character.racialTraits || character.raceTraits, 'racial_trait', output, seen);
  modifierRecords(character.conditions || character.statusEffects, 'status_effect', output, seen);
  armourPieces.forEach(piece => {
    modifierRecords(piece.item.enchantments, 'enchantment', output, seen);
    modifierRecords(piece.item.effects, 'item', output, seen);
  });
  return output;
}

function determineArmourType(character, pieces) {
  const explicit = resolveArmourType(character);
  if(explicit) return explicit;
  const counts = new Map();
  pieces.filter(piece => piece.valid && piece.piece?.location !== 'Off-Hand' && piece.armourType).forEach(piece => counts.set(piece.armourType.id,(counts.get(piece.armourType.id)||0)+1));
  const id = [...counts.entries()].sort((left,right)=>right[1]-left[1])[0]?.[0];
  return id ? ARMOUR_TYPES[id] : null;
}

export function validateArmourLoadout(character = {}, options = {}) {
  const items = equippedItems(character);
  const pieces = items.map(item => calculateArmourPieceAC(item, options)).filter(result => result.piece || /armour|armor|shield|helm|mail|cuirass|plate|greave|boot|gauntlet|bracer|coif/i.test(`${itemName(result.item)} ${result.item.type || ''}`));
  const errors = [];
  const warnings = [];
  const occupied = new Map();
  pieces.forEach(result => {
    result.errors.forEach(message => warnings.push(`${result.name}: ${message}`));
    const equippedLocation = normalizeEquipmentLocation(result.item.equippedSlot || result.item.slot);
    if(result.piece && !equippedLocation) errors.push(`${result.name}: invalid equipment location "${result.item.equippedSlot || result.item.slot || 'missing'}".`);
    if(result.piece && equippedLocation && equippedLocation !== result.piece.location) errors.push(`${result.name}: ${result.piece.name} belongs in ${result.piece.location}, not ${equippedLocation}.`);
    const key = result.piece?.location;
    if(key && occupied.has(key)) errors.push(`${result.name} duplicates ${occupied.get(key)} in ${key}.`);
    else if(key) occupied.set(key,result.name);
    if(result.piece?.location === 'Off-Hand' && !['Off-Hand',''].includes(equippedLocation)) errors.push(`${result.name}: shield requires a valid off-hand slot.`);
  });
  const armourType = determineArmourType(character,pieces);
  const validArmourPieces = pieces.filter(piece => piece.valid && piece.piece?.location !== 'Off-Hand');
  if(armourType && validArmourPieces.length > armourType.maxPieces) errors.push(`${armourType.name} permits at most ${armourType.maxPieces} armour pieces; ${validArmourPieces.length} are equipped.`);
  const mixed = [...new Set(pieces.map(piece => piece.armourType?.id).filter(Boolean))];
  if(mixed.length > 1) warnings.push('Mixed armour types are equipped; the explicit or dominant type controls the one-time set bonus.');
  return { valid:errors.length === 0 && pieces.every(piece => piece.valid), errors, warnings, pieces, armourType };
}

function itemName(item) { return String(item?.name || item?.title || 'Item'); }

export function calculateCharacterAC(character = {}, options = {}) {
  const natural = resolveNaturalAC(character, options);
  const validation = validateArmourLoadout(character, options);
  const armourPieces = validation.pieces;
  const armourAC = armourPieces.reduce((total,piece) => total + number(piece.contribution),0);
  const armourType = validation.armourType;
  const armourTypeSetBonus = armourType && armourPieces.some(piece => piece.valid && piece.piece?.location !== 'Off-Hand') ? armourType.setBonusAC : 0;
  const modifiers = collectACModifiers(character,armourPieces);
  const modifierTotal = modifiers.filter(modifier => modifier.active && !modifier.conditional).reduce((total,modifier)=>total+number(modifier.value),0);
  const rawAC = number(natural.value,1) + armourAC + armourTypeSetBonus + modifierTotal;
  const finalAC = Math.max(1,Math.floor(rawAC));
  return {
    naturalAC:natural.value,
    naturalACSource:natural.source,
    naturalACConfigured:natural.configured,
    armourPieces,
    armourAC,
    armourType:armourType?.name || '',
    armourTypeDefinition:armourType,
    armourTypeSetBonus,
    modifiers,
    modifierTotal,
    conditionalModifiers:modifiers.filter(modifier => modifier.active && modifier.conditional),
    mobilityModifier:armourType?.mobilityModifier || 0,
    stealthModifier:armourType?.stealthModifier || 0,
    rawAC,
    finalAC,
    validation:{ ...validation, warnings:[...(!natural.configured ? ['Race Natural AC is missing; safe fallback 1 is active.'] : []),...validation.warnings] }
  };
}

export function validateEquipmentChange(character = {}, item = {}, slot = '', options = {}) {
  const piece = resolveArmourPiece(item);
  if(!piece) return { ok:true, armour:false };
  const location = normalizeEquipmentLocation(slot);
  if(!location) return { ok:false, armour:true, error:`${piece.name} cannot be equipped in the unknown location "${slot}".` };
  if(location !== piece.location) return { ok:false, armour:true, error:`${piece.name} must be equipped in ${piece.location}.` };
  const preview = previewEquipmentChange(character,item,slot,options);
  return preview.result.validation.errors.length ? { ok:false, armour:true, error:preview.result.validation.errors[0], preview } : { ok:true, armour:true, preview };
}

export function previewEquipmentChange(character = {}, item = {}, slot = '', options = {}) {
  const before = calculateCharacterAC(character,options);
  const next = clone(character);
  next.inventory = list(next.inventory).map(entry => {
    const same = String(entry.id || entry.instanceId || '') === String(item.id || item.instanceId || '');
    const occupies = compact(entry.equippedSlot || entry.slot) === compact(slot);
    return { ...entry, equipped:same ? true : occupies ? false : Boolean(entry.equipped), equippedSlot:same ? slot : occupies ? '' : entry.equippedSlot };
  });
  if(!next.inventory.some(entry => String(entry.id || entry.instanceId || '') === String(item.id || item.instanceId || ''))) next.inventory.push({ ...clone(item), equipped:true, equippedSlot:slot });
  next.equipment = { ...(next.equipment || {}), [slot]:{ ...clone(item), equipped:true, equippedSlot:slot } };
  const result = calculateCharacterAC(next,options);
  return {
    before,
    result,
    delta:{ ac:result.finalAC-before.finalAC, rawAC:result.rawAC-before.rawAC, mobility:result.mobilityModifier-before.mobilityModifier, stealth:result.stealthModifier-before.stealthModifier },
    slot
  };
}

export function migrateLegacyArmourItem(item = {}, options = {}) {
  const next = clone(item);
  const piece = resolveArmourPiece(next);
  const quality = resolveQuality(next);
  const material = resolveMaterialBaseAC(next,options);
  const warnings = [];
  if(piece) {
    next.armourPieceType = next.armourPieceType || piece.id;
    next.allowedSlots = Array.from(new Set([...(list(next.allowedSlots)),piece.location]));
  } else warnings.push('Armour-piece type could not be mapped safely.');
  if(!quality.configured) { next.quality='Average'; warnings.push('Missing quality migrated to Average.'); }
  if(material.configured) {
    next.material = next.material || material.material;
    next.materialBaseAC = material.value;
  } else warnings.push('Material Base AC could not be resolved; item was preserved and flagged.');
  return { item:next, warnings, mapped:Boolean(piece && material.configured) };
}

export function migrateCharacterArmour(character = {}, options = {}) {
  const next=clone(character);
  const reports=[];
  next.inventory=list(next.inventory).map(item=>{
    const looksLikeArmour=Boolean(resolveArmourPiece(item)) || /armou?r|shield|helm|mail|cuirass|plate|greave|boot|gauntlet|bracer|coif/i.test(`${itemName(item)} ${item.type||''}`);
    if(!looksLikeArmour)return item;
    const migrated=migrateLegacyArmourItem(item,options);
    reports.push({itemId:item.id||item.instanceId||'',name:itemName(item),mapped:migrated.mapped,warnings:migrated.warnings});
    return migrated.item;
  });
  next.equipment=Object.fromEntries(Object.entries(next.equipment||{}).map(([slot,item])=>{
    if(!item||typeof item!=='object')return [slot,item];
    const looksLikeArmour=Boolean(resolveArmourPiece(item)) || /armou?r|shield|helm|mail|cuirass|plate|greave|boot|gauntlet|bracer|coif/i.test(`${itemName(item)} ${item.type||''}`);
    if(!looksLikeArmour)return [slot,item];
    const migrated=migrateLegacyArmourItem({...item,equipped:true,equippedSlot:item.equippedSlot||slot},options);
    if(!reports.some(report=>report.itemId&&report.itemId===String(item.id||item.instanceId||''))) reports.push({itemId:item.id||item.instanceId||'',name:itemName(item),mapped:migrated.mapped,warnings:migrated.warnings});
    return [slot,migrated.item];
  }));
  const calculation=calculateCharacterAC(next,options);
  return {character:next,reports,calculation,valid:calculation.validation.valid};
}

export function debugAC(result) {
  return [
    `Natural AC: ${result.naturalAC}`,
    'Armour:',
    ...result.armourPieces.map(piece => `  ${piece.name}: ${piece.contribution}`),
    `Armour Total: ${result.armourAC}`,
    `Set: ${result.armourTypeSetBonus >= 0 ? '+' : ''}${result.armourTypeSetBonus}`,
    `Modifiers: ${result.modifierTotal >= 0 ? '+' : ''}${result.modifierTotal}`,
    `Raw: ${result.rawAC}`,
    `Final: ${result.finalAC}`
  ].join('\n');
}

export { ARMOUR_PIECES, ARMOUR_TYPES, ITEM_QUALITY_AC_MODIFIERS };
