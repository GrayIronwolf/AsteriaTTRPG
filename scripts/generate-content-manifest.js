const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONTENT = path.join(ROOT, 'content');
const OUT = path.join(ROOT, 'js', 'content-manifest.js');

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ðŸ”’/g, 'locked')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'page';
}

function toWebPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function isDeprecatedLooseResourcePath(relativePath) {
  const normalized = toWebPath(relativePath).toLowerCase().replace(/&/g, 'and');
  return [
    'items/resources and materials/ores/',
    'items/resources and materials/ingots/',
    'items/resources and materials/metal ores/',
    'items/resources and materials/metal ingots/'
  ].some(fragment => normalized.includes(fragment));
}

function isCollectionIndexPath(relativePath) {
  const normalized = toWebPath(relativePath).toLowerCase();
  return /(^|\/)(flora|minerals|materials)\/index\.md$/.test(normalized);
}

function walk(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const next = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(next, output);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const base = entry.name.toLowerCase();
      if (base === 'readme.md' || base.startsWith('_')) return;
      const rel = path.relative(CONTENT, next);
      if (isCollectionIndexPath(rel)) return;
      if (!isDeprecatedLooseResourcePath(rel)) output.push(next);
    }
  }
  return output;
}

const used = {};
const pages = walk(CONTENT).sort().map(file => {
  const rel = toWebPath(path.relative(CONTENT, file));
  const stem = path.basename(file, '.md');
  let slug = slugify(stem);
  if (used[slug]) slug = `${slug}-${++used[slug]}`;
  else used[slug] = 1;

  return {
    slug,
    title: stem,
    category: path.dirname(rel) === '.' ? 'Uncategorised' : path.dirname(rel).split(/[\\/]/).join('/'),
    source: rel,
    content: fs.readFileSync(file, 'utf8')
  };
});

fs.writeFileSync(OUT, `window.ASTERIA_CONTENT = ${JSON.stringify({ pages }, null, 2)};\n`, 'utf8');
console.log(`Generated ${pages.length} pages`);
