import {expect,it} from 'vitest';
import {swordSoundCrossed} from '../../src/presentation/audio/swordSound';
it('plays once as a real swing reaches its release, including skipped frames',()=>{
 expect(swordSoundCrossed(null,0)).toBe(false);
 expect(swordSoundCrossed(.06,.10)).toBe(true);
 expect(swordSoundCrossed(.10,.10)).toBe(false);
 expect(swordSoundCrossed(.10,.20)).toBe(false);
 expect(swordSoundCrossed(null,.18)).toBe(true);
});
it('does not play on cancellation or a held pause frame and rearms on the next swing',()=>{
 expect(swordSoundCrossed(.06,null)).toBe(false);
 expect(swordSoundCrossed(null,null)).toBe(false);
 expect(swordSoundCrossed(.3,.3)).toBe(false);
 expect(swordSoundCrossed(.3,.02)).toBe(false);
 expect(swordSoundCrossed(.02,.1)).toBe(true);
});
