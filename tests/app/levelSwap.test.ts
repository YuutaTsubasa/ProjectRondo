import { describe, expect, it, vi } from 'vitest';
import { createLevelSwap, type SwappableLevel } from '../../src/app/levelSwap';

/**
 * A level, as the swap sees one: something that can be suspended and disposed. Every call is recorded
 * on one shared log, because most of what this machine gets wrong is an ORDER — a level disposed
 * before its replacement stands, a resume applied to the level that is leaving — and an order cannot
 * be asserted from per-object counters.
 */
const fakeLevel = (name: string, log: string[]): SwappableLevel => ({
  suspendInput: (on: boolean) => log.push(`${name}:${on ? 'suspend' : 'resume'}`),
  dispose: () => log.push(`${name}:dispose`),
});

/** A build that resolves when the test says so, so a swap can be observed mid-flight. */
const heldBuild = <L,>(built: L) => {
  let release = (): void => {};
  const build = () => new Promise<L>((resolve) => { release = () => resolve(built); });
  return { build, release: () => { release(); return Promise.resolve(); } };
};

/** Lets every already-resolved promise's handlers run — the swap settles over several microtasks. */
const flush = async (): Promise<void> => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

const silence = () => vi.spyOn(console, 'error').mockImplementation(() => {});

describe('createLevelSwap', () => {
  const options = () => {
    const log: string[] = [];
    const swap = createLevelSwap<SwappableLevel>({
      disposeEngine: () => log.push('engine:dispose'),
      onShown: () => log.push('shown'),
    });
    return { log, swap };
  };

  it('has nothing on screen until the first build settles', async () => {
    const { log, swap } = options();
    const first = fakeLevel('hub', log);
    const held = heldBuild(first);
    swap.swap(held.build, () => log.push('commit'));
    expect(swap.current).toBeUndefined();
    await held.release();
    await flush();
    expect(swap.current).toBe(first);
  });

  // The whole point of the order: a build that fails must not have cost the player the level they
  // were standing in, so the outgoing one cannot be disposed until the incoming one exists.
  it('builds the next level before disposing the one on screen', async () => {
    const { log, swap } = options();
    swap.swap(() => Promise.resolve(fakeLevel('hub', log)), () => {});
    await flush();
    log.length = 0;
    const held = heldBuild(fakeLevel('tower', log));
    swap.swap(held.build, () => log.push('commit'));
    expect(log).not.toContain('hub:dispose');
    await held.release();
    await flush();
    expect(log).toEqual(['hub:suspend', 'shown', 'hub:dispose', 'tower:resume', 'commit']);
  });

  // Both levels' listeners are bound to the same window, so the incoming level may not take input
  // until the outgoing one has released it -- and the resume has to land before `commit`, or a commit
  // that wants the level suspended (the first hub build, under the intro overlay) would be undone.
  it('resumes the incoming level after the dispose and before the commit', async () => {
    const { log, swap } = options();
    swap.swap(() => Promise.resolve(fakeLevel('hub', log)), () => {});
    await flush();
    log.length = 0;
    swap.swap(() => Promise.resolve(fakeLevel('tower', log)), () => log.push('commit'));
    await flush();
    expect(log.indexOf('hub:dispose')).toBeLessThan(log.indexOf('tower:resume'));
    expect(log.indexOf('tower:resume')).toBeLessThan(log.indexOf('commit'));
  });

  it('refuses a second swap while one is in flight', async () => {
    const { log, swap } = options();
    const held = heldBuild(fakeLevel('hub', log));
    swap.swap(held.build, () => log.push('first'));
    swap.swap(() => Promise.resolve(fakeLevel('tower', log)), () => log.push('second'));
    await held.release();
    await flush();
    expect(log).toContain('first');
    expect(log).not.toContain('second');
  });

  it('accepts the next swap once the one in flight has settled', async () => {
    const { log, swap } = options();
    swap.swap(() => Promise.resolve(fakeLevel('hub', log)), () => {});
    await flush();
    swap.swap(() => Promise.resolve(fakeLevel('tower', log)), () => log.push('second'));
    await flush();
    expect(log).toContain('second');
  });

  describe('when a build rejects', () => {
    it('keeps the level on screen and hands its input back', async () => {
      const errors = silence();
      const { log, swap } = options();
      const hub = fakeLevel('hub', log);
      swap.swap(() => Promise.resolve(hub), () => {});
      await flush();
      log.length = 0;
      swap.swap(() => Promise.reject(new Error('no Havok')), () => log.push('commit'));
      await flush();
      expect(swap.current).toBe(hub);
      expect(log).toEqual(['hub:suspend', 'hub:resume']);
      expect(errors).toHaveBeenCalled();
      errors.mockRestore();
    });

    // The failure mode a stuck flag gives: every later swap refused, so the portal stops working for
    // the rest of the session and nothing says why.
    it('does not leave the swap blocked', async () => {
      const errors = silence();
      const { log, swap } = options();
      swap.swap(() => Promise.reject(new Error('no Havok')), () => {});
      await flush();
      swap.swap(() => Promise.resolve(fakeLevel('hub', log)), () => log.push('commit'));
      await flush();
      expect(log).toContain('commit');
      errors.mockRestore();
    });
  });

  describe('unmount', () => {
    it('disposes the level on screen and then the engine', async () => {
      const { log, swap } = options();
      swap.swap(() => Promise.resolve(fakeLevel('hub', log)), () => {});
      await flush();
      log.length = 0;
      swap.unmount();
      expect(log).toEqual(['hub:dispose', 'engine:dispose']);
    });

    // Disposing the engine under an in-flight build would tear down the WebGL context that build is
    // still constructing against.
    it('defers the engine until a build in flight has settled', async () => {
      const { log, swap } = options();
      const held = heldBuild(fakeLevel('hub', log));
      swap.swap(held.build, () => log.push('commit'));
      swap.unmount();
      expect(log).not.toContain('engine:dispose');
      await held.release();
      await flush();
      // Built after the unmount, so it is disposed rather than shown -- and never committed to.
      expect(log).toEqual(['hub:dispose', 'engine:dispose']);
    });

    it('still disposes the engine when the build in flight rejects', async () => {
      const errors = silence();
      const { log, swap } = options();
      swap.swap(() => Promise.reject(new Error('no Havok')), () => {});
      swap.unmount();
      await flush();
      expect(log).toEqual(['engine:dispose']);
      errors.mockRestore();
    });

    // `unmount` hangs `disposeEngine` off `loading`, so anything that leaves `loading` rejected takes
    // the engine -- and the WebGL context -- with it. `commit` is the caller's own code and runs
    // inside the fulfilled handler, so it is the one thing that can.
    it('is not stopped by a commit that throws', async () => {
      const errors = silence();
      const { log, swap } = options();
      swap.swap(() => Promise.resolve(fakeLevel('hub', log)), () => { throw new Error('commit blew up'); });
      await expect(swap.loading).resolves.toBeUndefined();
      expect(errors).toHaveBeenCalled();
      swap.unmount();
      expect(log).toContain('engine:dispose');
      errors.mockRestore();
    });
  });
});
