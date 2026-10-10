<script lang="ts">
 import LocationMarquee from '../../src/presentation/hud/LocationMarquee.svelte';
 let location=$state('白色王城');
</script>
<LocationMarquee {location}/>
<button onclick={()=>location='草原'}>草原</button>
<button onclick={()=>location='潮音海岸'}>潮音海岸</button>
<button onclick={()=>location='白色王城'}>白色王城</button>
