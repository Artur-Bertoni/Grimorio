/* Quadro (canvas) da sessao. */
"use strict";

/* ---------- CANVAS ---------- */
var CV={z:.62,x:10,y:10,init:false};
/* quanto a raiz cresceu em relacao aos 16px: o quadro e desenhado em px e compensa no zoom */
function escalaRaiz(){ return (Number.parseFloat(getComputedStyle(document.documentElement).fontSize)||16)/16; }
function initCanvas(s){
  var wrap=$("#cvwrap"),cv=$("#cv"),svg=$("#cvsvg"); if(!wrap)return;
  /* translate em pixel inteiro e escala em degraus de 1%: com fracao o texto dos cartoes sai borrado */
  var mexT=null;
  function apply(){ var z=Math.round(CV.z*100)/100;
    var tr="translate("+Math.round(CV.x)+"px,"+Math.round(CV.y)+"px) scale("+z+")";
    cv.style.transform=tr; svg.style.transform=tr;
    cv.classList.add("mexendo"); clearTimeout(mexT);
    mexT=setTimeout(function(){ cv.classList.remove("mexendo"); },180); }
  /* a curva que liga um territorio ao seguinte; o desenho esta em componentes/quadro.html */
  function links(){ var ps=s.territorios.map(function(t,i){var p=tpos(s,i);return {x:p.x+122,y:p.y+40};}),curvas=[];
    for(var i=0;i<ps.length-1;i++){ var A=ps[i],B=ps[i+1],mx=(A.x+B.x)/2;
      curvas.push("M"+A.x+" "+A.y+" C "+mx+" "+A.y+", "+mx+" "+B.y+", "+B.x+" "+B.y); }
    svg.innerHTML=htmlDe("t-quadro-ligacoes",{curvas:curvas}); }
  links(); apply();
  var drag=null, supClick=false, linha=null;
  /* Ao soltar: encaixa numa grade de 16px e, se cair por cima de outro territorio, desce ate
     ficar 24px abaixo dele. O mapa da sessao nunca fica com um rotulo sobre a borda do vizinho. */
  function encaixaTerritorio(k,no){
    var t=s.territorios[k], G=16, folga=24;
    t.x=Math.max(0,Math.round(t.x/G)*G); t.y=Math.max(0,Math.round(t.y/G)*G);
    var w=no.offsetWidth, h=no.offsetHeight;
    /* no maximo uma descida por territorio: mais que isso seria dar voltas */
    var voltas=s.territorios.length;
    while(voltas-->0){
      var bateu=$$(".terr",cv).find(function(o){ if(o===no)return false;
        return t.x<o.offsetLeft+o.offsetWidth+folga&&t.x+w+folga>o.offsetLeft&&t.y<o.offsetTop+o.offsetHeight+folga&&t.y+h+folga>o.offsetTop; });
      if(!bateu)break;
      t.y=Math.round((bateu.offsetTop+bateu.offsetHeight+folga)/G)*G;
    }
    no.style.left=t.x+"px"; no.style.top=t.y+"px"; links();
  }
  function limparLinha(){ linha?.remove(); }
  function marcarAlvo(x,y){
    if(!linha){ linha=document.createElement("div"); linha.className="dropline"; }
    var terr=document.elementFromPoint(x,y)?.closest?.(".terr")||null;
    if(!terr){ limparLinha(); drag.alvo=null; return; }
    var cards=Array.prototype.slice.call(terr.querySelectorAll(".card")).filter(function(n){return n!==drag.node;});
    var k=cards.length;
    for(var i=0;i<cards.length;i++){ var r=cards[i].getBoundingClientRect();
      if(y<r.top+r.height/2){ k=i; break; } }
    drag.alvo={terr:terr.dataset.terr,k:k};
    if(k<cards.length){ cards[k].before(linha); return; }
    var ar=terr.querySelector(".addrow");
    if(ar)ar.before(linha); else terr.appendChild(linha);
  }
  /* pinca: com dois dedos no quadro o arraste para e o zoom segue a distancia entre eles */
  var toques={}, pinca=null;
  function doisToques(){ var k=Object.keys(toques); return k.length===2?[toques[k[0]],toques[k[1]]]:null; }
  function capturar(id){ try{ wrap.setPointerCapture(id); }catch(error_){ /* falha aqui nao muda o que a pessoa ve */ } }
  function suprimeClique(){ supClick=true; setTimeout(function(){ supClick=false; },60); }
  function soltaCard(){ if(drag?.m!=="c")return;
    drag.node.classList.remove("dragging"); drag.node.style.transform="";
    drag.node.style.pointerEvents=""; limparLinha(); }
  /* o segundo dedo no quadro comeca a pinca e larga o que estava sendo arrastado */
  function comecaPinca(e){
    if(e.pointerType!=="touch")return false;
    toques[e.pointerId]={x:e.clientX,y:e.clientY};
    var par=doisToques(); if(!par)return false;
    soltaCard(); drag=null; var r0=wrap.getBoundingClientRect();
    pinca={d:Math.hypot(par[0].x-par[1].x,par[0].y-par[1].y)||1,z:CV.z,x:CV.x,y:CV.y,
      cx:(par[0].x+par[1].x)/2-r0.left,cy:(par[0].y+par[1].y)/2-r0.top};
    e.preventDefault(); return true; }
  function comecaTerritorio(e,t){
    var k=s.territorios.map(function(x){ return x.id; }).indexOf(t.dataset.terr);
    if(k<0)return false;
    var tp=tpos(s,k);
    drag={m:"t",k:k,sx:e.clientX,sy:e.clientY,ox:tp.x,oy:tp.y,node:t,moved:false};
    e.preventDefault(); capturar(e.pointerId); return true; }
  wrap.addEventListener("pointerdown",function(e){
    if(comecaPinca(e)||foraDoQuadro(e.target))return;
    var card=e.target.closest(".card");
    if(card){
      /* no toque o cartao so arrasta pela alca: o dedo no resto do cartao rola o quadro, e o
         toque curto continua abrindo a cena */
      drag=(e.pointerType==="touch"&&!e.target.closest(".alca"))
        ? {m:"p",sx:e.clientX,sy:e.clientY,ox:CV.x,oy:CV.y,lim:true,moved:false}
        : {m:"c",node:card,id:card.dataset.scn,sx:e.clientX,sy:e.clientY,moved:false,alvo:null};
      return; }
    var t=e.target.closest(".terr");
    if(t&&comecaTerritorio(e,t))return;
    drag={m:"p",sx:e.clientX,sy:e.clientY,ox:CV.x,oy:CV.y,lim:false,moved:false};
    e.preventDefault(); capturar(e.pointerId);
  });
  function movePinca(){
    var par=doisToques(); if(!par)return;
    var d=Math.hypot(par[0].x-par[1].x,par[0].y-par[1].y)||1;
    var nz=Math.min(2.2*escalaRaiz(),Math.max(.22,pinca.z*d/pinca.d));
    CV.x=pinca.cx-(pinca.cx-pinca.x)*(nz/pinca.z); CV.y=pinca.cy-(pinca.cy-pinca.y)*(nz/pinca.z); CV.z=nz; apply(); }
  function moveCard(e,dx,dy){
    if(!drag.moved){
      if(quadroParado(dx,dy,5))return;
      drag.moved=true; e.preventDefault(); capturar(e.pointerId);
      drag.node.classList.add("dragging"); drag.node.style.pointerEvents="none"; }
    drag.node.style.transform="translate("+(dx/CV.z)+"px,"+(dy/CV.z)+"px)";
    marcarAlvo(e.clientX,e.clientY); }
  function moveFundo(e,dx,dy){
    if(drag.lim&&!drag.moved){
      if(quadroParado(dx,dy,5))return;
      drag.moved=true; capturar(e.pointerId); }
    CV.x=drag.ox+dx; CV.y=drag.oy+dy; apply(); }
  function moveTerritorio(dx,dy){
    if(!drag.moved&&quadroParado(dx,dy,4))return;
    drag.moved=true;
    var t=s.territorios[drag.k]; t.x=Math.round(drag.ox+dx/CV.z); t.y=Math.round(drag.oy+dy/CV.z);
    drag.node.style.left=t.x+"px"; drag.node.style.top=t.y+"px"; links(); }
  wrap.addEventListener("pointermove",function(e){
    if(toques[e.pointerId]){ toques[e.pointerId]={x:e.clientX,y:e.clientY}; }
    if(pinca){ movePinca(); return; }
    if(!drag)return;
    var dx=e.clientX-drag.sx, dy=e.clientY-drag.sy;
    if(drag.m==="c"){ moveCard(e,dx,dy); }
    else if(drag.m==="p"){ moveFundo(e,dx,dy); }
    else { moveTerritorio(dx,dy); } });
  function tiraToque(e){ delete toques[e.pointerId]; if(!doisToques())pinca=null; }
  wrap.addEventListener("pointerup",function(e){
    tiraToque(e);
    var m=drag?.m;
    if(m==="c"){ soltaCard();
      if(drag.moved){ suprimeClique(); if(drag.alvo)moverCena(s,drag.id,drag.alvo.terr,drag.alvo.k); } }
    else if(m==="t"){ if(drag.moved){ encaixaTerritorio(drag.k,drag.node); save(); } }
    else if(m==="p"&&drag.lim&&drag.moved){ suprimeClique(); }
    drag=null;
    try{wrap.releasePointerCapture(e.pointerId);}catch(error_){ /* falha aqui nao muda o que a pessoa ve */ } });
  wrap.addEventListener("pointercancel",function(e){ tiraToque(e); soltaCard(); drag=null; });
  wrap.addEventListener("wheel",function(e){
    if(e.target.closest&&(e.target.closest(".railfloat")||e.target.closest(".cvtools")))return;
    e.preventDefault();
    var r=wrap.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;
    var nz=Math.min(2.2*escalaRaiz(),Math.max(.22,CV.z*(e.deltaY<0?1.12:.89)));
    CV.x=mx-(mx-CV.x)*(nz/CV.z); CV.y=my-(my-CV.y)*(nz/CV.z); CV.z=nz; apply(); },{passive:false});
  $$("[data-z]",wrap).forEach(function(b){ b.onclick=function(){ var k=b.dataset.z;
    if(k==="+"){ CV.z=Math.min(2.2*escalaRaiz(),CV.z*1.2); }
    else if(k==="-"){ CV.z=Math.max(.22,CV.z/1.2); }
    else { enquadrar(); }
    apply(); }; });
  function enquadrar(){
    var maxX=0,maxY=0;
    $$(".terr",cv).forEach(function(t){ maxX=Math.max(maxX,t.offsetLeft+t.offsetWidth); maxY=Math.max(maxY,t.offsetTop+t.offsetHeight); });
    var r=wrap.getBoundingClientRect(), pad=20;
    /* o painel pode estar em qualquer canto: desconta do lado em que ele esta */
    var rf=$("#railFloat"), rw=0, rr=0;
    if(rf&&!rf.hidden){ if(rf.offsetLeft+rf.offsetWidth/2<r.width/2)rw=rf.offsetLeft+rf.offsetWidth+16-pad;
      else rr=r.width-rf.offsetLeft+16-pad; }
    var av=Math.max(240,r.width-pad*2-rw-rr), ah=Math.max(200,r.height-pad*2);
    CV.z=Math.max(.16,Math.min(1.6*escalaRaiz(),Math.min(av/(maxX||1),ah/(maxY||1))));
    CV.x=pad+rw+Math.max(0,(av-(maxX||0)*CV.z)/2);
    CV.y=pad+Math.max(0,(ah-(maxY||0)*CV.z)/2);
    apply();
  }
  CV.fit=enquadrar; CV.ap=apply;
  if(!CV.init){ CV.init=true; setTimeout(enquadrar,30); }
  $$(".card",cv).forEach(function(card){ card.addEventListener("click",function(e){
    if(!supClick&&!e.target.closest("[data-act]"))abrirCenaModal(card.dataset.scn); }); });
  painelMovel(wrap);
  var rb=$("#railBtn");
  if(rb){ rb.onclick=function(){ S.rail=!S.rail; $("#railFloat").hidden=!S.rail;
    rb.classList.toggle("on",S.rail); rb.setAttribute("aria-pressed",String(S.rail)); if(CV.fit)CV.fit(); }; }
}
/* painel, ferramentas e controles do quadro tratam o proprio clique */
function foraDoQuadro(t){
  return t.isContentEditable||!!t.closest(".railfloat,.cvtools,button,select,input"); }
/* ate andar um pouco e clique, nao arraste */
function quadroParado(dx,dy,lim){ return Math.abs(dx)<lim&&Math.abs(dy)<lim; }

/* Arrasta o quadro, sem mudar o zoom, ate o elemento ficar na parte livre: dentro da tela e fora
   do painel. O guia usa antes de destacar um cartao, que podia estar escondido atras do painel.
   Devolve true se mexeu. */
function quadroMostra(e){
  var wrap=$("#cvwrap"); if(!wrap||!CV.ap||!e?.closest("#cv"))return false;
  var w=wrap.getBoundingClientRect(), r=e.getBoundingClientRect(), pad=24;
  var L=w.left+pad, R=w.right-pad, T=w.top+pad, B=Math.min(w.bottom,window.innerHeight)-pad;
  var rf=$("#railFloat");
  if(rf&&!rf.hidden){ var p=rf.getBoundingClientRect();
    /* o painel pode estar em qualquer canto: tira o lado dele; se ele cobre quase tudo (gaveta
       do celular), ignora, porque nao sobraria onde pôr o cartao */
    if(p.left+p.width/2<w.left+w.width/2){ if(R-(p.right+pad)>=200)L=p.right+pad; }
    else if((p.left-pad)-L>=200)R=p.left-pad; }
  var dx=0, dy=0;
  if(r.left<L||r.width>R-L)dx=L-r.left; else if(r.right>R)dx=R-r.right;
  if(r.top<T||r.height>B-T)dy=T-r.top; else if(r.bottom>B)dy=B-r.bottom;
  if(!dx&&!dy)return false;
  CV.x+=dx; CV.y+=dy; CV.ap(); return true;
}

/* Posicao e tamanho do painel do quadro. Fica no navegador (conveniencia de quem usa,
   nao dado da campanha), em px relativos ao quadro. */
function painelLer(){ try{ return JSON.parse(localStorage.getItem("grim_painel")||"null"); }catch(error_){ return null; } }
function painelGravar(g){ try{ if(g)localStorage.setItem("grim_painel",JSON.stringify(g)); else localStorage.removeItem("grim_painel"); }catch(error_){ /* falha aqui nao muda o que a pessoa ve */ } }
function painelMovel(wrap){
  var rf=$("#railFloat"), hd=$("#rfHd"), gp=$("#rfGrip"); if(!rf||!hd||!gp)return;
  function aplicar(g){
    if(!g){ rf.style.left=rf.style.top=rf.style.width=rf.style.height=rf.style.bottom=""; return; }
    var W=wrap.clientWidth, H=wrap.clientHeight;
    var w=Math.max(200,Math.min(g.w,W-8)), h=Math.max(140,Math.min(g.h,H-8));
    rf.style.width=w+"px"; rf.style.height=h+"px"; rf.style.bottom="auto";
    rf.style.left=Math.max(0,Math.min(g.x,W-w))+"px"; rf.style.top=Math.max(0,Math.min(g.y,H-h))+"px";
  }
  function atual(){ return {x:rf.offsetLeft,y:rf.offsetTop,w:rf.offsetWidth,h:rf.offsetHeight}; }
  aplicar(painelLer());
  function arrastar(el,muda){
    el.addEventListener("pointerdown",function(e){
      if(e.button!==0||e.target.closest("button"))return;
      e.preventDefault(); e.stopPropagation();
      var g0=atual(), sx=e.clientX, sy=e.clientY;
      try{ el.setPointerCapture(e.pointerId); }catch(error_){ /* falha aqui nao muda o que a pessoa ve */ }
      function mv(ev){ aplicar(muda(g0,ev.clientX-sx,ev.clientY-sy)); }
      function up(){ el.removeEventListener("pointermove",mv); el.removeEventListener("pointerup",up);
        el.removeEventListener("pointercancel",up); painelGravar(atual()); if(CV.fit)CV.fit(); }
      el.addEventListener("pointermove",mv); el.addEventListener("pointerup",up); el.addEventListener("pointercancel",up);
    });
  }
  arrastar(hd,function(g,dx,dy){ return {x:g.x+dx,y:g.y+dy,w:g.w,h:g.h}; });
  arrastar(gp,function(g,dx,dy){ return {x:g.x,y:g.y,w:g.w+dx,h:g.h+dy}; });
  hd.addEventListener("dblclick",function(){ painelGravar(null); aplicar(null); if(CV.fit)CV.fit(); });
  var pos=$("#rfPos"); if(pos)pos.onclick=function(){ menuPainel(pos,function(v){
    var g=geometriaPainel(v,atual(),wrap.clientWidth,wrap.clientHeight);
    painelGravar(g); aplicar(g); if(CV.fit)CV.fit(); }); };
}
