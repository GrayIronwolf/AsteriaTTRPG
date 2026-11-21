'use strict';
const assert=require('node:assert/strict');

const PROJECT='demo-asteria';
const ACCOUNT_ROLES=['gm','player','outsider'];
const PASSWORD='LocalDashboardFixture123!';
const NOW=Date.UTC(2030,0,1,12);
const CAMPAIGNS={2:'dashboard-baseline-v2',1:'dashboard-baseline-v1'};
const CHARACTER='kael';
const ownerFor={kael:'player',lyra:'companion'};
const usernames={gm:'PreviewGM',player:'PreviewPlayer',outsider:'PreviewOutsider'};
const uid=role=>'dashboard-baseline-'+role;
const email=role=>uid(role)+'@example.test';

async function seedDashboardEmulators(original,artworkOrigin){
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8080',
    'Dashboard fixtures require the loopback Firestore emulator');
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9099',
    'Dashboard fixtures require the loopback Auth emulator');
  assert.equal(process.env.GCLOUD_PROJECT,PROJECT,
    'Run the baseline in a disposable demo-asteria emulator project');

  const {initializeApp,deleteApp}=require('firebase-admin/app');
  const {getAuth}=require('firebase-admin/auth');
  const {initializeTestEnvironment}=require('@firebase/rules-unit-testing');
  const {doc,getDoc,writeBatch,Timestamp}=require('firebase/firestore');
  const credential={getAccessToken:async()=>({access_token:'owner',expires_in:3600})};
  const app=initializeApp({projectId:PROJECT,credential},'dashboard-baseline');
  const auth=getAuth(app);
  let rules;
  const close=()=>Promise.all([rules?.cleanup(),deleteApp(app)]);
  try{
    for(const role of ACCOUNT_ROLES){
      const user={email:email(role),password:PASSWORD,emailVerified:true};
      try{await auth.createUser({...user,uid:uid(role)});}
      catch(error){
        if(error.code!=='auth/uid-already-exists')throw error;
        await auth.updateUser(uid(role),user);
      }
    }
    rules=await initializeTestEnvironment({projectId:PROJECT,firestore:{host:'127.0.0.1',port:8080}});
    await rules.withSecurityRulesDisabled(async context=>{
      const db=context.firestore(),batch=writeBatch(db);
      const set=(document,fields)=>batch.set(doc(db,document),fields);
      for(const role of ACCOUNT_ROLES){
        set('users/'+uid(role),{uid:uid(role),username:usernames[role],email:email(role)});
      }
      for(const [version,campaignId] of Object.entries(CAMPAIGNS)){
        const path='campaigns/'+campaignId;
        const party=original.campaign.party;
        const characters={},playerCharacterLinks={};
        for(const id of party){
          const ownerUid=uid(ownerFor[id]);
          const sourceId=version==='2'?'source-'+id:id;
          const originalCharacter=original.characters[id];
          const {image,gallery}=originalCharacter;
          const localImage=value=>value&&new URL(value,artworkOrigin).href;
          const shared={
            ...originalCharacter,id,campaignId,ownerUid,sourceCharacterId:sourceId,
            sharedCampaignId:campaignId,status:'linked',
            class:originalCharacter.klass,
            ...(image?{image:localImage(image)}:{}),
            ...(gallery?{gallery:gallery.map(entry=>({...entry,url:localImage(entry.url)}))}:{})
          };
          playerCharacterLinks[id]=ownerUid;
          characters[id]={ownerUid,sourceCharacterId:sourceId,name:shared.name,
            klass:shared.klass,level:shared.level};
          set(path+'/characters/'+id,shared);
          set('users/'+ownerUid+'/characters/'+sourceId,{
            ...shared,id:sourceId,linkedCampaignIds:[campaignId],
            campaignCharacterIds:{[campaignId]:id}
          });
          if(version==='2')set(path+'/members/'+ownerUid,{
            uid:ownerUid,campaignId,role:'player',status:'active'
          });
        }
        set(path,{
          id:campaignId,name:original.campaign.name,ownerUid:uid('gm'),
          membershipSchemaVersion:Number(version),party,partySize:party.length,
          characters,playerCharacterLinks,
          ...(version==='1'?{playerUids:Object.values(playerCharacterLinks)}:{})
        });
        set(path+'/liveSession/current',{
          id:original.session.id,campaignId,status:'active',number:original.session.number,
          startedBy:uid('gm'),startedAt:Timestamp.fromMillis(original.session.startedAt),
          expiresAt:Timestamp.fromMillis(original.session.expiresAt),maxDurationHours:10
        });
      }
      await batch.commit();
    });
    return {
      async read(document){
        let data;
        await rules.withSecurityRulesDisabled(async context=>{
          const snapshot=await getDoc(doc(context.firestore(),document));
          assert.ok(snapshot.exists(),'Missing seeded document '+document);
          data=snapshot.data();
        });
        return data;
      },
      close
    };
  }catch(error){await close();throw error;}
}

module.exports={NOW,CAMPAIGNS,CHARACTER,PASSWORD,uid,email,seedDashboardEmulators};
