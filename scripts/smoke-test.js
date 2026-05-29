const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const results = [];

function pass(name, detail = '') {
  results.push({ ok: true, name, detail });
}

function fail(name, detail = '') {
  results.push({ ok: false, name, detail });
}

function check(name, condition, detail = '') {
  condition ? pass(name, detail) : fail(name, detail);
}

function matches(regex) {
  return [...html.matchAll(regex)].map(match => match[1]);
}

const cssFiles = matches(/<link[^>]+href="([^"]+)"/g);
const jsFiles = matches(/<script[^>]+src="([^"]+)"/g);

cssFiles.forEach(file => {
  check(`CSS exists: ${file}`, fs.existsSync(path.join(root, file)));
});

jsFiles.forEach(file => {
  check(`JS exists: ${file}`, fs.existsSync(path.join(root, file)));
});

[
  'js/content-manifest.js',
  'js/wiki-index.js',
  'js/asteria-home-guard.js',
  'js/asteria-state.js',
  'js/asteria-view-hooks.js',
  'js/asteria-progression.js',
  'js/asteria-progression-ui.js',
  'js/app.js',
  'js/asteria-inventory-api.js',
  'js/asteria-core-shell.js'
].forEach(file => {
  check(`Required script is loaded: ${file}`, jsFiles.includes(file));
});

['main', 'section', 'div', 'aside', 'header', 'script'].forEach(tag => {
  const open = (html.match(new RegExp(`<${tag}\\b`, 'g')) || []).length;
  const close = (html.match(new RegExp(`</${tag}>`, 'g')) || []).length;
  check(`Balanced <${tag}> tags`, open === close, `${open} open / ${close} close`);
});

const ids = matches(/id="([^"]+)"/g);
const duplicateIds = Object.entries(ids.reduce((acc, id) => {
  acc[id] = (acc[id] || 0) + 1;
  return acc;
}, {})).filter(([, count]) => count > 1);
check('No duplicate IDs', duplicateIds.length === 0, duplicateIds.map(([id, count]) => `${id} x${count}`).join(', '));

[
  'home',
  'workspace',
  'loginPage',
  'forgotPassword',
  'accountCreate',
  'playerHome',
  'campaigns',
  'player',
  'map',
  'crafting',
  'gm',
  'gmPlayer',
  'quests',
  'creature',
  'devLog'
].forEach(id => {
  check(`Required view exists: ${id}`, ids.includes(id));
});

[
  'css/v17447-core.css',
  'css/asteria-core-v2.css',
  'css/asteria-conflict-cleanup-guard.css',
  'js/v17447-core.js',
  'js/asteria-core-v2.js',
  'js/asteria-conflict-cleanup-guard.js',
  'js/v1742-admin-editor.js',
  'js/app.js.bak',
  'js/app.js.bak1720'
].forEach(file => {
  check(`Deleted legacy file is not referenced: ${file}`, !html.includes(file));
});

const mojibakePattern = /[\u00e2\u00c3\u00f0\ufffd]/;
['index.html', 'js/wiki-index.js', 'js/asteria-state.js', 'js/asteria-view-hooks.js', 'js/asteria-progression.js', 'js/asteria-progression-ui.js', 'js/app.js', 'js/asteria-inventory-api.js', 'js/clean-compendium.js'].forEach(file => {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  check(`No mojibake markers: ${file}`, !mojibakePattern.test(text));
});

const appJs = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const coreShellJs = fs.readFileSync(path.join(root, 'js/asteria-core-shell.js'), 'utf8');
const cleanCompendiumJs = fs.readFileSync(path.join(root, 'js/clean-compendium.js'), 'utf8');
const firebaseAuthJs = fs.readFileSync(path.join(root, 'js/firebase-auth.js'), 'utf8');
const authBridgeJs = fs.readFileSync(path.join(root, 'js/auth-bridge.js'), 'utf8');
const dataSyncJs = fs.readFileSync(path.join(root, 'js/data-sync.js'), 'utf8');
const snapshotJs = fs.readFileSync(path.join(root, 'js/compendium-snapshot-v1.1.js'), 'utf8');
const gameplayJs = fs.readFileSync(path.join(root, 'js/asteria-gameplay-systems.js'), 'utf8');
const worldJs = fs.readFileSync(path.join(root, 'js/asteria-world-systems.js'), 'utf8');
const homeGuardJs = fs.readFileSync(path.join(root, 'js/asteria-home-guard.js'), 'utf8');
const homeFixJs = fs.readFileSync(path.join(root, 'js/asteria-home-fix.js'), 'utf8');
const themeSystemJs = fs.readFileSync(path.join(root, 'js/asteria-ui-theme-system.js'), 'utf8');
const themeCss = fs.readFileSync(path.join(root, 'css/asteria-ui-theme-system.css'), 'utf8');
const stylesCss = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
const cleanCompendiumCss = fs.readFileSync(path.join(root, 'css/clean-compendium.css'), 'utf8');
const homeHtml = html.slice(html.indexOf('<section id="home"'), html.indexOf('<section id="loginPage"'));
const gmDashboardBlock = appJs.slice(appJs.indexOf('Asteria GM Dashboard v1'), appJs.indexOf('/* v1.7.3.2 Public Website Layout Helpers */'));
const contentManifestJs = fs.readFileSync(path.join(root, 'js/content-manifest.js'), 'utf8');
check('Legacy global binder removed from app.js', !appJs.includes('bindAsteriaGlobal'));
check('Stacked setView replacements removed from app.js', !/setView\s*=\s*function|window\.setView\s*=\s*function/.test(appJs));
const renderGMAssignments = (appJs.match(/(?:^|\n)renderGM\s*=\s*function/g) || []).length;
check('Stacked renderGM wrappers removed from app.js', renderGMAssignments <= 1, `${renderGMAssignments} renderGM assignments`);
const renderGMPlayerAssignments = (appJs.match(/(?:^|\n)renderGMPlayer\s*=\s*function/g) || []).length;
check('Stacked renderGMPlayer wrappers removed from app.js', renderGMPlayerAssignments <= 1, `${renderGMPlayerAssignments} renderGMPlayer assignments`);
check('Stacked loadPlayer wrappers removed from app.js', !/(?:^|\n)\s*(?:window\.)?loadPlayer\s*=\s*function/.test(appJs));
check('Stacked renderPlayerExtras wrappers removed from app.js', !/(?:^|\n)\s*renderPlayerExtras\s*=\s*function/.test(appJs));
check('Window renderGM wrappers removed from app.js', !/window\.renderGM\s*=\s*function/.test(appJs));
check('State module exposes AsteriaState', fs.readFileSync(path.join(root, 'js/asteria-state.js'), 'utf8').includes('window.AsteriaState'));
const viewHookJs = fs.readFileSync(path.join(root, 'js/asteria-view-hooks.js'), 'utf8');
check('View hook module exposes AsteriaViewHooks', viewHookJs.includes('window.AsteriaViewHooks'));
check('View hook module exposes player hooks', viewHookJs.includes('afterPlayerLoad') && viewHookJs.includes('beforePlayerLoad'));
check('View hook module exposes GM hooks', viewHookJs.includes('afterGMRender'));
check('View hook module exposes GM player hooks', viewHookJs.includes('afterGMPlayerRender') && viewHookJs.includes('beforeGMPlayerRender'));
const progressionJs = fs.readFileSync(path.join(root, 'js/asteria-progression.js'), 'utf8');
check('Progression module exposes AsteriaProgression', progressionJs.includes('window.AsteriaProgression'));
check('Progression module owns XP threshold function', !/function xpToNextLevel/.test(appJs) && progressionJs.includes('function xpToNextLevel'));
check('Progression module owns level-up function', !/function checkLevelUp/.test(appJs) && progressionJs.includes('function checkLevelUp'));
const progressionUiJs = fs.readFileSync(path.join(root, 'js/asteria-progression-ui.js'), 'utf8');
check('Progression UI module exposes AsteriaProgressionUI', progressionUiJs.includes('window.AsteriaProgressionUI'));
check('Progression UI module owns CP rendering', !/function renderCharacteristicCP/.test(appJs) && progressionUiJs.includes('function renderCharacteristicCP'));
check('Progression UI module owns base talent data', !/const asteriaClassTalentTrees/.test(appJs) && progressionUiJs.includes('var asteriaClassTalentTrees'));
check('Progression UI module owns talent spending helpers', !/function applyTalentRanks/.test(appJs) && progressionUiJs.includes('function applyTalentRanks'));
check('Phase 3 gameplay script is loaded', jsFiles.includes('js/asteria-gameplay-systems.js'));
check('Phase 3A exposes gameplay API', gameplayJs.includes('window.AsteriaGameplay') && gameplayJs.includes('openCharacterForge') && gameplayJs.includes('openCharacterCreator') && gameplayJs.includes('openEncounterBuilder'));
check('Phase 3 uses universal compendium data', gameplayJs.includes('AsteriaUniversalCompendium') && gameplayJs.includes("databaseEntries('race')") && gameplayJs.includes("databaseEntries('creature')"));
check('Phase 3 keeps creation talent rules locked', gameplayJs.includes('Players do not freely choose talents') && gameplayJs.includes('startingTalentsForClass'));
check('Phase 3 keeps profession slots campaign-earned', gameplayJs.includes('No Profession Learned') && gameplayJs.includes('assignProfession'));
check('Phase 3A presents Character Forge', gameplayJs.includes("label:'Character Forge'") && gameplayJs.includes('Character Forge') && !gameplayJs.includes("label:'Character Creator'"));
check('Character Forge uses final 9-tab flow with Magic', ["'Race'","'Class'","'Appearance'","'Origin'","'Characteristics'","'Magic'","'Skills'","'Equipment'","'Review'"].every(token => gameplayJs.includes(token)) && gameplayJs.includes('FORGE_TABS') && gameplayJs.includes('MAGIC_TYPE_GROUPS') && !gameplayJs.includes("'Save Character'\\n  ];"));
const forgeStandaloneBranch = gameplayJs.indexOf("if(activeSystem === 'characterCreator')");
const genericGameplayMenu = gameplayJs.indexOf('<h3>Gameplay Systems</h3>');
check('Character Forge renders as standalone page', forgeStandaloneBranch >= 0 && gameplayJs.includes("root.classList.add('phase3-forge-shell')") && genericGameplayMenu > forgeStandaloneBranch);
check('Character Forge uses compendium category panels for race and class', gameplayJs.includes('renderForgeCategoryPanel') && gameplayJs.includes('clean-drilldown-cat') && gameplayJs.includes('AsteriaRaceCompendium.entries') && gameplayJs.includes('AsteriaCodexCompendium.classEntries'));
check('Character Forge uses dashboard characteristic keys', gameplayJs.includes("const FORGE_CHARACTERISTICS = ATTRIBUTE_KEYS") && ['strength','dexterity','agility','constitution','endurance','intelligence','wisdom','charisma','luck'].every(token => gameplayJs.includes(token)) && gameplayJs.includes('FORGE_STAT_LABELS'));
check('Character Forge is data-driven', ["databaseEntries('race')", "databaseEntries('class')", "entriesForSelect('skill'", "entriesForSelect('origin'", "databaseEntries('item')"].every(token => gameplayJs.includes(token)));
check('Character Forge stores final schema', ['family_tree','backstory','characterSchema','created','updated','appearance','origin','characteristics','equipment'].every(token => gameplayJs.includes(token)));
check('Gameplay systems do not inject extra sidebar shortcuts', !gameplayJs.includes('data-phase3-sidebar') && !gameplayJs.includes('data-phase3-side="characterCreator"'));
check('Phase 4 world script is loaded', jsFiles.includes('js/asteria-world-systems.js'));
check('Phase 4 exposes world API', worldJs.includes('window.AsteriaWorld') && worldJs.includes('openWorldState') && worldJs.includes('openWorldMap'));
check('Phase 4 uses universal compendium data', worldJs.includes('AsteriaUniversalCompendium') && worldJs.includes("databaseEntries('location')") && worldJs.includes("databaseEntries('faction')"));
check('Phase 4 tracks campaign world persistence', worldJs.includes('campaigns:{}') && worldJs.includes('persistence:{') && worldJs.includes('worldChanges'));
check('Phase 4 supports GM visibility controls', worldJs.includes('playerSafeMode') && worldJs.includes('gm-only') && worldJs.includes('isGMMode'));
check('World systems do not inject extra sidebar shortcuts', !worldJs.includes('data-phase4-sidebar') && !worldJs.includes('phase4-sidebar-group'));
check('Home view has no account option panel', !/Account Options|test-logins|offline-logins/i.test(homeHtml));
check('Top-right account buttons remain', html.includes('id="loginToggle"') && html.includes('id="createAccountTop"'));
check('Home guard loads before app scripts', jsFiles.includes('js/asteria-home-guard.js') && jsFiles.indexOf('js/asteria-home-guard.js') < jsFiles.indexOf('js/app.js'));
check('Home button uses early hard-home action', html.includes('id="sidebarHomeButton"') && html.includes('onclick="return window.asteriaHardHome(event)"') && homeGuardJs.includes("document.addEventListener('click', handleHomeEvent, true)"));
check('Home button uses shell home action', html.includes('data-home-action="true"') && coreShellJs.includes('window.goHome') && coreShellJs.includes('clearRouteState'));
check('Home action clears workspace shells', coreShellJs.includes('asteria-workspace-shell') && coreShellJs.includes('workspace-active') && coreShellJs.includes('stopImmediatePropagation') && coreShellJs.includes('shellHomeCaptureBound'));
check('Legacy setView home route is wrapped', coreShellJs.includes('wrapSetViewHomeRoute') && coreShellJs.includes('__asteriaHomeWrapped') && coreShellJs.includes("if(id === 'home') return goHome()") && appJs.includes("if(id === 'home' && window.AsteriaRouter?.home"));
check('Final home fallback is loaded last', jsFiles.includes('js/asteria-home-fix.js') && jsFiles.indexOf('js/asteria-home-fix.js') > jsFiles.indexOf('js/asteria-core-shell.js') && html.includes('id="sidebarHomeButton"'));
check('Final home fallback owns visible home button', homeFixJs.includes('window.asteriaHardHome') && homeFixJs.includes('sidebarHomeButton') && homeFixJs.includes('__asteriaFinalHomeWrapped'));
check('Old dark/light controls removed', !html.includes('Dark Mode') && !html.includes('Light Mode') && !appJs.includes('setThemeMode'));
check('Old dark/light CSS modes removed', !stylesCss.includes('body[data-theme'));
check('Old fixed accent controls removed', !html.includes("setAccent('blue')") && !html.includes('class="colour-grid"'));
check('Old fixed accent system removed', !appJs.includes('function setAccent') && !stylesCss.includes('body[data-accent') && !stylesCss.includes('.colour-grid'));
check('Theme controls include required sliders', html.includes('asteriaThemeSelect') && html.includes('asteriaColourWheel') && html.includes('asteriaGlowSlider') && html.includes('asteriaOverlaySlider') && html.includes('asteriaPanelOpacitySlider'));
check('Home reset clears workspace shells', coreShellJs.includes('asteria-workspace-shell') && coreShellJs.includes('workspace-active') && coreShellJs.includes('showPublicHome'));
check('Top panel uses transparent black blur', themeCss.includes('background:rgba(0,0,0,.58)') && themeCss.includes('blur(4px)'));
check('Theme engine updates required variables', ['--asteria-accent','--asteria-glow','--asteria-overlay-opacity'].every(token => themeSystemJs.includes(token)));
check('Theme engine updates panel opacity', themeSystemJs.includes('asteriaPanelOpacitySlider') && themeSystemJs.includes('--panel-bg'));
check('Theme engine clears legacy theme state', themeSystemJs.includes('removeAttribute("data-accent")') && themeSystemJs.includes('removeItem("asteria-accent")'));
check('Background linework uses theme colour', themeCss.includes('color:var(--asteria-accent)') && themeCss.includes('mask:url("../assets/themes/asteria-spell-d20-overlay.svg")'));
const inventoryApiJs = fs.readFileSync(path.join(root, 'js/asteria-inventory-api.js'), 'utf8');
check('Inventory API exposes AsteriaInventory', inventoryApiJs.includes('window.AsteriaInventory'));
check('Inventory API wraps existing inventory render path', inventoryApiJs.includes('window.renderInventory'));
check('Shell exposes router API', fs.readFileSync(path.join(root, 'js/asteria-core-shell.js'), 'utf8').includes('window.AsteriaRouter'));
check('Shell exposes account API', fs.readFileSync(path.join(root, 'js/asteria-core-shell.js'), 'utf8').includes('window.AsteriaAccounts'));

const cleanCompendiumIndex = JSON.parse(fs.readFileSync(path.join(root, 'data/compendium-index-clean.json'), 'utf8'));
const raceEntry = cleanCompendiumIndex.entries.find(entry => entry.section === 'Races' && entry.title === 'Undien');
check('Unified workspace compendium index exists', cleanCompendiumIndex.version === 'asteria-unified-workspace-compendium-system-v1' && cleanCompendiumIndex.entries.length >= 5);
check('Workspace exposes shared APIs', cleanCompendiumJs.includes('window.openCompendiumSection') && cleanCompendiumJs.includes('window.openCompendiumPath') && cleanCompendiumJs.includes('window.AsteriaWorkspace'));
check('Workspace routes compendium sections through one renderer', ['Asteria Handbook','World, Realms & Planes','Races','Classes','Items','Magic','Creatures','Factions'].every(section => cleanCompendiumJs.includes(section)));
check('Race navigation removes old playable folders', !html.includes("Races/Playable Races") && !html.includes("Races/Non-Playable Races") && !cleanCompendiumJs.includes('Playable Races') && !cleanCompendiumJs.includes('Non-Playable Races'));
check('Race navigation uses lore/type categories', ['Beastkin','Celestial','Demonic','Dragon','Fae','Humanoid','Hybrid','Spirit Races','Undead','Demi-Races'].every(label => cleanCompendiumJs.includes(label)));
check('Race playable status is metadata', Boolean(raceEntry) && raceEntry.playable === true && raceEntry.availability === 'playable' && raceEntry.raceCategory === 'Humanoid' && raceEntry.size === 'Medium');
check('Race cards use playable status bubble', cleanCompendiumJs.includes('PLAYABLE') && cleanCompendiumJs.includes('NON-PLAYABLE') && cleanCompendiumCss.includes('.clean-race-status'));
check('Item rarity system remains in clean compendium', cleanCompendiumJs.includes('clean-rarity-tag') && cleanCompendiumCss.includes('.clean-rarity-common') && cleanCompendiumIndex.entries.some(entry => entry.section === 'Items' && entry.rarity === 'Common'));
check('Workspace layout uses standard panels', cleanCompendiumCss.includes('.workspace-header') && cleanCompendiumCss.includes('.workspace-category-panel') && cleanCompendiumCss.includes('.workspace-filter-area') && cleanCompendiumCss.includes('.workspace-tabs') && cleanCompendiumCss.includes('.workspace-display-window'));
check('Category panel uses click-through navigation, not dropdown folders', cleanCompendiumJs.includes('clean-drilldown-cat') && !cleanCompendiumJs.includes("document.createElement('details')"));
check('Top tab menu is section-specific', cleanCompendiumJs.includes('workspaceTabs') && cleanCompendiumJs.includes('Race Sheet') && cleanCompendiumJs.includes('Talent Tree') && cleanCompendiumJs.includes('Crafting'));
check('Workspace maps generated collections into item categories', cleanCompendiumJs.includes('itemPlacement') && cleanCompendiumJs.includes('loadFromWikiIndexes') && cleanCompendiumJs.includes('Resources & Materials') && cleanCompendiumJs.includes('Metal Ores') && cleanCompendiumJs.includes('Metal Ingots'));
check('Compendium page viewer supports wiki item images', cleanCompendiumJs.includes('imagePath') && cleanCompendiumCss.includes('.clean-page-image'));
check('Clean compendium generator exists', fs.existsSync(path.join(root, 'scripts/generate-clean-compendium-index.js')));
check('Old public hub pages removed', ['handbookHub','worldHub','racesHub','classesHub','itemsHub','magicHub'].every(id => !ids.includes(id)));
check('Old handbook library viewer removed', !ids.includes('library') && !ids.includes('rulePage') && !html.includes('ruleCards') && !html.includes('ruleContent'));
check('Public sidebar targets workspace sections', ['Asteria Handbook','World, Realms & Planes','Races','Classes','Items','Magic'].every(section => html.includes(`data-workspace-section="${section}"`)));
check('Auth dashboard version is active', html.includes('ASTERIA AUTH + WORKSPACE DASHBOARD SYSTEM v1'));
check('Login page has one account type only', !html.includes('loginPageRole') && !html.includes('GM Account') && !html.includes('Administrator</option>'));
check('Logged-in sidebar uses workspace dashboard actions', ['data-workspace-mode="dashboard"', 'data-workspace-mode="campaigns"', 'data-workspace-mode="characters"', 'data-workspace-action="create-campaign"', 'data-workspace-action="create-character"', 'data-workspace-action="settings"'].every(token => html.includes(token)));
check('Logged-in sidebar restores in-game dashboards', ['data-app-route="player-dashboard"', 'data-app-route="campaign-manager"', 'data-app-route="gm-dashboard"'].every(token => html.includes(token)) && ['openPlayerDashboard', 'openCampaignManager', 'openGMDashboard'].every(token => coreShellJs.includes(token)));
check('GM dashboard render tolerates missing top counters', appJs.includes('setTextSafe') && appJs.includes("setTextSafe('topPlayers'") && !appJs.includes("$('topPlayers').textContent=c.party.length;$('topEncounters')"));
check('GM dashboard uses simplified six-tab menu', gmDashboardBlock.includes('Asteria GM Dashboard v1') && ['GM Main','Quests','GM Notes','Economy','Crafting','Campaign Manager'].every(label => gmDashboardBlock.includes(`label:'${label}'`)) && ['Actions','Encounter Builder','Rewards','Materials','Enchantments'].every(label => !gmDashboardBlock.includes(`label:'${label}'`)));
check('GM dashboard keeps one sync panel', appJs.includes('gmSyncStatusPanel') && appJs.includes("v170RenderSyncPanel=function(){document.getElementById('v170SyncPanel')?.remove();renderGMSyncPanel();}") && stylesCss.includes('.gm-sync-card'));
check('GM top panel keeps session actions only', gmDashboardBlock.includes('Start Session</button><button class="danger" onclick="endSession()">End Session') && stylesCss.includes('#gm .gm-dashboard-hero-v1 .gm-sync-card'));
check('GM menu bottom actions are removed', gmDashboardBlock.includes("document.querySelector('#gm .gm-menu-bar-actions')?.remove();") && stylesCss.includes('#gm .gm-menu-bar-actions{display:none!important}'));
check('GM main tab owns new encounter workspace and rewards', gmDashboardBlock.includes("assign('#gmCampaignCharacterPanel,#gmEncounterWorkspace,#gm .gm-xp-split,#gm .transaction-pipeline-panel,#gm #partyLootManagerPanel','gm-main')") && appJs.includes('Asteria GM Encounter Workspace v1'));
check('GM old split encounter panels are hidden', gmDashboardBlock.includes("assign('#gm .active-encounter,#gm .initiative,#gm .encounter,#gm .combat-system-panel','gm-hidden')"));
check('GM encounter workspace supports requested controls', ['gmEncounterWorkspace','gmCampaignCharacterPanel','gmEnemySearchResults','gmDefeatEnemy','openGMEnemyDetail','gmAddCreatureToEncounter','gmSortEncounterInitiative'].every(token => appJs.includes(token)) && stylesCss.includes('.gm-encounter-workspace') && stylesCss.includes('.gm-enemy-card.defeated'));
check('GM legacy systems map into requested tabs', ['actions:\'gm-main\'','encounter:\'gm-main\'','rewards:\'gm-main\'','materials:\'crafting\'','enchantments:\'crafting\'','tools:\'campaign-manager\''].every(token => gmDashboardBlock.includes(token)));
check('Player dashboard keeps summary and campaign panels', html.includes('player-summary-panel') && html.includes('campaign-session-panel') && html.includes('player-menu-panel'));
check('Player dashboard hides visible summary heading', html.includes('<h3 class="visually-hidden">Player Summary</h3>') && stylesCss.includes('.visually-hidden'));
check('Player dashboard tabs use requested order and icons', ['Dashboard','Character','Class/Talent Tree','Skills','Spells','Inventory','Quest','Journal','Party'].every(label => html.includes(label)) && html.includes('class="tab-icon"') && ['data-tab="skillsPane"', 'data-tab="partyPane"'].every(token => html.includes(token)));
check('Player dashboard has new Character, Skills, Spells, and Party docks', ['characterTraitsDock','skillsTabDock','spellsTabDock','partyLootDock'].every(token => html.includes(token)));
check('Player dashboard relocates panels through existing renderer', appJs.includes('normalizePlayerDashboardLayout') && appJs.includes("movePlayerPanel('.racial-traits-panel','#characterTraitsDock')") && appJs.includes("movePlayerPanel('.skills-panel','#overview .player-dashboard-grid')") && appJs.includes("movePlayerPanel('.spell-panel-v1722','#overview .player-dashboard-grid')") && appJs.includes("movePlayerPanel('#playerPartyLootPanel','#partyLootDock')"));
check('Player dashboard talent summary uses unlocked ranked cards', progressionUiJs.includes('renderUnlockedTalentSummary') && progressionUiJs.includes('unlocked-talent-card') && stylesCss.includes('.unlocked-talent-list') && stylesCss.includes('.talent-card-image'));
check('Player dashboard equipment uses all weapon slots', stylesCss.includes('.weapon-card.weapon-card-v1722') && stylesCss.includes('weapon-slot-quiver') && ['Main Weapon','Secondary Weapon','Off Weapon','Quiver','Shield'].every(label => appJs.includes(`label:'${label}'`)));
check('Player dashboard uses requested panel order', html.includes('Quick Action') && html.includes('Action / Resource Log') && stylesCss.includes('grid-template-areas:"talents talents weapons armor"') && stylesCss.includes('"spells spells quick conditions"') && stylesCss.includes('"spells spells . quickaction"') && stylesCss.includes('"skills skills coin coin"') && stylesCss.includes('"log log log log"'));
check('Player dashboard quick action is recovery only', html.includes('playerRecoveryAction') && html.includes('Short Rest') && html.includes('Long Rest') && html.includes('Recovery') && !html.includes("openManualCheckPrompt('Weapon Attack')") && appJs.includes('v1722RemoveDashboardActionClutter'));
check('Player dashboard skills use ranked cards', appJs.includes('renderDashboardSkills') && appJs.includes('ASTERIA_SKILL_RANK_NAMES') && stylesCss.includes('.dashboard-skill-card'));
check('Player coin pouch shows all currencies without internal scroll', stylesCss.includes('Coin pouch compact fit') && stylesCss.includes('.coin-panel-rows{display:grid!important;gap:5px!important;overflow:visible!important') && ['Copper','Silver','Gold','Platinum Crown','Royal Crown','Royal Platinum'].every(label => appJs.includes(`label:'${label}'`)));
check('Character snapshot panel is removed from player dashboard', snapshotJs.includes("document.getElementById('snapshotStatusPanelV11')?.remove();") && snapshotJs.includes('return;'));
check('Player dashboard does not install crafting/material/economy panels', ['function installPlayerCraftingPanel(){return;}', 'function installPlayerMaterials(){return;}', 'function installPlayerEconomy(){return;}'].every(token => appJs.includes(token)));
check('Player dashboard does not install player enchantment builder', appJs.includes('function installPlayerEnchantPanel(){return;}') && appJs.includes("document.getElementById('gmEnchantPanel')?.scrollIntoView"));
check('Material and economy panels no longer fall back into player overview', appJs.includes("function renderMaterialCompendium(){const host=document.querySelector('#library .rule-content, #library .content-panel, #library');") && appJs.includes("function installShopMaterialPanels(){const lib=document.querySelector('#library .content-panel, #library .rule-content, #library');") && !appJs.includes("function renderMaterialCompendium(){const host=document.querySelector('#library .rule-content, #library .content-panel, #library')||document.querySelector('#player')") && !appJs.includes("function installShopMaterialPanels(){const lib=document.querySelector('#library .content-panel, #library .rule-content, #library')||document.querySelector('#overview')"));
check('Fake visible login controls removed', !firebaseAuthJs.includes('Offline test logins') && !firebaseAuthJs.includes("quickLogin('") && !html.includes('test-logins'));
check('Single account-style test login exists', html.includes('asteriaTestLogin()') && firebaseAuthJs.includes('testLoginBtn') && authBridgeJs.includes('window.asteriaTestLogin') && authBridgeJs.includes('asteria-test-account'));
check('Core shell login routes to Firebase only', !coreShellJs.includes('function localLogin') && coreShellJs.includes('firebaseLoginFromPage'));
check('Auth bridge opens workspace dashboard', authBridgeJs.includes('openDashboard') && authBridgeJs.includes('Campaign permissions are assigned per campaign'));
check('Workspace exposes auth dashboard APIs', cleanCompendiumJs.includes('openDashboard') && cleanCompendiumJs.includes('createWorkspaceCampaign') && cleanCompendiumJs.includes('createWorkspaceCharacter'));
check('Workspace campaign creation stores GM permissions', cleanCompendiumJs.includes('gmId:uid') && cleanCompendiumJs.includes("roles:{ [uid]:'gm' }") && cleanCompendiumJs.includes('gmUids:[uid]') && cleanCompendiumJs.includes('inviteLink'));
check('Workspace campaign structure supports future systems', ['players:{', 'characters:{}', 'chat:{ messages:[] }', 'guildBank:{', 'settings:{'].every(token => cleanCompendiumJs.includes(token)));
check('Workspace character linking exists', cleanCompendiumJs.includes('linkCharacterToCampaign') && cleanCompendiumJs.includes('playerCharacterLinks') && cleanCompendiumJs.includes('campaign.characters[characterId]'));
check('Dashboard includes required logged-in panels', ['Current Campaigns', 'Available Characters', 'Notifications', 'Active Party'].every(token => cleanCompendiumJs.includes(token)));
check('Data sync uses auth dashboard version', dataSyncJs.includes('asteria-auth-workspace-dashboard-system-v1'));
check('Firebase setup instructions exist', fs.existsSync(path.join(root, 'FIREBASE-SETUP.md')));

const floraReadme = path.join(root, 'content/flora/README.md');
const floraRose = path.join(root, 'content/flora/1-common/flowers/rose/index.md');
const floraImage = path.join(root, 'content/flora/1-common/flowers/rose/rose.png');
const mineralsReadme = path.join(root, 'content/minerals/README.md');
const mineralsIronOre = path.join(root, 'content/minerals/1-common/ores/iron-ore/index.md');
const mineralsImage = path.join(root, 'content/minerals/1-common/ores/iron-ore/Iron Ore.png');
const materialsReadme = path.join(root, 'content/materials/README.md');
const materialsIronIngot = path.join(root, 'content/materials/1-common/metals/iron-ingot/index.md');
const materialsImage = path.join(root, 'content/materials/1-common/metals/iron-ingot/Iron Ingot.png');
const wikiIndexJs = fs.readFileSync(path.join(root, 'js/wiki-index.js'), 'utf8');
const floraIndexJs = fs.readFileSync(path.join(root, 'js/flora-index.js'), 'utf8');
const localServerJs = fs.readFileSync(path.join(root, 'scripts/local-static-server.js'), 'utf8');
const floraRarities = ['1-common','2-uncommon','3-unusual','4-rare','5-epic','6-mythic','7-legendary','8-relic'];
const floraCategories = ['flowers','herbs','grasses','vines','aquatic','fungi','shrubs','trees','mosses'];
const mineralCategories = ['ores','crystals','gems','stones','clays','salts','metals','fossils','arcane'];
const materialCategories = ['metals','woods','fibres','leathers','stones','glass','ceramics','alloys','reagents'];
check('Flora README exists', fs.existsSync(floraReadme));
check('Flora sample Rose page exists', fs.existsSync(floraRose));
check('Flora sample image exists', fs.existsSync(floraImage));
check('Flora rarity/category scaffold exists', floraRarities.every(rarity => floraCategories.every(category => fs.existsSync(path.join(root, 'content/flora', rarity, category, '_index.md')))));
check('Minerals README exists', fs.existsSync(mineralsReadme));
check('Minerals sample Iron Ore page exists', fs.existsSync(mineralsIronOre));
check('Minerals sample image exists', fs.existsSync(mineralsImage));
check('Minerals rarity/category scaffold exists', floraRarities.every(rarity => mineralCategories.every(category => fs.existsSync(path.join(root, 'content/minerals', rarity, category, '_index.md')))));
check('Materials README exists', fs.existsSync(materialsReadme));
check('Materials sample Iron Ingot page exists', fs.existsSync(materialsIronIngot));
check('Materials sample image exists', fs.existsSync(materialsImage));
check('Materials rarity/category scaffold exists', floraRarities.every(rarity => materialCategories.every(category => fs.existsSync(path.join(root, 'content/materials', rarity, category, '_index.md')))));
check('Shared wiki documentation exists', fs.existsSync(path.join(root, 'content/WIKI-ENGINE.md')));
check('Shared wiki generator exists', fs.existsSync(path.join(root, 'scripts/generate-wiki-index.js')) && fs.existsSync(path.join(root, 'scripts/wiki-engine-config.js')));
check('Flora index generator exists', fs.existsSync(path.join(root, 'scripts/generate-flora-index.js')));
check('Combined wiki index exposes collections', wikiIndexJs.includes('window.ASTERIA_WIKI_INDEXES') && wikiIndexJs.includes('"flora"') && wikiIndexJs.includes('"minerals"') && wikiIndexJs.includes('"materials"') && wikiIndexJs.includes('/flora/common/flowers/rose') && wikiIndexJs.includes('/minerals/common/ores/iron-ore') && wikiIndexJs.includes('/materials/common/metals/iron-ingot'));
check('Flora generated index exposes global', floraIndexJs.includes('window.ASTERIA_FLORA_INDEX') && floraIndexJs.includes('/flora/common/flowers/rose'));
check('Minerals generated index exposes global through shared index', wikiIndexJs.includes('window.ASTERIA_MINERALS_INDEX') && wikiIndexJs.includes('Iron Ore'));
check('Materials generated index exposes global through shared index', wikiIndexJs.includes('window.ASTERIA_MATERIALS_INDEX') && wikiIndexJs.includes('Iron Ingot'));
check('Legacy loose ore and ingot content files are removed', !fs.existsSync(path.join(root, 'content/Items/Resources & Materials/Metal Ores/Iron Ore.md')) && !fs.existsSync(path.join(root, 'content/Items/Resources & Materials/Metal Ingots/Iron Ingot.md')));
check('Legacy loose ore and ingot manifest entries are excluded', !/Items\/Resources & Materials\/(?:Ores|Ingots|Metal Ores|Metal Ingots)\//.test(contentManifestJs));
check('Collection overview indexes do not become item cards', !contentManifestJs.includes('minerals/index.md') && !contentManifestJs.includes('materials/index.md') && !contentManifestJs.includes('flora/index.md') && !JSON.stringify(cleanCompendiumIndex).includes('Minerals Index') && !JSON.stringify(cleanCompendiumIndex).includes('Materials Index'));
check('Clean item index excludes legacy loose ore and ingot sources', !JSON.stringify(cleanCompendiumIndex).includes('content/Items/Resources & Materials/Metal Ores/') && !JSON.stringify(cleanCompendiumIndex).includes('content/Items/Resources & Materials/Metal Ingots/'));
check('Structured ore and ingot cards use canonical image paths', wikiIndexJs.includes('content/minerals/2-uncommon/ores/antimony-ore/Antimony Ore.png') && wikiIndexJs.includes('content/materials/2-uncommon/metals/antimony-ingot/Antimony Ingot.png') && wikiIndexJs.includes('content/minerals/1-common/ores/iron-ore/Iron Ore.png') && wikiIndexJs.includes('content/materials/1-common/metals/iron-ingot/Iron Ingot.png'));
check('Item workspace tabs are hidden for item index', cleanCompendiumJs.includes('Items: []') && cleanCompendiumCss.includes('.workspace-tabs.is-empty'));
check('Item cards use compact item-only grid', cleanCompendiumJs.includes('clean-item-grid') && cleanCompendiumCss.includes('.clean-grid.clean-item-grid') && cleanCompendiumCss.includes('minmax(170px, 198px)'));
check('Old standalone wiki renderer is not loaded', !jsFiles.includes('js/asteria-wiki.js') && !html.includes('id="floraWiki"') && !html.includes('floraWikiMount'));
check('Old wiki relationship styles are removed from global CSS', !stylesCss.includes('.wiki-relation-link') && !stylesCss.includes('.wiki-relationship-panel'));
check('Unified compendium exposes relationship links', cleanCompendiumJs.includes('resolveReference') && cleanCompendiumJs.includes('relationshipPanel') && cleanCompendiumCss.includes('.clean-relationship-panel') && cleanCompendiumCss.includes('.clean-relation-link'));
check('Unified compendium page viewer renders metadata', cleanCompendiumJs.includes('pageMetadata') && cleanCompendiumCss.includes('.clean-page-meta'));
check('Unified cards support selection and double-click open', cleanCompendiumJs.includes('element.onclick') && cleanCompendiumJs.includes('element.ondblclick'));
check('Universal viewer supports tabbed note sections', cleanCompendiumJs.includes('contentForWorkspaceTab') && cleanCompendiumJs.includes('workspace-note-tab-label') && cleanCompendiumJs.includes('data-viewer="universal-workspace-viewer"'));
check('Unified compendium supports collection app routes', cleanCompendiumJs.includes('openRouteFromLocation') && cleanCompendiumJs.includes('entryForRoute') && cleanCompendiumJs.includes('hashchange'));
check('Generated collection paths use normal item categories', !cleanCompendiumJs.includes('Items/Content Collections/') && !cleanCompendiumJs.includes('Items/Wiki Collections/') && cleanCompendiumJs.includes('Items/Resources & Materials/Metal/Metal Ores'));
check('Local static server supports compendium app routes', localServerJs.includes('compendiumAppRoutes') && localServerJs.includes('flora') && localServerJs.includes('materials') && localServerJs.includes('artifacts') && localServerJs.includes('sendIndex'));

const progressionContext = {
  window: {
    chars: {
      test: { name: 'Test Character', level: 0, xp: 5500, cp: 0, tp: 0 }
    },
    addCombatLog(){},
    feedback(){},
    showLevelModal(){},
    toast(){}
  }
};
vm.createContext(progressionContext);
vm.runInContext(progressionJs, progressionContext);
const progression = progressionContext.window.AsteriaProgression;
const levelResult = progression.checkLevelUp('test');
check('Progression module calculates level 0 XP cap', progression.xpToNextLevel(0) === 5000);
check('Progression module applies level rewards', progressionContext.window.chars.test.level === 1 && progressionContext.window.chars.test.cp === 3 && progressionContext.window.chars.test.tp === 3);
check('Progression module preserves carryover XP', progressionContext.window.chars.test.xp === 500);
check('Progression module keeps skill-choice rewards disabled', levelResult.skillChoice === false);

jsFiles.forEach(file => {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  check(`Syntax OK: ${file}`, result.status === 0, (result.stderr || result.stdout || '').trim());
});

[
  'scripts/generate-wiki-index.js',
  'scripts/generate-flora-index.js',
  'scripts/generate-clean-compendium-index.js',
  'scripts/generate-content-manifest.js',
  'scripts/generate-universal-compendium-index.js',
  'scripts/wiki-engine-config.js',
  'scripts/local-static-server.js'
].forEach(file => {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  check(`Syntax OK: ${file}`, result.status === 0, (result.stderr || result.stdout || '').trim());
});

const scriptOrder = jsFiles.join(' > ');
check(
  'Script order keeps manifest before app',
  jsFiles.indexOf('js/content-manifest.js') >= 0 &&
    jsFiles.indexOf('js/app.js') > jsFiles.indexOf('js/content-manifest.js'),
  scriptOrder
);
check(
  'Script order keeps generated content index before unified compendium',
  jsFiles.indexOf('js/wiki-index.js') > jsFiles.indexOf('js/content-manifest.js') &&
    jsFiles.indexOf('js/clean-compendium.js') > jsFiles.indexOf('js/wiki-index.js'),
  scriptOrder
);
check(
  'Script order keeps unified compendium after app',
  jsFiles.indexOf('js/clean-compendium.js') > jsFiles.indexOf('js/app.js'),
  scriptOrder
);
check(
  'Script order keeps state between manifest and app',
  jsFiles.indexOf('js/content-manifest.js') >= 0 &&
    jsFiles.indexOf('js/asteria-state.js') > jsFiles.indexOf('js/content-manifest.js') &&
    jsFiles.indexOf('js/app.js') > jsFiles.indexOf('js/asteria-state.js'),
  scriptOrder
);
check(
  'Script order keeps view hooks before app',
  jsFiles.indexOf('js/asteria-view-hooks.js') > jsFiles.indexOf('js/asteria-state.js') &&
    jsFiles.indexOf('js/app.js') > jsFiles.indexOf('js/asteria-view-hooks.js'),
  scriptOrder
);
check(
  'Script order keeps progression before app',
  jsFiles.indexOf('js/asteria-progression.js') > jsFiles.indexOf('js/asteria-view-hooks.js') &&
    jsFiles.indexOf('js/app.js') > jsFiles.indexOf('js/asteria-progression.js'),
  scriptOrder
);
check(
  'Script order keeps progression UI before app',
  jsFiles.indexOf('js/asteria-progression-ui.js') > jsFiles.indexOf('js/asteria-progression.js') &&
    jsFiles.indexOf('js/app.js') > jsFiles.indexOf('js/asteria-progression-ui.js'),
  scriptOrder
);
check(
  'Script order keeps inventory API after app',
  jsFiles.indexOf('js/asteria-inventory-api.js') > jsFiles.indexOf('js/app.js'),
  scriptOrder
);
check(
  'Shell helper loads after compendium cleanup',
  jsFiles.indexOf('js/asteria-core-shell.js') > jsFiles.indexOf('js/clean-compendium.js'),
  scriptOrder
);

const failures = results.filter(result => !result.ok);
results.forEach(result => {
  const icon = result.ok ? 'PASS' : 'FAIL';
  console.log(`${icon} ${result.name}${result.detail ? ` - ${result.detail}` : ''}`);
});

console.log(`\nSmoke test: ${results.length - failures.length}/${results.length} passed`);
if (failures.length) process.exit(1);
