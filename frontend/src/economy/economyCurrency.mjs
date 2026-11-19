/** Exact existing six-tier denomination contract, no writes or rounding. */
export const COIN_FACTORS=Object.freeze([['royal_platinum',10000000000],['royal_crown',100000000],['platinum_crown',1000000],['gold',10000],['silver',100],['copper',1]]);
export function characterCurrencyCopper(character={}){
  const coins=character.coins||character.coinPouch||{};
  return COIN_FACTORS.reduce((sum,[key,multiplier])=>{
    const label=key.split('_').map(s=>s.charAt(0).toUpperCase()+s.slice(1)).join(' ');
    const amount=Number(coins[key]??coins[key.replaceAll('_',' ')]??coins[label]??0);
    return sum+(Number.isFinite(amount)?amount:0)*multiplier;
  },0);
}