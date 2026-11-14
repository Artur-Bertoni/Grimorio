/* Aba Mesa, a area dos jogadores. */
"use strict";

/* ---------- AREA DA MESA ---------- */
function MSECS(){ return [["resumos","Resumos"],["ev",Vm("evidencias")],["quem","Quem é quem"],
  ["regras",Vm("referencia")],["fichas",Vm("fichas")],["notas","Minhas anotações"],["mural","Mural"]]; }
function libBtnHtml(id){ return htmlDe("t-lib-botao",{id:id}); }
function libWire(ov,id,tp,x){
  var b=$("#"+id,ov); if(!b)return;
  if(!GM){ b.remove(); return; }
  function pinta(){ var on=jaLib(tp,x);
    b.classList.toggle("on",on);
    b.textContent=on?"✓ Liberado para a mesa":"Liberar para a mesa"; }
  pinta();
  b.onclick=function(){ var on=alternaLib(tp,x); pinta(); render(); toast(on?"Liberado para a mesa":"Tirado da mesa"); };
}
function pistaPorImg(src){ return ((D.elenco&&D.elenco.pistas)||[]).filter(function(h){return h.img&&h.img===src;})[0]||null; }
/* A mesa guarda uma copia do que foi liberado, porque o jogador nao le o guia.
   A copia e achada pelo id; as liberadas antes da v3 so tem nome. */
function snapDe(tp,x){
  return tp==="pistas"?{id:x.id,nome:x.nome,img:x.img||"",texto:x.texto||""}
                      :{id:x.id,nome:x.nome,img:x.img||"",desc:x.desc||""};
}
function achaLib(tp,x){ var l=MESA[EL[tp].lib]||[];
  for(var i=0;i<l.length;i++){ if(l[i].id?l[i].id===x.id:l[i].nome===x.nome)return i; }
  return -1; }
function jaLib(tp,x){ return !!(x&&EL[tp]&&EL[tp].lib)&&achaLib(tp,x)>=0; }
function liberar(tp,x){ var k=EL[tp].lib; MESA[k]=MESA[k]||[];
  var i=achaLib(tp,x); if(i>=0)MESA[k][i]=snapDe(tp,x); else MESA[k].push(snapDe(tp,x)); }
function tirar(tp,x){ var i=achaLib(tp,x); if(i>=0)MESA[EL[tp].lib].splice(i,1); }
function alternaLib(tp,x){ var on=jaLib(tp,x); if(on)tirar(tp,x); else liberar(tp,x); salvarMesa(); return !on; }
/* editou algo que ja esta liberado: a copia da mesa acompanha */
function sincLib(tp,x){ if(jaLib(tp,x)){ liberar(tp,x); salvarMesa(); } }

function viewMesa(){
  return htmlDe("t-mesa",{titulo:tituloApp(),mestre:GM,ini:iniPubHtml(),abas:subnav(MSECS(),S.msec,"data-msec"),corpo:mesaSec()});
}
function vazio(t){ return htmlDe("t-vazio",{texto:t}); }
function linhasDe(t){ return String(t||"").split("\n"); }
function mesaSec(){
  var k=S.msec;
  if(k==="resumos"){
    /* da mais nova para a mais antiga, uma aberta por vez: a de cima nasce aberta */
    var l=(MESA.resumos||[]).map(function(r,ix){return {r:r,ix:ix};})
      .sort(function(a,b){ return ((+b.r.n||0)-(+a.r.n||0))||(dataNum(b.r.data)-dataNum(a.r.data)); });
    if(S.resAb==null&&l.length)S.resAb=l[0].ix;
    return htmlDe("t-mesa-resumos",{mestre:GM,aberto:S.resAb,resumos:l.map(function(o){ var r=o.r;
      return {i:o.ix,n:r.n,titulo:r.titulo,data:r.data,tem:!!r.texto,linhas:linhasDe(r.texto)}; })});
  }
  if(k==="ev")return htmlDe("t-mesa-ev",{ev:MESA.ev||[]});
  if(k==="quem")return htmlDe("t-mesa-quem",{npcs:MESA.npcs||[],locais:MESA.locais||[]});
  if(k==="regras")return htmlDe("t-mesa-regras",{mestre:GM,grupos:PUBD().referencia||[]});
  if(k==="fichas")return fichasSecHtml();
  if(k==="notas")return htmlDe("t-mesa-notas");
  if(k==="mural")return htmlDe("t-mesa-mural");
  return "";
}
function hydrateMesa(){
  var v=$("#view");
  if(S.msec==="fichas")ligarFichas();
  ligarRefEditar();
  $$("[data-msec]",v).forEach(function(b){ b.onclick=function(){ S.msec=b.getAttribute("data-msec"); render(); }; });
  $$("details.resitem",v).forEach(function(d){ d.addEventListener("toggle",function(){
    var i=+d.getAttribute("data-res");
    if(d.open){ S.resAb=i; $$("details.resitem[open]",v).forEach(function(x){ if(x!==d)x.open=false; }); }
    else if(S.resAb===i)S.resAb=-1; }); });
  $$("[data-mloc]",v).forEach(function(c){ c.onclick=function(){
    var x=(MESA.locais||[])[+c.getAttribute("data-mloc")]; if(x&&x.img)projetar(x.img,x.nome); }; });
  $$("[data-mev]",v).forEach(function(f){ f.onclick=function(){
    var x=MESA.ev[+f.getAttribute("data-mev")]; if(x&&x.img)projetar(x.img,x.nome); }; });
  var ml=$("#mLib",v); if(ml)ml.onclick=abrirLiberar;
  var ar=$("#mAddRes",v); if(ar)ar.onclick=function(){ editarResumo(-1); };
  $$("[data-mres]",v).forEach(function(b){ b.onclick=function(){ editarResumo(+b.getAttribute("data-mres")); }; });
  $$("[data-mresd]",v).forEach(function(b){ b.onclick=function(){
    if(!confirm("Remover este resumo? Os jogadores deixam de ver."))return;
    MESA.resumos.splice(+b.getAttribute("data-mresd"),1); S.resAb=null; salvarMesa(); render(); }; });
  if(S.msec==="notas")carregarNotas();
  if(S.msec==="mural")carregarMural();
}
/* data do resumo: dd/mm/aaaa, com mascara enquanto digita e conferida ao salvar */
function mascaraData(inp){
  inp.setAttribute("inputmode","numeric"); inp.setAttribute("maxlength","10"); inp.setAttribute("autocomplete","off");
  inp.addEventListener("input",function(){
    var d=inp.value.replace(/\D/g,"").slice(0,8), o=d.slice(0,2);
    if(d.length>2)o+="/"+d.slice(2,4); if(d.length>4)o+="/"+d.slice(4);
    inp.value=o; });
}
function dataValida(s){ var m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s||"")); if(!m)return false;
  var d=new Date(+m[3],+m[2]-1,+m[1]);
  return d.getFullYear()===+m[3]&&d.getMonth()===+m[2]-1&&d.getDate()===+m[1]; }
function dataNum(s){ var m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s||"")); return m?(+m[3])*10000+(+m[2])*100+(+m[1]):0; }
function hojeBr(){ var d=new Date(), p=function(n){ return (n<10?"0":"")+n; };
  return p(d.getDate())+"/"+p(d.getMonth()+1)+"/"+d.getFullYear(); }
function editarResumo(i,pre){
  var novo=(i<0), prox=(MESA.resumos||[]).reduce(function(m,x){ return Math.max(m,+x.n||0); },0)+1;
  var r=novo?(pre||{n:prox,titulo:"",data:hojeBr(),texto:""}):MESA.resumos[i];
  var ov=overlay(novo?"Novo resumo":"Editar resumo",htmlDe("t-resumo-form",{n:r.n||1,titulo:r.titulo||"",data:r.data||""}));
  $("#rX",ov).value=r.texto||"";
  mascaraData($("#rD",ov));
  $("#rOk",ov).onclick=function(){
    var dt=$("#rD",ov).value.trim();
    if(dt&&!dataValida(dt)){ toast("Data inválida: use dd/mm/aaaa"); $("#rD",ov).focus(); return; }
    var o={n:+$("#rN",ov).value||1,titulo:$("#rT",ov).value.trim(),data:dt,texto:$("#rX",ov).value};
    if(novo)MESA.resumos.push(o); else MESA.resumos[i]=o;
    S.resAb=novo?MESA.resumos.length-1:i;
    salvarMesa(); ov.close(); render(); toast("Publicado para a mesa"); };
}
function abrirLiberar(){
  var s=(S.view==="sessao")?curSess():null;
  /* o que esta na sessao aberta vem primeiro */
  var grupos=["pistas","npcs","locais"].filter(function(tp){ return D.elenco[tp].length; }).map(function(tp){
    var ids=s?s[EL[tp].ids]:[];
    var ord=D.elenco[tp].slice().sort(function(a,b){ return (ids.indexOf(b.id)>=0?1:0)-(ids.indexOf(a.id)>=0?1:0); });
    return {tipo:tp,nome:Vm(EL[tp].vocs),itens:ord.map(function(x){
      return {id:x.id,nome:x.nome,on:jaLib(tp,x),daSessao:ids.indexOf(x.id)>=0}; })}; });
  var ov=overlay("Liberar para a "+V("mesa").toLowerCase(),htmlDe("t-liberar",{grupos:grupos}),{wide:true});
  $$("[data-lib]",ov).forEach(function(b){ b.onclick=function(){
    var tp=b.getAttribute("data-lib"), x=elDe(tp,b.getAttribute("data-id")); if(!x)return;
    var on=alternaLib(tp,x); b.classList.toggle("on",on); $(".libck",b).textContent=on?"✓":""; }; });
  var fechar=ov.close; ov.close=function(){ fechar(); render(); };
}
/* notas privadas */
function ligarRefEditar(){ var b=document.getElementById("refEd");
  if(b)b.onclick=function(){ abrirReferencia(); }; }
/* a caixa de anotacoes cresce pelo canto e lembra o tamanho neste aparelho */
function ligaTamNota(t){
  try{ var g=JSON.parse(localStorage.getItem("grim_notas_tam")||"null");
    if(g&&g.w&&g.h){ t.style.width=g.w+"px"; t.style.height=g.h+"px"; } }catch(e){}
  if(window.ResizeObserver){ var ro=new ResizeObserver(function(){
    if(!document.body.contains(t)){ ro.disconnect(); return; }
    if(!t.offsetWidth||!t.style.width&&!t.style.height&&!t.dataset.mexeu)return;
    try{ localStorage.setItem("grim_notas_tam",JSON.stringify({w:t.offsetWidth,h:t.offsetHeight})); }catch(e){} });
    ro.observe(t); }
  /* so grava depois que a pessoa puxa o canto: sem isso a caixa padrao viraria "tamanho escolhido" */
  t.addEventListener("pointerdown",function(){ t.dataset.mexeu="1"; });
  var r=$("#mNotaTam"); if(r)r.onclick=function(){ t.style.width=t.style.height=""; delete t.dataset.mexeu;
    try{ localStorage.removeItem("grim_notas_tam"); }catch(e){} };
}
function carregarNotas(){ var t=$("#mNotas"), st=$("#mNotaSt"), b=$("#mNotaSave"); if(!t)return;
  ligaTamNota(t);
  try{ t.value=localStorage.getItem(("grim_notas_"+CID+"_"+MYID))||""; }catch(e){}
  api(cAPI("/notas")).then(function(r){ if(r&&typeof r.texto==="string")t.value=r.texto;
    if(st)st.textContent="na sua conta"; })
   .catch(function(){ if(st)st.textContent="guardado só neste navegador"; });
  if(b)b.onclick=function(){
    try{localStorage.setItem(("grim_notas_"+CID+"_"+MYID),t.value);}catch(e){}
    if(st)st.textContent="salvando…";
    api(cAPI("/notas"),{method:"PUT",body:{texto:t.value}})
      .then(function(){ if(st)st.textContent="salvo"; })
      .catch(function(){ if(st)st.textContent="não consegui salvar na conta, ficou no navegador"; }); };
}
/* mural compartilhado */
var MURAL=[];
function quando(t){ if(!t)return ""; var d=new Date(t);
  return d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})+" "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}); }
function pintarMural(){ var box=$("#mural"); if(!box)return;
  box.innerHTML=htmlDe("t-mural-posts",{posts:MURAL.map(function(p){
    return {id:p.id,autor:p.autor||"Alguém",quando:quando(p.em),meu:(String(p.usuarioId)===MYID)||GM,linhas:linhasDe(p.texto)}; })});
  $$("[data-mdel]",box).forEach(function(b){ b.onclick=function(){
    api(cAPI("/mural/"+encodeURIComponent(b.getAttribute("data-mdel"))),{method:"DELETE"})
      .then(carregarMural).catch(function(){toast("Não consegui apagar");}); }; });
}
function carregarMural(){ var box=$("#mural"); if(!box)return;
  var go=$("#mPostGo"), ta=$("#mPost");
  if(go)go.onclick=function(){ var t=(ta.value||"").trim(); if(!t)return;
    go.disabled=true;
    api(cAPI("/mural"),{method:"POST",body:{texto:t.slice(0,2000)}})
      .then(function(){ ta.value=""; go.disabled=false; carregarMural(); })
      .catch(function(e){ go.disabled=false; toast((e&&e.message)||"Não consegui postar"); }); };
  api(cAPI("/mural")).then(function(r){ MURAL=Array.isArray(r)?r:[]; pintarMural(); })
   .catch(function(){ box.innerHTML=vazio("Não consegui ler o mural."); });
}

function marcarFeito(s,c){
  $$('[data-act="ck"][data-c="'+c.id+'"]').forEach(function(b){ b.setAttribute("aria-pressed",!!c.feito); });
  var card=$('.card[data-scn="'+c.id+'"]'); if(card)card.classList.toggle("done",!!c.feito);
  var det=document.getElementById("scn-"+c.id); if(det)det.classList.toggle("done",!!c.feito);
  var tot=s.cenas.length, fei=s.cenas.filter(function(x){return x.feito;}).length;
  var pr=$(".prog"); if(pr){ var sp=pr.querySelector("span"); if(sp)sp.textContent=fei+"/"+tot+" cenas";
    var bar=pr.querySelector(".bar i"); if(bar)bar.style.width=(tot?Math.round(fei/tot*100):0)+"%"; }
}
