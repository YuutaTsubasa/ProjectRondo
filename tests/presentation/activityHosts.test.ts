import {expect,it} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {ACTIVITY_HOSTS,getActivityHost} from '../../src/content/activityHosts';
import {REGION_INTERACTION_PLACES,regionHeight} from '../../src/domain/region/regionLayout';
import {createActivityHosts} from '../../src/presentation/region/activityHosts';
it('gives every existing stage exactly one named host with a greeting',()=>{
 expect(ACTIVITY_HOSTS.map(h=>h.stageId).sort()).toEqual(REGION_INTERACTION_PLACES.filter(p=>p.kind==='expedition').map(p=>p.id).sort());
 expect(new Set(ACTIVITY_HOSTS.map(h=>h.name)).size).toBe(10);expect(getActivityHost('signal')).toBeUndefined();
 for(const host of ACTIVITY_HOSTS)expect(host.greeting.length).toBeGreaterThan(8);
});
it('shares economical human geometry, places feet at interaction anchors, and culls at distance',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try{const hosts=createActivityHosts(scene);expect(hosts.meshes).toHaveLength(10);expect(scene.skeletons).toHaveLength(0);expect(scene.animationGroups).toHaveLength(0);
 for(const host of ACTIVITY_HOSTS){const mesh=scene.getMeshByName('region-activity-host-'+host.stageId)!;const anchor=REGION_INTERACTION_PLACES.find(p=>p.id===host.stageId)!;
 expect(mesh.position.asArray()).toEqual([anchor.x,regionHeight(anchor.x,anchor.z),anchor.z]);mesh.computeWorldMatrix(true);expect(mesh.getBoundingInfo().boundingBox.maximumWorld.y-mesh.position.y).toBeGreaterThan(1.7);expect(mesh.getTotalVertices()).toBeLessThan(4000);expect(mesh.isPickable).toBe(false);}
 for(const mesh of hosts.meshes){expect(mesh.getLODLevels()).toHaveLength(1);expect(mesh.getLODLevels()[0].distanceOrScreenCoverage).toBe(85);expect(mesh.getLODLevels()[0].mesh).toBeNull();}
 expect(new Set(hosts.meshes.map(m=>m.geometry)).size).toBe(2);expect(new Set(hosts.meshes.map(m=>m.material)).size).toBe(1);
 }finally{scene.dispose();engine.dispose();}
});
