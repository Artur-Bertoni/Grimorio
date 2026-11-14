/* Lista de campanhas e aba Campanha. */
"use strict";

/* ---------- HOME ---------- */
var BOOTERR="";
function viewVazio(){ return htmlDe("t-guia-falhou",{motivo:BOOTERR}); }
function hydrateVazio(){
  var r=$("#vwRetry"); if(r)r.onclick=function(){ recarregarGuia(); };
}
function recarregarGuia(){
  toast("Buscando o guia…");
  api(cAPI("/guia")).then(function(g){ VGUIA=g.versao;
    var v=JSON.parse(g.json||"{}");
    if(v&&v.campanha){ D=v; BOOTERR=""; normalizaCampanha(); cacheGM(g.json); render(); toast("Guia carregado"); return; }
    BOOTERR="o guia no servidor está vazio"; render(); toast(BOOTERR);
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
function viewSemCampanha(){ return htmlDe("t-campanhas",{campanhas:null}); }
function viewEscolher(){
  return htmlDe("t-campanhas",{campanhas:CAMPANHAS.map(function(c){
    return {id:c.id,nome:c.nome,sistema:c.sistema,mestre:c.papel==="MESTRE",arquivada:!!c.arquivada,capa:capaHtml(c)}; })});
}
function hydrateCampanhas(v){
  $$("[data-entrar]",v).forEach(function(b){ b.onclick=function(){
    entrarNaCampanha(b.getAttribute("data-entrar")); }; });

  var pac=$("#ncPac",v);
  if(pac)pac.onclick=function(){ escolherArquivos(false,".zip").then(function(fs){
    PACOTE=fs[0]||null;
    var n=$("#ncPacNome",v); if(n)n.textContent=PACOTE?PACOTE.name:"Nenhum pacote escolhido"; }); };

  var ent=$("#ncEntrar",v);
  if(ent)ent.onclick=function(){
    var k=chaveDoTexto(($("#ncChave",v)||{}).value);
    if(!k){ toast("Cole a chave do convite"); return; }
    ent.disabled=true;
    api("/api/convites/"+encodeURIComponent(k),{method:"POST"})
      .then(function(c){ toast("Você entrou em "+c.nome);
        return api("/api/sessao").then(function(s2){ CAMPANHAS=s2.campanhas||[]; entrarNaCampanha(c.id); }); })
      .catch(function(e){ ent.disabled=false; toast((e&&e.message)||"chave inválida"); }); };

  var go=$("#ncGo",v);
  if(go)go.onclick=function(){
    var nome=($("#ncNome",v)||{}).value||"", sis=($("#ncSis",v)||{}).value||"";
    if(!nome.trim()){ toast("Dê um nome à campanha"); return; }
    go.disabled=true; go.textContent="Criando…";
    api("/api/campanhas",{method:"POST",body:{nome:nome,sistema:sis}})
      .then(function(r){
        if(!PACOTE) return r;
        go.textContent="Importando pacote…";
        var fd=new FormData(); fd.append("arquivo",PACOTE); fd.append("substituir","true");
        return upload("/api/c/"+r.id+"/pacote",fd,null)
          .then(function(imp){ toast((imp.indices||0)+" índices e "+(imp.imagens||0)+" imagens importados"); return r; })
          .catch(function(e){ toast("Campanha criada, mas o pacote falhou: "+((e&&e.message)||e)); return r; });
      })
      .then(function(r){ PACOTE=null;
        return api("/api/sessao").then(function(s2){ CAMPANHAS=s2.campanhas||[]; entrarNaCampanha(r.id); }); })
      .catch(function(e){ go.disabled=false; go.textContent="Criar"; toast((e&&e.message)||"não deu"); }); };
}
function trocarCampanha(){
  api("/api/sessao").then(function(s2){ EU=s2; ADMIN=!!s2.admin; CAMPANHAS=s2.campanhas||[];
    CID=null; GM=false; PRONTO=true; S.view=CAMPANHAS.length?"escolher":"semcampanha";
    try{ localStorage.removeItem("grim_cid"); }catch(e){}
    render(); }).catch(function(){ toast("não consegui listar suas campanhas"); });
}
/* ---------- navegacao interna de uma pagina ---------- */
function subnav(itens,atual,attr){
  return htmlDe("t-subnav",{itens:itens.map(function(x){ var a={}; a[attr]=x[0];
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
function viewHome(){
  var c=D.campanha;
  if(!c||BOOTERR)return viewVazio();
  var ps=passosCampanha(), falta=ps.slice(0,3).some(function(p){return !p.ok;});
  var prox=D.sessoes.filter(function(s){return s.status!=="encerrada";})[0];
  return htmlDe("t-home",{c:c,
    passos:falta&&!c.semPassos?ps:null,
    nSessoes:D.sessoes.length,proxima:prox?linhaSessao(prox):"",
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
    var m=/([A-Z]+\d*)\s*p?\.?\s*(\d+)/i.exec(b.getAttribute("data-doc"));
    if(m)abrirPdf(m[1].toUpperCase(),+m[2]);
  };});
  $$("[data-open]",v).forEach(function(b){b.onclick=function(){
    var pr=b.getAttribute("data-open").split(":"); abrirPdf(pr[0],+pr[1]);
  };});
}
function hydrateHome(v){
  if(!D.campanha||BOOTERR){ hydrateVazio(); return; }
  ligarPdfs(v); ligarSessoes(v);
  $$("[data-cp]",v).forEach(function(b){ b.onclick=function(){ var a=b.getAttribute("data-cp");
    if(a==="cp-ed")editarCampanha();
    else if(a==="cp-semp"){ D.campanha.semPassos=true; save(); render(); }
    else if(a==="ir-elenco"){ S.view="elenco"; S.el="personagens"; render(); }
    else if(a==="ir-sessoes"){ S.view="sessoes"; render(); }
    else if(a==="ir-bib"){ S.view="biblioteca"; render(); }
    else if(a==="ir-mesa"){ S.view="ajustes"; S.aj="mesa"; render(); }
    else if(a==="idx-ed")editarIndice();
    else if(a==="sec-add")escolher("Que tipo de seção?",TIPOS_SEC.map(function(t){return {v:t[0],l:t[1]};})
        .concat(D.campanha.indiceAS.length?[]:[{v:"indice",l:"Índice de livro (atalhos para páginas do PDF)"}]),
      function(t){ if(t==="indice")editarIndice(); else editarSecao(-1,t); }); }; });
  $$("[data-sec]",v).forEach(function(b){ b.onclick=function(){ editarSecao(+b.getAttribute("data-sec")); }; });
  $$("[data-secmv]",v).forEach(function(b){ b.onclick=function(){
    var pr=b.getAttribute("data-secmv").split(":"), l=D.campanha.secoes, i=+pr[0], j=i+(+pr[1]);
    if(j<0||j>=l.length)return;
    var t=l[i]; l[i]=l[j]; l[j]=t; save(); render(); }; });
}
