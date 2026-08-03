export const TERMINAL_EVENT_STATUSES = new Set(['accepted', 'equipped', 'declined', 'resolved', 'failed']);

export function eventTime(event = {}) {
  const value = event.createdAt;
  if(typeof value?.toMillis === 'function') return value.toMillis();
  if(typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sortEvents(events = []) {
  return [...events].sort((a, b) => eventTime(b) - eventTime(a));
}

export function mergeEvents(previous = [], incoming = []) {
  const records = new Map(previous.filter(Boolean).map(event => [String(event.id || ''), event]));
  incoming.filter(Boolean).forEach(event => {
    const id = String(event.id || '');
    if(!id) return;
    records.set(id, Object.assign({}, records.get(id) || {}, event));
  });
  return sortEvents(Array.from(records.values()));
}

export function applyEventOnce(processed, event, apply) {
  const id = String(event?.id || '');
  if(!id || processed.has(id)) return false;
  processed.add(id);
  apply(event);
  return true;
}

export function eventIsResolved(event = {}) {
  return Boolean(event.resolvedAt || TERMINAL_EVENT_STATUSES.has(String(event.status || '').toLowerCase()));
}

export function pendingLootEvent(events = []) {
  return sortEvents(events).find(event => event.type === 'loot-reward' && !eventIsResolved(event)) || null;
}

export function xpNoticeEvent(events = [], acknowledged = new Set()) {
  return sortEvents(events).find(event => event.type === 'xp-reward' && !event.acknowledged && !acknowledged.has(event.id)) || null;
}

export function nextSessionState(current = {}, action) {
  const type = typeof action === 'string' ? action : action?.type;
  if(type === 'start') return Object.assign({}, current, { status: 'active' });
  if(type === 'pause' && current.status === 'active') return Object.assign({}, current, { status: 'paused' });
  if(type === 'resume' && current.status === 'paused') return Object.assign({}, current, { status: 'active' });
  if(type === 'end' && ['active', 'paused'].includes(current.status)) return Object.assign({}, current, { status: 'ended' });
  return current;
}

export function resourcePatch(character = {}, key, amount) {
  const normalized = String(key || '').toLowerCase();
  if(!['hp', 'sp', 'mp', 'bp'].includes(normalized)) return {};
  const pair = Array.isArray(character[normalized]) ? character[normalized] : [0, 0];
  const maximum = Math.max(0, Number(pair[1] || 0));
  const current = Math.max(0, Math.min(maximum, Number(pair[0] || 0) + Number(amount || 0)));
  return { [normalized]: [current, maximum] };
}
