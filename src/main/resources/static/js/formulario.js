/* Formulario generico e desfazer. */
"use strict";

/* ---------- EDICAO: tudo passa por formulario ---------- */

/* Remocao nao pede "tem certeza?": faz, e oferece desfazer. Guarda o guia e a mesa
   inteiros porque remover um cadastro mexe nos dois. */
function comDesfazer(msg,acao){
  var g=JSON.stringify(D), m=JSON.stringify(MESA), vw=S.view, ss=S.sessao;
  acao(); save(); render(); refreshCenaModal();
  toastAcao(msg,"Desfazer",function(){
    restauraGuiaEMesa(JSON.parse(g),JSON.parse(m));
    S.view=vw; S.sessao=ss;
    save(); salvarMesa(); render(); refreshCenaModal(); toast("Desfeito"); });
}
/* D e MESA sao globais de nucleo.js: o desfazer troca os dois de uma vez */
function restauraGuiaEMesa(guia,mesa){ D=guia; MESA=mesa; } // NOSONAR: atribui as globais declaradas em nucleo.js

function pget(o,p){
  for(var k of String(p).split(".")){ if(o==null)return undefined; o=o[k]; }
  return o;
}
function pset(o,p,v){
  var ks=String(p).split("."), ult=ks.pop();
  for(var k of ks){ o=o[k]; }
  o[ult]=v;
}
/* valor de um campo da tela para a copia: numero apagado fica vazio (null), e nao zero, porque
   zero e um valor que a pessoa nao digitou */
var LEITOR_DE_CAMPO={
  check:function(n){ return n.checked; },
  num:function(n){ if(n.value==="")return null; var x=Number(n.value); return Number.isFinite(x)?x:null; },
  linhas:function(n){ return String(n.value||"").split("\n").map(function(x){ return x.trim(); }).filter(Boolean); }
};

/* campos: [{k, rot, tipo, dica, ph, obrig, ops, linhas, um, novo, campos, valida}]
   tipo: texto (padrao) | area | linhas | num | sel | check | faixa | senha | img | imgs | grupo
   valida(valor, copia): opcional, devolve a mensagem de erro do campo ou ""
   Trabalha numa copia; o original so muda em o.salvar(copia). */
var FORMN=0;
function formulario(titulo,campos,valor,o){
  o=o||{};
  var w=structuredClone(valor||{}), ini="", fechando=false, GR={}, ov, fid="f"+(++FORMN)+"-";
  /* o grupo se repete por dentro: o HTML de cada linha sai daqui, campo a campo */
  function campoHtml(c,pre){
    var p=pre+c.k, v=pget(w,p), linhas=[];
    if(c.tipo==="grupo"){
      GR[p]=c;
      linhas=(Array.isArray(v)?v:[]).map(function(x,i){
        return c.campos.map(function(sc){ return campoHtml(sc,p+"."+i+"."); }).join(""); });
    }
    return htmlDe("t-campo",{c:c,p:p,v:v,linhas:linhas,fid:fid});
  }
  /* Campos seguidos com o mesmo "linha" ficam lado a lado, numa grade que quebra sozinha: campo curto
     (numero, escolha) nao precisa ocupar a largura inteira. Sem "linha", o campo segue em coluna. */
  function camposEmLinhas(){
    var out=[], i=0;
    while(i<campos.length){
      var c=campos[i];
      if(!c.linha){ out.push(campoHtml(c,"")); i++; continue; }
      var grupo=[];
      while(i<campos.length&&campos[i].linha===c.linha){ grupo.push(campoHtml(campos[i],"")); i++; }
      out.push('<div class="fgrade">'+grupo.join("")+"</div>");
    }
    return out.join("");
  }
  function corpo(){
    GR={};
    return htmlDe("t-formulario-corpo",{intro:o.intro||"",rotSalvar:o.rotSalvar||"Salvar",
      temObrig:campos.some(function(c){ return c.obrig; }),
      rotRemover:o.remover?(o.rotRemover||"Remover"):"",
      campos:camposEmLinhas(),
      faixas:Object.keys(LIB.faixas||{}).map(function(k){ return LIB.faixas[k].nome; })});
  }
  function colher(){
    $$("[data-f]",ov).forEach(function(n){
      var ler=LEITOR_DE_CAMPO[n.dataset.t];
      pset(w,n.dataset.f,ler?ler(n):n.value); });
  }
  function lista(p){ var a=pget(w,p); if(!Array.isArray(a)){ a=[]; pset(w,p,a); } return a; }
  function repinta(foco){
    var sc=$(".sbodyscroll",ov), y=sc?sc.scrollTop:0;
    $("#fmBody",ov).innerHTML=corpo(); liga();
    if(sc)sc.scrollTop=y;
    var n=foco?$('[data-f^="'+foco+'"]',ov):null;
    if(n){ n.focus(); n.scrollIntoView?.({block:"nearest"}); }
  }
  function ligaImagens(){
    $$("[data-pk]",ov).forEach(function(b){ b.onclick=function(){
      colher(); var p=b.dataset.pk;
      escolherImagem(pget(w,p)||"").then(function(rel){ if(rel===null)return; pset(w,p,rel); repinta(); }); }; });
    $$("[data-pkx]",ov).forEach(function(b){ b.onclick=function(){ colher(); pset(w,b.dataset.pkx,""); repinta(); }; });
    $$("[data-pka]",ov).forEach(function(b){ b.onclick=function(){
      colher(); var p=b.dataset.pka;
      escolherImagem("").then(function(rel){ if(!rel)return; lista(p).push(rel); repinta(); }); }; });
  }
  function ligaGrupos(){
    $$("[data-addr]",ov).forEach(function(b){ b.onclick=function(){
      colher(); var p=b.dataset.addr, c=GR[p], a=lista(p);
      a.push(c?.novo?c.novo():{}); repinta(p+"."+(a.length-1)+"."); }; });
    $$("[data-rmr]",ov).forEach(function(b){ b.onclick=function(){
      colher(); var pr=b.dataset.rmr.split(":");
      lista(pr[0]).splice(+pr[1],1); repinta(); }; });
  }
  function liga(){
    $("[data-ok]",ov).onclick=function(){ colher(); if(!valida())return; fechando=true; ov.close(); o.salvar(w); };
    /* o erro sai do campo assim que ele deixa de estar vazio */
    $$("[data-f]",ov).forEach(function(n){ n.addEventListener("input",function(){
      if(n.getAttribute("aria-invalid")==="true"&&String(n.value).trim())marcaErro(n,""); }); });
    $("[data-no]",ov).onclick=function(){ ov.close(); };
    var d=$("[data-del]",ov);
    if(d)d.onclick=function(){ fechando=true; ov.close(); o.remover(); };
    ligaImagens(); ligaGrupos();
  }
  /* Valida tudo de uma vez: cada campo obrigatorio vazio ganha a mensagem embaixo dele,
     aria-invalid, e o foco vai para o primeiro. Antes era um aviso de 2 segundos no rodape. */
  function marcaErro(n,msg){
    if(!n)return;
    var e=document.getElementById(fid+n.dataset.f+"-e");
    if(msg){ n.setAttribute("aria-invalid","true"); } else { n.removeAttribute("aria-invalid"); }
    if(e){ e.textContent=msg; e.hidden=!msg; }
  }
  function erroDoCampo(c){
    var v=pget(w,c.k);
    if(c.obrig&&!String(v??"").trim())return "Preencha "+c.rot.toLowerCase()+".";
    return c.valida?c.valida(v,w)||"":"";
  }
  function valida(){
    var primeiro=null, n=0;
    campos.forEach(function(c){
      var campo=$('[data-f="'+c.k+'"]',ov);
      if(!campo)return;
      var msg=erroDoCampo(c);
      marcaErro(campo,msg);
      if(msg){ n++; primeiro=primeiro||campo; } });
    if(!primeiro)return true;
    primeiro.focus(); primeiro.scrollIntoView?.({block:"center"});
    anunciar(n===1?"Um campo precisa de atenção.":n+" campos precisam de atenção.",true);
    return false;
  }
  ov=overlay(titulo,htmlDe("t-formulario",{corpo:corpo()}),{wide:!!o.wide,firme:true,foco:false});
  /* compacto: campos mais baixos e em colunas mais estreitas, para formularios longos (o do token) */
  if(o.compacto){ ov.querySelector(".form")?.classList.add("compacto"); }
  var fecha=ov.close;
  ov.close=function(){
    if(fechando){ fecha(); return; }
    colher();
    if(JSON.stringify(w)===ini){ fecha(); return; }
    confirmar("As mudanças desta janela ainda não foram salvas.",{titulo:"Descartar o que você mudou?",sim:"Descartar",nao:"Continuar editando"})
      .then(function(sim){ if(sim){ fechando=true; fecha(); } });
  };
  /* linhas de grupo e imagens trocam de lugar arrastando (js/ordenar.js) */
  ligarOrdem(ov,function(l){
    if(l.dataset.ordena!=="form")return null;
    return function(_l,de,para){ colher(); if(moverNaLista(lista(l.dataset.p),de,para))repinta(); }; });
  liga(); colher(); ini=JSON.stringify(w);
  ov.addEventListener("keydown",function(e){
    if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){ e.preventDefault(); $("[data-ok]",ov).click(); } });
  var p1=$("#fmBody input:not([type=checkbox]):not([readonly]),#fmBody textarea,#fmBody select",ov);
  if(p1)p1.focus(); else focar($("[data-ok]",ov));
  return ov;
}
