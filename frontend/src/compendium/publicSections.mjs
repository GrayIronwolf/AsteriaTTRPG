/**
 * Build-time publication boundary: remove restricted sections from all
 * public Markdown before creating assets for anonymous visitors.
 */
const PRIVATE_HEADING = /^(?:gm(?:['’]s)?[\s-]*(?:only[\s-]*)?(?:notes?|information|secrets?|details?|content|guidance)|game[\s-]*master[\s-]*(?:notes?|only|secrets?|content)|private[\s-]*(?:notes?|content|information)|spoilers?[\s-]*(?:gm|game[\s-]*master))$/i;

export function normalizeSectionTitle(value) {
  return String(value ?? '').replace(/<[^>]*>/g, '')
    .replace(/[\x60*_~]/g, '').replace(/\s+/g, ' ').trim().replace(/:+$/, '');
}

export function isRestrictedSectionTitle(title) {
  return PRIVATE_HEADING.test(normalizeSectionTitle(title));
}

export function extractPublicSections(markdown) {
  let text = String(markdown ?? '').replace(/\r\n?/g, '\n');
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  const sections = [];
  let current = { title: 'Overview', body: [] };
  let restrictedLevel = 0;
  let inFence = false;
  let fenceChar = '';
  let fenceLength = 0;
  function flush() {
    const body = current.body.join('\n').trim();
    if (body) sections.push({ title: current.title, body });
  }
  for (const line of text.split('\n')) {
    const fence = line.match(/^\s{0,3}(\x60{3,}|~{3,})/);
    if (fence) {
      const run = fence[1];
      if (!inFence) {
        inFence = true; fenceChar = run[0]; fenceLength = run.length;
      } else if (run[0] === fenceChar && run.length >= fenceLength) {
        inFence = false;
      }
      if (!restrictedLevel) current.body.push(line);
      continue;
    }
    const heading = !inFence && line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const depth = heading[1].length;
      const title = normalizeSectionTitle(heading[2]);
      if (restrictedLevel && depth > restrictedLevel) continue;
      if (restrictedLevel && depth <= restrictedLevel) restrictedLevel = 0;
      if (isRestrictedSectionTitle(title)) {
        if (depth === 2 && !restrictedLevel) {
          flush(); current = { title: 'Overview', body: [] };
        }
        restrictedLevel = depth; continue;
      }
      if (restrictedLevel) continue;
      if (depth === 1) continue;
      if (depth === 2) {
        flush(); current = { title: title || 'Overview', body: [] }; continue;
      }
    }
    if (!restrictedLevel) current.body.push(line);
  }
  flush();
  const unique = new Map();
  for (const section of sections) {
    if (isRestrictedSectionTitle(section.title)) continue;
    const count = (unique.get(section.title) || 0) + 1;
    unique.set(section.title, count);
    if (count > 1) section.title += ' (' + count + ')';
  }
  return sections.filter(section => section.body.length > 0);
}
