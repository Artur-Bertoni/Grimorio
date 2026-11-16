/* Endereco de cada tela. A tela continua morando em S (render() e quem manda); o endereco so a
   espelha, para que o Voltar do navegador volte uma tela, o F5 reabra onde a pessoa estava e
   um link leve direto a uma sessao. Hash, e nao caminho, porque o jar serve so arquivos e /api:
   nao ha rota de servidor para inventar.

   #/campanhas                    lista de campanhas
   #/configuracoes[/secao]        configuracoes fora de campanha
   #/c/{id}/campanha
   #/c/{id}/sessoes
   #/c/{id}/sessao/{idDaSessao}[/roteiro]
   #/c/{id}/elenco[/aba]
   #/c/{id}/biblioteca[/aba]
   #/c/{id}/mesa[/secao]
   #/c/{id}/configuracoes[/secao] */
"use strict";

var ROTA_PENDENTE=null, ROTA_ULT="";
var NOME_TELA={home:"campanha",sessoes:"sessoes",sessao:"sessao",elenco:"elenco",biblioteca:"biblioteca",mesa:"mesa",ajustes:"configuracoes"};
var TELA_DO_NOME={campanha:"home",sessoes:"sessoes",sessao:"sessao",elenco:"elenco",biblioteca:"biblioteca",mesa:"mesa",configuracoes:"ajustes"};
/* a parte do endereco depois da tela: qual aba, secao ou sessao */
var SUB_DA_TELA={
  elenco:function(){ return S.el; }, biblioteca:function(){ return S.bib; },
  mesa:function(){ return S.msec; }, ajustes:function(){ return S.aj; },
  sessao:function(){ var s=curSess(); return encodeURIComponent(s?.id||"")+(S.vmode==="roteiro"?"/roteiro":""); }
};
var APLICA_SUB={
  elenco:function(v){ if(v)S.el=v; }, biblioteca:function(v){ if(v)S.bib=v; },
  mesa:function(v){ if(v)S.msec=v; }, ajustes:function(v){ S.aj=v||""; }
};

function rotaDeS(){
  if(!CID)return S.view==="ajustes"?"#/configuracoes"+(S.aj?"/"+S.aj:""):"#/campanhas";
  var base="#/c/"+CID+"/"+(NOME_TELA[S.view]||"campanha"), sub=SUB_DA_TELA[S.view]?.();
  return sub?base+"/"+sub:base;
}
function lerRota(h){
  var p=String(h||"").replace(/^#\/?/,"").split("/").map(function(x){
    try{ return decodeURIComponent(x); }catch(error_){ return x; } });
  if(p[0]==="campanhas")return {cid:null,view:"escolher"};
  if(p[0]==="configuracoes")return {cid:null,view:"ajustes",sub:p[1]||""};
  if(p[0]!=="c"||!p[1])return null;
  return {cid:p[1],view:TELA_DO_NOME[p[2]]||null,sub:p[3]||"",extra:p[4]||""};
}
function aplicaSessao(r){
  var i=(D.sessoes||[]).findIndex(function(s){ return String(s.id)===String(r.sub); });
  if(i<0||!GM)return false;
  S.sessao=i; S.vmode=r.extra==="roteiro"?"roteiro":"canvas"; CV.init=false;
  return true;
}
/* Aplica o que a rota pede sobre S. Devolve false quando a tela pedida nao existe mais (sessao
   apagada, por exemplo) ou nao e do papel da pessoa: nesse caso fica a tela de partida. */
function aplicaRota(r){
  if(!r?.view)return false;
  if(r.view==="sessao"&&!aplicaSessao(r))return false;
  if(r.view!=="mesa"&&r.view!=="ajustes"&&!GM)return false;
  S.view=r.view;
  APLICA_SUB[r.view]?.(r.sub);
  return true;
}
/* Contagem anonima de uso (Metrica no servidor): so o nome da tela, sem campanha nem pessoa.
   Desligada em Configuracoes > Privacidade e acessibilidade (grim_metricas=0) e durante o tour. */
function contarUso(evento){
  if(TOUR)return;
  try{ if(localStorage.getItem("grim_metricas")==="0")return; }catch(error_){ return; }
  api("/api/metrica",{method:"POST",body:{evento:evento}}).catch(function(){ /* contagem perdida nao interessa a ninguem */ });
}
/* Chamado no fim de render(). Tela nova empilha uma entrada no historico; redesenho da mesma
   tela (ou o tour, que troca de tela a cada passo) so troca o endereco. */
function sincronizaRota(nova){
  if(!PRONTO)return;
  if(nova)contarUso("tela:"+(NOME_TELA[S.view]||S.view));
  var r=rotaDeS();
  if(r!==location.hash){
    if(nova&&!TOUR&&ROTA_ULT)history.pushState({g:1},"",r);
    else history.replaceState({g:1},"",r);
  }
  ROTA_ULT=r;
}
/* Voltar do navegador com uma janela ou menu aberto: fecha so ela e fica na mesma tela */
function voltarFechaCamada(){
  var t=camadaTopo();
  history.pushState({g:1},"",ROTA_ULT);
  if(MENU&&MENU.el===t)fecharMenu();
  else t?.close?.();
}
function voltarSemCampanha(r){
  if(r.view==="ajustes"){ S.view="ajustes"; S.aj=r.sub||""; render(); return; }
  if(CID)trocarCampanha(); else render();
}
window.addEventListener("popstate",function(){
  if(TOUR){ history.replaceState({g:1},"",ROTA_ULT); return; }
  if(CAMADAS.length){ voltarFechaCamada(); return; }
  var r=lerRota(location.hash);
  if(!r)return;
  if(!r.cid){ voltarSemCampanha(r); return; }
  if(String(r.cid)!==String(CID)){ ROTA_PENDENTE=r; entrarNaCampanha(r.cid); return; }
  if(!aplicaRota(r))S.view=GM?"home":"mesa";
  render();
});
/* Titulo da aba do navegador: tela, campanha, app. Quem usa leitor de tela ouve onde esta. */
var TITULO_DA_TELA={
  escolher:function(){ return "Suas campanhas"; }, semcampanha:function(){ return "Suas campanhas"; },
  ajustes:function(){ return "Configurações"; }, home:function(){ return Vm("campanha"); },
  sessoes:function(){ return Vm("sessoes"); }, elenco:function(){ return "Elenco"; },
  biblioteca:function(){ return "Biblioteca"; },
  sessao:function(){ return curSess()?.titulo||Vm("sessao"); },
  mesa:function(){ var m=MSECS().find(function(x){ return x[0]===S.msec; }); return GM?Vm("mesa"):(m?.[1]||Vm("mesa")); }
};
function tituloDaTela(){
  var t=[], f=TITULO_DA_TELA[S.view];
  if(f)t.push(f());
  var a=CID?tituloApp():"";
  if(a&&a!=="Grimório")t.push(a);
  t.push("Grimório");
  return t.join(" · ");
}
