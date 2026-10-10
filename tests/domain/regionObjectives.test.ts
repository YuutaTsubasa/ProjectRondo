import {expect,it} from 'vitest';
import {regionObjective,nearbyRegionPlace,restoreRegionCoursePosition} from '../../src/domain/region/regionObjectives';
it('guides all chapter stages and only offers nearby supported interaction',()=>{
 expect(regionObjective('arrival').placeId).toBe('homecoming');
 expect(regionObjective('signal').placeId).toBe('signal');
 expect(regionObjective('relay').placeId).toBe('course');
 expect(regionObjective('aqueduct').placeId).toBe('palace');
 expect(regionObjective('complete').placeId).toBeNull();
 const places=[{id:'signal',x:0,z:0},{id:'ridge',x:10,z:0}];
 expect(nearbyRegionPlace({x:1,y:1.2,z:0},places,()=>0)?.id).toBe('signal');
 expect(nearbyRegionPlace({x:1,y:8,z:0},places,()=>0)).toBeUndefined();
 expect(nearbyRegionPlace({x:5,y:1.2,z:0},places,()=>0)).toBeUndefined();
 expect(nearbyRegionPlace({x:NaN,y:1.2,z:0},places,()=>0)).toBeUndefined();
});

it('keeps existing relay saves elsewhere in the region in place',()=>{
 const atSignal={x:0,y:1.3,z:-118};
 expect(restoreRegionCoursePosition(atSignal,'relay')).toBe(atSignal);
 expect(regionObjective('relay').detail).toContain('白塔廣場西北側');
});
