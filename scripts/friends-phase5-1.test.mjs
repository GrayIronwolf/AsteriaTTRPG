import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness({enabled=true,owner=true,loggedIn=true}={}){
 let uid='alice',ready=true;
 const events={},calls=[],created=[];
 function node(tag){
   const obj={tag,children:[],handlers:{},attrs:{},textContent:'',
     value:'',disabled:false,isConnected:true,hidden:false,
     addEventListener(event,cb){this.handlers[event]=cb;},
     setAttribute(key,value){this.attrs[key]=value;},
     append(...children){this.children.push(...children);},
     appendChild(child){this.children.push(child);},
     insertBefore(child){this.children.push(child);},
     replaceChildren(...children){this.children=[...children];},
     querySelector(){return null;}
   };
   created.push(obj);return obj;
 }
 const article=node('article');
 const grid={querySelector:s=>s==='.workspace-viewer'?article:null};
 const document={createElement:node};
 const root={
   document,
   AsteriaFeatureFlags:{campaignFriendRecipients:enabled},
   AsteriaAuthBridge:{isLoggedIn:()=>loggedIn},
   AsteriaFirebase:{
     getUser:()=>uid?{uid}:null,isReady:()=>ready,
     selectCampaignFriendRecipients:async(campaignId,body)=>{
       calls.push({uid,campaignId,body});
       if(body.action==='list')return {items:[{
         username:'Poppa_J',accountId:'Poppa_J#52816'
       }],nextCursor:null};
       return {available:true,recipient:{username:'Poppa_J',
         accountId:'Poppa_J#52816'}};
     }
   },
   addEventListener:name=>{events[name]=arguments[1];}
 };
 root.addEventListener=(name,fn)=>{events[name]=fn;};
 vm.runInNewContext(read('js/asteria-campaign-friend-recipients.js'),{
   window:root
 });
 const campaign={id:'campaign01',ownerUid:owner?'alice':'bob',
   membershipSchemaVersion:2};
 return {root,article,grid,campaign,calls,created,events,tick,
   open:()=>root.AsteriaCampaignFriendRecipients.render(grid,campaign),
   find:t=>created.find(n=>n.textContent===t),
   input:()=>created.find(n=>n.id==='workspaceCampaignFriendAccountId'),
   setUid:value=>{uid=value;events['asteria:auth-changed']?.();},
   setLoggedIn:value=>{loggedIn=value;},
   setReady:value=>{ready=value;}
 };
}
test('Phase 5.1 remains independently gated and requires actual campaign owner',()=>{
 for(const params of [{enabled:false},{owner:false},{loggedIn:false}]){
  const h=harness(params);
  assert.equal(h.open(),false);
  assert.equal(h.calls.length,0);
 }
 const h=harness();h.campaign.membershipSchemaVersion=1;
 assert.equal(h.open(),false);
});
test('read-only friend listing and exact Account ID selection, without issuance',async()=>{
 const h=harness();assert.equal(h.open(),true);
 const list=h.find('Show Accepted Friends');
 list.handlers.click();await tick();
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].body.action,'list');
 assert.equal(h.calls[0].body.cursor,0);
 h.input().value='Poppa_J#52816';
 h.find('Check Account ID').handlers.click();await tick();
 assert.equal(h.calls[1].body.action,'resolve');
 assert.equal(h.calls[1].body.accountId,'Poppa_J#52816');
 assert.equal(h.calls[1].campaignId,'campaign01');
 assert.equal(h.created.some(n=>String(n.textContent).includes('Selected: Poppa_J')),true);
 assert.equal(h.calls.some(v=>v.body.action==='issue'),false);
});
test('invalid ID input is rejected locally without a server call',async()=>{
 const h=harness();h.open();
 h.input().value='invalid-email@example.test';
 h.find('Check Account ID').handlers.click();await tick();
 assert.equal(h.calls.length,0);
 assert.equal(h.created.some(n=>/Enter a complete Account ID/.test(n.textContent)),true);
});
test('signout and account switching hide former campaign recipient data',async()=>{
 const h=harness();h.open();
 h.find('Show Accepted Friends').handlers.click();await tick();
 const host=h.article.children[0];
 assert.equal(host.hidden,false);
 h.setUid('bob');
 assert.equal(host.hidden,true);
 assert.equal(h.input().value,'');
 assert.equal(h.root.AsteriaCampaignFriendRecipients.render(h.grid,h.campaign),false);
});
test('website does not enable a server rollout or campaign issuance',()=>{
 const html=read('index.html'),frontend=read('js/firebase-auth.js');
 const ui=read('js/asteria-campaign-friend-recipients.js');
 const server=read('functions/index.mjs');
 const selector=read('functions/campaignFriendRecipients.mjs');
 assert.match(html,/campaignFriendRecipients:new URLSearchParams/);
 assert.match(html,/campaignInAppCanary:new URLSearchParams/);
 assert.match(html,/accountIds:true/);
 assert.match(html,/asteria-campaign-friend-recipients\.js\?v=friends-phase5-2/);
 assert.match(html,/asteria-campaign-friend-recipients\.css\?v=friends-phase5-1/);
 assert.match(read('js/clean-compendium.js'),
   /window\.AsteriaCampaignFriendRecipients\?\.render\?\.\(grid,campaign\)/);
 assert.match(frontend,/httpsCallable\(functionsClient,'asteriaCampaignFriendRecipients'\)/);
 assert.match(frontend,/ownershipReadyUid!==uid/);
 assert.match(server,/ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED!=='1'/);
 assert.match(selector,/campaign\.ownerUid!==actorUid/);
 assert.match(selector,/relationship\.status==='blocked'/);
 assert.match(selector,/memberSnap\.exists/);
 assert.match(selector,/findFriendByAccountId\(db,auth,actorUid/);
 assert.match(selector,/listAcceptedFriends\(db,auth,actorUid/);
 assert.doesNotMatch(ui,/getDoc\(|getDocs\(|setDoc\(|fetch\(|localStorage|sessionStorage|innerHTML/);
 assert.doesNotMatch(selector,/tx\.(create|update|delete)\(|tokenFactory|issueSecureCampaignInvitation/);
 assert.doesNotMatch(server,/ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED==='1'/);
});
