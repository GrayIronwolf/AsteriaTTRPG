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

const assetPath = value => String(value || '').split('?')[0];
const cssFiles = matches(/<link[^>]+href="([^"]+)"/g).map(assetPath);
const jsFiles = matches(/<script[^>]+src="([^"]+)"/g).map(assetPath);

cssFiles.forEach(file => {
  check(`CSS exists: ${file}`, fs.existsSync(path.join(root, file)));
});

jsFiles.forEach(file => {
  check(`JS exists: ${file}`, fs.existsSync(path.join(root, file)));
});

[
  'data/compendium.js',
  'js/compendium-registry.js',
  'js/asteria-home-guard.js',
  'js/asteria-state.js',
  'js/asteria-view-hooks.js',
  'js/asteria-progression.js',
  'js/asteria-progression-ui.js',
  'js/asteria-magic-data.js',
  'js/app.js',
  'js/asteria-inventory-api.js',
  'js/asteria-inventory-workflows.js',
  'js/asteria-item-ecosystem.js',
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
  'reactDashboard',
  'quests',
  'creature',
  'devLog'
].forEach(id => {
  check(`Required view exists: ${id}`, ids.includes(id));
});

check('React migration entry is loaded', jsFiles.includes('src/dev-entry.js'));
check('React production CSS is loaded', cssFiles.includes('react-dist/asteria-react.css'));
check('Modern responsive UI CSS is loaded', cssFiles.includes('css/asteria-modern-ui.css'));
check('Canonical design token CSS is loaded first', cssFiles.includes('css/asteria-design-tokens.css') && cssFiles.indexOf('css/asteria-design-tokens.css') < cssFiles.indexOf('css/styles.css') && cssFiles.indexOf('css/asteria-design-tokens.css') < cssFiles.indexOf('css/asteria-modern-ui.css'));
check('React production bundle exists', fs.existsSync(path.join(root, 'react-dist/asteria-react.js')));
check('React source keeps static dashboard fallbacks', html.includes('id="player"') && html.includes('id="gm"') && html.includes('id="reactDashboard"'));
check('React migration architecture contract exists', fs.existsSync(path.join(root, 'UI_REACT_MIGRATION.md')) && fs.existsSync(path.join(root, 'STEPS_1_3_DELIVERY.md')));
check('Canonical React architecture modules exist', ['src/app/AsteriaAppContext.jsx','src/app/asteriaRoutes.mjs','src/app/legacyBridge.js','src/types/asteriaContracts.mjs','src/state/liveSyncState.mjs'].every(file => fs.existsSync(path.join(root, file))));

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
['index.html', 'js/compendium-registry.js', 'js/asteria-state.js', 'js/asteria-view-hooks.js', 'js/asteria-progression.js', 'js/asteria-progression-ui.js', 'js/asteria-magic-data.js', 'js/app.js', 'js/asteria-inventory-api.js', 'js/asteria-inventory-workflows.js', 'js/clean-compendium.js'].forEach(file => {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  check(`No mojibake markers: ${file}`, !mojibakePattern.test(text));
});

const appJs = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const coreShellJs = fs.readFileSync(path.join(root, 'js/asteria-core-shell.js'), 'utf8');
const cleanCompendiumJs = fs.readFileSync(path.join(root, 'js/clean-compendium.js'), 'utf8');
const firebaseAuthJs = fs.readFileSync(path.join(root, 'js/firebase-auth.js'), 'utf8');
const firestoreRulesPath = path.join(root, 'firestore.rules');
const firestoreRules = fs.existsSync(firestoreRulesPath) ? fs.readFileSync(firestoreRulesPath, 'utf8') : '';
const authBridgeJs = fs.readFileSync(path.join(root, 'js/auth-bridge.js'), 'utf8');
const dataSyncJs = fs.readFileSync(path.join(root, 'js/data-sync.js'), 'utf8');
const magicDataJs = fs.readFileSync(path.join(root, 'js/asteria-magic-data.js'), 'utf8');
const gameplayJs = fs.readFileSync(path.join(root, 'js/asteria-gameplay-systems.js'), 'utf8');
const inventoryWorkflowJs = fs.readFileSync(path.join(root, 'js/asteria-inventory-workflows.js'), 'utf8');
const inventoryWorkflowCss = fs.readFileSync(path.join(root, 'css/asteria-inventory-workflows.css'), 'utf8');
const itemEcosystemJs = fs.readFileSync(path.join(root, 'js/asteria-item-ecosystem.js'), 'utf8');
const itemEcosystemCss = fs.readFileSync(path.join(root, 'css/asteria-item-ecosystem.css'), 'utf8');
const worldJs = fs.readFileSync(path.join(root, 'js/asteria-world-systems.js'), 'utf8');
const homeGuardJs = fs.readFileSync(path.join(root, 'js/asteria-home-guard.js'), 'utf8');
const themeSystemJs = fs.readFileSync(path.join(root, 'js/asteria-ui-theme-system.js'), 'utf8');
const themeCss = fs.readFileSync(path.join(root, 'css/asteria-ui-theme-system.css'), 'utf8');
const stylesCss = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
const cleanCompendiumCss = fs.readFileSync(path.join(root, 'css/clean-compendium.css'), 'utf8');
const modernUiCss = fs.readFileSync(path.join(root, 'css/asteria-modern-ui.css'), 'utf8');
const homeHtml = html.slice(html.indexOf('<section id="home"'), html.indexOf('<section id="loginPage"'));
const gmDashboardBlock = appJs.slice(appJs.indexOf('Asteria GM Dashboard v1'), appJs.indexOf('/* v1.7.3.2 Public Website Layout Helpers */'));
const universalCompendiumIndex = require('../data/compendium.js');
const registrySource = fs.readFileSync(path.join(root,'js/compendium-registry.js'),'utf8');
const viewerSource = fs.readFileSync(path.join(root,'js/universal-compendium-engine.js'),'utf8');
const registryContext = {window:{ASTERIA_UNIVERSAL_COMPENDIUM_INDEX:structuredClone(universalCompendiumIndex)}};
vm.runInNewContext(registrySource,registryContext);
const content = registryContext.window.AsteriaContent;
const skillEntries = universalCompendiumIndex.entries.filter(entry => entry.domain === 'skill');
const skillTitles = skillEntries.map(entry => String(entry.title || '').toLowerCase());
const duplicateSkillTitles = skillTitles.filter((title, index) => skillTitles.indexOf(title) !== index);
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
check('Character Forge uses conditional Patron flow with Affinity Rolls', ["'Race'","'Class'","'Patron'","'Appearance'","'Origin'","'Characteristics'","'Magic'","'Skills'","'Affinity Rolls'","'Equipment'","'Review'"].every(token => gameplayJs.includes(token)) && gameplayJs.includes('forgeTabsForDraft') && gameplayJs.includes('MAGIC_TYPE_GROUPS') && gameplayJs.includes('AFFINITY_RANKS') && !gameplayJs.includes("'Save Character'\\n  ];"));
check('Shared magic data loads before dashboard and forge scripts', jsFiles.includes('js/asteria-magic-data.js') && jsFiles.indexOf('js/asteria-magic-data.js') < jsFiles.indexOf('js/app.js') && jsFiles.indexOf('js/asteria-magic-data.js') < jsFiles.indexOf('js/asteria-gameplay-systems.js'));
check('Shared magic data includes requested element groups', ['Air Magic','Earth Magic','Water Magic','Fire Magic','Life Magic','Death Magic','Light Magic','Dark Magic','Celestial Magic','Infernal Magic','Blood Magic','Chaos Magic','Eldritch Magic','Fae Magic','Fate Magic','Space Magic','Spirit Magic','Time Magic','Abyssal Magic'].every(name => magicDataJs.includes(name)) && magicDataJs.includes('Basic Elements') && magicDataJs.includes('Higher Elements'));
check('Shared magic data matches Laws of Magic colour labels', ['Pale Blue','Green','Red','Blue','Yellow','Purple','White','Black','Luminous Gold','Crimson Red','Deep Red','Ashen Grey','Dark Emerald','Rose Pink','Wine Red','Midnight Blue','Silver White','Bronze Gold','Obsidian Blue'].every(name => magicDataJs.includes(name)) && ['#9fdcff','#2f8b4a','#d12e23','#1e7fff','#ffd84d','#5b2c89','#fff7de','#08080d','#ffd86b','#a30f16','#7b0000','#8c8b86','#00543d','#ff8fc7','#7b1635','#061a48','#dfefff','#b98b35','#020713'].every(hex => magicDataJs.includes(hex)));
check('Character Forge magic selection uses colour card gallery', gameplayJs.includes('magicGroups()') && gameplayJs.includes('phase3-magic-card') && gameplayJs.includes('--magic-color') && stylesCss.includes('.phase3-magic-card'));
check('Character Forge stores locked affinity rolls', ['renderAffinityRolls','affinityRankForValue','affinityRollsComplete','data-phase3-affinity-lock','magicAffinities','skillAffinities'].every(token => gameplayJs.includes(token)) && stylesCss.includes('.phase3-affinity-card'));
check('Character Forge enforces class magic slots', ['CLASS_MAGIC_CATEGORY_SLOTS','CLASS_MAGIC_REQUIRED','classMagicRulesForDraft','magicSelectionIssues','data-phase3-class-mode','patronMagicType','mancerAdvantageMagicType'].every(token => gameplayJs.includes(token)) && ['Druid','Blood Magic','Chaos Magic','Death Magic'].every(token => gameplayJs.includes(token)));
check('Religious classes use Theology card gallery patrons', ['classPatrons','religiousClassSelections','religiousPatronIssues','renderPatronSelection','data-phase3-class-patron-card','classPatronRecordsForDraft','patronDatabaseEntries',"startsWith('content/theology/')"].every(token => gameplayJs.includes(token)) && stylesCss.includes('.phase3-patron-card-grid'));
check('GM can grant extra magic after creation', ['grantCharacterMagicType','revokeCharacterMagicType','installGMMagicGrantPanel','gmGrantedMagicTypes','gmGrantedTypes'].every(token => gameplayJs.includes(token)) && appJs.includes('gmGrantedAccess'));
check('GM bonus magic uses shared campaign character records', ['installGMPartyMagicPanel','persistMagicCharacter','saveCampaignCharacter','gmBonusMagicSlots'].every(token => gameplayJs.includes(token)));
check('Race affinities remain separate from class magic slots', ['racialMagicTypesForEntry','characterRacialMagicTypes','Water Magic','Pixie'].every(token => gameplayJs.includes(token)) && gameplayJs.includes('do not use class magical element slots'));
check('Player active spells sync from forged magic choices', appJs.includes('c?.magicTypes||c?.character?.magic?.types||c?.magic?.types') && appJs.includes('v1722MagicSlug') && appJs.includes('No active spells assigned to the selected magic types.') && !appJs.includes("access=['light','water','blood','fate','eldritch']"));
check('Spell cards open shared foreground popup', appJs.includes('function v1722OpenSpell(name)') && appJs.includes("eyebrow:'Spell'") && appJs.includes('openAsteriaInfoModal({'));
check('Dashboard and character spell panels share forged magic filters', ['v1724RenderSpellPanels','v1724EnsureSpellMenuPanel','v1724OpenSpellsTab','data-spell-context-v1724','spell-card-linked-v1724'].every(token => appJs.includes(token)) && stylesCss.includes('.spell-card-linked-v1724') && stylesCss.includes('.spell-menu-panel-v1724'));
check('Dashboard spell cards can cast and spend resources once per double-click', ['v1724CastSpell','v1724SpendCosts','Spell cast:','v1724SpellCostHtml','spellDoubleHandledV1724','runDouble'].every(token => appJs.includes(token)) && ['.spell-cost-chip.hp','.spell-cost-chip.sp','.spell-cost-chip.mp'].every(token => stylesCss.includes(token)));
check('Dashboard talent cards show highest unlocked ranks', ['renderUnlockedTalentSummary=function','dashboard-talent-card-v1724','v1724OpenTalentTree','v1724TalentCostText'].every(token => appJs.includes(token)) && stylesCss.includes('.dashboard-talent-card-v1724'));
check('Talent Tree renders tier-gated class panels', ['ASTERIA_TALENT_TIER_UNLOCKS','v1724RenderClassTalentPanel','v1724SelectTalentTier','multi-class-talent-panels-v1724','locked until you reach Level'].every(token => appJs.includes(token)) && stylesCss.includes('.class-talent-panel-v1724') && stylesCss.includes('.tier-locked-panel-v1724'));
const forgeStandaloneBranch = gameplayJs.indexOf("if(activeSystem === 'characterCreator')");
const genericGameplayMenu = gameplayJs.indexOf('<h3>Gameplay Systems</h3>');
check('Character Forge renders as standalone page', forgeStandaloneBranch >= 0 && gameplayJs.includes("root.classList.add('phase3-forge-shell')") && genericGameplayMenu > forgeStandaloneBranch);
check('Character Forge uses compendium category panels for race and class', gameplayJs.includes('renderForgeCategoryPanel') && gameplayJs.includes('clean-drilldown-cat') && gameplayJs.includes('AsteriaRaceCompendium.entries') && gameplayJs.includes('AsteriaCodexCompendium.classEntries'));
check('Character Forge uses dashboard characteristic keys', gameplayJs.includes("const FORGE_CHARACTERISTICS = ATTRIBUTE_KEYS") && ['strength','dexterity','agility','constitution','endurance','intelligence','wisdom','charisma','luck'].every(token => gameplayJs.includes(token)) && gameplayJs.includes('FORGE_STAT_LABELS'));
check('Character Forge treats public races as playable by campaign-default', gameplayJs.includes('Campaign-specific race limits will be controlled later in Campaign Forge') && gameplayJs.includes("{ playable:true, availability:'playable' }") && !gameplayJs.includes('Only playable, player-visible races are shown here'));
check('Character Forge applies race characteristic rules', ['CHARACTERISTIC_TIER_RULES','raceCharacteristicRulesFor','finalForgeCharacteristics','characteristic_rules'].every(token => gameplayJs.includes(token)) && gameplayJs.includes('phase3-characteristic-lines') && gameplayJs.includes('Racial Modifier') && gameplayJs.includes('Characteristic Tier Cap'));
check('Character Forge stores racial info for dashboards', ['raceInfoPayloadForEntry','racial_info','racialTraits','racialFeatures','racialMovement'].every(token => gameplayJs.includes(token)));
check('Character Forge supports editing existing characters', ['editForgedCharacter','editCharacterId','lockedClassSlug','phase3a-character-updated','Primary Class Locked'].every(token => gameplayJs.includes(token)));
check('Character Forge supports popup character card colour settings', ['CARD_COLOUR_OPTIONS','data-forge-card-colour-settings','openCharacterCardColourSettings','data-forge-colour-picker','openAsteriaInfoModal','setCharacterCardColour','--character-card-colour','.forge-card-colour-settings'].every(token => gameplayJs.includes(token) || stylesCss.includes(token)));
check('Character Forge stores max-two class locks', gameplayJs.includes('MAX_CHARACTER_CLASSES = 2') && gameplayJs.includes('classLimit:{ max:MAX_CHARACTER_CLASSES, primaryLocked:true }') && gameplayJs.includes('secondaryClassSlugs'));
check('Character Forge is data-driven', ["databaseEntries('race')", "databaseEntries('class')", "entriesForSelect('skill'", "entriesForSelect('origin'", "databaseEntries('item')"].every(token => gameplayJs.includes(token)));
check('Skill Compendium is available from public navigation', html.includes('data-workspace-section="Skills"') && viewerSource.includes('openSection'));
check('Skill database is canonical and duplicate-free', skillEntries.length === 154 && duplicateSkillTitles.length === 0 && skillEntries.every(entry => String(entry.sourcePath || '').startsWith('content/skills/')), `${skillEntries.length} skills / ${duplicateSkillTitles.length} duplicates`);
check('Detailed skill techniques are retained', skillEntries.some(entry => entry.title === 'Archery' && String(entry.sections?.Ranks || '').includes('Steady Draw') && String(entry.sections?.Ranks || '').includes('Grandmaster Techniques')));
check('Character Forge filters shared Skill Compendium entries', gameplayJs.includes("entriesForSelect('skill', FALLBACK_SKILLS)") && gameplayJs.includes('data-phase3-skill-category') && gameplayJs.includes('forgeSearch?.skill'));
check('Character Forge stores final schema', ['family_tree','backstory','characterSchema','created','updated','appearance','origin','characteristics','equipment'].every(token => gameplayJs.includes(token)));
check('Player dashboard uses Characteristic Tier structure', progressionUiJs.includes('characteristicTierRules') && progressionUiJs.includes('characteristicTierInfo') && progressionUiJs.includes('characteristicCapFor') && appJs.includes("return v>=100?'Tier V'"));
check('Player dashboard reflects class lock and max classes', appJs.includes('Primary class locked') && appJs.includes('Class Slots') && appJs.includes('Class limit reached') && appJs.includes('slice(0,max)'));
check('Player dashboard syncs racial info from forged character', ['renderDashboardRacialInfo','v1722RaceInfoForCharacter','characterRacialInfo','racialTraitsList','Racial Characteristics'].every(token => appJs.includes(token)));
const raceContentRoot = path.join(root, 'content/races');
const raceContentDirs = fs.readdirSync(raceContentRoot, { withFileTypes:true }).filter(entry => entry.isDirectory());
const cavernRaceFile = fs.readFileSync(path.join(raceContentRoot, 'cavern-sprite/index.md'), 'utf8');
const raceManifestEntries = content.entries('race');
const raceManifest = {source:'content/races',entryCount:raceManifestEntries.length};
check('Canonical data and registry load before the shared viewer', jsFiles.indexOf('data/compendium.js') < jsFiles.indexOf('js/compendium-registry.js') && jsFiles.indexOf('js/compendium-registry.js') < jsFiles.indexOf('js/universal-compendium-engine.js'));
check('Race content folder is flat and generated', fs.existsSync(path.join(root, 'scripts/generate-race-content.js')) && raceContentDirs.length === 201 && raceContentDirs.every(entry => fs.existsSync(path.join(raceContentRoot, entry.name, 'index.md'))));
check('Race manifest is generated from content/races', raceManifest.source === 'content/races' && raceManifest.entryCount === 201 && raceManifestEntries.length === 201 && raceManifestEntries.every(entry => String(entry.sourcePath || '').startsWith('content/races/')));
check('Removed race entries are not active', !fs.existsSync(path.join(raceContentRoot, 'undien/index.md')) && !fs.existsSync(path.join(raceContentRoot, 'deepborn-undien/index.md')) && !raceManifestEntries.some(entry => ['Undien','Deepborn Undien'].includes(entry.name)));
const classContentRoot = path.join(root, 'content/classes');
const classContentDirs = fs.readdirSync(classContentRoot, { withFileTypes:true }).filter(entry => entry.isDirectory());
const classManifestEntries = content.entries('class');
const classManifest = {source:'content/classes',entryCount:classManifestEntries.length};
check('Class content folder is flat and generated', fs.existsSync(path.join(root, 'scripts/generate-class-content.js')) && classContentDirs.length >= 30 && classContentDirs.every(entry => fs.existsSync(path.join(classContentRoot, entry.name, 'index.md'))));
check('Class talents use per-tier content folders', fs.existsSync(path.join(root, 'content/talents/artificer-artificer-discipline/index.md')) && fs.existsSync(path.join(root, 'content/talents/artificer-arcane-exchange/index.md')));
check('Class manifest is generated from content/classes', classManifest.source === 'content/classes' && classManifest.entryCount >= 30 && classManifestEntries.length >= 30 && classManifestEntries.every(entry => String(entry.sourcePath || '').startsWith('content/classes/')));
const importedClassTalentChecks = [
  ['druid', 'tier-1', 'aura-reading'],
  ['ranger', 'tier-1', 'animal-companion'],
  ['bloodhunter', 'tier-1', 'blood-rite'],
  ['paladin', 'tier-1', 'aura-of-courage'],
  ['cleric', 'tier-1', 'channel-divinity'],
  ['spellblade', 'tier-1', 'arcane-edge']
];
check('Imported class manuscripts use the canonical talent tree', importedClassTalentChecks.every(parts => fs.existsSync(path.join(root,'content/talents',parts[0]+'-'+parts[2],'index.md'))));
check('Imported class rank content is complete', importedClassTalentChecks.every(parts => {
  const markdown = fs.readFileSync(path.join(root,'content/talents',parts[0]+'-'+parts[2],'index.md'), 'utf8');
  return ['## Rank 1', '## Rank 2', '## Rank 3', '## Rank 4', '## Rank 5'].every(rank => markdown.includes(rank));
}));
check('Imported class trees do not retain generated placeholders', [
  'druid-discipline',
  'ranger-discipline',
  'cleric-discipline',
  'paladin-discipline',
  'spellblade-discipline',
  'crimson-brand'
].every(slug => !classManifestEntries.some(entry => entry.talents.some(talent => talent.slug === slug))));
check('Class manifest preserves talent resource metadata', classManifestEntries.some(entry => entry.slug === 'bloodhunter' && entry.talents.some(talent => talent.slug === 'blood-rite' && talent.hpCost && talent.bloodPointCost)));
check('Gameplay systems do not inject extra sidebar shortcuts', !gameplayJs.includes('data-phase3-sidebar') && !gameplayJs.includes('data-phase3-side="characterCreator"'));
check('Phase 4 world script is loaded', jsFiles.includes('js/asteria-world-systems.js'));
check('Phase 4 exposes world API', worldJs.includes('window.AsteriaWorld') && worldJs.includes('openWorldState') && worldJs.includes('openWorldMap'));
check('Phase 4 uses universal compendium data', worldJs.includes('AsteriaUniversalCompendium') && worldJs.includes("databaseEntries('location')") && worldJs.includes("databaseEntries('faction')"));
check('Phase 4 tracks campaign world persistence', worldJs.includes('campaigns:{}') && worldJs.includes('persistence:{') && worldJs.includes('worldChanges'));
check('Phase 4 supports GM visibility controls', worldJs.includes('playerSafeMode') && worldJs.includes('gm-only') && worldJs.includes('isGMMode'));
check('World systems do not inject extra sidebar shortcuts', !worldJs.includes('data-phase4-sidebar') && !worldJs.includes('phase4-sidebar-group'));
check('Home view has no account option panel', !/Account Options|test-logins|offline-logins/i.test(homeHtml));
check('Top-right login remains and create account moved to login page', html.includes('id="loginToggle"') && !html.includes('id="createAccountTop"') && html.includes('id="accountCreate"'));
check('Home guard loads before app scripts', jsFiles.includes('js/asteria-home-guard.js') && jsFiles.indexOf('js/asteria-home-guard.js') < jsFiles.indexOf('js/app.js'));
check('Home button uses early hard-home action', html.includes('id="sidebarHomeButton"') && html.includes('onclick="return window.asteriaHardHome(event)"') && homeGuardJs.includes("document.addEventListener('click', handleHomeEvent, true)"));
check('Home button uses shell home action', html.includes('data-home-action="true"') && coreShellJs.includes('window.goHome') && coreShellJs.includes('clearRouteState'));
check('Home action clears workspace shells', coreShellJs.includes('asteria-workspace-shell') && coreShellJs.includes('workspace-active') && coreShellJs.includes('stopImmediatePropagation') && coreShellJs.includes('shellHomeCaptureBound'));
check('Legacy setView home route is wrapped', coreShellJs.includes('wrapSetViewHomeRoute') && coreShellJs.includes('__asteriaHomeWrapped') && coreShellJs.includes("if(id === 'home') return goHome()") && appJs.includes("if(id === 'home' && window.AsteriaRouter?.home"));
check('Duplicate home fallback is removed', !jsFiles.includes('js/asteria-home-fix.js') && !fs.existsSync(path.join(root, 'js/asteria-home-fix.js')));
check('Canonical home guard and shell own the visible Home action', homeGuardJs.includes('window.asteriaHardHome') && html.includes('id="sidebarHomeButton"') && coreShellJs.includes('wrapSetViewHomeRoute'));
check('Old dark/light controls removed', !html.includes('Dark Mode') && !html.includes('Light Mode') && !appJs.includes('setThemeMode'));
check('Old dark/light CSS modes removed', !stylesCss.includes('body[data-theme'));
check('Old fixed accent controls removed', !html.includes("setAccent('blue')") && !html.includes('class="colour-grid"'));
check('Old fixed accent system removed', !appJs.includes('function setAccent') && !stylesCss.includes('body[data-accent') && !stylesCss.includes('.colour-grid'));
check('Theme controls include required sliders', html.includes('asteriaThemeSelect') && html.includes('asteriaColourWheel') && html.includes('asteriaGlowSlider') && html.includes('asteriaOverlaySlider') && html.includes('asteriaPanelOpacitySlider'));
check('Home reset clears workspace shells', coreShellJs.includes('asteria-workspace-shell') && coreShellJs.includes('workspace-active') && coreShellJs.includes('showPublicHome'));
check('Navigation shell uses solid blue-gray panels', stylesCss.includes('--asteria-shell:#17242d') && stylesCss.includes('background:var(--asteria-shell)!important') && stylesCss.includes('overflow:hidden!important'));
check('Settings drawer opens below the top panel', stylesCss.includes('top:var(--core-header-height)!important') && appJs.includes('function toggleSettings()') && appJs.includes("$('shade').onclick=closeSettings"));
check('Authenticated top action logs out', authBridgeJs.includes("login.textContent = 'Log Out'") && coreShellJs.includes("window.logout?.()"));
check('Bloodhunter dashboard resource is wired', html.includes('id="pBPResource"') && appJs.includes('function isBloodhunter(c)') && appJs.includes("bp:'pBPAmount'"));
check('Bloodhunter talent triggers update BP', ['bloodhunterBPGainForTalent','applyBloodhunterTalentBP','talent-bp-trigger'].every(token => appJs.includes(token)) && inventoryWorkflowCss.includes('.talent-bp-trigger'));
check('Dashboard quick items use four inventory slots', html.includes('id="dashboardQuickItems"') && appJs.includes('function renderDashboardQuickItems()') && appJs.includes('ASTERIA_V133_QUICK_SLOTS.map'));
check('Theme engine updates required variables', ['--asteria-accent','--asteria-glow','--asteria-overlay-opacity'].every(token => themeSystemJs.includes(token)));
check('Theme controls use event binding without repeated polling', themeSystemJs.includes('refreshControls:bind') && !themeSystemJs.includes('setInterval(bind'));
check('Theme engine updates panel opacity', themeSystemJs.includes('asteriaPanelOpacitySlider') && themeSystemJs.includes('--panel-bg'));
check('Theme engine clears legacy theme state', themeSystemJs.includes('removeAttribute("data-accent")') && themeSystemJs.includes('removeItem("asteria-accent")'));
check('Background linework uses theme colour', themeCss.includes('color:var(--asteria-accent)') && themeCss.includes('mask:url("../assets/themes/asteria-spell-d20-overlay.svg")'));
check('Site-wide accessibility shell is present', html.includes('class="skip-link"') && html.includes('id="mainContent"') && html.includes('id="asteriaLiveRegion"') && html.includes('aria-controls="settingsPanel"') && coreShellJs.includes('bindSettingsAccessibility') && coreShellJs.includes('AsteriaAnnounce'));
check('Site-wide responsive card galleries and reading width are canonical', modernUiCss.includes('grid-template-columns: repeat(6, minmax(0, 1fr))') && modernUiCss.includes('--asteria-content-reading') && modernUiCss.includes('@media (max-width: 560px)'));
check('Static live sync yields campaign listeners to React routes', dataSyncJs.includes('reactOwnsCampaignSubscriptions') && dataSyncJs.includes('stopCampaignRealtimeSubscriptions') && dataSyncJs.includes("window.addEventListener('hashchange'"));
const inventoryApiJs = fs.readFileSync(path.join(root, 'js/asteria-inventory-api.js'), 'utf8');
check('Inventory API exposes AsteriaInventory', inventoryApiJs.includes('window.AsteriaInventory'));
check('Inventory API wraps existing inventory render path', inventoryApiJs.includes('window.renderInventory'));
check('Inventory workflow uses Compendium-backed item picker', ['catalogEntries','openItemPicker','workflowItemSearch','itemSnapshot'].every(token => inventoryWorkflowJs.includes(token)));
check('Inventory supports drag-drop equipment and safe replacement', ['data-inventory-drag-item','data-equipment-slot','placeInBag','replacementDestination','No empty bag slot is available'].every(token => inventoryWorkflowJs.includes(token)) && inventoryWorkflowCss.includes('.inventory-drag-over'));
check('GM can send campaign item rewards', ['pendingItemRewards','saveCampaignCharacter','gmItemRewardPanel','resolveReward'].every(token => inventoryWorkflowJs.includes(token)));
check('Item rewards resolve through one idempotent transaction', ['resolveCampaignItemReward','resolvedItemRewardIds','resolvingRewardIds','persist:false'].every(token => inventoryWorkflowJs.includes(token)) && firebaseAuthJs.includes('resolveCampaignItemReward'));
check('Realtime sync rejects stale pending reward snapshots', ['mergeItemRewardState','staleResolvedIds','repairStaleRewardResolution','changedIds'].every(token => dataSyncJs.includes(token)));
check('GM campaign shops use cart checkout and coin deduction', ['gmCampaignShopPanel','shopCart','purchaseShopCart','setCharacterCopper','emptyBagSlotCount'].every(token => inventoryWorkflowJs.includes(token)));
check('Item ecosystem extends one canonical inventory API', ['normalizeItem','ensureCampaign','splitStack','combineStacks','moveToStorage','encumbrance','filterItems','audit'].every(token => inventoryApiJs.includes(token)));
check('Player item workspace includes complete navigation', ['Inventory','Equipment','Bags','Storage','Party Loot','Shops','Player Trade','Trade Listings','Wishlist','Transaction History'].every(label => itemEcosystemJs.includes(`'${label}'`)));
check('GM item workspace includes loot, shop, inventory, trade, and audit tools', ['Reward Loot','Party Loot Manager','Loot Tables','Loot Drop Generator','Shop Manager','Player Inventories','Trade History','Inventory Activity Logs'].every(label => itemEcosystemJs.includes(`'${label}'`)));
check('Party loot supports Need Greed Pass and shared distribution', ['chooseLoot','need-greed','distributeLoot','sellAllPartyLoot'].every(token => itemEcosystemJs.includes(token)));
check('Shop and trading workflows use campaign-shared state', ['createShop','restockShop','buyShopItem','sellShopItem','createDirectTrade','confirmTrade','createListing','buyListing'].every(token => itemEcosystemJs.includes(token)));
check('Campaign item ecosystem uses a member-shared Firebase document', ['saveCampaignItemEcosystem','loadCampaignItemEcosystem','subscribeCampaignItemEcosystem'].every(token => firebaseAuthJs.includes(token)) && dataSyncJs.includes('mergeRealtimeItemEcosystem') && firestoreRules.includes('match /systems/{systemId}') && firestoreRules.includes('canUseCampaignSystems'));
check('Direct trades allow both players to revise and confirm offers', ['updateTradeOffer','data-trade-update','trade-offer-updated','Confirm Final Offer'].every(token => itemEcosystemJs.includes(token)));
check('Party loot inspection is read-only', itemEcosystemJs.includes('function openLootDetails') && itemEcosystemJs.includes("subtitle:'Read-only inspection'") && !itemEcosystemJs.includes("source:'Temporary inspection'"));
check('Central item cards support drag-drop equipment, bags, and storage', ['draggable="true"','data-bag-drop','data-storage-drop',"text/asteria-item-id",'data-equipment-slot'].every(token => itemEcosystemJs.includes(token)) && itemEcosystemCss.includes('.drop-ready'));
check('Item ecosystem provides responsive layouts', ['@media(max-width:1600px)','@media(max-width:1050px)','@media(max-width:760px)','@media(max-width:480px)'].every(token => itemEcosystemCss.includes(token)));
check('Shell exposes router API', fs.readFileSync(path.join(root, 'js/asteria-core-shell.js'), 'utf8').includes('window.AsteriaRouter'));
check('Shell exposes account API', fs.readFileSync(path.join(root, 'js/asteria-core-shell.js'), 'utf8').includes('window.AsteriaAccounts'));

const cleanCompendiumIndex = universalCompendiumIndex;
const raceEntry = content.resolve('cavern-sprite','race');
check('Unified workspace compendium index exists', cleanCompendiumIndex.version === 'asteria-compendium-v2' && cleanCompendiumIndex.entries.length >= 5);
check('Workspace exposes shared APIs', cleanCompendiumJs.includes('window.openCompendiumSection') && cleanCompendiumJs.includes('window.openCompendiumPath') && cleanCompendiumJs.includes('window.AsteriaWorkspace'));
const theologyEntries = cleanCompendiumIndex.entries.filter(entry => entry.section === 'Theology');
const primordialTheologyEntries = theologyEntries.filter(entry => (entry.metadata?.pantheon || entry.metadata?.category || entry.category) === 'Primordials');
check('Workspace routes compendium sections through one renderer', ['Asteria Handbook','World, Realms & Planes','Races','Classes','Items','Magic','Theology','Creatures','Factions'].every(section => cleanCompendiumJs.includes(section)));
check('Theology entries are generated from content/theology', theologyEntries.length >= 100 && theologyEntries.every(entry => String(entry.sourcePath || '').startsWith('content/theology/')));
check('Theology contains exactly three Primordials', primordialTheologyEntries.length === 3 && ['Primordial of Energy','Primordial of the Ether','Primordial of the Void'].every(title => primordialTheologyEntries.some(entry => entry.title === title)));
check('Theology navigation contains the authored pantheons and courts', ['Primordials','Pantheon of Elements','Aetherion Pantheon','The Outsiders','The Nethyros Pantheon','Dark Court','Light Court'].every(label => theologyEntries.some(entry => entry.categoryPath.includes(label))));
check('Race navigation removes old playable folders', !html.includes("Races/Playable Races") && !html.includes("Races/Non-Playable Races") && !cleanCompendiumJs.includes('Playable Races') && !cleanCompendiumJs.includes('Non-Playable Races'));
check('Race navigation is derived from authored categories', content.entries('race').every(entry => entry.categoryPath.length > 0) && content.tree('race').length > 0);
check('Race playable status is metadata', Boolean(raceEntry) && raceEntry.playable === true && raceEntry.availability === 'playable' && raceEntry.raceCategory === 'Small Races');
check('Workspace layout uses standard panels', cleanCompendiumCss.includes('.workspace-header') && cleanCompendiumCss.includes('.workspace-category-panel') && cleanCompendiumCss.includes('.workspace-filter-area') && cleanCompendiumCss.includes('.workspace-tabs') && cleanCompendiumCss.includes('.workspace-display-window'));
check('Player dashboard keeps TP talent unlock controls', appJs.includes('Class Talent Tree') && appJs.includes('visual-tree-board') && appJs.includes('stageTalent(') && appJs.includes('applyTalentRanks()') && appJs.includes('Staged cost'));
check('Clean compendium generator exists', fs.existsSync(path.join(root, 'scripts/generate-clean-compendium-index.js')));
check('Old public hub pages removed', ['handbookHub','worldHub','racesHub','classesHub','itemsHub','magicHub'].every(id => !ids.includes(id)));
check('Old handbook library viewer removed', !ids.includes('library') && !ids.includes('rulePage') && !html.includes('ruleCards') && !html.includes('ruleContent'));
check('Public sidebar targets workspace sections', ['Asteria Handbook','World, Realms & Planes','Races','Classes','Items','Magic'].every(section => html.includes(`data-workspace-section="${section}"`)));
check('UI modernisation delivery version is active', html.includes('Asteria UI Modernisation Steps 7-12'));
check('Login page has one account type only', !html.includes('loginPageRole') && !html.includes('GM Account') && !html.includes('Administrator</option>'));
check('Logged-in sidebar keeps only dashboard/settings actions', ['data-workspace-mode="dashboard"', 'data-workspace-action="settings"'].every(token => html.includes(token)) && ['data-workspace-mode="campaigns"', 'data-workspace-action="create-campaign"', 'data-workspace-mode="characters"', 'data-workspace-action="create-character"', 'data-app-route="player-dashboard"', 'data-app-route="campaign-manager"', 'data-app-route="gm-dashboard"'].every(token => !html.includes(token)));
check('Top bar owns Character Forge and Campaign Forge navigation', ['id="characterForgeTop"', 'id="campaignsTop"', 'Character Forge', 'Campaign Forge', 'openCharacterForgeHub', 'openCampaignHub'].every(token => html.includes(token) || coreShellJs.includes(token)) && stylesCss.includes('.top-workspace-menu .top-menu-btn'));
check('Campaign gallery opens GM dashboards', cleanCompendiumJs.includes('openCampaignGMDashboard') && cleanCompendiumJs.includes('Forge New Campaign') && cleanCompendiumJs.includes('openCampaignHub'));
check('Campaign creation generates and displays 12-digit UCN', html.includes('campaignUCNDisplay') && appJs.includes('appUniqueCampaignCode') && appJs.includes('ensureAppCampaignUCN') && appJs.includes('campaign.ucn=code') && appJs.includes('campaign.inviteCode=code'));
check('GM Campaign Manager shows UCN panel', appJs.includes('gmCampaignManagerUCNPanel') && appJs.includes('Unique Campaign Number') && stylesCss.includes('.gm-campaign-ucn-panel'));
check('Shared popups use centered blurred foreground layer', stylesCss.includes('Unified foreground popup layer') && stylesCss.includes('.item-modal') && stylesCss.includes('.codex-talent-modal-backdrop') && stylesCss.includes('z-index:8200') && stylesCss.includes('backdrop-filter:blur(5px)'));
check('GM dashboard render tolerates missing top counters', appJs.includes('setTextSafe') && appJs.includes("setTextSafe('topPlayers'") && !appJs.includes("$('topPlayers').textContent=c.party.length;$('topEncounters')"));
check('GM dashboard uses the compact eight-tab menu', gmDashboardBlock.includes('Asteria GM Dashboard v1') && ['GM Main','Quests','GM Notes','Economy','Crafting','GM Tools','Gameplay Systems','World Systems'].every(label => gmDashboardBlock.includes(`label:'${label}'`)) && ['Actions','Encounter Builder','Rewards','Materials','Enchantments'].every(label => !gmDashboardBlock.includes(`label:'${label}'`)));
check('GM dashboard keeps one sync panel', appJs.includes('gmSyncStatusPanel') && appJs.includes("v170RenderSyncPanel=function(){document.getElementById('v170SyncPanel')?.remove();renderGMSyncPanel();}") && stylesCss.includes('.gm-sync-card'));
check('GM top panel keeps session actions only', gmDashboardBlock.includes('Start Session</button><button class="danger" onclick="endSession()">End Session') && stylesCss.includes('#gm .gm-dashboard-hero-v1 .gm-sync-card'));
check('GM menu bottom actions are removed', gmDashboardBlock.includes("document.querySelector('#gm .gm-menu-bar-actions')?.remove();") && stylesCss.includes('#gm .gm-menu-bar-actions{display:none!important}'));
check('GM main owns encounter and progression while GM Tools owns loot and items', gmDashboardBlock.includes("assign('#gmEncounterWorkspace,#gm .gm-xp-split','gm-main')") && gmDashboardBlock.includes(".transaction-pipeline-panel,#gm #partyLootManagerPanel,#gm #gmItemRewardPanel','campaign-manager'") && appJs.includes('Asteria GM Encounter Workspace v1'));
check('GM old split encounter panels are hidden', gmDashboardBlock.includes("assign('#gm .active-encounter,#gm .initiative,#gm .encounter,#gm .combat-system-panel','gm-hidden')"));
check('GM encounter workspace supports requested controls', ['gmEncounterWorkspace','gmEnemySearchResults','gmDefeatEnemy','openGMEnemyDetail','gmAddCreatureToEncounter','gmSortEncounterInitiative'].every(token => appJs.includes(token)) && !appJs.includes("panel.id='gmCampaignCharacterPanel'") && stylesCss.includes('.gm-encounter-workspace') && stylesCss.includes('.gm-enemy-card.defeated'));
check('GM legacy systems map into requested tabs', ['actions:\'gm-main\'','encounter:\'gm-main\'','rewards:\'gm-main\'','materials:\'crafting\'','enchantments:\'crafting\'','tools:\'campaign-manager\''].every(token => gmDashboardBlock.includes(token)));
check('GM roster derives all shared campaign character links', appJs.includes('function campaignPartyIds') && appJs.includes('campaign.playerCharacterLinks') && appJs.includes('decorateGMPartyRoster'));
check('GM roster opens the full Character Dashboard', appJs.includes('function openGMPlayer') && appJs.includes("setView('player')") && appJs.includes('__asteriaGMCharacterPreview'));
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
check('Campaign Forge supports 12 digit UCN invites', ['uniqueCampaignCode','campaignInviteUrl','campaign-invite=','workspaceJoinCampaignCode','Join Campaign','joinCampaignByUCN','createCampaignInvite'].every(token => cleanCompendiumJs.includes(token)) && cleanCompendiumJs.includes('randomDigits(12)'));
check('Campaign Forge tolerates removed title descriptions', cleanCompendiumJs.includes("const intro = element.querySelector('#clean-intro')") && !cleanCompendiumJs.includes("querySelector('#clean-intro').textContent"));
check('UCN join uses shared Firebase invite records', ['campaignInvites', 'joinCampaignByUCN', 'runTransaction', 'loadCampaigns'].every(token => firebaseAuthJs.includes(token)) && cleanCompendiumJs.includes("joinResult('Finding campaign...'") && dataSyncJs.includes('mergeCloudCampaigns'));
check('Linked campaign characters use shared dashboard snapshots', ['campaignCharacterSnapshot','campaignCharacterSummary',"'campaigns', campaignId, 'characters', characterId",'hydrateSharedCampaignCharacters'].every(token => firebaseAuthJs.includes(token)) && cleanCompendiumJs.includes('linkedCampaignIds'));
check('Campaign membership and safe character linking commit atomically', firebaseAuthJs.includes('upsertSharedCampaignCharacter') && firebaseAuthJs.includes('mergeLinkedCharacter(existing, submitted, linkMetadata)') && firebaseAuthJs.includes('safeLinkedCharacterPatch(submitted)') && firebaseAuthJs.includes('transaction.update(campaignRef'));
check('Legacy local character links can repair into shared campaigns', firebaseAuthJs.includes('matchesSavedName') && firebaseAuthJs.includes("'settings', 'appState'") && dataSyncJs.includes("scheduleCloudSave('auth-ready')"));
check('Shared campaign loading rebuilds missing party arrays', firebaseAuthJs.includes('playerCharacterIds') && firebaseAuthJs.includes('Object.keys(characters)') && firebaseAuthJs.includes('Object.keys(playerCharacterLinks)'));
check('GM campaign loading refreshes authoritative shared data', firebaseAuthJs.includes('mergeSharedCampaign(accountCampaign') && dataSyncJs.includes('refreshCloudCampaigns') && dataSyncJs.includes('asteria:campaigns-refreshed') && coreShellJs.includes("refreshCampaigns?.('gm-dashboard-open')"));
check('GM roster supports hydrated shared character records', appJs.includes('function campaignCharacterFor') && appJs.includes('campaignCharacterFor(c,id)') && appJs.includes('campaignCharacterFor(campaigns?.[activeCampaign],id)'));
check('Firestore permits member character snapshot sync', firestoreRules.includes('match /characters/{characterId}') && firestoreRules.includes('canReadCampaignCharacter') && firestoreRules.includes('canWriteCampaignCharacter'));
check('GM XP awards publish the canonical character record immediately', appJs.includes('saveCampaignCharacterProgress') && firebaseAuthJs.includes('saveCampaignCharacterProgress: async function') && firebaseAuthJs.includes("doc(db, 'campaigns', campaignId, 'characters', characterId)"));
check('Player receives and persists real-time progression', dataSyncJs.includes('progressionChanged') && dataSyncJs.includes('persistReceivedProgression') && dataSyncJs.includes('saveOwnedCharacterProgress') && firebaseAuthJs.includes('saveOwnedCharacterProgress: async function'));
check('React Character Dashboard patches XP snapshots without duplicate full rerenders', dataSyncJs.includes('asteria:xp-reward-realtime') && dataSyncJs.includes('reactDashboardActive') && !dataSyncJs.includes('queueMicrotask(()=>refreshRealtimePlayer(current))'));
check('XP and loot use one canonical campaign character stream', appJs.includes('publishCharacterProgression') && appJs.includes('saveCampaignCharacterProgress') && !dataSyncJs.includes('subscribeCampaignProgression('));
check('Player discovers campaigns before subscribing to character delivery', firebaseAuthJs.includes('subscribeAccountCampaigns: function') && dataSyncJs.includes('startAccountCampaignDiscovery') && dataSyncJs.includes('subscribeCampaignCharacters'));
check('Received character snapshots preserve XP and inventory together', dataSyncJs.includes('receivedCharacterSignature') && dataSyncJs.includes('persistReceivedCharacter') && dataSyncJs.includes('saveOwnedCharacterSnapshot'));
check('Live delivery scripts use cache-busted URLs', ['js/app.js?v=react-m1','js/firebase-auth.js?v=react-m1','js/data-sync.js?v=react-m1','js/asteria-inventory-workflows.js?v=react-m1'].every(src=>html.includes(src)));
const firebaseCampaignSaveBlock = firebaseAuthJs.slice(firebaseAuthJs.indexOf('saveCampaign: async function'), firebaseAuthJs.indexOf('findCampaignByUCN: async function'));
check('Campaign save preserves GM ownership', firebaseCampaignSaveBlock.includes('const ownerUid = campaignOwner(clean)') && firebaseCampaignSaveBlock.includes("if(ownerUid === currentUser.uid)") && !firebaseCampaignSaveBlock.includes('ownerUid: currentUser.uid'));
check('Deployable Firestore campaign rules exist', Boolean(firestoreRules) && ['campaignInvites', 'safeCharacterEdit', 'linksOwnedCharacter', "allow list: if false"].every(token => firestoreRules.includes(token)) && fs.existsSync(path.join(root, 'firebase.json')) && fs.existsSync(path.join(root, 'firestore.indexes.json')));
check('Campaign join can link existing or newly forged characters', ['renderJoinCharacterChooser','setPendingCampaignJoin','consumePendingCampaignJoin','workspaceJoinForgeCharacterBtn'].every(token => cleanCompendiumJs.includes(token)) && gameplayJs.includes('consumePendingCampaignJoin?.(id)'));
check('Dashboard includes required logged-in panels', ['Current Campaigns', 'Available Characters', 'Notifications', 'Active Party'].every(token => cleanCompendiumJs.includes(token)));
check('Data sync uses auth dashboard version', dataSyncJs.includes('asteria-auth-workspace-dashboard-system-v1'));
check('Firebase setup instructions exist', fs.existsSync(path.join(root, 'FIREBASE-SETUP.md')));
const raceGenderImageSlugs = ['abyssborn-undien','drownedborn-undien','flowborn-undien','frostborn-undien','polaris-ursa','tempestborn-undien','tideborn-undien','air-pixie','dark-pixie','death-pixie','earth-pixie','fire-pixie','life-pixie','light-pixie','water-pixie'];

// Canonical assets, category filters and historical collection routes are exercised in compendium.test.mjs.
const localServerJs = fs.readFileSync(path.join(root, 'scripts/local-static-server.js'), 'utf8');
check('Old standalone wiki renderer is not loaded', !jsFiles.includes('js/asteria-wiki.js') && !html.includes('id="floraWiki"') && !html.includes('floraWikiMount'));
check('Old wiki relationship styles are removed from global CSS', !stylesCss.includes('.wiki-relation-link') && !stylesCss.includes('.wiki-relationship-panel'));
check('Local static server supports compendium app routes', localServerJs.includes('compendiumAppRoutes') && localServerJs.includes('flora') && localServerJs.includes('materials') && localServerJs.includes('artifacts') && localServerJs.includes('sendIndex'));

const progressionContext = {
  window: {
    chars: {
      test: { name: 'Test Character', level: 0, xp: 1200, cp: 0, tp: 0 }
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
check('Progression module calculates level 0 XP cap', progression.xpToNextLevel(0) === 1000);
check('Progression module uses imported XP table', progression.xpToNextLevel(1) === 2000 && progression.xpToNextLevel(10) === 12000 && !Number.isFinite(progression.xpToNextLevel(100)));
check('Progression module applies level rewards', progressionContext.window.chars.test.level === 1 && progressionContext.window.chars.test.cp === 3 && progressionContext.window.chars.test.tp === 3);
check('Progression module preserves carryover XP', progressionContext.window.chars.test.xp === 200);
check('Progression module keeps skill-choice rewards disabled', levelResult.skillChoice === false);

jsFiles.forEach(file => {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  check(`Syntax OK: ${file}`, result.status === 0, (result.stderr || result.stdout || '').trim());
});

[
  'scripts/generate-wiki-index.js',
  'scripts/generate-flora-index.js',
  'scripts/generate-race-content.js',
  'scripts/generate-class-content.js',
  'scripts/import-class-source.js',
  'scripts/generate-clean-compendium-index.js',
  'scripts/generate-content-manifest.js',
  'scripts/generate-universal-compendium-index.js',
  'scripts/import-skills.js',
  'scripts/wiki-engine-config.js',
  'scripts/local-static-server.js'
].forEach(file => {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  check(`Syntax OK: ${file}`, result.status === 0, (result.stderr || result.stdout || '').trim());
});

const scriptOrder = jsFiles.join(' > ');
check(
  'Script order keeps manifest before app',
  jsFiles.indexOf('data/compendium.js') >= 0 &&
    jsFiles.indexOf('js/app.js') > jsFiles.indexOf('data/compendium.js'),
  scriptOrder
);
check(
  'Script order keeps generated content index before unified compendium',
  jsFiles.indexOf('js/compendium-registry.js') > jsFiles.indexOf('data/compendium.js') &&
    jsFiles.indexOf('js/clean-compendium.js') > jsFiles.indexOf('js/compendium-registry.js'),
  scriptOrder
);
check(
  'Script order keeps unified compendium after app',
  jsFiles.indexOf('js/clean-compendium.js') > jsFiles.indexOf('js/app.js'),
  scriptOrder
);
check(
  'Script order keeps state between manifest and app',
  jsFiles.indexOf('data/compendium.js') >= 0 &&
    jsFiles.indexOf('js/asteria-state.js') > jsFiles.indexOf('data/compendium.js') &&
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
  'Item ecosystem loads after inventory workflows and world map hooks',
  jsFiles.indexOf('js/asteria-item-ecosystem.js') > jsFiles.indexOf('js/asteria-inventory-workflows.js') &&
    jsFiles.indexOf('js/asteria-item-ecosystem.js') > jsFiles.indexOf('js/asteria-world-systems.js'),
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
