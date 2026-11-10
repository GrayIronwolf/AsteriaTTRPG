/** Local-only, read-only check of the ADC file created by gcloud.
 * Never log or return tokens, private keys, or credential JSON.
 */
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const SA=/^firebase-adminsdk-[a-z0-9-]+@asteria-ttrpg\.iam\.gserviceaccount\.com$/;
export function isApprovedImpersonatedCredential(filePath,serviceAccount){
  if(typeof filePath!=='string'||!filePath.startsWith('/')||
     typeof serviceAccount!=='string'||!SA.test(serviceAccount))return false;
  try{
    const data=JSON.parse(readFileSync(filePath,'utf8'));
    const target=data?.service_account_impersonation_url;
    if(data?.type!=='impersonated_service_account'||typeof target!=='string')
      return false;
    const uri=new URL(target);
    if(uri.protocol!=='https:'||uri.hostname!=='iamcredentials.googleapis.com')
      return false;
    return uri.pathname.endsWith(
      '/serviceAccounts/'+serviceAccount+':generateAccessToken'
    )||uri.pathname.endsWith(
      '/serviceAccounts/'+encodeURIComponent(serviceAccount)+':generateAccessToken'
    );
  }catch{return false;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length!==4||
     !isApprovedImpersonatedCredential(process.argv[2],process.argv[3])){
    process.stderr.write('ADC identity mismatch. No production changes made.\n');
    process.exitCode=2;
  }
}
