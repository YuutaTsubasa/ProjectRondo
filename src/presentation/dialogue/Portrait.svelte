<script lang="ts">
  import { resolvePortrait } from './portraitLibrary';
  let { portrait }: { portrait: string } = $props();
  let src = $derived(resolvePortrait(portrait));
</script>

<img class="portrait" {src} alt="" draggable="false" />

<style>
  /* Full-body 立繪 standing from the floor, behind the dialogue box, over the live 3D scene. */
  .portrait {
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    height: 92vh;
    width: auto;
    max-width: none;
    object-fit: contain;
    pointer-events: none;
    user-select: none;
    filter: drop-shadow(0 6px 26px rgba(0, 0, 0, 0.45));
  }
</style>
