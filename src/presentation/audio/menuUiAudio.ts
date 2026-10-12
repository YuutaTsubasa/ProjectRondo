import {audioPreferences,type AudioPreferences} from './audioPreferences';
import {MANIFEST} from './manifest';
interface Options {preferences?:AudioPreferences;createAudio?:(url:string)=>HTMLAudioElement;}
/** Front-door feedback stays alive across its subpages; stage audio owns gameplay feedback. */
export function mountMenuUiAudio(root:HTMLElement,options:Options={}){
 if(!options.createAudio&&typeof Audio==='undefined')return()=>{};
 const create=options.createAudio??((url:string)=>new Audio(url));
 const bank={confirm:create(MANIFEST['ui.confirm'].files[0]),back:create(MANIFEST['ui.back'].files[0])};
 for(const sound of Object.values(bank))sound.preload='auto';
 const unsubscribe=(options.preferences??audioPreferences).subscribe(levels=>{
  const gain=levels.muted?0:levels.master*levels.sfx;
  bank.confirm.volume=gain*MANIFEST['ui.confirm'].volume;bank.back.volume=gain*MANIFEST['ui.back'].volume;
 });
 const available=()=>root.isConnected&&!root.matches('.is-loading,[aria-busy="true"]')&&!root.closest('[inert]')&&!root.querySelector('[aria-modal="true"][aria-busy="true"]');
 const play=(cue:keyof typeof bank)=>{const sound=bank[cue];sound.currentTime=0;void sound.play().catch(()=>{});};
 const click=(event:MouseEvent)=>{
  if(!available()||!(event.target instanceof Element))return;
  const button=event.target.closest('button');
  if(!button||!root.contains(button)||button.disabled||button.closest('[inert],[aria-busy="true"]'))return;
  play(button.dataset.uiSound==='back'?'back':'confirm');
 };
 const key=(event:KeyboardEvent)=>{
  if(!available()||event.repeat||event.defaultPrevented||event.ctrlKey||event.altKey||event.metaKey)return;
  if(event.target instanceof Element&&!root.contains(event.target)&&event.target!==document.body)return;
  if(event.key==='Escape'){if(!root.matches('.is-title'))play('back');}
  else if(root.matches('.is-title')&&!['Tab','Shift','Control','Alt','Meta'].includes(event.key))play('confirm');
 };
 // Capture before a click changes page or a nested dialog stops Escape propagation.
 root.addEventListener('click',click,true);window.addEventListener('keydown',key,true);
 return()=>{
  root.removeEventListener('click',click,true);window.removeEventListener('keydown',key,true);unsubscribe();
  for(const sound of Object.values(bank)){sound.pause();sound.removeAttribute('src');sound.load();}
 };
}
