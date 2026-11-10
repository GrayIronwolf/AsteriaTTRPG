/* Asteria public-media compatibility layer.
 * Older saved characters/campaign displays can contain public relative image
 * URLs created before artwork moved to a dedicated Firebase Hosting site.
 * Rewrite only local artwork paths; never alter private Firebase Storage URLs.
 */
(function(){
  'use strict';
  const HOST='https://asteria-ttrpg-media.web.app';
  const TYPES=/\.(?:png|jpe?g|webp|gif|svg|avif|ico|bmp|woff2?|ttf|otf|mp4|webm|mp3|ogg)(?:[?#].*)?$/i;
  const SCHEME=/^(?:https?:|\/\/|blob:|data:|gs:|firebase:)/i;
  const RELATIVE=/^(?:(?:\.\.\/)+|\.\/|\/)*(assets|content)\//i;
  function publicUrl(value){
    if(typeof value!=='string'||SCHEME.test(value.trim()))return value;
    const raw=value.trim();
    if(!RELATIVE.test(raw)||!TYPES.test(raw))return value;
    const prefix=raw.replace(/^(?:(?:\.\.\/)+|\.\/|\/)+/,'');
    const path=prefix.split(/[?#]/,1)[0];
    if(path.includes('..')||path.includes('\\'))return value;
    return HOST+'/'+prefix;
  }
  function updateAttribute(element,attribute){
    const source=element.getAttribute(attribute);
    if(!source)return;
    const resolved=publicUrl(source);
    if(source!==resolved)element.setAttribute(attribute,resolved);
  }
  function fix(element){
    if(!element||element.nodeType!==1)return;
    const tag=element.tagName?.toLowerCase();
    if(tag==='img'||tag==='source'||tag==='video'||tag==='audio'){
      updateAttribute(element,'src');
      if(tag==='video')updateAttribute(element,'poster');
    }else if(tag==='image'||tag==='use'){
      updateAttribute(element,'href');
      updateAttribute(element,'xlink:href');
    }
    const style=element.getAttribute('style');
    if(style&&/(?:assets|content)\//.test(style)){
      const revised=style.replace(/url\(\s*(["']?)([^)"']+)\1\s*\)/gi,(match,quote,url)=>{
        const replaced=publicUrl(url.trim());
        return replaced===url.trim()?match:'url('+quote+replaced+quote+')';
      });
      if(revised!==style)element.setAttribute('style',revised);
    }
  }
  function visit(node){
    if(!node||node.nodeType!==1)return;
    fix(node);
    for(const descendant of node.querySelectorAll('img,source,video,audio,image,use,[style]'))
      fix(descendant);
  }
  function start(){
    visit(document.documentElement);
    const observer=new MutationObserver(records=>{
      for(const record of records){
        if(record.type==='attributes')fix(record.target);
        else if(record.type==='childList'){
          for(const item of record.addedNodes)visit(item);
        }
      }
    });
    observer.observe(document.documentElement,{
      childList:true,subtree:true,attributes:true,
      attributeFilter:['src','href','xlink:href','poster','style']
    });
  }
  window.AsteriaPublicMedia=Object.freeze({resolve:publicUrl,origin:HOST});
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
})();
