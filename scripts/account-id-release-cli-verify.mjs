/** Verify the separately installed Firebase CLI and minimal upload archive. */
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {join,resolve,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const expectedFiles=[
 'accountIdentity.mjs',
 'accountIdentityIssuance.mjs',
 'accountIdentityProfile.mjs',
 'index.mjs',
 'package.json'
];
function allowFileSet(files) {
 const names=files.map(file=>file.path).sort();
 if(JSON.stringify(names)!==JSON.stringify(expectedFiles.slice().sort()))
   throw Error('Unapproved Account ID source package contents.');
 for(const f of files)
   if(typeof f.path!=='string'||!Number.isFinite(f.size)||f.size<=0)
     throw Error('Invalid source package entry.');
}

export function verifyArchive(json) {
 if(!Array.isArray(json)||json.length!==1||
    !Array.isArray(json[0]?.files))
   throw Error('Unexpected npm pack manifest.');
 allowFileSet(json[0].files);
 return {ready:true,fileCount:expectedFiles.length,onlyAccountIdCode:true};
}

export function verifyCliInstall({directory,loader=createRequire}={}) {
 if(typeof directory!=='string'||!isAbsolute(directory))
   throw Error('Expected isolated runner CLI directory.');
 const requireFromCli=loader(join(directory,'node_modules/firebase-tools/package.json'));
 const cli=requireFromCli('./package.json');
 const mm=requireFromCli('minimatch');
 const mmVersion=requireFromCli('minimatch/package.json').version;
 if(cli.version!=='15.35.0'||typeof mm!=='function'||
   !/^3\./.test(mmVersion))
   throw Error('Firebase CLI minimatch ABI is incompatible.');
 if(mm('file.txt','*.txt')!==true)
   throw Error('Firebase CLI minimatch functionality is broken.');
 return {ready:true,cli:cli.version,minimatch:mmVersion,
   minimatchCallable:true};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try {
  if(process.argv.length===3&&process.argv[2]==='--check'){
   const tmp=process.env.RUNNER_TEMP;
   if(!tmp||!isAbsolute(tmp))throw Error('Missing CI temp dir');
   const result=verifyCliInstall({directory:join(tmp,'asteria-account-id-cli')});
   process.stdout.write(JSON.stringify(result)+'\n');
  }else if(process.argv.length===3&&process.argv[2]==='--verify-archive'){
   const tmp=process.env.RUNNER_TEMP;
   if(!tmp||!isAbsolute(tmp))throw Error('Missing CI temp dir');
   const result=verifyArchive(JSON.parse(readFileSync(
      join(tmp,'asteria-account-id-pack-manifest.json'),'utf8')));
   process.stdout.write(JSON.stringify(result)+'\n');
  }else throw Error('Unrecognized CLI packaging operation');
 }catch{
  process.stderr.write('Isolated Firebase CLI/archive validation failed.\n');
  process.exitCode=1;
 }
}
