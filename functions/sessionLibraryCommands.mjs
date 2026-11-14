import {
  sessionNoteInput,sessionPdfInput,sessionPdfPath,publicSessionPdf,
  validateSessionLibraryAction,SESSION_NOTE_LIMIT,SESSION_PDF_LIMIT
} from '../src/state/sessionLibraryModel.mjs';

const exists = snapshot => typeof snapshot?.exists === 'function' ? snapshot.exists() : Boolean(snapshot?.exists);
export function createSessionLibraryCommands(context,{requireCampaignGM}) {
  const {db,doc,runTransaction,currentUser,serverTimestamp} = context;
  return {
    manageSessionLibrary: async (campaignId,_scope,action = {}) => {
      try {
        const type = validateSessionLibraryAction(action);
        const result = await runTransaction(db,async tx => {
          await requireCampaignGM(tx,campaignId);
          const kind = type.endsWith('note') ? 'sessionNotes' : 'sessionPdfs';
          const ref = doc(db,'campaigns',campaignId,kind,action.id);
          const configRef = doc(db,'campaigns',campaignId,'sessionLibraryConfig','current');
          const sharedRef = kind === 'sessionPdfs' ?
            doc(db,'campaigns',campaignId,'sessionPdfsShared',action.id) : null;
          if (type === 'create-note' || type === 'reserve-pdf') {
            const [existing,config] = await Promise.all([tx.get(ref),tx.get(configRef)]);
            if (exists(existing)) throw Error('This library ID is already in use.');
            const counters = config?.data?.() || {};
            if (type === 'create-note') {
              if (Number(counters.notes || 0) >= SESSION_NOTE_LIMIT) throw Error('Session note limit reached.');
              const record = {id:action.id,...sessionNoteInput(action.note),status:'active',
                revision:1,createdBy:currentUser.uid,updatedBy:currentUser.uid,
                createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
              tx.set(ref,record);
              tx.set(configRef,{notes:Number(counters.notes||0)+1,updatedAt:serverTimestamp()},{merge:true});
              return {id:action.id,revision:1};
            }
            if (Number(counters.pdfs || 0) >= SESSION_PDF_LIMIT) throw Error('PDF library limit reached.');
            const details = sessionPdfInput(action.details);
            const record = {id:action.id,...details,contentType:'application/pdf',
              storagePath:sessionPdfPath(campaignId,action.id),status:'uploading',visibility:'gm',
              revision:1,createdBy:currentUser.uid,updatedBy:currentUser.uid,
              createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
            tx.set(ref,record);
            tx.set(configRef,{pdfs:Number(counters.pdfs||0)+1,updatedAt:serverTimestamp()},{merge:true});
            return {id:action.id,revision:1,storagePath:record.storagePath};
          }
          const existing = await tx.get(ref);
          if (!exists(existing)) throw Error('Library record was not found.');
          const record = existing.data();
          if (record.revision !== action.expectedRevision)
            throw Error('This record changed. Refresh before editing.');
          if (record.status === 'archived') throw Error('Archived records cannot be edited.');
          if (type === 'update-note') {
            const updated = {...record,...sessionNoteInput(action.note),revision:record.revision+1,
              updatedBy:currentUser.uid,updatedAt:serverTimestamp()};
            tx.set(ref,updated);
            return {id:record.id,revision:updated.revision};
          }
          if (type === 'delete-note' || type === 'archive-pdf') {
            // Read quota before any write: Firestore transactions disallow read-after-write.
            const config = await tx.get(configRef);
            const field = type === 'delete-note' ? 'notes' : 'pdfs';
            tx.update(ref,{status:'archived',visibility:'gm',revision:record.revision+1,
              updatedBy:currentUser.uid,updatedAt:serverTimestamp()});
            if (sharedRef) tx.delete(sharedRef);
            tx.set(configRef,{[field]:Math.max(0,Number(config?.data?.()?.[field]||0)-1),
              updatedAt:serverTimestamp()},{merge:true});
            return {id:record.id,revision:record.revision+1,storagePath:record.storagePath||''};
          }
          if (type === 'finish-pdf') {
            if (record.status !== 'uploading') throw Error('PDF is not awaiting upload.');
            tx.update(ref,{status:'ready',revision:record.revision+1,
              updatedBy:currentUser.uid,updatedAt:serverTimestamp()});
            return {id:record.id,revision:record.revision+1};
          }
          if (record.status !== 'ready') throw Error('Complete the PDF upload before editing or publishing.');
          if (type === 'update-pdf') {
            const updated = {...record,title:action.title.trim(),description:action.description.trim(),
              revision:record.revision+1,updatedBy:currentUser.uid,updatedAt:serverTimestamp()};
            tx.set(ref,updated);
            if (updated.visibility === 'players')
              tx.set(sharedRef,publicSessionPdf(updated));
            return {id:record.id,revision:updated.revision};
          }
          if (type === 'publish-pdf') {
            if (record.visibility !== 'gm') throw Error('PDF is already published.');
            const updated = {...record,visibility:'players',revision:record.revision+1,
              updatedBy:currentUser.uid,updatedAt:serverTimestamp()};
            tx.set(ref,updated);
            tx.set(sharedRef,publicSessionPdf(updated));
            return {id:record.id,revision:updated.revision};
          }
          if (type === 'unpublish-pdf') {
            if (record.visibility !== 'players') throw Error('PDF is not published.');
            tx.update(ref,{visibility:'gm',revision:record.revision+1,
              updatedBy:currentUser.uid,updatedAt:serverTimestamp()});
            tx.delete(sharedRef);
            return {id:record.id,revision:record.revision+1};
          }
          throw Error('Unsupported library operation.');
        });
        return {ok:true,...result};
      } catch(error) { return {ok:false,error:error?.message || String(error)}; }
    }
  };
}
