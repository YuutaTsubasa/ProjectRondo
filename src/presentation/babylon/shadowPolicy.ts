// Pure shadow policy — NO babylon imports, so it unit-tests in the node env (see vite.config.ts,
// `environment: 'node'`). knight.ts imports HEAD_MESHES from here rather than declaring its own, so
// the face-material list and the shadow-receiver list cannot drift apart.

/** The head group of the medieval knight, by mesh name. Rendered each mesh alone to confirm what it
 *  actually is (previous comment here mis-described both, see `docs/HANDOFF.md`'s note on the same
 *  mistake): `Mesh_1` (9232 verts, world Y 1.592-1.900) is HAIR ONLY — no face, no neck, no skin.
 *  `Mesh_20` (1948 verts, Y 1.568-1.764) is the face/head skin, and it reaches *below* `Mesh_1`'s
 *  bottom (1.568 vs 1.592) — down past the neckline into the collar region (the body tops out at
 *  1.595) — so `Mesh_20`, not `Mesh_1`, carries the neck. `Mesh_43` (204 verts) and `Mesh_46` (153
 *  verts) are the two eyeballs. All four together are the top-of-body cluster by world height. Both
 *  eyeballs must be listed or the uncovered one keeps the lit shared material and reads dark against
 *  the bright face. The other 43 meshes are body and armour; `knightReceivesShadow` below marks all
 *  43 of them as shadow receivers.
 *
 *  Because `Mesh_20` reaches into the collar region, the collar does not receive shadows either —
 *  the same coupling `FACE_EMISSIVE` already lives with (see `knight.ts`).
 *
 *  These names are model-specific and they changed once already: the previous character's head was
 *  `Mesh_0` + `Mesh_32`/`Mesh_33`. **Any character swap must update this list**, and the failure is
 *  quiet in both directions — a stale entry that still resolves to some mesh in the new model
 *  (exactly what happened here: `Mesh_0` went from head mesh to body mesh across this swap) leaves
 *  that body mesh flat-lit and out of the shadow set, while a head mesh never added to this list
 *  puts a shadow terminator across the face. `applyFaceMaterial`'s exactly-once check does not catch
 *  either: it only inspects the names already in this list, so it warns solely when one of *those*
 *  names is absent from the model or duplicated — neither of which is the shape of the two failures
 *  above. Updating this list correctly on a character swap is on the person doing the swap; nothing
 *  here verifies it for them.
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
