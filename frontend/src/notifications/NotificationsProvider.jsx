import React,{createContext,useContext,useEffect,useMemo,useState} from 'react';
import {useAuth} from '../auth/AuthProvider.jsx';
import {isVerifiedOwnedSession} from '../auth/accountSecurityPolicy.mjs';
import {useAppServices} from '../app/AppServices.jsx';
import {createNotificationPoller,EMPTY_NOTIFICATION_STATE} from './notificationPoller.mjs';

const Context=createContext(null);
const EMPTY=Object.freeze({
 state:EMPTY_NOTIFICATION_STATE,available:false,
 channels:Object.freeze({social:false,campaign:false}),
 refresh:async()=>false,acknowledge:async()=>{throw new Error('Notifications unavailable.');}
});

/** A single account-scoped notification controller feeds both header and inbox. */
export function NotificationsProvider({children}){
 const {session}=useAuth();
 const services=useAppServices();
 const service=services.get('notifications');
 const uid=isVerifiedOwnedSession(session)?session.user.uid:null;
 const [snapshot,setSnapshot]=useState({uid:null,state:EMPTY_NOTIFICATION_STATE});
 const [controller,setController]=useState(null);
 useEffect(()=>{
  setSnapshot({uid:null,state:EMPTY_NOTIFICATION_STATE});
  setController(null);
  if(!uid||!service)return undefined;
  let alive=true;
  const poller=createNotificationPoller({
   service,uid,environment:{window,document},
   publish:state=>{if(alive)setSnapshot({uid,state});}
  });
  setController(poller);
  poller.start();
  return ()=>{alive=false;poller.dispose();};
 },[service,uid]);
 const channels=service?.availability()||EMPTY.channels;
 const value=useMemo(()=>{
  if(!uid||snapshot.uid!==uid||!controller)return {
   ...EMPTY,available:Boolean(uid&&service),channels
  };
  return {
   available:true,channels,state:snapshot.state,
   refresh:()=>controller.refresh(true),
   acknowledge:(channel,id)=>controller.acknowledge(channel,id)
  };
 },[uid,service,channels,snapshot,controller]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useNotifications(){return useContext(Context)||EMPTY;}
