import type {UiAction} from './deviceInput';
function visible(el:Element){for(let n:Element|null=el;n;n=n.parentElement){const style=getComputedStyle(n);if(n.hasAttribute('hidden')||style.display==='none'||style.visibility==='hidden')return false;}return true;}
function priority(el:Element){let z=0,depth=0;for(let n:Element|null=el;n;n=n.parentElement){z=Math.max(z,Number(getComputedStyle(n).zIndex)||0);depth++;}return z+depth/1000;}
export function inputScope():Element|null{
 const scopes=[...document.querySelectorAll('[data-input-scope],[role="dialog"][aria-modal="true"]')].filter(visible);
 return scopes.sort((a,b)=>priority(a)-priority(b)).at(-1)??null;
}
export function sendKey(key:string,target:EventTarget=document.activeElement??window){
 const down=new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true});
 target.dispatchEvent(down);
 target.dispatchEvent(new KeyboardEvent('keyup',{key,bubbles:true,cancelable:true}));
 return down.defaultPrevented;
}
function controls(scope:Element){return [...scope.querySelectorAll<HTMLElement>('button,input,select,[role="button"][tabindex]')].filter(el=>!el.closest('[inert]')&&!el.matches(':disabled,[tabindex="-1"]')&&visible(el));}
function click(el:Element){el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));}
/** Navigate real controls; never forward gamepad confirm as a gameplay keyboard press. */
export function navigateUi(action:UiAction){
 const scope=inputScope();if(!scope||scope.closest('[inert]')||scope.getAttribute('aria-busy')==='true')return;
 if(scope.matches('.is-title')){const begin=scope.querySelector('button.begin');if(begin)click(begin);return;}
 const items=controls(scope);let current=document.activeElement as HTMLElement|null;
 if(!current||!scope.contains(current)||current.closest('[inert]'))current=null;
 if(action==='back'){sendKey('Escape',current??scope);return;}
 const map=scope.querySelector('[data-region-atlas]');
 if(map){
  const keys:Partial<Record<UiAction,string>>={zoomIn:'+',zoomOut:'-',center:'t',markers:'r',interact:'r',panUp:'ArrowUp',panDown:'ArrowDown',panLeft:'ArrowLeft',panRight:'ArrowRight'};
  if(keys[action]){sendKey(keys[action]!,action.startsWith('pan')?map:scope);return;}
 }
 if(action==='interact'){
  if(!scope.closest('[data-dialogue]'))return;
  const advance=scope.querySelector<HTMLElement>('[aria-label="advance dialogue"]');
  if(advance&&!advance.closest('[inert]')){advance.focus();click(advance);return;}
  // Dialogue choices/backlog own the top modal; X confirms its focused control.
  if(scope.matches('[role="dialog"]'))navigateUi('confirm');
  return;
 }
 if(action.startsWith('pan')){
  const scroll=scope.querySelector<HTMLElement>('[data-input-scroll]')??(scope instanceof HTMLElement?scope:null);if(scroll){scroll.scrollTop+=action==='panUp'?-90:action==='panDown'?90:0;}return;
 }
 if(!items.length)return;
 if(action==='confirm'){
  const target=current&&items.includes(current)?current:items.find(el=>el.matches('[data-game-entry]'))??items[0];
  target.focus();if(!target.matches('input,select'))click(target);return;
 }
 if((action==='left'||action==='right')&&current?.matches('input[type="range"],select')){
  const direction=action==='right'?1:-1;
  if(current instanceof HTMLInputElement){const value=Math.max(Number(current.min||0),Math.min(Number(current.max||100),Number(current.value)+direction*Number(current.step||1)));current.value=String(value);current.dispatchEvent(new Event('input',{bubbles:true}));}
  else if(current instanceof HTMLSelectElement){const options=[...current.options].filter(o=>!o.disabled);const index=options.indexOf(current.selectedOptions[0]);const next=options[Math.max(0,Math.min(options.length-1,index+direction))];if(next){current.value=next.value;current.dispatchEvent(new Event('change',{bubbles:true}));}}
  return;
 }
 if(!['up','down','left','right','next','previous'].includes(action))return;
 const i=current?items.indexOf(current):-1,back=action==='up'||action==='left'||action==='previous';
 let next=items[(i+(back?-1:1)+items.length)%items.length];
 if(current&&i>=0&&!['next','previous'].includes(action)){
  const rect=current.getBoundingClientRect(),cx=rect.x+rect.width/2,cy=rect.y+rect.height/2,horizontal=action==='left'||action==='right';
  let best=Infinity;
  for(const candidate of items){if(candidate===current)continue;const r=candidate.getBoundingClientRect(),dx=r.x+r.width/2-cx,dy=r.y+r.height/2-cy;const primary=(horizontal?dx:dy)*(back?-1:1),cross=Math.abs(horizontal?dy:dx);if(primary>4){const score=primary+cross*3;if(score<best){best=score;next=candidate;}}}
 }
 next?.focus();next?.scrollIntoView?.({block:'nearest',inline:'nearest'});
}
