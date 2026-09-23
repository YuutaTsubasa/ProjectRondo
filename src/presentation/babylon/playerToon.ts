import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { PlayerMaterialSettings } from './playerModel';

/**
 * Game approximation of the imported MToon light/shade ramp. StandardMaterial supplies skinning,
 * textures, shadow visibility and fog; this replaces only its surface lighting before fog and the
 * image-processing pass. It does not implement MToon rim, UV animation or shade-multiply textures.
 * The converter validates the subset instead of silently discarding an active unsupported feature.
 */
export class PlayerToon extends MaterialPluginBase {
  private readonly towardSun = new Vector3(0, 1, 0);
  private readonly shade: Color3;
  constructor(material: StandardMaterial, private readonly settings: PlayerMaterialSettings) {
    super(material, 'PlayerToon', 200, {}, true, true);
    this.shade = Color3.FromArray([...settings.shadeColorFactor]).toGammaSpace();
  }

  getUniforms() {
    return {
      ubo: [
        { name: 'playerSun', size: 3, type: 'vec3' },
        { name: 'playerShade', size: 3, type: 'vec3' },
        { name: 'playerRamp', size: 3, type: 'vec3' },
        { name: 'playerTextureLinear', size: 1, type: 'float' },
        { name: 'playerSurfaceBlend', size: 1, type: 'float' },
      ],
      fragment: 'uniform vec3 playerSun;\nuniform vec3 playerShade;\nuniform vec3 playerRamp;\nuniform float playerTextureLinear;\nuniform float playerSurfaceBlend;',
    };
  }

  bindForSubMesh(buffer: UniformBuffer): void {
    const sun = this._material.getScene().lights.find((light) => light instanceof DirectionalLight);
    if (sun instanceof DirectionalLight) sun.direction.normalizeToRef(this.towardSun).negateInPlace();
    // glTF uses hardware sRGB textures; StandardMaterial expects gamma-space diffuse samples.
    const texture = (this._material as StandardMaterial).diffuseTexture?.getInternalTexture();
    buffer.updateFloat('playerTextureLinear', texture?._useSRGBBuffer ? 1 : 0);
    buffer.updateFloat('playerSurfaceBlend', this.settings.surfaceColorBlend ? 1 : 0);
    buffer.updateVector3('playerSun', this.towardSun);
    buffer.updateColor3('playerShade', this.shade);
    buffer.updateFloat3('playerRamp', this.settings.shadingShiftFactor,
      this.settings.shadingToonyFactor, this.settings.giEqualizationFactor);
  }

  getCustomCode(shaderType: string): Record<string, string> | null {
    if (shaderType === 'vertex') return {
      CUSTOM_VERTEX_DEFINITIONS: 'varying float playerSurfaceWeight;',
      CUSTOM_VERTEX_MAIN_END: `
        playerSurfaceWeight = 0.0;
        #ifdef VERTEXCOLOR
          playerSurfaceWeight = colorUpdated.a;
        #endif
      `,
    };
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: 'varying float playerSurfaceWeight;',
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
        #ifdef VERTEXCOLOR
          // Surface-blend colors are not multiplicative glTF tints.
          if (playerSurfaceBlend > 0.5) baseColor.rgb /= max(vColor.rgb, vec3(0.00001));
        #endif
      `,
      CUSTOM_FRAGMENT_BEFORE_FOG: `
        float playerNdotL = dot(normalW, playerSun);
        float playerBand = clamp((playerNdotL + playerRamp.x) / max(0.001, 1.0 - playerRamp.y), 0.0, 1.0);
        float playerVisibility = numLights > 0.0 ? clamp(aggShadow, 0.0, 1.0) : 1.0;
        playerBand *= playerVisibility;
        vec3 playerLight = mix(playerShade, diffuseColor, playerBand);
        vec3 playerEnvironment = mix(clamp(diffuseBase, vec3(0.0), vec3(1.0)), vec3(1.0), playerRamp.z);
        vec3 playerTexel = playerTextureLinear > 0.5 ? toGammaSpace(baseColor.rgb) : baseColor.rgb;
        color.rgb = playerTexel * playerLight * playerEnvironment;

        #ifdef VERTEXCOLOR
          vec3 joinedSkin = toGammaSpace(vColor.rgb) * playerLight / max(diffuseColor, vec3(0.00001));
          if (playerSurfaceBlend > 0.5) color.rgb = mix(color.rgb, joinedSkin * playerEnvironment, playerSurfaceWeight);
        #endif
      `,
    };
  }
}
