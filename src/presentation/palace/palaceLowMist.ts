import type { Scene } from '@babylonjs/core/scene';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';

/** Fade actual building height, including far bases viewed from elevated terraces. */
export class PalaceHeightMist extends MaterialPluginBase {
  constructor(material: PBRMaterial) { super(material, 'PalaceHeightMist', 200, {}, true, true); }
  getCustomCode(shaderType: string): Record<string, string> | null {
    if (shaderType !== 'fragment') return null;
    return { CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
      float palaceMist = 1.0 - smoothstep(-8.5, -1.5, vPositionW.y);
      finalColor.rgb = mix(finalColor.rgb, vec3(.49,.65,.76), palaceMist);
    ` };
  }
}

/** Opaque cloud sea hides every foundation below it; no gameplay collision or shadows. */
export function createPalaceLowMist(scene: Scene) {
  const material = new ShaderMaterial('palaceLowMist', scene, {
    vertexSource: `precision highp float;
      attribute vec3 position;
      uniform mat4 world;
      uniform mat4 worldViewProjection;
      varying vec3 mistPosition;
      void main() {
        mistPosition = (world * vec4(position, 1.0)).xyz;
        gl_Position = worldViewProjection * vec4(position, 1.0);
      }`,
    fragmentSource: `precision highp float;
      varying vec3 mistPosition;
      uniform float elapsed;
      float hash(vec2 p) {return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453);}
      float noise(vec2 p) {
        vec2 i=floor(p), f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
          mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
      }
      void main() {
        vec2 p=mistPosition.xz*vec2(.06,.08)+vec2(elapsed*.014,0.0);
        float billow=noise(p)*.65+noise(p*2.1+3.7)*.25+noise(p*4.3)*.1;

        // Linear scene color: the shared ACES pipeline grades mist with the architecture.
        vec3 shade=mix(vec3(.39,.55,.68),vec3(.58,.73,.82),billow);
        // The side camera stays at z=25. Fade before the far clip, avoiding a hard horizon seam.
        float horizon=1.0-smoothstep(100.0,350.0,25.0-mistPosition.z);
        gl_FragColor=vec4(shade,horizon);
      }`,
  }, { attributes: ['position'], uniforms: ['world','worldViewProjection','elapsed'], needAlphaBlending: true });
  material.backFaceCulling = false;
  material.forceDepthWrite = true;
  material.setFloat('elapsed',0);
  const mist = CreateGround('palaceLowMist', {width:1400,height:1400}, scene);
  // Covers the camera far range; geometry below the sea is depth-occluded.
  mist.position.set(96,-9,-150);
  mist.material = material;
  mist.isPickable = false;
  mist.freezeWorldMatrix();
  return { update(elapsed: number) { material.setFloat('elapsed',elapsed); } };
}
