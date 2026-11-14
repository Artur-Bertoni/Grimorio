/* Quadro (canvas) da sessao. */
"use strict";

/* ---------- CANVAS ---------- */
var CV={z:.62,x:10,y:10,init:false};
/* quanto a raiz cresceu em relacao aos 16px: o quadro e desenhado em px e compensa no zoom */
function escalaRaiz(){ return (parseFloat(getComputedStyle(document.documentElement).fontSize)||16)/16; }
function initCanvas(s){
  var wrap=$("#cvwrap"),cv=$("#cv"),svg=$("#cvsvg"); if(!wrap)return;
  function apply(){ var tr="translate("+CV.x+"px,"+CV.y+"px) scale("+CV.z+")";
    cv.style.transform=tr; svg.style.transform=tr; }
  /* a curva que liga um territorio ao seguinte; o desenho esta em componentes/quadro.html */
  function links(){ var ps=s.territorios.map(function(t,i){var p=tpos(s,i);return {x:p.x+122,y:p.y+40};}),curvas=[];
    for(var i=0;i<ps.length-1;i++){ var A=ps[i],B=ps[i+1],mx=(A.x+B.x)/2;
      curvas.push("M"+A.x+" "+A.y+" C "+mx+" "+A.y+", "+mx+" "+B.y+", "+B.x+" "+B.y); }
    svg.innerHTML=htmlDe("t-quadro-ligacoes",{curvas:curvas}); }
  links(); apply();
  var drag=null, supClick=false, linha=null;
  function limparLinha(){ if(linha&&linha.parentNode)linha.parentNode.removeChild(linha); }
  function marcarAlvo(x,y){
    if(!linha){ linha=document.createElement("div"); linha.className="dropline"; }
    var sob=document.elementFromPoint(x,y);
    var terr=(sob&&sob.closest)?sob.closest(".terr"):null;
    if(!terr){ limparLinha(); drag.alvo=null; return; }
    var cards=Array.prototype.slice.call(terr.querySelectorAll(".card")).filter(function(n){return n!==drag.node;});
    var k=cards.length;
    for(var i=0;i<cards.length;i++){ var r=cards[i].getBoundingClientRect();
      if(y<r.top+r.height/2){ k=i; break; } }
    drag.alvo={terr:terr.getAttribute("data-terr"),k:k};
    if(k<cards.length)terr.insertBefore(linha,cards[k]);
    else { var ar=terr.querySelector(".addrow"); if(ar)terr.insertBefore(linha,ar); else terr.appendChild(linha); }
  }
  wrap.addEventListener("pointerdown",function(e){
    if(e.target.closest(".railfloat")||e.target.closest(".cvtools"))return;
    if(e.target.isContentEditable)return;
    if(e.target.closest("button")||e.target.closest("select")||e.target.closest("input"))return;
    var card=e.target.closest(".card");
    var t=e.target.closest(".terr");
    if(card){
      drag={m:"c",node:card,id:card.getAttribute("data-scn"),sx:e.clientX,sy:e.clientY,moved:false,alvo:null};
      return; }
    if(t&&!card){
      var id=t.getAttribute("data-terr"),k=s.territorios.map(function(x){return x.id;}).indexOf(id);
      if(k>=0){ var tp=tpos(s,k);
        drag={m:"t",k:k,sx:e.clientX,sy:e.clientY,ox:tp.x,oy:tp.y,node:t,moved:false};
        e.preventDefault();
        try{wrap.setPointerCapture(e.pointerId);}catch(err){}
        return; } }
    drag={m:"p",sx:e.clientX,sy:e.clientY,ox:CV.x,oy:CV.y,lim:!!card,moved:false};
    if(!card){ e.preventDefault(); try{wrap.setPointerCapture(e.pointerId);}catch(err){} }
  });
  wrap.addEventListener("pointermove",function(e){ if(!drag)return;
    var dx=e.clientX-drag.sx,dy=e.clientY-drag.sy;
    if(drag.m==="c"){
      if(!drag.moved){
        if(Math.abs(dx)<5&&Math.abs(dy)<5)return;
        drag.moved=true; e.preventDefault();
        try{wrap.setPointerCapture(e.pointerId);}catch(err){}
        drag.node.classList.add("dragging"); drag.node.style.pointerEvents="none";
      }
      drag.node.style.transform="translate("+(dx/CV.z)+"px,"+(dy/CV.z)+"px)";
      marcarAlvo(e.clientX,e.clientY); return; }
    if(drag.m==="p"){
      if(drag.lim&&!drag.moved){
        if(Math.abs(dx)<5&&Math.abs(dy)<5)return;
        drag.moved=true; try{wrap.setPointerCapture(e.pointerId);}catch(err){} }
      CV.x=drag.ox+dx; CV.y=drag.oy+dy; apply(); }
    else { if(!drag.moved&&Math.abs(dx)<4&&Math.abs(dy)<4)return;
      drag.moved=true;
      var t=s.territorios[drag.k]; t.x=Math.round(drag.ox+dx/CV.z); t.y=Math.round(drag.oy+dy/CV.z);
      drag.node.style.left=t.x+"px"; drag.node.style.top=t.y+"px"; links(); } });
  wrap.addEventListener("pointerup",function(e){
    if(drag&&drag.m==="c"){
      drag.node.classList.remove("dragging"); drag.node.style.transform=""; drag.node.style.pointerEvents="";
      limparLinha();
      if(drag.moved){ supClick=true; setTimeout(function(){supClick=false;},60);
        if(drag.alvo)moverCena(s,drag.id,drag.alvo.terr,drag.alvo.k); }
    } else if(drag&&drag.m==="t"){ if(drag.moved)save(); }
    else if(drag&&drag.m==="p"&&drag.lim&&drag.moved){ supClick=true; setTimeout(function(){supClick=false;},60); }
    drag=null;
    try{wrap.releasePointerCapture(e.pointerId);}catch(err){} });
  wrap.addEventListener("pointercancel",function(){ if(drag&&drag.m==="c"){
      drag.node.classList.remove("dragging"); drag.node.style.transform=""; drag.node.style.pointerEvents=""; limparLinha(); }
    drag=null; });
  wrap.addEventListener("wheel",function(e){
    if(e.target.closest&&(e.target.closest(".railfloat")||e.target.closest(".cvtools")))return;
    e.preventDefault();
    var r=wrap.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;
    var nz=Math.min(2.2*escalaRaiz(),Math.max(.22,CV.z*(e.deltaY<0?1.12:.89)));
    CV.x=mx-(mx-CV.x)*(nz/CV.z); CV.y=my-(my-CV.y)*(nz/CV.z); CV.z=nz; apply(); },{passive:false});
  $$("[data-z]",wrap).forEach(function(b){ b.onclick=function(){ var k=b.getAttribute("data-z");
    if(k==="+")CV.z=Math.min(2.2*escalaRaiz(),CV.z*1.2); else if(k==="-")CV.z=Math.max(.22,CV.z/1.2);
    else enquadrar(); apply(); }; });
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
  CV.fit=enquadrar;
  if(!CV.init){ CV.init=true; setTimeout(enquadrar,30); }
  $$(".card",cv).forEach(function(card){ card.addEventListener("click",function(e){
    if(supClick)return;
    if(e.target.closest("[data-act]"))return; abrirCenaModal(card.getAttribute("data-scn")); }); });
  painelMovel(wrap);
  var rb=$("#railBtn"); if(rb)rb.onclick=function(){ S.rail=!S.rail; $("#railFloat").hidden=!S.rail; rb.classList.toggle("on",S.rail); if(CV.fit)CV.fit(); };
}

/* Posicao e tamanho do painel do quadro. Fica no navegador (conveniencia de quem usa,
   nao dado da campanha), em px relativos ao quadro. */
function painelMovel(wrap){
  var rf=$("#railFloat"), hd=$("#rfHd"), gp=$("#rfGrip"); if(!rf||!hd||!gp)return;
  function ler(){ try{ return JSON.parse(localStorage.getItem("grim_painel")||"null"); }catch(e){ return null; } }
  function gravar(g){ try{ if(g)localStorage.setItem("grim_painel",JSON.stringify(g)); else localStorage.removeItem("grim_painel"); }catch(e){} }
  function aplicar(g){
    if(!g){ rf.style.left=rf.style.top=rf.style.width=rf.style.height=rf.style.bottom=""; return; }
    var W=wrap.clientWidth, H=wrap.clientHeight;
    var w=Math.max(200,Math.min(g.w,W-8)), h=Math.max(140,Math.min(g.h,H-8));
    rf.style.width=w+"px"; rf.style.height=h+"px"; rf.style.bottom="auto";
    rf.style.left=Math.max(0,Math.min(g.x,W-w))+"px"; rf.style.top=Math.max(0,Math.min(g.y,H-h))+"px";
  }
  function atual(){ return {x:rf.offsetLeft,y:rf.offsetTop,w:rf.offsetWidth,h:rf.offsetHeight}; }
  aplicar(ler());
  function arrastar(el,muda){
    el.addEventListener("pointerdown",function(e){
      if(e.button!==0)return;
      e.preventDefault(); e.stopPropagation();
      var g0=atual(), sx=e.clientX, sy=e.clientY;
      try{ el.setPointerCapture(e.pointerId); }catch(err){}
      function mv(ev){ aplicar(muda(g0,ev.clientX-sx,ev.clientY-sy)); }
      function up(){ el.removeEventListener("pointermove",mv); el.removeEventListener("pointerup",up);
        el.removeEventListener("pointercancel",up); gravar(atual()); if(CV.fit)CV.fit(); }
      el.addEventListener("pointermove",mv); el.addEventListener("pointerup",up); el.addEventListener("pointercancel",up);
    });
  }
  arrastar(hd,function(g,dx,dy){ return {x:g.x+dx,y:g.y+dy,w:g.w,h:g.h}; });
  arrastar(gp,function(g,dx,dy){ return {x:g.x,y:g.y,w:g.w+dx,h:g.h+dy}; });
  hd.addEventListener("dblclick",function(){ gravar(null); aplicar(null); if(CV.fit)CV.fit(); });
}
