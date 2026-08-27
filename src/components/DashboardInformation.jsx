import React, { useState } from 'react';
import { CurrencyDisplay, DashboardPanel, LiveSyncStatus, LoadingSkeleton, Panel, ResourceBar } from './WorkspaceUI.jsx';
import { AsteriaIcon } from './AsteriaIcons.jsx';
import { CHARACTERISTICS, characteristicTier, characteristicValue, normalizeDashboardPreferences } from '../state/liveWorkspaceModel.mjs';
import { ASTERIA_CURRENCIES, currencyDefinitionFor } from '../systems/currency/currencyConfig.mjs';

function firstValue(...values) {
  return values.find(value => value !== undefined && value !== null && String(value).trim() !== '');
}

function compactCampaignDetails(campaign = {}, session = {}, character = {}) {
  return [
    ['Location', firstValue(campaign.currentLocation, campaign.location, session.location, character.location)],
    ['Region', firstValue(campaign.currentRegion, campaign.region, session.region, character.region)],
    ['Date', firstValue(campaign.inWorldDate, campaign.worldDate, campaign.date, session.inWorldDate)],
    ['Time', firstValue(campaign.inWorldTime, campaign.worldTime, campaign.time, session.inWorldTime)]
  ].filter(([, value]) => value !== undefined);
}

export function selectGold(character = {}) {
  const currencies = character.coins || character.coinPouch || character.currency || {};
  const value = firstValue(currencies.Gold, currencies.gold, character.gold);
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function resourceLabel(key) {
  return String(key)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, value => value.toUpperCase());
}

export function selectCurrencies(character = {}, campaign = {}) {
  const sources = [character.coins, character.coinPouch, character.currency, character.currencies, campaign.currency, campaign.currencies];
  const found = new Map();
  const extras = new Map();
  const excluded = new Set(['hp', 'sp', 'mp', 'bp', 'xp', 'level', 'cp', 'tp', 'asterium', 'asteriumshards', 'arcanite', 'arcanitecrystals']);
  sources.forEach(source => {
    if(!source || typeof source !== 'object' || Array.isArray(source)) return;
    Object.entries(source).forEach(([key, raw]) => {
      const value = typeof raw === 'object' && raw !== null ? firstValue(raw.value, raw.amount, raw.total) : raw;
      const number = Number(value);
      const compact = String(key).replace(/[^a-z0-9]/gi, '').toLowerCase();
      if(!Number.isFinite(number) || excluded.has(compact)) return;
      const definition = currencyDefinitionFor(key);
      if(definition) {
        if(!found.has(definition.id)) found.set(definition.id, number);
        return;
      }
      const label = resourceLabel(key);
      if(!extras.has(label)) extras.set(label, { key, value:number });
    });
  });
  if(!found.has('gold') && Number(character.gold || 0)) found.set('gold', selectGold(character));
  const canonical = ASTERIA_CURRENCIES.map(definition => [
    definition.label,
    Number(found.get(definition.id) || 0),
    definition.storageKey,
    definition
  ]);
  const additional = [...extras.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, record]) => [label, record.value, record.key, null]);
  return [...canonical, ...additional];
}

function characterClasses(character = {}) {
  const values = [
    character.klass,
    typeof character.class === 'string' ? character.class : character.class?.title || character.class?.name,
    character.character?.class?.title,
    ...(Array.isArray(character.classNames) ? character.classNames : []),
    ...(Array.isArray(character.classes) ? character.classes.map(value => value?.title || value?.name || value) : []),
    ...(Array.isArray(character.secondaryClasses) ? character.secondaryClasses.map(value => value?.title || value?.name || value) : [])
  ].filter(Boolean).map(String);
  return [...new Set(values)];
}

function characterClass(character = {}) {
  return characterClasses(character).join(' / ') || 'Unselected Class';
}

function isBloodhunter(character = {}) {
  const classes = [characterClass(character), ...(character.classNames || []), ...(character.classKeys || [])];
  return classes.some(value => String(value || '').toLowerCase().includes('bloodhunter'));
}

function progression(character = {}) {
  return window.AsteriaProgression?.progressSummary?.({ ...character }) || {
    xp: Number(character.xp || 0),
    xpMax: Number(character.xpMax || 1000)
  };
}

function selectedTitle(character = {}, preferences = normalizeDashboardPreferences(character)) {
  if(preferences.hiddenInformationFields.includes('title')) return '';
  const titles = (Array.isArray(character.titles) ? character.titles : []).map((title, index) =>
    typeof title === 'string' ? { id:`title-${index}`, text:title } : title
  );
  const selectedId = character.dashboardPreferences?.visibleTitleId;
  return titles.find(title => title.id === selectedId)?.text || titles[0]?.text || '';
}

function resourcePair(value) {
  if(Array.isArray(value)) return [Number(value[0] || 0), Number(value[1] || 0)];
  if(value && typeof value === 'object') return [Number(value.current ?? value.value ?? 0), Number(value.maximum ?? value.max ?? 0)];
  return [Number(value || 0), Number(value || 0)];
}

function ResourceControl({ label, resource, value, editable, onResourceChange }) {
  const [amount, setAmount] = useState(1);
  const [busy, setBusy] = useState(false);
  const pair = resourcePair(value);
  const update = async direction => {
    if(!onResourceChange) return;
    setBusy(true);
    try { await onResourceChange(resource, direction * Math.max(1, Number(amount || 1))); }
    finally { setBusy(false); }
  };
  return <div className="react-player-resource-row">
    <ResourceBar label={label} kind={resource} value={pair[0]} maximum={pair[1]} compact />
    <div className="react-player-resource-controls" aria-label={`${label} manual adjustment`}>
      <input aria-label={`${label} change amount`} disabled={!editable || busy} type="number" min="1" value={amount} onChange={event => setAmount(Math.max(1, Number(event.target.value || 1)))} />
      <button aria-label={`Remove ${amount} ${label}`} disabled={!editable || busy} onClick={() => update(-1)} type="button">-</button>
      <button aria-label={`Add ${amount} ${label}`} disabled={!editable || busy} onClick={() => update(1)} type="button">+</button>
    </div>
  </div>;
}

export function PlayerLevelDisplay({ character = {}, partyWorkspace = {}, preferences = normalizeDashboardPreferences(character) }) {
  const portrait = character.image || character.portrait || character.characterImage || character.appearance?.image || character.appearance?.portrait;
  const title = selectedTitle(character, preferences);
  const membership = (partyWorkspace.organizations || []).find(value =>
    String(value.type).toLowerCase() === 'adventure party' && (value.memberCharacterIds || []).includes(character.id)
  );
  return <section className="react-player-topbar-section react-player-identity-level" aria-label="Active character">
    <div className="react-player-section-label react-player-topbar-heading"><AsteriaIcon name="character" /><span>Active Character</span></div>
    <div className="react-player-identity-content">
      {!preferences.hiddenInformationFields.includes('portrait') ? <div className="react-player-portrait">{portrait ? <img src={portrait} alt={`${character.name || 'Character'} portrait`} /> : <span>{String(character.name || 'A').charAt(0)}</span>}</div> : null}
      <div className="react-player-identity-copy">
        <strong>{character.name || 'Unnamed Character'}</strong>
        <span>{characterClass(character)}</span>
        {title ? <em>{title}</em> : null}
        {preferences.showPartyMembership && !preferences.hiddenInformationFields.includes('party') && membership ? <em>Member of {membership.name}</em> : null}
      </div>
    </div>
  </section>;
}

export function ExperienceBar({ character = {} }) {
  const xp = progression(character);
  const remaining = Math.max(0, Number(xp.xpMax || 0) - Number(xp.xp || 0));
  return <section className="react-player-topbar-section react-player-xp" aria-label="Experience progression">
    <div className="react-player-section-label react-player-topbar-heading"><AsteriaIcon name="xp" /><span>Experience</span></div>
    <div className="react-player-xp-content">
      <div className="react-level-shield" aria-label={`Level ${Number(character.level || 0)}`}>
        <AsteriaIcon name="level" size={25} />
        <small>Level</small>
        <b>{Number(character.level || 0)}</b>
      </div>
      <div className="react-player-xp-copy">
        <ResourceBar label="XP" kind="xp" value={xp.xp} maximum={xp.xpMax} />
        <small>{Number(xp.xp || 0).toLocaleString()} / {Number(xp.xpMax || 0).toLocaleString()} XP</small>
        <span>{remaining.toLocaleString()} XP to next level</span>
      </div>
    </div>
  </section>;
}

export function ResourceBarGroup({ character = {}, editable, onResourceChange }) {
  const resources = [
    ['HP', 'hp', character.hp || [0, 0]],
    ['MP', 'mp', character.mp || [0, 0]],
    ['SP', 'sp', character.sp || [0, 0]]
  ];
  if(isBloodhunter(character) || Array.isArray(character.bp)) resources.push(['BP', 'bp', character.bp || [0, 20]]);
  return <section className="react-player-topbar-section react-player-resources" aria-label="Character resources">
    <div className="react-player-section-label react-player-topbar-heading"><AsteriaIcon name="use" /><span>Core Resources</span></div>
    <div className="react-player-resource-list">{resources.map(([label, resource, value]) => <ResourceControl key={resource} label={label} resource={resource} value={value} editable={editable} onResourceChange={onResourceChange} />)}</div>
  </section>;
}

export function CharacteristicSummary({ character = {} }) {
  return <section className="react-player-topbar-section react-player-characteristics" aria-label="Character characteristics">
    <div className="react-player-section-label react-player-topbar-heading"><AsteriaIcon name="character" /><span>Characteristics</span></div>
    <div className="react-player-characteristic-grid">
      {CHARACTERISTICS.map(stat => {
        const score = characteristicValue(character, stat.key);
        const tier = characteristicTier(score);
        const modifier = Number(tier.modifier || 0);
        return <article key={stat.key} title={`${stat.label}: ${score}, ${tier.label}${modifier ? ` ${modifier > 0 ? '+' : ''}${modifier}` : ''}`}>
          <span>{stat.short}</span>
          <strong>{score}</strong>
          <small>{modifier ? `${modifier > 0 ? '+' : ''}${modifier}` : tier.label}</small>
        </article>;
      })}
    </div>
  </section>;
}

export function CampaignInformationPanel({ campaign = {}, session = {}, character = {}, loading = false, embedded = false, online, error = '', connectionState = '', preferences = normalizeDashboardPreferences(character) }) {
  const name = campaign.name || character.campaignName || character.campaign || 'Campaign';
  const sessionNumber = firstValue(session.number, campaign.currentSessionNumber);
  const sessionName = firstValue(session.name, session.title, campaign.currentSessionName, campaign.sessionName);
  const details = compactCampaignDetails(campaign, session, character);
  const content = loading ? <LoadingSkeleton label="Loading campaign information" lines={3} /> : <>
    <div className={`react-player-section-label ${embedded ? 'react-player-topbar-heading' : ''}`.trim()}><AsteriaIcon name="campaign" /><span>Campaign Information</span></div>
    <div className="react-player-campaign-title"><strong>{name}</strong>{sessionNumber || sessionName ? <span>{sessionNumber ? `Session ${sessionNumber}` : 'Current Session'}{sessionName ? ` | ${sessionName}` : ''}</span> : <span>No active session details</span>}</div>
    {!preferences.hiddenInformationFields.includes('campaignDetails') ? (details.length ? <dl className="react-player-campaign-facts">{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{String(value)}</dd></div>)}</dl> : <p className="react-player-compact-empty">Location and campaign details have not been recorded.</p>) : null}
    {!preferences.hiddenInformationFields.includes('liveSync') ? <LiveSyncStatus online={online} error={error} loading={loading} connectionState={connectionState} session={session} /> : null}
  </>;
  return embedded ? <section className="react-player-topbar-section react-player-campaign">{content}</section> : <Panel className="react-player-campaign">{content}</Panel>;
}

function CurrencyControl({ label, currencyKey, value, definition, editable, onCurrencyChange }) {
  const [amount, setAmount] = useState(1);
  const [busy, setBusy] = useState(false);
  const update = async direction => {
    if(!onCurrencyChange) return;
    setBusy(true);
    try { await onCurrencyChange(currencyKey, direction * Math.max(1, Number(amount || 1))); }
    finally { setBusy(false); }
  };
  return <div className="react-player-currency-row">
    <CurrencyDisplay
      label={definition?.name || label}
      detail={definition?.material || ''}
      value={value}
      image={definition?.image || ''}
      symbol={String(label).charAt(0)}
      tone={definition?.id === 'gold' || definition?.id === 'royal-crown' ? 'gold' : 'arcane'}
    />
    <div className="react-player-currency-controls" aria-label={`${label} manual adjustment`}>
      <input aria-label={`${label} change amount`} disabled={!editable || busy} type="number" min="1" value={amount} onChange={event => setAmount(Math.max(1, Number(event.target.value || 1)))} />
      <button aria-label={`Remove ${amount} ${label}`} disabled={!editable || busy || Number(value) <= 0} onClick={() => update(-1)} type="button">-</button>
      <button aria-label={`Add ${amount} ${label}`} disabled={!editable || busy} onClick={() => update(1)} type="button">+</button>
    </div>
  </div>;
}

export function CurrencyPanel({ character = {}, campaign = {}, loading = false, error = '', embedded = false, editable = false, onCurrencyChange, className = '', style }) {
  const currencies = selectCurrencies(character, campaign);
  const content = loading ? <LoadingSkeleton label="Loading currency" lines={2} /> : error ? <div className="react-error-state" role="alert">Currency could not be loaded.</div> : <div className="react-player-currencies">{currencies.map(([label, value, currencyKey, definition]) => <CurrencyControl key={definition?.id || label} label={label} currencyKey={currencyKey} value={value} definition={definition} editable={editable} onCurrencyChange={onCurrencyChange} />)}</div>;
  return embedded
    ? <section className={`react-player-topbar-section react-player-currency ${className}`.trim()}><div className="react-player-section-label"><AsteriaIcon name="coin" /><span>Currency</span></div>{content}</section>
    : <DashboardPanel className={`react-player-currency react-dashboard-currency-panel ${className}`.trim()} title="Currency" icon="coin" compact style={style}>{content}</DashboardPanel>;
}

export function DashboardInformationRow(props) {
  const preferences = normalizeDashboardPreferences(props.character);
  return <section className="asteria-react-panel react-campaign-resource-hud react-player-topbar" aria-label="Character progression, resources, characteristics, and campaign status">
    <PlayerLevelDisplay character={props.character} partyWorkspace={props.partyWorkspace} preferences={preferences} />
    <ExperienceBar character={props.character} />
    <ResourceBarGroup character={props.character} editable={props.editable} onResourceChange={props.onResourceChange} />
    <CharacteristicSummary character={props.character} />
    <CampaignInformationPanel {...props} preferences={preferences} embedded />
  </section>;
}

export const CampaignResourceHUD = DashboardInformationRow;
