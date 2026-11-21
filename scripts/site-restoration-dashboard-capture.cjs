'use strict';
const {createHash}=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');

function dashboardMetrics(root,navSelector){
  const round=value=>Math.round(value*100)/100;
  const rect=element=>{
    const {left,top,width,height}=element.getBoundingClientRect();
    return {x:round(left+scrollX),y:round(top+scrollY),width:round(width),height:round(height)};
  };
  const style=element=>{
    const css=getComputedStyle(element);
    return {display:css.display,position:css.position,font:css.fontFamily,size:css.fontSize,weight:css.fontWeight,lineHeight:css.lineHeight,
      color:css.color,background:css.backgroundColor,backgroundImage:css.backgroundImage,
      border:css.border,borderRadius:css.borderRadius,boxShadow:css.boxShadow};
  };
  const snapshot=element=>({rect:rect(element),style:style(element)});
  const label=element=>element.innerText.trim();
  const elements=(selector,within=root)=>Array.from(within.querySelectorAll(selector))
    .filter(element=>element.getBoundingClientRect().width>0);
  const nav=navSelector?root.querySelector(navSelector):null;
  return {
    viewport:{width:innerWidth,height:innerHeight},
    document:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},
    root:snapshot(root),
    headings:elements('h1,h2,h3').map(element=>({label:label(element),...snapshot(element)})),
    navigation:nav?{...snapshot(nav),scrollWidth:nav.scrollWidth,clientWidth:nav.clientWidth,
      role:nav.getAttribute('role'),items:elements('button',nav).map(element=>({
        label:label(element),accessibleLabel:element.getAttribute('aria-label'),
        tabIndex:element.tabIndex,icons:element.querySelectorAll('svg').length,...snapshot(element)
      }))}:null,
    resources:elements('[data-resource]').map(element=>{
      const bar=element.matches('[role=progressbar]')?element:element.querySelector('[role=progressbar]');
      const fill=element.querySelector('.react-resource-track > i,[role=progressbar] > span');
      const reserved=element.querySelector('.react-resource-reserved');
      return {id:element.dataset.resource,value:bar?.getAttribute('aria-valuenow'),
        max:bar?.getAttribute('aria-valuemax'),...snapshot(element),
        fill:fill?snapshot(fill):null,reserved:reserved?snapshot(reserved):null};
    }),
    panels:elements('[data-panel-id],[data-grid-panel-id],[data-layout-tile],.asteria-react-panel').map(element=>{
      const content=element.querySelector(':scope > section,:scope > article')||element;
      const heading=content.querySelector('h2,h3,h4');
      const css=getComputedStyle(element);
      return {id:element.dataset.panelId||element.dataset.gridPanelId||element.dataset.layoutTile||null,
        label:heading?label(heading):element.getAttribute('aria-label'),size:element.dataset.panelSize||null,
        frame:element.dataset.frameFamily||null,background:element.dataset.panelBackground||null,
        gridColumn:css.gridColumn,gridRow:css.gridRow,...snapshot(element),surface:style(content),
        frameLayers:['::before','::after'].map(pseudo=>getComputedStyle(content,pseudo).backgroundImage)};
    }),
    controls:elements('button').map(element=>({label:element.getAttribute('aria-label')||label(element),
      disabled:element.disabled,symbols:elements('svg, [aria-hidden=true]',element).map(icon=>
        icon.getAttribute('class')||icon.textContent.trim()),...snapshot(element)})),
    images:elements('img').map(img=>({alt:img.alt,src:new URL(img.currentSrc||img.src,location.href).pathname,
      loaded:img.complete&&img.naturalWidth>0,...rect(img)}))
  };
}

async function stableRender(page){
  await page.evaluate(async()=>{
    await document.fonts.ready;
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  });
}

async function captureDashboard(page,root,navSelector,output,name,{viewportOnly=false}={}){
  await root.waitFor({state:'attached'});
  if(navSelector)await root.locator(navSelector).waitFor();
  await page.evaluate(()=>scrollTo(0,0));
  await page.mouse.move(0,0);
  await stableRender(page);
  const metrics=await root.evaluate(dashboardMetrics,navSelector);
  const screenshot=name+'.png';
  const png=await page.screenshot({path:path.join(output,screenshot),
    animations:'disabled',fullPage:!viewportOnly});
  await fs.writeFile(path.join(output,name+'.json'),JSON.stringify(metrics,null,2)+'\n');
  return {screenshot,metrics:name+'.json',sha256:createHash('sha256').update(png).digest('hex'),
    pixels:{width:png.readUInt32BE(16),height:png.readUInt32BE(20)}};
}

module.exports={stableRender,captureDashboard};
