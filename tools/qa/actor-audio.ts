import { EntityAudioPlayer } from '../../src/audio/entity-audio';
const presentation=await fetch('/assets/presentation.json').then(r=>r.json());
const catalog=await fetch('/assets/catalog/entities.json').then(r=>r.json());
const select=document.getElementById('model') as HTMLSelectElement;
const sound=document.getElementById('sound') as HTMLInputElement;
const output=document.getElementById('status')!;
let nativeStarts=0,lastNativeUrl='',metadata:any,paddingClip:HTMLAudioElement|undefined;
const player=new EntityAudioPlayer(presentation.entityAudio,(delay,run)=>{const timer=setTimeout(run,delay);return()=>clearTimeout(timer)},()=>4,()=>{
  const audio=new Audio();audio.addEventListener('playing',()=>{nativeStarts++;lastNativeUrl=new URL(audio.src).pathname;});return audio;
});
for(const id of ['11000701','11000801','11000901','11001401','11001501','11001201','11001301','11000101','11000211','11000301']){
  if(!presentation.entityAudio[id])continue;
  const option=document.createElement('option');option.value=id;option.textContent=`${presentation.entityAudio[id].name} · ${id}`;select.append(option);
}
document.getElementById('coverage')!.textContent=`${Object.keys(presentation.entityAudio).length} modelos com manifesto; prévia dos dez iniciais.`;
async function change(){
  const id=select.value;metadata=undefined;
  player.setActors([select.value]);
  const entity=catalog.entities.find((e:any)=>e.id===select.value);
  (document.getElementById('portrait') as HTMLImageElement).src=entity.portrait||entity.preview;
  const loaded=await fetch(presentation.entityAudio[id].url).then(r=>r.json());
  if(select.value===id)metadata=loaded;
}
select.onchange=()=>void change();
sound.onchange=()=>player.settings(sound.checked,.35);
document.getElementById('attack')!.onclick=()=>player.action(select.value,'A_1hit',800,'hero');
document.getElementById('death')!.onclick=()=>player.action(select.value,'C_dead',800,'hero');
document.getElementById('pause')!.onclick=()=>player.pause(true);
document.getElementById('resume')!.onclick=()=>player.pause(false);
document.getElementById('padding')!.onclick=()=>{
  paddingClip?.pause();paddingClip=new Audio('/assets/audio/sfx/287/3.mp3');paddingClip.volume=.2;
  const codec=document.getElementById('codec')!;codec.textContent='Conferindo o MP3 com 417 bytes de preenchimento original…';
  paddingClip.addEventListener('playing',()=>{codec.textContent='Reprodução nativa confirmada: MP3 original 287/3, incluindo os 417 bytes iniciais de zeros.'},{once:true});
  void paddingClip.play().catch(error=>{codec.textContent=String(error)});
};
const timer=setInterval(()=>{
  const state=player.snapshot();
  output.textContent=JSON.stringify({personagem:select.value,estado:metadata?.status||'anterior',eventosPendentes:metadata?.unresolvedEvents||[],prontos:state.ready,falhas:state.failures,vozes:state.voices,agendados:state.pending,reproducoesNativas:nativeStarts,ultimoArquivo:lastNativeUrl},null,2);
},200);
window.addEventListener('pagehide',()=>{clearInterval(timer);player.dispose();paddingClip?.pause();});
await change();
