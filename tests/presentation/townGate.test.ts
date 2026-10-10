import {expect,it} from 'vitest';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {gateCollisionBounds} from '../../src/presentation/town/townGate';
import {townCameraPosition} from '../../src/presentation/town/townCamera';
it('keeps the ground-level passage and camera open while supporting both piers and the arch',()=>{
 const bounds={min:new Vector3(-6,0,-45.5),max:new Vector3(6,11,-40.5)};
 const solids=gateCollisionBounds(bounds);
 const contains=(x:number,y:number,z:number)=>solids.some(b=>x>=b.min.x&&x<=b.max.x&&y>=b.min.y&&y<=b.max.y&&z>=b.min.z&&z<=b.max.z);
 for(const x of [-1.5,0,1.5])for(const y of [.1,1.2,2.4])expect(contains(x,y,-43)).toBe(false);
 expect(contains(-4,1,-43)).toBe(true);expect(contains(4,1,-43)).toBe(true);expect(contains(0,8,-43)).toBe(true);
 const target=new Vector3(0,2,-39),desired=new Vector3(0,3,-47);
 expect(townCameraPosition(target,desired,solids)).toEqual(desired);
 for(const box of solids){expect(box.min.x).toBeLessThan(box.max.x);expect(box.min.y).toBeLessThan(box.max.y);expect(box.min.z).toBeLessThan(box.max.z);}
});
