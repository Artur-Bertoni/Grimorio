/* Tabletop: estado do mapa, conversa com o servidor e tempo real. */
"use strict";

/* O mapa nao mora no guia nem na mesa: cada token arrastado e uma operacao pequena no servidor
   (PUT de um elemento), e o servidor empurra o resultado para todos por SSE. Quem decide o que
   cada um ve e o servidor; a tela so desenha o que chegou.
   lista: os mapas que a pessoa enxerga (o jogador, so o ativo); id/mapa/els: o mapa aberto;
   seq: a ultima operacao que a tela conhece; sel: o elemento selecionado (multi: a lista, quando
   passa de um); ocultas: camadas que esta pessoa escondeu (so na tela dela); caixa, area e
   rascunho: o que a ferramenta ativa esta desenhando agora; estilo: cor, espessura e
   preenchimento dos proximos desenhos do mestre. */
var MP={lista:[],id:null,mapa:null,els:[],seq:0,sel:null,cid:null,carregado:false,querAbrir:null,
  es:null,esT:null,poll:null,voltas:0,arrastando:null,multi:[],pings:[],ocultas:{},caixa:null,area:null,rascunho:null,
  estilo:{cor:"ouro",esp:3,preench:0,vis:true},
  ferramenta:"mover",reguaModo:"reta",regua:null,medida:null};
var MP_POLL_MS=3000;
/* WIP: o tabletop esta em construcao (docs/plano-tabletop.md). Enquanto a administracao nao liberar
   (Administracao > Mapa, `mapa.liberado` na tabela config, que vem em /api/sessao), so ela abre a
   aba Mapa; os outros veem o aviso. A decisao de liberar para todos e do dono. */
var MAPA_LIBERADO=false;
function mapaBloqueado(){ return !MAPA_LIBERADO&&!ADMIN; }
/* Encaixar na grade: o mestre escolhe e vale para todos (regras.encaixe do mapa, ligado de saida). Com
   ele desligado ninguem e encaixado; so o mestre tem o Alt, que inverte a regra naquele arraste. */
function mpAlternaEncaixe(){
  var r=MP.mapa?.regras||{};
  return mpSalvaMapa({regras:{quem:r.quem,limite:r.limite,trancadas:r.trancadas||[],encaixe:r.encaixe===false}});
}

/* Ferramenta ativa: "mover" (arrasta token e fundo), "selecionar" (o mestre arrasta uma caixa),
   "regua" (em linha reta ou por pontos, MP.reguaModo), "a-cone" / "a-circulo" / "a-linha" (moldes de area) e, so para o mestre, as
   formas de desenho. Regua e areas sao de quem mede: nada vai para o servidor nem para os outros. */
var MP_FERRAMENTAS_AREA=["a-cone","a-circulo","a-linha"];
function mpFerramenta(f){
  MP.ferramenta=f;
  MP.regua=null; MP.area=null; MP.rascunho=null; MP.caixa=null;
  var rm=$("#mpRegModo"); if(rm){ rm.hidden=f!=="regua"; }
  $$("[data-mpf]").forEach(function(b){
    var on=b.dataset.mpf===f||(b.dataset.mpf==="area"&&f.indexOf("a-")===0)||(b.dataset.mpf==="desenho"&&MP_FORMAS.includes(f));
    b.classList.toggle("on",on); b.setAttribute("aria-pressed",String(on));
  });
  if(MPC){ MPC.cv.classList.toggle("regua",mpMira()); mpDesenha(); }
  mpGavetaDesenho(false);
  mpPintaPainel();
}

function mpAPI(p){ return cAPI("/mapas"+(p||"")); }
function mpEl(id){ return MP.els.find(function(e){ return String(e.id)===String(id); })||null; }
function mpDoMapa(id){ return MP.lista.find(function(m){ return String(m.id)===String(id); })||null; }
/* tela do mapa aberta agora: so entao vale redesenhar */
function mpNaTela(){ return S.view==="mapa"&&!!CID&&String(MP.cid)===String(CID); }

/* ---------- leitura ---------- */
function mpCarregaLista(){
  return api(mpAPI()).then(function(l){ MP.lista=Array.isArray(l)?l:[]; return MP.lista; });
}
/* qual mapa abrir: o do endereco, o que ja estava aberto, o ativo e, para o mestre, o primeiro */
function mpEscolhido(){
  var quer=MP.querAbrir; MP.querAbrir=null;
  var m=mpDoMapa(quer)||mpDoMapa(MP.id)||MP.lista.find(function(x){ return x.ativo; })||(GM?MP.lista[0]:null);
  return m?m.id:null;
}
/* Entrada na tela e reconexao: rele a lista e o mapa inteiro. E o que conserta qualquer evento
   perdido enquanto a conexao estava caida. */
function mpSincroniza(){
  var cid=CID;
  MP.carregando=true;
  return mpCarregaLista().then(function(){
    if(String(cid)!==String(CID))return null;
    MP.carregado=true;
    return mpAbrir(mpEscolhido());
  }).catch(function(e){ MP.carregado=true; mpRepinta(); toast(e?.message||"não consegui ler os mapas","erro"); })
    .finally(function(){ MP.carregando=false; });
}
function mpAbrir(id){
  var troca=String(id)!==String(MP.id);
  MP.id=id||null;
  if(troca){ MP.mapa=null; MP.els=[]; MP.seq=0; mpSelecionaIds([]); }
  if(!MP.id){ mpRepinta(); return Promise.resolve(); }
  return mpRecarrega();
}
function mpRecarrega(){
  var id=MP.id;
  return api(mpAPI("/"+id)).then(function(r){ if(String(id)===String(MP.id))mpAplicaEstado(r); })
    .catch(function(e){
      if(e?.status===404&&String(id)===String(MP.id)){ MP.id=null; mpSincroniza(); return; }
      toast(e?.message||"não consegui abrir o mapa","erro"); });
}
function mpAplicaEstado(r){
  if(!r)return;
  MP.seq=r.seq||0;
  if(r.igual)return;
  var mesmo=mpChaveMapa(MP.mapa)===mpChaveMapa(r.mapa);
  MP.mapa=r.mapa; MP.els=r.elementos||[];
  mpPodaSel();
  mpTrocaNaLista(r.mapa);
  if(mesmo)mpRedesenhaTokens(); else mpRepinta();
}
/* o mapa sem o seq: o seq muda a cada token movido, e isso nao pede a pagina inteira de novo */
function mpChaveMapa(m){
  if(!m)return "";
  var c={...m};
  delete c.seq;
  return JSON.stringify(c);
}
function mpTrocaNaLista(m){
  if(!m)return;
  var i=MP.lista.findIndex(function(x){ return String(x.id)===String(m.id); });
  if(i>=0)MP.lista[i]=m;
}
/* Tela inteira quando muda o mapa (nome, imagem, grid, lista); so o canvas e o painel quando
   muda um token, para o arraste de outra pessoa nao refazer a pagina. */
function mpRepinta(){ if(mpNaTela())render(); }
function mpRedesenhaTokens(){ if(mpNaTela()){ mpDesenha(); mpPintaPainel(); } }

/* ---------- tempo real ---------- */
/* SSE primeiro. Se ele nao abrir (proxy que guarda o fluxo, navegador sem EventSource, erro de
   rede repetido), a tela cai para polling por ?desde=seq e avisa no painel. */
function mpLiga(){
  if(String(MP.cid)!==String(CID)){ mpDesliga(); mpZera(); MP.cid=CID; }
  if(MP.es||MP.poll)return;
  if(typeof EventSource==="undefined"){ mpPolling(); return; }
  var es=new EventSource(mpAPI("/eventos")), ouviu=false;
  MP.es=es;
  /* sem o primeiro evento em 8s o fluxo esta preso em algum proxy: polling */
  MP.esT=setTimeout(function(){ if(!ouviu&&MP.es===es)mpCaiParaPolling(); },8000);
  es.addEventListener("mapa",function(ev){
    ouviu=true; MP.voltas=0;
    var d=null; try{ d=JSON.parse(ev.data); }catch(error_){ d=null; /* evento ilegivel: o proximo "ola" rele tudo */ }
    if(d)mpEvento(d);
  });
  es.onerror=function(){
    if(MP.es!==es)return;
    MP.voltas++;
    if(es.readyState===2||MP.voltas>=4)mpCaiParaPolling();
  };
}
function mpCaiParaPolling(){
  if(MP.es){ MP.es.close(); MP.es=null; }
  clearTimeout(MP.esT);
  mpPolling();
  mpPintaPainel();
}
function mpPolling(){
  if(MP.poll)return;
  MP.poll=setInterval(mpPergunta,MP_POLL_MS);
  if(!MP.carregado)mpSincroniza();
}
/* uma volta do polling: com mapa aberto pergunta se o seq mudou; sem mapa, se apareceu um */
function mpPergunta(){
  if(!mpNaTela()||document.hidden)return;
  if(!MP.id){ mpCarregaLista().then(function(){ if(MP.lista.length)mpSincroniza(); }).catch(function(){ /* tenta de novo na proxima volta */ }); return; }
  var id=MP.id;
  api(mpAPI("/"+id+"?desde="+MP.seq)).then(function(r){
    if(String(id)!==String(MP.id))return;
    if(MP.arrastando)return;
    mpAplicaEstado(r);
  }).catch(function(e){ if(e?.status===404){ MP.id=null; mpSincroniza(); } });
}
function mpDesliga(){
  if(MP.es){ MP.es.close(); MP.es=null; }
  clearTimeout(MP.esT);
  if(MP.poll){ clearInterval(MP.poll); MP.poll=null; }
}
function mpZera(){
  MP.lista=[]; MP.id=null; MP.mapa=null; MP.els=[]; MP.seq=0; mpSelecionaIds([]); MP.carregado=false; MP.voltas=0; MP.ocultas={};
}
function mpModoTempoReal(){ if(MP.es){ return "sse"; } return MP.poll?"polling":""; }

var MP_EVENTOS={
  ola:function(){ mpSincroniza(); },
  ativo:function(d){
    MP.lista.forEach(function(m){ m.ativo=String(m.id)===String(d.ativo); });
    /* o jogador so ve o mapa ativo: trocou o ativo, troca o mapa dele */
    if(!GM){ mpZeraMapa(); mpSincroniza(); return; }
    if(MP.mapa)MP.mapa.ativo=String(MP.mapa.id)===String(d.ativo);
    mpRepinta();
  },
  lista:function(){ if(GM)mpSincroniza(); },
  mapa:function(d){
    mpTrocaNaLista(d.mapa);
    if(String(d.mapa?.id)!==String(MP.id))return;
    MP.mapa=d.mapa; MP.seq=Math.max(MP.seq,d.seq||0);
    mpRepinta();
  },
  elemento:function(d){
    if(String(d.mapa)!==String(MP.id))return;
    MP.seq=Math.max(MP.seq,d.seq||0);
    /* o token que a pessoa esta arrastando nao pula para tras com um eco antigo */
    if(MP.arrastando?.includes(String(d.el.id)))return;
    mpGuarda(d.el);
    mpRedesenhaTokens();
  },
  /* alguem apontou um ponto: aparece para todos por alguns segundos, sem ficar gravado */
  ping:function(d){
    if(String(d.mapa)!==String(MP.id))return;
    MP.pings.push({x:d.x,y:d.y,quem:d.meu?"":d.quem,t:Date.now()});
    mpDesenha();
  },
  /* a ordem de empilhar mudou: a lista vem de novo do servidor, que e quem sabe a ordem */
  ordem:function(d){
    if(String(d.mapa)!==String(MP.id))return;
    MP.seq=Math.max(MP.seq,d.seq||0);
    mpRecarrega();
  },
  turno:function(d){
    if(d.comIni&&!GM){
      var vz=MESA.ini?MESA.ini.vez+"/"+MESA.ini.rodada:"";
      MESA.ini=d.ini&&d.ini.lista?d.ini:null;
      var mi=$("#mIni"); if(mi){ mi.innerHTML=iniPubHtml(); }
      if(MESA.ini&&(MESA.ini.vez+"/"+MESA.ini.rodada)!==vz){ som("vez"); }
    }
    if(d.novo){ mpAvisaTurno(d.rodada); }
    if(d.mapa!=null&&String(d.mapa)===String(MP.id)&&(d.novo||(d.seq||0)>MP.seq)){ mpRecarregaTurno(); }
  },
  some:function(d){
    if(String(d.mapa)!==String(MP.id))return;
    MP.seq=Math.max(MP.seq,d.seq||0);
    MP.els=MP.els.filter(function(e){ return String(e.id)!==String(d.id); });
    mpPodaSel();
    mpRedesenhaTokens();
  }
};
function mpEvento(d){ var f=MP_EVENTOS[d.tipo]; if(f)f(d); }
function mpZeraMapa(){ MP.id=null; MP.mapa=null; MP.els=[]; MP.seq=0; mpSelecionaIds([]); }
function mpGuarda(el){
  var i=MP.els.findIndex(function(e){ return String(e.id)===String(el.id); });
  if(i>=0)MP.els[i]=el; else MP.els.push(el);
}

/* ---------- operacoes ---------- */
function mpFalhou(e,msg){ estadoSalvo("erro ao salvar",true); toast(e?.message||msg,"erro"); }
function mpGrava(promessa,msg){
  estadoSalvo("salvando…");
  return promessa.then(function(r){ estadoSalvo("salvo"); return r; }).catch(function(e){ mpFalhou(e,msg); throw e; });
}
/* Mover e otimista: o token ja esta no lugar novo; se o servidor recusar, volta. */
function mpMover(el,x,y,trilha){
  var ax=el.dados.x, ay=el.dados.y;
  el.dados.x=x; el.dados.y=y;
  mpDesenha();
  /* o trajeto so vai quando o mapa mede por ele: o servidor cobra o caminho andado (nunca menos que a reta) */
  var corpo={dados:{x:x,y:y}};
  if(trilha?.length){ corpo.trajeto=trilha.map(function(q){ return [mpArred(q[0]),mpArred(q[1])]; }); }
  return mpGrava(api(mpAPI("/"+MP.id+"/elementos/"+el.id),{method:"PUT",body:corpo}),"não consegui mover")
    .then(function(r){ if(r?.id){ mpGuarda(r); } mpRedesenhaTokens(); if(r?.passou){ mpAvisaLimite(r); } })
    .catch(function(){ el.dados.x=ax; el.dados.y=ay; mpDesenha(); });
}
/* modo "aviso" do mapa: o movimento valeu, mas passou do que o token tinha neste turno */
function mpAvisaLimite(r){
  var d=r.dados||{};
  toast("Passou do deslocamento deste turno: usou "+mpFmt(mpNum(d.usado,0))+" de "+mpFmt(mpNum(d.desl,0))+" "+mpUnidade()+".","aviso");
}
function mpMudaElemento(el,corpo,msg){
  return mpGrava(api(mpAPI("/"+MP.id+"/elementos/"+el.id),{method:"PUT",body:corpo}),msg||"não consegui salvar o "+vmin("token"))
    .then(function(r){ if(r?.id){ mpGuarda(r); } mpRedesenhaTokens(); return r; });
}
function mpCriaElemento(corpo,msg){
  return mpGrava(api(mpAPI("/"+MP.id+"/elementos"),{method:"POST",body:corpo}),msg||"não consegui pôr o "+vmin("token"))
    .then(function(r){ if(r?.id){ mpGuarda(r); mpSelecionaIds([r.id]); } mpRedesenhaTokens(); return r; });
}
/* Desenho novo: a forma e os pontos vem da ferramenta; cor, espessura e preenchimento do painel. */
function mpCriaDesenho(forma,pts,extra){
  var e=MP.estilo;
  return mpCriaElemento({tipo:"DESENHO",visivel:e.vis!==false,
    dados:{forma:forma,pts:pts.map(function(q){ return [mpArred(q[0]),mpArred(q[1])]; }),cor:e.cor,esp:e.esp,preench:e.preench,rotulo:extra?.rotulo||""}},
    "não consegui pôr o desenho").catch(function(){ /* o aviso ja saiu em mpGrava */ });
}
/* Varios de uma vez (mover ou organizar a selecao): uma operacao so no servidor, um desfazer so. */
function mpLote(itens,msg){
  return mpGrava(api(mpAPI("/"+MP.id+"/elementos"),{method:"PUT",body:{itens:itens}}),msg||"não consegui salvar").then(function(r){
    MP.seq=Math.max(MP.seq,r?.seq||0);
    (r?.itens||[]).forEach(function(x){
      if(x.removido){ MP.els=MP.els.filter(function(e){ return String(e.id)!==String(x.id); }); } else { mpGuarda(x); }
    });
    mpPodaSel(); mpRedesenhaTokens();
    return r;
  });
}
/* Acoes do painel sobre a selecao inteira (so o mestre). O que esta trancado nao entra: o servidor
   recusaria o grupo todo. */
function mpAcaoSelecao(k,valor){
  var todos=mpSelecionados(), els=todos.filter(function(e){ return !mpCamadaTrancada(mpCamadaDe(e)); });
  if(!todos.length){ return Promise.resolve(); }
  if(k==="remover"){ return mpRemoveSelecao(els,todos.length-els.length); }
  var itens;
  if(k==="trancar"){
    var tranca=!els.every(function(e){ return e.bloqueado; });
    itens=els.filter(function(e){ return !!e.bloqueado!==tranca; }).map(function(e){ return {id:e.id,bloqueado:tranca}; });
  } else if(k==="visivel"){
    var mostra=!els.every(function(e){ return e.visivel!==false; });
    itens=els.filter(function(e){ return !e.bloqueado; }).map(function(e){ return {id:e.id,visivel:mostra}; });
  } else if(k==="frente"||k==="tras"){
    /* a selecao mantem a ordem que tinha entre si: para ir a frente, o de baixo vai primeiro; para tras, o de cima */
    var idx=function(e){ return MP.els.indexOf(e); }, ord=els.filter(function(e){ return !e.bloqueado; }).sort(function(a,b){ return idx(a)-idx(b); });
    if(k==="tras"){ ord.reverse(); }
    itens=ord.map(function(e){ return {id:e.id,ordem:k}; });
  } else {
    itens=els.filter(function(e){ return !e.bloqueado&&mpCamadaDe(e)!==valor; }).map(function(e){ return {id:e.id,camada:valor}; });
  }
  if(!itens.length){ toast("Nada para mudar: o que está trancado precisa ser destrancado antes.","aviso"); return Promise.resolve(); }
  return mpLote(itens).catch(function(){ /* o aviso ja saiu em mpGrava */ });
}
function mpRemoveSelecao(els,deFora){
  var soltos=els.filter(function(e){ return !e.bloqueado; }), presos=els.length-soltos.length+deFora;
  if(!soltos.length){ toast("Está trancado: destranque para remover.","aviso"); return Promise.resolve(); }
  var mid=MP.id;
  return mpLote(soltos.map(function(e){ return {id:e.id,remover:true}; }),"não consegui remover").then(function(r){
    toastAcao(soltos.length+" removidos"+(presos?" ("+presos+" trancados ficaram)":""),"Desfazer",function(){
      if(String(MP.id)!==String(mid))return;
      mpDesfaz(r?.seq).then(function(ok){ if(ok){ toast("Desfeito"); } });
    });
  }).catch(function(){ /* o aviso ja saiu em mpGrava */ });
}
/* Remover nao pergunta: faz e oferece desfazer. Quem desfaz e o servidor (pelo seq da remocao):
   ele recria o token igual, com outro id, e o historico passa a apontar para o novo. */
function mpRemoveElemento(el){
  var mid=MP.id;
  return mpGrava(api(mpAPI("/"+mid+"/elementos/"+el.id),{method:"DELETE"}),"não consegui remover").then(function(r){
    MP.els=MP.els.filter(function(e){ return e!==el; });
    mpPodaSel();
    mpRedesenhaTokens();
    toastAcao((el.tipo==="DESENHO"?"Desenho":Vm("token"))+" removido","Desfazer",function(){
      if(String(MP.id)!==String(mid))return;
      mpDesfaz(r?.seq).then(function(ok){ if(ok){ toast("Desfeito"); } });
    });
  });
}
/* Desfaz a ultima acao desta pessoa no mapa (ou a do seq dado). Cada um desfaz so as proprias. */
function mpDesfaz(seq){
  var mid=MP.id;
  if(!mid){ return Promise.resolve(null); }
  return api(mpAPI("/"+mid+"/desfazer"),{method:"POST",body:seq?{seq:seq}:{}}).then(function(r){
    if(String(mid)!==String(MP.id)||!r){ return r; }
    MP.seq=Math.max(MP.seq,r.seq||0);
    /* um grupo desfeito volta inteiro: o primeiro vem nos campos de sempre, o resto em "outros" */
    var todos=[r].concat(r.outros||[]);
    todos.forEach(function(x){
      if(x.el){ mpGuarda(x.el); } else { MP.els=MP.els.filter(function(e){ return String(e.id)!==String(x.id); }); }
    });
    var vivos=todos.filter(function(x){ return x.el; }).map(function(x){ return x.id; });
    if(vivos.length){ mpSelecionaIds(vivos); } else { mpPodaSel(); }
    mpRedesenhaTokens();
    return r;
  }).catch(function(e){
    var nada=e?.status===409;
    toast(nada?"Não há nada seu para desfazer":(e?.message||"não consegui desfazer"),nada?"aviso":"erro");
    return null;
  });
}
/* ---------- turno ---------- */
/* O turno (a rodada da iniciativa) e o que zera o deslocamento; a vez e o que libera o token de cada
   um. A iniciativa mora no guia, que o servidor nao le: a cada mudanca dela o navegador do mestre
   manda o resumo (iniMudou, em momentos.js) e o servidor decide, avisa todo mundo e repassa a ordem
   publica aos jogadores sem esperar a mesa. */
function mpSincronizaTurno(s){
  if(!GM||!CID||!s){ return Promise.resolve(null); }
  var ini=iniDe(s), ordem=iniOrdem(ini), vez=ini.lista.find(function(x){ return x.id===ini.vez; })||ordem[0];
  var corpo={ativo:ordem.length>0,rodada:ini.rodada||1,vez:vez?mpTokenDaOrdem(vez):"",
    ids:ini.lista.map(mpTokenDaOrdem).filter(Boolean),ini:MESA.ini||null};
  return api(mpAPI("/turno"),{method:"PUT",body:corpo}).then(function(r){
    if(r?.novo){ mpAvisaTurno(r.rodada); }
    return r;
  }).catch(function(error_){ console.debug("turno do mapa:",error_?.message); return null; });
}
/* O elo e o id do token: cada entrada da ordem aponta para o seu (tokenId). Entrada antiga, que so tinha o
   elenco, acha o token do mapa aberto ligado ao mesmo alguem do elenco. */
function mpTokenDaOrdem(x){
  if(x.tokenId){ return String(x.tokenId); }
  if(!x.elencoId){ return ""; }
  var t=MP.els.find(function(e){ return e.tipo!=="DESENHO"&&String(e.dados?.elencoId||"")===String(x.elencoId); });
  return t?String(t.id):"";
}
/* Novo turno a mao: para quando nao ha iniciativa rodando. */
function mpNovoTurno(){
  if(!GM||!CID){ return Promise.resolve(null); }
  return api(mpAPI("/turno"),{method:"POST"}).catch(function(error_){ console.debug("turno do mapa:",error_?.message); return null; });
}
/* O aviso chega por mais de um caminho (o evento do mapa, a resposta do mestre, a sondagem da mesa):
   quem chegar primeiro avisa e os outros, dentro de poucos segundos, calam. */
function mpAvisaTurno(rodada){
  var agora=Date.now();
  if(agora-(MP.avisouEm||0)<4000){ return; }
  MP.avisouEm=agora;
  toast(rodada>0?Vm("turno")+" "+rodada+" começou":"Novo "+vmin("turno")+" começou","ok");
  som("vez");
}
/* o estado do mapa pede de novo, mas nunca por baixo de um token que a pessoa esta segurando */
function mpRecarregaTurno(){
  if(!MP.id){ return; }
  if(MP.arrastando){ setTimeout(mpRecarregaTurno,400); return; }
  mpRecarrega();
}
function mpCriaMapa(corpo){
  return mpGrava(api(mpAPI(),{method:"POST",body:corpo||{}}),"não consegui criar o "+vmin("mapa")).then(function(m){
    MP.lista.push(m); MP.querAbrir=m.id; return mpSincroniza().then(function(){ return m; }); });
}
function mpSalvaMapa(corpo){
  return mpGrava(api(mpAPI("/"+MP.id),{method:"PUT",body:corpo}),"não consegui salvar o "+vmin("mapa")).then(function(m){
    MP.mapa=m; mpTrocaNaLista(m); mpRepinta(); return m; });
}
function mpAtiva(id,liga){
  return mpGrava(api(mpAPI("/"+id+"/ativo"),{method:"POST",body:{ativo:liga}}),"não consegui trocar o "+vmin("mapa")+" ativo").then(function(r){
    MP_EVENTOS.ativo({ativo:r?r.ativo:null}); });
}
/* Aponta um ponto do mapa para todos. Sem SSE (polling) o proprio aviso nao volta, entao aparece aqui na hora. */
function mpPing(p){
  if(!MP.id){ return; }
  if(!MP.es){ MP.pings.push({x:p.x,y:p.y,quem:"",t:Date.now()}); mpDesenha(); }
  api(mpAPI("/"+MP.id+"/ping"),{method:"POST",body:{x:mpArred(p.x),y:mpArred(p.y)}}).catch(function(){ /* o aviso e so um aceno: se nao foi, nao ha o que refazer */ });
}
function mpApagaMapa(id){
  return mpGrava(api(mpAPI("/"+id),{method:"DELETE"}),"não consegui apagar o "+vmin("mapa")).then(function(){
    if(String(id)===String(MP.id))mpZeraMapa();
    return mpSincroniza(); });
}
