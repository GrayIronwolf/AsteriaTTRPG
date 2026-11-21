'use strict';

const VIEWPORTS=Object.freeze({
  desktop:Object.freeze({width:1440,height:900}),
  mobile:Object.freeze({width:390,height:844})
});
const FIREBASE_EMULATOR_ORIGINS=Object.freeze([8080,9099,5001,9199].flatMap(port=>
  ['127.0.0.1','localhost'].map(host=>'http://'+host+':'+port)));
const FIXTURE_ART_ORIGIN='http://127.0.0.1:8129';

function isFixtureArtwork(request){
  const url=new URL(request.url());
  return url.origin===FIXTURE_ART_ORIGIN&&url.pathname.startsWith('/assets/races/')&&
    request.resourceType()==='image';
}

function browserLaunchOptions(){
  return {headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,
    args:['--no-sandbox','--disable-dev-shm-usage']};
}

function browserContextOptions(size){
  const viewport=VIEWPORTS[size];
  if(!viewport)throw new Error('Unknown restoration viewport '+size);
  return {viewport,deviceScaleFactor:1,locale:'en-US',timezoneId:'UTC',
    reducedMotion:'reduce'};
}

module.exports={VIEWPORTS,FIREBASE_EMULATOR_ORIGINS,FIXTURE_ART_ORIGIN,
  isFixtureArtwork,browserLaunchOptions,browserContextOptions};
