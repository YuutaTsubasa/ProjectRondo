import HavokPhysics from '@babylonjs/havok';

/**
 * The Havok WASM module, compiled once for the life of the page and shared by every level that
 * plugs a `HavokPlugin` into its scene.
 *
 * Spec §6 asks for exactly this: "the Havok WASM module (`await HavokPhysics()`) is a genuine
 * singleton and is cached across the swap". `@babylonjs/havok`'s ESM factory memoises nothing — each
 * call compiles the WASM again and hands back a fresh emscripten instance with its own heap — so
 * without this a hub → tower → hub round trip pays for three compiles and three heaps, and holds two
 * of them at once across the build-before-dispose overlap `App.svelte` describes.
 *
 * The *promise* is what is cached, not the resolved module: two builds that overlap then share one
 * compile rather than racing to start a second. (`App.svelte`'s `swapping` flag is the only thing
 * that stops them overlapping today, and this does not want to depend on that staying true.)
 *
 * Nothing ever clears it, and that is safe rather than a leak: the module is not per-scene state.
 * `scene.dispose()` disposes the physics engine, which disposes the plugin, which releases its own
 * Havok worlds and query collectors — it does not touch the module those worlds were created from.
 *
 * It lives in its own module rather than in `App.svelte`, which is the routing that swaps the levels.
 * A promise the router owned would have to be threaded through both scene builders' public
 * signatures to reach the one line in each that wants it, purely to memoise something whose lifetime
 * is the page's and not the router's.
 */
let compiling: ReturnType<typeof HavokPhysics> | undefined;

/** The shared Havok module; see this file's own doc for why the cache is here and never cleared. */
export const loadHavok = (): ReturnType<typeof HavokPhysics> => (compiling ??= HavokPhysics());
