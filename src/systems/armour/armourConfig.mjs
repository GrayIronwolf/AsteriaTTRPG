export const ITEM_QUALITY_AC_MODIFIERS = Object.freeze({
  trash: -6,
  poor: -3,
  average: 0,
  wellCrafted: 1,
  exceptional: 2,
  superb: 3,
  exquisite: 4,
  masterwork: 5
});

export const ITEM_QUALITY_RANKS = Object.freeze({
  trash: 1,
  poor: 2,
  average: 3,
  wellCrafted: 4,
  exceptional: 5,
  superb: 6,
  exquisite: 7,
  masterwork: 8
});

export const ARMOUR_TYPES = Object.freeze({
  cloth: Object.freeze({ id:'cloth', name:'Cloth', maxPieces:6, setBonusAC:0, mobilityModifier:5, stealthModifier:4 }),
  leather: Object.freeze({ id:'leather', name:'Leather', maxPieces:4, setBonusAC:1, mobilityModifier:2, stealthModifier:3 }),
  lightArmour: Object.freeze({ id:'lightArmour', name:'Light Armour', maxPieces:6, setBonusAC:2, mobilityModifier:1, stealthModifier:1 }),
  mediumArmour: Object.freeze({ id:'mediumArmour', name:'Medium Armour', maxPieces:8, setBonusAC:3, mobilityModifier:-1, stealthModifier:-2 }),
  heavyArmour: Object.freeze({ id:'heavyArmour', name:'Heavy Armour', maxPieces:10, setBonusAC:4, mobilityModifier:-5, stealthModifier:-4 })
});

const piece = (id, name, percentile, location, aliases = []) => Object.freeze({ id, name, percentile, location, aliases:Object.freeze(aliases) });

export const ARMOUR_PIECES = Object.freeze({
  cuirass:piece('cuirass','Cuirass',1,'Torso'),
  breastplate:piece('breastplate','Breastplate',0.5,'Torso'),
  plackart:piece('plackart','Plackart',0.5,'Torso'),
  brigandineJacket:piece('brigandineJacket','Brigandine Jacket',0.9,'Torso'),
  chainmailHauberk:piece('chainmailHauberk','Chainmail Hauberk',0.45,'Torso'),
  scaleMailHauberk:piece('scaleMailHauberk','Scale Mail Hauberk',0.5,'Torso'),
  chainmailHaubergeon:piece('chainmailHaubergeon','Chainmail Haubergeon',0.4,'Torso'),
  scaleMailHaubergeon:piece('scaleMailHaubergeon','Scale Mail Haubergeon',0.45,'Torso'),
  vest:piece('vest','Vest',0.2,'Torso'),
  lamellarCuirass:piece('lamellarCuirass','Lamellar Cuirass',0.95,'Torso'),
  gambeson:piece('gambeson','Gambeson (Padded)',0.4,'Torso',['Gambeson','Padded Gambeson']),

  helm:piece('helm','Helm',0.5,'Head'),
  greathelm:piece('greathelm','Greathelm',0.6,'Head',['Great Helm']),
  halfHelm:piece('halfHelm','Half-Helm',0.35,'Head',['Half Helm']),
  chainmailCoif:piece('chainmailCoif','Chainmail Coif',0.25,'Neck'),
  scaleMailCoif:piece('scaleMailCoif','Scale Mail Coif',0.3,'Neck'),
  chainmailBishopsMantle:piece('chainmailBishopsMantle',"Chainmail Bishop's Mantle",0.15,'Neck',['Chainmail Bishop Mantle']),
  scaleMailBishopsMantle:piece('scaleMailBishopsMantle',"Scale Mail Bishop's Mantle",0.2,'Neck',['Scale Mail Bishop Mantle']),
  gorget:piece('gorget','Gorget',0.25,'Neck'),
  cap:piece('cap','Cap',0.1,'Head'),

  pauldron:piece('pauldron','Pauldron',0.2,'Shoulders'),
  spaulder:piece('spaulder','Spaulder',0.15,'Shoulders'),
  rerebrace:piece('rerebrace','Rerebrace',0.15,'Upper Arms'),
  couter:piece('couter','Couter',0.1,'Elbows'),
  vambrace:piece('vambrace','Vambrace',0.15,'Forearms'),
  bracer:piece('bracer','Bracer',0.1,'Forearms'),
  gauntlet:piece('gauntlet','Gauntlet',0.15,'Hands'),
  heavyGauntlet:piece('heavyGauntlet','Heavy Gauntlet',0.2,'Hands'),

  fauld:piece('fauld','Fauld',0.25,'Waist / Hips'),
  tasset:piece('tasset','Tasset',0.2,'Upper Legs'),
  chainmailChausses:piece('chainmailChausses','Chausses (Chainmail)',0.45,'Upper Legs',['Chainmail Chausses']),
  scaleMailChausses:piece('scaleMailChausses','Chausses (Scale Mail)',0.5,'Upper Legs',['Scale Mail Chausses']),
  culet:piece('culet','Culet',0.15,'Rear / Hips'),
  poleyn:piece('poleyn','Poleyn',0.1,'Knees'),
  greave:piece('greave','Greave',0.2,'Lower Legs',['Greaves']),
  sabaton:piece('sabaton','Sabaton',0.15,'Feet',['Sabatons']),
  boots:piece('boots','Boots',0.1,'Feet'),
  armouredBoot:piece('armouredBoot','Armoured Boot',0.15,'Feet',['Armoured Boots','Armored Boot','Armored Boots']),

  buckler:piece('buckler','Buckler',0.25,'Off-Hand'),
  roundShield:piece('roundShield','Round Shield',0.5,'Off-Hand'),
  heaterShield:piece('heaterShield','Heater Shield',0.55,'Off-Hand'),
  kiteShield:piece('kiteShield','Kite Shield',0.6,'Off-Hand'),
  towerShield:piece('towerShield','Tower Shield',0.8,'Off-Hand')
});

export const ARMOUR_LOCATIONS = Object.freeze([
  'Head','Neck','Torso','Shoulders','Upper Arms','Elbows','Forearms','Hands',
  'Waist / Hips','Upper Legs','Rear / Hips','Knees','Lower Legs','Feet','Off-Hand','Accessories'
]);

export const EQUIPMENT_LOCATION_ALIASES = Object.freeze({
  head:['head','helmet'],
  neck:['neck','coif','amulet'],
  torso:['torso','chest','chest armor','chest armour'],
  shoulders:['shoulders','shoulder'],
  'upper arms':['upper arms','upper arm'],
  elbows:['elbows','elbow'],
  forearms:['forearms','forearm'],
  hands:['hands','hand','gloves'],
  'waist / hips':['waist / hips','waist','hips','hip','belt'],
  'upper legs':['upper legs','upper leg','legs','leg armor','leg armour'],
  'rear / hips':['rear / hips','rear','culet'],
  knees:['knees','knee'],
  'lower legs':['lower legs','lower leg'],
  feet:['feet','foot','boots'],
  'off-hand':['off-hand','off hand','shield'],
  accessories:['accessories','accessory','ring','charm']
});

