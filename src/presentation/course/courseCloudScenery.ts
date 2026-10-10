import type { Scene } from '@babylonjs/core/scene';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

/** A low, rolling cloud surface: no collision and no camera-axis-dependent horizon. */
export function createCourseCloudScenery(scene: Scene) {
  const material = new ShaderMaterial('courseCloudMist', scene, {
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
      uniform vec3 viewer;
      float hash(vec2 p) {return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p) {
        vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
          mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
      }
      void main() {
        vec2 p=mistPosition.xz*.045+vec2(elapsed*.009,elapsed*.003);
        float billow=noise(p)*.6+noise(p*2.1+3.7)*.28+noise(p*4.3)*.12;
        vec3 shade=mix(vec3(.42,.59,.71),vec3(.78,.87,.92),smoothstep(.18,.83,billow));
        float distanceToViewer=length(mistPosition.xz-viewer.xz);
        shade=mix(shade,vec3(.49,.65,.76),smoothstep(75.0,270.0,distanceToViewer));
        float edge=1.0-smoothstep(410.0,530.0,distanceToViewer);
        gl_FragColor=vec4(shade,edge);
      }`,
  }, { attributes: ['position'], uniforms: ['world', 'worldViewProjection', 'elapsed', 'viewer'], needAlphaBlending: true });
  material.backFaceCulling = false;
  material.forceDepthWrite = true;
  material.setFloat('elapsed', 0);
  material.setVector3('viewer', Vector3.Zero());
  const mesh = CreateGround('courseCloudSea', { width: 1400, height: 1400, subdivisions: 112 }, scene);
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], z = positions[i + 2];
    positions[i + 1] = Math.sin(x * .027) * Math.cos(z * .023) * 1.7
      + Math.sin(x * .057 + z * .049) * .8;
  }
  mesh.setVerticesData(VertexBuffer.PositionKind, positions);
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, mesh.getIndices()!, normals);
  mesh.setVerticesData(VertexBuffer.NormalKind, normals);
  mesh.position.set(0, -13, 100);
  mesh.material = material; mesh.isPickable = false;
  mesh.refreshBoundingInfo(); mesh.freezeWorldMatrix();
  return { update(elapsed: number) {
    material.setFloat('elapsed', elapsed);
    if (scene.activeCamera) material.setVector3('viewer', scene.activeCamera.globalPosition);
  } };
}
