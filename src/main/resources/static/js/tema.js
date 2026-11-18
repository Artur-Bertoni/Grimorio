/* Temas, estilos e o que o tema muda na pagina. */
"use strict";

/* ---------- TEMAS ----------
   O tema e a paleta. O estilo dele decide o resto: letra dos titulos, forma dos blocos,
   ornamento e clima de fundo (folha "PELE" no CSS, por html[data-estilo]). */
var CORPO='"Spectral", Georgia, "Times New Roman", serif';
var ESTILOS={
 fantasia:{nome:"Fantasia",disp:'"Almendra", "Cinzel", Georgia, serif'},
 terror:{nome:"Terror",disp:'"Cinzel", Georgia, serif'},
 misterio:{nome:"Mistério",disp:'"Cormorant Garamond", "Spectral", Georgia, serif'},
 investigacao:{nome:"Investigação",disp:'"Special Elite", "Courier New", monospace'},
 ficcao:{nome:"Ficção científica",disp:'"Oxanium", "Barlow Condensed", sans-serif',
   body:'"Segoe UI", system-ui, -apple-system, Roboto, sans-serif'}
};
var TEMAS={
 sangue:{nome:"Sangue",estilo:"terror",esquema:"dark",v:{
  "bg":"#0a0708","bg2":"#130d0f","bg3":"#1c1416","bg4":"#241a1d","line":"#322328",
  "line2":"#48313a","fg":"#ece4d9","fg2":"#b7a9a2","fg3":"#8f817d","blood":"#b3122a",
  "blood2":"#e5455a","blood-dim":"#5e0f1c","gold":"#c9a227","gold2":"#e8c45a","sobre-gold":"#140e02",
  "ok":"#7ba36f","warn":"#d08a2c","sobre-blood":"#ffffff","campo-borda":"#736063"}},
 abismo:{nome:"Abismo",estilo:"terror",esquema:"dark",v:{
  "bg":"#060a0d","bg2":"#0d141a","bg3":"#141e26","bg4":"#1b2832","line":"#223039",
  "line2":"#334a59","fg":"#e2ebf1","fg2":"#a6b8c4","fg3":"#7d909d","blood":"#1f6f8b",
  "blood2":"#3fa5c6","blood-dim":"#113f52","gold":"#c9a227","gold2":"#e8c45a","sobre-gold":"#071216",
  "ok":"#5fae92","warn":"#d08a2c","sobre-blood":"#ffffff","campo-borda":"#5a6d7a"}},
 floresta:{nome:"Floresta",estilo:"fantasia",esquema:"dark",v:{
  "bg":"#070a08","bg2":"#0f150f","bg3":"#172017","bg4":"#1f2b1f","line":"#243325",
  "line2":"#364b37","fg":"#e6ece1","fg2":"#aebaa6","fg3":"#85927e","blood":"#2f6b45",
  "blood2":"#55a271","blood-dim":"#1a3d27","gold":"#c0a13a","gold2":"#ddc268","sobre-gold":"#0b1409",
  "ok":"#7ba36f","warn":"#cf9032","sobre-blood":"#ffffff","campo-borda":"#5d6e5c"}},
 cinza:{nome:"Aço",estilo:"ficcao",esquema:"dark",v:{
  "bg":"#0c0e10","bg2":"#14171a","bg3":"#1c2126","bg4":"#252b31","line":"#2b3238",
  "line2":"#3e4852","fg":"#e8ecef","fg2":"#adb6bd","fg3":"#8b939c","blood":"#3a6ea5",
  "blood2":"#5e95cd","blood-dim":"#1f3f61","gold":"#b9c0c7","gold2":"#dde3e8","sobre-gold":"#0c0e10",
  "ok":"#5fa97f","warn":"#d49a3c","sobre-blood":"#ffffff","campo-borda":"#636c75"}},
 neon:{nome:"Neon",estilo:"ficcao",esquema:"dark",v:{
  "bg":"#07060e","bg2":"#0e0b19","bg3":"#161124","bg4":"#1e1830","line":"#271f3d",
  "line2":"#3b2f5c","fg":"#eae6fb","fg2":"#b3a9d2","fg3":"#877ea7","blood":"#b4249b",
  "blood2":"#ef4fd2","blood-dim":"#5e1151","gold":"#27cdbf","gold2":"#5ff0e2","sobre-gold":"#06121a",
  "ok":"#44d18a","warn":"#e0a53a","sobre-blood":"#ffffff","campo-borda":"#695f85"}},
 pergaminho:{nome:"Pergaminho",estilo:"fantasia",esquema:"light",v:{
  "bg":"#f2e8d6","bg2":"#eaddc6","bg3":"#e0d0b4","bg4":"#d5c2a1","line":"#cbb795",
  "line2":"#b09c78","fg":"#2a2218","fg2":"#4e4234","fg3":"#5b5040","blood":"#8c2f1f",
  "blood2":"#9c3b2c","blood-dim":"#d9b9ab","gold":"#664e12","gold2":"#6d5412","sobre-gold":"#f6efe0",
  "ok":"#3b6237","warn":"#7c5110","sobre-blood":"#ffffff","campo-borda":"#827357"}},
 taverna:{nome:"Taverna",estilo:"fantasia",esquema:"dark",v:{
  "bg":"#0f0a06","bg2":"#1a120b","bg3":"#241a10","bg4":"#2f2216","line":"#3a2a1a",
  "line2":"#54402a","fg":"#f0e4cf","fg2":"#c2b196","fg3":"#9a8a72","blood":"#a8521c",
  "blood2":"#d9772f","blood-dim":"#54290e","gold":"#d4a83a","gold2":"#f0cb6a","sobre-gold":"#1a1004",
  "ok":"#86a35f","warn":"#d08a2c","sobre-blood":"#ffffff","campo-borda":"#76644e"}},
 veu:{nome:"Véu",estilo:"misterio",esquema:"dark",v:{
  "bg":"#0b0812","bg2":"#130e1d","bg3":"#1b1429","bg4":"#241b36","line":"#2d2242",
  "line2":"#44345f","fg":"#ebe4f5","fg2":"#b5a8cc","fg3":"#8d82a5","blood":"#6d3fb3",
  "blood2":"#9f74e6","blood-dim":"#36205c","gold":"#c9b06a","gold2":"#e6d397","sobre-gold":"#120c1c",
  "ok":"#6fae96","warn":"#d39a45","sobre-blood":"#ffffff","campo-borda":"#6c5e83"}},
 luar:{nome:"Luar",estilo:"misterio",esquema:"dark",v:{
  "bg":"#070a12","bg2":"#0d1220","bg3":"#141b2d","bg4":"#1c253b","line":"#232e47",
  "line2":"#364564","fg":"#e4eaf6","fg2":"#a9b5cf","fg3":"#828ea8","blood":"#3f5fae",
  "blood2":"#7393e0","blood-dim":"#1e2f5c","gold":"#c3cde0","gold2":"#e8eef8","sobre-gold":"#0a0f1a",
  "ok":"#62ab8d","warn":"#d1a04a","sobre-blood":"#ffffff","campo-borda":"#5c6984"}},
 noir:{nome:"Noir",estilo:"investigacao",esquema:"dark",segue:true,v:{
  "bg":"#0b0b0a","bg2":"#141412","bg3":"#1d1c19","bg4":"#272521","line":"#302e29",
  "line2":"#4a463e","fg":"#e9e4d8","fg2":"#b3ad9e","fg3":"#918c7f","blood":"#a3261f",
  "blood2":"#da5a50","blood-dim":"#4f1512","gold":"#d9a441","gold2":"#f1c56c","sobre-gold":"#151003",
  "ok":"#7d9f6c","warn":"#d08a2c","sobre-blood":"#ffffff","campo-borda":"#6d6960"}},
 dossie:{nome:"Dossiê",estilo:"investigacao",esquema:"light",v:{
  "bg":"#e9dfc6","bg2":"#f1e9d4","bg3":"#e0d4b6","bg4":"#d3c5a3","line":"#c7b892",
  "line2":"#a89871","fg":"#23201a","fg2":"#4a4436","fg3":"#595243","blood":"#a32218",
  "blood2":"#a82f23","blood-dim":"#e0bdb0","gold":"#2f4a6b","gold2":"#1f3550","sobre-gold":"#f3ecd9",
  "ok":"#3b6537","warn":"#7f5311","sobre-blood":"#ffffff","campo-borda":"#837659"}}
};
/* O tema que veste a tela:
   - fora de uma campanha, o da pessoa (grim_tema);
   - dentro, o que ela definiu para aquela campanha (grim_tema_c{id}); senao o que o mestre
     sugeriu, se ela segue o tema das mesas (grim_segue, ligado de saida); senao o dela.
   A previa da tela de Aparencia (TEMA_PREVIA) so pinta: nao grava nada e some ao sair de la. */
var TEMA_PREVIA=null;
function temaPessoal(){ var p="";
  try{ p=localStorage.getItem("grim_tema")||""; }catch(error_){ /* sem armazenamento no navegador: fica sem tema pessoal */ }
  return TEMAS[p]?p:""; }
function temaAtivo(){
  var p=temaPessoal();
  if(!CID)return p||"sangue";
  var c=temaEscolhido(); if(c)return c;
  var m=temaMesa();
  if(m&&segueMesa())return m;
  return p||m||"sangue"; }
/* repinta com o tema em vigor, a nao ser que a pessoa esteja experimentando um na Aparencia */
function reaplicaTema(){ if(!TEMA_PREVIA)aplicarTema(temaAtivo()); }
/* tema com segue:true ilumina o bloco onde o mouse esta: o CSS le --mx e --my */
var SEGUE=false, SEGRAF=0, FX_ON=true;
document.addEventListener("pointermove",function(e){
  if(!SEGUE||SEGRAF||!FX_ON)return;
  var x=e.clientX, y=e.clientY, t=e.target;
  SEGRAF=requestAnimationFrame(function(){ SEGRAF=0;
    var b=t?.closest?.(".ccard,.cad,.pc,.sec-wrap,.caixa,.blk,.card,.evcard,.qcard,.post,.resitem");
    if(!b)return;
    var r=b.getBoundingClientRect(), k=(b.offsetWidth&&r.width)?r.width/b.offsetWidth:1;
    b.style.setProperty("--mx",((x-r.left)/k)+"px"); b.style.setProperty("--my",((y-r.top)/k)+"px"); });
},{passive:true});
function d20Svg(cls){ return htmlDe("t-d20",{cls:cls||""}); }

function fxLigado(){
  try{ if(localStorage.getItem("grim_fx")==="0")return false; }
  catch(error_){ console.warn(error_); /* sem armazenamento vale o que o sistema pede */ }
  return !window.matchMedia?.("(prefers-reduced-motion:reduce)").matches;
}
function aplicarFx(){
  var d=false; FX_ON=fxLigado();
  try{ d=localStorage.getItem("grim_fx")==="0"; }catch(error_){ console.warn(error_); }
  document.documentElement.dataset.fx=d?"off":"on"; }
function aplicarTema(id){
  var t=TEMAS[id]||TEMAS.sangue, e=ESTILOS[t.estilo]||ESTILOS.terror, r=document.documentElement, pele={}, k;
  for(k in t.v) pele[k]=t.v[k];
  pele.disp=e.disp; pele.body=e.body||CORPO;
  for(k in pele) r.style.setProperty("--"+k,pele[k]);
  atualizaFavicon(pele);
  r.style.setProperty("color-scheme",t.esquema);
  r.dataset.tema=TEMAS[id]?id:"sangue";
  r.dataset.estilo=t.estilo; r.dataset.esquema=t.esquema;
  SEGUE=!!t.segue;
  var mt=document.querySelector('meta[name="color-scheme"]'); if(mt)mt.setAttribute("content",t.esquema);
  var tc=document.querySelector('meta[name="theme-color"]'); if(tc)tc.setAttribute("content",pele.bg2);
  /* A tela de login nao conhece os temas: ela veste a pele guardada aqui. So o que vale fora de
     uma campanha entra (o tema da pessoa), para o login nao abrir no clima da ultima mesa. */
  if(CID)return;
  try{ localStorage.setItem("grim_pele",JSON.stringify({v:pele,estilo:t.estilo,esquema:t.esquema})); }
  catch(error_){ console.warn(error_); /* login sem a pele: abre no tema padrao */ }
}
/* troca pedida pela pessoa: a tela inteira se dissolve de um tema no outro */
function trocarTema(id){
  if(document.startViewTransition&&fxLigado())document.startViewTransition(function(){ aplicarTema(id); });
  else aplicarTema(id);
}

/* O fundo animado (luz, particulas) para quando a aba esta escondida e depois de 20s sem
   ninguem mexer: animacao infinita que ninguem esta vendo so gasta bateria e GPU. Volta no
   primeiro movimento. */
var QUIETO_T=null;
function acordaFundo(){
  document.documentElement.classList.remove("quieto");
  clearTimeout(QUIETO_T);
  QUIETO_T=setTimeout(function(){ document.documentElement.classList.add("quieto"); },20000);
}
["pointermove","keydown","scroll","touchstart"].forEach(function(ev){
  window.addEventListener(ev,acordaFundo,{passive:true,capture:true}); });
document.addEventListener("visibilitychange",function(){
  if(document.hidden){ document.documentElement.classList.add("quieto"); } else { acordaFundo(); } });
acordaFundo();
