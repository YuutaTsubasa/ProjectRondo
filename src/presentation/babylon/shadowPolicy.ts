// Pure shadow policy — NO babylon imports, so it unit-tests in the node env (see vite.config.ts,
// `environment: 'node'`). knight.ts imports HEAD_MESHES from here rather than declaring its own, so
// the face-material list and the shadow-receiver list cannot drift apart.

/** The three meshes that make up the knight's head. Mesh_0 is face, hair AND the neck collar. */
export const HEAD_MESHES: readonly string[] = ['Mesh_0', 'Mesh_32', 'Mesh_33'];

/**
 * True for every knight mesh that should receive the sun's shadow — everything but the head.
 *
 * The head still CASTS; it just never has a shadow drawn onto it. A shadow edge across a stylised
 * face reads badly, and the face is among the lowest-resolution regions of the shadow map, so it is
 * where stair-stepping would show first. Because Mesh_0 carries the neck collar too, the collar
 * does not receive either — the same coupling FACE_EMISSIVE already lives with.
 */
export function knightReceivesShadow(meshName: string): boolean {
  return !HEAD_MESHES.includes(meshName);
}
