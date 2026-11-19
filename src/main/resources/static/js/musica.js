/* Musica de fundo dos guias. */
"use strict";

/* ---------- MUSICA DOS GUIAS ----------
   Uma danca medieval em re dorico, compasso 6/8, com alaude, bordao de gaita de fole e tambor de
   moldura. Como os outros sons, e toda sintetizada com WebAudio: nao ha arquivo nem direito
   autoral. Toca enquanto um guia esta aberto, so com o som ligado (grim_som) e se a pessoa nao
   calou a musica no cartao do guia (grim_guia_musica=0). As notas sao agendadas um pouco a frente,
   em lotes, para o tempo nao depender da pontualidade do setInterval. */
var MUSICA={no:null,iv:0,t0:0,k:0,bordao:[]};
var MUS_COLCHEIA=.22;
/* [nota MIDI, colcheias]: 16 compassos de 6 colcheias, a parte A duas frases e a B outras duas */
var MUS_MELODIA=[
  [74,3],[72,1],[69,2], [67,2],[69,1],[65,2],[64,1], [62,3],[65,2],[67,1], [69,6],
  [69,2],[72,1],[74,2],[76,1], [77,2],[76,1],[74,2],[72,1], [69,2],[67,1],[65,2],[64,1], [62,6],
  [65,2],[67,1],[69,2],[69,1], [72,2],[69,1],[67,3], [65,2],[64,1],[62,2],[65,1], [64,6],
  [65,2],[67,1],[69,2],[72,1], [74,3],[72,2],[69,1], [67,2],[64,1],[65,2],[64,1], [62,6]];
/* a nota grave de cada compasso, tangida no primeiro tempo */
var MUS_BAIXO=[50,48,50,45, 45,53,48,50, 53,48,50,45, 53,50,48,50];
var MUS_VOLTA=96;
/* a peca inteira como eventos {c: colcheia em que comeca, f: o que tocar, m, d} */
var MUS_EVENTOS=(function(){
  var ev=[], c=0;
  MUS_MELODIA.forEach(function(n){ ev.push({c:c,f:"alaude",m:n[0],d:n[1]}); c+=n[1]; });
  MUS_BAIXO.forEach(function(m,i){ ev.push({c:i*6,f:"baixo",m:m,d:6},{c:i*6,f:"bumbo"},{c:i*6+3,f:"toque"}); });
  return ev.sort(function(a,b){ return a.c-b.c; });
})();
function musHz(m){ return 440*Math.pow(2,(m-69)/12); }
function musicaQuer(){
  if(!somLigado())return false;
  try{ return localStorage.getItem("grim_guia_musica")!=="0"; }catch(error_){ return true; }
}
function musicaGrava(ligada){
  try{ localStorage.setItem("grim_guia_musica",ligada?"1":"0"); }catch(error_){ /* vale so ate fechar a pagina */ }
  if(ligada)musicaToca(); else musicaPara();
}
/* corda tangida: ataque curto e queda longa, com o harmonico da oitava por cima */
function musCorda(c,saida,f,t,dur,v){
  [[1,"triangle",1],[2,"sine",.35]].forEach(function(h){
    var o=c.createOscillator(), g=c.createGain();
    o.type=h[1]; o.frequency.setValueAtTime(f*h[0],t);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(v*h[2],t+.006);
    g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(g); g.connect(saida); o.start(t); o.stop(t+dur+.05);
  });
}
function musTambor(c,saida,t,grave){
  if(grave){
    var o=c.createOscillator(), g=c.createGain();
    o.type="sine"; o.frequency.setValueAtTime(120,t); o.frequency.exponentialRampToValueAtTime(52,t+.2);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.55,t+.005); g.gain.exponentialRampToValueAtTime(.0001,t+.28);
    o.connect(g); g.connect(saida); o.start(t); o.stop(t+.3);
    return;
  }
  var q=Math.floor(c.sampleRate*.07), b=c.createBuffer(1,q,c.sampleRate), d=b.getChannelData(0);
  for(var i=0;i<q;i++)d[i]=(Math.random()*2-1)*(1-i/q);
  var s=c.createBufferSource(), fl=c.createBiquadFilter(), gt=c.createGain();
  s.buffer=b; fl.type="bandpass"; fl.frequency.value=380; gt.gain.value=.22;
  s.connect(fl); fl.connect(gt); gt.connect(saida); s.start(t);
}
function musToca(c,e,t){
  var s=MUSICA.no; if(!s)return;
  var dur=e.d*MUS_COLCHEIA;
  if(e.f==="alaude")musCorda(c,s.corda,musHz(e.m),t,Math.min(1.6,dur*1.5+.25),.42);
  else if(e.f==="baixo")musCorda(c,s.corda,musHz(e.m),t,dur*1.1,.3);
  else musTambor(c,s.mestre,t,e.f==="bumbo");
}
function musicaAgenda(){
  var s=MUSICA.no; if(!s)return;
  var c=s.ctx, ate=c.currentTime+.6;
  for(;;){
    var e=MUS_EVENTOS[MUSICA.k], t=MUSICA.t0+e.c*MUS_COLCHEIA;
    if(t>ate)break;
    if(t>=c.currentTime-.05)musToca(c,e,t);
    MUSICA.k++;
    if(MUSICA.k>=MUS_EVENTOS.length){ MUSICA.k=0; MUSICA.t0+=MUS_VOLTA*MUS_COLCHEIA; }
  }
}
/* sem um gesto da pessoa o navegador deixa o audio suspenso: ele volta no primeiro clique ou tecla */
function musicaAcorda(){ var s=MUSICA.no; if(s&&s.ctx.state==="suspended")s.ctx.resume().catch(function(){ /* segue mudo */ }); }
function musicaToca(){
  if(MUSICA.no||!musicaQuer())return;
  var AC=window.AudioContext||window.webkitAudioContext; if(!AC)return;
  try{
    var c=SOM.ctx||(SOM.ctx=new AC());
    if(c.state==="suspended"){ c.resume().catch(function(){ /* espera um gesto */ });
      document.addEventListener("pointerdown",musicaAcorda,{once:true,capture:true});
      document.addEventListener("keydown",musicaAcorda,{once:true,capture:true}); }
    var agora=c.currentTime, mestre=c.createGain(), corda=c.createBiquadFilter();
    mestre.gain.setValueAtTime(.0001,agora); mestre.gain.exponentialRampToValueAtTime(Math.max(.0002,somVol()*.3),agora+2);
    mestre.connect(c.destination);
    corda.type="lowpass"; corda.frequency.value=2600; corda.connect(mestre);
    /* o bordao: re e la graves, abafados, como a gaita de fole por baixo da danca */
    var ronco=c.createBiquadFilter(), bordao=[];
    ronco.type="lowpass"; ronco.frequency.value=650; ronco.connect(mestre);
    [[50,.05],[57,.035]].forEach(function(b){ var o=c.createOscillator(), g=c.createGain();
      o.type="sawtooth"; o.frequency.value=musHz(b[0]); g.gain.value=b[1];
      o.connect(g); g.connect(ronco); o.start(agora); bordao.push(o); });
    MUSICA.no={ctx:c,mestre:mestre,corda:corda};
    MUSICA.bordao=bordao; MUSICA.t0=agora+.15; MUSICA.k=0;
    musicaAgenda(); MUSICA.iv=setInterval(musicaAgenda,150);
  }catch(error_){ console.warn(error_); musicaPara(); }
}
function musicaPara(){
  clearInterval(MUSICA.iv); MUSICA.iv=0;
  var s=MUSICA.no, bordao=MUSICA.bordao; MUSICA.no=null; MUSICA.bordao=[];
  document.removeEventListener("pointerdown",musicaAcorda,{capture:true});
  document.removeEventListener("keydown",musicaAcorda,{capture:true});
  if(!s)return;
  try{
    var t=s.ctx.currentTime;
    s.mestre.gain.cancelScheduledValues(t); s.mestre.gain.setValueAtTime(Math.max(.0002,s.mestre.gain.value),t);
    s.mestre.gain.exponentialRampToValueAtTime(.0001,t+.7);
    bordao.forEach(function(o){ o.stop(t+.75); });
    setTimeout(function(){ s.mestre.disconnect(); },900);
  }catch(error_){ /* o contexto ja foi fechado: nada a calar */ }
}
