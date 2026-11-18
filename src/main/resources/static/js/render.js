/* Desenho das telas e das abas. */
"use strict";

/* ---------- ABAS ----------
   O mestre tem as cinco abas da campanha. O jogador nao tem uma aba "Mesa" com subabas por
   dentro: as secoes da mesa sao as abas dele. No celular elas viram a barra de baixo. */
/* rotulo da barra de baixo: uma palavra, para caber 5 abas em 320px */
var ROT_CURTO={notas:"Anotações",regras:"Consulta",quem:"Quem é quem"};
function itensDasAbas(){
  if(!CID||S.view==="semcampanha"||S.view==="escolher")return [];
  var mapa={id:"mapa",ico:"mapa",rot:Vm("mapa"),atual:S.view==="mapa",msec:null};
  if(!GM)return MSECS().map(function(m){
    return {id:"mesa",msec:m[0],ico:m[0],rot:ROT_CURTO[m[0]]||m[1],atual:S.view==="mesa"&&S.msec===m[0]}; }).concat([mapa]);
  return [
    {id:"home",ico:"home",rot:Vm("campanha"),atual:S.view==="home",msec:null},
    {id:"sessoes",ico:"sessoes",rot:Vm("sessoes"),atual:S.view==="sessoes"||S.view==="sessao",msec:null},
    {id:"elenco",ico:"elenco",rot:"Elenco",atual:S.view==="elenco",msec:null},
    {id:"biblioteca",ico:"biblioteca",rot:"Biblioteca",atual:S.view==="biblioteca",msec:null},
    {id:"mesa",ico:"mesa",rot:Vm("mesa"),atual:S.view==="mesa",msec:null},mapa];
}
function irParaAba(b){
  S.view=b.dataset.aba;
  if(b.dataset.msec){ S.msec=b.dataset.msec; }
  render();
}
/* Barra de baixo com mais de 5 destinos (a mesa do jogador): 4 abas e "Mais" com o resto. A aba
   atual entra sempre entre as visiveis. No topo (tela larga) todas aparecem e o "Mais" some. */
function abrirMaisAbas(b,itens){
  var resto=itens.filter(function(x){ return x.sobra; });
  menuSolto(b,htmlDe("t-menu",{titulo:"Mais seções",itens:resto.map(function(x){ return {v:x.msec||x.id,rot:x.rot,dica:"",perigo:false,desligado:false}; })}),
    function(it){ var x=resto.find(function(r){ return (r.msec||r.id)===it.dataset.v; });
      S.view=x?x.id:"mesa"; if(x?.msec)S.msec=x.msec; render(); },{alinha:"direita"});
}
/* O mestre tem seis abas: no celular as cinco de sempre ficam na barra e o Mapa vai para o menu
   Mais do topo (abrirMais), sem a aba "Mais", que tiraria a Mesa da barra de baixo. */
function renderTabs(){
  var t=$("#tabs"), itens=itensDasAbas(), comMais=itens.length>5&&!GM;
  if(GM)itens.forEach(function(x){ x.sobra=x.id==="mapa"; });
  else if(comMais){
    var atual=itens.findIndex(function(x){ return x.atual; }), vis=[0,1,2,3];
    if(atual>3)vis[3]=atual;
    itens.forEach(function(x,i){ x.sobra=vis.indexOf(i)<0; });
  }
  t.innerHTML=itens.map(function(x){ return htmlDe("t-aba",x); }).join("")+
    (comMais?htmlDe("t-aba",{id:"mais",ico:"mais",rot:"Mais",atual:false,msec:null}):"");
  $$(".tab",t).forEach(function(b,i){ if(itens[i]?.sobra)b.classList.add("sobra"); });
  var bm=$('[data-aba="mais"]',t);
  if(bm){ bm.classList.add("tabmais"); bm.setAttribute("aria-haspopup","menu"); bm.setAttribute("aria-expanded","false");
    bm.onclick=function(e){ e.stopPropagation(); abrirMaisAbas(bm,itens); }; }
  document.body.classList.toggle("comabas",itens.length>0);
  $$(".tab:not(.tabmais)",t).forEach(function(b){ b.onclick=function(){ irParaAba(b); }; });
  var a=$('.tab[aria-current="page"]',t);
  if(a&&t.scrollWidth>t.clientWidth)a.scrollIntoView({block:"nearest",inline:"center"});
}

/* ---------- RENDER ----------
   Redesenhar a mesma tela nao pode jogar a rolagem para o topo (era isso que fazia cada
   "adicionar" levar a pessoa ao comeco da pagina), nem o foco do teclado: quem estava num botao
   continua nele, achado pelo id ou pelos data-* (seletorEstavel). Tela nova leva o foco ao
   titulo, e o titulo da aba do navegador diz onde a pessoa esta. */
var ULT="",ULTV="",ULTFOCO=false;
/* guia que nao chegou (ou chegou num formato antigo) mostra o aviso em toda tela que depende
   dele, e nao uma tela vazia que convida a editar */
var TELAS_DO_GUIA={home:1,sessoes:1,sessao:1,elenco:1};
var TELAS={
  vazio:{v:function(){ return viewVazio(); },h:function(){ hydrateVazio(); }},
  semcampanha:{v:function(){ return viewSemCampanha(); },h:function(v){ hydrateCampanhas(v); }},
  escolher:{v:function(){ return viewEscolher(); },h:function(v){ hydrateCampanhas(v); }},
  ajustes:{v:function(){ return viewAjustes(); },h:function(v){ hydrateAjustes(v); }},
  mesa:{v:function(){ return viewMesa(); },h:function(){ hydrateMesa(); }},
  home:{v:function(){ return viewHome(); },h:function(v){ hydrateHome(v); }},
  sessoes:{v:function(){ return viewSessoes(); },h:function(v){ ligarSessoes(v); }},
  elenco:{v:function(){ return viewElenco(); },h:function(v){ hydrateElenco(v); }},
  biblioteca:{v:function(){ return viewBiblioteca(); },h:function(v){ hydrateBiblioteca(v); }},
  sessao:{v:function(){ return viewSessao(); },h:function(v){ hydrateSessao(v); }},
  mapa:{v:function(){ return viewMapa(); },h:function(v){ hydrateMapa(v); }}
};
function telaAtual(){
  if(GM&&CID&&BOOTERR&&TELAS_DO_GUIA[S.view])return TELAS.vazio;
  return TELAS[S.view]||TELAS.sessao;
}
function chaveDaTela(){
  return [S.view,S.view==="sessao"?S.sessao+S.vmode:"",S.view==="elenco"?S.el:"",S.view==="biblioteca"?S.bib:"",
    S.view==="ajustes"?S.aj:"",S.view==="mesa"?S.msec:"",S.view==="mapa"?MP.id:"",CID].join("|");
}
function marcaCorpo(v,board){
  document.body.classList.toggle("board",board);
  v.classList.toggle("board",board);
  document.body.classList.toggle("jogador",!GM&&!!CID);
  document.body.classList.toggle("fora",!CID);
  if(!CID&&rpAberto()){ $("#rolPainel").hidden=true; clearInterval(RP.iv); }
  if(S.view!=="sessao")document.body.classList.remove("painel-aberto");
  document.documentElement.style.setProperty("--hh",($(".top").offsetHeight||56)+"px");
  var ba=$("#btnAjustes");
  if(ba){ ba.classList.toggle("on",S.view==="ajustes"); ba.setAttribute("aria-pressed",S.view==="ajustes"?"true":"false"); }
}
function desenhaTela(v,tela){
  try{ v.innerHTML=tela.v(); }
  catch(error_){
    console.error("tela "+S.view+" falhou:",error_);
    v.innerHTML=htmlDe("t-aba-falhou",{mensagem:String(error_?.message||error_)});
    return false;
  }
  return true;
}
function ligaTela(v,tela){
  try{ tela.h(v); }
  catch(error_){
    console.error("controles de "+S.view+" falharam:",error_);
    toast("Alguns botões desta tela não responderam. Recarregue a página.","erro");
  }
}
function hydrateSessao(v){
  var eb=$("#encBtn",v); if(eb)eb.onclick=function(){ encerrarSessao(); };
  var lb=$("#libBtn",v); if(lb)lb.onclick=function(){ abrirLiberar(); };
  var se=$("#sesEd",v); if(se)se.onclick=function(){ editarSessao(curSess()); };
  var sv=$("#sesVolta",v); if(sv)sv.onclick=function(){ S.view="sessoes"; render(); };
  $$("[data-vm]",v).forEach(function(b){ b.onclick=function(){ S.vmode=b.dataset.vm; S.vmodeEscolhido=true; render(); }; });
  hydrateCena(v); iniLigar(v,curSess());
  ligarBarraSessaoMovel(v);
  /* cena e caixa do painel lembram se estavam abertas: editar um bloco redesenha a
     tela, e sem isso a cena em que a pessoa estava fechava na cara dela */
  $$("details.scn",v).forEach(function(d){ d.addEventListener("toggle",function(){ lembraCena(v,d); }); });
  $$(".railfloat details.rbox, aside.rail details.rbox",v).forEach(function(d){
    d.addEventListener("toggle",function(){ lembraCaixa(d); }); });
  if(document.body.classList.contains("board"))initCanvas(curSess());
}
/* Barra de jogo do celular: cada botao aciona o controle de verdade da sessao (o mesmo id que o
   teste e o tour usam); o painel abre como gaveta e fecha com Esc ou no proprio botao. */
function ligarBarraSessaoMovel(v){
  var barra=$(".sessbarra",v); if(!barra)return;
  var bp=$('[data-sb="painel"]',barra), rail=$("#railSessao",v);
  function painel(abre){ document.body.classList.toggle("painel-aberto",abre); bp.setAttribute("aria-expanded",String(abre));
    if(abre){ var f=focaveis(rail)[0]; if(f)f.focus(); } }
  painel(false);
  bp.onclick=function(){ painel(!document.body.classList.contains("painel-aberto")); };
  rail.addEventListener("keydown",function(e){ if(e.key==="Escape"&&document.body.classList.contains("painel-aberto")){ e.stopPropagation(); painel(false); bp.focus(); } });
  $('[data-sb="ini"]',barra).onclick=function(){ var b=$("#iniBtn",v); if(b)b.click(); };
  $('[data-sb="lib"]',barra).onclick=function(){ abrirLiberar(); };
  var bm=$('[data-sb="mais"]',barra);
  bm.onclick=function(){ menuSolto(bm,htmlDe("t-menu",{titulo:"Mais ações da sessão",itens:[
      {v:"ed",rot:"Editar a "+vmin("sessao"),dica:"",perigo:false,desligado:false},
      {v:"quadro",rot:"Ver no "+vmin("quadro"),dica:"",perigo:false,desligado:false},
      {v:"enc",rot:"Encerrar a "+vmin("sessao"),dica:"",perigo:true,desligado:false}]}),
    function(it){ var k=it.dataset.v;
      if(k==="ed")editarSessao(curSess());
      else if(k==="quadro"){ S.vmode="canvas"; S.vmodeEscolhido=true; render(); }
      else encerrarSessao(); }); };
}
function lembraCena(v,d){
  var id=d.id.replace(/^scn-/,"");
  if(!d.open){ if(S.aberta===id){ S.aberta=null; } return; }
  S.aberta=id;
  $$("details.scn",v).forEach(function(o){ if(o!==d&&o.open){ o.open=false; } });
}
function lembraCaixa(d){
  var k=d.dataset.rb;
  if(!d.open){ if((S.rbox||"obrig")===k){ S.rbox="-"; } return; }
  S.rbox=k;
  $$("details.rbox",d.parentNode).forEach(function(o){ if(o!==d&&o.open){ o.open=false; } });
}
/* foco: no redesenho volta ao mesmo controle; em tela nova vai ao titulo, mas so quando a
   pessoa trocou de tela (nao na primeira carga) e nenhuma janela esta aberta por cima */
function devolveFoco(v,mesma,focoSel){
  if(CAMADAS.length||TOUR)return;
  if(focoSel){ var f=null; try{ f=v.querySelector(focoSel); }catch(error_){ f=null; /* seletor que nao serve mais: fica onde esta */ }
    if(f){ f.focus({preventScroll:true}); } return; }
  if(mesma||!PRONTO||!ULTFOCO)return;
  var h=$("h1",v); if(!h)return;
  h.setAttribute("tabindex","-1"); h.focus({preventScroll:true});
}
function render(){
  /* a previa de tema da Aparencia so vale enquanto a pessoa esta la */
  if(TEMA_PREVIA&&S.view!=="ajustes"){ TEMA_PREVIA=null; aplicarTema(temaAtivo()); }
  if(CID&&!GM&&!TELAS_DO_JOGADOR[S.view])S.view="mesa";
  /* o tempo real do mapa so fica ligado com o mapa na tela */
  if(S.view!=="mapa"||!CID)mpDesliga();
  if(S.view==="sessao"&&!curSess())S.view="sessoes";
  /* no celular o quadro nao cabe: a sessao abre no roteiro, a nao ser que a pessoa escolha */
  if(S.view==="sessao"&&!S.vmodeEscolhido&&window.innerWidth<860)S.vmode="roteiro";
  renderTabs();
  var v=$("#view"), board=(GM&&S.view==="sessao"&&S.vmode==="canvas"&&!BOOTERR)||(S.view==="mapa"&&!!CID&&!mapaBloqueado());
  marcaCorpo(v,board);
  pintarMarca();
  var chave=chaveDaTela(), y=window.scrollY||0, mesma=(chave===ULT); ULT=chave;
  var ativo=document.activeElement, focoSel=(mesma&&ativo&&v.contains(ativo))?seletorEstavel(ativo):null;
  document.body.classList.toggle("trocaaba",ULTV!==S.view); ULTV=S.view;
  var tela=telaAtual(), ok=desenhaTela(v,tela);
  /* a entrada so toca quando a tela muda; no redesenho da mesma tela a classe sai, senao
     cada "adicionar" faria a pagina inteira surgir de novo */
  v.classList.remove("entra");
  if(!mesma){ v.getBoundingClientRect(); v.classList.add("entra"); }
  if(ok)ligaTela(v,tela);
  if(!board)window.scrollTo(0,mesma?y:0);
  document.title=tituloDaTela();
  devolveFoco(v,mesma,focoSel);
  if(PRONTO)ULTFOCO=true;
  sincronizaRota(!mesma);
}
