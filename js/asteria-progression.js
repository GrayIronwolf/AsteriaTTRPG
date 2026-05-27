/* Asteria progression rules.
   Owns XP thresholds, level rewards, and compatibility globals for the static app. */
(function(){
  const LEVEL_CAP = 100;
  const CP_PER_LEVEL = 3;
  const TP_PER_LEVEL = 3;
  const MAJOR_MILESTONE_INTERVAL = 10;
  const MAJOR_MILESTONE_TP = 10;

  function allCharacters(){
    return window.chars || {};
  }

  function xpToNextLevel(level){
    level = Number(level || 0);
    if(level <= 9) return (level + 1) * 5000;
    if(level <= 19) return 60000 + (level - 10) * 10000;
    if(level <= 29) return 180000 + (level - 21) * 15000;
    if(level <= 39) return 340000 + (level - 31) * 20000;
    if(level <= 49) return 550000 + (level - 41) * 25000;
    if(level <= 59) return 810000 + (level - 51) * 30000;
    if(level <= 69) return 1120000 + (level - 61) * 35000;
    if(level <= 79) return 1480000 + (level - 71) * 40000;
    if(level <= 89) return 1890000 + (level - 81) * 45000;
    if(level <= 99) return 2350000 + (level - 91) * 50000;
    return Infinity;
  }

  function normalizeCharacter(character){
    if(!character) return null;
    character.level = Number(character.level || 0);
    character.xp = Math.max(0, Number(character.xp || 0));
    character.cp = Number(character.cp || 0);
    character.tp = Number(character.tp || 0);
    if(character.pendingSkillChoices === undefined) character.pendingSkillChoices = 0;
    character.xpMax = xpToNextLevel(character.level);
    return character;
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

    while(c.level < LEVEL_CAP && c.xp >= xpToNextLevel(c.level)){
      const need = xpToNextLevel(c.level);
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

  function checkLevelUp(id){
    const c = allCharacters()[id];
    const result = applyLevelUps(c);
    if(c && result.leveled){
      window.addCombatLog?.(`${c.name} reached Level ${c.level}.`, 'important');
      window.feedback?.(`LEVEL UP: ${c.name}`, 'level');
      window.showLevelModal?.(c, result);
    }
    return result;
  }

  function showMilestoneChoice(){
    window.toast?.('Skill choices have been removed from this version.');
  }

  window.AsteriaProgression = {
    xpToNextLevel,
    normalizeCharacter,
    ensureProgressionData,
    applyLevelUps,
    checkLevelUp,
    showMilestoneChoice
  };

  window.xpToNextLevel = xpToNextLevel;
  window.ensureProgressionData = ensureProgressionData;
  window.checkLevelUp = checkLevelUp;
  window.showMilestoneChoice = showMilestoneChoice;
})();
