import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted, because `vi.mock`'s factory is lifted above the imports and would otherwise close over a
// `const` that has not been initialised yet.
const { havokFactory } = vi.hoisted(() => ({ havokFactory: vi.fn() }));
vi.mock('@babylonjs/havok', () => ({ default: havokFactory }));

/**
 * Spec §6: "the Havok WASM module is a genuine singleton and is cached across the swap". The real
 * `@babylonjs/havok` factory memoises nothing — every call compiles the WASM again and returns a
 * fresh emscripten instance — so without the cache a hub → tower → hub round trip pays for three
 * compiles and holds two heaps at once during `App.svelte`'s build-before-dispose overlap.
 *
 * A counting stub stands in for the factory, because what is being pinned is how many times it is
 * called, not what it returns; the real module needs a WASM compile this suite has no business
 * doing. `vi.resetModules()` per test, because the cache being tested is module state.
 */
describe('loadHavok', () => {
  beforeEach(() => {
    vi.resetModules();
    havokFactory.mockReset();
    havokFactory.mockImplementation(() => Promise.resolve({ havok: true }));
  });

  it('compiles the module once however many levels ask for it', async () => {
    const { loadHavok } = await import('../../src/presentation/babylon/havokModule');

    const first = await loadHavok();
    const second = await loadHavok();
    const third = await loadHavok();

    expect(havokFactory).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('shares one compile between two builds in flight at the same time', async () => {
    const { loadHavok } = await import('../../src/presentation/babylon/havokModule');

    // Both started before either resolves — the shape of a swap, and the reason the *promise* is
    // cached rather than the module it settles to.
    const leaving = loadHavok();
    const arriving = loadHavok();

    expect(havokFactory).toHaveBeenCalledTimes(1);
    expect(await arriving).toBe(await leaving);
  });
});
