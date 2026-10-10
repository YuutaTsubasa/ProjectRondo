import {expect,it} from 'vitest';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {arcadeCollisionBounds} from '../../src/presentation/town/townArcade';
import {townCameraPosition} from '../../src/presentation/town/townCamera';

it('leaves both arcade axes open at player height but blocks the four piers and vault',()=>{
 const bounds={min:new Vector3(21.2,0,21.58),max:new Vector3(26.8,6,26.42)};
 const solids=arcadeCollisionBounds(bounds);
 const contains=(x:number,y:number,z:number)=>solids.some(b=>x>=b.min.x&&x<=b.max.x&&y>=b.min.y&&y<=b.max.y&&z>=b.min.z&&z<=b.max.z);
 for(let offset=-4;offset<=4;offset+=.25)for(const lane of [-.65,0,.65])for(const y of [.1,1.2,2.4]){
  expect(contains(24+offset,y,24+lane)).toBe(false);
  expect(contains(24+lane,y,24+offset)).toBe(false);
 }
 for(const x of [21.8,26.2])for(const z of [22.2,25.8])expect(contains(x,1,z)).toBe(true);
 expect(contains(24,4.5,24)).toBe(true);
 // Follow camera can cross each opening; a ray through a pier must shorten.
 for(const direction of [new Vector3(1,0,0),new Vector3(0,0,1)]){
  const aim=new Vector3(24,2,24).add(direction.scale(4)),desired=new Vector3(24,2.5,24).subtract(direction.scale(4));
  expect(townCameraPosition(aim,desired,solids)).toEqual(desired);
 }
 expect(townCameraPosition(new Vector3(20,2,22.2),new Vector3(24,2,22.2),solids).x).toBeLessThan(21.8);
 for(const box of solids){expect(box.min.asArray().every(Number.isFinite)).toBe(true);expect(box.min.x).toBeLessThan(box.max.x);expect(box.min.y).toBeLessThan(box.max.y);expect(box.min.z).toBeLessThan(box.max.z);}
});
