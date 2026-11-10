// Only public profile presentation fields may be edited from a browser.
// Username, UID and permanent Account ID always remain server-owned.
const PERSON_NAME=/^[^<>]{0,60}$/;
const containsControl=value=>[...value].some(char=>{
  const code=char.codePointAt(0);
  return code<32||code===127;
});
export function validatedEditableProfile(input){
  if(!input||typeof input!=='object'||Array.isArray(input))
    throw new Error('Invalid profile details.');
  const permitted=['firstName','lastName'];
  if(Object.keys(input).some(key=>!permitted.includes(key)))
    throw new Error('Account identity and private fields cannot be edited.');
  const clean={};
  for(const key of permitted){
    if(typeof input[key]!=='string')throw new Error('Profile text must be provided.');
    const value=input[key].trim().replace(/\s+/g,' ');
    if(containsControl(value)||!PERSON_NAME.test(value))
      throw new Error('Profile fields contain invalid characters or are too long.');
    clean[key]=value;
  }
  if(!(clean.firstName||clean.lastName))
    throw new Error('Provide at least one name to display.');
  return clean;
}
// Public handle preview only. Reservation and uniqueness are enforced by the
// authenticated Cloud Function; no browser code may write the registry.
export function proposedAccountUsername(raw,number){
  if(typeof raw!=='string')throw new Error('Enter a username.');
  const username=raw.trim();
  if(!/^[A-Za-z0-9._-]{3,24}$/.test(username))
    throw new Error('Username must contain 3–24 letters, numbers, dots, underscores or hyphens.');
  if(typeof number!=='string'||!/^[0-9]{5}$/.test(number))
    throw new Error('Your Account ID must be verified before changing your username.');
  return {username,accountId:username+'#'+number};
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
