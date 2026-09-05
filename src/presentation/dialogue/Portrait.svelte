<script lang="ts">
  import { resolvePortrait, resolvePortraitMotion } from './portraitLibrary';

  let { portrait }: { portrait: string } = $props();

  // An animated <img> cannot be paused, so honouring prefers-reduced-motion means choosing the
  // still instead of the loop. Read once and then follow changes: the setting can be toggled while
  // the game is running, and the query is the only thing that tells us.
  let reduceMotion = $state(false);
  $effect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduceMotion = query.matches;
    const onChange = (e: MediaQueryListEvent) => { reduceMotion = e.matches; };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  });

  let src = $derived(
    (reduceMotion ? undefined : resolvePortraitMotion(portrait)) ?? resolvePortrait(portrait),
  );
</script>

<img class="portrait" {src} alt="" draggable="false" />

<style>
  /* Full-body 立繪 standing from the floor at the left, behind the dialogue box, over the 3D scene. */
  .portrait {
    position: absolute;
    bottom: 0;
    left: 2vw;
    height: 92vh;
    width: auto;
    max-width: none;
    object-fit: contain;
    pointer-events: none;
    user-select: none;
    filter: drop-shadow(0 6px 26px rgba(0, 0, 0, 0.45));
  }
</style>
