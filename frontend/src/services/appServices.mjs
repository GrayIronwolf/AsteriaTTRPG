/**
 * No second Firebase instance or window.AsteriaFirebase dependency is created.
 * Domain services are injected explicitly once their feature migration is
 * implemented and permission-tested. No fallbacks to insecure browser state.
 */
export const SERVICE_DOMAINS = Object.freeze([
  'auth',
  'compendium',
  'campaigns',
  'characters',
  'friends',
  'notifications',
  'gameplay'
]);

export class ServiceUnavailableError extends Error {
  constructor(domain) {
    super('Asteria ' + domain + ' service has not been migrated into the React application.');
    this.name = 'ServiceUnavailableError';
    this.domain = domain;
  }
}

export function createAppServices(services = {}) {
  if (services === null || typeof services !== 'object' || Array.isArray(services)) {
    throw new TypeError('Service providers must be an object keyed by domain');
  }

  const entries = new Map();
  for (const [domain, implementation] of Object.entries(services)) {
    if (!SERVICE_DOMAINS.includes(domain)) throw new TypeError('Unknown Asteria service domain: ' + domain);
    if (!implementation || typeof implementation !== 'object' || Array.isArray(implementation)) {
      throw new TypeError('Asteria service must be an explicitly implemented object: ' + domain);
    }
    entries.set(domain, Object.freeze({ ...implementation }));
  }

  return Object.freeze({
    has: domain => entries.has(domain),
    get: domain => entries.get(domain) ?? null,
    require: domain => {
      if (!SERVICE_DOMAINS.includes(domain)) throw new TypeError('Unknown Asteria service domain: ' + domain);
      const provider = entries.get(domain);
      if (!provider) throw new ServiceUnavailableError(domain);
      return provider;
    }
  });
}

// Explicitly empty in the standalone preview. Later migrations must add
// actual authenticated adapters, never fake global Firebase access.
export const previewServices = createAppServices();
