/** Focus stays inside map/pause/recovery dialogs, with restoration to the caller. */
export function regionModal(node:HTMLElement){
 const previous=document.activeElement as HTMLElement|null;
 const buttons=()=>[...node.querySelectorAll<HTMLElement>('button:not([disabled]),[href],input,[tabindex="0"]')];
 const timer=setTimeout(()=>{(buttons().find(button=>button.hasAttribute('data-game-entry'))??buttons()[0]??node).focus();},0);
 const trap=(event:KeyboardEvent)=>{if(event.key!=='Tab')return;const items=buttons();if(!items.length){event.preventDefault();node.focus();return;}const index=items.indexOf(document.activeElement as HTMLElement);event.preventDefault();items[(index+(event.shiftKey?items.length-1:1)+items.length)%items.length].focus();};
 node.addEventListener('keydown',trap);
 return {destroy(){clearTimeout(timer);node.removeEventListener('keydown',trap);if(previous?.isConnected)previous.focus();}};
}
