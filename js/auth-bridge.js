/* =========================
   Asteria Auth + Workspace Dashboard System v1
   Lets Firebase auth talk safely to the existing Asteria app state.
   ========================= */
(function(){
  function safe(fn){ try{return fn()}catch(e){ console.warn('[AsteriaAuthBridge]', e); } }
  function isLoggedIn(){
    return ['account','player','gm'].includes(window.session?.role) || Boolean(window.session?.uid || window.session?.email);
  }
  function updateTopButtons(){
    const login = document.getElementById('loginToggle');
    const create = document.getElementById('createAccountTop');
    if(!login || !create) return;
    if(isLoggedIn()){
      login.textContent = 'Dashboard';
      login.onclick = event => {
        event?.preventDefault?.();
        window.AsteriaWorkspace?.openDashboard?.('dashboard');
      };
      create.textContent = 'Log Out';
      create.onclick = event => {
        event?.preventDefault?.();
        window.logout?.();
      };
    } else {
      login.textContent = 'Login';
      login.onclick = event => {
        event?.preventDefault?.();
        window.setView?.('loginPage');
      };
      create.textContent = 'Create Account';
      create.onclick = event => {
        event?.preventDefault?.();
        window.setView?.('accountCreate');
      };
    }
  }
  function ensureAccountCache(accountKey, profile, firebaseUser){
    window.loadAccountState?.();
    window.accountUsers = window.accountUsers || {};
    window.accountUsers[accountKey] = window.accountUsers[accountKey] || { characters: [] };
    window.accountUsers[accountKey].email = firebaseUser?.email || profile?.email || '';
    window.accountUsers[accountKey].username = profile?.username || firebaseUser?.displayName || firebaseUser?.email || accountKey;
    window.accountUsers[accountKey].uid = accountKey;
    if(Array.isArray(profile?.characters)) window.accountUsers[accountKey].characters = Array.from(new Set(profile.characters));
    window.saveAccountState?.();
    return window.accountUsers[accountKey];
  }
  function ensureTestCharacter(uid){
    window.chars = window.chars || {};
    const id = 'test-character';
    const existing = Object.keys(window.chars).find(charId => window.chars[charId]?.ownerUid === uid) || (window.chars[id] ? id : '');
    if(existing){
      window.chars[existing].ownerUid = uid;
      return existing;
    }
    window.chars[id] = {
      id,
      initial:'T',
      name:'Test Character',
      race:'Human',
      klass:'Adventurer',
      age:'',
      ownerUid:uid,
      level:1,
      hp:[10,10],
      sp:[10,10],
      mp:[10,10],
      xp:0,
      xpMax:5000,
      campaign:'Test Campaign',
      session:'No active session',
      conditions:[],
      cp:0,
      tp:0,
      resourceMods:{ hp:0, sp:0, mp:0 },
      characteristics:{ strength:10, dexterity:10, agility:10, constitution:10, endurance:10, intelligence:10, wisdom:10, charisma:10, luck:10 },
      inventory:[]
    };
    return id;
  }
  function ensureTestCampaign(uid, characterId){
    window.campaigns = window.campaigns || [];
    const now = new Date().toISOString();
    let campaign = window.campaigns.find(item => item.id === 'test-campaign');
    if(!campaign){
      campaign = {
        id:'test-campaign',
        name:'Test Campaign',
        description:'Local development campaign for dashboard testing.',
        party:[],
        partySize:4,
        access:{ dashboard:true, inventory:true, spells:true, journal:true, quests:true, notes:false },
        inviteCode:'test-invite',
        inviteLink:'',
        createdAt:now,
        activity:['Test campaign created.']
      };
      window.campaigns.push(campaign);
    }
    Object.assign(campaign, {
      gmId:uid,
      ownerUid:uid,
      ownerAccount:uid,
      createdBy:'Test Account',
      gmUids:Array.from(new Set([...(campaign.gmUids || []), uid])),
      playerUids:Array.from(new Set([...(campaign.playerUids || []), uid])),
      roles:Object.assign({}, campaign.roles || {}, { [uid]:'gm' }),
      players:Object.assign({}, campaign.players || {}),
      characters:Object.assign({}, campaign.characters || {}),
      chat:campaign.chat || { messages:[] },
      guildBank:campaign.guildBank || {
        coins:{ copper:0, silver:0, gold:0, platinum_crown:0, royal_crown:0, royal_platinum:0 },
        items:[],
        transactions:[]
      },
      settings:Object.assign({
        partySize:campaign.partySize || 4,
        visibility:'private',
        inviteRequired:true,
        allowPlayerCreateCharacter:true,
        allowPlayerLinkCharacter:true
      }, campaign.settings || {})
    });
    campaign.party = Array.from(new Set([...(campaign.party || []), characterId]));
    campaign.players[uid] = Object.assign({ uid, role:'gm', status:'active', characterIds:[], joinedAt:now }, campaign.players[uid] || {});
    campaign.players[uid].role = 'gm';
    campaign.players[uid].characterIds = Array.from(new Set([...(campaign.players[uid].characterIds || []), characterId]));
    campaign.characters[characterId] = {
      id:characterId,
      ownerUid:uid,
      name:window.chars?.[characterId]?.name || characterId,
      status:'linked',
      linkedAt:now
    };
    const base = String(window.location?.href || '').split('#')[0] || 'index.html';
    campaign.inviteLink = `${base}#/join/${campaign.id}/${campaign.inviteCode}`;
    window.activeCampaign = Math.max(0, window.campaigns.findIndex(item => item.id === campaign.id));
    if(window.chars?.[characterId]) window.chars[characterId].campaign = campaign.name;
    return campaign;
  }
  function saveTestState(uid, characterId){
    window.loadAccountState?.();
    window.accountUsers = window.accountUsers || {};
    window.accountUsers[uid] = Object.assign({}, window.accountUsers[uid] || {}, {
      uid,
      email:'test@asteria.local',
      username:'Test Account',
      characters:Array.from(new Set([...(window.accountUsers[uid]?.characters || []), characterId]))
    });
    window.saveAccountState?.();
    window.saveAsteriaState?.();
  }
  window.AsteriaAuthBridge = {
    setSession(profile, firebaseUser){
      safe(()=>{
        const accountKey = firebaseUser?.uid || profile?.uid || profile?.email || 'firebase-user';
        const displayName = profile?.username || firebaseUser?.displayName || firebaseUser?.email || accountKey;
        const account = ensureAccountCache(accountKey, profile, firebaseUser);
        session = {
          role:'account',
          user:displayName,
          account:accountKey,
          uid:accountKey,
          email:firebaseUser?.email || profile?.email || '',
          profile:profile || {},
          character:(account.characters || [])[0] || null
        };
        document.body.dataset.role = 'account';
        selected = session.character || selected;
        const access = document.getElementById('accessSummary');
        if(access) access.textContent = `Signed in as ${firebaseUser?.email || displayName}. Campaign permissions are assigned per campaign.`;
        updateRoleLocks?.();
        updateTopButtons();
        if(window.AsteriaWorkspace?.openDashboard) window.AsteriaWorkspace.openDashboard('dashboard');
        else window.__asteriaOpenDashboardOnReady = true;
      });
    },
    importCharacters(accountKey, list){
      safe(()=>{
        window.loadAccountState?.();
        window.accountUsers = window.accountUsers || {};
        window.accountUsers[accountKey] = window.accountUsers[accountKey] || { characters: [] };
        list.forEach(record=>{
          const id = record.id || normaliseId(record.name || 'character');
          chars[id] = Object.assign(chars[id] || {}, record, { id });
          if(!window.accountUsers[accountKey].characters.includes(id)) window.accountUsers[accountKey].characters.push(id);
        });
        saveAccountState?.(); saveAsteriaState?.(); renderPlayerHome?.();
      });
    },
    exportCharacter(id){ return safe(()=> chars[id] ? JSON.parse(JSON.stringify(Object.assign({id}, chars[id]))) : null); },
    getSession(){ return safe(()=> JSON.parse(JSON.stringify(session || {}))) || {}; },
    isLoggedIn,
    updateTopButtons,
    logoutLocal(){
      safe(()=>{
        session={role:'guest',character:null,account:null,uid:null,email:null};
        document.body.dataset.role='guest';
        updateRoleLocks();
        updateTopButtons();
        setView('home');
      });
    }
  };

  window.asteriaTestLogin = function(){
    safe(()=>{
      const uid = 'asteria-test-account';
      const characterId = ensureTestCharacter(uid);
      ensureTestCampaign(uid, characterId);
      saveTestState(uid, characterId);
      const profile = {
        uid,
        email:'test@asteria.local',
        username:'Test Account',
        firstName:'Test',
        lastName:'Account',
        role:'account',
        characters:[characterId]
      };
      const user = { uid, email:profile.email, displayName:profile.username };
      window.AsteriaAuthBridge.setSession(profile, user);
      window.session.character = characterId;
      window.selected = characterId;
      window.toast?.('Test account logged in.');
    });
  };

  // Wrap character creation so Firebase accounts can persist characters when Firestore is enabled.
  const oldCreateCharacterForAccount = window.createCharacterForAccount;
  window.createCharacterForAccount = function(){
    const before = new Set(Object.keys(chars || {}));
    oldCreateCharacterForAccount?.();
    const created = Object.keys(chars || {}).find(id=>!before.has(id));
    if(created && window.AsteriaFirebase?.saveCharacter){
      window.AsteriaFirebase.saveCharacter(created, window.AsteriaAuthBridge.exportCharacter(created));
    }
  };
  document.addEventListener('DOMContentLoaded', updateTopButtons);
})();
