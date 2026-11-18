/* Tabletop: a tela do Mapa, o painel e os formularios de mapa e de token. */
"use strict";

/* painel aberto de saida na tela larga; no celular ele cobre o mapa, entao comeca fechado */
function mpPainelAberto(){
  if(MP.painel==null){ MP.painel=window.innerWidth>=900; }
  return MP.painel;
}
function viewMapa(){
  if(mapaBloqueado()){ return htmlDe("t-mapa-wip",{}); }
  var m=MP.mapa;
  return htmlDe("t-mapa",{gm:GM,carregado:MP.carregado,espera:MP.carregado?"":htmlDe("t-carregando-sm",{texto:""}),tem:!!m,nome:m?.nome||"",ativo:!!m?.ativo,
    painel:mpPainelAberto(),encaixa:MP.encaixa,nTokens:MP.els.length});
}
function hydrateMapa(v){
  if(mapaBloqueado()){ return; }
  mpLiga();
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
  $$("[data-mpz]",v).forEach(function(b){ b.onclick=function(){
    var k=b.dataset.mpz;
    if(k==="0"){ mpEnquadra(); return; }
    mpZoom(k==="+"?1.25:0.8,MPC.w/2,MPC.h/2);
  }; });
}

/* ---------- painel ---------- */
function mpItemToken(e){
  var d=e.dados||{};
  return {id:e.id,nome:d.nome||Vm("token"),img:d.img?IMG(d.img,"mini"):"",oculto:e.visivel===false,meu:!!e.meu,
    sel:String(MP.sel)===String(e.id)};
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
    ox:g.ox,oy:g.oy,escala:String(g.escala??1.5).replace(".",","),unidade:g.unidade||"m",quem:r.quem||"dono",cenaId:m.cenaId||""};
  var tamanho=m.imagem?[]:[
    {k:"colunas",rot:"Casas na largura",tipo:"num",obrig:true,dica:"Sem imagem, o tamanho do "+vmin("mapa")+" é o da grade: colunas e linhas de casas."},
    {k:"linhas",rot:"Casas na altura",tipo:"num",obrig:true}];
  formulario("Editar · "+vmin("mapa"),[
    {k:"nome",rot:"Nome",obrig:true},
    {k:"imagem",rot:"Imagem do "+vmin("mapa"),tipo:"img"}].concat(tamanho,[
    {k:"tipo",rot:"Grade",tipo:"sel",ops:[["quadrado","Quadrada"],["hex","Hexagonal"],["nenhum","Sem grade"]]},
    {k:"tam",rot:"Tamanho da casa",tipo:"num",dica:"Em pixels da imagem. Ajuste até a grade cobrir as casas desenhadas no "+vmin("mapa")+"."},
    {k:"ox",rot:"Deslocamento horizontal",tipo:"num",dica:"Em pixels. Empurra a grade para alinhar com o desenho."},
    {k:"oy",rot:"Deslocamento vertical",tipo:"num"},
    {k:"opac",rot:"Opacidade da grade (%)",tipo:"num",dica:"0 esconde a grade; 100 deixa as linhas inteiras."},
    {k:"escala",rot:"Cada casa vale",valida:mpNumeroValido,ph:"1,5"},
    {k:"unidade",rot:"Unidade",ph:"m, pés, km"},
    {k:"quem",rot:"Quem move os "+vmin("tokens"),tipo:"sel",ops:[["dono","Cada "+vmin("jogador")+" move só o seu"],["todos","Qualquer "+vmin("jogador")+" move qualquer um"]],
      dica:"O mestre move todos. Um "+vmin("token")+" também pode ser liberado sozinho, no formulário dele."},
    {k:"cenaId",rot:Vm("cena")+" ligada",tipo:"sel",ops:mpOpcoesCena()}
  ]),copia,{rotRemover:"Apagar "+vmin("mapa"),
    salvar:function(c){
      var T=c.tam||70, semImg=!c.imagem, dim=semImg?{largura:Math.round(Math.max(1,c.colunas||1)*T),altura:Math.round(Math.max(1,c.linhas||1)*T)}:{};
      mpSalvaMapa({...dim,nome:c.nome,imagem:c.imagem||"",cenaId:c.cenaId||"",regras:{quem:c.quem},
        grid:{tipo:c.tipo,tam:c.tam??70,ox:c.ox??0,oy:c.oy??0,opac:Math.min(100,Math.max(0,c.opac??35))/100,
          escala:String(c.escala||"1.5").replace(",","."),unidade:c.unidade||"",diagonal:g.diagonal||"121"}})
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
    mpCriaElemento({visivel:false,dados:{...mpMeioDaTela(),nome:n.nome||Vm("npc"),img:n.img||"",npcId:n.id}})
      .then(function(){ toast(Vm("token")+" posto escondido. Mostre aos "+vmin("jogadores")+" no formulário dele.","ok"); })
      .catch(function(){ /* aviso em mpGrava */ });
  });
}
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
      {k:"dono",rot:"Quem controla",tipo:"sel",ops:donos},
      {k:"visivel",rot:"Visível para os "+vmin("jogadores"),tipo:"check"},
      {k:"livre",rot:"Qualquer "+vmin("jogador")+" pode mover",tipo:"check"}];
    if(d.fichaId!=null){ campos.push({k:"vinculo",rot:"Ligado à "+vmin("ficha")+" de origem",tipo:"check"}); }
    var tam=MP_TAMANHOS.some(function(o){ return Number(o[0])===Number(d.tam); })?String(Number(d.tam)):"1";
    formulario("Editar · "+vmin("token"),campos,{nome:d.nome||"",img:d.img||"",tam:tam,rot:d.rot||0,dono:String(el.dono||0),
      visivel:el.visivel!==false,livre:!!d.livre,vinculo:d.vinculo!==false},{rotRemover:"Remover do "+vmin("mapa"),
      salvar:function(c){
        mpMudaElemento(el,{dono:Number(c.dono)||0,visivel:!!c.visivel,
          dados:{nome:c.nome,img:c.img||"",tam:Number(c.tam)||1,rot:c.rot??0,livre:!!c.livre,vinculo:!!c.vinculo}})
          .catch(function(){ /* aviso em mpGrava */ });
      },
      remover:function(){ mpRemoveElemento(el).catch(function(){ /* aviso em mpGrava */ }); }});
  });
}
