/* Desenho das telas e das abas. */
"use strict";

/* ---------- RENDER ---------- */
function renderTabs(){
  var t=$("#tabs"); t.innerHTML="";
  function tab(id,label,cur){ var b=el("button",{"class":"tab",text:label});
    b.setAttribute("aria-current",cur?"true":"false");
    b.onclick=function(){ S.view=id; render(); };
    t.appendChild(b); }
  if(!CID||S.view==="semcampanha"||S.view==="escolher")return;
  if(!GM){ tab("mesa",Vm("mesa"),S.view==="mesa"); return; }
  tab("home",Vm("campanha"),S.view==="home");
  tab("sessoes",Vm("sessoes"),S.view==="sessoes"||S.view==="sessao");
  tab("elenco","Elenco",S.view==="elenco");
  tab("biblioteca","Biblioteca",S.view==="biblioteca");
  tab("mesa",Vm("mesa"),S.view==="mesa");
}
/* Redesenhar a mesma tela nao pode jogar a rolagem para o topo: era isso que fazia
   cada "adicionar" levar a pessoa de volta ao comeco da pagina. */
var ULT="",ULTV="";
function render(){
  if(CID&&!GM&&S.view!=="ajustes")S.view="mesa";
  if(S.view==="sessao"&&!curSess())S.view="sessoes";
  renderTabs();
  var v=$("#view"), board=(GM&&S.view==="sessao"&&S.vmode==="canvas");
  document.body.classList.toggle("board",board);
  v.classList.toggle("board",board);
  document.body.classList.toggle("jogador",!GM&&!!CID);
  document.body.classList.toggle("fora",!CID);
  if(!CID&&rpAberto()){ var rpp=$("#rolPainel"); rpp.hidden=true; clearInterval(RP.iv); }
  document.documentElement.style.setProperty("--hh",($(".top").offsetHeight||56)+"px");
  pintarMarca();
  var chave=[S.view,S.view==="sessao"?S.sessao+S.vmode:"",S.view==="elenco"?S.el:"",S.view==="biblioteca"?S.bib:"",
    S.view==="ajustes"?S.aj:"",S.view==="mesa"?S.msec:"",CID].join("|");
  var y=window.scrollY||0, mesma=(chave===ULT); ULT=chave;
  document.body.classList.toggle("trocaaba",ULTV!==S.view); ULTV=S.view;
  try{
    if(S.view==="semcampanha")v.innerHTML=viewSemCampanha();
    else if(S.view==="escolher")v.innerHTML=viewEscolher();
    else if(S.view==="ajustes")v.innerHTML=viewAjustes();
    else if(S.view==="mesa")v.innerHTML=viewMesa();
    else if(S.view==="home")v.innerHTML=viewHome();
    else if(S.view==="sessoes")v.innerHTML=viewSessoes();
    else if(S.view==="elenco")v.innerHTML=viewElenco();
    else if(S.view==="biblioteca")v.innerHTML=viewBiblioteca();
    else v.innerHTML=viewSessao();
  }catch(err){
    v.innerHTML=htmlDe("t-aba-falhou",{mensagem:String((err&&err.message)||err),
      pilha:String((err&&err.stack)||"").split("\n").slice(0,4).join(" | ")});
    try{toast("Erro ao abrir "+S.view+": "+((err&&err.message)||err));}catch(_){}
  }
  /* a entrada so toca quando a tela muda; no redesenho da mesma tela a classe sai, senao
     cada "adicionar" faria a pagina inteira surgir de novo */
  v.classList.remove("entra");
  if(!mesma){ void v.offsetWidth; v.classList.add("entra"); }
  try{
    if(S.view==="semcampanha"||S.view==="escolher")hydrateCampanhas(v);
    else if(S.view==="ajustes")hydrateAjustes(v);
    else if(S.view==="mesa")hydrateMesa();
    else if(S.view==="home")hydrateHome(v);
    else if(S.view==="sessoes")ligarSessoes(v);
    else if(S.view==="elenco")hydrateElenco(v);
    else if(S.view==="biblioteca")hydrateBiblioteca(v);
  }catch(err2){ try{toast("Erro ao ligar os controles: "+((err2&&err2.message)||err2));}catch(_){} }
  if(S.view==="sessao")try{
    var eb=$("#encBtn",v); if(eb)eb.onclick=function(){encerrarSessao();};
    var lb=$("#libBtn",v); if(lb)lb.onclick=function(){abrirLiberar();};
    var se=$("#sesEd",v); if(se)se.onclick=function(){editarSessao(curSess());};
    var sv=$("#sesVolta",v); if(sv)sv.onclick=function(){ S.view="sessoes"; render(); };
    $$("[data-vm]",v).forEach(function(b){b.onclick=function(){S.vmode=b.getAttribute("data-vm");render();};});
    hydrateCena(v); iniLigar(v,curSess());
    /* cena e caixa do painel lembram se estavam abertas: editar um bloco redesenha a
       tela, e sem isso a cena em que a pessoa estava fechava na cara dela */
    $$("details.scn",v).forEach(function(d){ d.addEventListener("toggle",function(){
      var id=d.id.replace(/^scn-/,"");
      if(!d.open){ if(S.aberta===id)S.aberta=null; return; }
      S.aberta=id;
      $$("details.scn",v).forEach(function(o){ if(o!==d&&o.open)o.open=false; }); }); });
    $$(".railfloat details.rbox, aside.rail details.rbox",v).forEach(function(d){
      d.addEventListener("toggle",function(){ var k=d.getAttribute("data-rb");
        if(!d.open){ if((S.rbox||"obrig")===k)S.rbox="-"; return; }
        S.rbox=k;
        $$("details.rbox",d.parentNode).forEach(function(o){ if(o!==d&&o.open)o.open=false; }); }); });
    if(board)initCanvas(curSess());
  }catch(err3){ try{toast("Erro na sessão: "+((err3&&err3.message)||err3));}catch(_){} }
  var ba=$("#btnAjustes"); if(ba)ba.classList.toggle("on",S.view==="ajustes");
  try{ if(!board)window.scrollTo(0,mesma?y:0); }catch(_){}
}
