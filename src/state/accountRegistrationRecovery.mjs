// Phase 2.3: registration validation and recovery. No account passwords
// or recovery credentials are persisted, logged or sent to the account-ID callable.
const USERNAME=/^[A-Za-z0-9._-]{3,24}$/;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UID=/^[A-Za-z0-9_-]{1,128}$/;
const trim=value=>typeof value==='string'?value.trim():'';
const normalizedEmail=value=>trim(value).toLowerCase();

export function validateAccountRegistrationFields(fields={}) {
  const firstName=trim(fields.firstName),lastName=trim(fields.lastName);
  const email=trim(fields.email),username=trim(fields.username);
  const password=typeof fields.password==='string'?fields.password:'';
  const confirmPassword=typeof fields.confirmPassword==='string'?fields.confirmPassword:'';
  const errors={};
  if(!firstName || firstName.length>80)
    errors.firstName='Enter a first name (1–80 characters).';
  if(!lastName || lastName.length>80)
    errors.lastName='Enter a last name (1–80 characters).';
  if(!EMAIL.test(email) || email.length>254)
    errors.email='Enter a valid email address.';
  if(!USERNAME.test(username))
    errors.username='Username must be 3–24 characters: letters, numbers, dots, underscores or hyphens.';
  if(password.length<6)
    errors.password='Password must contain at least 6 characters.';
  if(!confirmPassword)
    errors.confirmPassword='Confirm your password before creating an account.';
  else if(password!==confirmPassword)
    errors.confirmPassword='Passwords do not match.';
  return {ok:Object.keys(errors).length===0,errors,
    message:Object.values(errors)[0]||''};
}

function validatedRecoveryDraft(uid,authEmail,draft) {
  if(typeof uid!=='string'||!UID.test(uid)||
     !draft||typeof draft!=='object'||draft.uid!==uid ||
     !EMAIL.test(normalizedEmail(authEmail)) ||
     normalizedEmail(draft.email)!==normalizedEmail(authEmail) ||
     !USERNAME.test(draft.username||'') ||
     typeof draft.firstName!=='string'||!trim(draft.firstName)||
     typeof draft.lastName!=='string'||!trim(draft.lastName)||
     trim(draft.firstName).length>80||trim(draft.lastName).length>80) {
    throw new Error('Sign in with the account created earlier to finish setup.');
  }
  return {
    uid,email:trim(authEmail),username:draft.username,
    usernameLower:draft.username.toLowerCase(),
    firstName:trim(draft.firstName),lastName:trim(draft.lastName)
  };
}

/**
 * Retry only an authenticated, previously-created account's missing profile.
 * The transaction can create a missing profile or restore missing name fields,
 * but cannot overwrite a different profile, a username, ID, or character data.
 * All changes happen on the account owner's Firestore document.
 */
export async function recoverPendingRegistrationProfile({
  uid,authEmail,draft,transaction,readCanonical
}={}) {
  const expected=validatedRecoveryDraft(uid,authEmail,draft);
  if(typeof transaction!=='function'||typeof readCanonical!=='function')
    throw new Error('Account storage is unavailable. Try again after reconnecting.');
  await transaction(async ({read,create,patch})=>{
    const existing=await read();
    if(!existing) {
      await create({...expected,role:'account',characters:[]});
      return;
    }
    if(existing.uid!==uid ||
       normalizedEmail(existing.email)!==normalizedEmail(authEmail) ||
       existing.username!==expected.username ||
       existing.usernameLower!==expected.usernameLower) {
      throw new Error('The existing account profile needs manual review.');
    }
    const missing={};
    for(const key of ['firstName','lastName']){
      if(!trim(existing[key])) missing[key]=expected[key];
    }
    if(Object.keys(missing).length) await patch(missing);
  });
  const saved=await readCanonical();
  if(!saved||saved.uid!==uid||
     normalizedEmail(saved.email)!==normalizedEmail(authEmail)||
     saved.username!==expected.username||
     saved.usernameLower!==expected.usernameLower||
     !trim(saved.firstName)||!trim(saved.lastName)) {
    throw new Error('Account profile could not be confirmed. Retry when connected.');
  }
  return saved;
}
