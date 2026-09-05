<script lang="ts">
  import { resolvePortrait, resolvePortraitAnimated, resolvePortraitWebm } from './portraitLibrary';
  import { supportsVp9Alpha } from './vp9Alpha';

  let { portrait }: { portrait: string } = $props();

  /**
   * Subscribes to a media query, returning its unsubscribe.
   *
   * Safari before 14 exposes `MediaQueryList` without `EventTarget`, so `addEventListener` is
   * simply absent and calling it throws.
   *
   * That throw is not what stands between such an engine and a working portrait: WebP arrived in
   * Safari 14 too, and every asset this component can reach is WebP (see `portraitLibrary.ts`), so
   * the image is broken there either way. What the branch buys is the difference between a broken
   * image and an effect that throws, which would take the dialogue overlay down with it -- a poor
   * trade for a preference listener, and four lines is a cheap way not to make it.
   */
  const follow = (query: MediaQueryList, onChange: (event: MediaQueryListEvent) => void) => {
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }
    query.addListener(onChange);
    return () => query.removeListener(onChange);
  };

  // An animated <img> cannot be paused, so honouring prefers-reduced-motion means showing the still
  // instead of the loop. Followed rather than read once: the setting can be changed while the game
  // is running, and this query is the only thing that says so.
  let reduceMotion = $state(false);
  $effect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduceMotion = query.matches;
    return follow(query, (event) => { reduceMotion = event.matches; });
  });

  // Three states, not two: `undefined` means the probe has not answered yet. A boolean here would
  // force a guess during that window, and both guesses cost. Guessing WebM paints a black rectangle
  // on the engines the probe exists to protect; guessing the animated WebP starts a 2.2MB download
  // that a positive answer then throws away -- roughly six times the WebM it was meant to avoid.
  // So nothing animated is committed to until the answer lands, and the still covers the gap.
  let vp9Alpha = $state<boolean | undefined>(undefined);
  $effect(() => {
    let live = true;
    void supportsVp9Alpha().then((supported) => { if (live) vp9Alpha = supported; });
    return () => { live = false; };
  });

  let still = $derived(resolvePortrait(portrait));
  let webm = $derived(reduceMotion || vp9Alpha !== true ? undefined : resolvePortraitWebm(portrait));
  // The still doubles as the video's poster, so showing it while the probe runs costs no extra
  // request on the path that ends in a <video>.
  let image = $derived(
    reduceMotion || vp9Alpha === undefined ? still : resolvePortraitAnimated(portrait),
  );
</script>

<!--
  Full-body 立繪 standing from the floor at the left, behind the dialogue box, over the 3D scene.
  Decorative in both branches: the <img> says so with `alt=""`, and the <video> needs `aria-hidden`
  to match, or the branch a screen reader meets depends on whether the engine passed the probe.
-->
{#if webm}
  <!-- svelte-ignore a11y_media_has_caption -->
  <video
    class="portrait"
    src={webm}
    poster={still}
    autoplay
    loop
    muted
    playsinline
    aria-hidden="true"
    tabindex="-1"
  ></video>
{:else}
  <img class="portrait" src={image} alt="" draggable="false" />
{/if}

<style>
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
