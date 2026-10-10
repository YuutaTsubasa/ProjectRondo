// @vitest-environment jsdom
//
// vite.config.ts pins environment: 'node' for the suite; this file opts itself into jsdom because
// `createInput` binds real `window`/`document` listeners rather than exposing anything pure.
//
// The rule under test: the character runs by default and Shift walks (inverted from the naive
// "Shift sprints" mapping, per the project owner's post-playtest call on the climbing tower —
// jumping between platforms needs speed, so holding Shift just to move at a normal pace was
// tiring). `MovementInput.runRequested` still means "run this frame" on the domain side; this
// file only pins what the presentation layer reports before that boolean is even built.
import { describe, expect, it, afterEach } from 'vitest';
import { createInput } from '../../src/presentation/babylon/input';

const press = (key: string) => window.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
const release = (key: string) => window.dispatchEvent(new window.KeyboardEvent('keyup', { key, bubbles: true }));

describe('createInput — run/walk modifier', () => {
  let input: ReturnType<typeof createInput> | undefined;

  afterEach(() => {
    input?.dispose();
    input = undefined;
  });

  it('reports running with no key held', () => {
    input = createInput();
    expect(input.isWalkHeld()).toBe(false);
  });

  it('reports walking while Shift is held', () => {
    input = createInput();
    press('Shift');
    expect(input.isWalkHeld()).toBe(true);

    release('Shift');
    expect(input.isWalkHeld()).toBe(false);
  });

  it('falls back to the safe (running) state while disabled, even mid-hold', () => {
    input = createInput();
    press('Shift');
    expect(input.isWalkHeld()).toBe(true);

    input.setEnabled(false);
    expect(input.isWalkHeld()).toBe(false);

    // Re-enabling starts clean: the held-during-disable key was dropped, not remembered.
    input.setEnabled(true);
    expect(input.isWalkHeld()).toBe(false);
  });
});

import {deviceInput} from '../../src/presentation/input/deviceInput';
it('accepts touch actions through the same gameplay adapter and drops them on suspension',()=>{
 const input=createInput();deviceInput.touchAxis(.8,0);deviceInput.touchAction('jump');expect(input.axis().x).toBe(.8);expect(input.consumeJump()).toBe(true);expect(input.consumeJump()).toBe(false);
 input.setEnabled(false);deviceInput.touchAction('attack');input.setEnabled(true);expect(input.consumeAttack()).toBe(false);input.dispose();
});

it('only attacks on its own canvas, and 3D requires pointer lock first',()=>{
 const canvas=document.createElement('canvas');document.body.append(canvas);const input=createInput({canvas,camera:true});
 const press=()=>{const event=new Event('pointerdown',{bubbles:true});Object.assign(event,{button:0,pointerType:'mouse'});canvas.dispatchEvent(event);};
 press();expect(input.consumeAttack()).toBe(false);Object.defineProperty(document,'pointerLockElement',{configurable:true,value:canvas});press();expect(input.consumeAttack()).toBe(true);expect(input.consumeAttack()).toBe(false);
 input.dispose();canvas.remove();Object.defineProperty(document,'pointerLockElement',{configurable:true,value:null});
});

it('does not treat shared UI commands as keyboard gameplay input',()=>{
 const input=createInput();deviceInput.claim('touch');window.dispatchEvent(new KeyboardEvent('keydown',{key:'e'}));expect(deviceInput.getState().device).toBe('touch');input.dispose();
});
