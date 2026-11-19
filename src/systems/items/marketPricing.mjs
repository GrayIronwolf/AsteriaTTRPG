import '../../../js/asteria-market-pricing.js';

const pricing = globalThis.AsteriaMarketPricing;

if(!pricing) throw new Error('Asteria Market Pricing failed to initialise.');

export const {
  VERSION,
  MARKET_VALUE_KEYS,
  MARKET_PRICE_KEYS,
  LEGACY_VALUE_KEYS,
  LEGACY_PRICE_KEYS,
  MARK_TO_COPPER,
  parseMarketAmount,
  normalizeMarketPricing,
  stripLegacyPricingFields,
  validateMarketPricing,
  assertValidMarketPricing,
  createAsteriaItem,
  migrateLegacyItem,
  getMarketValue,
  getMarketPrice,
  getInventoryResaleValue,
  getPlayerPurchasePrice,
  getPlayerSaleValue,
  getPlayerPurchasePriceCopper,
  getPlayerSaleValueCopper,
  marksToCopper,
  copperToMarks,
  marketPricingStatus,
  formatMarks
} = pricing;

export default pricing;
