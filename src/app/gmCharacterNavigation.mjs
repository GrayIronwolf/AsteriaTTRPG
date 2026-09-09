import '../../js/character-access.js';
import { buildReactRoute } from './asteriaRoutes.mjs';

function navigate(windowObject, route, state) {
  windowObject.history.pushState(state, '', buildReactRoute(route));
  windowObject.dispatchEvent(new Event('hashchange'));
}

export function openGMCharacter(campaign, character, view, windowObject = window) {
  const uid = windowObject.AsteriaFirebase?.getUser?.()?.uid;
  if(!windowObject.AsteriaCharacterAccess.canGMView(campaign, character, uid)) return false;
  const gmView = { uid, campaignId:campaign.id, tab:view.tab, selectedId:character.id, scrollY:windowObject.scrollY || 0 };
  windowObject.history.replaceState({ ...windowObject.history.state, gmView }, '');
  navigate(windowObject, { type:'character', campaignId:campaign.id, characterId:character.id }, {
    gmReturn:{ ...gmView, characterId:character.id }
  });
  return true;
}

export function gmReturnContext(campaign, character, uid, windowObject = window) {
  const context = windowObject.history.state?.gmReturn;
  return context?.uid === uid && context.campaignId === campaign?.id && context.characterId === character?.id &&
    windowObject.AsteriaCharacterAccess.canGMView(campaign, character, uid) ? context : null;
}

export function returnToGM(context, windowObject = window) {
  navigate(windowObject, { type:'gm', campaignId:context.campaignId }, { gmView:context });
}

export function restoredGMView(campaignId, uid, windowObject = window) {
  const context = windowObject.history.state?.gmView;
  return context?.uid === uid && context.campaignId === campaignId ? context : {};
}
