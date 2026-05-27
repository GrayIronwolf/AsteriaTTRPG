const fs=require('fs'); const path=require('path');
const ROOT=path.resolve(__dirname,'..'); const CONTENT=path.join(ROOT,'content'); const OUT=path.join(ROOT,'js','content-manifest.js');
function slugify(t){return String(t).toLowerCase().replace(/🔒/g,'locked').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'page'}
function walk(dir,out=[]){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name); if(e.isDirectory()) walk(p,out); else if(e.isFile()&&e.name.endsWith('.md')) out.push(p)} return out}
const used={}; const pages=walk(CONTENT).sort().map(file=>{const rel=path.relative(CONTENT,file).split(path.sep).join('/'); const stem=path.basename(file,'.md'); let slug=slugify(stem); if(used[slug]) slug=slug+'-'+(++used[slug]); else used[slug]=1; return {slug,title:stem,category:path.dirname(rel)==='.'?'Uncategorised':path.dirname(rel).split(path.sep).join('/'),source:rel,content:fs.readFileSync(file,'utf8')}});
fs.writeFileSync(OUT,'window.ASTERIA_CONTENT = '+JSON.stringify({pages},null,2)+';\n'); console.log('Generated '+pages.length+' pages');
