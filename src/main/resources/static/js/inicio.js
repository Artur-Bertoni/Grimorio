/* Liga os botoes fixos e da a partida do app. */
"use strict";

/* ---------- BOOT ---------- */
/* erro solto vira um aviso legivel; o detalhe tecnico fica no console */
window.addEventListener("error",function(e){
  if(!e?.message)return;
  console.error(e.error||e.message);
  toast("Algo falhou nesta tela. Se continuar, recarregue a página.","erro");
});
window.addEventListener("unhandledrejection",function(e){
  console.error(e?.reason);
  toast(mensagemDeErro(e?.reason),"erro");
});
$("#btnBusca").onclick=function(){ abrirBusca(); };
$("#btnTrilha").onclick=function(){ abrirTrilha(); };
$("#btnDados").onclick=function(){ abrirDados(); };
$("#btnRol").onclick=function(){ painelRolagens(); };
$("#rdSup").onclick=function(){ abrirSuporte(); };
$("#nbName").onclick=function(){ abrirTrilha(); };
$("#nbPlay").onclick=function(){
  if(!PL.cur){ return; }
  if(PL.cur.paused){ PL.cur.play(); } else { PL.cur.pause(); }
  playerUI(); };
$("#nbStop").onclick=function(){ parar(); };
$("#nbLoop").onclick=function(){ PL.loop=!PL.loop; if(PL.cur){ PL.cur.loop=PL.loop; } playerUI();
  var lp=$("#plLoop"); if(lp){ lp.setAttribute("aria-pressed",PL.loop); lp.textContent="Repetir "+(PL.loop?"ligado":"desligado"); }
  toast(PL.loop?"Repetir a faixa: ligado":"Repetir a faixa: desligado"); };
function alternaAjustes(){
  if(S.view==="ajustes"){
    S.view=S.antes||(CID?(GM?"home":"mesa"):(CAMPANHAS.length?"escolher":"semcampanha")); }
  else { S.antes=S.view; S.view="ajustes"; }
  render();
}
$("#btnAjustes").onclick=alternaAjustes;

/* Menu "Mais" do celular: as acoes que nao cabem no topo. Cada item aciona o botao de verdade,
   que continua existindo (escondido) para o tour e os atalhos. */
var ICO_MAIS={abaMapa:'#tabs [data-aba="mapa"] svg',btnTrilha:"#btnTrilha svg",btnDados:"#btnDados svg",btnRol:"#btnRol svg",btnAjustes:"#btnAjustes svg"};
function abrirMais(){
  var b=$("#btnMais"), itens=[];
  /* o Mapa do mestre nao cabe na barra de baixo (renderTabs): no celular ele mora aqui */
  if(GM&&CID)itens.push({id:"abaMapa",rot:Vm("mapa")});
  if(GM&&CID)itens.push({id:"btnTrilha",rot:"Trilha sonora"});
  if(CID){ itens.push({id:"btnDados",rot:"Rolar dados"},{id:"btnRol",rot:"Painel de rolagens",estado:rpAberto()?"aberto":""}); }
  itens.push({id:"btnAjustes",rot:"Configurações"});
  itens.forEach(function(x){ var s=$(ICO_MAIS[x.id]); x.ico=s?s.outerHTML:""; });
  menuSolto(b,htmlDe("t-menu-mais",{itens:itens}),function(it){
    if(it.dataset.mais==="abaMapa"){ S.view="mapa"; render(); return; }
    $("#"+it.dataset.mais).click(); });
}
$("#btnMais").onclick=abrirMais;

/* pular para o conteudo: o href="#view" mudaria o endereco (as rotas moram no hash) */
$("#pular").onclick=function(e){ e.preventDefault(); var v=$("#view"), h=$("h1",v);
  if(h){ h.setAttribute("tabindex","-1"); h.focus(); } else v.focus(); };

/* Atalhos (js/camadas.js decide quando valem). Ctrl+F fica com o navegador: sequestrar a busca
   da pagina surpreendia. A busca do app abre com "/" fora de campo de texto, ou Ctrl+K. */
atalho({tecla:"k",ctrl:true,quando:function(){ return !!CID; },faz:function(){ abrirBusca(); }});
atalho({tecla:"/",quando:function(){ return !!CID; },faz:function(){ abrirBusca(); }});

var bh=document.getElementById("brandHome");
if(bh)bh.onclick=function(){ if(PRONTO||CID)trocarCampanha(); };
function medeTopo(){ document.documentElement.style.setProperty("--hh",($(".top").offsetHeight||56)+"px"); }
window.addEventListener("resize",medeTopo);
/* os templates de paginas/ e componentes/ precisam estar no lugar antes da primeira tela.
   Script classico (sem modulo): nao ha await no topo, por isso a corrente de promessa */
carregarTemplates().then(boot).catch(function(e){ // NOSONAR: script classico nao tem await de topo
  document.getElementById("view").textContent="Não consegui carregar a interface: "+mensagemDeErro(e)+" Recarregue a página."; });
