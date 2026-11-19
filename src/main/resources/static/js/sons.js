/* Sons sintetizados por tema. */
"use strict";

/* ---------- SONS ----------
   Nenhum arquivo: tudo e sintetizado na hora, e o timbre muda com o estilo do tema.
   Nasce ligado; quem desliga e a pessoa, em Configurações > Aparencia. */
var SOM={ctx:null};
var TIMBRE={fantasia:{o:"triangle",f:1},terror:{o:"sawtooth",f:.5},misterio:{o:"sine",f:.75},
  investigacao:{o:"square",f:.6},ficcao:{o:"square",f:1.5}};
function somLigado(){ try{ return localStorage.getItem("grim_som")!=="0"; }catch(e){ return true; } }
function somVol(){ var v=Number.NaN; try{ v=Number.parseFloat(localStorage.getItem("grim_somvol")); }catch(error_){ /* falha aqui nao muda o que a pessoa ve */ }
  return Number.isFinite(v)?Math.max(0,Math.min(1,v)):.5; }
/* cada som e uma receita de notas e chiados, no timbre do estilo do tema */
var RECEITAS={
  dado:function(s){ for(var k=0;k<7;k++)s.chiado(k*.075+Math.random()*.02,.045,1.2,1800+Math.random()*1500); },
  cai:function(s){ s.chiado(0,.09,1.4,700,"lowpass"); s.nota(220,0,.12,.6,"sine",110); },
  max:function(s){ [523,659,784,1047].forEach(function(f,i){ s.nota(f,i*.09,.5,.8); }); },
  min:function(s){ s.nota(196,0,.5,.9,null,82); s.nota(147,.12,.6,.7,null,61); },
  pagina:function(s){ s.chiado(0,.28,.9,2600,"highpass"); },
  abre:function(s){ s.nota(440,0,.14,.3,null,660); },
  fecha:function(s){ s.nota(520,0,.12,.25,null,330); },
  revela:function(s){ s.chiado(0,.35,.6,1200); [392,523,784].forEach(function(f,i){ s.nota(f,.1+i*.12,.6,.7); }); },
  capitulo:function(s){ s.nota(98,0,1.4,.9,null,98); s.nota(196,.05,1.2,.5); s.nota(294,.3,1,.4); },
  pedido:function(s){ s.nota(660,0,.15,.6); s.nota(880,.16,.25,.6); },
  vez:function(s){ s.nota(330,0,.1,.5); s.nota(495,.1,.18,.5); },
  /* mapa: a peca assentando na mesa, o aceno de quem aponta e a porta que range */
  solta:function(s){ s.chiado(0,.05,.9,500,"lowpass"); s.nota(180,0,.09,.45,"sine",120); },
  ping:function(s){ s.nota(880,0,.12,.4,"sine"); s.nota(1320,.08,.22,.3,"sine"); },
  porta:function(s){ s.nota(140,0,.38,.25,"sawtooth",95); s.chiado(.02,.3,.5,900,"bandpass"); s.nota(70,.34,.12,.5,"sine",50); }
};
function som(n){
  if(!somLigado())return;
  try{
    var AC=window.AudioContext||window.webkitAudioContext; if(!AC)return;
    var c=SOM.ctx||(SOM.ctx=new AC()); if(c.state==="suspended")c.resume();
    var t0=c.currentTime, vol=somVol()*.35;
    var tb=TIMBRE[document.documentElement.dataset.estilo]||TIMBRE.terror;
    var nota=function(fr,ini,dur,v,tipo,ate){ var o=c.createOscillator(), g=c.createGain();
      o.type=tipo||tb.o; o.frequency.setValueAtTime(fr*tb.f,t0+ini);
      if(ate)o.frequency.exponentialRampToValueAtTime(ate*tb.f,t0+ini+dur);
      g.gain.setValueAtTime(.0001,t0+ini); g.gain.exponentialRampToValueAtTime(Math.max(.0002,vol*v),t0+ini+.012);
      g.gain.exponentialRampToValueAtTime(.0001,t0+ini+dur);
      o.connect(g); g.connect(c.destination); o.start(t0+ini); o.stop(t0+ini+dur+.03); };
    var chiado=function(ini,dur,v,fq,filtro){ var q=Math.floor(c.sampleRate*dur), b=c.createBuffer(1,q,c.sampleRate), d=b.getChannelData(0);
      for(var i=0;i<q;i++)d[i]=(Math.random()*2-1)*(1-i/q);
      var s=c.createBufferSource(), fl=c.createBiquadFilter(), g=c.createGain();
      s.buffer=b; fl.type=filtro||"bandpass"; fl.frequency.value=fq*tb.f; g.gain.value=vol*v;
      s.connect(fl); fl.connect(g); g.connect(c.destination); s.start(t0+ini); };
    var f=RECEITAS[n]; if(f)f({nota:nota,chiado:chiado});
  }catch(error_){ /* falha aqui nao muda o que a pessoa ve */ }
}
