from pathlib import Path
import json, re
ROOT = Path(__file__).resolve().parents[1]
CONTENT_ROOT = ROOT / 'content'
OUT = ROOT / 'js' / 'content-manifest.js'
def slugify(text):
    text = text.lower().replace('🔒','locked')
    text = re.sub(r'[^a-z0-9]+','-',text).strip('-')
    return text or 'page'
pages=[]
for md in sorted(CONTENT_ROOT.rglob('*.md')):
    rel = md.relative_to(CONTENT_ROOT)
    pages.append({
        'slug': slugify(md.stem),
        'title': md.stem,
        'category': str(rel.parent).replace('\\','/'),
        'source': str(rel).replace('\\','/'),
        'content': md.read_text(encoding='utf-8')
    })
OUT.write_text('window.ASTERIA_CONTENT = ' + json.dumps({'pages':pages}, ensure_ascii=False, indent=2) + ';\n', encoding='utf-8')
print(f'Generated {OUT} with {len(pages)} pages.')
