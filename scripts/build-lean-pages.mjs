#!/usr/bin/env node
/**
 * Prepare a deterministic, static Asteria Pages snapshot.
 * No credentials, Firebase deployments, GitHub API calls, code rewrites,
 * lossy image re-encoding or changes to the source repository.
 *
 * Usage: node scripts/build-lean-pages.mjs OUTPUT_DIRECTORY [REPORT_JSON]
 */
import {readdir,lstat,copyFile,mkdir,readFile,rm,writeFile,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const outputArg=process.argv[2];
if(!outputArg)throw Error('Specify a separate output directory.');
const out=path.resolve(outputArg);
const reportPath=path.resolve(process.argv[3]||path.join(path.dirname(out),'asteria-pages-report.json'));
const relative=path.relative(root,out).replaceAll(path.sep,'/');
if(out===root||!relative.startsWith('..')||out===path.dirname(root))
  throw Error('The output must be outside the source repository.');
if(reportPath===out||reportPath.startsWith(out+path.sep))
  throw Error('Report must be outside the public site directory.');
const PUBLIC_ROOT_FILES=['index.html','CNAME','404.html','favicon.ico','robots.txt','sitemap.xml'];
// Every runtime bundle, source module, image and generated compendium resource
// retains its original relative URL. The raw Markdown authoring vault,
 // build tools, functions, test fixtures and private configuration do not ship.
const PUBLIC_DIRS=['assets','css','js','data','react-dist','src','content','config','classes','creatures'];
const CONTENT_MEDIA=/\.(?:png|jpe?g|webp|gif|svg|avif|ico|bmp|woff2?|ttf|otf|mp4|webm|mp3|ogg)$/i;
const SOURCE_MAP=/\.(?:map)$/i;
let total=0,count=0,sourceBytes=0,sourceFiles=0;
const groups=new Map(),included=new Set();
const staticReferenceFailures=[];
function groupOf(p){return p.split('/')[0];}
function allowed(p){
  if(SOURCE_MAP.test(p))return false;
  if(p.startsWith('content/'))return CONTENT_MEDIA.test(p);
  if(p.startsWith('src/'))return !/\/\.(?:DS_Store|gitkeep)$/.test(p);
  return true;
}
function ensureWithin(candidate,base){
  const rel=path.relative(base,candidate);
  if(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))
    throw Error('Path escapes its allowed root: '+candidate);
}
async function copyTree(dir){
  const absolute=path.join(root,dir);
  if(!existsSync(absolute))return;
  for(const entry of await readdir(absolute,{withFileTypes:true})){
    const rel=path.posix.join(dir,entry.name);
    const source=path.join(root,rel);
    const meta=await lstat(source);
    if(meta.isSymbolicLink())throw Error('Refusing symbolic link in deployment: '+rel);
    if(meta.isDirectory()){await copyTree(rel);continue;}
    if(!meta.isFile())throw Error('Unsupported entry in deployment: '+rel);
    sourceBytes+=meta.size;sourceFiles++;
    if(!allowed(rel))continue;
    const dest=path.join(out,rel);
    ensureWithin(dest,out);
    await mkdir(path.dirname(dest),{recursive:true});
    await copyFile(source,dest);
    const key=groupOf(rel);
    const g=groups.get(key)||{files:0,bytes:0,excludedFiles:0};
    g.files++;g.bytes+=meta.size;groups.set(key,g);
    included.add(rel);
    count++;total+=meta.size;
  }
}
function cleanUrl(raw){
  if(!raw||/^(?:https?:|data:|blob:|mailto:|tel:|javascript:|#|\/\/|var\(|\$\{)/i.test(raw))
    return null;
  let pathname=raw.split(/[?#]/,1)[0].replaceAll('\\\\','/');
  if(!pathname||pathname.includes('{')||pathname.includes('}')||pathname.includes('*'))return null;
  try{pathname=decodeURIComponent(pathname);}catch{/* Preserve original if malformed. */}
  return pathname;
}
function checkReference(from,raw,kind){
  const pathname=cleanUrl(raw);
  if(pathname===null)return;
  const resolved=pathname.startsWith('/')
    ?path.posix.normalize(pathname.slice(1))
    :path.posix.normalize(path.posix.join(path.posix.dirname(from),pathname));
  if(resolved==='..'||resolved.startsWith('../'))return;
  // Only check files, never relative navigation paths or runtime-generated links.
  if(!/\.[a-z0-9]{1,8}$/i.test(resolved))return;
  if(!included.has(resolved))staticReferenceFailures.push({from,reference:raw,expected:resolved,kind});
}
async function auditStaticAssets(){
  const html=await readFile(path.join(out,'index.html'),'utf8');
  for(const match of html.matchAll(/<(?:script|link|img|image|source|video|audio)\b[^>]*>/gim)){
    const tag=match[0];
    for(const attr of tag.matchAll(/\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/gim))
      checkReference('index.html',attr[1],'html');
  }
  for(const rel of included){
    if(rel.endsWith('.css')){
      const css=await readFile(path.join(out,rel),'utf8');
      for(const match of css.matchAll(/url\(\s*["']?([^)"']+)["']?\s*\)/gim))
        checkReference(rel,match[1].trim(),'css');
    }
  }
  // Static and literal dynamic local ES imports have no network fallback.
  // Audit the modules loaded directly from the HTML and the runtime bundles.
  for(const rel of included){
    if(!/\.(?:mjs|js)$/.test(rel))continue;
    if(!/^(?:js|src|react-dist)\//.test(rel))continue;
    const js=await readFile(path.join(out,rel),'utf8');
    const imports=[
      /\b(?:import|export)\s+(?:[^;'"]*?\s+from\s*)?["'](\.{1,2}\/[^"']+)["']/g,
      /\bimport\s*\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g
    ];
    for(const regex of imports)
      for(const match of js.matchAll(regex))checkReference(rel,match[1],'module');
  }
}
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
for(const file of PUBLIC_ROOT_FILES){
  const source=path.join(root,file);
  if(!existsSync(source))continue;
  const meta=await lstat(source);
  if(!meta.isFile())throw Error('Unsupported root entry: '+file);
  await copyFile(source,path.join(out,file));
  included.add(file);total+=meta.size;count++;
  groups.set('root',{files:(groups.get('root')?.files||0)+1,bytes:(groups.get('root')?.bytes||0)+meta.size});
}
for(const d of PUBLIC_DIRS)await copyTree(d);
if(!included.has('index.html')||!included.has('CNAME'))
  throw Error('Essential Pages files index.html / CNAME are missing.');
await writeFile(path.join(out,'.nojekyll'),'');
included.add('.nojekyll');
await auditStaticAssets();
const result={
  schemaVersion:1,sourceCommit:process.env.GITHUB_SHA||'local',output:out,
  publishedFiles:count+1,publishedBytes:total,
  sourceFiles,sourceBytes,
  excludedSourceFiles:sourceFiles-(count-(groups.get('root')?.files||0)),
  groupBytes:Object.fromEntries([...groups.entries()].map(([k,v])=>[k,v])),
  staticReferenceFailures:staticReferenceFailures.slice(0,50),
  staticReferenceFailureCount:staticReferenceFailures.length
};
await mkdir(path.dirname(reportPath),{recursive:true});
await writeFile(reportPath,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
if(staticReferenceFailures.length)
  throw Error('Deployment would contain missing static resources ('+staticReferenceFailures.length+'). Review report before publishing.');
