<script lang="ts">
  let { speaker }: { speaker: string } = $props();
</script>

<!-- Kit: a single parallelogram tag. The old rail/board/tick assembly is gone. -->
<div class="nameplate">{speaker}</div>

<style>
  /* Solid --c-blue with white text, overlapping the dialogue box's top edge rather than sitting
     above it. White on a blue block is 6.26:1; blue text on the glass would be 2.34:1, which is why
     the fill carries the colour and the text is white. */
  .nameplate {
    position: relative;
    z-index: 1;
    align-self: flex-start;
    margin-left: 40px;
    margin-bottom: -14px;
    background: var(--c-blue);
    color: rgb(var(--c-white-rgb));
    font-family: var(--font-headline);
    font-weight: 700;
    font-size: 20px;
    line-height: 1.2;
    letter-spacing: 5px;
    padding: 5px 40px 5px 20px;
    clip-path: polygon(0 0, 100% 0, calc(100% - 18px) 100%, 0 100%);
    pointer-events: auto;
  }
</style>
