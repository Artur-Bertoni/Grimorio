/* Tabletop: a tela do Mapa, o painel e os formularios de mapa e de token. */
"use strict";

/* painel aberto de saida na tela larga; no celular ele cobre o mapa, entao comeca fechado */
function mpPainelAberto(){
  if(MP.painel==null){ MP.painel=window.innerWidth>=900; }
  return MP.painel;
}
/* A iniciativa mora numa sessao do guia. O mestre mexe nela aqui, na sessao que estava aberta (ou
   na mais recente); o jogador ve o espelho que vai para a mesa. */
function mpSessaoIni(){ return GM?(curSess()||D.sessoes[D.sessoes.length-1]||null):null; }
function viewMapa(){
  if(mapaBloqueado()){ return htmlDe("t-mapa-wip",{}); }
  var m=MP.mapa, si=mpSessaoIni();
  return htmlDe("t-mapa",{ini:GM?(si?iniHtml(si):""):iniPubHtml(),iniBotao:!!si,iniAberta:!!si&&!!(S.ini||iniDe(si).lista.length),gm:GM,carregado:MP.carregado,espera:MP.carregado?"":htmlDe("t-carregando-sm",{texto:""}),tem:!!m,nome:m?.nome||"",ativo:!!m?.ativo,cena:GM?mpRotuloCena(mpCenaLigada(m)):"",
    painel:mpPainelAberto(),reguaModo:MP.reguaModo,ferr:MP.ferramenta,desAberto:!!MP.flyDes,desAtiva:MP_FORMAS.includes(MP.ferramenta),enquadre:mpVista().modo||"preenche",nTokens:MP.els.filter(function(e){ return e.tipo==="TOKEN"; }).length});
}
function hydrateMapa(v){
  if(mapaBloqueado()){ return; }
  mpLiga();
  var si=mpSessaoIni(); if(si){ iniLigar(v,si); }
  if(!MP.carregado&&!MP.carregando){ mpSincroniza(); }
  var w=$("#mpWrap",v);
  if(w){ mpMotor(w); mpPintaPainel(); }
  var bp=$("#mpPainelBtn",v);
  if(bp){ bp.onclick=function(){
    MP.painel=!mpPainelAberto();
    $("#mpPainel",v).hidden=!MP.painel;
    bp.classList.toggle("on",MP.painel); bp.setAttribute("aria-pressed",String(MP.painel));
  }; }
  mpLigaAcoes(v);
  var bc=$("#mpCena",v); if(bc){ bc.onclick=function(){ mpAbreCenaLigada(); }; }
  var be=$("#mpEd",v); if(be){ be.onclick=function(){ mpEditaMapa(); }; }
  var bt=$("#mpToken",v); if(bt){ bt.onclick=function(){ mpNovoToken(bt); }; }
  var ba=$("#mpAtiva",v); if(ba){ ba.onclick=function(){ mpAtiva(MP.id,!MP.mapa?.ativo); }; }
  var bn=$("#mpNovo",v); if(bn){ bn.onclick=function(){ mpNovoMapa(); }; }
  $$("[data-mpf]",v).forEach(function(b){ b.onclick=function(){
    var f=b.dataset.mpf;
    if(f==="area"){ mpMenuArea(b); return; }
    if(f==="desenho"){ mpGavetaDesenho(!MP.flyDes); return; }
    mpFerramenta(MP.ferramenta===f?"mover":f);
  }; });
  $$("[data-mp-rmodo]",v).forEach(function(b){ b.onclick=function(){ mpReguaModo(b.dataset.mpRmodo); }; });
  var bat=$("#mpAtalhos",v); if(bat){ bat.onclick=function(){ mpMostraAtalhos(); }; }
  var bd=$("#mpDesfaz",v); if(bd){ bd.onclick=function(){ mpDesfaz(); }; }
  $$("[data-mpz]",v).forEach(function(b){ b.onclick=function(){
    var k=b.dataset.mpz;
    if(k==="0"){ mpAlternaEnquadre(); return; }
    mpZoom(k==="+"?1.25:0.8,MPC.w/2,MPC.h/2);
  }; });
}

/* ---------- painel ---------- */
function mpItemToken(e){
  var d=e.dados||{};
  var desl=mpNum(d.desl,0), max=mpNum(d.vidaMax,0);
  return {id:e.id,nome:d.nome||Vm("token"),img:d.img?IMG(d.img,"mini"):"",oculto:e.visivel===false,meu:!!e.meu,
    sel:mpEhSel(e.id),daVez:!!e.daVez,trancado:GM&&mpTrancado(e),
    vida:max>0?mpFmt(mpNum(d.vida,0))+"/"+mpFmt(max):"",
    marcas:(Array.isArray(d.marcas)?d.marcas:[]).map(function(m){ return m.t; }),
    resta:desl>0?mpFmt(Math.max(0,desl-mpNum(d.usado,0)))+"/"+mpFmt(desl)+" "+mpUnidade():""};
}
function mpItemParede(e,i){
  var d=e.dados||{}, k=d.kind||"parede", rot=(MP_PAREDES.find(function(o){ return o[0]===k; })||MP_PAREDES[0])[1];
  return {id:e.id,nome:rot+" "+(i+1),sel:mpEhSel(e.id),trancado:mpTrancado(e),porta:k==="porta",aberta:!!d.aberta};
}
function mpItemArea(e,i){
  var d=e.dados||{}, f=d.forma==="traco"?"Pincel":(MP_FORMAS_FOG.find(function(o){ return o[0]===d.forma; })||MP_FORMAS_FOG[0])[1];
  return {id:e.id,nome:(d.revela?"Revela":"Cobre")+" · "+f.toLowerCase()+" "+(i+1),sel:mpEhSel(e.id),trancado:mpTrancado(e)};
}
var MP_NOME_FORMA={linha:"Linha",circulo:"Círculo",retangulo:"Retângulo",poligono:"Polígono",marca:"Marcação"};
function mpItemDesenho(e){
  var d=e.dados||{};
  return {id:e.id,nome:(MP_NOME_FORMA[d.forma]||"Desenho")+(d.rotulo?" · "+d.rotulo:""),sel:mpEhSel(e.id),trancado:mpTrancado(e),oculto:e.visivel===false};
}
function mpDadosDoPainel(){
  var sels=mpSelecionados(), tem=function(e){ return e.tipo==="DESENHO"; }, daCamada=function(e){ return e.tipo==="TOKEN"||e.tipo==="DESENHO"; };
  var paredes=MP.els.filter(function(e){ return e.tipo==="PAREDE"; }), areas=mpFogDoMapa();
  return {gm:GM,polling:mpModoTempoReal()==="polling",
    mapas:GM?MP.lista.map(function(m){ return {id:m.id,nome:m.nome,ativo:!!m.ativo,aberto:String(m.id)===String(MP.id)}; }):[],
    camadas:MP_CAMADAS.map(function(c){
      return {id:c,nome:mpCamadaNome(c),n:MP.els.filter(function(e){ return daCamada(e)&&mpCamadaDe(e)===c; }).length,oculta:mpCamadaOculta(c),trancada:mpCamadaTrancada(c)}; }),
    nSel:sels.length,tudoTrancado:sels.length>0&&sels.every(function(e){ return e.bloqueado; }),
    tudoVisivel:sels.every(function(e){ return e.visivel!==false; }),
    abre:mpSecoes(),cores:MP_CORES,estilo:MP.estilo,temArea:!!MP.area&&!!mpAreaForma(MP.area),
    desenhos:MP.els.filter(tem).map(mpItemDesenho),
    fog:mpFogModo(),fogMemoria:!!MP.mapa?.regras?.fogMemoria,visaoPadrao:mpVisaoPadraoDoMapa(),fogModos:MP_FOG_MODOS,pincel:mpPincel(),pontas:MP_PONTAS,fogFormas:MP_FORMAS_FOG,fogForma:MP.fogForma,fogRevela:MP.fogRevela!==false,comoJogador:MP.comoJogador,
    paredeKinds:MP_PAREDES,paredeKind:MP.paredeKind,paredes:paredes.map(mpItemParede),areas:areas.map(mpItemArea),
    tokens:MP.els.filter(function(e){ return e.tipo==="TOKEN"&&!mpOculto(e); }).map(mpItemToken)};
}
/* O que se usa menos fica no menu "Mais" da barra do topo: historico, novo turno, seguir a vez e os atalhos.
   O Desfazer mora nas ferramentas do canvas (e no Ctrl+Z). */
function mpLigaAcoes(v){
  var bm=$("#mpMais",v); if(bm){ bm.onclick=function(){ mpMenuMais(bm); }; }
}
function mpMenuMais(b){
  var segue=mpSegueVez(), itens=[{v:"hist",rot:"Histórico",dica:GM?"Tudo o que foi feito, e desfazer":"O que você fez, e desfazer",perigo:false,desligado:false}];
  if(GM){ itens.unshift({v:"encaixe",rot:mpEncaixando()?"Encaixar na grade: ligado":"Encaixar na grade: desligado",dica:"Vale para todos ao soltar; Alt inverte só para você",perigo:false,desligado:false}); }
  if(GM){ itens.push({v:"turno",rot:"Novo "+vmin("turno"),dica:"Zera o deslocamento gasto de todos",perigo:false,desligado:false}); }
  itens.push({v:"segue",rot:segue?"Parar de seguir a vez":"Seguir a vez",dica:"A tela vai até o "+vmin("token")+" de quem tem a vez",perigo:false,desligado:false});
  itens.push({v:"atalhos",rot:"Atalhos e gestos",dica:"Tecla ?",perigo:false,desligado:false});
  menuSolto(b,htmlDe("t-menu",{titulo:"Mais ações do "+vmin("mapa"),itens:itens}),function(i){
    var v=i.dataset.v;
    if(v==="encaixe"){ mpTrocaEncaixe(); }
    else if(v==="hist"){ mpAbreHistorico(); }
    else if(v==="turno"){ mpNovoTurnoDaTela(); }
    else if(v==="segue"){ mpAlternaSegueVez(); }
    else if(v==="atalhos"){ mpMostraAtalhos(); }
  });
}
/* Encaixar na grade e do mestre e vale para todos (regras.encaixe do mapa) */
function mpTrocaEncaixe(){
  var liga=!mpEncaixando();
  mpAlternaEncaixe().then(function(){ toast(liga?"Encaixe na grade: ligado para todos":"Posição livre: ligada para todos"); })
    .catch(function(){ /* o aviso ja saiu em mpGrava */ });
}
/* Com iniciativa em andamento, "novo turno" e avancar a propria iniciativa: o turno sobe, a vez volta
   ao primeiro e o servidor zera o gasto (o aviso chega pelo evento do mapa, a todos). Sem ela, so zera. */
function mpNovoTurnoDaTela(){
  var si=mpSessaoIni(), ini=si?iniDe(si):null;
  if(ini?.lista.length){ ini.rodada=(ini.rodada||1)+1; ini.vez=iniOrdem(ini)[0].id; som("vez"); iniMudou(si); }
  else { mpNovoTurno(); }
}
/* Seguir a vez: preferencia de cada pessoa, neste navegador */
function mpSegueVez(){ try{ return localStorage.getItem("grim_mapa_segue")==="1"; }catch(error_){ return false; } }
function mpAlternaSegueVez(){
  var liga=!mpSegueVez();
  try{ localStorage.setItem("grim_mapa_segue",liga?"1":"0"); }catch(error_){ /* vale ate recarregar */ }
  toast(liga?"A tela vai acompanhar quem tem a vez":"A tela não acompanha mais a vez","ok");
  if(liga){ MP.vezVista=null; mpSegueAVez(); }
}
/* Os atalhos do mapa numa janela, so os que valem para quem esta olhando */
function mpMostraAtalhos(){
  var t=vmin("token"), g=[{titulo:"Ver e mover",itens:[
    {teclas:["Arrastar"],faz:"Move o fundo; arrastar um "+t+" move o "+t},
    {teclas:["Roda"],faz:"Aproxima e afasta"},
    {teclas:["+","−"],faz:"Aproxima e afasta pelo meio da tela"},
    {teclas:["0"],faz:"Alterna entre preencher a tela e ver o "+vmin("mapa")+" inteiro"},
    {teclas:["←","↑","→","↓"],faz:"O "+t+" selecionado anda uma casa"},
    {teclas:["Ctrl","Z"],faz:"Desfaz a sua última ação"}]},
    {titulo:"Ferramentas",itens:[
    {teclas:["V"],faz:"Volta para mover"},
    {teclas:["R"],faz:"Régua (reta ou trajeto)"},
    {teclas:["A"],faz:"Medir área: cone, círculo, linha"},
    {teclas:["I"],faz:"Apontar um ponto para todos"},
    {teclas:["Esc"],faz:"Apaga a medida, o rascunho ou a seleção"}]}];
  if(GM){
    g[1].itens.splice(1,0,{teclas:["S"],faz:"Selecionar vários (Shift soma)"});
    g.push({titulo:"Só para o "+vmin("mestre"),itens:[
      {teclas:["L","O","B","P","M"],faz:"Linha, círculo, retângulo, polígono e marcação"},
      {teclas:["W"],faz:"Parede (um clique por ponto, Enter termina)"},
      {teclas:["N"],faz:"Área de névoa"},
      {teclas:["F"],faz:"Pincel de névoa"},
      {teclas:["]","["],faz:"Seleção para a frente ou para trás"},
      {teclas:["Ctrl","A"],faz:"Seleciona tudo"},
      {teclas:["Delete"],faz:"Remove a seleção"},
      {teclas:["Alt"],faz:"Segurado no arraste, inverte o encaixe na grade"}]});
  }
  g.push({titulo:"No toque",itens:[
    {teclas:["Um dedo"],faz:"Move o fundo ou o "+t},
    {teclas:["Dois dedos"],faz:"Aproximam e afastam"}]});
  overlay("Atalhos e gestos",htmlDe("t-mapa-atalhos",{grupos:g}),{wide:true});
}
/* O painel se refaz a cada token que muda (de qualquer pessoa): o foco de quem estava num
   botao dele volta para o mesmo botao. */
function mpPintaPainel(){
  var p=$("#mpPainel");
  if(!p){ return; }
  var a=document.activeElement, foco=p.contains(a)?seletorEstavel(a):null;
  p.innerHTML=htmlDe("t-mapa-painel",mpDadosDoPainel());
  if(foco){ var f=p.querySelector(foco); if(f){ f.focus({preventScroll:true}); } }
  $$("[data-mp-abre]",p).forEach(function(b){ b.onclick=function(){ mpAbrir(b.dataset.mpAbre); }; });
  $$("[data-mp-novo]",p).forEach(function(b){ b.onclick=function(){ mpNovoMapa(); }; });
  $$("[data-mp-sel]",p).forEach(function(b){ b.onclick=function(){
    var el=mpEl(b.dataset.mpSel); mpSelecionaIds(el?[el.id]:[]); mpCentraliza(el); mpPintaPainel(); }; });
  $$("[data-mp-ed]",p).forEach(function(b){ b.onclick=function(){
    var el=mpEl(b.dataset.mpEd);
    if(!el){ return; }
    if(el.tipo==="DESENHO"){ mpEditaDesenho(el); } else if(el.tipo==="PAREDE"){ mpEditaParede(el); } else if(el.tipo==="FOG"){ mpEditaFog(el); }
    else if(GM){ mpEditaToken(el); } else { mpEditaMeuToken(el); } }; });
  $$("[data-mp-porta]",p).forEach(function(b){ b.onclick=function(){ var el=mpEl(b.dataset.mpPorta); if(el){ mpAlternaPorta(el); } }; });
  $$("details[data-mp-sec]",p).forEach(function(d){ d.ontoggle=function(){ mpGuardaSecao(d.dataset.mpSec,d.open); }; });
  mpLigaPainelFormas(p);
}
/* Secoes do painel: quais estao abertas fica guardado neste navegador (por pessoa, nao por mapa). */
var MP_SECOES_PADRAO={mapas:true,camadas:false,sel:true,des:false,visao:false,pincel:false,paredes:false,areas:false,desenhos:false,tokens:true};
function mpSecoes(){
  var o={...MP_SECOES_PADRAO};
  try{ Object.assign(o,JSON.parse(localStorage.getItem("grim_mapa_secoes")||"{}")); }catch(error_){ /* sem armazenamento vale o padrao */ }
  return o;
}
function mpGuardaSecao(id,aberta){
  var o=mpSecoes(); if(o[id]===aberta){ return; }
  o[id]=aberta;
  try{ localStorage.setItem("grim_mapa_secoes",JSON.stringify(o)); }catch(error_){ /* a escolha vale so ate recarregar */ }
}
/* A gaveta das formas de desenho abre sob o botao Desenhar e fecha ao escolher uma forma. */
function mpGavetaDesenho(abre){
  MP.flyDes=abre;
  var g=$("#mpFlyout"), b=$("#mpDesBtn");
  if(g){ g.hidden=!abre; }
  if(b){ b.setAttribute("aria-expanded",String(abre)); }
}
/* camadas, selecao e estilo do desenho */
function mpLigaPainelFormas(p){
  $$("[data-mp-cvis]",p).forEach(function(b){ b.onclick=function(){
    var id=b.dataset.mpCvis; MP.ocultas[id]=!MP.ocultas[id]; mpDesenha(); mpPintaPainel(); }; });
  $$("[data-mp-ctr]",p).forEach(function(b){ b.onclick=function(){ mpTrancaCamada(b.dataset.mpCtr); }; });
  $$("[data-mp-sacao]",p).forEach(function(b){ b.onclick=function(){ mpAcaoSelecao(b.dataset.mpSacao); }; });
  $$("[data-mp-fixa]",p).forEach(function(b){ b.onclick=function(){ mpFixaArea(); }; });
  var sc=$("#mpSelCamada",p); if(sc){ sc.onchange=function(){ if(sc.value){ mpAcaoSelecao("camada",sc.value); } }; }
  var cor=$("#mpDesCor",p); if(cor){ cor.onchange=function(){ MP.estilo.cor=cor.value; }; }
  var esp=$("#mpDesEsp",p); if(esp){ esp.onchange=function(){ MP.estilo.esp=Math.min(12,Math.max(1,Math.round(Number(esp.value)||3))); esp.value=MP.estilo.esp; }; }
  var pre=$("#mpDesPre",p); if(pre){ pre.onchange=function(){ MP.estilo.preench=pre.checked?0.25:0; }; }
  var vis=$("#mpDesVis",p); if(vis){ vis.onchange=function(){ MP.estilo.vis=vis.checked; }; }
  mpLigaPainelVisao(p);
}
/* paredes e nevoa: o modo da nevoa vale para todos (fica no mapa); o resto e preferencia de quem desenha */
function mpLigaPainelVisao(p){
  var fm=$("#mpFogModo",p); if(fm){ fm.onchange=function(){ mpSalvaFog(fm.value); }; }
  var fme=$("#mpFogMemoria",p); if(fme){ fme.onchange=function(){ mpSalvaFog(null,{fogMemoria:fme.checked}); }; }
  var fes=$("#mpFogEsquece",p); if(fes){ fes.onclick=function(){
    confirmar("Todo mundo volta a ver só o que está no campo de visão, e o que já foi explorado some.",{titulo:"Esquecer o que foi explorado?",sim:"Esquecer"}).then(function(sim){
      if(sim){ mpSalvaFog(null,{fogMemoria:true,fogVer:(MP.mapa?.regras?.fogVer||0)+1}).then(function(){ toast("Explorado esquecido","ok"); }); } }); }; }
  var fvp=$("#mpVisaoPadrao",p); if(fvp){ fvp.onchange=function(){
    var n=Math.min(100,Math.max(1,Number(fvp.value)||MP_VISAO_PADRAO)); fvp.value=n; mpSalvaFog(null,{visaoPadrao:n}); }; }
  var fc=$("#mpFogComo",p); if(fc){ fc.onchange=function(){ MP.comoJogador=fc.checked; mpDesenha(); mpPintaPainel(); }; }
  var br=$("#mpFogRevela",p); if(br){ br.onclick=function(){ mpRevelaTudo(); }; }
  var bc=$("#mpFogCobre",p); if(bc){ bc.onclick=function(){ mpCobreTudo(); }; }
  var fa=$("#mpFogAcao",p); if(fa){ fa.onchange=function(){ MP.fogRevela=fa.value==="revela"; }; }
  var ff=$("#mpFogForma",p); if(ff){ ff.onchange=function(){ MP.fogForma=ff.value; }; }
  var pc=$("#mpPincelCasas",p); if(pc){ pc.onchange=function(){
    var n=Math.min(30,Math.max(0.25,Number(pc.value)||2)); pc.value=n; mpPincel().casas=n; mpDesenha(); }; }
  var pp=$("#mpPincelPonta",p); if(pp){ pp.onchange=function(){ mpPincel().ponta=pp.value; mpDesenha(); }; }
  var ps=$("#mpPincelBorda",p); if(ps){ ps.onchange=function(){ mpPincel().suave=ps.value==="macia"; }; }
  var pk=$("#mpParedeKind",p); if(pk){ pk.onchange=function(){ MP.paredeKind=pk.value; }; }
}
/* Trancar a camada vale para todos e fica no mapa: ninguem mexe no que esta nela ate destrancar. */
function mpTrancaCamada(id){
  var r=MP.mapa?.regras||{}, t=(r.trancadas||[]).slice(), i=t.indexOf(id);
  if(i>=0){ t.splice(i,1); } else { t.push(id); }
  mpSalvaMapa({regras:{quem:r.quem,limite:r.limite,trancadas:t}}).catch(function(){ /* o aviso ja saiu em mpGrava */ });
}
/* A regua mede de duas maneiras, escolhidas na hora: em linha reta (arrasta de um ponto a outro) ou pelo
   caminho (um clique por ponto; Enter ou duplo clique termina). */
function mpReguaModo(modo){
  MP.reguaModo=modo; MP.regua=null;
  $$("[data-mp-rmodo]").forEach(function(b){ var on=b.dataset.mpRmodo===modo; b.classList.toggle("on",on); b.setAttribute("aria-pressed",String(on)); });
  mpDesenha();
}
function mpMenuArea(ancora){
  var op=function(v,rot,dica){ return {v:v,rot:rot,dica:dica,perigo:false,desligado:false}; };
  menuSolto(ancora,htmlDe("t-menu",{titulo:"Medir uma área",itens:[
    op("a-cone","Cone","A largura no fim é igual ao comprimento"),
    op("a-circulo","Círculo","Do centro até onde você arrastar"),
    op("a-linha","Linha","Uma casa de largura")]}),
  function(it){ MP.areaTipo=it.dataset.v; mpFerramenta(it.dataset.v); });
}

/* ---------- mapa ---------- */
function mpNovoMapa(){
  formulario("Novo "+vmin("mapa"),[
    {k:"nome",rot:"Nome",obrig:true,ph:"Taverna, masmorra, cidade…"},
    {k:"imagem",rot:"Imagem do "+vmin("mapa"),tipo:"img",dica:"Sem imagem, o "+vmin("mapa")+" nasce em branco, com 30 por 20 casas."}
  ],{nome:"",imagem:""},{rotSalvar:"Criar",salvar:function(c){
    mpCriaMapa({nome:c.nome,imagem:c.imagem||""}).catch(function(){ /* o aviso ja saiu em mpGrava */ });
  }});
}
function mpOpcoesCena(){
  var ops=[["","Nenhuma"]];
  (D.sessoes||[]).forEach(function(s,i){
    (s.cenas||[]).forEach(function(c){
      ops.push([c.id,Vm("sessao")+" "+(s.numero||i+1)+" · "+(c.titulo||c.n||Vm("cena"))]); }); });
  return ops;
}
function mpNumeroValido(v){
  var n=Number(String(v??"").replace(",","."));
  return Number.isFinite(n)&&n>0?"":"Use um número maior que zero, como 1,5.";
}
function mpEditaMapa(){
  var m=MP.mapa;
  if(!m){ return; }
  var g=m.grid||{}, r=m.regras||{};
  var copia={nome:m.nome,imagem:m.imagem,tipo:g.tipo||"quadrado",tam:g.tam,opac:Math.round(mpNum(g.opac,0.35)*100),
    colunas:Math.max(1,Math.round(m.largura/mpNum(g.tam,70))),linhas:Math.max(1,Math.round(m.altura/mpNum(g.tam,70))),
    ox:g.ox,oy:g.oy,escala:String(g.escala??1.5).replace(".",","),unidade:g.unidade||"m",diagonal:g.diagonal||"121",quem:r.quem||"dono",limite:r.limite||"aviso",cenaId:m.cenaId||""};
  var tamanho=m.imagem?[]:[
    {k:"colunas",rot:"Casas na largura",tipo:"num",obrig:true,linha:"tam",dica:"Sem imagem, o tamanho do "+vmin("mapa")+" é o da grade."},
    {k:"linhas",rot:"Casas na altura",tipo:"num",obrig:true,linha:"tam"}];
  formulario("Editar · "+vmin("mapa"),[
    {k:"nome",rot:"Nome",obrig:true},
    {k:"imagem",rot:"Imagem do "+vmin("mapa"),tipo:"img"}].concat(tamanho,[
    {k:"tipo",rot:"Grade",tipo:"sel",linha:"grade",ops:[["quadrado","Quadrada"],["hex","Hexagonal"],["nenhum","Sem grade"]]},
    {k:"tam",rot:"Tamanho da casa (px)",tipo:"num",linha:"grade",dica:"Ajuste até a grade cobrir as casas desenhadas."},
    {k:"opac",rot:"Opacidade da grade (%)",tipo:"num",linha:"grade",dica:"0 esconde a grade."},
    {k:"ox",rot:"Deslocamento horizontal (px)",tipo:"num",linha:"desl"},
    {k:"oy",rot:"Deslocamento vertical (px)",tipo:"num",linha:"desl",dica:"Empurram a grade para alinhar com o desenho."},
    {k:"escala",rot:"Cada casa vale",valida:mpNumeroValido,ph:"1,5",linha:"medida"},
    {k:"unidade",rot:"Unidade",ph:"m, pés, km",linha:"medida"},
    {k:"diagonal",rot:"Distância na diagonal",tipo:"sel",linha:"medida",ops:[["121","Alternada: 1, 2, 1…"],["1","Uma casa por casa"],["eu","Em linha reta"]],
      dica:"Vale para a régua e para o deslocamento. No hexágono conta-se hexágono a hexágono."},
    {k:"quem",rot:"Quem move os "+vmin("tokens"),tipo:"sel",linha:"regras",ops:[["dono","Cada "+vmin("jogador")+" move só o seu"],["todos","Qualquer "+vmin("jogador")+" move qualquer um"]],
      dica:"O mestre move todos. Um "+vmin("token")+" também pode ser liberado no formulário dele."},
    {k:"limite",rot:"Passar do deslocamento do turno",tipo:"sel",linha:"regras",ops:[["aviso","Só avisa quem passou"],["bloqueio","Não deixa mover"]],
      dica:"Vale para os "+vmin("tokens")+" com deslocamento por turno. O "+vmin("mestre")+" nunca é barrado."},
    {k:"cenaId",rot:Vm("cena")+" ligada",tipo:"sel",ops:mpOpcoesCena()}
  ]),copia,{wide:true,rotRemover:"Apagar "+vmin("mapa"),
    salvar:function(c){
      var T=c.tam||70, semImg=!c.imagem, dim=semImg?{largura:Math.round(Math.max(1,c.colunas||1)*T),altura:Math.round(Math.max(1,c.linhas||1)*T)}:{};
      mpSalvaMapa({...dim,nome:c.nome,imagem:c.imagem||"",cenaId:c.cenaId||"",regras:{quem:c.quem,limite:c.limite},
        grid:{tipo:c.tipo,tam:c.tam??70,ox:c.ox??0,oy:c.oy??0,opac:Math.min(100,Math.max(0,c.opac??35))/100,
          escala:String(c.escala||"1.5").replace(",","."),unidade:c.unidade||"",diagonal:c.diagonal||"121"}})
        .catch(function(){ /* o aviso ja saiu em mpGrava */ });
    },
    remover:function(){
      confirmar("O "+vmin("mapa")+" "+m.nome+" e todos os "+vmin("tokens")+" dele somem para todo mundo. A imagem continua na Biblioteca.",
        {titulo:"Apagar este "+vmin("mapa")+"?",sim:"Apagar"})
        .then(function(sim){ if(sim){ mpApagaMapa(m.id).catch(function(){ /* o aviso ja saiu em mpGrava */ }); } });
    }});
}

/* ---------- token ---------- */
/* nasce no meio do que esta na tela, nao no meio do mapa: e onde o mestre esta olhando */
function mpMeioDaTela(){
  var v=mpVista();
  if(!MPC?.w){ return {}; }
  var p={x:(MPC.w/2-v.x)/v.z, y:(MPC.h/2-v.y)/v.z}, s=mpEncaixa(p.x,p.y,1);
  return {x:Math.round(s.x*10)/10,y:Math.round(s.y*10)/10};
}
function mpNovoToken(ancora){
  menuSolto(ancora,htmlDe("t-menu",{titulo:"De onde vem o "+vmin("token"),itens:[
    {v:"avulso",rot:Vm("token")+" avulso",dica:"Nome e imagem à sua escolha",perigo:false,desligado:false},
    {v:"ficha",rot:"De uma "+vmin("ficha"),dica:"Fica com quem é dono da "+vmin("ficha"),perigo:false,desligado:false},
    {v:"npc",rot:"De um "+vmin("npc")+" do elenco",dica:"Nasce escondido dos "+vmin("jogadores"),perigo:false,desligado:false}]}),
  function(it){
    var k=it.dataset.v;
    if(k==="avulso"){ mpTokenAvulso(); }
    else if(k==="ficha"){ mpTokenDeFicha(); }
    else { mpTokenDeNpc(); }
  });
}
function mpTokenAvulso(){
  formulario("Novo "+vmin("token"),[
    {k:"nome",rot:"Nome",obrig:true},
    {k:"img",rot:"Imagem",tipo:"img"},
    {k:"tam",rot:"Tamanho",tipo:"sel",ops:MP_TAMANHOS},
    {k:"visivel",rot:"Visível para os "+vmin("jogadores"),tipo:"check"}
  ],{nome:"",img:"",tam:"1",visivel:true},{rotSalvar:"Pôr no "+vmin("mapa"),salvar:function(c){
    mpCriaElemento({visivel:!!c.visivel,dados:{...mpMeioDaTela(),nome:c.nome,img:c.img||"",tam:Number(c.tam)||1}}).catch(function(){ /* aviso em mpGrava */ });
  }});
}
/* Escolher uma ficha ou um NPC numa lista com retrato; devolve o id escolhido ou null */
function mpEscolhe(titulo,itens,vazio){
  return new Promise(function(fim){
    var feito=false;
    var ov=overlay(titulo,htmlDe("t-mapa-escolha",{itens:itens,vazio:vazio}));
    var fecha=ov.close;
    ov.close=function(){ if(!feito){ feito=true; fim(null); } fecha(); };
    $$("[data-mp-pega]",ov).forEach(function(b){ b.onclick=function(){ feito=true; fecha(); fim(b.dataset.mpPega); }; });
  });
}
/* A vida do token nasce da primeira barra da ficha que tem maximo (de preferencia a que se chama vida). Com o
   vinculo ligado o servidor mantem as duas iguais: mudou num, muda no outro. */
function mpNumFicha(v){ var n=Number(String(v??"").replace(",",".")); return Number.isFinite(n)?n:0; }
function mpVidaDaFicha(f){
  var bs=fichaDados(f).campos.filter(function(c){ return c.tipo==="barra"&&mpNumFicha(c.max)>0; });
  var c=bs.find(function(x){ return /vida|pv|hp/i.test(x.rot); })||bs[0];
  return c?{vidaMax:mpNumFicha(c.max),vida:mpNumFicha(c.val),vidaCampo:c.rot}:{};
}
/* o alcance escrito na ficha vai junto para o token; depois o servidor o atualiza quando a ficha muda */
function mpVisaoDaFicha(f){
  var v=fichaDados(f).visao;
  return v==null||v===""?{}:{visaoFicha:Math.max(0,mpNumFicha(v))};
}
function mpTokenDeFicha(){
  carregaFichas().then(function(fs){
    return mpEscolhe("Escolher a "+vmin("ficha"),fs.map(function(f){ return {id:f.id,nome:f.nome,sub:f.dono||"",img:""}; }),
      "Nenhuma "+vmin("ficha")+" nesta "+vmin("campanha")+" ainda.").then(function(id){
      var f=fs.find(function(x){ return String(x.id)===String(id); });
      if(!f){ return null; }
      return mpCriaElemento({dados:{...mpMeioDaTela(),nome:f.nome,fichaId:f.id,vinculo:true,...mpVidaDaFicha(f),...mpVisaoDaFicha(f)}});
    });
  }).catch(function(e){ if(e){ toast(e.message||"não consegui ler as "+vmin("fichas"),"erro"); } });
}
function mpTokenDeNpc(){
  var npcs=D.elenco?.npcs||[];
  mpEscolhe("Escolher o "+vmin("npc"),npcs.map(function(n){ return {id:n.id,nome:n.nome||Vm("npc"),sub:"",img:n.img?IMG(n.img,"mini"):""}; }),
    "Nenhum "+vmin("npc")+" no elenco ainda.").then(function(id){
    var n=npcs.find(function(x){ return String(x.id)===String(id); });
    if(!n){ return; }
    mpCriaElemento({visivel:false,camada:"npcs",dados:{...mpMeioDaTela(),nome:n.nome||Vm("npc"),img:n.img||"",npcId:n.id,elencoId:String(n.id)}})
      .then(function(){ toast(Vm("token")+" posto escondido. Mostre aos "+vmin("jogadores")+" no formulário dele.","ok"); })
      .catch(function(){ /* aviso em mpGrava */ });
  });
}
/* Quem e a vez de cada token se decide na iniciativa: a entrada da ordem aponta para o token (Token no mapa). */
var MP_TAMANHOS=[["0.5","Meia casa"],["1","1 casa"],["2","2 × 2"],["3","3 × 3"],["4","4 × 4"]];
function mpOpcoesDono(){
  return api("/api/campanhas/"+CID+"/membros").then(function(ms){
    return [["0","Só o "+vmin("mestre")]].concat((ms||[]).filter(function(x){ return x.papel!=="MESTRE"; })
      .map(function(x){ return [String(x.usuarioId),x.nome||x.login]; }));
  }).catch(function(){ return [["0","Só o "+vmin("mestre")]]; });
}
function mpEditaToken(el){
  if(!GM){ return; }
  mpOpcoesDono().then(function(donos){
    var d=el.dados||{};
    if(!donos.some(function(o){ return o[0]===String(el.dono||0); })){ donos.push([String(el.dono),"Outra pessoa"]); }
    var campos=[
      {k:"nome",rot:"Nome",obrig:true},
      {k:"img",rot:"Imagem",tipo:"img"},
      {k:"tam",rot:"Tamanho",tipo:"sel",ops:MP_TAMANHOS,linha:"geo"},
      {k:"rot",rot:"Rotação (graus)",tipo:"num",linha:"geo"},
      {k:"desl",rot:"Deslocamento por turno ("+(mpUnidade()||"unidades do mapa")+")",tipo:"num",linha:"geo",
        dica:"Rotação: para onde o "+vmin("token")+" está virado (0 é para cima). Deslocamento: quanto anda por turno, na unidade do "+vmin("mapa")+" (0 é sem limite)."},
      {k:"visao",rot:"Alcance da visão (casas)",tipo:"num",dica:"Quanto este personagem enxerga com a névoa pela visão ligada (só vale para quem tem dono). Vazio usa o da "+vmin("ficha")+" e, sem ele, o padrão do "+vmin("mapa")+" ("+mpVisaoPadraoDoMapa()+"). 0 é cego."},
      {k:"dono",rot:"Quem controla",tipo:"sel",ops:donos,dica:"Com a iniciativa em andamento, o jogador só move o token na vez da entrada que aponta para ele (na iniciativa)."},
      {k:"visivel",rot:"Visível para os "+vmin("jogadores"),tipo:"check"},
      {k:"livre",rot:"Qualquer "+vmin("jogador")+" pode mover",tipo:"check"},
      {k:"camada",rot:"Camada",tipo:"sel",ops:MP_CAMADAS.map(function(c){ return [c,mpCamadaNome(c)]; })},
      {k:"bloqueado",rot:"Trancado",tipo:"check",dica:"Trancado, ninguém move nem edita este "+vmin("token") +", nem você, até destrancar."},
      {k:"vidaMax",rot:"Vida máxima",tipo:"num",linha:"vida",dica:"0 tira a barra de vida."},
      {k:"vida",rot:"Vida atual",tipo:"num",linha:"vida"},
      {k:"vidaPublica",rot:"Os "+vmin("jogadores")+" veem a vida deste "+vmin("token"),tipo:"check"},
      {k:"marcas",rot:"Marcas (condições, efeitos, status)",tipo:"grupo",um:"marca",
        novo:function(){ return {t:"",c:"aviso"}; },
        campos:[{k:"t",rot:"Marca",ph:"Envenenado, Concentrado…"},{k:"c",rot:"Cor",tipo:"sel",ops:MP_CORES}]}];
    if(d.fichaId!=null){ campos.push({k:"vinculo",rot:"Ligado à "+vmin("ficha")+" de origem",tipo:"check"}); }
    var tam=MP_TAMANHOS.some(function(o){ return Number(o[0])===Number(d.tam); })?String(Number(d.tam)):"1";
    formulario("Editar · "+vmin("token"),campos,{nome:d.nome||"",img:d.img||"",tam:tam,rot:d.rot||0,desl:d.desl||0,visao:d.visao==null?null:d.visao,dono:String(el.dono||0),
      visivel:el.visivel!==false,livre:!!d.livre,vinculo:d.vinculo!==false,camada:mpCamadaDe(el),bloqueado:!!el.bloqueado,
      vidaMax:d.vidaMax||0,vida:d.vida||0,vidaPublica:!!d.vidaPublica,marcas:(d.marcas||[]).map(function(m){ return {t:m.t,c:m.c}; })},{rotRemover:"Remover do "+vmin("mapa"),wide:true,compacto:true,
      salvar:function(c){
        if(el.bloqueado&&c.bloqueado){ toast("Está trancado: desmarque “Trancado” para salvar mudanças.","aviso"); return; }
        var max=Math.max(0,Number(c.vidaMax)||0), vida=Math.max(0,Number(c.vida)||0);
        mpMudaElemento(el,{dono:Number(c.dono)||0,visivel:!!c.visivel,camada:c.camada,bloqueado:!!c.bloqueado,
          dados:{nome:c.nome,img:c.img||"",tam:Number(c.tam)||1,rot:c.rot??0,desl:Math.max(0,Number(c.desl)||0),visao:c.visao==null||c.visao===""?null:Math.max(0,Number(c.visao)||0),livre:!!c.livre,vinculo:!!c.vinculo,
            vidaMax:max,vida:vida,vidaPublica:!!c.vidaPublica,marcas:(c.marcas||[]).filter(function(m){ return String(m.t||"").trim(); })}})
          .catch(function(){ /* aviso em mpGrava */ });
      },
      remover:function(){ mpRemoveElemento(el).catch(function(){ /* aviso em mpGrava */ }); }});
  });
}

/* ---------- parede e nevoa ---------- */
function mpEditaParede(el){
  if(!GM){ return; }
  var d=el.dados||{};
  formulario("Editar · parede",[
    {k:"kind",rot:"Tipo",tipo:"sel",ops:MP_PAREDES,dica:"Parede barra o movimento e a visão; janela só o movimento; porta fechada barra os dois."},
    {k:"aberta",rot:"Porta aberta (só vale para porta)",tipo:"check"},
    {k:"bloqueado",rot:"Trancada",tipo:"check",dica:"Trancada, ninguém move nem edita, nem você, até destrancar."}
  ],{kind:d.kind||"parede",aberta:!!d.aberta,bloqueado:!!el.bloqueado},{rotRemover:"Remover a parede",compacto:true,
    salvar:function(c){
      if(el.bloqueado&&c.bloqueado){ toast("Está trancada: desmarque “Trancada” para salvar mudanças.","aviso"); return; }
      mpMudaElemento(el,{bloqueado:!!c.bloqueado,dados:{kind:c.kind,aberta:!!c.aberta}},"não consegui salvar a parede").catch(function(){ /* aviso em mpGrava */ });
    },
    remover:function(){ mpRemoveElemento(el).catch(function(){ /* aviso em mpGrava */ }); }});
}
function mpEditaFog(el){
  if(!GM){ return; }
  var d=el.dados||{};
  var traco=d.forma==="traco", T=mpLado();
  var campos=[
    {k:"revela",rot:"Revela (desmarcado, cobre de novo)",tipo:"check",dica:"As áreas valem na ordem em que foram feitas: a mais nova manda sobre as mais antigas."},
    {k:"bloqueado",rot:"Trancada",tipo:"check"}
  ];
  if(traco){
    campos.splice(1,0,
      {k:"casas",rot:"Diâmetro do pincel (casas)",tipo:"num",linha:"pin"},
      {k:"ponta",rot:"Formato",tipo:"sel",ops:MP_PONTAS,linha:"pin"},
      {k:"borda",rot:"Borda",tipo:"sel",ops:[["macia","Macia"],["firme","Firme"]],linha:"pin"});
  }
  formulario("Editar · "+(traco?"pincel de névoa":"área de névoa"),campos,
    {revela:d.revela!==false,bloqueado:!!el.bloqueado,casas:Math.round(mpNum(d.larg,70)/T*100)/100,ponta:d.ponta||"redondo",borda:d.suave===false?"firme":"macia"},{rotRemover:"Remover a área",compacto:true,
    salvar:function(c){
      if(el.bloqueado&&c.bloqueado){ toast("Está trancada: desmarque “Trancada” para salvar mudanças.","aviso"); return; }
      var dados={revela:!!c.revela};
      if(traco){ dados.larg=Math.max(4,Math.round((Number(c.casas)||1)*T)); dados.ponta=c.ponta; dados.suave=c.borda!=="firme"; }
      mpMudaElemento(el,{bloqueado:!!c.bloqueado,dados:dados},"não consegui salvar a área").catch(function(){ /* aviso em mpGrava */ });
    },
    remover:function(){ mpRemoveElemento(el).catch(function(){ /* aviso em mpGrava */ }); }});
}

/* O jogador muda, no token que e dele, a vida atual (ate o maximo que o mestre pos) e as marcas. */
function mpEditaMeuToken(el){
  if(GM||!el.meu){ return; }
  var d=el.dados||{}, max=mpNum(d.vidaMax,0);
  var campos=[];
  if(max>0){ campos.push({k:"vida",rot:"Vida atual (máximo "+mpFmt(max)+")",tipo:"num"}); }
  campos.push({k:"marcas",rot:"Marcas (condições, efeitos, status)",tipo:"grupo",um:"marca",
    novo:function(){ return {t:"",c:"aviso"}; },
    campos:[{k:"t",rot:"Marca",ph:"Envenenado, Concentrado…"},{k:"c",rot:"Cor",tipo:"sel",ops:MP_CORES}]});
  formulario("Seu "+vmin("token")+" · "+(d.nome||""),campos,{vida:d.vida||0,marcas:(d.marcas||[]).map(function(m){ return {t:m.t,c:m.c}; })},{compacto:true,
    salvar:function(c){
      var dados={marcas:(c.marcas||[]).filter(function(m){ return String(m.t||"").trim(); })};
      if(max>0){ dados.vida=Math.min(max,Math.max(0,Number(c.vida)||0)); }
      mpMudaElemento(el,{dados:dados}).catch(function(){ /* aviso em mpGrava */ });
    }});
}
/* A cena ligada ao mapa (só o mestre tem o guia): a sessão em que ela está e a própria cena, ou null. */
function mpCenaLigada(m){
  var id=m?.cenaId; if(!id||!D?.sessoes)return null;
  for(var i=0;i<D.sessoes.length;i++){
    var c=(D.sessoes[i].cenas||[]).find(function(x){ return x.id===id; });
    if(c)return {si:i,c:c};
  }
  return null;
}
function mpRotuloCena(l){ return l?Vm("cena")+" "+(l.c.n||"")+(l.c.titulo?" · "+l.c.titulo:""):""; }
/* O caminho inverso do atalho da cena: abre a janela da cena ligada sem sair do mapa. A janela da cena
   trabalha sobre a sessão atual (curSess), então ela passa a ser a da cena enquanto a janela estiver aberta,
   e a de antes volta quando a última janela de cena fecha (a barra de iniciativa do mapa não troca de sessão). */
function mpAbreCenaLigada(){
  var l=mpCenaLigada(MP.mapa);
  if(!l){ toast("A "+vmin("cena")+" ligada a este "+vmin("mapa")+" não existe mais. Escolha outra no formulário do "+vmin("mapa")+".","aviso"); return; }
  var antes=S.sessao, camada=$("#layer");
  S.sessao=l.si;
  abrirCenaModal(l.c.id);
  if(antes===l.si||!camada)return;
  var ob=new MutationObserver(function(){
    if($(".cenasheet",camada))return;
    ob.disconnect();
    if(S.sessao===l.si)S.sessao=antes;
  });
  ob.observe(camada,{childList:true});
}
/* O atalho da cena: abre o mapa que o mestre ligou a ela (formulario do mapa). Nao ativa nada para os jogadores. */
function mpAbrirMapaDaCena(cenaId){
  mpCarregaLista().then(function(l){
    var m=(l||[]).find(function(x){ return String(x.cenaId||"")===String(cenaId); });
    if(!m){ toast("Nenhum "+vmin("mapa")+" está ligado a esta "+vmin("cena")+". Ligue no formulário do "+vmin("mapa")+".","aviso"); return; }
    MP.querAbrir=m.id; S.view="mapa"; render();
    if(MP.carregado){ MP.querAbrir=null; mpAbrir(m.id); }
  }).catch(function(e){ toast(e?.message||"não consegui ler os mapas","erro"); });
}

/* ---------- desenho ---------- */
function mpNovaMarca(p){
  formulario("Nova marcação",[{k:"rotulo",rot:"Texto",obrig:true,ph:"Armadilha, saída, tesouro…"}],{rotulo:""},
    {rotSalvar:"Pôr no "+vmin("mapa"),salvar:function(c){ mpCriaDesenho("marca",[[p.x,p.y]],{rotulo:c.rotulo}); }});
}
function mpEditaDesenho(el){
  if(!GM){ return; }
  var d=el.dados||{}, marca=d.forma==="marca", cheia=!marca&&d.forma!=="linha";
  var campos=[{k:"rotulo",rot:marca?"Texto":"Texto no desenho",obrig:marca,ph:marca?"":"Opcional"},
    {k:"cor",rot:"Cor",tipo:"sel",ops:MP_CORES,linha:"traco"},
    {k:"esp",rot:"Espessura",tipo:"num",linha:"traco"}];
  if(cheia){ campos.push({k:"preench",rot:"Preencher",tipo:"check"}); }
  campos.push({k:"camada",rot:"Camada",tipo:"sel",ops:MP_CAMADAS.map(function(c){ return [c,mpCamadaNome(c)]; })},
    {k:"visivel",rot:"Visível para os "+vmin("jogadores"),tipo:"check"},
    {k:"bloqueado",rot:"Trancado",tipo:"check",dica:"Trancado, ninguém move nem edita, nem você, até destrancar."});
  formulario("Editar · desenho",campos,{rotulo:d.rotulo||"",cor:d.cor||"ouro",esp:d.esp||3,preench:mpNum(d.preench,0)>0,
    camada:mpCamadaDe(el),visivel:el.visivel!==false,bloqueado:!!el.bloqueado},{rotRemover:"Remover o desenho",compacto:true,
    salvar:function(c){
      if(el.bloqueado&&c.bloqueado){ toast("Está trancado: desmarque “Trancado” para salvar mudanças.","aviso"); return; }
      mpMudaElemento(el,{visivel:!!c.visivel,camada:c.camada,bloqueado:!!c.bloqueado,
        dados:{rotulo:c.rotulo||"",cor:c.cor,esp:Math.min(12,Math.max(1,Number(c.esp)||3)),preench:c.preench?(mpNum(d.preench,0)||0.25):0}},"não consegui salvar o desenho")
        .catch(function(){ /* aviso em mpGrava */ });
    },
    remover:function(){ mpRemoveElemento(el).catch(function(){ /* aviso em mpGrava */ }); }});
}

/* ---------- historico ---------- */
function mpTextoHistorico(h){
  var quem=h.meu?"Você":h.quem, nome=h.nome||(h.tipo==="DESENHO"?"um desenho":vmin("token")), mapa="o "+vmin("mapa");
  if(h.tipo==="PAREDE"||h.tipo==="FOG"){ nome=h.tipo==="PAREDE"?"uma parede":"uma área de névoa"; }
  if(h.operacao==="criar"){ return quem+" pôs "+nome+" no "+vmin("mapa"); }
  if(h.operacao==="mudar"){ return h.casas==null?quem+" alterou "+nome:quem+" moveu "+nome+" · "+mpDistTexto(h.casas); }
  if(h.operacao==="remover"){ return quem+" removeu "+nome; }
  if(h.operacao==="desfazer"){ return quem+" desfez "+(h.casas==null?"uma ação em ":"o movimento de ")+nome; }
  if(h.operacao==="turno"){ return quem+" começou um novo turno"; }
  return quem+" mudou "+mapa;
}
function mpLinhaHistorico(h){
  return {texto:mpTextoHistorico(h),seq:h.seq,desfeito:!!h.desfeito,
    pode:!!h.meu&&!h.desfeito&&["criar","mudar","remover"].includes(h.operacao),
    quando:new Date(h.em).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})};
}
/* O mestre ve o que todos fizeram; o jogador, so o que fez (o servidor corta). Cada linha propria
   que ainda vale tem o botao de desfazer aquela ação. */
function mpAbreHistorico(){
  if(!MP.id){ return; }
  var mid=MP.id, ov=overlay(GM?"Histórico do "+vmin("mapa"):"Seus movimentos",'<div class="mphist"></div>');
  var alvo=$(".mphist",ov);
  function carrega(){
    return api(mpAPI("/"+mid+"/historico?limite=80")).then(function(l){
      alvo.innerHTML=htmlDe("t-mapa-historico",{linhas:(l||[]).map(mpLinhaHistorico),vazio:"Nada aconteceu neste "+vmin("mapa")+" ainda."});
      $$("[data-mp-desfaz]",alvo).forEach(function(b){ b.onclick=function(){
        mpDesfaz(b.dataset.mpDesfaz).then(function(r){ if(r){ carrega(); } }); }; });
    }).catch(function(e){ alvo.textContent=e?.message||"não consegui ler o histórico"; });
  }
  carrega();
}

/* ---------- teclado ---------- */
/* Só com a tela do Mapa à vista. atalho() já respeita campo de texto, janela aberta, tour e a
   preferência de atalhos; o Ctrl+Z do toast de "Desfazer" (camadas.js) vem antes e tem prioridade. */
function mpTeclado(){ return mpNaTela()&&!mapaBloqueado()&&!!MP.mapa; }
atalho({tecla:"r",quando:mpTeclado,faz:function(){ mpFerramenta(MP.ferramenta==="regua"?"mover":"regua"); }});
atalho({tecla:"v",quando:mpTeclado,faz:function(){ mpFerramenta("mover"); }});
/* Enter, Delete e as teclas das ferramentas nao valem com o foco num botao: la elas ja tem o sentido de sempre. */
function mpFocoLivre(e){ return !e.target?.closest?.("button,a,select,input,textarea,[role=button]"); }
function mpMestre(){ return mpTeclado()&&GM; }
atalho({tecla:"s",quando:mpMestre,faz:function(){ mpFerramenta(MP.ferramenta==="selecionar"?"mover":"selecionar"); }});
[["l","linha"],["o","circulo"],["b","retangulo"],["p","poligono"],["m","marca"]].forEach(function(t){
  atalho({tecla:t[0],quando:mpMestre,faz:function(){ mpFerramenta(MP.ferramenta===t[1]?"mover":t[1]); }});
});
atalho({tecla:"w",quando:mpMestre,faz:function(){ mpFerramenta(MP.ferramenta==="parede"?"mover":"parede"); }});
atalho({tecla:"n",quando:mpMestre,faz:function(){ mpFerramenta(MP.ferramenta==="fog"?"mover":"fog"); }});
atalho({tecla:"f",quando:mpMestre,faz:function(){ mpFerramenta(MP.ferramenta==="pincel"?"mover":"pincel"); }});
atalho({tecla:"i",quando:mpTeclado,faz:function(){ mpFerramenta(MP.ferramenta==="ping"?"mover":"ping"); }});
atalho({tecla:"]",quando:function(e){ return mpMestre()&&mpFocoLivre(e)&&mpSelecao().length>0; },faz:function(){ mpAcaoSelecao("frente"); }});
atalho({tecla:"[",quando:function(e){ return mpMestre()&&mpFocoLivre(e)&&mpSelecao().length>0; },faz:function(){ mpAcaoSelecao("tras"); }});
atalho({tecla:"a",quando:mpTeclado,faz:function(){ mpFerramenta(MP.ferramenta.indexOf("a-")===0?"mover":(MP.areaTipo||"a-cone")); }});
atalho({tecla:"Escape",quando:function(){ return mpTeclado()&&!!(MP.flyDes||MP.regua||MP.area||MP.rascunho||mpSelecao().length||MP.ferramenta==="parede"||MP.ferramenta==="fog"||MP.ferramenta==="pincel"); },faz:function(){
  if(MP.flyDes){ mpGavetaDesenho(false); return; }
  if(MP.regua||MP.area||MP.rascunho){ MP.regua=null; MP.area=null; MP.rascunho=null; } else if(MP.ferramenta==="parede"||MP.ferramenta==="fog"||MP.ferramenta==="pincel"){ mpFerramenta("mover"); } else { mpSelecionaIds([]); }
  mpDesenha(); mpPintaPainel();
}});
atalho({tecla:"Enter",quando:function(e){ return mpTeclado()&&mpFocoLivre(e)&&!!MP.regua?.pts&&!MP.regua.fim; },faz:function(){ mpTerminaTrajeto(false); }});
atalho({tecla:"Enter",quando:function(e){ return mpMestre()&&mpFocoLivre(e)&&(!!MP.area||mpEhPoli(MP.rascunho)); },faz:function(){
  if(MP.rascunho){ mpFechaPoligono(false); } else { mpFixaArea(); }
}});
atalho({tecla:"Backspace",quando:function(e){ return mpMestre()&&mpFocoLivre(e)&&mpEhPoli(MP.rascunho); },faz:function(){
  MP.rascunho.pts.pop(); if(!MP.rascunho.pts.length){ MP.rascunho=null; } mpDesenha();
}});
["Delete","Backspace"].forEach(function(t){
  atalho({tecla:t,quando:function(e){ return mpMestre()&&mpFocoLivre(e)&&!MP.rascunho&&mpSelecao().length>0; },faz:function(){ mpAcaoSelecao("remover"); }});
});
atalho({tecla:"a",ctrl:true,quando:function(e){ return mpMestre()&&!emCampoDeTexto(e); },faz:function(){
  mpSelecionaIds(mpOrdenados().filter(function(el){ return !mpPincelada(el); }).map(function(el){ return el.id; })); mpDesenha(); mpPintaPainel();
}});
atalho({tecla:"0",quando:mpTeclado,faz:function(){ mpAlternaEnquadre(); }});
atalho({tecla:"?",quando:mpTeclado,faz:function(){ mpMostraAtalhos(); }});
atalho({tecla:"+",quando:mpTeclado,faz:function(){ mpZoom(1.25,MPC.w/2,MPC.h/2); }});
atalho({tecla:"=",quando:mpTeclado,faz:function(){ mpZoom(1.25,MPC.w/2,MPC.h/2); }});
atalho({tecla:"-",quando:mpTeclado,faz:function(){ mpZoom(0.8,MPC.w/2,MPC.h/2); }});
atalho({tecla:"z",ctrl:true,quando:function(e){ return mpTeclado()&&!emCampoDeTexto(e); },faz:function(){ mpDesfaz(); }});
[["ArrowLeft",-1,0],["ArrowRight",1,0],["ArrowUp",0,-1],["ArrowDown",0,1]].forEach(function(t){
  atalho({tecla:t[0],quando:function(){ return mpTeclado()&&mpSelecionados().some(mpMovivel); },faz:function(e){ mpAnda(t[1],t[2],e.shiftKey); }});
});
