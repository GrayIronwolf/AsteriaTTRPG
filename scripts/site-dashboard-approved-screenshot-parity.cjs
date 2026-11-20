/* Authenticated visual parity gate for the original approved dashboards.
 * Run with ASTERIA_PARITY_CASES=/absolute/path/cases.json
 * and optionally ASTERIA_PARITY_AUTH_STATE=/absolute/path/playwright-storage.json.
 * Reference PNGs must be genuine, approved pre-migration screenshots.
 * Do NOT synthesize a reference from the Vite UI.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');

async function main(){
  const file=process.env.ASTERIA_PARITY_CASES;
  assert.ok(file,'ASTERIA_PARITY_CASES must point to an approved screenshot manifest');
  const manifest=JSON.parse(fs.readFileSync(path.resolve(file),'utf8'));
  assert.ok(Array.isArray(manifest.cases)&&manifest.cases.length>=6,
    'Include authenticated Player, GM and GM read-only cases at mobile and desktop widths');
  const roles=new Set(manifest.cases.map(row=>row.role));
  for(const role of ['player','gm','readonly']){
    assert.ok(roles.has(role),'Missing authenticated '+role+' approved reference cases');
    const cases=manifest.cases.filter(row=>row.role===role);
    assert.ok(cases.some(row=>row.width<=480),'Missing mobile approved reference for '+role);
    assert.ok(cases.some(row=>row.width>=1024),'Missing desktop approved reference for '+role);
  }
  const evidence=path.resolve(process.env.ASTERIA_PARITY_OUTPUT||'dashboard-parity-evidence');
  fs.mkdirSync(evidence,{recursive:true});
  const browser=await chromium.launch({headless:true});
  try{
    const results=[];
    for(const entry of manifest.cases){
      assert.ok(['player','gm','readonly'].includes(entry.role));
      assert.ok(Number.isInteger(entry.width)&&entry.width>=320);
      assert.ok(Number.isInteger(entry.height)&&entry.height>=600);
      assert.ok(typeof entry.url==='string'&&/^https?:\/\/127\.0\.0\.1:\d+\//.test(entry.url),
        'Browser scenarios must point to a local test server');
      assert.ok(typeof entry.selector==='string'&&entry.selector.length);
      const reference=path.resolve(path.dirname(file),entry.reference);
      assert.ok(fs.existsSync(reference),'Approved reference PNG missing: '+reference);
      const context=await browser.newContext({
        viewport:{width:entry.width,height:entry.height},
        deviceScaleFactor:1,
        ...(process.env.ASTERIA_PARITY_AUTH_STATE?
          {storageState:path.resolve(process.env.ASTERIA_PARITY_AUTH_STATE)}:{})
      });
      try{
        const page=await context.newPage();
        const errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        await page.goto(entry.url,{waitUntil:'networkidle'});
        // Refuse unauthenticated login screens and public/synthetic previews.
        const authenticatedNav=page.locator(entry.role==='gm'
          ?'nav[aria-label="GM dashboard sections"]'
          :'nav[aria-label="Character dashboard sections"]');
        await authenticatedNav.waitFor({state:'visible',timeout:15000});
        if(entry.role==='readonly'){
          await page.getByText(/GM Read-only/).waitFor({timeout:15000});
          assert.equal(await authenticatedNav.getByRole('button',{name:'Journal',exact:true}).count(),0,
            'Read-only GM must not access private Player journals');
        }
        const target=page.locator(entry.selector);
        await target.waitFor({state:'visible'});
        for(const action of entry.actions||[]){
          if(action.click)await page.getByRole('button',{name:action.click,exact:true}).click();
          if(action.expect)await page.getByText(action.expect,{exact:true}).waitFor();
          if(action.selector)await page.locator(action.selector).waitFor({state:'visible'});
        }
        await page.evaluate(()=>document.fonts.ready);
        const actual=await target.screenshot({animations:'disabled'});
        const expected=fs.readFileSync(reference);
        const pixel=await page.evaluate(async ({a,b})=>{
          const decode=src=>new Promise((resolve,reject)=>{
            const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;
            image.src='data:image/png;base64,'+src;
          });
          const [one,two]=await Promise.all([decode(a),decode(b)]);
          if(one.width!==two.width||one.height!==two.height)
            return {sameSize:false,actual:[one.width,one.height],reference:[two.width,two.height]};
          const canvas=document.createElement('canvas');
          canvas.width=one.width;canvas.height=one.height;
          const ctx=canvas.getContext('2d',{willReadFrequently:true});
          ctx.drawImage(one,0,0);const aa=ctx.getImageData(0,0,one.width,one.height).data;
          ctx.clearRect(0,0,one.width,one.height);
          ctx.drawImage(two,0,0);const bb=ctx.getImageData(0,0,one.width,one.height).data;
          let changed=0;
          for(let i=0;i<aa.length;i+=4){
            if(Math.max(Math.abs(aa[i]-bb[i]),Math.abs(aa[i+1]-bb[i+1]),
              Math.abs(aa[i+2]-bb[i+2]),Math.abs(aa[i+3]-bb[i+3]))>24)changed++;
          }
          return {sameSize:true,changedPixels:changed,totalPixels:one.width*one.height,
            difference:changed/(one.width*one.height)};
        },{a:actual.toString('base64'),b:expected.toString('base64')});
        const name=String(entry.name||entry.role).replace(/[^a-z0-9_-]/gi,'_');
        fs.writeFileSync(path.join(evidence,name+'-react.png'),actual);
        assert.deepEqual(errors,[],'Browser runtime errors: '+entry.name);
        assert.ok(pixel.sameSize,'Screenshot geometry differs: '+JSON.stringify(pixel));
        const max=Number(entry.maxDifference??0.025);
        assert.ok(max>=0&&max<=0.1,'Difference threshold must be between 0 and 10%');
        assert.ok(pixel.difference<=max,
          name+' exceeds approved reference difference: '+JSON.stringify(pixel));
        results.push({name,role:entry.role,width:entry.width,height:entry.height,...pixel});
      }finally{await context.close();}
    }
    fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify(results,null,2));
    process.stdout.write(JSON.stringify(results,null,2)+'\n');
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
