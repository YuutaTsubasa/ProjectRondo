import {expect,it} from 'vitest';
import {visibleAtlasLabels} from '../../src/presentation/region/atlasLabels';
import {REGION_PLACES} from '../../src/domain/region/regionLayout';
it('keeps dense city labels apart while preserving the selected place',()=>{
 const labels=visibleAtlasLabels(REGION_PLACES,'city-market','city-market',1);
 expect(labels.has('city-market')).toBe(true);
 expect(labels.size).toBeLessThan(REGION_PLACES.length);
 const visible=REGION_PLACES.filter(p=>labels.has(p.id));
 for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){
  expect(Math.abs(visible[i].x-visible[j].x)>=90||Math.abs(visible[i].z-visible[j].z)>=28).toBe(true);
 }
 expect(visibleAtlasLabels(REGION_PLACES,'city-market','city-market',3.5).size).toBeGreaterThan(labels.size);
});
it('prioritizes selection over another overlapping tracked destination',()=>{
 const places=[{id:'tracked',x:0,z:0},{id:'selected',x:5,z:0},{id:'remote',x:150,z:0}];
 expect([...visibleAtlasLabels(places,'selected','tracked',1)]).toEqual(['selected','remote']);
});
