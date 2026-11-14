/** Digital GM 9.1: GM-private session notes and explicitly published PDF handouts. */
export const SESSION_NOTE_LIMIT = 200;
export const SESSION_PDF_LIMIT = 60;
export const SESSION_PDF_MAX_BYTES = 20 * 1024 * 1024;
export const SESSION_NOTE_KINDS = Object.freeze(['prep','session','recap','lore']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const sessionLibraryId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value);
function shape(value, allowed, field) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key)))
    throw Error('Invalid ' + field + ' fields.');
}
function text(value, length, field, required = false) {
  if (typeof value !== 'string' || value.length > length || (required && !value.trim()))
    throw Error('Enter a valid ' + field + ' (maximum ' + length + ' characters).');
  return value.trim();
}
function revision(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1000000)
    throw Error('Invalid record revision.');
  return value;
}
export function sessionNoteInput(input = {}) {
  shape(input, ['title','body','kind','sessionLabel'], 'session note');
  if (!SESSION_NOTE_KINDS.includes(input.kind)) throw Error('Invalid note category.');
  return {
    title: text(input.title, 140, 'note title', true),
    body: text(input.body, 16000, 'note body'),
    kind: input.kind,
    sessionLabel: text(input.sessionLabel || '', 100, 'session label')
  };
}
export function sessionPdfInput(input = {}) {
  shape(input, ['title','description','fileName','size'], 'PDF details');
  const fileName = text(input.fileName, 150, 'PDF filename', true);
  if (!fileName.toLowerCase().endsWith('.pdf') || fileName.includes('/') || fileName.includes('\\') || /[<>:"|?*]/.test(fileName) || [...fileName].some(char => char.charCodeAt(0) < 32)) throw Error('Choose a PDF filename.');
  if (!Number.isSafeInteger(input.size) || input.size < 1 || input.size > SESSION_PDF_MAX_BYTES)
    throw Error('PDF must be between 1 byte and 20 MB.');
  return {
    title: text(input.title, 140, 'PDF title', true),
    description: text(input.description || '', 600, 'PDF description'),
    fileName,
    size: input.size
  };
}
export function sessionPdfFileError(file) {
  if (!file || typeof file !== 'object') return 'Choose a PDF file.';
  if (file.type && file.type !== 'application/pdf') return 'Only PDF documents are supported.';
  try { sessionPdfInput({title:'Document',description:'',fileName:file.name,size:file.size}); }
  catch (error) { return error.message; }
  return '';
}
export function sessionPdfPath(campaignId, pdfId) {
  if (!sessionLibraryId(campaignId) || !sessionLibraryId(pdfId)) throw Error('Invalid PDF reference.');
  return 'campaigns/' + campaignId + '/sessionPdfs/' + pdfId + '/document.pdf';
}
export function publicSessionPdf(record) {
  if (!object(record) || record.status !== 'ready' || record.visibility !== 'players')
    throw Error('Only ready, published PDFs can be shared.');
  return {
    id:record.id, title:record.title, description:record.description,
    fileName:record.fileName, size:record.size, storagePath:record.storagePath,
    visibility:'players',status:'ready',revision:record.revision
  };
}
export function validateSessionLibraryAction(action = {}) {
  if (!object(action)) throw Error('Invalid library request.');
  const allowed = {
    'create-note':['type','id','note'],
    'update-note':['type','id','expectedRevision','note'],
    'delete-note':['type','id','expectedRevision'],
    'reserve-pdf':['type','id','details'],
    'finish-pdf':['type','id','expectedRevision'],
    'update-pdf':['type','id','expectedRevision','title','description'],
    'publish-pdf':['type','id','expectedRevision'],
    'unpublish-pdf':['type','id','expectedRevision'],
    'archive-pdf':['type','id','expectedRevision']
  };
  if (!Object.hasOwn(allowed,action.type)) throw Error('Unsupported library action.');
  shape(action,allowed[action.type],'library action');
  if (!sessionLibraryId(action.id)) throw Error('Invalid library record ID.');
  if (action.type !== 'create-note' && action.type !== 'reserve-pdf') revision(action.expectedRevision);
  if (['create-note','update-note'].includes(action.type)) sessionNoteInput(action.note);
  if (action.type === 'reserve-pdf') sessionPdfInput(action.details);
  if (action.type === 'update-pdf') {
    text(action.title,140,'PDF title',true);
    text(action.description,600,'PDF description');
  }
  return action.type;
}
export function sessionLibraryRows(rows = []) {
  return (Array.isArray(rows)?rows:[]).filter(record => record && record.status !== 'archived')
    .sort((a,b) => String(b.updatedAt?.seconds || b.updatedAt || '').localeCompare(
      String(a.updatedAt?.seconds || a.updatedAt || '')) || String(a.title||'').localeCompare(String(b.title||'')));
}
