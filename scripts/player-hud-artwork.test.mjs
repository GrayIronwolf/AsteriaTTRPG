import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hudImageSource, hudImagePosition } from '../src/state/playerHudMedia.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('HUD artwork accepts existing and newly uploaded character/campaign image fields', () => {
  assert.equal(hudImageSource('', null, {url:'https://example.org/campaign.webp'}), 'https://example.org/campaign.webp');
  assert.equal(hudImageSource('  https://example.org/portrait.webp  '), 'https://example.org/portrait.webp');
  assert.equal(hudImageSource(null, undefined), '');
});

test('HUD crop positions are supported without arbitrary CSS', () => {
  for (const position of ['center top', '25% 80%', 'left', 'right bottom']) {
    assert.equal(hudImagePosition(position), position);
  }
  assert.equal(hudImagePosition('url(https://example.org/test)'), 'center');
  assert.equal(hudImagePosition('position: absolute'), 'center');
});

test('Player HUD uses full-height unframed art on both sides without losing existing controls', () => {
  const jsx = read('src/components/DashboardInformation.jsx');
  const css = read('src/styles/asteria-react.css');
  assert.match(jsx, /react-player-cinematic-hud/);
  assert.match(jsx, /react-player-hud-portrait/);
  assert.match(jsx, /react-player-hud-campaign-art/);
  assert.match(jsx, /campaign\.image, campaign\.art, campaign\.banner/);
  assert.match(jsx, /showPortrait=\{false\}/);
  assert.match(jsx, /<ExperienceBar character=\{character\} cinematic/);
  assert.match(jsx, /<ResourceBarGroup character=\{character\}/);
  assert.match(jsx, /<CharacteristicSummary character=\{character\}/);
  assert.match(jsx, /<CampaignInformationPanel \{\.\.\.props\} preferences=\{preferences\} embedded cinematic/);
  assert.match(jsx, /onResourceChange=\{props\.onResourceChange\}/);
  assert.match(css, /\.react-player-topbar\.react-player-cinematic-hud/);
  assert.match(css, /object-fit: cover/);
  assert.match(css, /\.react-player-hud-portrait::after/);
  assert.match(css, /\.react-player-hud-campaign-art::after/);
  assert.match(css, /@container \(max-width: 900px\)/);
  assert.match(css, /@container \(max-width: 620px\)/);
  assert.doesNotMatch(read('src/dashboards/GMDashboard.jsx'), /react-player-cinematic-hud/);
});

test('Cinematic identity and campaign details sit on images without redundant section headers', () => {
  const jsx = read('src/components/DashboardInformation.jsx');
  const css = read('src/styles/asteria-react.css');
  assert.match(jsx, /react-player-portrait-caption/);
  assert.match(jsx, /react-player-campaign-caption/);
  assert.match(jsx, /<PlayerLevelDisplay character=\{character\}[^>]+cinematic/);
  assert.match(jsx, /<ExperienceBar character=\{character\} cinematic/);
  assert.match(jsx, /<CampaignInformationPanel \{\.\.\.props\} preferences=\{preferences\} embedded cinematic/);
  assert.match(jsx, /!cinematic \? <div[^>]+Active Character/);
  assert.match(jsx, /!cinematic \? <div[^>]+Campaign Information/);
  assert.match(jsx, /String\(value.type \|\| ''\).toLowerCase\(\) === 'guild'/);
  assert.match(css, /asteria-level-shield\.webp/);
  assert.match(css, /\.react-player-campaign-overlay \.react-connection/);
  assert.match(css, /background: transparent !important/);
  assert.match(css, /@container \(max-width: 620px\)/);
  assert.match(css, /@container \(max-width: 420px\)/);
});
