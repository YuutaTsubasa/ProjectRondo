<script lang="ts">
  let { text, charMs = 24, onDone }: { text: string; charMs?: number; onDone?: () => void } = $props();
  let shown = $state('');
  let complete = $state(false);
  let timer: ReturnType<typeof setInterval> | undefined;

  const finish = () => { shown = text; complete = true; clearInterval(timer); onDone?.(); };

  $effect(() => {
    shown = ''; complete = false;
    let i = 0;
    clearInterval(timer);
    timer = setInterval(() => {
      i++; shown = text.slice(0, i);
      if (i >= text.length) finish();
    }, charMs);
    return () => clearInterval(timer);
  });

  /** Reveal-all on first click; the parent decides advance on the second. Returns true if it completed now. */
  export function reveal(): boolean { if (!complete) { finish(); return true; } return false; }
</script>

<p class="line">{shown}</p>

<style>
  .line {
    margin: 0;
    font-size: 20px;
    line-height: 2;
    color: var(--c-ink);
    text-wrap: pretty;
  }
</style>
