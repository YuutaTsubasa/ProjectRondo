// Pure shadow policy — NO babylon imports, so it unit-tests in the node env (see vite.config.ts,
// `environment: 'node'`). knight.ts imports HEAD_MESHES from here rather than declaring its own, so
// the face-material list and the shadow-receiver list cannot drift apart.

/** The head group of the stylized fantasy knight, by mesh name — which is the glTF **node** name,
 *  since that is what Babylon names the runtime mesh after.
 *
 *  Counted off the shipped `public/models/knight_web.glb`: it has **42** mesh-bearing nodes, all
 *  sharing one material, and these two are the whole head. Both are above every other mesh in the
 *  model, measured in the GLB's own space at rest (before `loadKnight` scales it to `TARGET_HEIGHT`,
 *  roughly 2x): `Mesh_1` is 8047 verts spanning Y 0.8245-0.9801 and is the topmost mesh in the
 *  model; `Mesh_23` is 1533 verts spanning Y 0.8117-0.8996, so it reaches *below* `Mesh_1`'s bottom,
 *  and it overlaps the body, which tops out at 0.8281. Nothing else comes near: the two of them are
 *  the only meshes above the body's ceiling.
 *
 *  That `Mesh_1` is specifically face + hair together and `Mesh_23` the inner head comes from
 *  rendering each alone during the character swap, not from the geometry above; what the geometry
 *  establishes is that the head is exactly these two. The eyes are painted into the face texture —
 *  there is no separate eyeball mesh to list, unlike the previous character.
 *
 *  Because `Mesh_23` overlaps the body's top, whatever it covers there does not receive shadows
 *  either — the same coupling `FACE_EMISSIVE` already lives with (see `knight.ts`).
 *
 *  The other **40** meshes are body and armour; `knightReceivesShadow` below marks all 40 of them as
 *  shadow receivers.
 *
 *  These names are model-specific and they have changed once already: the previous character's head
 *  was `Mesh_0` + `Mesh_32`/`Mesh_33`, and this model has no `Mesh_43` or `Mesh_46` at all. **Any
 *  character swap must update this list**, and the failure is quiet in both directions — a stale
 *  entry that still resolves to some mesh in the new model (exactly what happened here: `Mesh_0` went
 *  from head mesh to a 12228-vert body mesh across this swap) leaves that body mesh flat-lit and out
 *  of the shadow set, while a head mesh never added to this list puts a shadow terminator across the
 *  face. `applyFaceMaterial`'s exactly-once check does not catch either: it only inspects the names
 *  already in this list, so it warns solely when one of *those* names is absent from the model or
 *  duplicated — neither of which is the shape of the two failures above. What does catch the first
 *  half is `tests/presentation/shadowPolicy.test.ts`, which resolves this list against the shipped
 *  GLB; deciding which meshes belong in it is still on the person doing the swap.
 *
 *  Two consumers share this list on purpose: `knight.ts` gives these meshes their own face material,
 *  and `knightReceivesShadow` below excludes them from receiving shadows. One definition means the
 *  two cannot drift apart. */
export const HEAD_MESHES: readonly string[] = ['Mesh_1', 'Mesh_23'];

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
