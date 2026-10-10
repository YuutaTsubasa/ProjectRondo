import {onDestroy} from 'svelte';

/** Keep the owning screen (and its gameplay input lock) alive through its outro. */
export function createExitMotion(duration: number) {
 let leaving = $state(false);
 let timer: ReturnType<typeof setTimeout> | undefined;
 onDestroy(() => { if (timer !== undefined) clearTimeout(timer); });
 return {
  get leaving() { return leaving; },
  run(action: () => void) {
   if (leaving) return;
   leaving = true;
   // Missing matchMedia also covers nonvisual renderers, where waiting has no benefit.
   if (!globalThis.matchMedia || matchMedia('(prefers-reduced-motion: reduce)').matches) action();
   else timer = setTimeout(action, duration);
  },
 };
}
