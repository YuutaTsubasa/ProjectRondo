<script module lang="ts">
 export interface DialogueChapter {
  number: string;
  title: string;
  activeId: string;
  entries: readonly {id:string;title:string}[];
 }
</script>
<script lang="ts">
 let {chapter}:{chapter:DialogueChapter}=$props();
 const current=$derived(chapter.entries.find(entry=>entry.id===chapter.activeId));
</script>
<section class="chapter" aria-label={`第 ${chapter.number} 章 ${chapter.title}`}>
 <header>
  <div class="heading-rule" aria-hidden="true"><span>✦</span></div>
  <div class="number"><small>CHAPTER</small><span>{chapter.number}</span></div>
  <div class="titles"><h2>{chapter.title}</h2>{#if current}<p>— {current.title}</p>{/if}</div>
 </header>
</section>
<style>
 .chapter{position:absolute;z-index:2;left:max(28px,2.3cqw,env(safe-area-inset-left));top:max(24px,env(safe-area-inset-top));width:350px;max-width:34cqw;color:var(--avg-text);text-shadow:0 1px 5px rgba(var(--avg-navy-rgb),1);pointer-events:none}
 header{position:relative;display:flex;align-items:center;gap:18px;border-bottom:1px solid rgba(var(--c-blue-soft-rgb),.55);padding:3px 0 14px}
 .heading-rule{position:absolute;top:0;left:98px;right:-24px;height:1px;background:linear-gradient(90deg,var(--avg-light),transparent)}.heading-rule span{position:absolute;top:-8px;left:-5px;font-size:13px;color:var(--avg-light)}
 .number{padding-left:15px;flex:none}.number small{display:block;font:400 10px/1.5 var(--font-body);letter-spacing:.3em;color:var(--avg-muted)}.number>span{display:block;font:400 44px/1.15 Georgia,serif;letter-spacing:.1em}
 .titles{min-width:0;border-left:1px solid rgba(var(--c-blue-soft-rgb),.6);padding-left:16px;margin-top:17px}h2{margin:0;font:400 21px/1.5 var(--font-body);letter-spacing:.12em}p{margin:2px 0 0;font:400 12px/1.6 var(--font-body);letter-spacing:.08em;color:var(--avg-muted)}
 @container game-ui (min-width:1600px){.chapter{width:400px;max-width:28cqw}.number>span{font-size:48px}h2{font-size:24px}}
 @container game-ui (max-width:850px){.chapter{width:300px;max-width:42cqw}.number>span{font-size:35px}h2{font-size:18px}.titles{padding-left:10px}header{gap:10px}p{font-size:11px}}
 @container game-ui (max-width:600px){.chapter{top:66px;left:18px;width:270px;max-width:85cqw}header{padding-bottom:9px}.number>span{font-size:32px}.number small{font-size:8px}.titles{margin-top:12px}h2{font-size:17px}p{font-size:10px}.heading-rule{left:88px;right:0}}
 @container game-ui (max-height:600px){.chapter{max-width:42cqw}header{padding-bottom:8px}}
</style>
