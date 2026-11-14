/* Sons sintetizados por tema. */
"use strict";

/* ---------- SONS ----------
   Nenhum arquivo: tudo e sintetizado na hora, e o timbre muda com o estilo do tema.
   Nasce ligado; quem desliga e a pessoa, em Configurações > Aparencia. */
var SOM={ctx:null};
var TIMBRE={fantasia:{o:"triangle",f:1},terror:{o:"sawtooth",f:.5},misterio:{o:"sine",f:.75},
  investigacao:{o:"square",f:.6},ficcao:{o:"square",f:1.5}};
function somLigado(){ try{ return localStorage.getItem("grim_som")!=="0"; }catch(e){ return true; } }
function somVol(){ var v=NaN; try{ v=parseFloat(localStorage.getItem("grim_somvol")); }catch(e){}
  return isFinite(v)?Math.max(0,Math.min(1,v)):.5; }
function som(n){
  if(!somLigado())return;
  try{
    var AC=window.AudioContext||window.webkitAudioContext; if(!AC)return;
    var c=SOM.ctx||(SOM.ctx=new AC()); if(c.state==="suspended")c.resume();
    var t0=c.currentTime, vol=somVol()*.35;
    var tb=TIMBRE[document.documentElement.getAttribute("data-estilo")]||TIMBRE.terror;
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
    if(n==="dado"){ for(var k=0;k<7;k++)chiado(k*.075+Math.random()*.02,.045,1.2,1800+Math.random()*1500); }
    else if(n==="cai"){ chiado(0,.09,1.4,700,"lowpass"); nota(220,0,.12,.6,"sine",110); }
    else if(n==="max"){ [523,659,784,1047].forEach(function(f,i){ nota(f,i*.09,.5,.8); }); }
    else if(n==="min"){ nota(196,0,.5,.9,null,82); nota(147,.12,.6,.7,null,61); }
    else if(n==="pagina"){ chiado(0,.28,.9,2600,"highpass"); }
    else if(n==="abre"){ nota(440,0,.14,.3,null,660); }
    else if(n==="fecha"){ nota(520,0,.12,.25,null,330); }
    else if(n==="revela"){ chiado(0,.35,.6,1200); [392,523,784].forEach(function(f,i){ nota(f,.1+i*.12,.6,.7); }); }
    else if(n==="capitulo"){ nota(98,0,1.4,.9,null,98); nota(196,.05,1.2,.5); nota(294,.3,1,.4); }
    else if(n==="pedido"){ nota(660,0,.15,.6); nota(880,.16,.25,.6); }
    else if(n==="vez"){ nota(330,0,.1,.5); nota(495,.1,.18,.5); }
  }catch(e){}
}
