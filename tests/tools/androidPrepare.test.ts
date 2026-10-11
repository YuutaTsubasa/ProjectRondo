import {describe,it,expect} from 'vitest';
import {prepareManifest,prepareGradle} from '../../tools/android/prepare.mjs';

describe('Android playtest preparation',()=>{
 it('sets only the main activity landscape and remains repeatable',()=>{
  const input='<manifest><activity android:name=".MainActivity" android:exported="true"><intent-filter/></activity><activity android:name=".Other" /></manifest>';
  const output=prepareManifest(input);
  expect(output).toContain('android:screenOrientation="sensorLandscape"');
  expect(output).toContain('<activity android:name=".Other" />');
  expect(prepareManifest(output)).toBe(output);
 });
 it('fails instead of silently losing landscape when the generated template changes',()=>{
  expect(()=>prepareManifest('<manifest/>')).toThrow('MainActivity');
 });
 it('configures only debug signing, preserves release configuration and is repeatable',()=>{
  const input='android { buildTypes { getByName("release") { isMinifyEnabled = true } } }';
  const output=prepareGradle(input);
  expect(output.startsWith(input)).toBe(true);
  expect(output).toContain('signingConfigs.getByName("debug")');
  expect(output).not.toContain('signingConfigs.getByName("release")');
  expect(output).toContain('playtest.keystore');
  expect(prepareGradle(output)).toBe(output);
 });
});
