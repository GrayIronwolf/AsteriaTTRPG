#!/usr/bin/env node
/**
 * Two-part Asteria static release:
 * - GitHub Pages: application, account UI, JS, CSS and Compendium data.
 * - Secondary Firebase Hosting site: already-public artwork/fonts only.
 *
 * Inputs are staged, prebuilt files, never the source tree. This tool performs
 * NO network calls or deployments and changes no Firebase Security Rules.
 *
 * node scripts/split-asteria-public-media.mjs PAGES_DIR MEDIA_DIR REPORT.json
 */
import {readdir,stat,rename,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join,relative,sep,posix,dirname} from 'node:path';

export const MEDIA_SITE_ID='asteria-ttrpg-media';
export const MEDIA_ORIGIN='https://'+MEDIA_SITE_ID+'.web.app';
const MEDIA_EXT=/\.(?:png|jpe?g|webp|gif|svg|avif|ico|bmp|woff2?|ttf|otf|mp4|webm|mp3|ogg)$/i;
const CONTENT_REF=/(?<![\w:/.%-])(?:(?:\.\.\/)+|\.\/|\/)?content\/[^"'\x60<>\r\n]{1,260}?\.(?:png|jpe?g|webp|gif|svg|avif|ico|bmp|woff2?|ttf|otf|mp4|webm|mp3|ogg)(?=[?&#"'\x60\s<>),;]|$)/gi;
const ASSET_REF=/(?<![\w:/.%-])(?:(?:\.\.\/)+|\.\/|\/)?assets\//g;
const TEXT_EXT=/\.(?:html|css|js|mjs|json)$/i;

export function canonicalPublicPath(value){
  if(typeof value!=='string')return null;
  if(/^(?:https?:|\/\/|data:|blob:|gs:|firebase:|javascript:)/i.test(value))return null;
  const pathname=value.replace(/^(?:(?:\.\.\/)+|\.\/|\/)+/,'').split(/[?#]/,1)[0];
  if(!pathname.startsWith('assets/')&&!pathname.startsWith('content/'))return null;
  if(pathname.includes('..')||pathname.includes(String.fromCharCode(92))||!MEDIA_EXT.test(pathname))return null;
  return pathname;
}
export function resolvePublicMedia(value){
  const normalized=canonicalPublicPath(value);
  return normalized?MEDIA_ORIGIN+'/'+value.replace(/^(?:(?:\.\.\/)+|\.\/|\/)+/,''):value;
}
function isCompiledLocalAsset(text,relativePath,matchIndex,matched,existing){
  if(!relativePath.startsWith('react-dist/'))return false;
  const name='assets/'+text.slice(matchIndex+matched.length).split(/["'\x60\s?#;(),<>}]/,1)[0];
  return existing.has('react-dist/'+name);
}
export function rewritePublicMediaText(text,relativePath='',existing=new Set()){
  if(typeof text!=='string')throw new TypeError('Expected text');
  let assets=0,content=0;
  const assetText=text.replace(ASSET_REF,(match,index)=>{
    if(isCompiledLocalAsset(text,relativePath,index,match,existing))return match;
    assets++;
    return MEDIA_ORIGIN+'/assets/';
  });
  const result=assetText.replace(CONTENT_REF,match=>{
    content++;
    return MEDIA_ORIGIN+'/'+match.replace(/^(?:(?:\.\.\/)+|\.\/|\/)+/,'');
  });
  return {text:result,assetReferences:assets,contentReferences:content};
}
async function allFiles(dir,prefix=''){
  const paths=[];
  for(const entry of await readdir(join(dir,prefix),{withFileTypes:true})){
    if(entry.isSymbolicLink())throw Error('Symlinks are forbidden in deployment output');
    const rel=posix.join(prefix,entry.name);
    if(entry.isDirectory())paths.push(...await allFiles(dir,rel));
    else if(entry.isFile())paths.push(rel);
    else throw Error('Unexpected artifact type: '+rel);
  }
  return paths;
}
function safeLocation(candidate,base){
  const rel=relative(base,candidate);
  if(rel==='..'||rel.startsWith('..'+sep)||rel===''||rel.startsWith(sep))
    throw Error('Refusing unsafe build directory: '+candidate);
}
async function main(){
  const [siteArg,mediaArg,reportArg]=process.argv.slice(2);
  if(!siteArg||!mediaArg||!reportArg)
    throw Error('Usage: split-asteria-public-media.mjs PAGES_DIR MEDIA_DIR REPORT.json');
  const site=resolve(siteArg),media=resolve(mediaArg),report=resolve(reportArg),cwd=resolve('.');
  if(site===media||media.startsWith(site+sep)||site.startsWith(media+sep)||
     media===cwd||site===cwd)throw Error('Site and media outputs must be separate folders');
  if(!existsSync(join(site,'index.html'))||!existsSync(join(site,'CNAME')))
    throw Error('Stage the complete lean Pages package first');
  if(existsSync(media))throw Error('Media folder must be new, to prevent destructive overwrites');
  await mkdir(media,{recursive:true});
  const mediaPaths=[],removed=[];
  let mediaBytes=0;
  for(const category of ['assets','content']){
    const source=join(site,category);
    if(!existsSync(source))throw Error('Public directory missing: '+category);
    const files=await allFiles(site,category);
    for(const file of files){
      if(!MEDIA_EXT.test(file)){
        // Runtime package may contain public artwork-folder documentation.
        // Exclude it from both deployment packages; never publish metadata
        // or silently admit arbitrary file extensions to public Hosting.
        if(/(?:^|\/)README\.md$/i.test(file)){
          await rm(join(site,file));
          continue;
        }
        throw Error('Unexpected non-public file in media split: '+file);
      }
      mediaPaths.push(file);mediaBytes+=(await stat(join(site,file))).size;
    }
    await rename(source,join(media,category));
    removed.push(category);
  }
  const retainedFiles=await allFiles(site);
  const retainedSet=new Set(retainedFiles),mediaSet=new Set(mediaPaths);
  if(mediaSet.size<10||retainedFiles.length<100)
    throw Error('Unexpectedly small split. Refusing to publish.');
  let rewrittenAssets=0,rewrittenContent=0,retainedBytes=0;
  const written=[];
  for(const rel of retainedFiles){
    const p=join(site,rel);
    if(TEXT_EXT.test(rel)){
      const old=await readFile(p,'utf8');
      const result=rewritePublicMediaText(old,rel,retainedSet);
      if(result.text!==old)await writeFile(p,result.text,'utf8');
      rewrittenAssets+=result.assetReferences;
      rewrittenContent+=result.contentReferences;
      written.push({file:rel,assetReferences:result.assetReferences,contentReferences:result.contentReferences});
    }
    retainedBytes+=(await stat(p)).size;
  }
  // The Pages bundle may retain local 'react-dist/assets/*' used by Vite.
  // Every offloaded image must exist in the Hosting package at its original path.
  const samples=['assets/header/asteria-wordmark.png'];
  for(const file of samples)if(!mediaSet.has(file))throw Error('Required media missing: '+file);
  const html=await readFile(join(site,'index.html'),'utf8');
  if(!html.includes(MEDIA_ORIGIN+'/assets/header/asteria-wordmark.png'))
    throw Error('Homepage logo was not routed to public Firebase Hosting');
  if(rewrittenAssets<10||rewrittenContent<1)
    throw Error('Unexpected public URL rewrite counts; inspect source before release');
  const summary={
    schemaVersion:1,hostingSiteId:MEDIA_SITE_ID,mediaOrigin:MEDIA_ORIGIN,
    pagesFiles:retainedFiles.length,pagesBytes:retainedBytes,
    mediaFiles:mediaPaths.length,mediaBytes,
    assetsRewritten:rewrittenAssets,contentImagesRewritten:rewrittenContent,
    filesModified:written.filter(x=>x.assetReferences||x.contentReferences).length,
    pinnedMediaExamples:samples,
    privateStorageUntouched:true,productionDeployPerformed:false,
    urlSamples:written.filter(x=>x.assetReferences||x.contentReferences).slice(0,12),
  };
  await mkdir(dirname(resolve(report)),{recursive:true});
  await writeFile(report,JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify(summary,null,2));
}
if(process.argv[1] && import.meta.url===new URL('file://'+resolve(process.argv[1])).href){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
