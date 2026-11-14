/* Liga os botoes fixos e da a partida. */
"use strict";

/* ---------- BOOT ---------- */
window.addEventListener("error",function(e){ try{ if(e&&e.message)toast("Erro: "+e.message); }catch(_){} });
window.addEventListener("unhandledrejection",function(e){ try{ var r=e&&e.reason;
  toast("Falha: "+((r&&r.message)||r||"desconhecida")); }catch(_){} });
$("#btnBusca").onclick=function(){abrirBusca();};
$("#btnTrilha").onclick=function(){abrirTrilha();};
$("#btnDados").onclick=function(){abrirDados();};
$("#btnRol").onclick=function(){ painelRolagens(); };
$("#rdSup").onclick=function(){ abrirSuporte(); };
$("#rdAno").textContent=new Date().getFullYear();
$("#nbName").onclick=function(){abrirTrilha();};
$("#nbPlay").onclick=function(){ if(!PL.cur)return; if(PL.cur.paused)PL.cur.play(); else PL.cur.pause(); playerUI(); };
$("#nbStop").onclick=function(){ parar(); };
$("#nbLoop").onclick=function(){ PL.loop=!PL.loop; if(PL.cur)PL.cur.loop=PL.loop; playerUI();
  var lp=$("#plLoop"); if(lp){lp.setAttribute("aria-pressed",PL.loop);lp.textContent="Loop "+(PL.loop?"ligado":"desligado");}
  toast(PL.loop?"Loop ligado":"Loop desligado"); };
$("#btnAjustes").onclick=function(){
  if(S.view==="ajustes"){
    S.view=S.antes||(CID?(GM?"home":"mesa"):(CAMPANHAS.length?"escolher":"semcampanha")); }
  else { S.antes=S.view; S.view="ajustes"; }
  render(); };
/* Ctrl+F fica com o navegador: sequestrar a busca da pagina surpreendia.
   A busca do app abre com "/" (fora de campo de texto) ou Ctrl+K. */
document.addEventListener("keydown",function(e){
  /* mesmo no da captura que o tour e registrado antes dele: precisa ceder por conta propria */
  if(!CID||TOUR)return;
  if((e.ctrlKey||e.metaKey)&&(e.key==="k"||e.key==="K")){ e.preventDefault(); e.stopPropagation(); abrirBusca(); return; }
  var tag=(e.target&&e.target.tagName||"").toLowerCase();
  if(tag==="input"||tag==="textarea"||tag==="select"||(e.target&&e.target.isContentEditable))return;
  if($(".ov")||$(".proj"))return;
  if(e.key==="/"&&!e.ctrlKey&&!e.metaKey&&!e.altKey){ e.preventDefault(); abrirBusca(); }
},true);
var bh=document.getElementById("brandHome");
  if(bh){
    bh.onclick=function(){ if(PRONTO||CID)trocarCampanha(); };
    bh.onkeydown=function(e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); bh.onclick(); } };
  }
  window.addEventListener("resize",function(){
  document.documentElement.style.setProperty("--hh",($(".top").offsetHeight||56)+"px"); });
/* os templates de paginas/ e componentes/ precisam estar no lugar antes da primeira tela */
carregarTemplates().then(boot).catch(function(e){
  document.getElementById("view").textContent="Não consegui carregar a interface: "+((e&&e.message)||e)+". Recarregue a página."; });
