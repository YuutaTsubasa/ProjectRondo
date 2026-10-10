<script lang="ts">let {kind}:{kind:string}=$props();</script>
<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
{#if kind==='display'||kind==='interface'}<path d="M3 5h26v18H3zM11 28h10M16 23v5"/>{#if kind==='interface'}<path d="M7 9h8M7 13h4M22 17h3"/>{/if}
{:else if kind==='audio'}<path d="m4 12 6 0 7-7v22l-7-7H4zM22 10q7 6 0 12M26 6q10 10 0 20"/>
{:else if kind==='controls'}<path d="M2 8h28v18H2zM7 13h1m5 0h1m5 0h1m5 0h1M7 18h1m5 0h1m5 0h1m5 0h1M10 22h12"/>
{:else if kind==='gameplay'}<path d="M10 9h12q5 0 7 14 0 6-8-2H11q-8 8-8 2Q5 9 10 9Z M9 13v8m-4-4h8M22 14h.1m3 5h.1"/>
{:else if kind==='language'}<path d="M5 3h22v26H5zM10 23l6-15 6 15m-10-5h8"/>
{:else if kind==='accessibility'}<circle cx="16" cy="5" r="3"/><path d="M4 12h24M16 9v10m-7 10 7-10 7 10M11 12v7m10-7v7"/>
{:else}<circle cx="16" cy="16" r="12"/><path d="M9 16h.1m7 0h.1m7 0h.1" stroke-width="3"/>{/if}
</svg>
