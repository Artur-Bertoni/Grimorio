/* Fichas de personagem e importacao de PDF. */
"use strict";

/* ---------- FICHAS ----------
   Os campos sao da campanha (MESA.fichaModelo), nunca de um sistema. A ficha e uma lista
   plana de campos com a secao escrita em cada um: e o que o formulario de grupo sabe editar. */
var FICHAS=[], fichaT={};
var FICHA_TIPOS=[["texto","Texto curto"],["num","Número (clicar rola)"],["barra","Barra (atual / máximo)"],["area","Texto longo"],["check","Caixa de marcar"]];
var FICHA_PADRAO=[{sec:"Identidade",rot:"Conceito",tipo:"texto"},{sec:"Identidade",rot:"Jogador",tipo:"texto"},
  {sec:"Recursos",rot:"Vida",tipo:"barra"},{sec:"Recursos",rot:"Energia",tipo:"barra"},
  {sec:"Atributos",rot:"Atributo",tipo:"num"},{sec:"Perícias",rot:"Perícia",tipo:"num"},
  {sec:"Equipamento",rot:"Itens",tipo:"area"},{sec:"Anotações",rot:"Notas",tipo:"area"}];
function fichaModelo(){ return (Array.isArray(MESA.fichaModelo)&&MESA.fichaModelo.length)?MESA.fichaModelo:FICHA_PADRAO; }
function fichaFormula(){ return typeof MESA.fichaFormula==="string"?MESA.fichaFormula:"1d20+{v}"; }
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
function carregaFichas(){ return api(cAPI("/fichas")).then(function(l){ FICHAS=Array.isArray(l)?l:[]; return FICHAS; }); }
function fichasSecHtml(){
  return htmlDe("t-fichas",{mestre:GM,ia:!!IACFG});
}
function fichaInicial(nome){ return String(nome||"").trim().charAt(0).toUpperCase()||"?"; }
/* o icone da ficha; sem ele, a imagem do token dela e, sem as duas, a de um token ligado a ela num mapa (tokenImg) */
function fichaIcone(f){
  var c=fichaDados(f), p=c.img||c.token;
  if(p){ return IMG(p,"mini"); }
  return f.tokenImg?IMG(f.tokenImg,"mini"):"";
}
function pintaFichas(){
  var box=$("#fxList"); if(!box){ return; }
  box.innerHTML=htmlDe("t-fichas-lista",{fichas:FICHAS.map(function(f){ var c=fichaDados(f);
    return {id:f.id,nome:f.nome,dono:GM&&!f.minha?f.dono:"",campos:c.campos.length,img:fichaIcone(f),inicial:fichaInicial(f.nome),
      barras:c.campos.filter(function(x){ return x.tipo==="barra"&&x.max; }).slice(0,2)}; })});
  $$("[data-ficha]",box).forEach(function(b){ b.onclick=function(){
    abrirFicha(FICHAS.find(function(f){ return String(f.id)===b.dataset.ficha; })); }; });
}
function ligarFichas(){
  carregaFichas().then(pintaFichas).catch(function(){ var b=$("#fxList"); if(b){ b.innerHTML=htmlDe("t-vazio",{texto:"Não consegui ler as fichas."}); } });
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
/* editar: a ficha nova abre ja no modo edicao, com o nome selecionado para trocar */
function criaFicha(nome,campos,editar){
  return api(cAPI("/fichas"),{method:"POST",body:{nome:nome,json:JSON.stringify({campos:campos})}}).then(function(f){
    FICHAS.push(f); pintaFichas(); if(editar){ abrirFicha(f,{editar:true}); } return f; })
   .catch(function(e){ toast(e?.message||"não deu para criar a ficha"); });
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
    {k:"formula",rot:"Rolagem ao clicar num número",dica:"{v} vira o valor do campo. Ex.: 1d20+{v}. Deixe vazio para o clique não rolar nada."},
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
    g.push({x:x,i:i,k:g.length,pc:mx>0?Math.max(0,Math.min(100,v/mx*100)):0});
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
  var fo=fichaFormula();
  if(!fo){ return; }
  var n=Number.parseInt(String(x.val).replace(/[^\d+-]/g,""),10)||0;
  abrirDados({formula:fo.replaceAll("{v}",(n<0?"-":"")+Math.abs(n)).replaceAll("+-","-"),rotulo:x.rot+" · "+nome,auto:true});
}

/* ---------- ficha aberta ----------
   A propria ficha e onde se edita: o lapis do topo liga o modo edicao, em que cada valor, rotulo e secao vira campo
   no lugar, com "+ Campo", "+ Seção", remover e arrastar. Fora dele a ficha e de jogo. Tudo grava sozinho.
   fx e a ficha aberta: {f, c (os dados), ed, toks (tokens ligados; null enquanto carrega), ov, corpo, fecha}. */
function abrirFicha(f,o){
  if(!f){ return; }
  var ov=overlay(f.nome,"",{wide:true,cls:"fichasheet",head:htmlDe("t-ficha-cabeca",{mestre:GM})});
  var fx={f:f,c:fichaDados(f),ed:!!o?.editar,toks:null,ov:ov,corpo:el("div",{id:"fxBody"}),fecha:ov.close};
  $(".sbodyscroll",ov).appendChild(fx.corpo);
  ov.close=function(){ gravaFichaPendente(f); pintaFichas(); fx.fecha(); };
  var fm=$("#fxMod",ov);
  if(fm){ fm.onclick=function(){ fxViraModelo(fx); }; }
  $("#fxEd",ov).onclick=function(){ fx.ed=!fx.ed; fxPinta(fx); if(fx.ed){ focar($("#fxNome",ov)); } };
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
/* arrastar: as secoes entre si e cada campo dentro do seu grupo (data-p: indice da secao + r ou n) */
function fxOrdem(fx,lista){
  if(!fx.ed){ return null; }
  if(lista.dataset.ordena==="fxsec"){ return function(l,de,para){ if(fichaMoveSecao(fx.c,de,para)){ fxRefaz(fx); } }; }
  if(lista.dataset.ordena!=="fxcampo"){ return null; }
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
  var antes=JSON.stringify(fx.c.campos);
  tira(); fxRefaz(fx);
  toastAcao(msg,"Desfazer",function(){ fx.c.campos=JSON.parse(antes); fxRefaz(fx); toast("Desfeito","ok"); });
}
function fxTokensHtml(fx){
  if(!fx.toks){ return htmlDe("t-ficha-tokens",{carregando:true,itens:[]}); }
  return htmlDe("t-ficha-tokens",{carregando:false,itens:fx.toks.map(function(t){
    return {id:t.id,nome:t.nome||fx.f.nome,img:t.img?IMG(t.img,"mini"):"",
      onde:t.mapaNome?(Vm("mapa")+" "+t.mapaNome+(t.ativo?" (ativo)":"")):"Em outro "+vmin("mapa"),
      oculto:GM&&!t.visivel,solto:!t.vinculo,podeSoltar:!!t.podeSoltar}; })});
}
function fxPinta(fx){
  var f=fx.f, c=fx.c, ov=fx.ov, b=$("#fxEd",ov);
  if(!document.body.contains(ov)){ return; }
  ov.querySelector(".stit").textContent=f.nome+(GM&&!f.minha?" · "+f.dono:"");
  var rot=fx.ed?"Terminar de editar":"Editar a ficha";
  b.setAttribute("aria-pressed",String(fx.ed)); b.title=rot; b.setAttribute("aria-label",rot);
  ov.classList.toggle("fxeditando",fx.ed);
  fx.corpo.innerHTML=htmlDe("t-ficha-corpo",{ed:fx.ed,rola:!!fichaFormula(),nome:f.nome,dono:GM&&!f.minha?f.dono:"",
    img:fichaIcone(f),proprio:!!c.img,tokenImg:(c.token||c.img)?IMG(c.token||c.img,"mini"):"",tokenProprio:!!c.token,inicial:fichaInicial(f.nome),visao:c.visao==null?"":String(c.visao),
    mapa:!mapaBloqueado(),tokens:fxTokensHtml(fx),secoes:fichaSecoes(c)});
  fxLigaJogo(fx); fxLigaTokens(fx);
  if(fx.ed){ fxLigaIdentidade(fx); fxLigaValores(fx); fxLigaSecoes(fx); fxLigaCampos(fx); }
}
/* fora do modo edicao: barra com + e -, caixa de marcar e numero que rola */
function fxLigaJogo(fx){
  var c=fx.c;
  $$("[data-fb]",fx.corpo).forEach(function(bt){ bt.onclick=function(e){
    fichaPasso(c.campos[+bt.dataset.fb],(+bt.dataset.d)*(e.shiftKey?5:1)); gravaFicha(fx.f); fxPinta(fx); }; });
  $$("[data-fc]",fx.corpo).forEach(function(ck){ ck.onchange=function(){ c.campos[+ck.dataset.fc].val=ck.checked?"1":""; gravaFicha(fx.f); }; });
  $$("[data-fn]",fx.corpo).forEach(function(bt){ bt.onclick=function(){ fichaRola(c.campos[+bt.dataset.fn],fx.f.nome); }; });
}
/* nome, alcance da visao, icone e apagar */
function fxLigaIdentidade(fx){
  var f=fx.f, c=fx.c, corpo=fx.corpo, nome=$("#fxNome",corpo), vis=$("#fxVisao",corpo), icx=$("#fxIconeX",corpo);
  nome.oninput=function(){ f.nome=nome.value.trim()||"Sem nome"; fx.ov.querySelector(".stit").textContent=f.nome; gravaFicha(f); };
  vis.oninput=function(){ if(vis.value===""){ delete c.visao; } else { c.visao=Math.min(100,Math.max(0,Number(vis.value)||0)); } gravaFicha(f); };
  $("#fxIcone",corpo).onclick=function(){ fichaEscolheImagem(f,c.img||"").then(function(r){ fxIcone(fx,r); }); };
  if(icx){ icx.onclick=function(){ fxIcone(fx,""); }; }
  $("#fxApaga",corpo).onclick=function(){ apagaFicha(f,fx.fecha); };
}
/* r: o caminho escolhido, "" para tirar, null quando a pessoa fechou sem escolher */
function fxIcone(fx,r){
  if(r==null){ return; }
  if(r){ fx.c.img=r; } else { delete fx.c.img; }
  fxRefaz(fx,"#fxIcone");
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
    if(s){ fxTira(fx,"Seção "+s.nome+" removida",function(){ c.campos=c.campos.filter(function(x){ return !fichaDaSecao(x,s.nome); }); }); } }; });
  $("#fxAddSec",fx.corpo).onclick=function(){
    var nomes=fichaSecoes(c).map(function(s){ return s.nome; }), n="Nova seção", k=2;
    while(nomes.includes(n)){ n="Nova seção "+(k++); }
    c.campos.push({sec:n,rot:"",tipo:"texto",val:"",max:""});
    fxRefaz(fx,'[data-fs="'+nomes.length+'"]'); };
}
function fxRenomeiaSecao(fx,si,novo){
  var c=fx.c, s=fichaSecoes(c)[si];
  if(!s||novo===s.nome){ return; }
  c.campos.forEach(function(x){ if(fichaDaSecao(x,s.nome)){ x.sec=novo; } });
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
  if(antes===f.tokenImg||fx.c.img||!av){ return; }
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
  $("#fxTokImg",fx.corpo).onclick=function(){ fichaEscolheImagem(fx.f,fx.c.token||"").then(function(r){ fxImagemToken(fx,r); }); };
  var x=$("#fxTokImgX",fx.corpo);
  if(x){ x.onclick=function(){ fxImagemToken(fx,""); }; }
  por.onclick=function(){ fxPorToken(fx); };
  liga.onclick=function(){ fxLigaToken(fx); };
}
/* r: o caminho escolhido, "" para tirar, null quando fechou sem escolher. Grava na hora: o servidor passa a imagem
   para os tokens ligados, e a lista deles e relida depois. */
function fxImagemToken(fx,r){
  if(r==null){ return; }
  if(r){ fx.c.token=r; } else { delete fx.c.token; }
  fxPinta(fx);
  focar($("#fxTokImg",fx.corpo));
  Promise.resolve(gravaFicha(fx.f,true)).then(function(){ fxCarregaTokens(fx); });
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
/* PDF que e so imagem (escaneado, ou ficha que e toda arte): as paginas vao desenhadas para a IA,
   que le o que esta impresso. Sem IA neste servidor nao ha como ler. */
function importarFichaImagem(lido,arq){
  if(!IACFG){ toast("Esse PDF é só imagem. Para ler ficha escaneada ou desenhada, a IA precisa estar configurada."); return Promise.resolve(); }
  toast("O PDF é só imagem: a IA está lendo as páginas…");
  var lida=null;
  return paginasEmImagem(lido.doc,3)
    .then(function(imgs){ return api(cAPI("/fichas/importar"),{method:"POST",body:{texto:"",imagens:imgs}}); })
    .then(function(r){
      lida=fichaDaIa(r);
      if(!lida.campos.length){ toast("A IA não achou campos nessa ficha."); return null; }
      return criaFicha(lida.nome||String(arq.name||"Ficha").replace(/\.pdf$/i,""),lida.campos,true);
    })
    .then(function(f){
      if(!f){ return; }
      var vazios=lida.campos.filter(function(x){ return !x.val; }).length;
      toast("A IA leu "+lida.campos.length+" campos"+(vazios===lida.campos.length?" (ficha em branco: preencha os valores)":"")+". Confira e ajuste.");
    })
    .catch(function(e){ toast("A IA não conseguiu ler a imagem"+(e?.message?": "+e.message:"")); });
}
/* PDF com texto: com IA ela organiza os campos; sem IA, ou se ela falhar, vale a montagem local */
function fichaMontada(lido,arq){
  var local=fichaDoLido(lido,arq.name);
  if(!IACFG){ return Promise.resolve(local); }
  var texto=(lido.campos.map(function(c){ return c.rot+": "+c.val; }).join("\n")+"\n--- TEXTO DAS PAGINAS ---\n"+lido.linhas.join("\n")).slice(0,40000);
  return api(cAPI("/fichas/importar"),{method:"POST",body:{texto:texto}}).then(function(r){
    var fi=fichaDaIa(r);
    if(!fi.campos.length){ throw new Error("vazio"); }
    return {nome:fi.nome||local.nome,campos:fi.campos};
  }).catch(function(){ toast("A IA não respondeu; montei a ficha só com a leitura do PDF."); return local; });
}
function importarFichaTexto(lido,arq){
  var fi=null;
  return fichaMontada(lido,arq).then(function(x){
    fi=x;
    if(!fi.campos.length){ toast("Li o PDF, mas não achei campos com rótulo e valor."); return null; }
    return criaFicha(fi.nome,fi.campos,true);
  }).then(function(f){ if(f){ toast("Li "+fi.campos.length+" campos do PDF. Confira e ajuste."); } });
}
function importarFichaPdf(arq){
  toast("Lendo o PDF…");
  lerPdfFicha(arq).then(function(lido){
    var semTexto=!lido.campos.length&&lido.linhas.join("").replace(/\s/g,"").length<20;
    return semTexto?importarFichaImagem(lido,arq):importarFichaTexto(lido,arq);
  }).catch(function(e){ toast("Não consegui ler esse PDF"+(e?.message?": "+e.message:"")); });
}
