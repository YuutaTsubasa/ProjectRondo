import {deviceInput} from '../input/deviceInput';
/** Keyboard input for whichever level is on screen: `characterRig` builds one per rig, and both
 *  the hub and the tower are built through it. A WASD planar axis, a held walk modifier, an
 *  edge-triggered jump and contextual attack.
 *  The character runs by default; holding the modifier walks instead. */
export interface InputState {
  /** Raw WASD axis: x = right(+)/left(-), y = forward(+)/back(-). */
  axis(): { x: number; y: number };
  /** Returns true once per jump key-press (edge-triggered, then consumed). */
  consumeJump(): boolean;
  /** J: a single contextual sword / shield attack edge. */
  consumeAttack(): boolean;
  /** True while a Shift key is held, asking the character to walk instead of its default run. A
   *  modifier is a state, so it is polled rather than consumed. */
  isWalkHeld(): boolean;
  /** Enables/disables reading input (e.g. while an AVG overlay owns focus). While disabled, the raw
   * key handlers are inert (no tracking, no preventDefault, so the overlay's own Enter/Space still
   * work), and any already-held keys/queued actions are dropped. */
  setEnabled(value: boolean): void;
  /** Removes the window/document listeners. */
  dispose(): void;
}

const isJumpKey = (k: string): boolean => k === ' ' || k === 'spacebar';
// Both Shift keys report the same `key` value, so one entry covers left and right.
const WALK_KEY = 'shift';
/** Keys the game consumes; their browser defaults (Space scrolls/activates focus) are suppressed. */
const GAME_KEYS = new Set(['w', 'a', 's', 'd', ' ', 'spacebar', 'j', WALK_KEY]);

export function createInput(options: {canvas?:HTMLCanvasElement;camera?:boolean;interact?:boolean} = {}): InputState {
  const down = new Set<string>();
  let jumpQueued = false;
  let attackQueued = false;
  let enabled = true;
  const owner=deviceInput.registerGameplay(!!options.camera,!!options.interact);owner.setEnabled(true);
  const stopActions=deviceInput.onAction(action=>{if(enabled){if(action==='jump')jumpQueued=true;else attackQueued=true;}});
  const pointer=(event:PointerEvent)=>{
    if(!enabled||event.pointerType==='touch'||event.button!==0||event.target!==options.canvas)return;
    if(options.camera&&document.pointerLockElement!==options.canvas)return;
    deviceInput.claim('keyboard');attackQueued=true;
  };
  options.canvas?.addEventListener('pointerdown',pointer);

  const onKeyDown = (e: KeyboardEvent) => {
    if (!enabled) return; // inert while suspended: no tracking, no preventDefault (overlay owns the key)
    if((e.target as Element)?.closest?.('input,select,textarea,[contenteditable=true]'))return;
    const k = e.key.toLowerCase();
    if(!GAME_KEYS.has(k)||e.ctrlKey||e.metaKey||e.altKey)return;
    deviceInput.claim('keyboard');
    if (GAME_KEYS.has(k)) e.preventDefault();
    if (!e.repeat && !down.has(k) && isJumpKey(k)) jumpQueued = true;
    if (!e.repeat && !down.has(k) && k === 'j') attackQueued = true;
    down.add(k);
  };
  const onKeyUp = (e: KeyboardEvent) => { if (!enabled) return; down.delete(e.key.toLowerCase()); };
  // A key released while the window is unfocused never delivers keyup here, leaving it "stuck" down
  // (hold W, tab away, release, tab back → the character keeps running, which is what it does with
  // nothing held). A stuck Shift is the same failure in the other direction: the character walks
  // until something clears it. Drop all held state whenever we lose focus or the tab is hidden.
  const clear = () => { down.clear(); jumpQueued = false; attackQueued = false; };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clear);
  document.addEventListener('visibilitychange', clear);

  return {
    axis: () => enabled
      ? deviceInput.getState().device!=='keyboard'?deviceInput.axis():{
          x: (down.has('d') ? 1 : 0) - (down.has('a') ? 1 : 0),
          y: (down.has('w') ? 1 : 0) - (down.has('s') ? 1 : 0),
        }
      : { x: 0, y: 0 },
    isWalkHeld: () => {
      if (!enabled) return false;
      if (deviceInput.getState().device==='keyboard' && down.has(WALK_KEY)) return true;
      if (deviceInput.walkHeld()) return true;
      // A light analog tilt walks; zero is "no input", not a walk.
      const {x,y}=deviceInput.axis(),tilt=Math.hypot(x,y);
      return tilt>0 && tilt<.55;
    },
    consumeJump: () => {
      if (!enabled) { jumpQueued = false; return false; }
      const j = jumpQueued;
      jumpQueued = false;
      return j;
    },
    consumeAttack: () => {
      const pressed = enabled && attackQueued;
      attackQueued = false;
      return pressed;
    },
    setEnabled: (value: boolean) => { enabled = value; owner.setEnabled(value); if (!value) clear(); },
    dispose: () => {
      owner.dispose();stopActions();options.canvas?.removeEventListener('pointerdown',pointer);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', clear);
    },
  };
}
