const { slugify } = require("./content-utils.cjs");
function parseTraits(markdown) {
  const text = String(markdown || '').trim();
  if (!text || text === 'Information coming soon.') return [];
  const traits = [];
  let current = null;
  text.split(/\r?\n/).forEach(line => {
    const heading = line.match(/^#{2,3}\s+(.+)$/);
    const marker = heading?.[1].replace(/:$/, '').trim().toLowerCase();
    if (heading && marker !== 'description' && marker !== 'effects') {
      if (current) traits.push(current);
      current = { name: heading[1].trim(), text: '' };
      return;
    }
    if (current) current.text += `${line}\n`;
  });
  if (current) traits.push(current);
  return traits.map(trait => {
    const text = trait.text.trim();
    const details = parseTraitDetails(text);
    return {
      name: trait.name,
      text,
      description: details.description,
      effects: details.effects
    };
  }).filter(trait => trait.name);
}

function parseTraitDetails(markdown) {
  const description = [];
  const effects = [];
  let mode = '';
  String(markdown || '').split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    const marker = trimmed
      .replace(/^#{1,6}\s+/, '')
      .replace(/\*\*/g, '')
      .replace(/:$/, '')
      .trim()
      .toLowerCase();
    if (marker === 'description') {
      mode = 'description';
      return;
    }
    if (marker === 'effects') {
      mode = 'effects';
      return;
    }
    if (trimmed === '---') return;
    if (mode === 'description') description.push(line);
    if (mode === 'effects' && /^[-*]\s+/.test(trimmed)) {
      effects.push(trimmed.replace(/^[-*]\s+/, '').trim());
    }
  });
  return {
    description: description.join('\n').trim(),
    effects
  };
}

function characteristicKey(label) {
  const aliases = {
    str: 'strength',
    strength: 'strength',
    dex: 'dexterity',
    dexterity: 'dexterity',
    agi: 'agility',
    agility: 'agility',
    con: 'constitution',
    constitution: 'constitution',
    end: 'endurance',
    endurance: 'endurance',
    int: 'intelligence',
    intelligence: 'intelligence',
    wis: 'wisdom',
    wisdom: 'wisdom',
    cha: 'charisma',
    charisma: 'charisma',
    lck: 'luck',
    luck: 'luck'
  };
  return aliases[slugify(label).replace(/-/g, '')] || slugify(label).replace(/-/g, '');
}

function parseCharacteristicRows(markdown) {
  const lines = String(markdown || '').split(/\r?\n/).filter(line => /^\|.+\|$/.test(line.trim()));
  return lines
    .slice(2)
    .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()))
    .filter(cells => cells.length >= 4)
    .map(cells => {
      const modifier = parseInt(cells[1].replace(/[^\-+0-9]/g, ''), 10);
      return {
        key: characteristicKey(cells[0]),
        label: cells[0],
        modifier: Number.isFinite(modifier) ? modifier : 0,
        statRoll: cells[2],
        tierCap: cells[3]
      };
    });
}

module.exports = {parseTraits, parseCharacteristicRows};
