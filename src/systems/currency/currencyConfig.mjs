const CURRENCY_ASSET_ROOT = 'assets/currency';

export const ASTERIA_CURRENCIES = Object.freeze([
  {
    id:'copper',
    name:'Penny',
    material:'Copper',
    label:'Penny (Copper)',
    storageKey:'copper',
    image:`${CURRENCY_ASSET_ROOT}/penny-copper.png`,
    aliases:['copper', 'penny', 'pennies', 'copperpenny', 'copperpennies', 'pennycopper']
  },
  {
    id:'silver',
    name:'Mark',
    material:'Silver',
    label:'Mark (Silver)',
    storageKey:'silver',
    image:`${CURRENCY_ASSET_ROOT}/mark-silver.png`,
    aliases:['silver', 'mark', 'marks', 'silvermark', 'silvermarks', 'marksilver']
  },
  {
    id:'gold',
    name:'Crown',
    material:'Gold',
    label:'Crown (Gold)',
    storageKey:'gold',
    image:`${CURRENCY_ASSET_ROOT}/crown-gold.png`,
    aliases:['gold', 'crown', 'crowns', 'goldcrown', 'goldcrowns', 'crowngold']
  },
  {
    id:'platinum-crown',
    name:'Platinum Crown',
    material:'Platinum',
    label:'Platinum Crown (Platinum)',
    storageKey:'platinum_crown',
    image:`${CURRENCY_ASSET_ROOT}/platinum-crown.png`,
    aliases:['platinum', 'platinumcrown', 'platinumcrowns', 'crownplatinum']
  },
  {
    id:'royal-crown',
    name:'Royal Crown',
    material:'',
    label:'Royal Crown',
    storageKey:'royal_crown',
    image:`${CURRENCY_ASSET_ROOT}/royal-crown.png`,
    aliases:['royalcrown', 'royalcrowns']
  },
  {
    id:'royal-platinum',
    name:'Royal Platinum',
    material:'',
    label:'Royal Platinum',
    storageKey:'royal_platinum',
    image:`${CURRENCY_ASSET_ROOT}/royal-platinum.png`,
    aliases:['royalplatinum', 'royalplatinums']
  }
]);

const CURRENCY_BY_ALIAS = new Map(
  ASTERIA_CURRENCIES.flatMap(currency => currency.aliases.map(alias => [alias, currency]))
);

export function compactCurrencyKey(value) {
  return String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function currencyDefinitionFor(value) {
  return CURRENCY_BY_ALIAS.get(compactCurrencyKey(value)) || null;
}
