/** Phase 3.6: ephemeral visual-only studio. Phase 3.7 adds account persistence. */
import {defaultDiceAppearance,validateDiceAppearance} from './diceAppearanceCatalogue.mjs';
import {defaultDiceTrayAppearance,validateDiceTrayAppearance} from './diceTrayCatalogue.mjs';

export const STUDIO_UNDO_LIMIT=30;
export const STUDIO_LOOKS=Object.freeze([
  Object.freeze({id:'obsidian',name:'Obsidian & Steel',diceId:'dice-obsidian',trayId:'obsidian-hexagon'}),
  Object.freeze({id:'royal',name:'Royal Court',diceId:'dice-celestial',trayId:'royal-marble'}),
  Object.freeze({id:'arcane',name:'Arcane Study',diceId:'dice-arcane',trayId:'arcane-circle'}),
  Object.freeze({id:'forest',name:'Woodland Hunt',diceId:'dice-nature',trayId:'hunters-leather'})
]);

const validatePair=({dice,tray})=>({
  dice:validateDiceAppearance(dice),tray:validateDiceTrayAppearance(tray)
});
export function createDiceStudioState(
  dice=defaultDiceAppearance(),tray=defaultDiceTrayAppearance()
){
  return {past:[],current:validatePair({dice,tray}),future:[]};
}
export function changeDiceStudio(state,changes){
  if(!changes||typeof changes!=='object'||Object.keys(changes).some(x=>!['dice','tray'].includes(x)))
    throw Error('Unsupported studio change.');
  const next=validatePair({
    dice:Object.hasOwn(changes,'dice')?changes.dice:state.current.dice,
    tray:Object.hasOwn(changes,'tray')?changes.tray:state.current.tray
  });
  if(JSON.stringify(next)===JSON.stringify(state.current))return state;
  return {
    past:[...state.past.slice(1-STUDIO_UNDO_LIMIT),state.current],
    current:next,future:[]
  };
}
export function undoDiceStudio(state){
  if(!state.past.length)return state;
  return {past:state.past.slice(0,-1),current:state.past.at(-1),
    future:[state.current,...state.future]};
}
export function redoDiceStudio(state){
  if(!state.future.length)return state;
  return {past:[...state.past.slice(1-STUDIO_UNDO_LIMIT),state.current],
    current:state.future[0],future:state.future.slice(1)};
}
export function applyDiceStudioLook(state,id){
  const look=STUDIO_LOOKS.find(x=>x.id===id);
  if(!look)throw Error('Unknown appearance look.');
  return changeDiceStudio(state,{
    dice:defaultDiceAppearance(look.diceId),
    tray:defaultDiceTrayAppearance(look.trayId)
  });
}
export function matchDiceTrayPalette(state){
  const {dice,tray}=state.current;
  return changeDiceStudio(state,{tray:{
    ...tray,frameColor:dice.secondaryColor,interiorColor:dice.primaryColor,
    trimColor:dice.numberColor
  }});
}
export function restoreDiceStudio(state,target='all'){
  if(target==='dice')
    return changeDiceStudio(state,{dice:defaultDiceAppearance(state.current.dice.familyId)});
  if(target==='tray')
    return changeDiceStudio(state,{tray:defaultDiceTrayAppearance(state.current.tray.designId)});
  if(target==='all')
    return changeDiceStudio(state,{dice:defaultDiceAppearance(),tray:defaultDiceTrayAppearance()});
  throw Error('Unknown restore target.');
}
