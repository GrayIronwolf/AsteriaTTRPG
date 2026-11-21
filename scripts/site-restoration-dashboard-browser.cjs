/* Original Git archive and React/Vite dashboard comparison on disposable local data. */
'use strict';
const assert=require('node:assert/strict');
const {execFileSync,spawn}=require('node:child_process');
const {createHash}=require('node:crypto');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {chromium}=require('playwright');
const {VIEWPORTS,FIREBASE_EMULATOR_ORIGINS,FIXTURE_ART_ORIGIN,isFixtureArtwork,
  browserLaunchOptions,browserContextOptions}=require('./site-restoration-browser-settings.cjs');
const {stableRender,captureDashboard}=require('./site-restoration-dashboard-capture.cjs');
const {auditReferences}=require('./site-dashboard-reference-preflight.cjs');
const {NOW,CAMPAIGNS,CHARACTER,email,PASSWORD,uid,seedDashboardEmulators}=require('./fixtures/restoration-dashboard.cjs');

const ROOT=path.resolve(__dirname,'..');
const ORIGINAL_REVISION='cc4e78680c7482f9e105d655c50a7cc30a339d62';
const LEGACY_ORIGIN=FIXTURE_ART_ORIGIN;
const REACT_ORIGIN='http://127.0.0.1:4174';
const MODERN_ORIGINS=[REACT_ORIGIN,...FIREBASE_EMULATOR_ORIGINS];
const OUTPUT=path.resolve(process.env.ASTERIA_RESTORATION_OUTPUT||
  path.join(process.env.RUNNER_TEMP||os.tmpdir(),'asteria-dashboard-restoration'));
const AUTH_OUTPUT=process.env.ASTERIA_RESTORATION_AUTH_DIR;
const APPROVED_CASES=process.env.ASTERIA_RESTORATION_APPROVED_CASES;
const CAMPAIGN=CAMPAIGNS[2];
const OLD_CAMPAIGN='demo-campaign';
const ROLES=['player','gm','readonly'];
const PRIVATE_TABS=['Journal','Gallery','Dashboard Settings'];
const LG_EDITOR='.react-grid-editor-canvas';
const MODERN_EDITOR='[data-testid="site-layout-canvas"]';
const REPRESENTATIVE={
  player:['Character','Inventory','Journal','Recording & Archives'],
  gm:['NPC & Creature Library','Gameplay Systems','GM Tools','Session Recordings']
};

function git(...args){return execFileSync('git',args,{cwd:ROOT,encoding:'utf8'}).trim();}

async function extractOriginal(directory){
  const archive=path.join(directory,'reference.tar'),site=path.join(directory,'site');
  await fs.mkdir(site);
  git('archive','--format=tar','--output='+archive,ORIGINAL_REVISION);
  execFileSync('tar',['-xf',archive,'-C',site]);
  // Require the original fixture to match the version this patch was written against.
  const pinned=git('rev-parse',ORIGINAL_REVISION+':src/devFixtures.js');
  assert.equal(pinned,git('rev-parse','20c4bac7:src/devFixtures.js'));
  await fs.copyFile(path.join(ROOT,'src/devFixtures.js'),path.join(site,'src/devFixtures.js'));
  return site;
}

async function startServer(children,cwd,args,origin){
  const server=spawn(process.execPath,args,{cwd,stdio:['ignore','pipe','inherit']});
  children.push(server);
  let startError,announced=false;
  server.stdout.on('data',chunk=>{
    process.stdout.write(chunk);
    if(chunk.toString().includes(origin+'/'))announced=true;
  });
  server.on('error',error=>{startError=error;});
  for(let attempt=0;attempt<100;attempt++){
    if(startError)throw startError;
    if(server.exitCode!==null)throw new Error('Dashboard baseline server exited: '+origin);
    try{if(announced&&(await fetch(origin,{signal:AbortSignal.timeout(600)})).ok)return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw new Error('Dashboard baseline server did not start: '+origin);
}

function route(role,campaign=CAMPAIGN){
  return role==='gm'?'#/react/gm/'+campaign:'#/react/character/'+campaign+'/'+CHARACTER;
}

function dashboardFor(page,implementation,role){
  const isGM=role==='gm';
  if(implementation==='original'){
    const root=page.locator(isGM?'.react-gm-dashboard':'.react-character-dashboard');
    const navSelector='nav[aria-label="'+(isGM?'GM Dashboard menu':'Character Dashboard menu')+'"]';
    return {root,navSelector,nav:root.locator(navSelector),tag:'tab'};
  }
  const root=page.getByTestId(isGM?'site-gm-dashboard':'site-player-dashboard');
  const navSelector='nav[aria-label="'+(isGM?'GM dashboard sections':'Character dashboard sections')+'"]';
  return {root,navSelector,nav:root.locator(navSelector),tag:'button'};
}

async function safelyOpenPage(browser,size,implementation){
  const allowed=new Set(implementation==='original'?[LEGACY_ORIGIN]:MODERN_ORIGINS);
  const context=await browser.newContext({...browserContextOptions(size),serviceWorkers:'block'});
  const blocked=new Set(),pageErrors=[];
  await context.route('**/*',request=>{
    const url=new URL(request.request().url());
    const fixtureArt=implementation==='react'&&isFixtureArtwork(request.request());
    if(allowed.has(url.origin)||fixtureArt)return request.continue();
    blocked.add(url.hostname);
    return request.abort();
  });
  const page=await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror',error=>pageErrors.push(error.message));
  await page.clock.setFixedTime(NOW);
  return {
    page,context,
    results(){
      assert.deepEqual(pageErrors,[],implementation+' '+size+' emitted runtime errors');
      return {blockedHosts:[...blocked].sort()};
    }
  };
}

async function openOriginal(page,role){
  const actor=role==='player'?'player':'gm';
  await page.goto(LEGACY_ORIGIN+'/?reactFixture=1&reactFixtureRole='+actor,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.AsteriaReactMigration?.available&&window.AsteriaFirebase?.isReady?.());
  await page.waitForLoadState('load');
  await page.locator('#asteriaHeaderName').getByText(actor==='gm'?'PreviewGM':'PreviewPlayer',{exact:true}).waitFor();
  // A trusted Home interaction completes the original startup guard before navigation.
  const settings=page.locator('#settingsToggle');
  await settings.click();
  await settings.click();
  assert.equal(await page.evaluate(()=>window.AsteriaFirebase.getUser().uid),actor+'-demo');
  await page.evaluate(({role,campaign,character})=>{
    if(role==='gm')window.AsteriaReactMigration.openGM(campaign);
    else window.AsteriaReactMigration.openCharacter(campaign,character);
  },{role,campaign:OLD_CAMPAIGN,character:CHARACTER});
  const {root,nav}=dashboardFor(page,'original',role);
  await nav.waitFor();
  await page.locator('#toast.show').waitFor({state:'detached'});
  if(role==='gm'){
    await root.getByRole('heading',{name:'Shadows of Elarion',exact:true}).first().waitFor();
  }else{
    const hp=root.getByLabel('HP change amount',{exact:true});
    await hp.waitFor();
    assert.equal(await hp.isEnabled(),role==='player');
  }
}

async function readOriginalScenario(page){
  return page.evaluate(async()=>{
    const firebase=window.AsteriaFirebase;
    const [campaign]=await firebase.loadCampaigns();
    const characters=await firebase.loadCharacters();
    const session=await new Promise(resolve=>{
      const stop=firebase.subscribeLiveSession(campaign.id,snapshot=>{stop();resolve(snapshot);});
    });
    return {campaign,characters,session};
  });
}

async function signIn(page,role){
  await page.goto(REACT_ORIGIN+'/#/account/login',{waitUntil:'domcontentloaded'});
  await page.locator('#asteria-email').fill(email(role));
  await page.locator('#asteria-password').fill(PASSWORD);
  await page.getByTestId('site-auth-submit').click();
  await page.getByTestId('site-header-profile').waitFor();
}

async function saveAuth(context,role,output){
  if(!output)return;
  const directory=path.resolve(output);
  assert.ok(directory!==OUTPUT&&!directory.startsWith(OUTPUT+path.sep),
    'Keep emulator auth state outside screenshot evidence');
  await fs.mkdir(directory,{recursive:true,mode:0o700});
  const state=await context.storageState({indexedDB:true});
  await fs.writeFile(path.join(directory,role+'.json'),JSON.stringify(state),{mode:0o600,flag:'wx'});
}

async function openReact(page,role,campaign=CAMPAIGN){
  await page.goto(REACT_ORIGIN+'/'+route(role,campaign),{waitUntil:'domcontentloaded'});
  const {root,nav}=dashboardFor(page,'react',role);
  await nav.waitFor();
  if(role==='gm'){
    await root.getByTestId('site-gm-session-status').getByText('ACTIVE',{exact:true}).waitFor();
    await root.getByTestId('site-gm-layout-workspace').waitFor();
  }else{
    await root.getByText(role==='readonly'?'GM Read-only':'Character Owner',{exact:true}).waitFor();
    await root.getByTestId('site-player-layout-workspace').waitFor();
    assert.equal(await root.getByRole('button',{name:'Increase HP',exact:true}).isEnabled(),role==='player');
    if(role==='readonly'){
      await root.getByTestId('site-player-layout-readonly').waitFor();
      assert.equal(await root.getByTestId('site-layout-open').count(),0);
      for(const label of PRIVATE_TABS)assert.equal(await nav.getByRole('button',{name:label,exact:true}).count(),0);
    }
  }
}

async function recordNavigation(page,implementation,role,size){
  const {root,nav,tag}=dashboardFor(page,implementation,role);
  const tabs=await nav.getByRole(tag).evaluateAll(elements=>elements.map(element=>
    (element.querySelector('.react-tab-label')?.textContent||element.innerText).trim()));
  const reached=[];
  for(const label of tabs){
    const tab=nav.getByRole(tag,{name:label,exact:true});
    await tab.click();
    if(tag==='tab')assert.equal(await tab.getAttribute('aria-selected'),'true');
    else assert.match(await tab.getAttribute('class'),/\b\S*_active_\S*\b/);
    await stableRender(page);
    const surface=await root.locator('h2:visible,h3:visible').allTextContents();
    reached.push({label,headings:surface.map(heading=>heading.trim())});
    if(size==='desktop'&&REPRESENTATIVE[role]?.includes(label)){
      const slug=label.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,'');
      reached[reached.length-1].capture=
        await captureDashboard(page,root,null,OUTPUT,implementation+'-'+role+'-'+slug);
    }
  }
  return reached;
}

async function recordEditor(page,implementation,role,size,registry){
  const {nav,root,tag}=dashboardFor(page,implementation,role);
  await nav.getByRole(tag,{name:'Dashboard Settings',exact:true}).click();
  const original=implementation==='original';
  const trigger=original?root.getByRole('button',{name:'Customise Dashboard Layout',exact:true}):
    root.getByTestId('site-layout-open');
  await trigger.click();
  const editor=original?page.getByRole('dialog',{name:'Dashboard visual grid editor'}):
    root.getByTestId('site-layout-editor');
  const canvas=original?LG_EDITOR:MODERN_EDITOR;
  await editor.locator(canvas).waitFor();
  for(const {label} of registry){
    const control=original?editor.getByRole('button',{name:new RegExp('^(Remove|Add) '+escapeRegExp(label)+'$')}):
      editor.getByRole('checkbox',{name:label,exact:true});
    assert.equal(await control.count(),1,'Missing panel library control for '+label);
  }
  const capture=await captureDashboard(page,editor,null,OUTPUT,
    implementation+'-'+role+'-editor-'+size,{viewportOnly:original});
  const first=registry.find(record=>!record.optional);
  if(original){
    const lock=editor.getByRole('button',{name:'Lock '+first.label,exact:true});
    await lock.click();
    await editor.getByRole('button',{name:'Unlock '+first.label,exact:true}).waitFor();
    await editor.getByRole('button',{name:'Apply Changes',exact:true}).click();
    await editor.waitFor({state:'detached'});
    await trigger.click();
    await editor.getByRole('button',{name:'Unlock '+first.label,exact:true}).waitFor();
    await editor.getByRole('button',{name:'Cancel layout changes'}).click();
  }
  return {capture,panels:registry.map(({id,label,optional})=>({id,label,optional:Boolean(optional)}))};
}

function escapeRegExp(text){return text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}

async function recordOverview(page,implementation,role,size){
  const {root,navSelector}=dashboardFor(page,implementation,role);
  if(implementation!=='original'||role!=='gm'){
    const portrait=root.locator('img[src*="cavern-sprite-male-adult"]').first();
    await portrait.waitFor({state:'attached'});
    await portrait.evaluate(image=>image.decode());
  }
  return captureDashboard(page,root,navSelector,OUTPUT,[implementation,role,size].join('-'));
}

function navComparison(original,react,role){
  const full=original.map(tab=>tab.label);
  assert.equal(full.length,role==='gm'?24:21);
  const expected=role==='readonly'?full.filter(label=>!PRIVATE_TABS.includes(label)):full;
  const modern=react.map(tab=>tab.label);
  assert.deepEqual(modern.slice(0,expected.length),expected,
    'React lost or reordered an original '+role+' navigation destination');
  return {original:full,react:modern,roleRestricted:full.filter(label=>!expected.includes(label)),
    additionalReact:modern.slice(expected.length)};
}

async function assertSavedLayout(page,role,panel,seed){
  await page.getByTestId('site-layout-open').click();
  const editor=page.getByTestId('site-layout-editor');
  await editor.getByTestId('site-layout-canvas').getByRole('button',{name:'Move '+panel.label,exact:true}).click();
  const background=editor.getByRole('region',{name:'Selected panel settings'}).locator('select');
  await background.selectOption('arcane');
  await editor.getByTestId('site-layout-undo').click();
  assert.equal(await background.inputValue(),'default');
  await editor.getByTestId('site-layout-redo').click();
  assert.equal(await background.inputValue(),'arcane');
  await editor.getByTestId('site-layout-save').click();
  await editor.waitFor({state:'detached'});
  await page.getByText('Dashboard layout saved.',{exact:true}).waitFor();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.getByTestId('site-'+role+'-layout-workspace').locator(
    '[data-panel-id="'+panel.id+'"][data-panel-background="arcane"]').waitFor();
  if(role==='gm'){
    const settings=await seed.read('users/'+uid('gm')+'/dashboardLayouts/gm-'+CAMPAIGN);
    assert.equal(settings.layout.panelBackgrounds[panel.id],'arcane');
  }else{
    for(const key of ['campaigns/'+CAMPAIGN+'/characters/'+CHARACTER,
      'users/'+uid('player')+'/characters/source-'+CHARACTER]){
      const record=await seed.read(key);
      assert.equal(record.dashboardPreferences.dashboardLayout.panelBackgrounds[panel.id],'arcane');
    }
  }
}

async function assertRealtime(browser,seed,registry){
  const player=await safelyOpenPage(browser,'desktop','react');
  const gm=await safelyOpenPage(browser,'desktop','react');
  const outsider=await safelyOpenPage(browser,'desktop','react');
  try{
    await Promise.all([signIn(player.page,'player'),signIn(gm.page,'gm'),signIn(outsider.page,'outsider')]);
    await Promise.all([openReact(player.page,'player'),openReact(gm.page,'gm')]);
    const bar=player.page.getByTestId('site-player-resources').locator('[data-resource="hp"] [role="progressbar"]');
    const mirror=gm.page.getByTestId('site-gm-party-sidebar').locator('[data-resource="hp"] [role="progressbar"]').first();
    assert.equal(await bar.getAttribute('aria-valuenow'),'74');
    await player.page.getByRole('button',{name:'Increase HP',exact:true}).click();
    await player.page.waitForFunction(()=>document.querySelector(
      '[data-testid="site-player-resources"] [data-resource="hp"] [role="progressbar"]')
      ?.getAttribute('aria-valuenow')==='75');
    await mirror.and(gm.page.locator('[aria-valuenow="75"]')).waitFor();
    const character='campaigns/'+CAMPAIGN+'/characters/'+CHARACTER;
    assert.equal((await seed.read(character)).hp[0],75);
    assert.equal((await seed.read('users/'+uid('player')+'/characters/source-'+CHARACTER)).hp[0],75);
    for(const campaign of Object.values(CAMPAIGNS)){
      for(const role of ['gm','player']){
        await outsider.page.goto(REACT_ORIGIN+'/'+route(role,campaign),{waitUntil:'domcontentloaded'});
        await outsider.page.getByTestId('site-'+role+'-error').waitFor();
        assert.equal(await outsider.page.getByTestId('site-'+role+'-hero').count(),0);
      }
    }
    await assertSavedLayout(player.page,'player',registry.player[0],seed);
    await assertSavedLayout(gm.page,'gm',registry.gm[0],seed);
    await openReact(player.page,'player',CAMPAIGNS[1]);
    await openReact(gm.page,'gm',CAMPAIGNS[1]);
    await openReact(gm.page,'readonly',CAMPAIGNS[1]);
    player.results();gm.results();outsider.results();
    return {ownerUpdate:'74 → 75 HP in shared and source documents',
      realtimeGM:'observed 75 HP in a separate authenticated context',
      outsider:'denied both dashboard routes in V1 and V2',
      savedLayouts:'Player shared and source layout plus private GM campaign layout read after reload',
      membershipV1:'GM, linked owner and GM read-only routes verified'};
  }finally{await Promise.all([player.context.close(),gm.context.close(),outsider.context.close()]);}
}

async function main(){
  const children=[],temporary=await fs.mkdtemp(path.join(os.tmpdir(),'asteria-dashboard-original-'));
  const authOutput=AUTH_OUTPUT||(APPROVED_CASES?path.join(temporary,'auth'):null);
  let browser,seed;
  try{
    await fs.mkdir(OUTPUT,{recursive:true});
    const originalPath=await extractOriginal(temporary);
    await Promise.all([
      startServer(children,originalPath,['scripts/local-static-server.js','8129'],LEGACY_ORIGIN),
      startServer(children,ROOT,['node_modules/vite/bin/vite.js','preview','--config','vite.site.config.mjs'],REACT_ORIGIN)
    ]);
    browser=await chromium.launch(browserLaunchOptions());
    const {DASHBOARD_PANEL_REGISTRY}=await import('../src/state/dashboardLayoutModel.mjs');
    const {DASHBOARD_PANEL_REGISTRY:originalRegistry}=await import(path.join(originalPath,'src/state/dashboardLayoutModel.mjs'));
    assert.deepEqual(Object.keys(originalRegistry).map(role=>originalRegistry[role].length),[24,20]);
    for(const role of ['player','gm']){
      assert.deepEqual(DASHBOARD_PANEL_REGISTRY[role].map(record=>record.id),
        originalRegistry[role].map(record=>record.id));
    }
    const manifest=await fs.readFile(path.join(ROOT,'frontend-dist','.vite','manifest.json'));
    const report={originalRevision:ORIGINAL_REVISION,reactWorktreeHead:git('rev-parse','HEAD'),
      reactBuildManifestSha256:createHash('sha256').update(manifest).digest('hex'),
      browser:browser.version(),viewports:VIEWPORTS,productionAccessed:false,
      originalFixtureGitBlob:git('hash-object','src/devFixtures.js'),cases:[],interactions:{}};
    const candidateManifest={cases:[]};
    for(const size of Object.keys(VIEWPORTS)){
      for(const role of ROLES){
        const old=await safelyOpenPage(browser,size,'original');
        const react=await safelyOpenPage(browser,size,'react');
        try{
          console.log('Capturing '+role+' '+size);
          await openOriginal(old.page,role);
          if(!seed)seed=await seedDashboardEmulators(await readOriginalScenario(old.page),LEGACY_ORIGIN);
          await signIn(react.page,role==='readonly'?'gm':role);
          await openReact(react.page,role);
          if(size==='desktop')await saveAuth(react.context,role,authOutput);
          const original=await recordOverview(old.page,'original',role,size);
          const current=await recordOverview(react.page,'react',role,size);
          const oldTabs=await recordNavigation(old.page,'original',role,size);
          const newTabs=await recordNavigation(react.page,'react',role,size);
          const navigation=navComparison(oldTabs,newTabs,role);
          const editors=role==='readonly'?null:{
            original:await recordEditor(old.page,'original',role,size,originalRegistry[role]),
            react:await recordEditor(react.page,'react',role,size,DASHBOARD_PANEL_REGISTRY[role])
          };
          report.cases.push({role,size,original,current,navigation,oldTabs,newTabs,editors,
            network:{original:old.results(),react:react.results()}});
          candidateManifest.cases.push({name:role+'-'+size,role,...VIEWPORTS[size],
            selector:'[data-testid="site-'+(role==='gm'?'gm':'player')+'-dashboard"]',
            url:REACT_ORIGIN+'/'+route(role),legacyRevision:ORIGINAL_REVISION,fixedTime:NOW,
            reference:original.screenshot,referenceSha256:original.sha256});
        }finally{await Promise.all([old.context.close(),react.context.close()]);}
      }
    }
    const manifestPath=path.join(OUTPUT,'candidate-references.json');
    await fs.writeFile(manifestPath,JSON.stringify(candidateManifest,null,2)+'\n');
    report.referenceReadiness=auditReferences(manifestPath);
    assert.equal(report.referenceReadiness.verifiedReferences,6);
    assert.equal(report.referenceReadiness.status,'blocked');
    assert.ok(report.referenceReadiness.blockers.every(reason=>reason.endsWith('approver must be identified.')));
    if(APPROVED_CASES){
      execFileSync(process.execPath,[path.join(__dirname,'site-dashboard-approved-screenshot-parity.cjs')],{
        stdio:'inherit',env:{...process.env,ASTERIA_PARITY_CASES:APPROVED_CASES,
          ASTERIA_PARITY_AUTH_DIR:authOutput,ASTERIA_PARITY_OUTPUT:path.join(OUTPUT,'strict-comparison')}
      });
    }
    report.interactions=await assertRealtime(browser,seed,DASHBOARD_PANEL_REGISTRY);
    await fs.writeFile(path.join(OUTPUT,'dashboard-baselines.json'),JSON.stringify(report,null,2)+'\n');
    console.log('PASS: six dashboard pairs, 21 Player tabs, 24 GM tabs, 44 panel controls, layout edits and emulator role/realtime checks.');
    console.log('Candidate references and metric evidence: '+OUTPUT+' (screenshot approvals pending)');
  }finally{
    for(const server of children)server.kill();
    await browser?.close();
    await seed?.close();
    await fs.rm(temporary,{recursive:true,force:true});
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
