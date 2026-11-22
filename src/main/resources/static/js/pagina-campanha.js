/* Lista de campanhas e aba Campanha. */
"use strict";

/* ---------- HOME ---------- */
var BOOTERR="";
function viewVazio(){ return htmlDe("t-guia-falhou",{motivo:BOOTERR,antigo:BOOTERR===MSG_FORMATO_ANTIGO}); }
function hydrateVazio(){
  var r=$("#vwRetry"); if(r)r.onclick=function(){ recarregarGuia(); };
}
function recarregarGuia(){
  toast("Buscando o guia…");
  api(cAPI("/guia")).then(function(g){ VGUIA=g.versao;
    BOOTERR=aceitaGuia(g.json,null);
    if(!BOOTERR){ normalizaCampanha(); cacheGM(g.json); render(); toast("Guia carregado"); return; }
    render(); toast(BOOTERR);
  }).catch(function(e){ BOOTERR=(e&&e.message)||String(e); render(); toast("Falhou: "+BOOTERR); });
}
/* a capa e caminho relativo a midia DAQUELA campanha, nao da atual: por isso nao passa por IMG() */
function capaUrl(c){ return (c&&c.capa)?"/midia/c"+c.id+"/"+String(c.capa).replace(/^\.?\//,""):""; }
function capaHtml(c){
  return htmlDe("t-capa",{capa:capaUrl(c),inicial:String((c&&c.nome)||"?").trim().charAt(0).toUpperCase()});
}
var PACOTE=null;
function chaveDoTexto(t){
  t=String(t||"").trim();
  var m=t.match(/[?&]convite=([^&\s]+)/);
  if(m)return decodeURIComponent(m[1]);
  m=t.match(/\/([A-Za-z0-9]{10,})\s*$/);
  if(m)return m[1];
  return t;
}
/* sem campanha nenhuma, a mesma tela vira a de primeira entrada */
/* A linha do cartao com a sessao da vez: o servidor manda {tipo, rotulo, n, titulo} ja resumido
   (UltimaSessao), com a palavra que aquela campanha usa para "sessao". Sem nada, sem linha. */
function linhaSessaoDoCartao(txt){
  var s=null; try{ s=txt?JSON.parse(txt):null; }catch(error_){ s=null; /* resumo ilegivel: o cartao fica sem a linha */ }
  if(!s?.n)return "";
  var rot=s.rotulo||VOCAB_PADRAO.sessao;
  return (s.tipo==="proxima"?"Próxima: ":"Última: ")+rot+" "+s.n+(s.titulo?" · "+s.titulo:"");
}
function viewSemCampanha(){ return htmlDe("t-campanhas",{campanhas:null}); }
function viewEscolher(){
  return htmlDe("t-campanhas",{campanhas:CAMPANHAS.map(function(c){
    return {id:c.id,nome:c.nome,sistema:c.sistema,mestre:c.papel==="MESTRE",arquivada:!!c.arquivada,capa:capaHtml(c),
      sessao:linhaSessaoDoCartao(c.sessao)}; })});
}
function hydrateCampanhas(v){
  $$("[data-entrar]",v).forEach(function(b){ b.onclick=function(){
    entrarNaCampanha(b.dataset.entrar); }; });

  var pac=$("#ncPac",v);
  if(pac)pac.onclick=function(){ escolherArquivos(false,".zip").then(function(fs){
    PACOTE=fs[0]||null;
    var n=$("#ncPacNome",v); if(n)n.textContent=PACOTE?PACOTE.name:"Nenhum pacote escolhido"; }); };
  ligarOrigens(v);

  /* com campanhas, criar e entrar abrem por botao; a caixa aberta leva o foco ao primeiro campo */
  [["#ncAbreCriar","#cxCriar","#ncNome"],["#ncAbreEntrar","#cxEntrar","#ncChave"]].forEach(function(p){
    var b=$(p[0],v), cx=$(p[1],v); if(!b||!cx)return;
    b.onclick=function(){ var abre=cx.hidden; cx.hidden=!abre; b.setAttribute("aria-expanded",String(abre));
      if(abre){ cx.scrollIntoView({block:"nearest"}); $(p[2],v).focus(); } }; });

  var ent=$("#ncEntrar",v);
  if(ent)ent.onclick=function(){
    var k=chaveDoTexto(($("#ncChave",v)||{}).value);
    if(!k){ erroNoCampo($("#ncChave",v),"Cole a chave ou o link que quem mestra te passou."); return; }
    ent.disabled=true; ent.setAttribute("aria-busy","true");
    api("/api/convites/"+encodeURIComponent(k),{method:"POST"})
      .then(function(c){ toast("Você entrou em "+c.nome);
        return api("/api/sessao").then(function(s2){ CAMPANHAS=s2.campanhas||[]; entrarNaCampanha(c.id); }); })
      .catch(function(e){ ent.disabled=false; ent.removeAttribute("aria-busy"); erroNoCampo($("#ncChave",v),mensagemDeErro(e)); }); };

  var go=$("#ncGo",v);
  if(go)go.onclick=function(){
    var nome=($("#ncNome",v)||{}).value||"", sis=($("#ncSis",v)||{}).value||"";
    if(!nome.trim()){ erroNoCampo($("#ncNome",v),"Dê um nome à campanha."); return; }
    var origem=ORIGEM;
    if(origem==="pacote"&&!PACOTE){ toast("Escolha o pacote .zip, ou outra forma de começar.","aviso"); $("#ncPac",v).focus(); return; }
    go.disabled=true; go.setAttribute("aria-busy","true"); go.textContent="Criando…";
    api("/api/campanhas",{method:"POST",body:{nome:nome,sistema:sis}})
      .then(function(r){
        if(origem.startsWith("m:")){
          go.textContent="Montando a partir do modelo…";
          return api("/api/c/"+r.id+"/modelo/"+encodeURIComponent(origem.slice(2)),{method:"POST"})
            .then(function(imp){ toast(resumoPacote(imp)); return r; })
            .catch(function(e){ toast("Campanha criada, mas o modelo não entrou: "+mensagemDeErro(e),"erro"); return r; });
        }
        if(origem!=="pacote"||!PACOTE) return r;
        go.textContent="Importando pacote…";
        var fd=new FormData(); fd.append("arquivo",PACOTE); fd.append("substituir","true");
        return upload("/api/c/"+r.id+"/pacote",fd,function(fr){ go.textContent="Enviando o pacote… "+Math.round(fr*100)+"%"; })
          .then(function(imp){ toast(resumoPacote(imp)); return r; })
          .catch(function(e){ toast("Campanha criada, mas o pacote falhou: "+mensagemDeErro(e),"erro"); return r; });
      })
      .then(function(r){ PACOTE=null; ORIGEM="branco";
        return api("/api/sessao").then(function(s2){ CAMPANHAS=s2.campanhas||[]; entrarNaCampanha(r.id); }); })
      .catch(function(e){ go.disabled=false; go.removeAttribute("aria-busy"); go.textContent="Criar campanha"; toast(mensagemDeErro(e),"erro"); }); };
}
/* Como começar: em branco, de um modelo da instância ou de um pacote. Os modelos chegam depois
   da tela (vêm do servidor). O modelo é uma estrutura, não uma campanha: o nome continua o que a
   pessoa digitar (o servidor põe esse nome no guia). Só o sistema, se o modelo tiver um, entra no
   campo vazio; trocar de modelo troca de novo só o que ninguém digitou por cima. */
var ORIGEM="branco", MODELOS=[];
function dadosOrigens(){
  return {escolhido:ORIGEM,modelos:MODELOS.map(function(m){
    return {id:m.id,nome:m.nome,sistema:m.sistema,descricao:m.descricao,
      capa:m.temCapa?"/api/modelos/"+encodeURIComponent(m.id)+"/capa":"",
      inicial:String(m.nome||"?").trim().charAt(0).toUpperCase()}; })};
}
function pintaOrigens(v){
  var box=$("#ncOrigens",v); if(!box)return;
  if(ORIGEM.startsWith("m:")&&!MODELOS.some(function(m){ return "m:"+m.id===ORIGEM; }))ORIGEM="branco";
  box.innerHTML=htmlDe("t-origens",dadosOrigens());
  var pl=$("#ncPacLinha",v); if(pl)pl.hidden=(ORIGEM!=="pacote");
  var auto={sistema:""};
  $$("input[name=ncOrigem]",box).forEach(function(r){ r.onchange=function(){
    ORIGEM=r.value; if(pl)pl.hidden=(ORIGEM!=="pacote");
    var m=MODELOS.find(function(x){ return "m:"+x.id===ORIGEM; });
    var cp=$("#ncSis",v);
    if(cp&&(!cp.value.trim()||cp.value===auto.sistema)){ auto.sistema=m?String(m.sistema||""):""; cp.value=auto.sistema; } }; });
}
function ligarOrigens(v){
  pintaOrigens(v);
  api("/api/modelos").then(function(l){ MODELOS=Array.isArray(l)?l:[]; if(MODELOS.length)pintaOrigens(v); })
    .catch(function(){ MODELOS=[]; });
}
/* erro de um campo solto (fora do formulario()): mensagem embaixo dele, aria-invalid e foco */
function erroNoCampo(campo,msg){ if(!campo)return;
  var id=campo.id+"-erro", e=document.getElementById(id);
  if(!e){ e=el("span",{"class":"dica erro",id:id}); campo.insertAdjacentElement("afterend",e);
    campo.setAttribute("aria-describedby",((campo.getAttribute("aria-describedby")||"")+" "+id).trim());
    campo.addEventListener("input",function(){ campo.removeAttribute("aria-invalid"); e.textContent=""; e.hidden=true; }); }
  e.textContent=msg; e.hidden=false; campo.setAttribute("aria-invalid","true"); campo.focus();
}
function trocarCampanha(){
  api("/api/sessao").then(function(s2){ EU=s2; ADMIN=!!s2.admin; CAMPANHAS=s2.campanhas||[];
    CID=null; GM=false; PRONTO=true; S.view=CAMPANHAS.length?"escolher":"semcampanha"; desligaAvisos();
    /* fora da campanha volta o tema da pessoa */
    TEMA_PREVIA=null; trocarTema(temaAtivo()); pintarMarca();
    render(); }).catch(function(e){ toast("Não consegui listar suas campanhas. "+mensagemDeErro(e),"erro"); });
}
/* ---------- navegacao interna de uma pagina ---------- */
function subnav(itens,atual,attr,rotulo){
  return htmlDe("t-subnav",{rotulo:rotulo||null,itens:itens.map(function(x){ var a={}; a[attr]=x[0];
    return {attrs:a,texto:x[1],on:atual===x[0]}; })});
}

/* ---------- ABA CAMPANHA ---------- */
var TIPOS_SEC=[["texto","Texto corrido"],["lista","Lista de itens"],["cartoes","Cartões (título e explicação)"]];
function passosCampanha(){
  var c=D.campanha;
  return [
    {ok:!!(c.apresentacao||c.secoes.length),t:"Apresente a "+V("campanha").toLowerCase(),
     d:"Uma ou duas frases sobre o que ela é. Depois, as seções que quiser: tom, regras da casa, o que for.",b:"Escrever",a:"cp-ed"},
    {ok:D.elenco.personagens.length>0,t:"Cadastre os "+V("personagens").toLowerCase(),
     d:"Retrato, quem joga e as fichas para mostrar na tela.",b:"Abrir o elenco",a:"ir-elenco"},
    {ok:D.sessoes.length>0,t:"Crie a primeira "+V("sessao").toLowerCase(),
     d:"Cenas num quadro, com texto para ler, pistas, testes e trilha.",b:"Criar",a:"ir-sessoes"},
    {ok:!!LIB.ok,t:"Suba livros, trilha e imagens",
     d:"Os PDFs entram na busca, e você decide quais os jogadores veem.",b:"Abrir a biblioteca",a:"ir-bib"},
    {ok:null,t:"Convide a mesa",d:"Um link por pessoa. Quem não tem conta cria na hora.",b:"Convidar",a:"ir-mesa"}
  ];
}
/* Primeiros passos: dispensar vale para quem dispensou (neste aparelho), e a caixa some sozinha
   quando todos os passos que da para conferir estao feitos. */
function chavePassos(){ return "grim_passos_"+CID+"_"+(MYID||"0"); }
/* dispensar vale para a conta (como o tour visto), com o navegador de reserva */
function passosDispensados(){
  if((EU?.toursVistos||[]).indexOf("passos-"+CID)>=0)return true;
  try{ return localStorage.getItem(chavePassos())==="1"; }catch(error_){ return false; } }
function viewHome(){
  var c=D.campanha;
  if(!c||BOOTERR)return viewVazio();
  var ps=passosCampanha(), falta=ps.some(function(p){return p.ok===false;});
  var prox=D.sessoes.find(function(s){return s.status!=="encerrada";});
  return htmlDe("t-home",{c:c,guia:botaoGuia(),
    passos:falta&&!c.semPassos&&!passosDispensados()?ps:null,
    nSessoes:D.sessoes.length,
    proxima:prox?{id:prox.id,numero:prox.numero,titulo:prox.titulo,resumo:prox.resumo,estado:estadoSessao(prox)}:null,
    secoes:c.secoes.map(function(s,i){ var tem=s.itens.length&&(s.tipo==="lista"||s.tipo==="cartoes");
      return {i:i,titulo:s.titulo,tipo:s.tipo,texto:s.texto,itens:s.itens,vazia:!s.texto&&!tem}; }),
    /* o indice tem tres niveis (grupo, item, subitem); vira uma lista so, cada linha com a classe do nivel */
    indice:c.indiceAS.map(function(d){ var l=[];
      (d.grupos||[]).forEach(function(g){ l.push({cls:"g",t:g.t,ref:d.doc,p:g.p});
        (g.itens||[]).forEach(function(it){ l.push({cls:"s",t:it.t,ref:d.doc,p:it.p});
          (it.sub||[]).forEach(function(s2){ l.push({cls:"s2",t:s2.t,ref:d.doc,p:s2.p}); }); }); });
      return {nome:d.nome,linhas:l}; })});
}
function editarCampanha(){
  var c=D.campanha;
  formulario("Sobre a "+V("campanha").toLowerCase(),[
      {k:"titulo",rot:"Nome",obrig:true},
      {k:"sistema",rot:"Sistema de regras",dica:"Entra no contexto que a IA recebe."},
      {k:"apresentacao",rot:"Apresentação",tipo:"area",linhas:5,dica:"Uma ou duas frases: do que se trata."}],
    {titulo:c.titulo,sistema:c.sistema,apresentacao:c.apresentacao},
    {salvar:function(w){
      c.titulo=String(w.titulo).trim(); c.sistema=String(w.sistema||"").trim(); c.apresentacao=w.apresentacao;
      save(); salvarMesa(); render();
      /* o nome tambem mora na tabela de campanhas (lista, convites): os dois andam juntos */
      api("/api/campanhas/"+CID,{method:"PUT",body:{nome:c.titulo,sistema:c.sistema}})
        .then(function(){ return api("/api/sessao"); })
        .then(function(s2){ if(s2&&s2.campanhas)CAMPANHAS=s2.campanhas; }).catch(function(){}); }});
}
function editarSecao(i,tipo){
  var c=D.campanha, nova=i<0;
  var s=nova?{id:uid("q"),titulo:"",tipo:tipo,texto:"",itens:[]}:c.secoes[i];
  if(!s)return;
  var campos=[{k:"titulo",rot:"Título da seção",obrig:true},
    {k:"texto",rot:s.tipo==="texto"?"Texto":"Texto de abertura (opcional)",tipo:"area",linhas:s.tipo==="texto"?10:3}];
  if(s.tipo==="lista")campos.push({k:"itens",rot:"Itens",tipo:"linhas",linhas:8});
  if(s.tipo==="cartoes")campos.push({k:"itens",rot:"Cartões",tipo:"grupo",um:"cartão",novo:function(){return {t:"",d:""};},
    campos:[{k:"t",rot:"Título"},{k:"d",rot:"Explicação",tipo:"area",linhas:3}]});
  formulario(nova?"Nova seção":"Editar seção",campos,s,{wide:true,
    salvar:function(w){ if(nova)c.secoes.push(w); else c.secoes[i]=w; save(); render(); },
    rotRemover:"Remover seção",
    remover:nova?null:function(){ comDesfazer("Seção removida",function(){ c.secoes.splice(i,1); }); }});
}
function ligarPdfs(v){
  $$("[data-doc]",v).forEach(function(b){b.onclick=function(){
    var m=/([A-Z]+\d*)\s*p?\.?\s*(\d+)/i.exec(b.dataset.doc);
    if(m)abrirPdf(m[1].toUpperCase(),+m[2]);
  };});
  $$("[data-open]",v).forEach(function(b){b.onclick=function(){
    var pr=b.dataset.open.split(":"); abrirPdf(pr[0],+pr[1]);
  };});
}
/* Grade em linhas deixava vaos do tamanho da diferenca de altura entre vizinhas. Com linhas de
   4px, cada secao pede as linhas da propria altura: fecha os vaos e mantem a ordem do DOM (a
   mesma do arraste). Com masonry nativo do CSS nao faz nada. */
var MASONRY=(typeof CSS!=="undefined")&&(CSS.supports("grid-template-rows","masonry")||CSS.supports("display","grid-lanes"));
function arranjaGrade(g){
  if(!g||MASONRY)return;
  var colunas=getComputedStyle(g).gridTemplateColumns.trim().split(/\s+/).length;
  g.classList.toggle("arranjada",colunas>1);
  Array.prototype.forEach.call(g.children,function(s){
    var mb=Number.parseFloat(getComputedStyle(s).marginBottom)||0;
    s.style.gridRowEnd=colunas>1?"span "+Math.ceil((s.offsetHeight+mb)/4):""; });
}
var arranjoT=null;
window.addEventListener("resize",function(){ clearTimeout(arranjoT);
  arranjoT=setTimeout(function(){ arranjaGrade($("#view .seccols")); },120); });
function hydrateHome(v){
  if(!D.campanha||BOOTERR){ hydrateVazio(); return; }
  ligarPdfs(v); ligarSessoes(v);
  var grade=$(".seccols",v);
  arranjaGrade(grade);
  if(grade&&window.ResizeObserver){ var ro=new ResizeObserver(function(){ ro.disconnect(); arranjaGrade(grade); }); ro.observe(grade); }
  $$("[data-cp]",v).forEach(function(b){ b.onclick=function(){ var a=b.dataset.cp;
    if(a==="cp-ed")editarCampanha();
    else if(a==="cp-semp"){ try{ localStorage.setItem(chavePassos(),"1"); }catch(error_){ /* sem armazenamento: vale a conta */ }
      marcaTourVisto("passos-"+CID); render(); }
    else if(a==="ir-elenco"){ S.view="elenco"; S.el="personagens"; render(); }
    else if(a==="ir-sessoes"){ S.view="sessoes"; render(); }
    else if(a==="ir-bib"){ S.view="biblioteca"; render(); }
    else if(a==="ir-mesa"){ S.view="ajustes"; S.aj="mesa"; render(); }
    else if(a==="idx-ed")editarIndice();
    else if(a==="sec-add")escolher("Que tipo de seção?",TIPOS_SEC.map(function(t){return {v:t[0],l:t[1]};})
        .concat(D.campanha.indiceAS.length?[]:[{v:"indice",l:"Índice de livro (atalhos para páginas do PDF)"}]),
      function(t){ if(t==="indice")editarIndice(); else editarSecao(-1,t); }); }; });
  $$("[data-sec]",v).forEach(function(b){ b.onclick=function(){ editarSecao(+b.dataset.sec); }; });
}
/* as secoes da pagina da campanha trocam de lugar arrastando pelo cabecalho (js/ordenar.js) */
ORDENA.secoes=function(_l,de,para){ if(moverNaLista(D.campanha.secoes,de,para)){ save(); render(); } };
