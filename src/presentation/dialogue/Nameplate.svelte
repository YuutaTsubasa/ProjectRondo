<script lang="ts">
  let { speaker }: { speaker: string } = $props();
</script>

<div class="nameplate">
  <span class="rail"></span>
  <span class="body"><span class="tick"></span>{speaker}</span>
</div>

<style>
  /* 1a 切角銘牌: pure-blue rail + lime cut corner + white board (design: linear-gradient 315deg). */
  .nameplate {
    display: inline-flex;
    align-items: stretch;
    background: linear-gradient(315deg, #d8ff00 0 12px, transparent 12px 16px, #eef0f2 16px);
    box-shadow: 0 14px 30px rgba(0, 0, 0, 0.35);
    pointer-events: auto;
  }
  .rail { width: 10px; background: #0000ff; display: block; }
  .body {
    padding: 10px 32px 10px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: 'Chakra Petch', 'Noto Sans TC', system-ui, sans-serif;
    font-weight: 700;
    font-size: 17px;
    letter-spacing: 0.04em;
    color: #0b0b0d;
  }
  .tick { width: 3px; height: 12px; background: #0000ff; display: block; }
</style>
