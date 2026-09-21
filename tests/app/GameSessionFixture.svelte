<script lang="ts">
  let { onReady, onFailure }: { onReady: () => void; onFailure: (error: unknown) => void } = $props();
</script>
<button onclick={onReady}>fixture ready</button>
<button onclick={() => onFailure(new Error('fixture scene failed'))}>fixture fail</button>
<p>game fixture</p>