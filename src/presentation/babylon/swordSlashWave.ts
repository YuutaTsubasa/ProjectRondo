import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Constants } from '@babylonjs/core/Engines/constants';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { SWORD_ACTIVE_START, SWORD_ACTIVE_END } from '../../domain/hub/character/swordAttack';

export const SLASH_WAVE_LIFETIME = .55;
const SEGMENTS = 32;

/** A short-lived crescent left in the strike's world space. Cosmetic: never extends the hit window. */
export function createSwordSlashWave(scene: Scene) {
  const mesh = new Mesh('swordSlashWave', scene);
  const material = new StandardMaterial('swordSlashWaveMaterial', scene);
  material.disableLighting = true;
  material.emissiveColor = new Color3(.8, 2.4, 3);
  material.backFaceCulling = false;
  material.alphaMode = Constants.ALPHA_ADD;
  mesh.material = material;
  mesh.isPickable = false;
  mesh.hasVertexAlpha = true;
  mesh.rotationQuaternion = Quaternion.Identity();
  // A tapered diamond cross-section gives the side-on palace camera real visible thickness.
  const positions:number[] = [], colors:number[] = [], indices:number[] = [];
  for (let i=0;i<=SEGMENTS;i++) {
    const angle = -1.05 + 2.1*i/SEGMENTS;
    const taper = Math.sin(Math.PI*i/SEGMENTS);
    for (const [radius,height,alpha] of [[1.85,0,1],[1.63,.14*taper,.65],[1.32,0,0],[1.63,-.14*taper,.65]]) {
      positions.push(Math.sin(angle)*radius,height,Math.cos(angle)*radius);
      colors.push(1,1,1,alpha*taper);
    }
    if(i<SEGMENTS)for(let side=0;side<4;side++) {
      const a=i*4+side,b=i*4+(side+1)%4;
      indices.push(a,b,a+4,b,b+4,a+4);
    }
  }
  mesh.setVerticesData('position',positions);
  mesh.setVerticesData('color',colors);
  mesh.setIndices(indices);
  mesh.setEnabled(false);
  let age:number|null = null, previous:number|null = null;
  const anchor = new Vector3();
  const clear=()=>{age=null;previous=null;mesh.setEnabled(false);};
  return {
    mesh,
    update(seconds:number|null, origin:Vector3, forward:Vector3, deltaSeconds:number, cancelled:boolean) {
      if(cancelled || age!==null && Vector3.Distance(origin,anchor)>5) {clear();return;}
      const fresh = seconds!==null && (previous===null || seconds<previous);
      if(fresh){age=null;mesh.setEnabled(false);}
      const dt = seconds!==null && previous!==null ? Math.max(0,seconds-previous)
        : Number.isFinite(deltaSeconds) ? Math.max(0,Math.min(.1,deltaSeconds)) : 0;
      if(age!==null)age+=dt;
      if(seconds!==null && seconds>=SWORD_ACTIVE_START && age===null && (fresh || previous!==null && previous<SWORD_ACTIVE_START)) {
        age=seconds-SWORD_ACTIVE_START;
        anchor.copyFrom(origin);mesh.position.copyFrom(origin);
        mesh.rotationQuaternion!.copyFrom(Quaternion.RotationAxis(Vector3.Up(),Math.atan2(forward.x,forward.z)));
      }
      previous=seconds;
      if(age===null || age>=SLASH_WAVE_LIFETIME){mesh.setEnabled(false);return;}
      const growth=Math.min(1,age/(SWORD_ACTIVE_END-SWORD_ACTIVE_START));
      const fade=Math.max(0,1-Math.max(0,age-.16)/(SLASH_WAVE_LIFETIME-.16));
      mesh.scaling.setAll(.88+.12*growth+.08*(age/SLASH_WAVE_LIFETIME));
      mesh.visibility=(.4+.6*growth)*fade*fade;
      mesh.setEnabled(true);
    },
    dispose(){clear();mesh.dispose();material.dispose();},
  };
}
