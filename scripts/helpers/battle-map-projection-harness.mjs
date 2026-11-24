import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { synchronizeBattleMapPresentation } from '../../functions/livePresentationProjectionTriggers.mjs';

export function battleMapProjectionHarness(projectId) {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('A Firestore emulator is required.');
  const app = initializeApp({ projectId }, projectId);
  const db = getFirestore(app);
  return {
    async sync(campaignId, mapId) {
      // The rules suite runs Firestore and Storage without the Functions emulator.
      const source = await db.doc(`campaigns/${campaignId}/battleMaps/${mapId}`).get();
      return synchronizeBattleMapPresentation(db, campaignId, mapId, source.data());
    },
    close: () => deleteApp(app)
  };
}
