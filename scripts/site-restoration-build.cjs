'use strict';
const {spawnSync}=require('node:child_process');
const path=require('node:path');

const mode=process.argv[2];
if(!['dedicated','combined','production'].includes(mode)){
  console.error('Use site:restoration-build with dedicated, combined or production.');
  process.exit(2);
}

const scopes=['AUTH','CHARACTER_FORGE','CAMPAIGN_FORGE','CAMPAIGN_CONNECTIONS',
  'FORGE_INTEGRATION','GM_DASHBOARD','PLAYER_DASHBOARD','DASHBOARD_EDITOR',
  'CAMPAIGN_MEDIA','COMBAT'];
const additional=['PROGRESSION','ECONOMY','DIGITAL_GM'];
const flags=Object.fromEntries([...scopes,...additional].map(flag=>[
  'VITE_ASTERIA_'+flag+'_ENABLED',String(scopes.includes(flag)||mode!=='dedicated')
]));
const npm=process.env.npm_execpath;
if(!npm)throw new Error('Run this script through npm run site:restoration-build.');
const {status,error}=spawnSync(process.execPath,[npm,'run','site:build'],{
  cwd:path.resolve(__dirname,'..'),stdio:'inherit',
  env:{...process.env,...flags,VITE_FIREBASE_MODE:mode==='production'?'production':'emulator'}
});
if(error)throw error;
process.exitCode=status??1;
