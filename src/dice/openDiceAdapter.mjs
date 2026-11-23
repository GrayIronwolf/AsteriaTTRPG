/**
 * Asteria's engine-neutral contract for 3D rendering.
 * All totals come from Firebase. Never generate a client-side result here.
 */
import {DICE_SIDES,MAX_DICE_PER_ROLL} from '../state/diceRollModel.mjs';
import {openDiceAppearanceOptions} from './diceMaterialEngine.mjs';

export const MAX_3D_DICE_MESHES=24;

// Open Dice numbers d10 as 0..9 and uses two percentile dice for d100.
function openDiceFace(sides,face){
  return (sides===10&&face===10)||(sides===100&&face===100)?0:face;
}

export function prepareAsteriaDicePreview(record){
  if(!record||record.source!=='server-digital'||!Array.isArray(record.results))
    throw Error('Only confirmed server-digital rolls can be animated.');
  if(!Number.isSafeInteger(record.modifier)||!Number.isSafeInteger(record.subtotal)||
    !Number.isSafeInteger(record.total)||record.total!==record.subtotal+record.modifier)
    throw Error('The roll totals are inconsistent.');

  const dice=[],expectedFaces=[];
  let subtotal=0,diceCount=0,meshCount=0;
  for(const group of record.results){
    if(!DICE_SIDES.includes(group?.sides)||!Number.isSafeInteger(group?.count)||
      group.count<1||!Array.isArray(group.faces)||group.faces.length!==group.count||
      !Number.isSafeInteger(group.sum))
      throw Error('The roll contains an invalid dice group.');
    const groupTotal=group.faces.reduce((sum,face)=>{
      if(!Number.isSafeInteger(face)||face<1||face>group.sides)
        throw Error('A recorded dice face is outside its permitted range.');
      const engineFace=openDiceFace(group.sides,face);
      dice.push({dice:'d'+group.sides,rolled:engineFace,
        // Phase 3.1 continues using the exact verified Phase 2 renderer defaults.
        ...openDiceAppearanceOptions()});
      if(group.sides===100){
        expectedFaces.push(engineFace%10,Math.floor(engineFace/10)*10);
        meshCount+=2;
      }else{
        expectedFaces.push(engineFace);
        meshCount++;
      }
      diceCount++;
      return sum+face;
    },0);
    if(group.sum!==groupTotal)throw Error('A dice group sum does not match its faces.');
    subtotal+=groupTotal;
  }
  if(!diceCount||diceCount>MAX_DICE_PER_ROLL||subtotal!==record.subtotal)
    throw Error('The roll subtotal does not match its recorded faces.');
  if(meshCount>MAX_3D_DICE_MESHES)
    return {mode:'text',reason:'large-pool',diceCount,meshCount,
      total:record.total};
  return {mode:'3d',dice,expectedFaces,diceCount,meshCount,
    total:record.total};
}

// Never trust the renderer's aggregate total for d10/d100. Its zero-based
// convention is different from the server's 1-10/1-100 rules.
export function matchesAsteriaDicePreview(prepared,observed){
  if(prepared?.mode!=='3d'||!Array.isArray(observed?.results)||
    !Array.isArray(observed?.variances)||
    observed.results.length!==prepared.expectedFaces.length)return false;
  // Open Dice renders the numbered face "10" for its zero-based d10 value
  // zero (see upstream dice.js getDieValue). It reports that as a variance,
  // even though the physical face and Asteria's official value are both 10.
  // No other physical face variance may be accepted.
  const tenFace=face=>face?.type==='d10'&&face?.expected===0&&face?.visible===10;
  return observed.variances.every(tenFace)&&observed.results.every((face,index)=>{
    const expected=prepared.expectedFaces[index];
    return face.value===expected&&(face.visible===expected||
      face.type==='d10'&&expected===0&&face.visible===10);
  });
}
