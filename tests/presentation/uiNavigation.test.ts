// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {navigateUi} from '../../src/presentation/input/uiNavigation';
afterEach(()=>{document.body.innerHTML='';});
it('confirms only the top modal, skips disabled controls, restores a missing focus',()=>{
 document.body.innerHTML='<main data-input-scope><button id="under">under</button></main><div role="dialog" aria-modal="true"><button disabled>no</button><button id="yes">yes</button><button id="last">last</button></div>';
 const yes=vi.fn(),under=vi.fn();document.querySelector('#yes')!.addEventListener('click',yes);document.querySelector('#under')!.addEventListener('click',under);
 navigateUi('confirm');expect(yes).toHaveBeenCalledOnce();expect(under).not.toHaveBeenCalled();navigateUi('next');expect(document.activeElement?.id).toBe('last');
});
it('adjusts range and select controls via their real events',()=>{
 document.body.innerHTML='<div role="dialog" aria-modal="true"><input type="range" min="0" max="100" value="50" step="1"><select><option>a</option><option>b</option></select></div>';
 const range=document.querySelector('input')!,select=document.querySelector('select')!,changed=vi.fn();range.addEventListener('input',changed);range.focus();navigateUi('right');expect(range.value).toBe('51');expect(changed).toHaveBeenCalledOnce();
 select.focus();navigateUi('right');expect(select.selectedIndex).toBe(1);
});
it('does not activate a departing modal or controls under it',()=>{
 document.body.innerHTML='<main data-input-scope><button id="under">under</button></main><div role="dialog" aria-modal="true" inert><button>leaving</button></div>';
 const under=vi.fn();document.querySelector('#under')!.addEventListener('click',under);navigateUi('confirm');expect(under).not.toHaveBeenCalled();
});

it('uses X to advance dialogue even when a toolbar button has focus',()=>{
 document.body.innerHTML='<div data-input-scope data-dialogue><button id="skip">skip</button><button aria-label="advance dialogue">next</button></div>';
 const next=vi.fn(),skip=vi.fn();document.querySelector('[aria-label]')!.addEventListener('click',next);document.querySelector('#skip')!.addEventListener('click',skip);(document.querySelector('#skip') as HTMLElement).focus();
 navigateUi('interact');expect(next).toHaveBeenCalledOnce();expect(skip).not.toHaveBeenCalled();
});
it('uses X for the selected dialogue choice, but not generic menu controls',()=>{
 document.body.innerHTML='<div data-input-scope data-dialogue><div role="dialog" aria-modal="true"><button id="choice">choice</button></div></div>';
 const choice=vi.fn();document.querySelector('#choice')!.addEventListener('click',choice);navigateUi('interact');expect(choice).toHaveBeenCalledOnce();
 document.body.innerHTML='<div data-input-scope><button id="quit">quit</button></div>';const quit=vi.fn();document.querySelector('#quit')!.addEventListener('click',quit);navigateUi('interact');expect(quit).not.toHaveBeenCalled();
});
