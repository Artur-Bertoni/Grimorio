/* Fichas de personagem e importacao de PDF. */
"use strict";

/* ---------- FICHAS ----------
   Os campos sao da campanha (MESA.fichaModelo), nunca de um sistema. A ficha e uma lista
   plana de campos com a secao escrita em cada um: e o que o formulario de grupo sabe editar. */
/* FICHAS_CID: de que campanha a lista veio (trocar de campanha nao pode deixar a busca mostrar as fichas da anterior) */
var FICHAS=[], FICHAS_CID=null, fichaT={};
var FICHA_TIPOS=[["texto","Texto curto"],["num","Número ou dados (clicar rola)"],["barra","Barra (atual / máximo)"],["area","Texto longo"],["check","Caixa de marcar"]];
var FICHA_PADRAO=[{sec:"Identidade",rot:"Conceito",tipo:"texto"},{sec:"Identidade",rot:"Jogador",tipo:"texto"},
  {sec:"Recursos",rot:"Vida",tipo:"barra"},{sec:"Recursos",rot:"Energia",tipo:"barra"},
  {sec:"Atributos",rot:"Atributo",tipo:"num"},{sec:"Perícias",rot:"Perícia",tipo:"num"},
  {sec:"Equipamento",rot:"Itens",tipo:"area"},{sec:"Anotações",rot:"Notas",tipo:"area"}];
function fichaModelo(){ return (Array.isArray(MESA.fichaModelo)&&MESA.fichaModelo.length)?MESA.fichaModelo:FICHA_PADRAO; }
function fichaFormula(){ return typeof MESA.fichaFormula==="string"?MESA.fichaFormula:"1d20+{v}"; }
/* Valor que ja e uma rolagem (d10+d12, 2d6+3): ha sistema em que o teste soma dados de tamanhos diferentes, e a formula
   do modelo so troca um numero. Esse campo rola o proprio valor, com ou sem formula no modelo. */
var FICHA_ROLAGEM=/^\d{0,2}d\d{1,4}([+-]\d{0,2}d?\d{1,4})*$/i;
function fichaValorRola(v){ return FICHA_ROLAGEM.test(String(v??"").replace(/\s+/g,"")); }
function fichaDados(f){
  if(f._c){ return f._c; }
  var c={};
  try{ c=JSON.parse(f.json||"{}")||{}; }catch(error_){ /* falha aqui nao muda o que a pessoa ve */ }
  if(!Array.isArray(c.campos)){ c.campos=[]; }
  f._c=c; return c;
}
function fichaCampoLimpo(x){
  var t=String(x?.tipo||"texto");
  if(!FICHA_TIPOS.some(function(o){ return o[0]===t; })){ t="texto"; }
  return {sec:String(x?.sec||"").trim().slice(0,60),rot:String(x?.rot||"").trim().slice(0,80),tipo:t,
    val:String(x?.val??"").slice(0,4000),max:String(x?.max??"").slice(0,12)};
}
function gravaFicha(f,ja){
  clearTimeout(fichaT[f.id]); fichaT[f.id]=null;
  var faz=function(){ fichaT[f.id]=null; f.json=JSON.stringify(fichaDados(f));
    return api(cAPI("/fichas/"+f.id),{method:"PUT",body:{nome:f.nome,json:f.json}}).catch(function(e){ toast(e?.message||"não consegui salvar a ficha"); }); };
  if(ja){ return faz(); }
  fichaT[f.id]=setTimeout(faz,600);
  return null;
}
/* fechar a ficha com uma gravacao esperando o debounce manda na hora: quem fecha e reabre ja ve o que digitou */
function gravaFichaPendente(f){ if(fichaT[f.id]){ gravaFicha(f,true); } }
function carregaFichas(){ var cid=CID; return api(cAPI("/fichas")).then(function(l){ FICHAS=Array.isArray(l)?l:[]; FICHAS_CID=cid; return FICHAS; }); }
function fichasDaCampanha(){ return FICHAS_CID===CID?FICHAS:[]; }
/* o que a pessoa digitou na busca da lista: sobrevive ao redesenho da secao */
var FX_BUSCA="";
function fichasSecHtml(){
  return htmlDe("t-fichas",{mestre:GM,ia:!!IACFG,busca:FX_BUSCA});
}
function fichaInicial(nome){ return String(nome||"").trim().charAt(0).toUpperCase()||"?"; }
/* As variacoes de token (desarmado, armado…): {id, nome, img}; a primeira e a padrao. Ficha de antes delas guardava
   uma imagem so em "token", que vale como variacao unica (a mesma regra de MapaFichas.variantes, no servidor). */
function fichaVariantes(c){
  if(Array.isArray(c.tokens)){ return c.tokens.filter(function(v){ return v?.img; }); }
  return c.token?[{id:"t",nome:"",img:c.token}]:[];
}
/* o icone da ficha; sem ele, a variacao padrao do token e, sem as duas, a de um token ligado a ela num mapa (tokenImg) */
function fichaIcone(f){
  var c=fichaDados(f), p=c.img||fichaVariantes(c)[0]?.img;
  if(p){ return IMG(p,"mini"); }
  return f.tokenImg?IMG(f.tokenImg,"mini"):"";
}
function fichaCartao(f){
  var c=fichaDados(f);
  return {id:f.id,nome:f.nome,dono:GM&&!f.minha?f.dono:"",campos:c.campos.length,img:fichaIcone(f),inicial:fichaInicial(f.nome),
    barras:c.campos.filter(function(x){ return x.tipo==="barra"&&x.max; }).slice(0,2)};
}
/* Primeiro as fichas dos personagens (as que sao de quem joga), depois as dos NPCs (as do mestre). O jogador so ve as
   proprias, entao para ele e um grupo so, sem titulo. A busca e pelo nome, sem acento nem caixa. */
function pintaFichas(){
  var box=$("#fxList"); if(!box){ return; }
  var q=norm(FX_BUSCA.trim()), l=FICHAS.filter(function(f){ return !q||norm(f.nome).includes(q); });
  var grupos=[];
  if(GM){
    var pj=l.filter(function(f){ return f.jogador; }), npc=l.filter(function(f){ return !f.jogador; });
    if(pj.length){ grupos.push({titulo:Vm("personagens"),fichas:pj.map(fichaCartao)}); }
    if(npc.length){ grupos.push({titulo:Vm("npcs"),fichas:npc.map(fichaCartao)}); }
  } else if(l.length){ grupos.push({titulo:"",fichas:l.map(fichaCartao)}); }
  box.innerHTML=htmlDe("t-fichas-lista",{grupos:grupos,vazia:!FICHAS.length,semBusca:!!FICHAS.length&&!l.length});
  $$("[data-ficha]",box).forEach(function(b){ b.onclick=function(){
    abrirFicha(FICHAS.find(function(f){ return String(f.id)===b.dataset.ficha; })); }; });
}
function ligarFichas(){
  carregaFichas().then(pintaFichas).catch(function(){ var b=$("#fxList"); if(b){ b.innerHTML=htmlDe("t-vazio",{texto:"Não consegui ler as fichas."}); } });
  var bu=$("#fxBusca");
  if(bu){ bu.oninput=function(){ FX_BUSCA=bu.value; pintaFichas(); }; }
  var n=$("#fxNova");
  if(n){ n.onclick=function(){ criaFicha("Novo personagem",fichaModelo().map(function(x){ return fichaCampoLimpo(x); }),true); }; }
  var m=$("#fxModelo"); if(m){ m.onclick=editarModeloFicha; }
  var lv=$("#fxLivros"); if(lv){ lv.onclick=abrirFichaLivros; }
  var p=$("#fxPdf"), a=$("#fxArq");
  if(p&&a){
    p.onclick=function(){ a.value=""; a.click(); };
    a.onchange=function(){ if(a.files?.[0]){ importarFichaPdf(a.files[0]); } };
  }
}
/* editar: a ficha nova abre com o topo (nome e icone) em edicao, com o nome selecionado para trocar */
function criaFicha(nome,campos,editar){
  return api(cAPI("/fichas"),{method:"POST",body:{nome:nome,json:JSON.stringify({campos:campos})}}).then(function(f){
    f.jogador=!GM; FICHAS.push(f); pintaFichas(); if(editar){ abrirFicha(f,{editar:true}); } return f; })
   .catch(function(e){ toast(e?.message||"não deu para criar a ficha"); });
}
/* abre a ficha pelo id, de onde for (busca, elenco, token do mapa): le a lista se ela ainda nao veio */
function abrirFichaPorId(id){
  var acha=function(){ return fichasDaCampanha().find(function(f){ return String(f.id)===String(id); }); };
  var f=acha();
  if(f){ abrirFicha(f); return Promise.resolve(f); }
  return carregaFichas().then(function(){
    var g=acha();
    if(g){ abrirFicha(g); } else { toast("Essa "+vmin("ficha")+" não existe mais ou não é sua.","aviso"); }
    return g;
  }).catch(function(e){ toast(mensagemDeErro(e),"erro"); });
}
function fichaGrupo(){
  return {k:"campos",rot:"Campos",tipo:"grupo",um:"campo",novo:function(){ return {sec:"",rot:"",tipo:"texto",val:"",max:""}; },
    campos:[{k:"sec",rot:"Seção"},{k:"rot",rot:"Rótulo"},{k:"tipo",rot:"Tipo",tipo:"sel",ops:FICHA_TIPOS}]};
}
function apagaFicha(f,depois){
  confirmar("A ficha sai do servidor e não dá para desfazer.",{titulo:"Apagar esta ficha?",sim:"Apagar a ficha"})
    .then(function(sim){ return sim?api(cAPI("/fichas/"+f.id),{method:"DELETE"}):false; })
    .then(function(r){
      if(r===false){ return; }
      clearTimeout(fichaT[f.id]); fichaT[f.id]=null;
      FICHAS=FICHAS.filter(function(x){ return x!==f; }); pintaFichas();
      if(depois){ depois(true); }
      toast("Ficha apagada","ok");
    })
    .catch(function(e){ toast(mensagemDeErro(e),"erro"); });
}
function editarModeloFicha(){
  formulario("Modelo da ficha",[
    {k:"formula",rot:"Rolagem ao clicar num número",dica:"{v} vira o valor do campo. Ex.: 1d20+{v}. Deixe vazio para o clique não rolar nada. Campo cujo valor já é uma rolagem (d10+d12) rola o próprio valor."},
    fichaGrupo()
  ],{formula:fichaFormula(),campos:fichaModelo()},{
    salvar:function(w){ MESA.fichaFormula=String(w.formula||"").trim();
      MESA.fichaModelo=(w.campos||[]).map(function(x){ var y=fichaCampoLimpo(x); return {sec:y.sec,rot:y.rot,tipo:y.tipo}; })
        .filter(function(x){ return x.rot; });
      salvarMesa(); toast("Modelo salvo. Vale para as próximas fichas."); }
  });
}
/* As secoes na ordem em que aparecem; dentro de cada uma, os numeros vao para a grade de baixo e o resto fica em
   cima. k e a posicao do campo dentro do seu grupo: e o que o arrastar move. */
function fichaSecoes(c){
  var secs=[], porNome={};
  c.campos.forEach(function(x,i){
    var nome=x.sec||"Geral";
    if(!porNome[nome]){ porNome[nome]={nome:nome,si:secs.length,resto:[],nums:[]}; secs.push(porNome[nome]); }
    var g=x.tipo==="num"?porNome[nome].nums:porNome[nome].resto;
    var mx=Number.parseFloat(x.max)||0, v=Number.parseFloat(x.val)||0;
    g.push({x:x,i:i,k:g.length,pc:mx>0?Math.max(0,Math.min(100,v/mx*100)):0,r:x.tipo==="num"&&fichaValorRola(x.val)});
  });
  return secs;
}
function fichaDaSecao(x,nome){ return (x.sec||"Geral")===nome; }
/* a secao inteira muda de lugar: a lista plana e refeita na ordem nova das secoes */
function fichaMoveSecao(c,de,para){
  var blocos=fichaSecoes(c).map(function(s){ return c.campos.filter(function(x){ return fichaDaSecao(x,s.nome); }); });
  if(!moverNaLista(blocos,de,para)){ return false; }
  c.campos=blocos.flat(); return true;
}
/* um campo muda de lugar dentro do grupo dele: os campos do grupo trocam entre as mesmas casas da lista plana */
function fichaMoveCampo(c,si,g,de,para){
  var s=fichaSecoes(c)[si]; if(!s){ return false; }
  var idx=(g==="n"?s.nums:s.resto).map(function(o){ return o.i; }), arr=idx.map(function(i){ return c.campos[i]; });
  if(!moverNaLista(arr,de,para)){ return false; }
  idx.forEach(function(i,k){ c.campos[i]=arr[k]; }); return true;
}
/* o + e o - da barra: nunca abaixo de zero nem acima do maximo */
function fichaPasso(x,passo){
  var mx=Number.parseFloat(x.max), v=Math.max(0,(Number.parseFloat(x.val)||0)+passo);
  if(Number.isFinite(mx)&&mx>0&&v>mx){ v=mx; }
  x.val=String(v);
}
/* clicar num numero rola a formula do modelo com o valor do campo no lugar de {v} */
function fichaRola(x,nome){
  if(fichaValorRola(x.val)){ abrirDados({formula:String(x.val).replace(/\s+/g,""),rotulo:x.rot+" · "+nome,auto:true}); return; }
  var fo=fichaFormula();
  if(!fo){ return; }
  var n=Number.parseInt(String(x.val).replace(/[^\d+-]/g,""),10)||0;
  abrirDados({formula:fo.replaceAll("{v}",(n<0?"-":"")+Math.abs(n)).replaceAll("+-","-"),rotulo:x.rot+" · "+nome,auto:true});
}

/* ---------- ficha aberta ----------
   Edita-se bloco a bloco: o topo (nome, icone, jogador, visao), os tokens (as variacoes) e cada secao tem o seu lapis,
   e so um bloco fica aberto por vez. O resto continua de jogo enquanto isso. Tudo grava sozinho.
   fx e a ficha aberta: {f, c (os dados), ed ("" | "topo" | "tok" | "s:" + nome da secao), toks (tokens ligados; null
   enquanto carrega), donos (as pessoas da mesa, so para o mestre), ov, corpo, fecha}. */
function abrirFicha(f,o){
  if(!f){ return; }
  var ov=overlay(f.nome,"",{wide:true,cls:"fichasheet",head:htmlDe("t-ficha-cabeca",{mestre:GM})});
  var fx={f:f,c:fichaDados(f),ed:o?.editar?"topo":"",toks:null,donos:null,ov:ov,corpo:el("div",{id:"fxBody"}),fecha:ov.close};
  $(".sbodyscroll",ov).appendChild(fx.corpo);
  ov.close=function(){ gravaFichaPendente(f); pintaFichas(); fx.fecha(); };
  var fm=$("#fxMod",ov);
  if(fm){ fm.onclick=function(){ fxViraModelo(fx); }; }
  ligarOrdem(ov,function(lista){ return fxOrdem(fx,lista); });
  fxPinta(fx);
  fxCarregaTokens(fx);
  var n=fx.ed&&$("#fxNome",ov);
  if(n){ focar(n); n.select(); }
}
/* os campos desta ficha viram o modelo das proximas; reversivel: troca na hora e oferece desfazer */
function fxViraModelo(fx){
  var antes=MESA.fichaModelo;
  MESA.fichaModelo=fx.c.campos.map(function(x){ return {sec:x.sec,rot:x.rot,tipo:x.tipo}; }).filter(function(x){ return x.rot; });
  salvarMesa();
  toastAcao("Modelo trocado: "+MESA.fichaModelo.length+" campos. As fichas que já existem não mudam.","Desfazer",function(){
    MESA.fichaModelo=antes; salvarMesa(); toast("Desfeito","ok"); });
}
/* arrastar: as secoes entre si (sempre), os campos dentro do grupo da secao em edicao e as variacoes de token */
function fxOrdem(fx,lista){
  var k=lista.dataset.ordena;
  if(k==="fxsec"){ return function(l,de,para){ if(fichaMoveSecao(fx.c,de,para)){ fxRefaz(fx); } }; }
  if(k==="fxvar"){ return function(l,de,para){ if(moverNaLista(fxVars(fx),de,para)){ fxGravaVars(fx); } }; }
  if(k!=="fxcampo"){ return null; }
  return function(l,de,para){
    var p=String(l.dataset.p||"");
    if(fichaMoveCampo(fx.c,Number.parseInt(p,10),p.slice(-1),de,para)){ fxRefaz(fx); }
  };
}
/* mudanca de estrutura: grava, redesenha e leva o foco ao seletor pedido (o campo novo, a secao nova) */
function fxRefaz(fx,foco){
  gravaFicha(fx.f); fxPinta(fx);
  var e=foco&&$(foco,fx.ov);
  if(e){ focar(e); e.select?.(); }
}
/* tira algo da ficha e oferece desfazer (comDesfazer guarda o guia e a mesa; a ficha e outra gravacao) */
function fxTira(fx,msg,tira){
  var antes=JSON.stringify(fx.c);
  tira(); fxRefaz(fx);
  toastAcao(msg,"Desfazer",function(){
    var c=JSON.parse(antes);
    Object.keys(fx.c).forEach(function(k){ delete fx.c[k]; });
    Object.assign(fx.c,c);
    fxRefaz(fx); fxCarregaTokensDepois(fx); toast("Desfeito","ok"); });
}
function fxTokensHtml(fx){
  if(!fx.toks){ return htmlDe("t-ficha-tokens",{carregando:true,itens:[]}); }
  return htmlDe("t-ficha-tokens",{carregando:false,itens:fx.toks.map(function(t){
    return {id:t.id,nome:t.nome||fx.f.nome,img:t.img?IMG(t.img,"mini"):"",
      onde:t.mapaNome?(Vm("mapa")+" "+t.mapaNome+(t.ativo?" (ativo)":"")):"Em outro "+vmin("mapa"),
      oculto:GM&&!t.visivel,solto:!t.vinculo,podeSoltar:!!t.podeSoltar}; })});
}
function fxLapis(fx,chave,rotulo){ return htmlDe("t-ficha-lapis",{chave:chave,rotulo:rotulo,on:fx.ed===chave}); }
/* o jogador da ficha (so o mestre escolhe): ninguem e ficha de NPC */
function fxDonos(fx){
  if(!GM||fx.ed!=="topo"||!fx.donos){ return []; }
  var atual=fx.f.jogador?String(fx.f.donoId):"0", l=fx.donos.slice();
  if(!l.some(function(o){ return o[0]===atual; })){ l.push([atual,fx.f.dono||"Outra pessoa"]); }
  return l.map(function(o){ return {v:o[0],rot:o[0]==="0"?"Ninguém (ficha de "+vmin("npc")+")":o[1],on:o[0]===atual}; });
}
function fxPinta(fx){
  var f=fx.f, c=fx.c, ov=fx.ov;
  if(!document.body.contains(ov)){ return; }
  ov.querySelector(".stit").textContent=f.nome+(GM&&!f.minha?" · "+f.dono:"");
  var vs=fichaVariantes(c);
  fx.corpo.innerHTML=htmlDe("t-ficha-corpo",{edTopo:fx.ed==="topo",edTok:fx.ed==="tok",rola:!!fichaFormula(),nome:f.nome,
    dono:GM&&!f.minha?f.dono:"",jogador:!!f.jogador,img:fichaIcone(f),proprio:!!c.img,inicial:fichaInicial(f.nome),
    visao:c.visao==null?"":String(c.visao),donos:fxDonos(fx),mapa:!mapaBloqueado(),tokens:fxTokensHtml(fx),
    lapisTopo:fxLapis(fx,"topo","o nome e o ícone"),lapisTok:fxLapis(fx,"tok","as variações do "+vmin("token")),
    variantes:vs.map(function(v,i){ return {i:i,nome:v.nome||"",img:IMG(v.img,"mini")}; }),
    secoes:fichaSecoes(c).map(function(s){ s.ed=fx.ed==="s:"+s.nome; s.lapis=fxLapis(fx,"s:"+s.nome,"a seção "+s.nome); return s; })});
  fxLigaBlocos(fx); fxLigaJogo(fx); fxLigaTokens(fx);
  $("#fxAddSec",fx.corpo).onclick=function(){ fxNovaSecao(fx); };
  if(fx.ed==="topo"){ fxLigaIdentidade(fx); }
  if(fx.ed==="tok"){ fxLigaVariantes(fx); }
  if(fx.ed.startsWith("s:")){ fxLigaValores(fx); fxLigaSecoes(fx); fxLigaCampos(fx); }
}
/* o lapis (e o Pronto) abre um bloco e fecha o que estava aberto; fechar devolve o foco ao lapis do bloco */
function fxLigaBlocos(fx){
  $$("[data-fxed]",fx.corpo).forEach(function(b){ b.onclick=function(){
    var k=b.dataset.fxed, abre=fx.ed!==k;
    gravaFichaPendente(fx.f);
    fx.ed=abre?k:"";
    fxPinta(fx);
    if(abre&&k==="topo"&&GM&&!fx.donos){ fxCarregaDonos(fx); }
    var bloco="."+({topo:"fxtopo",tok:"fxtok"}[k]||"fxsec")+".ed";
    var alvo=abre?($(bloco+" .nl",fx.corpo)||$(bloco+" :is(input,select,textarea,button:not(.alca))",fx.corpo))
      :$('.edb[data-fxed="'+CSS.escape(k)+'"]',fx.corpo);
    if(alvo){ focar(alvo); }
  }; });
}
function fxCarregaDonos(fx){
  mpOpcoesDono().then(function(l){ fx.donos=l; if(fx.ed==="topo"){ fxPinta(fx); focar($("#fxDono",fx.corpo)); } });
}
/* fora do bloco em edicao: barra com + e -, caixa de marcar e numero que rola */
function fxLigaJogo(fx){
  var c=fx.c;
  $$("[data-fb]",fx.corpo).forEach(function(bt){ bt.onclick=function(e){
    fichaPasso(c.campos[+bt.dataset.fb],(+bt.dataset.d)*(e.shiftKey?5:1)); gravaFicha(fx.f); fxPinta(fx); }; });
  $$("[data-fc]",fx.corpo).forEach(function(ck){ ck.onchange=function(){ c.campos[+ck.dataset.fc].val=ck.checked?"1":""; gravaFicha(fx.f); }; });
  $$("[data-fn]",fx.corpo).forEach(function(bt){ bt.onclick=function(){ fichaRola(c.campos[+bt.dataset.fn],fx.f.nome); }; });
}
/* nome, jogador, alcance da visao, icone e apagar */
function fxLigaIdentidade(fx){
  var f=fx.f, c=fx.c, corpo=fx.corpo, nome=$("#fxNome",corpo), vis=$("#fxVisao",corpo), icx=$("#fxIconeX",corpo), dono=$("#fxDono",corpo);
  nome.oninput=function(){ f.nome=nome.value.trim()||"Sem nome"; fx.ov.querySelector(".stit").textContent=f.nome; gravaFicha(f); };
  vis.oninput=function(){ if(vis.value===""){ delete c.visao; } else { c.visao=Math.min(100,Math.max(0,Number(vis.value)||0)); } gravaFicha(f); };
  $("#fxIcone",corpo).onclick=function(){ fichaEscolheImagem(f,c.img||"").then(function(r){ fxIcone(fx,r); }); };
  if(icx){ icx.onclick=function(){ fxIcone(fx,""); }; }
  if(dono){ dono.onchange=function(){ fxTrocaDono(fx,dono.value); }; }
  $("#fxApaga",corpo).onclick=function(){ apagaFicha(f,fx.fecha); };
}
/* o mestre entrega a ficha a alguem da mesa (ou a devolve para si, como NPC); os tokens ligados vao junto */
function fxTrocaDono(fx,v){
  var f=fx.f;
  api(cAPI("/fichas/"+f.id+"/dono"),{method:"PUT",body:{usuario:Number(v)||0}}).then(function(r){
    f.dono=r.dono; f.donoId=r.donoId; f.jogador=!!r.jogador; f.minha=!!r.minha;
    fxPinta(fx); pintaFichas(); focar($("#fxDono",fx.corpo));
    toast(f.jogador?"A "+vmin("ficha")+" agora é de "+f.dono+".":"A "+vmin("ficha")+" virou ficha de "+vmin("npc")+".","ok");
    fxCarregaTokens(fx);
  }).catch(function(e){ toast(mensagemDeErro(e),"erro"); fxPinta(fx); });
}
/* r: o caminho escolhido, "" para tirar, null quando a pessoa fechou sem escolher */
function fxIcone(fx,r){
  if(r==null){ return; }
  if(r){ fx.c.img=r; } else { delete fx.c.img; }
  fxRefaz(fx,"#fxIcone");
  fxCarregaTokensDepois(fx);
}
/* valor, maximo e rotulo gravam a cada tecla, sem redesenhar: o foco fica onde a pessoa esta */
function fxLigaValores(fx){
  var cs=fx.c.campos, f=fx.f;
  $$("[data-fv]",fx.corpo).forEach(function(e){ e.oninput=function(){ cs[+e.dataset.fv].val=e.value.slice(0,4000); gravaFicha(f); }; });
  $$("[data-fm]",fx.corpo).forEach(function(e){ e.oninput=function(){ cs[+e.dataset.fm].max=e.value.slice(0,12); gravaFicha(f); }; });
  $$("[data-fr]",fx.corpo).forEach(function(e){ e.oninput=function(){ cs[+e.dataset.fr].rot=e.value.slice(0,80); gravaFicha(f); }; });
}
function fxLigaSecoes(fx){
  var c=fx.c;
  /* o nome da secao muda quando a pessoa sai do campo: no meio da digitacao, "Per" juntaria com uma secao "Per" */
  $$("[data-fs]",fx.corpo).forEach(function(e){ e.onchange=function(){ fxRenomeiaSecao(fx,+e.dataset.fs,e.value.trim().slice(0,60)); }; });
  $$("[data-fsx]",fx.corpo).forEach(function(b){ b.onclick=function(){
    var s=fichaSecoes(c)[+b.dataset.fsx];
    if(s){ fx.ed=""; fxTira(fx,"Seção "+s.nome+" removida",function(){ c.campos=c.campos.filter(function(x){ return !fichaDaSecao(x,s.nome); }); }); } }; });
}
/* a secao nova ja abre em edicao, com o foco no nome */
function fxNovaSecao(fx){
  var c=fx.c, nomes=fichaSecoes(c).map(function(s){ return s.nome; }), n="Nova seção", k=2;
  while(nomes.includes(n)){ n="Nova seção "+(k++); }
  gravaFichaPendente(fx.f);
  c.campos.push({sec:n,rot:"",tipo:"texto",val:"",max:""});
  fx.ed="s:"+n;
  fxRefaz(fx,'[data-fs="'+nomes.length+'"]');
}
function fxRenomeiaSecao(fx,si,novo){
  var c=fx.c, s=fichaSecoes(c)[si];
  if(!s||novo===s.nome){ return; }
  c.campos.forEach(function(x){ if(fichaDaSecao(x,s.nome)){ x.sec=novo; } });
  fx.ed="s:"+(novo||"Geral");
  var onde=fichaSecoes(c).findIndex(function(z){ return z.nome===(novo||"Geral"); });
  fxRefaz(fx,'[data-fs="'+onde+'"]');
}
function fxLigaCampos(fx){
  $$("[data-fadd]",fx.corpo).forEach(function(b){ b.onclick=function(){
    fichaEscolheTipo(b,"Tipo do campo novo",null,false,function(t){ fxNovoCampo(fx,+b.dataset.fadd,t); }); }; });
  $$("[data-fmenu]",fx.corpo).forEach(function(b){ b.onclick=function(){
    var i=+b.dataset.fmenu, x=fx.c.campos[i];
    fichaEscolheTipo(b,x.rot||"Campo",x.tipo,true,function(t){ fxMudaCampo(fx,i,t); }); }; });
}
/* o campo novo entra no fim da secao, ja com o foco no rotulo */
function fxNovoCampo(fx,si,tipo){
  var cs=fx.c.campos, s=fichaSecoes(fx.c)[si];
  if(!s){ return; }
  var ult=cs.reduce(function(a,x,i){ return fichaDaSecao(x,s.nome)?i:a; },-1);
  cs.splice(ult+1,0,{sec:s.nome==="Geral"?"":s.nome,rot:"",tipo:tipo,val:"",max:""});
  fxRefaz(fx,'[data-fr="'+(ult+1)+'"]');
}
/* t: o tipo novo, ou "rm" para tirar o campo */
function fxMudaCampo(fx,i,t){
  var cs=fx.c.campos, x=cs[i];
  if(t==="rm"){ fxTira(fx,"Campo "+(x.rot||"")+" removido",function(){ cs.splice(i,1); }); return; }
  x.tipo=t;
  if(t!=="barra"){ x.max=""; }
  fxRefaz(fx,'[data-fr="'+i+'"]');
}
/* o menu dos tipos; com remover, o "Remover o campo" no fim */
function fichaEscolheTipo(ancora,titulo,atual,remover,fn){
  var itens=FICHA_TIPOS.map(function(t){ return {v:t[0],rot:t[1],dica:t[0]===atual?"o tipo de agora":"",perigo:false,desligado:t[0]===atual}; });
  if(remover){ itens.push({v:"rm",rot:"Remover o campo",dica:"",perigo:true,desligado:false}); }
  menuSolto(ancora,htmlDe("t-menu",{titulo:titulo,itens:itens}),function(it){ fn(it.dataset.v); });
}

/* ---- as variacoes de token (desarmado, armado…): a imagem que o token mostra no mapa, trocada ali com um clique ---- */
/* na primeira edicao, a imagem unica de antes ("token") vira a primeira variacao */
function fxVars(fx){
  if(!Array.isArray(fx.c.tokens)){ fx.c.tokens=fichaVariantes(fx.c).map(function(v){ return {id:v.id,nome:v.nome,img:v.img}; }); delete fx.c.token; }
  return fx.c.tokens;
}
/* grava na hora: o servidor passa as variacoes aos tokens ligados, e a lista deles e relida depois */
function fxGravaVars(fx,foco){
  fxPinta(fx);
  var e=foco&&$(foco,fx.corpo);
  if(e){ focar(e); e.select?.(); }
  fxCarregaTokensDepois(fx);
}
function fxCarregaTokensDepois(fx){
  void Promise.resolve(gravaFicha(fx.f,true)).then(function(){ fxCarregaTokens(fx); });
}
function fxLigaVariantes(fx){
  var vs=fxVars(fx);
  $("#fxVarNova",fx.corpo).onclick=function(){
    fichaEscolheImagem(fx.f,"").then(function(r){
      if(!r){ return; }
      vs.push({id:"v"+Date.now().toString(36),nome:"",img:r});
      fxGravaVars(fx,'[data-fvn="'+(vs.length-1)+'"]');
    }); };
  $$("[data-fvn]",fx.corpo).forEach(function(e){ e.oninput=function(){ vs[+e.dataset.fvn].nome=e.value.slice(0,30); gravaFicha(fx.f); }; });
  $$("[data-fvimg]",fx.corpo).forEach(function(b){ b.onclick=function(){
    var v=vs[+b.dataset.fvimg];
    fichaEscolheImagem(fx.f,v.img).then(function(r){ if(r){ v.img=r; fxGravaVars(fx,'[data-fvimg="'+b.dataset.fvimg+'"]'); } }); }; });
  $$("[data-fvx]",fx.corpo).forEach(function(b){ b.onclick=function(){
    var i=+b.dataset.fvx, v=vs[i];
    fxTira(fx,"Variação "+(v.nome||(i+1))+" tirada",function(){ vs.splice(i,1); });
    fxCarregaTokensDepois(fx); }; });
}

/* ---- os tokens da ficha nos mapas: quem pode pôr e ligar e o mestre e o dono da ficha ---- */
function fxCarregaTokens(fx){
  if(mapaBloqueado()){ return; }
  api(cAPI("/fichas/"+fx.f.id+"/tokens"))
    .then(function(l){ fx.toks=Array.isArray(l)?l:[]; })
    .catch(function(){ fx.toks=[]; })
    .then(function(){ fxRepintaTokens(fx); });
}
function fxRepintaTokens(fx){
  var box=$("#fxTokList",fx.corpo), f=fx.f;
  if(!box){ return; }
  box.innerHTML=fxTokensHtml(fx); fxLigaSoltar(fx);
  /* a imagem do token e o icone enquanto a ficha nao tem o seu: troca so o retrato, sem redesenhar (e sem tirar o foco) */
  var t=fx.toks.find(function(x){ return x.img; }), antes=f.tokenImg||"", av=$(".fxavaimg",fx.corpo);
  f.tokenImg=t?t.img:"";
  if(antes===f.tokenImg||fx.c.img||fichaVariantes(fx.c).length||!av){ return; }
  av.replaceChildren(f.tokenImg?el("img",{src:IMG(f.tokenImg,"mini"),alt:"Ícone de "+f.nome}):el("span",{"aria-hidden":"true",text:fichaInicial(f.nome)}));
}
function fxLigaSoltar(fx){
  $$("[data-fxsolta]",fx.corpo).forEach(function(b){ b.onclick=function(){
    api(cAPI("/fichas/"+fx.f.id+"/tokens/"+b.dataset.fxsolta),{method:"DELETE"})
      .then(function(){ toast(Vm("token")+" desligado. Ele continua no "+vmin("mapa")+".","ok"); fxCarregaTokens(fx); })
      .catch(function(e){ toast(mensagemDeErro(e),"erro"); }); }; });
}
function fxLigaTokens(fx){
  var por=$("#fxTokPor",fx.corpo), liga=$("#fxTokLiga",fx.corpo);
  if(!por){ return; }
  fxLigaSoltar(fx);
  por.onclick=function(){ fxPorToken(fx); };
  liga.onclick=function(){ fxLigaToken(fx); };
}
function fxPorToken(fx){
  var mapa=null;
  fichaEscolheMapa()
    .then(function(m){ mapa=m; return m?api(cAPI("/fichas/"+fx.f.id+"/tokens"),{method:"POST",body:{mapa:m.id}}):null; })
    .then(function(r){ if(r){ toast(Vm("token")+" posto em "+mapa.nome+".","ok"); fxCarregaTokens(fx); } })
    .catch(function(e){ toast(mensagemDeErro(e),"erro"); });
}
function fxLigaToken(fx){
  var mapa=null;
  fichaEscolheMapa()
    .then(function(m){ mapa=m; return m?fichaEscolheToken(m,fx.f,fx.toks||[]):null; })
    .then(function(eid){ return eid?api(cAPI("/fichas/"+fx.f.id+"/tokens"),{method:"POST",body:{mapa:mapa.id,elemento:Number(eid)}}):null; })
    .then(function(r){ if(r){ toast(Vm("token")+" ligado a "+fx.f.nome+".","ok"); fxCarregaTokens(fx); } })
    .catch(function(e){ toast(mensagemDeErro(e),"erro"); });
}
/* O icone e a imagem do token: a Biblioteca de imagens da campanha. O jogador nao envia pela Biblioteca, entao o arquivo dele sobe pela
   rota da propria ficha, com nome proprio (nunca troca a imagem de ninguem). */
function fichaEscolheImagem(f,atual){
  return escolherImagem(atual,{subir:function(arq){
    var fd=new FormData(); fd.append("arquivo",arq);
    return upload(cAPI("/fichas/"+f.id+"/imagem"),fd);
  }});
}
/* Em que mapa: o mestre escolhe entre todos; o jogador so tem o ativo. Um so, sem perguntar. */
function fichaEscolheMapa(){
  var ms=[];
  return api(cAPI("/mapas")).then(function(l){
    ms=Array.isArray(l)?l:[];
    if(!ms.length){ toast(GM?"Nenhum "+vmin("mapa")+" nesta "+vmin("campanha")+" ainda.":"Nenhum "+vmin("mapa")+" aberto agora.","aviso"); return null; }
    if(ms.length===1){ return ms[0].id; }
    return mpEscolhe("Em qual "+vmin("mapa"),ms.map(function(m){ return {id:m.id,nome:m.nome,sub:m.ativo?"os "+vmin("jogadores")+" veem agora":"",img:""}; }),"");
  }).then(function(id){ return id==null?null:ms.find(function(m){ return String(m.id)===String(id); })||null; });
}
/* Que token ligar: o mestre ve todos os do mapa; o jogador, os que ele controla. Os que ja sao desta ficha nao entram. */
function fichaEscolheToken(m,f,jaLigados){
  return api(cAPI("/mapas/"+m.id)).then(function(r){
    var ja={}; jaLigados.forEach(function(t){ ja[String(t.id)]=1; });
    var ts=(r?.elementos||[]).filter(function(e){ return e.tipo==="TOKEN"&&!ja[String(e.id)]&&(GM||e.meu); });
    return mpEscolhe("Ligar a "+f.nome,ts.map(function(e){ var d=e.dados||{};
      return {id:e.id,nome:d.nome||Vm("token"),sub:GM&&d.fichaId!=null?"ligado a outra "+vmin("ficha"):(e.visivel===false?"oculto":""),img:d.img?IMG(d.img,"mini"):""}; }),
      GM?"Nenhum "+vmin("token")+" para ligar neste "+vmin("mapa")+".":"Você não controla nenhum "+vmin("token")+" neste "+vmin("mapa")+".");
  });
}

/* ---- importar ficha de PDF ----
   Primeiro os campos de formulario do PDF (ficha preenchivel entrega rotulo e valor prontos),
   depois o texto das paginas. Com IA configurada ela organiza; sem, a montagem e local. */
/* um campo de formulario do PDF: rotulo e valor; caixa desmarcada e campo vazio nao entram */
function fichaCampoDoWidget(a){
  if(a.subtype!=="Widget"||!a.fieldName){ return null; }
  var v=a.fieldValue;
  if(a.checkBox||a.radioButton){
    if(!v||v==="Off"){ return null; }
    if(a.radioButton&&a.buttonValue!=null&&v!==a.buttonValue){ return null; }
    v=a.checkBox?"1":String(v);
  }
  if(Array.isArray(v)){ v=v.join(", "); }
  v=String(v??"").trim();
  var rot=String(a.alternativeText||a.fieldName).replace(/[_.[\]]+/g," ").replace(/\s+/g," ").trim();
  return v&&rot?{rot:rot.slice(0,80),val:v,ck:!!a.checkBox}:null;
}
/* o texto da pagina em linhas: o que esta na mesma altura (em passos de 3 pt) vira uma linha, da esquerda para a direita */
function fichaLinhasDoTexto(itens){
  var ys={};
  itens.forEach(function(it){
    if(!it.str?.trim()){ return; }
    var y=Math.round(it.transform[5]/3);
    if(!ys[y]){ ys[y]=[]; }
    ys[y].push(it);
  });
  return Object.keys(ys).map(Number).sort(function(a,b){ return b-a; }).map(function(y){
    return ys[y].sort(function(a,b){ return a.transform[4]-b.transform[4]; }).map(function(it){ return it.str; }).join(" ").replace(/\s+/g," ").trim();
  });
}
function fichaLePagina(doc,i,acc){
  return doc.getPage(i).then(function(p){
    return Promise.all([p.getAnnotations().catch(function(){ return []; }),p.getTextContent().catch(function(){ return {items:[]}; })]);
  }).then(function(r){
    r[0].forEach(function(a){ var c=fichaCampoDoWidget(a); if(c){ acc.campos.push(c); } });
    fichaLinhasDoTexto(r[1].items).forEach(function(l){ acc.linhas.push(l); });
  });
}
function lerPdfFicha(arq){
  return Promise.all([arq.arrayBuffer(),carregaPdfjs()]).then(function(r){ return r[1].getDocument({data:r[0]}).promise; }).then(function(doc){
    var acc={campos:[],linhas:[],doc:doc}, n=Math.min(doc.numPages,8), ch=Promise.resolve();
    for(var i=1;i<=n;i++){ ch=ch.then(fichaLePagina.bind(null,doc,i,acc)); }
    return ch.then(function(){ return acc; });
  });
}
/* uma pagina do PDF desenhada em JPEG, so o base64, para a IA ler */
function fichaPaginaEmJpeg(doc,k,out){
  var cv=document.createElement("canvas");
  return doc.getPage(k).then(function(p){
    var v1=p.getViewport({scale:1}), vp=p.getViewport({scale:Math.min(2.5,1500/v1.width)});
    cv.width=Math.round(vp.width); cv.height=Math.round(vp.height);
    var cx=cv.getContext("2d"); cx.fillStyle="#fff"; cx.fillRect(0,0,cv.width,cv.height);
    return p.render({canvasContext:cx,viewport:vp}).promise;
  }).then(function(){ out.push(cv.toDataURL("image/jpeg",0.82).split(",")[1]); });
}
function paginasEmImagem(doc,max){
  var out=[], ch=Promise.resolve(), n=Math.min(doc.numPages,max||3);
  for(var i=1;i<=n;i++){ ch=ch.then(fichaPaginaEmJpeg.bind(null,doc,i,out)); }
  return ch.then(function(){ return out; });
}
/* o tipo pelo jeito do valor: "7/10" e barra, numero curto e numero, texto comprido e area */
function fichaTipoDoValor(b){
  var bar=/^(-?\d+)\s*\/\s*(\d+)$/.exec(b.val);
  if(b.ck){ return {tipo:"check",val:b.val,max:""}; }
  if(bar){ return {tipo:"barra",val:bar[1],max:bar[2]}; }
  if(/^[+-]?\d{1,4}$/.test(b.val)){ return {tipo:"num",val:b.val,max:""}; }
  return {tipo:b.val.length>70||b.val.includes("\n")?"area":"texto",val:b.val,max:""};
}
function fichaDoLido(lido,nomeArq){
  var secDe={}; fichaModelo().forEach(function(m){ secDe[norm(m.rot)]=m; });
  var bruto=lido.campos.slice();
  if(!bruto.length){ lido.linhas.forEach(function(l){ var m=/^(.{2,40}?)\s*:\s*(.{1,400})$/.exec(l); if(m){ bruto.push({rot:m[1].trim(),val:m[2].trim()}); } }); }
  var nome="", campos=[];
  bruto.slice(0,200).forEach(function(b){
    if(!nome&&/^(nome|name|personagem|character)\b/i.test(b.rot)&&b.val.length<80){ nome=b.val; return; }
    var m=secDe[norm(b.rot)], t=fichaTipoDoValor(b);
    campos.push(fichaCampoLimpo({sec:m?m.sec:"Importado do PDF",rot:b.rot,tipo:t.tipo,val:t.val,max:t.max}));
  });
  return {nome:nome||String(nomeArq||"Ficha importada").replace(/\.pdf$/i,""),campos:campos};
}
function fichaDaIa(r){
  var o=typeof r==="string"?JSON.parse(r):r;
  return {nome:String(o.nome||"").trim(),campos:(o.campos||[]).map(fichaCampoLimpo).filter(function(x){ return x.rot; })};
}
/* Ler o PDF e pedir a IA demora: tudo corre numa tarefa (tarefaLonga), que no fim diz o que saiu.
   Cada passo devolve {msg, tipo, ficha}; a ficha nova abre para conferir quando a pessoa da Ok. */
function fimFicha(msg,tipo,ficha){ return {msg:msg,tipo:tipo||"aviso",ficha:ficha||null}; }
/* PDF que e so imagem (escaneado, ou ficha que e toda arte): as paginas vao desenhadas para a IA,
   que le o que esta impresso. Sem IA neste servidor nao ha como ler. */
function importarFichaImagem(lido,arq,h){
  if(!IACFG){ return Promise.resolve(fimFicha("Esse PDF é só imagem. Para ler ficha escaneada ou desenhada, a IA precisa estar configurada.","erro")); }
  h.passo("O PDF é só imagem: desenhando as páginas para a IA…",null);
  var lida=null;
  return paginasEmImagem(lido.doc,3)
    .then(function(imgs){ h.passo("A IA está lendo as páginas…",null); return api(cAPI("/fichas/importar"),{method:"POST",body:{texto:"",imagens:imgs}}); })
    .then(function(r){
      lida=fichaDaIa(r);
      if(!lida.campos.length){ return null; }
      h.passo("Criando a "+vmin("ficha")+"…",null);
      return criaFicha(lida.nome||String(arq.name||"Ficha").replace(/\.pdf$/i,""),lida.campos,false);
    })
    .then(function(fi){
      if(!lida.campos.length){ return fimFicha("A IA não achou campos nessa ficha."); }
      if(!fi){ return fimFicha("Não deu para criar a ficha.","erro"); }
      var vazios=lida.campos.filter(function(x){ return !x.val; }).length;
      return fimFicha("A IA leu "+lida.campos.length+" campos"+(vazios===lida.campos.length?" (ficha em branco: preencha os valores)":"")+". Confira e ajuste.","ok",fi);
    })
    .catch(function(e){ return fimFicha("A IA não conseguiu ler a imagem"+(e?.message?": "+e.message:""),"erro"); });
}
/* PDF com texto: com IA ela organiza os campos; sem IA, ou se ela falhar, vale a montagem local */
function fichaMontada(lido,arq,h){
  var local=fichaDoLido(lido,arq.name);
  if(!IACFG){ return Promise.resolve(local); }
  h.passo("A IA está organizando os campos…",null);
  var texto=(lido.campos.map(function(c){ return c.rot+": "+c.val; }).join("\n")+"\n--- TEXTO DAS PAGINAS ---\n"+lido.linhas.join("\n")).slice(0,40000);
  return api(cAPI("/fichas/importar"),{method:"POST",body:{texto:texto}}).then(function(r){
    var fi=fichaDaIa(r);
    if(!fi.campos.length){ throw new Error("vazio"); }
    return {nome:fi.nome||local.nome,campos:fi.campos};
  }).catch(function(){ local.semIa=true; return local; });
}
function importarFichaTexto(lido,arq,h){
  var fi=null;
  return fichaMontada(lido,arq,h).then(function(x){
    fi=x;
    if(!fi.campos.length){ return null; }
    h.passo("Criando a "+vmin("ficha")+"…",null);
    return criaFicha(fi.nome,fi.campos,false);
  }).then(function(f){
    if(!fi.campos.length){ return fimFicha("Li o PDF, mas não achei campos com rótulo e valor."); }
    if(!f){ return fimFicha("Não deu para criar a ficha.","erro"); }
    return fimFicha((fi.semIa?"A IA não respondeu; montei a ficha só com a leitura do PDF. ":"")+"Li "+fi.campos.length+" campos do PDF. Confira e ajuste.",fi.semIa?"aviso":"ok",f);
  });
}
function importarFichaPdf(arq){
  var h=tarefaLonga("Importando a "+vmin("ficha"),"Lendo "+arq.name+"…");
  void lerPdfFicha(arq).then(function(lido){
    var semTexto=!lido.campos.length&&lido.linhas.join("").replace(/\s/g,"").length<20;
    return semTexto?importarFichaImagem(lido,arq,h):importarFichaTexto(lido,arq,h);
  }).catch(function(e){ return fimFicha("Não consegui ler esse PDF"+(e?.message?": "+e.message:""),"erro"); })
    .then(function(r){ h.fim(r.msg,r.tipo,null,r.ficha?function(){ abrirFicha(r.ficha,{editar:true}); }:null); });
}
