<script lang="ts">
  let { onReady, onFailure, onExit }: { onReady: () => void; onFailure: (error: unknown) => void; onExit?: () => void } = $props();
</script>
<button onclick={onReady}>fixture ready</button>
<button onclick={() => onFailure(new Error('fixture scene failed'))}>fixture fail</button>
<button onclick={onExit}>fixture exit</button><p>game fixture</p>