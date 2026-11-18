/* Tabletop: estado do mapa, conversa com o servidor e tempo real. */
"use strict";

/* O mapa nao mora no guia nem na mesa: cada token arrastado e uma operacao pequena no servidor
   (PUT de um elemento), e o servidor empurra o resultado para todos por SSE. Quem decide o que
   cada um ve e o servidor; a tela so desenha o que chegou.
   lista: os mapas que a pessoa enxerga (o jogador, so o ativo); id/mapa/els: o mapa aberto;
   seq: a ultima operacao que a tela conhece; sel: o elemento selecionado. */
var MP={lista:[],id:null,mapa:null,els:[],seq:0,sel:null,cid:null,carregado:false,querAbrir:null,
  es:null,esT:null,poll:null,voltas:0,arrastando:null};
var MP_POLL_MS=3000;
/* WIP: o tabletop esta em construcao (docs/plano-tabletop.md). Enquanto for true, so a
   administracao da instancia abre a aba Mapa; os outros veem o aviso. NAO tire antes de todas
   as fases do plano estarem prontas: a decisao e do dono. */
var MAPA_WIP=true;
function mapaBloqueado(){ return MAPA_WIP&&!ADMIN; }
/* Encaixar na grade: preferencia de quem usa (fica no navegador), ligada de saida. Com ela
   desligada o token fica onde foi solto; Alt inverte so naquele arraste. */
MP.encaixa=(function(){ try{ return localStorage.getItem("grim_mapa_encaixe")!=="0"; }catch(error_){ return true; } })();
function mpAlternaEncaixe(){
  MP.encaixa=!MP.encaixa;
  try{ localStorage.setItem("grim_mapa_encaixe",MP.encaixa?"1":"0"); }catch(error_){ /* sem armazenamento a escolha vale so ate recarregar */ }
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
    .then(function(r){ if(r?.id){ mpGuarda(r); } mpRedesenhaTokens(); })
    .catch(function(){ el.dados.x=ax; el.dados.y=ay; mpDesenha(); });
}
function mpMudaElemento(el,corpo){
  return mpGrava(api(mpAPI("/"+MP.id+"/elementos/"+el.id),{method:"PUT",body:corpo}),"não consegui salvar o "+vmin("token"))
    .then(function(r){ if(r?.id){ mpGuarda(r); } mpRedesenhaTokens(); return r; });
}
function mpCriaElemento(corpo){
  return mpGrava(api(mpAPI("/"+MP.id+"/elementos"),{method:"POST",body:corpo}),"não consegui pôr o "+vmin("token"))
    .then(function(r){ if(r?.id){ mpGuarda(r); MP.sel=r.id; } mpRedesenhaTokens(); return r; });
}
/* Remover nao pergunta: faz e oferece desfazer, que recria o token igual (com outro id). */
function mpRemoveElemento(el){
  var copia={tipo:el.tipo,dono:el.dono,visivel:el.visivel,dados:structuredClone(el.dados)};
  var mid=MP.id;
  return mpGrava(api(mpAPI("/"+mid+"/elementos/"+el.id),{method:"DELETE"}),"não consegui remover").then(function(){
    MP.els=MP.els.filter(function(e){ return e!==el; });
    if(String(MP.sel)===String(el.id))MP.sel=null;
    mpRedesenhaTokens();
    toastAcao(Vm("token")+" removido","Desfazer",function(){
      if(String(MP.id)!==String(mid))return;
      mpCriaElemento(copia).then(function(){ toast("Desfeito"); });
    });
  });
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
