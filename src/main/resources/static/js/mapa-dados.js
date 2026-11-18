/* Tabletop: estado do mapa, conversa com o servidor e tempo real. */
"use strict";

/* O mapa nao mora no guia nem na mesa: cada token arrastado e uma operacao pequena no servidor
   (PUT de um elemento), e o servidor empurra o resultado para todos por SSE. Quem decide o que
   cada um ve e o servidor; a tela so desenha o que chegou.
   lista: os mapas que a pessoa enxerga (o jogador, so o ativo); id/mapa/els: o mapa aberto;
   seq: a ultima operacao que a tela conhece; sel: o elemento selecionado. */
var MP={lista:[],id:null,mapa:null,els:[],seq:0,sel:null,cid:null,carregado:false,querAbrir:null,
  es:null,esT:null,poll:null,voltas:0,arrastando:null,
  ferramenta:"mover",regua:null,medida:null};
var MP_POLL_MS=3000;
/* WIP: o tabletop esta em construcao (docs/plano-tabletop.md). Enquanto a administracao nao liberar
   (Administracao > Mapa, `mapa.liberado` na tabela config, que vem em /api/sessao), so ela abre a
   aba Mapa; os outros veem o aviso. A decisao de liberar para todos e do dono. */
var MAPA_LIBERADO=false;
function mapaBloqueado(){ return !MAPA_LIBERADO&&!ADMIN; }
/* Encaixar na grade: preferencia de quem usa (fica no navegador), ligada de saida. Com ela
   desligada o token fica onde foi solto; Alt inverte so naquele arraste. */
MP.encaixa=(function(){ try{ return localStorage.getItem("grim_mapa_encaixe")!=="0"; }catch(error_){ return true; } })();
function mpAlternaEncaixe(){
  MP.encaixa=!MP.encaixa;
  try{ localStorage.setItem("grim_mapa_encaixe",MP.encaixa?"1":"0"); }catch(error_){ /* sem armazenamento a escolha vale so ate recarregar */ }
}

/* Ferramenta ativa: "mover" (arrasta token e fundo) ou "regua" (arrasta para medir). A regua e so
   de quem mede: nada dela vai para o servidor nem para os outros. */
function mpFerramenta(f){
  MP.ferramenta=f;
  if(f!=="regua"){ MP.regua=null; }
  var b=$("#mpRegua");
  if(b){ b.classList.toggle("on",f==="regua"); b.setAttribute("aria-pressed",String(f==="regua")); }
  if(MPC){ MPC.cv.classList.toggle("regua",f==="regua"); mpDesenha(); }
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
  if(troca){ MP.mapa=null; MP.els=[]; MP.seq=0; MP.sel=null; }
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
  if(MP.sel&&!mpEl(MP.sel))MP.sel=null;
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
  MP.lista=[]; MP.id=null; MP.mapa=null; MP.els=[]; MP.seq=0; MP.sel=null; MP.carregado=false; MP.voltas=0;
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
    if(MP.arrastando&&String(MP.arrastando)===String(d.el.id))return;
    mpGuarda(d.el);
    mpRedesenhaTokens();
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
    if(String(MP.sel)===String(d.id))MP.sel=null;
    mpRedesenhaTokens();
  }
};
function mpEvento(d){ var f=MP_EVENTOS[d.tipo]; if(f)f(d); }
function mpZeraMapa(){ MP.id=null; MP.mapa=null; MP.els=[]; MP.seq=0; MP.sel=null; }
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
function mpMover(el,x,y){
  var ax=el.dados.x, ay=el.dados.y;
  el.dados.x=x; el.dados.y=y;
  mpDesenha();
  return mpGrava(api(mpAPI("/"+MP.id+"/elementos/"+el.id),{method:"PUT",body:{dados:{x:x,y:y}}}),"não consegui mover")
    .then(function(r){ if(r?.id){ mpGuarda(r); } mpRedesenhaTokens(); if(r?.passou){ mpAvisaLimite(r); } })
    .catch(function(){ el.dados.x=ax; el.dados.y=ay; mpDesenha(); });
}
/* modo "aviso" do mapa: o movimento valeu, mas passou do que o token tinha neste turno */
function mpAvisaLimite(r){
  var d=r.dados||{};
  toast("Passou do deslocamento deste turno: usou "+mpFmt(mpNum(d.usado,0))+" de "+mpFmt(mpNum(d.desl,0))+" "+mpUnidade()+".","aviso");
}
function mpMudaElemento(el,corpo){
  return mpGrava(api(mpAPI("/"+MP.id+"/elementos/"+el.id),{method:"PUT",body:corpo}),"não consegui salvar o "+vmin("token"))
    .then(function(r){ if(r?.id){ mpGuarda(r); } mpRedesenhaTokens(); return r; });
}
function mpCriaElemento(corpo){
  return mpGrava(api(mpAPI("/"+MP.id+"/elementos"),{method:"POST",body:corpo}),"não consegui pôr o "+vmin("token"))
    .then(function(r){ if(r?.id){ mpGuarda(r); MP.sel=r.id; } mpRedesenhaTokens(); return r; });
}
/* Remover nao pergunta: faz e oferece desfazer. Quem desfaz e o servidor (pelo seq da remocao):
   ele recria o token igual, com outro id, e o historico passa a apontar para o novo. */
function mpRemoveElemento(el){
  var mid=MP.id;
  return mpGrava(api(mpAPI("/"+mid+"/elementos/"+el.id),{method:"DELETE"}),"não consegui remover").then(function(r){
    MP.els=MP.els.filter(function(e){ return e!==el; });
    if(String(MP.sel)===String(el.id))MP.sel=null;
    mpRedesenhaTokens();
    toastAcao(Vm("token")+" removido","Desfazer",function(){
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
    if(r.el){ mpGuarda(r.el); MP.sel=r.el.id; }
    else { MP.els=MP.els.filter(function(e){ return String(e.id)!==String(r.id); }); if(String(MP.sel)===String(r.id)){ MP.sel=null; } }
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
  var corpo={ativo:ordem.length>0,rodada:ini.rodada||1,vez:vez?vez.elencoId||"":"",
    ids:ini.lista.filter(function(x){ return x.elencoId; }).map(function(x){ return x.elencoId; }),ini:MESA.ini||null};
  return api(mpAPI("/turno"),{method:"PUT",body:corpo}).then(function(r){
    if(r?.novo){ mpAvisaTurno(r.rodada); }
    return r;
  }).catch(function(error_){ console.debug("turno do mapa:",error_?.message); return null; });
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
function mpApagaMapa(id){
  return mpGrava(api(mpAPI("/"+id),{method:"DELETE"}),"não consegui apagar o "+vmin("mapa")).then(function(){
    if(String(id)===String(MP.id))mpZeraMapa();
    return mpSincroniza(); });
}
