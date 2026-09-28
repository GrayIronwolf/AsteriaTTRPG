import fs from 'node:fs';
import * as firestore from 'firebase/firestore';
import {mergeLinkedCharacter,safeLinkedCharacterPatch} from '../../src/state/characterIntegrityModel.mjs';
import {validateOwnedRecord} from '../../src/state/ownedCharacterRecords.mjs';

// Execute the browser's real transaction and public link method with the emulator
// SDK. Keep this outside the callable harness: linking is a browser transaction.
export function browserCampaignLink(db,uid) {
  const source=fs.readFileSync('js/firebase-auth.js','utf8');
  const names=['cleanData','campaignDisplayName','uniqueValues','campaignCharacterSnapshot','campaignCharacterSummary','upsertSharedCampaignCharacter'];
  const declarations=names.map(name=>{
    const match=new RegExp(`(?:async )?function ${name}\\(`).exec(source);
    const end=source.slice(match.index+1).search(/\n(?:async )?function /);
    return source.slice(match.index,match.index+1+end);
  }).join('\n');
  const start=source.indexOf('  linkCharacterToCampaign: async function('),end=source.indexOf('\n  },',start)+4;
  const dependencies={...firestore,db,currentUser:{uid},currentProfile:{username:uid},window:{},mergeLinkedCharacter,safeLinkedCharacterPatch};
  return Function(...Object.keys(dependencies),`${declarations}\nreturn ({${source.slice(start,end)}}).linkCharacterToCampaign;`)(...Object.values(dependencies));
}

export function browserOwnedSubscription(db,uid) {
  const source=fs.readFileSync('js/firebase-auth.js','utf8');
  const start=source.indexOf('  subscribeOwnedCharacter: function('),end=source.indexOf('\n  },',start)+4;
  const dependencies={...firestore,db,currentUser:{uid},validateOwnedRecord};
  return Function(...Object.keys(dependencies),`return ({${source.slice(start,end)}}).subscribeOwnedCharacter;`)(...Object.values(dependencies));
}
