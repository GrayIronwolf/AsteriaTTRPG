import {rollD20} from './combatRules.mjs';

// A physical or digital roll uses the same canonical d20 evaluation.
// Only the already-GM-authorized combat command can submit physical faces.
const keys=new Set(['primary','defence','opposed']);
export function validateHybridPhysicalDice(input){
  if(input===undefined)return null;
  if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).length===0||Object.keys(input).some(key=>!keys.has(key)))
    throw Error('Choose a valid recorded physical-dice submission.');
  const safe=Object.create(null);
  for(const [key,faces] of Object.entries(input)){
    if(!Array.isArray(faces)||faces.length<1||faces.length>2||
      faces.some(face=>!Number.isInteger(face)||face<1||face>20))
      throw Error('Physical d20 faces must be whole numbers from 1 to 20.');
    safe[key]=[...faces];
  }
  return safe;
}
export function hybridD20(check={},faces,random=Math.random){
  if(faces===undefined)return {...rollD20(check,random),source:'digital'};
  const count=Boolean(check.advantage)!==Boolean(check.disadvantage)?2:1;
  if(!Array.isArray(faces)||faces.length!==count||
    faces.some(face=>!Number.isInteger(face)||face<1||face>20))
    throw Error('Record '+count+' physical d20 result'+(count===1?'':'s')+
      ' for this check.');
  let index=0;
  // rollD20 remains authoritative for advantage/disadvantage and selected face.
  return {...rollD20(check,()=> (faces[index++]-1)/20),source:'physical'};
}
