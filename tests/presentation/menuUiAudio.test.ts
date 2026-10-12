// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {mountMenuUiAudio} from '../../src/presentation/audio/menuUiAudio';
import {createAudioPreferences} from '../../src/presentation/audio/audioPreferences';
let dispose:(()=>void)|undefined;
afterEach(()=>{dispose?.();dispose=undefined;document.body.innerHTML='';});
function fixture(){
 document.body.innerHTML='<main><button id="confirm">Continue</button><button data-ui-sound="back">Back</button><button disabled>Disabled</button><div inert><button>Hidden</button></div></main>';
 const root=document.querySelector('main')!,media:any[]=[];const preferences=createAudioPreferences();
 dispose=mountMenuUiAudio(root,{preferences,createAudio:(src:string)=>{const sound={src,preload:'',volume:1,currentTime:0,play:vi.fn(()=>Promise.resolve()),pause:vi.fn(),removeAttribute:vi.fn(),load:vi.fn()};media.push(sound);return sound as unknown as HTMLAudioElement;}});
 return {root,media,preferences,confirm:media.find(x=>x.src.endsWith('ui-confirm.wav')),back:media.find(x=>x.src.endsWith('ui-back.wav'))};
}
it('plays one confirm for pointer or gamepad-style synthetic clicks, and a distinct cancel',()=>{
 const f=fixture();f.root.querySelector('button')!.click();
 f.root.querySelector('button')!.dispatchEvent(new MouseEvent('click',{bubbles:true}));
 expect(f.confirm.play).toHaveBeenCalledTimes(2);f.root.querySelector<HTMLButtonElement>('[data-ui-sound]')!.click();
 expect(f.back.play).toHaveBeenCalledOnce();expect(f.confirm.play).toHaveBeenCalledTimes(2);
});
it('hears Escape before dialogs stop propagation, skips repeats and loading screens',()=>{
 const f=fixture();const button=f.root.querySelector('button')!;
 button.addEventListener('keydown',e=>e.stopPropagation());
 button.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 button.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,repeat:true}));
 f.root.classList.add('is-loading');button.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 expect(f.back.play).toHaveBeenCalledOnce();
});
it('plays a title key once without treating arrows in ordinary menus as confirmations',()=>{
 const f=fixture();f.root.classList.add('is-title');window.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));
 window.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',repeat:true}));f.root.classList.remove('is-title');window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown'}));
 expect(f.confirm.play).toHaveBeenCalledOnce();
});
it('ignores inert and disabled controls, busy dialogs and unrelated UI',()=>{
 const f=fixture();for(const button of f.root.querySelectorAll('[disabled],[inert] button'))button.dispatchEvent(new MouseEvent('click',{bubbles:true}));
 const other=document.createElement('button');document.body.append(other);other.click();
 f.root.setAttribute('aria-busy','true');f.root.querySelector('button')!.click();expect(f.confirm.play).not.toHaveBeenCalled();
});
it('uses master/SFX/mute and stops handling events after disposal',()=>{
 const f=fixture();f.preferences.setLevel('master',.5);f.preferences.setLevel('sfx',.4);expect(f.confirm.volume).toBeCloseTo(.12);
 f.preferences.setMuted(true);expect(f.back.volume).toBe(0);dispose?.();dispose=undefined;
 f.root.querySelector('button')!.click();expect(f.confirm.play).not.toHaveBeenCalled();expect(f.confirm.pause).toHaveBeenCalledOnce();
});
