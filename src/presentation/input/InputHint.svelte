<script lang="ts">
 import {inputStatus} from './deviceInput';
 import {inputHint} from './hints';
 let {label,gameplay=false}:{label:string;gameplay?:boolean}=$props();
 const key=$derived(gameplay&&$inputStatus.device==='gamepad'&&label.toLowerCase()==='esc'?'PAUSE':label);
</script>
<span class="input-hint">{inputHint(key,$inputStatus)}</span>
