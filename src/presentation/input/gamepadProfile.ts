import type {PadSample} from './deviceInput';
/** Chromium Android's UnknownGamepadMappings still normalizes XYAB and the first four stick axes.
 * https://chromium.googlesource.com/chromium/src/+/HEAD/device/gamepad/android/java/src/org/chromium/device/gamepad/GamepadMappings.java
 * Extra axes can include resting triggers, so do not use them for activity/neutral detection.
 */
export function gamepadProfile(pad:PadSample,userAgent:string):'standard'|'android'|null {
 if(pad.mapping==='standard')return 'standard';
 if(pad.mapping===''&&/Android/i.test(userAgent)&&/(?:Chrome|Chromium)\//.test(userAgent)&&pad.buttons.length>=16&&pad.axes.length>=4)return 'android';
 return null;
}
export function normalizeGamepad(pad:PadSample,userAgent:string):PadSample|null {
 const profile=gamepadProfile(pad,userAgent);
 if(profile==='standard')return pad;
 if(profile==='android')return {id:pad.id,index:pad.index,mapping:'standard',buttons:pad.buttons.slice(0,17),axes:pad.axes.slice(0,4)};
 return null;
}
