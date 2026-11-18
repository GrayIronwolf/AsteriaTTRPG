import { isValidPublicEntryRoute, resolvePublicEntry } from './publicEntryModel.mjs';
import {validatePublishedEntry} from './publicationPolicy.mjs';

// Only prefiltered output is importable, not canonical unfiltered data.
const entryModules = import.meta.glob('./public-entry-index/*.json', { import: 'default' });
const requests = new Map();

export async function loadPublicEntry(domain, slug) {
  if (!isValidPublicEntryRoute(domain, slug)) return { state: 'missing', entry: null };
  const path = './public-entry-index/' + domain + '.json';
  if (!Object.hasOwn(entryModules, path)) return { state: 'missing', entry: null };
  if (!requests.has(domain)) {
    const load = entryModules[path]().then(data => {
      if (data?.version !== 1 || data?.domain !== domain || !Array.isArray(data.entries)) {
        throw new Error('Invalid published Compendium entry shard');
      }
      return Object.freeze(data.entries.map(entry=>validatePublishedEntry(entry,domain)));
    }).catch(error => { requests.delete(domain); throw error; });
    requests.set(domain, load);
  }
  return resolvePublicEntry(await requests.get(domain), slug);
}
