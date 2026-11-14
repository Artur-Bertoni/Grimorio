/* Formulario generico e desfazer. */
"use strict";

/* ---------- EDICAO: tudo passa por formulario ---------- */

function toastAcao(m,rot,fn){
  $$(".toast.act").forEach(function(x){x.remove();});
  var t=el("div",{"class":"toast act"}); t.appendChild(el("span",{text:m}));
  var b=el("button",{text:rot}); b.onclick=function(){ t.remove(); fn(); }; t.appendChild(b);
  document.body.appendChild(t); setTimeout(function(){t.remove();},7000);
}
/* Remocao nao pede "tem certeza?": faz, e oferece desfazer. Guarda o guia e a mesa
   inteiros porque remover um cadastro mexe nos dois. */
function comDesfazer(msg,acao){
  var g=JSON.stringify(D), m=JSON.stringify(MESA), vw=S.view, ss=S.sessao;
  acao(); save(); render(); refreshCenaModal();
  toastAcao(msg,"Desfazer",function(){
    D=JSON.parse(g); MESA=JSON.parse(m); S.view=vw; S.sessao=ss;
    save(); salvarMesa(); render(); refreshCenaModal(); toast("Desfeito"); });
}

function pget(o,p){ var ks=String(p).split("."); for(var i=0;i<ks.length;i++){ if(o==null)return undefined; o=o[ks[i]]; } return o; }
function pset(o,p,v){ var ks=String(p).split("."); for(var i=0;i<ks.length-1;i++)o=o[ks[i]]; o[ks[ks.length-1]]=v; }

/* campos: [{k, rot, tipo, dica, ph, obrig, ops, linhas, um, novo, campos}]
   tipo: texto (padrao) | area | linhas | num | sel | check | faixa | img | imgs | grupo
   Trabalha numa copia; o original so muda em o.salvar(copia). */
function formulario(titulo,campos,valor,o){
  o=o||{};
  var w=JSON.parse(JSON.stringify(valor||{})), ini="", fechando=false, GR={}, ov;
  /* o grupo se repete por dentro: o HTML de cada linha sai daqui, campo a campo */
  function campoHtml(c,pre){
    var p=pre+c.k, v=pget(w,p), linhas=[];
    if(c.tipo==="grupo"){ GR[p]=c;
      linhas=(Array.isArray(v)?v:[]).map(function(x,i){
        return c.campos.map(function(sc){ return campoHtml(sc,p+"."+i+"."); }).join(""); }); }
    return htmlDe("t-campo",{c:c,p:p,v:v,linhas:linhas});
  }
  function corpo(){ GR={};
    return htmlDe("t-formulario-corpo",{intro:o.intro||"",rotSalvar:o.rotSalvar||"Salvar",
      rotRemover:o.remover?(o.rotRemover||"Remover"):"",
      campos:campos.map(function(c){ return campoHtml(c,""); }).join(""),
      faixas:Object.keys(LIB.faixas||{}).map(function(k){ return LIB.faixas[k].nome; })}); }
  function colher(){ $$("[data-f]",ov).forEach(function(n){
    var t=n.getAttribute("data-t"), p=n.getAttribute("data-f"), v;
    if(t==="check")v=n.checked;
    else if(t==="num")v=(n.value===""?0:(Number(n.value)||0));
    else if(t==="linhas")v=String(n.value||"").split("\n").map(function(x){return x.trim();}).filter(Boolean);
    else v=n.value;
    pset(w,p,v); }); }
  function lista(p){ var a=pget(w,p); if(!Array.isArray(a)){ a=[]; pset(w,p,a); } return a; }
  function repinta(foco){ var sc=$(".sbodyscroll",ov), y=sc?sc.scrollTop:0;
    $("#fmBody",ov).innerHTML=corpo(); liga(); if(sc)sc.scrollTop=y;
    if(foco){ var n=$('[data-f^="'+foco+'"]',ov); if(n){ n.focus(); if(n.scrollIntoView)n.scrollIntoView({block:"nearest"}); } } }
  function liga(){
    $("[data-ok]",ov).onclick=function(){ colher();
      var falta=campos.filter(function(c){return c.obrig&&!String(pget(w,c.k)==null?"":pget(w,c.k)).trim();})[0];
      if(falta){ toast("Preencha: "+falta.rot); var n=$('[data-f="'+falta.k+'"]',ov); if(n)n.focus(); return; }
      fechando=true; ov.close(); o.salvar(w); };
    $("[data-no]",ov).onclick=function(){ ov.close(); };
    var d=$("[data-del]",ov); if(d)d.onclick=function(){ fechando=true; ov.close(); o.remover(); };
    $$("[data-pk]",ov).forEach(function(b){ b.onclick=function(){ colher(); var p=b.getAttribute("data-pk");
      escolherImagem(pget(w,p)||"").then(function(rel){ if(rel===null)return; pset(w,p,rel); repinta(); }); }; });
    $$("[data-pkx]",ov).forEach(function(b){ b.onclick=function(){ colher(); pset(w,b.getAttribute("data-pkx"),""); repinta(); }; });
    $$("[data-pka]",ov).forEach(function(b){ b.onclick=function(){ colher(); var p=b.getAttribute("data-pka");
      escolherImagem("").then(function(rel){ if(!rel)return; lista(p).push(rel); repinta(); }); }; });
    $$("[data-addr]",ov).forEach(function(b){ b.onclick=function(){ colher(); var p=b.getAttribute("data-addr"), c=GR[p], a=lista(p);
      a.push(c&&c.novo?c.novo():{}); repinta(p+"."+(a.length-1)+"."); }; });
    $$("[data-rmr]",ov).forEach(function(b){ b.onclick=function(){ colher(); var pr=b.getAttribute("data-rmr").split(":");
      lista(pr[0]).splice(+pr[1],1); repinta(); }; });
    $$("[data-mvr]",ov).forEach(function(b){ b.onclick=function(){ colher(); var pr=b.getAttribute("data-mvr").split(":");
      var a=lista(pr[0]), i=+pr[1], j=i+(+pr[2]); if(j<0||j>=a.length)return;
      var t=a[i]; a[i]=a[j]; a[j]=t; repinta(); }; });
  }
  ov=overlay(titulo,htmlDe("t-formulario",{corpo:corpo()}),{wide:!!o.wide,firme:true});
  var fecha=ov.close;
  ov.close=function(){
    if(!fechando){ colher(); if(JSON.stringify(w)!==ini&&!confirm("Descartar o que você mudou?"))return; }
    fecha(); };
  liga(); colher(); ini=JSON.stringify(w);
  ov.addEventListener("keydown",function(e){
    if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){ e.preventDefault(); $("[data-ok]",ov).click(); } });
  setTimeout(function(){ var p=$("#fmBody input:not([type=checkbox]),#fmBody textarea",ov); if(p)p.focus(); },40);
  return ov;
}
