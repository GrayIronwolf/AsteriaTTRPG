/**
 * Phase 3.1 read-only public catalogue, sharded per domain.
 * Files are generated from canonical data/compendium-parts before Vite build.
 * Never import raw data/compendium*.js or unrestricted GM-only JSON here.
 */
import {validatePublishedCatalogue} from './publicationPolicy.mjs';
const importers = import.meta.glob('./public-index/*.json', { import:'default' });
const pending = new Map();
const allowedPaths = new Set(Object.keys(importers));

export async function loadPublicDomain(domain) {
  if (typeof domain !== 'string' || !/^[a-z]+$/.test(domain)) {
    throw new RangeError('Unknown public Compendium domain');
  }
  const path = './public-index/' + domain + '.json';
  if (!allowedPaths.has(path)) throw new RangeError('Unknown public Compendium domain: ' + domain);
  if (!pending.has(domain)) {
    const promise = importers[path]().then(data => {
      if (data?.version !== 1 || data.domain !== domain || !Array.isArray(data.entries)) {
        throw new Error('Invalid public Compendium catalogue shard');
      }
      return Object.freeze(data.entries.map(entry => validatePublishedCatalogue(entry,domain)));
    }).catch(error => { pending.delete(domain); throw error; });
    pending.set(domain, promise);
  }
  return pending.get(domain);
}
