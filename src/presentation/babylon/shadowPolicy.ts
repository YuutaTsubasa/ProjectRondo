// Pure shadow policy — NO babylon imports, so it unit-tests in the node env (see vite.config.ts,
// `environment: 'node'`). knight.ts imports HEAD_MESHES from here rather than declaring its own, so
// the face-material list and the shadow-receiver list cannot drift apart.

/** The head group, by mesh name. `Mesh_0` is the whole head — face, hair and neck collar, 242k of the
 *  character's ~320k vertices — and `Mesh_32`/`Mesh_33` are the two eyeballs. Identified from bind-pose
 *  bounding boxes against the `Head` and `CC_Base_*_Eye` bones, then confirmed by rendering `Mesh_0`
 *  alone. The other 31 meshes (`tripo_part_*`) are body and armour; `knightReceivesShadow` below marks
 *  all 31 of them as shadow receivers.
 *
 *  Two consumers share this list on purpose: `knight.ts` gives these meshes their own face material,
 *  and `knightReceivesShadow` below excludes them from receiving shadows. One definition means the
 *  two cannot drift apart. */
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
