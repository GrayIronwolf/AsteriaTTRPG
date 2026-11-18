/**
 * Lazy source for keyword search within *already-public* filtered sections.
 * This module never imports the canonical (unfiltered) Compendium partitions.
 */
import {validatePublishedSearch} from './publicationPolicy.mjs';
const loaders = import.meta.glob('./public-search-index/*.json', {import: 'default'});
const allowed = new Set(Object.keys(loaders));
const requests = new Map();

export async function loadPublicSearchDomain(domain) {
  if (typeof domain !== 'string' || !/^[a-z]+$/.test(domain)) {
    throw new RangeError('Invalid public search domain');
  }
  const path = './public-search-index/' + domain + '.json';
  if (!allowed.has(path)) throw new RangeError('Unknown public search domain');
  if (!requests.has(domain)) {
    requests.set(domain, loaders[path]().then(data => {
      if (data?.version !== 1 || data.domain !== domain ||
          !Array.isArray(data.entries)) throw new Error('Invalid public search index');
      return new Map(data.entries.map(item => {
        const safe=validatePublishedSearch(item,domain);
        return [safe.id,safe.text];
      }));
    }).catch(error => { requests.delete(domain); throw error; }));
  }
  return requests.get(domain);
}
