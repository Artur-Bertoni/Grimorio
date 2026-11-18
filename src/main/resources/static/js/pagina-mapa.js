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
  return htmlDe("t-mapa",{ini:GM?(si?iniHtml(si):""):iniPubHtml(),iniBotao:!!si,iniAberta:!!si&&!!(S.ini||iniDe(si).lista.length),gm:GM,carregado:MP.carregado,espera:MP.carregado?"":htmlDe("t-carregando-sm",{texto:""}),tem:!!m,nome:m?.nome||"",ativo:!!m?.ativo,
    painel:mpPainelAberto(),encaixa:MP.encaixa,regua:MP.ferramenta==="regua",nTokens:MP.els.length});
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
  var bg=$("#mpEncaixe",v);
  if(bg){ bg.onclick=function(){
    mpAlternaEncaixe();
    bg.classList.toggle("on",MP.encaixa); bg.setAttribute("aria-pressed",String(MP.encaixa));
    toast(MP.encaixa?"Encaixe na grade: ligado":"Posição livre: ligada"); }; }
  var be=$("#mpEd",v); if(be){ be.onclick=function(){ mpEditaMapa(); }; }
  var bt=$("#mpToken",v); if(bt){ bt.onclick=function(){ mpNovoToken(bt); }; }
  var ba=$("#mpAtiva",v); if(ba){ ba.onclick=function(){ mpAtiva(MP.id,!MP.mapa?.ativo); }; }
  var bn=$("#mpNovo",v); if(bn){ bn.onclick=function(){ mpNovoMapa(); }; }
  var br=$("#mpRegua",v); if(br){ br.onclick=function(){ mpFerramenta(MP.ferramenta==="regua"?"mover":"regua"); }; }
  var bd=$("#mpDesfaz",v); if(bd){ bd.onclick=function(){ mpDesfaz(); }; }
  $$("[data-mpz]",v).forEach(function(b){ b.onclick=function(){
    var k=b.dataset.mpz;
    if(k==="0"){ mpEnquadra(); return; }
    mpZoom(k==="+"?1.25:0.8,MPC.w/2,MPC.h/2);
  }; });
}

/* ---------- painel ---------- */
function mpItemToken(e){
  var d=e.dados||{};
  var desl=mpNum(d.desl,0);
  return {id:e.id,nome:d.nome||Vm("token"),img:d.img?IMG(d.img,"mini"):"",oculto:e.visivel===false,meu:!!e.meu,
    sel:String(MP.sel)===String(e.id),daVez:!!e.daVez,
    resta:desl>0?mpFmt(Math.max(0,desl-mpNum(d.usado,0)))+"/"+mpFmt(desl)+" "+mpUnidade():""};
}
/* O painel se refaz a cada token que muda (de qualquer pessoa): o foco de quem estava num
   botao dele volta para o mesmo botao. */
function mpPintaPainel(){
  var p=$("#mpPainel");
  if(!p){ return; }
  var a=document.activeElement, foco=p.contains(a)?seletorEstavel(a):null;
  p.innerHTML=htmlDe("t-mapa-painel",{gm:GM,polling:mpModoTempoReal()==="polling",
    mapas:GM?MP.lista.map(function(m){ return {id:m.id,nome:m.nome,ativo:!!m.ativo,aberto:String(m.id)===String(MP.id)}; }):[],
    tokens:MP.els.map(mpItemToken)});
  if(foco){ var f=p.querySelector(foco); if(f){ f.focus({preventScroll:true}); } }
  $$("[data-mp-abre]",p).forEach(function(b){ b.onclick=function(){ mpAbrir(b.dataset.mpAbre); }; });
  $$("[data-mp-novo]",p).forEach(function(b){ b.onclick=function(){ mpNovoMapa(); }; });
  $$("[data-mp-sel]",p).forEach(function(b){ b.onclick=function(){
    var el=mpEl(b.dataset.mpSel); MP.sel=el?el.id:null; mpCentraliza(el); mpPintaPainel(); }; });
  $$("[data-mp-undo]",p).forEach(function(b){ b.onclick=function(){ mpDesfaz(); }; });
  $$("[data-mp-hist]",p).forEach(function(b){ b.onclick=function(){ mpAbreHistorico(); }; });
  $$("[data-mp-turno]",p).forEach(function(b){ b.onclick=function(){
    /* Com iniciativa em andamento, "novo turno" e avancar a propria iniciativa: o turno sobe, a vez volta
       ao primeiro e o servidor zera o gasto (o aviso chega pelo evento do mapa, a todos). Sem ela, so zera. */
    var si=mpSessaoIni(), ini=si?iniDe(si):null;
    if(ini?.lista.length){ ini.rodada=(ini.rodada||1)+1; ini.vez=iniOrdem(ini)[0].id; som("vez"); iniMudou(si); }
    else { mpNovoTurno(); } }; });
  $$("[data-mp-ed]",p).forEach(function(b){ b.onclick=function(){ var el=mpEl(b.dataset.mpEd); if(el){ mpEditaToken(el); } }; });
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
    {k:"elencoId",rot:"Ligado ao elenco",tipo:"sel",ops:mpOpcoesElenco(),dica:MP_DICA_ELENCO},
    {k:"visivel",rot:"Visível para os "+vmin("jogadores"),tipo:"check"}
  ],{nome:"",img:"",tam:"1",elencoId:"",visivel:true},{rotSalvar:"Pôr no "+vmin("mapa"),salvar:function(c){
    mpCriaElemento({visivel:!!c.visivel,dados:{...mpMeioDaTela(),nome:c.nome,img:c.img||"",tam:Number(c.tam)||1,elencoId:c.elencoId||""}}).catch(function(){ /* aviso em mpGrava */ });
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
function mpTokenDeFicha(){
  carregaFichas().then(function(fs){
    return mpEscolhe("Escolher a "+vmin("ficha"),fs.map(function(f){ return {id:f.id,nome:f.nome,sub:f.dono||"",img:""}; }),
      "Nenhuma "+vmin("ficha")+" nesta "+vmin("campanha")+" ainda.").then(function(id){
      var f=fs.find(function(x){ return String(x.id)===String(id); });
      if(!f){ return null; }
      return mpCriaElemento({dados:{...mpMeioDaTela(),nome:f.nome,fichaId:f.id,vinculo:true}});
    });
  }).catch(function(e){ if(e){ toast(e.message||"não consegui ler as "+vmin("fichas"),"erro"); } });
}
function mpTokenDeNpc(){
  var npcs=D.elenco?.npcs||[];
  mpEscolhe("Escolher o "+vmin("npc"),npcs.map(function(n){ return {id:n.id,nome:n.nome||Vm("npc"),sub:"",img:n.img?IMG(n.img,"mini"):""}; }),
    "Nenhum "+vmin("npc")+" no elenco ainda.").then(function(id){
    var n=npcs.find(function(x){ return String(x.id)===String(id); });
    if(!n){ return; }
    mpCriaElemento({visivel:false,dados:{...mpMeioDaTela(),nome:n.nome||Vm("npc"),img:n.img||"",npcId:n.id,elencoId:String(n.id)}})
      .then(function(){ toast(Vm("token")+" posto escondido. Mostre aos "+vmin("jogadores")+" no formulário dele.","ok"); })
      .catch(function(){ /* aviso em mpGrava */ });
  });
}
/* personagens e NPCs do elenco, para vincular o token a alguem (a iniciativa libera o movimento por esse elo) */
function mpOpcoesElenco(){
  var el=D.elenco||{};
  return [["","Ninguém"]].concat((el.personagens||[]).map(function(p){ return [String(p.id),(p.nome||Vm("personagem"))]; }),
    (el.npcs||[]).map(function(n){ return [String(n.id),(n.nome||Vm("npc"))+" ("+vmin("npc")+")"]; }));
}
var MP_DICA_ELENCO="Com a iniciativa em andamento, o "+"jogador só move este token na vez de quem estiver ligado aqui. Sem vínculo, ele fica livre.";
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
      {k:"tam",rot:"Tamanho",tipo:"sel",ops:MP_TAMANHOS},
      {k:"rot",rot:"Rotação (graus)",tipo:"num",dica:"Para onde o "+vmin("token")+" está virado. 0 é para cima."},
      {k:"desl",rot:"Deslocamento por turno ("+(mpUnidade()||"unidades do mapa")+")",tipo:"num",
        dica:"Quanto ele anda a cada turno, na unidade do "+vmin("mapa")+". 0 é sem limite. A iniciativa zera o gasto."},
      {k:"dono",rot:"Quem controla",tipo:"sel",ops:donos},
      {k:"elencoId",rot:"Ligado ao elenco",tipo:"sel",ops:mpOpcoesElenco(),dica:MP_DICA_ELENCO},
      {k:"visivel",rot:"Visível para os "+vmin("jogadores"),tipo:"check"},
      {k:"livre",rot:"Qualquer "+vmin("jogador")+" pode mover",tipo:"check"}];
    if(d.fichaId!=null){ campos.push({k:"vinculo",rot:"Ligado à "+vmin("ficha")+" de origem",tipo:"check"}); }
    var tam=MP_TAMANHOS.some(function(o){ return Number(o[0])===Number(d.tam); })?String(Number(d.tam)):"1";
    formulario("Editar · "+vmin("token"),campos,{nome:d.nome||"",img:d.img||"",tam:tam,rot:d.rot||0,desl:d.desl||0,elencoId:d.elencoId||"",dono:String(el.dono||0),
      visivel:el.visivel!==false,livre:!!d.livre,vinculo:d.vinculo!==false},{rotRemover:"Remover do "+vmin("mapa"),
      salvar:function(c){
        mpMudaElemento(el,{dono:Number(c.dono)||0,visivel:!!c.visivel,
          dados:{nome:c.nome,img:c.img||"",tam:Number(c.tam)||1,rot:c.rot??0,elencoId:c.elencoId||"",desl:Math.max(0,Number(c.desl)||0),livre:!!c.livre,vinculo:!!c.vinculo}})
          .catch(function(){ /* aviso em mpGrava */ });
      },
      remover:function(){ mpRemoveElemento(el).catch(function(){ /* aviso em mpGrava */ }); }});
  });
}

/* ---------- historico ---------- */
function mpTextoHistorico(h){
  var quem=h.meu?"Você":h.quem, nome=h.nome||vmin("token"), mapa="o "+vmin("mapa");
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
atalho({tecla:"Escape",quando:function(){ return mpTeclado()&&!!MP.regua; },faz:function(){ MP.regua=null; mpDesenha(); }});
atalho({tecla:"0",quando:mpTeclado,faz:function(){ mpEnquadra(); }});
atalho({tecla:"+",quando:mpTeclado,faz:function(){ mpZoom(1.25,MPC.w/2,MPC.h/2); }});
atalho({tecla:"=",quando:mpTeclado,faz:function(){ mpZoom(1.25,MPC.w/2,MPC.h/2); }});
atalho({tecla:"-",quando:mpTeclado,faz:function(){ mpZoom(0.8,MPC.w/2,MPC.h/2); }});
atalho({tecla:"z",ctrl:true,quando:function(e){ return mpTeclado()&&!emCampoDeTexto(e); },faz:function(){ mpDesfaz(); }});
[["ArrowLeft",-1,0],["ArrowRight",1,0],["ArrowUp",0,-1],["ArrowDown",0,1]].forEach(function(t){
  atalho({tecla:t[0],quando:function(){ return mpTeclado()&&!!mpEl(MP.sel)?.podeMover; },faz:function(e){ mpAnda(t[1],t[2],e.shiftKey); }});
});
