/**
 * Own event handlers and realtime subscriptions under one lifecycle.
 * Once disposed, no listener may be accidentally reattached to a dead view.
 * Future Firebase subscribers return an unsubscribe function to own().
 */
export function createDisposableScope() {
  let disposed = false;
  const teardown = new Set();

  function own(cleanup) {
    if (typeof cleanup !== 'function') throw new TypeError('Cleanup must be a function');
    if (disposed) {
      cleanup();
      return () => {};
    }
    teardown.add(cleanup);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      teardown.delete(cleanup);
      cleanup();
    };
  }

  function listen(target, type, handler, options) {
    if (!target || typeof target.addEventListener !== 'function' ||
        typeof target.removeEventListener !== 'function') {
      throw new TypeError('Expected an event target');
    }
    if (disposed) throw new Error('Cannot listen through a disposed scope');
    target.addEventListener(type, handler, options);
    return own(() => target.removeEventListener(type, handler, options));
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    const errors = [];
    for (const cleanup of [...teardown].reverse()) {
      teardown.delete(cleanup);
      try { cleanup(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'One or more subscriptions could not be cleaned up');
  }

  return Object.freeze({
    own,
    listen,
    dispose,
    get disposed() { return disposed; },
    get count() { return teardown.size; }
  });
}
