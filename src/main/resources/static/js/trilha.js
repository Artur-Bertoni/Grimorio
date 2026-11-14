/* Trilha sonora. */
"use strict";

/* ---------- PLAYER ---------- */
var PL={cur:null,nome:"",vol:.8,loop:true};
function rampa(a,de,para,ms,cb){ var t0=performance.now();
  (function st(t){ var k=Math.min(1,((t||performance.now())-t0)/ms);
    a.volume=Math.max(0,Math.min(1,de+(para-de)*k)); if(k<1)requestAnimationFrame(st); else if(cb)cb(); })(); }
async function tocar(nome){
  await carregaCatalogo();
  var f=LIB.faixas[keyF(nome)];
  if(!f){ if(!LIB.ok){ abrirTrilha(); toast("Nenhuma trilha enviada ainda"); }
    else toast("Faixa não encontrada: "+nome); return; }
  try{ var a=new Audio(f.url);
    a.loop=PL.loop; a.volume=0;
    a.addEventListener("ended",function(){ if(PL.cur===a){PL.cur=null;PL.nome="";
      var bt=$("#btnTrilha"); if(bt)bt.classList.remove("live");
      $$(".tplay").forEach(function(x){x.classList.remove("nowplaying");}); playerUI(); } });
    await a.play();
    var old=PL.cur; if(old)rampa(old,old.volume,0,1800,function(){try{old.pause();}catch(e){}});
    rampa(a,0,PL.vol,1800); PL.cur=a; PL.nome=f.nome;
    $("#btnTrilha").classList.add("live"); playerUI();
    $$(".tplay").forEach(function(x){x.classList.toggle("nowplaying",x.getAttribute("data-faixa")===nome);});
  }catch(e){ toast("Não consegui tocar essa faixa"); } }
function parar(){ if(!PL.cur)return; var a=PL.cur; PL.cur=null; PL.nome="";
  rampa(a,a.volume,0,1200,function(){try{a.pause();}catch(e){}});
  $("#btnTrilha").classList.remove("live"); playerUI();
  $$(".tplay").forEach(function(x){x.classList.remove("nowplaying");}); }
function nowbarUI(){ var w=$("#nowbar"); if(!w)return;
  if(!PL.cur){ w.hidden=true; return; }
  w.hidden=false;
  var nm=$("#nbName"); if(nm){nm.textContent=PL.nome||"";nm.title=(PL.nome||"")+" · abrir a trilha sonora";}
  var pb=$("#nbPlay"); if(pb){ var pz=PL.cur.paused;
    pb.title=pz?"Retomar":"Pausar";
    pb.innerHTML=htmlDe("t-icone-tocar",{tocando:!pz}); }
  var lb=$("#nbLoop"); if(lb){ lb.classList.toggle("off",!PL.loop); lb.setAttribute("aria-pressed",PL.loop);
    lb.title=PL.loop?"Loop ligado (clique para desligar)":"Loop desligado (clique para ligar)"; } }
function playerUI(){ nowbarUI(); var n=$("#plNow"); if(n)n.textContent=PL.nome||"Nada tocando";
  var p=$("#plPlay"); if(p)p.innerHTML=htmlDe("t-icone-tocar",{tocando:!!(PL.cur&&!PL.cur.paused)});
  $$(".trk").forEach(function(t){t.classList.toggle("on",t.getAttribute("data-trk")===PL.nome);}); }
function abrirTrilha(back){
  if(GM&&!CATp){ carregaCatalogo().then(function(){ abrirTrilha(back); }); return; }
  var cats=[];
  if(LIB.ok){ var pc={};
    Object.keys(LIB.faixas).forEach(function(k){var f=LIB.faixas[k];(pc[f.cat]=pc[f.cat]||[]).push(f);});
    var ord=(D.trilhaCategorias||[]).map(function(c){return c.id;});
    Object.keys(pc).forEach(function(c){if(ord.indexOf(c)<0)ord.push(c);});
    ord.forEach(function(c){ var l=(pc[c]||[]).sort(function(a,b){return a.nome.localeCompare(b.nome);});
      if(l.length)cats.push({nome:c,cor:catColor(c),faixas:l}); }); }
  var ov=overlay("Trilha sonora",htmlDe("t-trilha",{temFaixas:LIB.ok,mestre:GM,tocando:PL.nome||"Nada tocando",
    volume:Math.round(PL.vol*100),loop:PL.loop,categorias:cats}),{wide:true,back:back});
  var cn=$("#libConn",ov); if(cn)cn.onclick=function(){ ov.close(); abrirArquivos(); };
  $$(".trk",ov).forEach(function(b){b.onclick=function(){tocar(b.getAttribute("data-trk"));};});
  var pp=$("#plPlay",ov); if(pp)pp.onclick=function(){ if(!PL.cur)return;
    if(PL.cur.paused)PL.cur.play(); else PL.cur.pause(); playerUI(); };
  var st=$("#plStop",ov); if(st)st.onclick=parar;
  var vv=$("#plVol",ov); if(vv){ vv.style.setProperty("--pct",vv.value+"%");
    vv.oninput=function(){PL.vol=vv.value/100; if(PL.cur)PL.cur.volume=PL.vol; vv.style.setProperty("--pct",vv.value+"%");}; }
  var lp=$("#plLoop",ov); if(lp)lp.onclick=function(){PL.loop=!PL.loop; if(PL.cur)PL.cur.loop=PL.loop;
    lp.setAttribute("aria-pressed",PL.loop); lp.textContent="Loop "+(PL.loop?"ligado":"desligado");};
  var sk=$("#plSeek",ov), iv=setInterval(function(){ if(!document.body.contains(ov)){clearInterval(iv);return;}
    if(PL.cur&&isFinite(PL.cur.duration)){ $("#plT").textContent=fmt(PL.cur.currentTime);
      $("#plD").textContent=fmt(PL.cur.duration);
      if(sk&&document.activeElement!==sk)sk.value=PL.cur.currentTime/PL.cur.duration*100; }
    if(sk){ sk.style.setProperty("--pct",sk.value+"%");
      sk.parentNode.classList.toggle("toca",!!(PL.cur&&!PL.cur.paused)); } },250);
  if(sk){ sk.oninput=function(){ sk.style.setProperty("--pct",sk.value+"%"); };
    sk.onchange=function(){ if(PL.cur&&isFinite(PL.cur.duration))PL.cur.currentTime=sk.value/100*PL.cur.duration; }; }
  playerUI();
}
