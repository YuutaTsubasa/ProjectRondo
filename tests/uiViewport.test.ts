import {it,expect} from 'vitest';
import {uiViewport} from '../src/presentation/layout/uiViewport';
it.each([[1920,1080,1],[960,540,.5],[1280,720,2/3],[2560,1440,4/3],[1280,800,2/3],[844,390,390/1080]])('keeps a 1080p design at %s x %s',(w,h,s)=>{
 const v=uiViewport(w,h);expect(v.scale).toBeCloseTo(s);expect(v.width).toBeGreaterThanOrEqual(1920);expect(v.height).toBeGreaterThanOrEqual(1080);
 expect(v.width*v.scale).toBeCloseTo(w);expect(v.height*v.scale).toBeCloseTo(h);
});
it('has a finite fallback during a zero-sized resize',()=>{const v=uiViewport(0,0);expect(Number.isFinite(v.scale)&&v.scale>0).toBe(true);});
