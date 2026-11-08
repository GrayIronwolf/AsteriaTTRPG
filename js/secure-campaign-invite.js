/* Browser/server compatible URL parser. Never stores the bearer token.
 * Asteria secure invitation URLs are handled only from the hash fragment.
 * Sharing links does not itself grant campaign membership or roles.
 */
(function(root){
  'use strict';
  const CAMPAIGN=/^[A-Za-z0-9_-]{1,160}$/;
  const HASH=/^[a-f0-9]{64}$/;
  const TOKEN=/^[A-Za-z0-9_-]{43}$/;
  function parse(hash){
    if(typeof hash!=='string'||hash.length>400)return null;
    const match=hash.match(/^#secure-campaign-invite=([A-Za-z0-9_-]{1,160})\.([a-f0-9]{64})\.([A-Za-z0-9_-]{43})$/);
    if(!match)return null;
    return Object.freeze({campaignId:match[1],inviteId:match[2],token:match[3]});
  }
  function link(base,campaignId,inviteId,token){
    if(typeof base!=='string'||!/^https?:\/\//.test(base)||
      !CAMPAIGN.test(campaignId)||!HASH.test(inviteId)||!TOKEN.test(token))
      throw Error('Invalid secure invitation link.');
    return base.split('#')[0]+'#secure-campaign-invite='+
      campaignId+'.'+inviteId+'.'+token;
  }
  const api=Object.freeze({parse,link});
  if(root)root.AsteriaSecureInvitationLinks=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:null);
