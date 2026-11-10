// Only public profile presentation fields may be edited from a browser.
// Username, UID and permanent Account ID always remain server-owned.
const PERSON_NAME=/^[^\u0000-\u001f\u007f<>]{0,60}$/;
const DISPLAY_NAME=/^[^\u0000-\u001f\u007f<>]{0,64}$/;
export function validatedEditableProfile(input){
  if(!input||typeof input!=='object'||Array.isArray(input))
    throw new Error('Invalid profile details.');
  const permitted=['firstName','lastName','displayName'];
  if(Object.keys(input).some(key=>!permitted.includes(key)))
    throw new Error('Account identity and private fields cannot be edited.');
  const clean={};
  for(const key of permitted){
    if(typeof input[key]!=='string')throw new Error('Profile text must be provided.');
    const value=input[key].trim().replace(/\s+/g,' ');
    if(!(key==='displayName'?DISPLAY_NAME:PERSON_NAME).test(value))
      throw new Error('Profile fields contain invalid characters or are too long.');
    clean[key]=value;
  }
  if(!(clean.firstName||clean.lastName||clean.displayName))
    throw new Error('Provide at least one name to display.');
  return clean;
}
export function identityFieldsUnchanged(before,after){
  return ['uid','username','usernameLower','accountId','accountNumber','accountIdKey','accountIdAssignedAt']
    .every(key=>before?.[key]===after?.[key]);
}
export function avatarUploadError(file){
  if(!file||typeof file!=='object')return 'Choose an image.';
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))
    return 'Choose a PNG, JPG or WEBP image.';
  if(!Number.isFinite(file.size)||file.size<=0||file.size>4*1024*1024)
    return 'Choose an image no larger than 4 MB.';
  return '';
}
export const accountAvatarPath=uid=>{
  if(typeof uid!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(uid))
    throw new Error('Invalid signed-in account.');
  return 'users/'+uid+'/profile/avatar';
};
