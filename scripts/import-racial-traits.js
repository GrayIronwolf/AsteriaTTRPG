const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const [raceSlug, sourcePath] = process.argv.slice(2);

if (!raceSlug || !sourcePath) {
  throw new Error('Usage: node scripts/import-racial-traits.js <race-slug> <manuscript-path>');
}

const racePath = path.join(root, 'content', 'races', raceSlug, 'index.md');
if (!fs.existsSync(racePath)) throw new Error(`Race content was not found: ${raceSlug}`);
if (!fs.existsSync(sourcePath)) throw new Error(`Racial-trait manuscript was not found: ${sourcePath}`);

const race = fs.readFileSync(racePath, 'utf8');
const manuscript = fs.readFileSync(sourcePath, 'utf8').trim();
const start = race.indexOf('## Racial Traits');
const end = race.indexOf('## Lore', start);
if (start < 0 || end < 0) throw new Error(`${raceSlug} is missing its Racial Traits or Lore section.`);

const next = `${race.slice(0, start)}## Racial Traits\n${manuscript}\n\n${race.slice(end)}`;
fs.writeFileSync(racePath, next, 'utf8');
console.log(`Imported racial traits for ${raceSlug} from ${path.basename(sourcePath)}.`);
