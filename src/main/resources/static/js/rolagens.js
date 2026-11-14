/* Painel de rolagens e rolador de dados. */
"use strict";

/* ---------- PAINEL DE ROLAGENS ----------
   As rolagens da mesa num painel solto, para nao encher o mural. Fica aberto entre
   telas (mora no body, nao no #view) e lembra lugar, tamanho e se estava aberto. */
var RP={iv:null};
function rpAberto(){ var p=$("#rolPainel"); return !!(p&&!p.hidden); }
function rpGeo(g){
  try{
    if(g===undefined)return JSON.parse(localStorage.getItem("grim_rolp_g")||"null");
    if(g)localStorage.setItem("grim_rolp_g",JSON.stringify(g)); else localStorage.removeItem("grim_rolp_g");
  }catch(_erro){
    /* sem localStorage (janela privada, dados bloqueados): o painel só não lembra o lugar */
  }
  return null;
}
function rpAplica(p,g){
  if(!g){ p.style.left=p.style.top=p.style.width=p.style.height=p.style.right=""; return; }
  var W=window.innerWidth, H=window.innerHeight, w=Math.max(220,Math.min(g.w,W-8)), h=Math.max(180,Math.min(g.h,H-8));
  p.style.width=w+"px"; p.style.height=h+"px"; p.style.right="auto";
  p.style.left=Math.max(0,Math.min(g.x,W-w))+"px"; p.style.top=Math.max(0,Math.min(g.y,H-h))+"px";
}
function painelRolagens(abrir){
  var p=$("#rolPainel");
  if(!p){
    p=el("aside",{"class":"rolpainel",id:"rolPainel","aria-label":"Rolagens da mesa"});
    p.hidden=true;
    p.innerHTML=htmlDe("t-painel-rolagens",{dado:d20Svg("")});
    document.body.appendChild(p);
    var hd=$("#rpHd",p), gp=$("#rpGrip",p);
    var atual=function(){ var r=p.getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height}; };
    var arrastar=function(alvo,muda){ alvo.addEventListener("pointerdown",function(e){
      if(e.button!==0||e.target.closest(".x")){ return; }
      e.preventDefault();
      var g0=atual(), sx=e.clientX, sy=e.clientY;
      try{ alvo.setPointerCapture(e.pointerId); }catch(_erro){ /* sem captura, o arraste segue pelo alvo */ }
      var mv=function(ev){ rpAplica(p,muda(g0,ev.clientX-sx,ev.clientY-sy)); };
      var up=function(){ alvo.removeEventListener("pointermove",mv); alvo.removeEventListener("pointerup",up);
        alvo.removeEventListener("pointercancel",up); rpGeo(atual()); };
      alvo.addEventListener("pointermove",mv); alvo.addEventListener("pointerup",up); alvo.addEventListener("pointercancel",up); }); };
    arrastar(hd,function(g,dx,dy){ return {x:g.x+dx,y:g.y+dy,w:g.w,h:g.h}; });
    arrastar(gp,function(g,dx,dy){ return {x:g.x,y:g.y,w:g.w+dx,h:g.h+dy}; });
    hd.addEventListener("dblclick",function(){ rpGeo(null); rpAplica(p,null); });
    $("#rpX",p).onclick=function(){ painelRolagens(false); };
    $("#rpForm",p).onsubmit=function(e){ e.preventDefault(); var v=$("#rpF",p).value.trim(); if(v)rolarDireto({formula:v}); };
    window.addEventListener("resize",function(){ if(!p.hidden)rpAplica(p,rpGeo()); });
  }
  var lig=abrir===undefined?p.hidden:!!abrir;
  if(lig&&!CID)lig=false;
  p.hidden=!lig;
  try{ localStorage.setItem("grim_rolp",lig?"1":"0"); }catch(_erro){ /* só deixa de lembrar se estava aberto */ }
  var b=$("#btnRol"); if(b)b.classList.toggle("on",lig);
  clearInterval(RP.iv);
  if(lig){ rpAplica(p,rpGeo()); feedDados([]); puxaRolagens(false);
    RP.iv=setInterval(function(){ if(!document.hidden&&!(DADOS.ov&&document.body.contains(DADOS.ov)))puxaRolagens(false); },2500); }
}
/* rolar pelo painel nao abre a janela do dado: o resultado ja entra na lista */
function rolarDireto(c){
  if(DADOS.ov&&document.body.contains(DADOS.ov)&&DADOS.rola){ DADOS.rola(c); return; }
  som("dado");
  api(cAPI("/rolagens"),{method:"POST",body:{formula:c.formula||null,lados:c.lados||null,publica:GM?DADOS.pub:null,
      rotulo:c.rotulo||"",pedidoId:c.pedidoId||null}})
    .then(function(r){ if(r.id>DADOS.ult)DADOS.ult=r.id;
      poeNoHist(r);
      som(r.extremo>0?"max":r.extremo<0?"min":"cai"); telaCritica(r.extremo);
      var f=$("#rpF"); if(f)f.value=""; })
    .catch(function(e){ toast(e?.message||"não deu para rolar"); });
}
/* ---------- DADOS ----------
   Quem sorteia e o servidor, e e ele quem decide quem ve: rolagem de jogador segue a regra
   da mesa (campanha.rolagensAbertas), a do mestre segue o que ele marcou na hora. A tela so
   anima ate o numero que voltou. */
var DADOS={hist:[],ult:0,pronto:false,pub:true,ov:null,t:null};
function rolaDado(l){ var a=new Uint32Array(1);
  try{ crypto.getRandomValues(a); }
  catch(_erro){
    /* só anima o número que passa no rosto do dado: quem sorteia de verdade é o servidor */
    a[0]=Math.floor(Math.random()*4294967296); // NOSONAR
  }
  return 1+(a[0]%l); }
function campAtual(){ return CAMPANHAS.find(function(x){ return String(x.id)===String(CID); })||{}; }
function rolagensAbertas(){ return campAtual().rolagensAbertas!==false; }
function zeraDados(){ DADOS.hist=[]; DADOS.ult=0; DADOS.pronto=false;
  try{ DADOS.pub=localStorage.getItem("grim_rolpub")!=="0"; }catch(_erro){ DADOS.pub=true; } }
function classeDado(r){ return r.extremo>0?"crit":r.extremo<0?"falha":""; }
function puxaRolagens(avisa){
  if(!CID)return Promise.resolve();
  var cid=CID;
  return api(cAPI("/rolagens?desde="+DADOS.ult)).then(function(l){
    if(cid!==CID||!l?.length){ DADOS.pronto=true; return; }
    var novas=l.filter(function(r){ return !DADOS.hist.some(function(h){ return h.id===r.id; }); });
    DADOS.hist=novas.concat(DADOS.hist).slice(0,40);
    l.forEach(function(r){ if(r.id>DADOS.ult)DADOS.ult=r.id; });
    /* a primeira leitura so marca onde a mesa esta: nao despeja rolagens antigas em aviso */
    if(DADOS.pronto)novas.slice().reverse().forEach(function(r){ if(r.minha)return;
      if(r.pedido){ avisaPedido(r); return; }
      if(avisa)avisaRolagem(r);
      if(r.publica)telaCritica(r.extremo); });
    DADOS.pronto=true;
    feedDados(novas);
  }).catch(function(){ /* a próxima sondagem tenta de novo */ });
}
function avisaRolagem(r){
  $$(".toast.rol").forEach(function(x){ x.remove(); });
  var t=el("div",{"class":"toast rol"});
  t.innerHTML=htmlDe("t-aviso-rolagem",{dado:d20Svg(""),autor:r.autor,rotulo:r.rotulo,formula:r.formula,valor:r.valor,publica:r.publica});
  document.body.appendChild(t); setTimeout(function(){ t.remove(); },4500);
}
/* a leitura periodica pode trazer a rolagem antes da animacao acabar: entra uma vez so */
function poeNoHist(r){
  if(!DADOS.hist.some(function(h){ return h.id===r.id; })){ DADOS.hist.unshift(r); DADOS.hist=DADOS.hist.slice(0,40); }
  feedDados([r]);
}
function feedHtml(ids){
  return htmlDe("t-rolagens-feed",{itens:DADOS.hist.map(function(r){
    return {id:r.id,quem:r.minha?"Você":r.autor,pedido:r.pedido,rotulo:r.rotulo,formula:r.formula,detalhe:r.detalhe,
      mestre:r.mestre,publica:r.publica,valor:r.valor,nova:ids.includes(r.id),classe:r.pedido?"":classeDado(r)}; })});
}
/* a mesma lista vai para a janela do dado e para o painel, o que estiver aberto */
function feedDados(novas){
  var ids=(novas||[]).map(function(r){ return r.id; }), alvos=[];
  if(DADOS.ov&&document.body.contains(DADOS.ov))alvos.push($("#ddFeed",DADOS.ov));
  if(rpAberto())alvos.push($("#rpFeed"));
  alvos.forEach(function(box){
    if(!box){ return; }
    box.innerHTML=feedHtml(ids);
    $$("[data-resp]",box).forEach(function(b){ b.onclick=function(){
      var p=DADOS.hist.find(function(r){ return String(r.id)===b.dataset.resp; });
      if(p)rolarDireto({formula:p.formula,rotulo:p.rotulo,pedidoId:p.id}); }; }); });
}
/* o = {formula, rotulo, pedidoId, auto}: a ficha e o pedido do mestre abrem ja rolando */
function abrirDados(o){
  o=o||{};
  if(DADOS.ov&&document.body.contains(DADOS.ov)){
    if(o.formula&&DADOS.rola)DADOS.rola(o);
    return;
  }
  var ov=overlay("Dados",htmlDe("t-dados",{dado:d20Svg("dd"),mestre:GM,publica:!!DADOS.pub,abertas:GM?false:rolagensAbertas()}),{cls:"dadosheet"});
  DADOS.ov=ov; feedDados([]);
  $$("[data-vis]",ov).forEach(function(b){ b.onclick=function(){
    DADOS.pub=b.dataset.vis==="1";
    try{ localStorage.setItem("grim_rolpub",DADOS.pub?"1":"0"); }catch(_erro){ /* só não lembra a escolha */ }
    $$("[data-vis]",ov).forEach(function(x){ x.setAttribute("aria-pressed",(x.dataset.vis==="1")===DADOS.pub); }); }; });
  /* com a janela aberta a mesa aparece mais depressa; fechada, a sondagem da mesa da conta */
  var iv=setInterval(function(){ if(!document.body.contains(ov)){ clearInterval(iv); DADOS.ov=null; DADOS.rola=null; return; }
    if(!document.hidden)puxaRolagens(false); },2500);
  puxaRolagens(false);
  function trava(s){ $$("[data-dado],#ddGo,[data-f]",ov).forEach(function(x){ x.disabled=s; }); }
  function rola(c){
    var f=$("#ddFace",ov), n=$("#ddN",ov), i=0, res=null, girou=false, l=c.lados||20;
    trava(true); clearInterval(DADOS.t); f.className="dadoface"; f.getBoundingClientRect(); f.className="dadoface rolando";
    $("#ddLeg",ov).textContent=(c.rotulo?c.rotulo+" · ":"")+(c.formula||("d"+c.lados)); $("#ddDet",ov).textContent="";
    som("dado");
    function fim(){ if(!res||!girou)return;
      clearInterval(DADOS.t); n.textContent=res.valor;
      f.className="dadoface "+(classeDado(res)||"caiu");
      $("#ddLeg",ov).textContent=(res.rotulo?res.rotulo+" · ":"")+res.formula
        +(res.extremo>0?" · máximo":res.extremo<0?" · mínimo":"")+(res.publica?"":" · fechada");
      $("#ddDet",ov).textContent=res.detalhe==="["+res.valor+"]"?"":res.detalhe+" = "+res.valor;
      trava(false); som(res.extremo>0?"max":res.extremo<0?"min":"cai"); telaCritica(res.extremo);
      if(res.id>DADOS.ult)DADOS.ult=res.id;
      poeNoHist(res); }
    api(cAPI("/rolagens"),{method:"POST",body:{formula:c.formula||null,lados:c.lados||null,publica:GM?DADOS.pub:null,
        rotulo:c.rotulo||"",pedidoId:c.pedidoId||null}})
      .then(function(r){ res=r; fim(); })
      .catch(function(e){ clearInterval(DADOS.t); f.className="dadoface"; n.textContent="–"; trava(false);
        $("#ddLeg",ov).textContent="Escolha um dado ou escreva a rolagem";
        toast(e?.message||"não deu para rolar"); });
    if(!fxLigado()){ girou=true; fim(); return; }
    DADOS.t=setInterval(function(){ if(!res||i<9){ n.textContent=rolaDado(l); i++; } if(i>=9){ girou=true; fim(); } },70);
  }
  DADOS.rola=rola;
  $$("[data-dado]",ov).forEach(function(b){ b.onclick=function(){ rola({lados:+b.dataset.dado}); }; });
  $$("[data-f]",ov).forEach(function(b){ b.onclick=function(){ $("#ddF",ov).value=b.dataset.f; rola({formula:b.dataset.f}); }; });
  $("#ddForm",ov).onsubmit=function(e){ e.preventDefault(); var v=$("#ddF",ov).value.trim(); if(v)rola({formula:v}); };
  var pd=$("#ddPedir",ov); if(pd)pd.onclick=function(){ pedirTeste(""); };
  if(o.formula){ $("#ddF",ov).value=o.formula; if(o.auto)rola(o); }
}
