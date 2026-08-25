/* Asteria Market Pricing System.
   Canonical item pricing shared by React, Firebase, compendium, inventory,
   shops, loot, crafting, imports, and the remaining static compatibility UI. */
(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  root.AsteriaMarketPricing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const MARKET_VALUE_KEYS = ['marketValue', 'market_value', 'Market Value'];
  const MARKET_PRICE_KEYS = ['marketPrice', 'market_price', 'Market Price'];
  const LEGACY_VALUE_KEYS = ['sellingPrice', 'selling_price', 'Selling Price', 'value', 'baseValue', 'base_value'];
  const LEGACY_PRICE_KEYS = ['purchasePrice', 'purchase_price', 'Purchase Price'];
  const LEGACY_KEYS = [...LEGACY_VALUE_KEYS, ...LEGACY_PRICE_KEYS];
  const MARK_TO_COPPER = 100;

  function own(object, key){
    return Boolean(object && Object.prototype.hasOwnProperty.call(object, key));
  }

  function sources(item){
    if(!item || typeof item !== 'object') return [];
    return [item, item.metadata, item.raw, item.raw?.metadata].filter(value => value && typeof value === 'object');
  }

  function first(item, keys){
    for(const source of sources(item)) {
      for(const key of keys) {
        if(own(source, key) && source[key] !== undefined && source[key] !== '') {
          return { found:true, key, value:source[key] };
        }
      }
    }
    return { found:false, key:'', value:undefined };
  }

  function parseMarketAmount(input){
    if(input === null || input === undefined || input === '') {
      return { value:null, valid:true, ambiguous:false, sourceText:'' };
    }
    if(typeof input === 'number') {
      return { value:Number.isFinite(input) ? input : null, valid:Number.isFinite(input), ambiguous:false, sourceText:String(input) };
    }
    const sourceText = String(input).trim();
    const normalized = sourceText.replace(/,/g, '');
    const exact = normalized.match(/^([+-]?\d+(?:\.\d+)?)\s*(?:marks?|silver\s+marks?|copper|cp)?\s*$/i);
    if(exact) return { value:Number(exact[1]), valid:true, ambiguous:false, sourceText };
    const firstNumber = normalized.match(/[+-]?\d+(?:\.\d+)?/);
    if(firstNumber) return { value:Number(firstNumber[0]), valid:true, ambiguous:true, sourceText };
    return { value:null, valid:false, ambiguous:true, sourceText };
  }

  function stripLegacyPricingFields(record){
    const clean = { ...(record || {}) };
    [...MARKET_VALUE_KEYS, ...MARKET_PRICE_KEYS, ...LEGACY_KEYS].forEach(key => {
      if(!['marketValue', 'marketPrice'].includes(key)) delete clean[key];
    });
    if(clean.metadata && typeof clean.metadata === 'object') {
      clean.metadata = { ...clean.metadata };
      [...MARKET_VALUE_KEYS, ...MARKET_PRICE_KEYS, ...LEGACY_KEYS].forEach(key => delete clean.metadata[key]);
    }
    return clean;
  }

  function normalizeMarketPricing(item = {}, options = {}){
    const legacy = options.legacy !== false;
    const valueSource = first(item, MARKET_VALUE_KEYS);
    const legacyValueSource = valueSource.found ? valueSource : first(item, LEGACY_VALUE_KEYS);
    const priceSource = first(item, MARKET_PRICE_KEYS);
    const legacyPriceSource = priceSource.found ? priceSource : first(item, LEGACY_PRICE_KEYS);
    const valueParsed = parseMarketAmount(legacyValueSource.value);
    const priceParsed = parseMarketAmount(legacyPriceSource.value);
    const hadPricingInput = legacyValueSource.found || legacyPriceSource.found;
    const marketValue = valueParsed.value === null ? 0 : valueParsed.value;
    const marketPrice = priceParsed.value === null
      ? (legacy && (hadPricingInput || options.migratedRecord) ? null : 0)
      : priceParsed.value;
    const clean = options.removeLegacy === false ? { ...(item || {}) } : stripLegacyPricingFields(item);
    clean.marketValue = marketValue;
    clean.marketPrice = marketPrice;

    if(clean.metadata && typeof clean.metadata === 'object') {
      clean.metadata.marketValue = marketValue;
      clean.metadata.marketPrice = marketPrice;
    }

    const valueNeedsReview = legacyValueSource.found && (!valueParsed.valid || valueParsed.ambiguous);
    const priceNeedsReview = legacyPriceSource.found && (!priceParsed.valid || priceParsed.ambiguous);
    clean.pricingNeedsCompletion = marketPrice === null || valueNeedsReview || priceNeedsReview;
    if(valueNeedsReview && valueParsed.sourceText) clean.marketValueSourceText = valueParsed.sourceText;
    if(priceNeedsReview && priceParsed.sourceText) clean.marketPriceSourceText = priceParsed.sourceText;
    return clean;
  }

  function validateMarketPricing(item = {}, options = {}){
    const allowLegacyMissingPrice = options.allowLegacyMissingPrice === true;
    const normalized = normalizeMarketPricing(item, {
      legacy:allowLegacyMissingPrice,
      removeLegacy:false,
      migratedRecord:allowLegacyMissingPrice
    });
    const errors = [];
    const warnings = [];
    if(!Number.isFinite(normalized.marketValue)) errors.push('Market Value must be a number.');
    else if(normalized.marketValue < 0) errors.push('Market Value cannot be negative.');
    if(normalized.marketPrice === null) {
      if(allowLegacyMissingPrice) warnings.push('Market Price needs completion.');
      else errors.push('Market Price is required.');
    } else if(!Number.isFinite(normalized.marketPrice)) errors.push('Market Price must be a number.');
    else if(normalized.marketPrice < 0) errors.push('Market Price cannot be negative.');
    if(Number.isFinite(normalized.marketValue) && Number.isFinite(normalized.marketPrice) &&
      normalized.marketValue > 0 && normalized.marketPrice > 0 && normalized.marketValue >= normalized.marketPrice) {
      errors.push('Market Value must be lower than Market Price.');
    }
    if(normalized.pricingNeedsCompletion && normalized.marketPrice !== null) warnings.push('Legacy pricing text needs numeric review.');
    return {
      valid:errors.length === 0,
      complete:errors.length === 0 && warnings.length === 0 && normalized.marketPrice !== null,
      errors,
      warnings,
      marketValue:normalized.marketValue,
      marketPrice:normalized.marketPrice,
      item:normalized
    };
  }

  function assertValidMarketPricing(item = {}, options = {}){
    const validation = validateMarketPricing(item, options);
    if(!validation.valid) {
      const error = new Error(validation.errors[0] || 'Invalid market pricing.');
      error.code = 'ASTERIA_INVALID_MARKET_PRICING';
      error.validation = validation;
      throw error;
    }
    return validation.item;
  }

  function createAsteriaItem(item = {}, options = {}){
    const normalized = normalizeMarketPricing(item, {
      legacy:options.legacy === true,
      removeLegacy:true,
      migratedRecord:options.legacy === true
    });
    return assertValidMarketPricing(normalized, { allowLegacyMissingPrice:options.allowLegacyMissingPrice === true });
  }

  function migrateLegacyItem(item = {}){
    return normalizeMarketPricing(item, { legacy:true, removeLegacy:true, migratedRecord:true });
  }

  function getMarketValue(item = {}){
    const value = normalizeMarketPricing(item, { legacy:true, removeLegacy:false, migratedRecord:true }).marketValue;
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }

  function getMarketPrice(item = {}){
    const price = normalizeMarketPricing(item, { legacy:true, removeLegacy:false, migratedRecord:true }).marketPrice;
    return Number.isFinite(price) && price >= 0 ? price : null;
  }

  function getInventoryResaleValue(item = {}, quantity = 1){
    return getMarketValue(item) * Math.max(0, Number(quantity || 0));
  }

  function getPlayerPurchasePrice(item = {}, modifier = 1){
    const price = getMarketPrice(item);
    return price === null ? null : Math.max(0, price * Math.max(0, Number(modifier ?? 1)));
  }

  function getPlayerSaleValue(item = {}, modifier = 1){
    return Math.max(0, getMarketValue(item) * Math.max(0, Number(modifier ?? 1)));
  }

  function marksToCopper(marks){
    return Math.max(0, Math.round(Number(marks || 0) * MARK_TO_COPPER));
  }

  function copperToMarks(copper){
    return Math.max(0, Number(copper || 0) / MARK_TO_COPPER);
  }

  function getPlayerPurchasePriceCopper(item = {}, modifier = 1){
    const price = getPlayerPurchasePrice(item, modifier);
    return price === null ? null : marksToCopper(price);
  }

  function getPlayerSaleValueCopper(item = {}, modifier = 1){
    return marksToCopper(getPlayerSaleValue(item, modifier));
  }

  function marketPricingStatus(item = {}){
    const validation = validateMarketPricing(item, { allowLegacyMissingPrice:true });
    if(!validation.valid) return { id:'invalid', label:'Invalid Pricing', ...validation };
    if(validation.marketValue === 0 && validation.marketPrice === 0) return { id:'not-tradeable', label:'Not Normally Tradeable', ...validation };
    if(validation.marketPrice === null || validation.warnings.length) return { id:'needs-completion', label:'Pricing Needs Completion', ...validation };
    return { id:'tradeable', label:'Normally Tradeable', ...validation };
  }

  function formatMarks(value){
    if(value === null || value === undefined) return 'Needs Pricing Completion';
    const number = Number(value);
    if(!Number.isFinite(number)) return 'Needs Pricing Completion';
    return `${number.toLocaleString(undefined, { maximumFractionDigits:2 })} Marks`;
  }

  return Object.freeze({
    VERSION:'asteria-market-pricing-v1',
    MARKET_VALUE_KEYS:Object.freeze([...MARKET_VALUE_KEYS]),
    MARKET_PRICE_KEYS:Object.freeze([...MARKET_PRICE_KEYS]),
    LEGACY_VALUE_KEYS:Object.freeze([...LEGACY_VALUE_KEYS]),
    LEGACY_PRICE_KEYS:Object.freeze([...LEGACY_PRICE_KEYS]),
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
  });
});
