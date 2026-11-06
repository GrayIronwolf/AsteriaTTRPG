/* Phase 4 typography: independent, account-scoped browser preferences.
 * Fonts are fetched on selection; the approved site artwork is never modified. */
(function(){
  'use strict';
  const FONTS = Object.freeze([
    {id:'cinzel',name:'Cinzel',family:'Cinzel',fallback:'Georgia, serif',type:'display'},
    {id:'marcellus-sc',name:'Marcellus SC',family:'Marcellus SC',fallback:'Georgia, serif',type:'display'},
    {id:'cormorant-garamond',name:'Cormorant Garamond',family:'Cormorant Garamond',fallback:'Georgia, serif',type:'both'},
    {id:'uncial-antiqua',name:'Uncial Antiqua',family:'Uncial Antiqua',fallback:'Georgia, serif',type:'display'},
    {id:'source-serif-4',name:'Source Serif 4',family:'Source Serif 4',fallback:'Georgia, serif',type:'both'},
    {id:'cinzel-decorative',name:'Cinzel Decorative',family:'Cinzel Decorative',fallback:'Georgia, serif',type:'display'},
    {id:'tinos',name:'Tinos (Times alternative)',family:'Tinos',fallback:'Times New Roman, serif',type:'both'},
    {id:'libre-baskerville',name:'Libre Baskerville',family:'Libre Baskerville',fallback:'Georgia, serif',type:'both'},
    {id:'old-standard-tt',name:'Old Standard TT (Schoolbook alternative)',family:'Old Standard TT',fallback:'Georgia, serif',type:'both'},
    {id:'inter',name:'Inter (Aptos alternative)',family:'Inter',fallback:'Arial, sans-serif',type:'both'},
    {id:'arimo',name:'Arimo (Arial alternative)',family:'Arimo',fallback:'Arial, sans-serif',type:'both'},
    {id:'carlito',name:'Carlito (Calibri alternative)',family:'Carlito',fallback:'Calibri, Arial, sans-serif',type:'both'},
    {id:'petit-formal-script',name:'Petit Formal Script (formal)',family:'Petit Formal Script',fallback:'cursive',type:'display'},
    {id:'pinyon-script',name:'Pinyon Script (flowing)',family:'Pinyon Script',fallback:'cursive',type:'display'},
    {id:'great-vibes',name:'Great Vibes (calligraphy)',family:'Great Vibes',fallback:'cursive',type:'display'}
  ]);
  const READABLE = Object.freeze(FONTS.filter(font=>font.type==='both').map(font=>font.id));
  const DEFAULTS = Object.freeze({heading:'cinzel',reading:'source-serif-4',size:100});
  const loadedFonts = new Set();
  let current = {...DEFAULTS};
  let activeAccount = '';
  const byId = id=>FONTS.find(font=>font.id===id);
  const familyOf = id=>{
    const font=byId(id);
    return font ? '"'+font.family+'", '+font.fallback : 'Georgia, serif';
  };
  function userId(){
    let account=null;
    try{account=window.AsteriaFirebase?.getUser?.()?.uid || window.AsteriaAuthBridge?.getSession?.()?.uid || window.session?.uid || window.session?.account;}catch{/* use local guest key */}
    return String(account || 'guest').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,128);
  }
  function key(){return 'asteria.typography.v1.'+userId();}
  function normalize(value){
    const item=value&&typeof value==='object'?value:{};
    const size=Number(item.size);
    return {
      heading:byId(item.heading)?item.heading:DEFAULTS.heading,
      reading:READABLE.includes(item.reading)?item.reading:DEFAULTS.reading,
      size:Number.isFinite(size)?Math.min(115,Math.max(90,Math.round(size))):DEFAULTS.size
    };
  }
  function stored(){
    try{return normalize(JSON.parse(window.localStorage?.getItem(key())||'null'));}
    catch{return {...DEFAULTS};}
  }
  function loadFont(id){
    const font=byId(id);
    if(!font||loadedFonts.has(id))return;
    loadedFonts.add(id);
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='https://fonts.googleapis.com/css2?family='+encodeURIComponent(font.family).replace(/%20/g,'+')+'&display=swap';
    link.dataset.asteriaTypographyFont=id;
    document.head?.appendChild(link);
  }
  function syncControls(){
    document.querySelectorAll('[data-asteria-typography-host]').forEach(host=>{
      const heading=host.querySelector('[data-typography-field="heading"]');
      const reading=host.querySelector('[data-typography-field="reading"]');
      const size=host.querySelector('[data-typography-field="size"]');
      const amount=host.querySelector('[data-typography-size-output]');
      if(heading)heading.value=current.heading;
      if(reading)reading.value=current.reading;
      if(size)size.value=String(current.size);
      if(amount)amount.textContent=current.size+'%';
    });
  }
  function apply(value,persist){
    current=normalize(value);
    const style=document.documentElement.style;
    style.setProperty('--asteria-font-display',familyOf(current.heading));
    style.setProperty('--asteria-font-body',familyOf(current.reading));
    style.setProperty('--asteria-typography-scale',String(current.size/100));
    document.documentElement.dataset.asteriaHeadingFont=current.heading;
    loadFont(current.heading);
    loadFont(current.reading);
    syncControls();
    if(persist){
      try{window.localStorage?.setItem(key(),JSON.stringify(current));}
      catch{/* Typography stays usable when local storage is blocked. */}
    }
    return {...current};
  }
  function field(kind,title,values){
    const label=document.createElement('label');
    label.textContent=title;
    const select=document.createElement('select');
    select.dataset.typographyField=kind;
    select.setAttribute('aria-label',title);
    values.forEach(font=>{
      const option=document.createElement('option');
      option.value=font.id;
      option.textContent=font.name;
      select.appendChild(option);
    });
    select.addEventListener('change',()=>apply({...current,[kind]:select.value},true));
    label.appendChild(select);
    return label;
  }
  function mount(host){
    if(!host)return;
    host.replaceChildren();
    host.dataset.asteriaTypographyHost='true';
    host.classList.add('asteria-typography-controls');
    const intro=document.createElement('p');
    intro.className='asteria-typography-help';
    intro.textContent='Choose a decorative heading font and a readable text font. Fonts save automatically on this device for the signed-in account.';
    host.appendChild(intro);
    const grid=document.createElement('div');
    grid.className='asteria-typography-fields';
    grid.appendChild(field('heading','Heading font',FONTS));
    grid.appendChild(field('reading','Reading font',FONTS.filter(font=>READABLE.includes(font.id))));
    const sizeLabel=document.createElement('label');
    sizeLabel.textContent='Reading text size ';
    const output=document.createElement('output');
    output.dataset.typographySizeOutput='true';
    sizeLabel.appendChild(output);
    const range=document.createElement('input');
    range.type='range';
    range.min='90';
    range.max='115';
    range.step='5';
    range.dataset.typographyField='size';
    range.setAttribute('aria-label','Reading text size');
    range.addEventListener('input',()=>apply({...current,size:Number(range.value)},true));
    sizeLabel.appendChild(range);
    grid.appendChild(sizeLabel);
    host.appendChild(grid);
    const preview=document.createElement('div');
    preview.className='asteria-typography-preview';
    preview.setAttribute('aria-label','Live typography preview');
    const title=document.createElement('h3');
    title.textContent='Asteria — The Shattered Realms';
    const body=document.createElement('p');
    body.textContent='Beneath the silver moon, a new adventure begins. Read rules and character details comfortably.';
    preview.append(title,body);
    host.appendChild(preview);
    const reset=document.createElement('button');
    reset.type='button';
    reset.className='outline asteria-typography-reset';
    reset.textContent='Reset typography';
    reset.addEventListener('click',()=>{
      try{window.localStorage?.removeItem(key());}catch{/* ignore */}
      apply(DEFAULTS,false);
    });
    host.appendChild(reset);
    syncControls();
  }
  function refreshAccount(){
    const id=userId();
    if(id!==activeAccount){activeAccount=id;apply(stored(),false);}
  }
  function boot(){
    activeAccount=userId();
    apply(stored(),false);
    mount(document.getElementById('asteriaTypographyMenu'));
    if(window.MutationObserver&&document.body){
      new MutationObserver(refreshAccount).observe(document.body,{attributes:true,attributeFilter:['data-role']});
    }
    window.addEventListener('storage',event=>{if(event.key===key())apply(stored(),false);});
  }
  window.AsteriaTypography=Object.freeze({
    fonts:FONTS,
    readable:READABLE,
    defaults:DEFAULTS,
    normalize,
    get:()=>({...current}),
    apply,
    mount,
    refreshAccount
  });
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot):boot();
})();
