<script lang="ts">
  let { speaker }: { speaker: string } = $props();
</script>

<div class="nameplate">{speaker}</div>

<style>
  .nameplate {
    display: inline-block; background: #fff; color: #111;
    padding: 0.2rem 1rem; font-weight: 700; letter-spacing: 0.05em;
    clip-path: polygon(0 0, 100% 0, calc(100% - 0.6rem) 100%, 0 100%); /* 1a 切角銘牌 */
  }
</style>
