// Pure shadow policy — NO babylon imports, so it unit-tests in the node env (see vite.config.ts,
// `environment: 'node'`). knight.ts imports HEAD_MESHES from here rather than declaring its own, so
// the face-material list and the shadow-receiver list cannot drift apart.

/** The head group of the medieval knight, by mesh name. `Mesh_1` is the face + hair, `Mesh_20` the
 *  inner head (mouth/brows), and `Mesh_43`/`Mesh_46` are the two eyeballs — the top-of-body cluster by
 *  world height, confirmed by rendering them alone (a clean floating head, both eyes present). Both
 *  eyeballs must be listed or the uncovered one keeps the lit shared material and reads dark against
 *  the bright face. The other 43 meshes are body and armour; `knightReceivesShadow` below marks all
 *  43 of them as shadow receivers.
 *
 *  These names are model-specific and they changed once already: the previous character's head was
 *  `Mesh_0` + `Mesh_32`/`Mesh_33`. **Any character swap must update this list**, and the failure is
 *  quiet in both directions — a stale entry leaves a body mesh flat-lit and out of the shadow set,
 *  while a missing one puts a shadow terminator across the face. `applyFaceMaterial` warns if any
 *  name here is not found exactly once, which is the tripwire for exactly that mistake.
 *
 *  Two consumers share this list on purpose: `knight.ts` gives these meshes their own face material,
 *  and `knightReceivesShadow` below excludes them from receiving shadows. One definition means the
 *  two cannot drift apart. */
export const HEAD_MESHES: readonly string[] = ['Mesh_1', 'Mesh_20', 'Mesh_43', 'Mesh_46'];

/**
 * True for every knight mesh that should receive the sun's shadow — everything but the head.
 *
 * The head still CASTS; it just never has a shadow drawn onto it. A shadow edge across a stylised
 * face reads badly, and the face is among the lowest-resolution regions of the shadow map, so it is
 * where stair-stepping would show first.
 */
export function knightReceivesShadow(meshName: string): boolean {
  return !HEAD_MESHES.includes(meshName);
}
