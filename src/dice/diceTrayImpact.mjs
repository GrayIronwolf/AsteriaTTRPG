/** Impact-responsive, locally synthesised tray sounds; no external media or server.
 * Browser autoplay rules apply: audio begins only after a user gesture.
 */
import {validateDiceTrayAppearance} from './diceTrayCatalogue.mjs';
export const TRAY_IMPACT_PROFILES=Object.freeze({
  felt:Object.freeze({cutoff:480,decay:.07,tone:95,ring:0,gain:.24}),
  leather:Object.freeze({cutoff:720,decay:.10,tone:130,ring:0,gain:.28}),
  wood:Object.freeze({cutoff:1350,decay:.12,tone:215,ring:.05,gain:.32}),
  stone:Object.freeze({cutoff:2400,decay:.16,tone:420,ring:.13,gain:.32}),
  metal:Object.freeze({cutoff:4300,decay:.27,tone:680,ring:.55,gain:.32}),
  magical:Object.freeze({cutoff:3400,decay:.23,tone:740,ring:.84,gain:.25})
});
export const TRAY_VOLUME_GAIN=Object.freeze({low:.18,medium:.42,high:.7});
export function impactProfileForTray(value){
  const a=validateDiceTrayAppearance(value);
  if(a.sound==='off')return null;
  return {...TRAY_IMPACT_PROFILES[a.sound],
    volume:TRAY_VOLUME_GAIN[a.soundVolume]};
}
export function createTrayImpactAudio(initial){
  let config=validateDiceTrayAppearance(initial);
  let context=null,buffer=null,lastTime=0,closed=false;
  const getContext=()=> {
    if(closed)return null;
    if(context)return context;
    if(typeof window==='undefined')return null;
    const Context=window.AudioContext||window.webkitAudioContext;
    if(!Context||navigator.userActivation?.hasBeenActive===false)return null;
    try{
      context=new Context();
      buffer=context.createBuffer(1,Math.round(context.sampleRate*.32),context.sampleRate);
      const samples=buffer.getChannelData(0);
      let seed=98123;
      for(let i=0;i<samples.length;i++){
        seed=(Math.imul(seed,1664525)+1013904223)>>>0;
        samples[i]=(seed/4294967295)*2-1;
      }
      return context;
    }catch{return null;}
  };
  function play(intensity=1){
    const profile=impactProfileForTray(config);
    if(!profile)return;
    const ctx=getContext();
    if(!ctx||ctx.state==='closed')return;
    if(ctx.state==='suspended')ctx.resume().catch(()=>{});
    const time=ctx.currentTime;
    if(time-lastTime<.047)return;
    lastTime=time;
    try{
      const level=Math.max(0,Math.min(1,Number(intensity)||0))*profile.gain*profile.volume;
      if(level<.008)return;
      const noise=ctx.createBufferSource();noise.buffer=buffer;
      const filter=ctx.createBiquadFilter();
      filter.type='lowpass';filter.frequency.value=profile.cutoff;
      const gain=ctx.createGain();
      gain.gain.setValueAtTime(Math.max(.001,level),time);
      gain.gain.exponentialRampToValueAtTime(.001,time+profile.decay);
      noise.connect(filter);filter.connect(gain);gain.connect(ctx.destination);
      noise.start(time);noise.stop(time+profile.decay+.012);
      if(profile.ring>0){
        const oscillator=ctx.createOscillator(),ringGain=ctx.createGain();
        oscillator.type=profile.ring>.5?'sine':'triangle';
        oscillator.frequency.setValueAtTime(profile.tone,time);
        oscillator.frequency.exponentialRampToValueAtTime(
          Math.max(45,profile.tone*.64),time+profile.decay);
        ringGain.gain.setValueAtTime(Math.max(.001,level*profile.ring),time);
        ringGain.gain.exponentialRampToValueAtTime(.001,time+profile.decay*1.15);
        oscillator.connect(ringGain);ringGain.connect(ctx.destination);
        oscillator.start(time);oscillator.stop(time+profile.decay*1.2);
      }
    }catch{ /* Device audio may be blocked; visuals and official rolls continue. */ }
  }
  return {play,
    configure(next){config=validateDiceTrayAppearance(next);},
    dispose(){closed=true;context?.close?.().catch(()=>{});context=null;buffer=null;}
  };
}
