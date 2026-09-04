<script lang="ts">
  let { auto, onToggleAuto, onSkip, onToggleLog }:
    { auto: boolean; onToggleAuto: () => void; onSkip: () => void; onToggleLog: () => void } = $props();
</script>

<!-- Kit: 72x72 glass squares, top-right, icon over label. Paths are the kit's own HUD icons
     (VN Screens - Light, the `hud` data); they stroke with currentColor so the icon follows the
     button's state -- white when AUTO is lit -- without a second rule. -->
<div class="controls">
  <button class:active={auto} aria-pressed={auto} onclick={onToggleAuto}>
    <svg viewBox="0 0 32 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 3l24 9-24 9zM9 9h9M9 13h6" /></svg>
    <span>AUTO</span>
  </button>
  <button onclick={onSkip}>
    <svg viewBox="0 0 32 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 4l10 8-10 8zM17 4l10 8-10 8z" /></svg>
    <span>SKIP</span>
  </button>
  <button onclick={onToggleLog}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M6 2h9l4 4v16H6zM10 9h7M10 13h7M10 17h5" /></svg>
    <span>LOG</span>
  </button>
</div>

<style>
  .controls {
    position: absolute;
    top: 18px;
    right: 18px;
    display: flex;
    gap: 10px;
    pointer-events: auto;
  }
  .controls button {
    width: 72px;
    height: 72px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    background: var(--surface-glass);
    backdrop-filter: var(--surface-blur);
    -webkit-backdrop-filter: var(--surface-blur);
    border: none;
    font-family: var(--font-headline);
    font-weight: 700;
    font-size: 15px;
    line-height: 1;
    letter-spacing: 1px;
    color: var(--c-ink);
    cursor: pointer;
    transition: color 0.12s ease;
  }
  .controls svg { width: 38px; height: 28px; display: block; }
  /* Hover recolours the label and icon, as the kit's HUD does -- but in --c-blue-deep, since
     --c-blue on this glass is 2.34:1 and hovering would make the label harder to read, not easier. */
  .controls button:hover { color: var(--c-blue-deep); }
  /* Focus needs an indicator of its own. A colour change alone is not one: it disappears for anyone
     who cannot distinguish the two colours, and it left these buttons with outline:none. */
  /* Same halo as the dialogue box, and for the same reason: these tiles sit on the 3D scene, so an
     outline beyond their border box has no fixed backdrop to be measured against. */
  .controls button:focus-visible {
    color: var(--c-blue-deep);
    outline: var(--focus-ring);
    outline-offset: var(--focus-ring-offset);
    box-shadow: var(--focus-halo);
  }
  /* AUTO's lit state. The dialogue box carries no AUTO indicator in the kit, so this button is the
     only place the mode is visible -- it reads as a filled tile rather than a colour shift. */
  .controls button.active {
    background: var(--c-blue);
    color: rgb(var(--c-white-rgb));
  }
</style>
