/* Asteria progression rules.
   Owns XP thresholds, level rewards, and compatibility globals for the static app. */
(function(){
  const LEVEL_CAP = 100;
  const CP_PER_LEVEL = 3;
  const TP_PER_LEVEL = 3;
  const MAJOR_MILESTONE_INTERVAL = 10;
  const MAJOR_MILESTONE_TP = 10;

  const XP_TO_NEXT_BY_LEVEL = [
    1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000,
    12000, 14000, 16000, 18000, 20000, 22000, 24000, 26000, 28000, 30000,
    33000, 36000, 39000, 42000, 45000, 48000, 51000, 54000, 57000, 60000,
    64000, 68000, 72000, 76000, 80000, 84000, 88000, 92000, 96000, 100000,
    105000, 110000, 115000, 120000, 125000, 130000, 135000, 140000, 145000, 150000,
    156000, 162000, 168000, 174000, 180000, 186000, 192000, 198000, 204000, 210000,
    217000, 224000, 231000, 238000, 245000, 252000, 259000, 266000, 273000, 280000,
    288000, 296000, 304000, 312000, 320000, 328000, 336000, 344000, 352000, 360000,
    369000, 378000, 388000, 397000, 406000, 415000, 424000, 433000, 442000, 451000,
    461000, 471000, 481000, 491000, 501000, 511000, 521000, 531000, 541000, 551000,
    null
  ];

  function allCharacters(){
    return window.chars || {};
  }

  function normalizeLevel(level){
    const value = Number(level);
    if(!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(LEVEL_CAP, Math.floor(value)));
  }

  function xpToNextLevel(level){
    const normalized = normalizeLevel(level);
    const threshold = XP_TO_NEXT_BY_LEVEL[normalized];
    return threshold == null ? Infinity : threshold;
  }

  function normalizeCharacter(character){
    if(!character) return null;
    character.level = normalizeLevel(character.level);
    character.xp = Math.max(0, Math.floor(Number(character.xp || 0)));
    character.cp = Math.max(0, Math.floor(Number(character.cp || 0)));
    character.tp = Math.max(0, Math.floor(Number(character.tp || 0)));
    if(character.pendingSkillChoices === undefined) character.pendingSkillChoices = 0;
    character.xpMax = xpToNextLevel(character.level);
    if(character.level >= LEVEL_CAP){
      character.xp = 0;
      character.xpMax = Infinity;
    }
    return character;
  }

  function progressSummary(character){
    const c = normalizeCharacter(character);
    if(!c) return { level:0, xp:0, xpMax:xpToNextLevel(0), percent:0, capped:false, label:'0 / 1,000 XP' };
    const xpMax = xpToNextLevel(c.level);
    const capped = !Number.isFinite(xpMax);
    const percent = capped ? 100 : Math.max(0, Math.min(100, (c.xp / xpMax) * 100));
    return {
      level:c.level,
      xp:c.xp,
      xpMax,
      percent,
      capped,
      label:capped ? 'Level Cap' : `${c.xp.toLocaleString()} / ${xpMax.toLocaleString()} XP`
    };
  }

  function ensureProgressionData(id){
    const characters = allCharacters();
    if(id) return normalizeCharacter(characters[id]);
    Object.values(characters).forEach(normalizeCharacter);
    return characters;
  }

  function applyLevelUps(character){
    const c = normalizeCharacter(character);
    if(!c) return { leveled: false, levels: 0, messages: [], bonusTP: false, skillChoice: false };

    const fromLevel = c.level;
    const messages = [];
    let bonusTP = false;

    while(c.level < LEVEL_CAP){
      const need = xpToNextLevel(c.level);
      if(!Number.isFinite(need) || c.xp < need) break;
      c.xp -= need;
      c.level += 1;
      c.cp += CP_PER_LEVEL;
      c.tp += TP_PER_LEVEL;
      messages.push(`Reached Level ${c.level}: +${CP_PER_LEVEL} CP and +${TP_PER_LEVEL} TP.`);

      if(c.level % MAJOR_MILESTONE_INTERVAL === 0){
        c.tp += MAJOR_MILESTONE_TP;
        bonusTP = true;
        messages.push(`Major milestone: +${MAJOR_MILESTONE_TP} bonus TP.`);
      }
    }

    if(c.level >= LEVEL_CAP) c.xp = 0;
    c.xpMax = xpToNextLevel(c.level);
    return {
      leveled: c.level > fromLevel,
      levels: c.level - fromLevel,
      fromLevel,
      toLevel: c.level,
      messages,
      bonusTP,
      skillChoice: false
    };
  }

  function grantXP(character, amount){
    const c = normalizeCharacter(character);
    if(!c) return { leveled:false, levels:0, messages:[], bonusTP:false, skillChoice:false, amount:0 };
    const delta = Math.floor(Number(amount || 0));
    c.xp = Math.max(0, c.xp + delta);
    const result = applyLevelUps(c);
    result.amount = delta;
    return result;
  }

  function checkLevelUp(id){
    const c = allCharacters()[id];
    const result = applyLevelUps(c);
    if(c && result.leveled){
      window.addCombatLog?.(`${c.name} reached Level ${c.level}.`, 'important');
      const playerOpen=typeof document!=='undefined'&&document.getElementById('player')?.classList.contains('show');
      const isActivePlayer=window.session?.role==='player'&&window.session?.character===id&&playerOpen;
      if(isActivePlayer){
        window.feedback?.(`LEVEL UP: ${c.name}`, 'level');
        window.showLevelModal?.(c, result);
      }
    }
    return result;
  }

  function showMilestoneChoice(){
    window.toast?.('Skill choices have been removed from this version.');
  }

  window.AsteriaProgression = {
    LEVEL_CAP,
    XP_TO_NEXT_BY_LEVEL,
    xpToNextLevel,
    normalizeCharacter,
    progressSummary,
    ensureProgressionData,
    applyLevelUps,
    grantXP,
    checkLevelUp,
    showMilestoneChoice
  };

  window.xpToNextLevel = xpToNextLevel;
  window.ensureProgressionData = ensureProgressionData;
  window.checkLevelUp = checkLevelUp;
  window.showMilestoneChoice = showMilestoneChoice;

  window.AsteriaViewHooks?.beforePlayerLoad?.('xp-system-v2-normalize-player', id => ensureProgressionData(id), {defer:false});
  window.AsteriaViewHooks?.beforeGMPlayerRender?.('xp-system-v2-normalize-gm-player', id => ensureProgressionData(id), {defer:false});
  window.AsteriaViewHooks?.afterGMRender?.('xp-system-v2-normalize-gm', () => ensureProgressionData());
  window.document?.addEventListener?.('DOMContentLoaded', () => ensureProgressionData());
})();
