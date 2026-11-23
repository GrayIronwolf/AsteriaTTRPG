/** Phase 3.8 Castle compatibility adapter, backed by Phase 3.9 shared physics. */
import {attachDiceTower} from './diceTowerScene.mjs';
import {defaultDiceTowerAppearance} from './diceTowerCatalogue.mjs';
export function attachCastleDiceTower(engine,outline){
 return attachDiceTower(engine,outline,defaultDiceTowerAppearance('tower-castle'));
}
