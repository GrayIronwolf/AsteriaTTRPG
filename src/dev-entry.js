async function loadEntry() {
  const localFixture = ['127.0.0.1', 'localhost'].includes(window.location.hostname) &&
    new URLSearchParams(window.location.search).get('reactFixture') === '1';
  if(localFixture) {
    const { installDevFixtures } = await import('./devFixtures.js');
    installDevFixtures();
  }
  if(import.meta.env?.DEV) {
    if(!localFixture) {
      const { installDevFixtures } = await import('./devFixtures.js');
      installDevFixtures();
    }
    return import('./main.jsx');
  }
  // Keep the entry URL identical to the URLs imported by Rollup chunks. A query
  // suffix here would cause the browser to evaluate a second React runtime.
  return import('../react-dist/asteria-react-content-v1.js');
}

loadEntry().then(() => {
  // A returning browser may still hold the previous eager entry in its cache.
  // Its matching stable chunks remain available; supply its former stylesheet.
  if(window.AsteriaReactMigration?.dashboardRuntime === 'on-demand') return;
  const href = new URL('../react-dist/asteria-react.css', import.meta.url).href;
  if(Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(link => link.href === href)) return;
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = href;
  document.head.appendChild(stylesheet);
}).catch(error => {
  console.warn('Asteria React dashboard bundle is unavailable. Static fallback remains active.', error);
  window.AsteriaReactMigration = Object.assign(window.AsteriaReactMigration || {}, {
    available: false,
    error
  });
});
