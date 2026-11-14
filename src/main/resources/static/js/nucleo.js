/* Estado global, utilidades, conversa com o servidor e entrada numa campanha. */
"use strict";

/* O guia tem um formato so, o 3. Guia gravado num formato anterior nao e convertido nem
   regravado: abre a tela de erro com o motivo, e o que esta no banco fica como esta. */
var FORMATO_GUIA=3;
var VAZIO={versao:FORMATO_GUIA,campanha:null,elenco:{personagens:[],npcs:[],locais:[],pistas:[]},sessoes:[],trilhaCategorias:[]};
var D=JSON.parse(JSON.stringify(VAZIO));
var S={view:"mesa",sessao:0,vmode:"canvas",rail:true,msec:"resumos",el:"personagens",bib:"livros",aj:""};
var saveT=null,USER=null,MYID=null,GM=false,PRONTO=false;
var VGUIA=-1,VMESA=-1,IACFG=false,sondaT=null;
var CID=null,CAMPANHAS=[],MIDIABASE="",ADMIN=false,PAPEL="JOGADOR",EU=null;

/* Dados de referência da campanha: o mestre lê do guia, o jogador da mesa. */
function PUBD(){ if(GM&&D&&D.campanha)return D.campanha; return MESA||{}; }
function cAPI(p){ return "/api/c/"+CID+p; }
/* Caminho de imagem do guia vira URL da mídia da campanha. */
function IMG(p){ var x=String(p==null?"":p); if(!x)return "";
  if(/^(https?:|data:|blob:|\/)/i.test(x))return x;
  return MIDIABASE+x.replace(/^\.?\//,""); }
function parametro(n){ try{ return new URLSearchParams(location.search).get(n)||""; }catch(e){ return ""; } }
function limparUrl(){ try{ history.replaceState({},"",location.pathname); }catch(e){} }

/* ---------- VOCABULÁRIO ---------- */
var VOCAB_PADRAO={campanha:"Campanha",campanhas:"Campanhas",sessao:"Sessão",sessoes:"Sessões",cena:"Cena",cenas:"Cenas",
 territorio:"Território",territorios:"Territórios",evidencia:"Evidência",evidencias:"Evidências",
 npc:"NPC",npcs:"NPCs",local:"Local",locais:"Locais",mestre:"Mestre",jogador:"Jogador",
 jogadores:"Jogadores",trilha:"Trilha",mesa:"Mesa",quadro:"Quadro",roteiro:"Roteiro",
 metodo:"Método",referencia:"Consulta rápida",ficha:"Ficha",fichas:"Fichas",
  personagem:"Personagem",personagens:"Personagens"};
function V(k){ var v=PUBD().vocab||{}; return v[k]||VOCAB_PADRAO[k]||k; }
function Vm(k){ var t=V(k); return t?t.charAt(0).toUpperCase()+t.slice(1):t; }
var MESA={resumos:[],ev:[],npcs:[],locais:[],at:0},mesaT=null;

/* Elemento solto, para casca de componente (toast, janela). Marcacao de verdade mora nos
   templates: htmlDe() em componentes.js. */
function el(t,a){var e=document.createElement(t);if(a)for(var k in a){
  if(k==="class")e.className=a[k];
  else if(k==="text")e.textContent=a[k];else if(k.slice(0,2)==="on")e[k]=a[k];
  else if(a[k]!=null&&a[k]!==false)e.setAttribute(k,a[k]);} return e;}
function $(s,r){return (r||document).querySelector(s);}
function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
function norm(s){return String(s==null?"":s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");}
document.addEventListener("click",function(e){
  var s=e.target&&e.target.closest?e.target.closest("summary"):null;
  if(s&&s.parentNode&&s.parentNode.classList)s.parentNode.classList.add("abriu");
},true);
function toast(m){var t=el("div",{"class":"toast",text:m});document.body.appendChild(t);setTimeout(function(){t.remove();},2200);}
function fmt(s){if(!isFinite(s))return "0:00";var m=Math.floor(s/60),x=Math.floor(s%60);return m+":"+(x<10?"0":"")+x;}
function catColor(c){var f=(D.trilhaCategorias||[]).filter(function(x){return x.id===c;})[0];return f?f.cor:"var(--fg3)";}
function curSess(){return D.sessoes[S.sessao]||null;}
function terr(s,id){var f=(s.territorios||[]).filter(function(t){return t.id===id;})[0];
  return f||{id:id,nome:"SEM TERRITÓRIO",cor:"#7d6e6b"};}
/* o contador evita id repetido quando varios nascem no mesmo milissegundo */
var UIDN=0;
function uid(p){return (p||"x")+Date.now().toString(36)+(++UIDN).toString(36)+Math.floor(Math.random()*1296).toString(36);}

/* Nome dos livros por extenso em qualquer lugar da tela. A sigla continua
   sendo a chave interna (upload, indice, data-doc); so a exibicao muda. */
function nomeDoc(ab){ var a=String(ab==null?"":ab).toUpperCase().trim(); if(!a)return "";
  if(typeof LIB!=="undefined"&&LIB.docs&&LIB.docs[a]&&LIB.docs[a].nome)return LIB.docs[a].nome;
  var ds=(typeof IDX!=="undefined"&&IDX&&IDX.docs)||[];
  for(var i=0;i<ds.length;i++){
    if(String(ds[i].abrev||"").toUpperCase()===a||String(ds[i].id||"").toUpperCase()===a)
      return ds[i].nome||a; }
  return ab; }
function refDoc(ab,p){ var n=nomeDoc(ab); return p?(n+" p."+p):n; }
function refLivro(txt){ var m=String(txt==null?"":txt).match(/^\s*([A-Za-z]{1,4}\d{0,2})\s*[Pp]\.?\s*(\d+)/);
  return m?refDoc(m[1],m[2]):nomeDoc(txt); }

function cacheGM(j){ try{localStorage.setItem("grim_gm_"+CID,j);}catch(e){} }
function lerCache(){ try{ var c=localStorage.getItem("grim_gm_"+CID); if(!c)return false;
  var v=JSON.parse(c); if(v&&v.sessoes&&v.sessoes.length&&(Number(v.versao)||0)>=FORMATO_GUIA){ D=v; normalizaCampanha(); return true; } }catch(e){} return false; }
function cookie(n){ var m=document.cookie.match(new RegExp("(^|; )"+n+"=([^;]*)")); return m?decodeURIComponent(m[2]):""; }
/* Token CSRF faltando ou trocado (cookie limpo, outra aba): o servidor responde 403 com
   codigo "csrf". Um GET qualquer devolve um cookie novo, e o pedido e repetido uma vez. */
function renovaCsrf(){ return fetch("/api/ping",{credentials:"same-origin",cache:"no-store"}).catch(function(){}); }
function api(url,opt,repetido){
  var orig=opt;
  opt=opt?Object.assign({},opt):{}; opt.credentials="same-origin"; opt.headers=Object.assign({},opt.headers||{});
  if(opt.body&&typeof opt.body==="object"&&!(opt.body instanceof FormData)){
    opt.headers["Content-Type"]="application/json;charset=UTF-8";
    opt.body=JSON.stringify(opt.body); }
  var m=(opt.method||"GET").toUpperCase();
  if(m!=="GET"&&m!=="HEAD"){ var t=cookie("XSRF-TOKEN"); if(t)opt.headers["X-XSRF-TOKEN"]=t; }
  return fetch(url,opt).then(function(r){
    if(r.status===401){ location.href="/paginas/login.html"; throw new Error("sessão expirada"); }
    if(r.status===204)return null;
    var ct=r.headers.get("content-type")||"";
    return (ct.indexOf("json")>=0?r.json():r.text()).then(function(b){
      if(r.status===403&&b&&b.codigo==="csrf"&&!repetido&&m!=="GET")
        return renovaCsrf().then(function(){ return api(url,orig,true); });
      if(!r.ok){ if(r.status===507)avisoArmazenamento();
        var e=new Error((b&&b.erro)||("HTTP "+r.status)); e.status=r.status; e.corpo=b; throw e; }
      return b; }); });
}
function estadoSalvo(t,erro){ var n=document.getElementById("saveSt"); if(!n)return;
  n.textContent=t||""; n.classList.toggle("erro",!!erro); }
function save(){ if(!GM)return;
  if(!CID||!D.campanha){ toast("Não vou salvar: o guia não está carregado"); return; }
  /* guia que nao chegou inteiro nao pode ser regravado por cima do que esta no banco */
  if(BOOTERR){ toast("Não vou salvar por cima: o guia não chegou inteiro. Recarregue a página."); return; }
  var j=JSON.stringify(D); cacheGM(j);
  estadoSalvo("salvando…");
  clearTimeout(saveT);
  saveT=setTimeout(function(){ gravaDoc("/guia",j,"guia"); },700); }
function gravaDoc(url,j,qual){
  function tenta(v,repetir){
    return api(cAPI(url),{method:"PUT",body:{json:j,versao:v}}).then(function(r){
      if(qual==="guia"){ VGUIA=r.versao; estadoSalvo("salvo"); } else VMESA=r.versao; })
     .catch(function(e){
       if(e.status===409&&e.corpo&&repetir){
         if(qual==="guia")VGUIA=e.corpo.versao; else VMESA=e.corpo.versao;
         return tenta(e.corpo.versao,false); }
       if(qual==="guia")estadoSalvo("não salvou",true);
       toast(qual==="guia"?"Não consegui salvar no servidor. A cópia local está guardada."
                          :"Não consegui publicar para a mesa"); });
  }
  return tenta(qual==="guia"?VGUIA:VMESA,true);
}
function salvarMesa(){ if(!GM)return;
  if(D&&D.campanha){ MESA.titulo=D.campanha.titulo||""; MESA.sistema=D.campanha.sistema||"";
    MESA.vocab=D.campanha.vocab||{}; MESA.referencia=D.campanha.referencia||[];
    MESA.sinonimos=D.campanha.sinonimos||{}; MESA.canonicas=D.campanha.canonicas||{};
    MESA.categoriasBusca=D.campanha.categoriasBusca||[]; }
  MESA.at=Date.now(); clearTimeout(mesaT);
  mesaT=setTimeout(function(){ gravaDoc("/mesa",JSON.stringify(MESA),"mesa"); },500); }
function aplicaMesa(m){ if(!m||!m.json)return; try{ var v=JSON.parse(m.json);
  if(v&&typeof v==="object"){ MESA={resumos:v.resumos||[],ev:v.ev||[],npcs:v.npcs||[],locais:v.locais||[],
    iaNome:v.iaNome||"",iaArt:v.iaArt||"ao",tema:v.tema||"",titulo:v.titulo||"",
    sistema:v.sistema||"",vocab:v.vocab||{},referencia:v.referencia||[],
    sinonimos:v.sinonimos||{},canonicas:v.canonicas||{},categoriasBusca:v.categoriasBusca||[],at:v.at||0,
    ini:v.ini||null,fichaModelo:v.fichaModelo||null,fichaFormula:v.fichaFormula}; } }catch(e){} }
function iaNome(){ return String(MESA.iaNome||"").trim()||"Claude"; }
function iaArt(){ var a=String(MESA.iaArt||"ao").trim(); return (a==="à"||a==="a")?a:"ao"; }
function iaPergunta(){ return "Perguntar "+iaArt()+" "+iaNome(); }
var mesaRT=null;
function refreshMesa(){ if(!PRONTO||S.view!=="mesa")return;
  clearTimeout(mesaRT);
  mesaRT=setTimeout(function(){ if(S.view!=="mesa")return;
    var mi=$("#mIni"); if(mi)mi.innerHTML=iniPubHtml();
    /* ficha aberta para edicao nao pode ser redesenhada por baixo de quem esta mexendo */
    if(S.msec==="fichas")return;
    var b=$("#mbody"); if(!b)return;
    try{ b.innerHTML=mesaSec(); hydrateMesa(); }catch(e){} },300); }
function sondaMesa(){ clearInterval(sondaT);
  sondaT=setInterval(function(){ if(document.hidden||!CID)return;
    api(cAPI("/mesa/versao")).then(function(r){
      if(!r||r.versao===VMESA)return;
      return api(cAPI("/mesa")).then(function(m){ VMESA=m.versao;
        var antes=idsMesa(), vz=MESA.ini?MESA.ini.vez+"/"+MESA.ini.rodada:"";
        aplicaMesa(m);
        aplicarTema(temaAtivo()); pintarMarca(); refreshMesa(); revelaNovos(antes); sugereTema();
        if(!GM&&MESA.ini&&(MESA.ini.vez+"/"+MESA.ini.rodada)!==vz)som("vez"); });
    }).catch(function(){});
    puxaRolagens(true); },6000); }

function boot(){
  try{ aplicarFx(); aplicarTema(temaAtivo()); }catch(e){}
  try{ $("#view").innerHTML=htmlDe("t-carregando"); }catch(e){}
  api("/api/sessao").then(function(s){
    EU=s; ADMIN=!!s.admin; IACFG=!!s.iaConfigurada; MYID=String(s.id||"");
    CAMPANHAS=s.campanhas||[];
    var cv=parametro("convite");
    if(!cv)return null;
    return api("/api/convites/"+encodeURIComponent(cv),{method:"POST"})
      .then(function(c){ limparUrl(); toast("Você entrou em "+c.nome);
        try{ localStorage.setItem("grim_cid",String(c.id)); }catch(e){}
        return api("/api/sessao").then(function(s2){ EU=s2; CAMPANHAS=s2.campanhas||[]; }); })
      .catch(function(e){ limparUrl(); toast((e&&e.message)||"convite inválido"); });
  }).then(function(){ escolherCampanha(); })
   .catch(function(e){ try{console.error("boot falhou:",e);}catch(_){}
     BOOTERR=(e&&(e.stack||e.message))||"sem sessão"; PRONTO=true; render(); });
}

function escolherCampanha(){
  if(!CAMPANHAS.length){ PRONTO=true; S.view="semcampanha"; render(); return; }
  var alvo=null;
  try{ var g=localStorage.getItem("grim_cid");
    if(g)alvo=CAMPANHAS.filter(function(c){return String(c.id)===String(g);})[0]||null; }catch(e){}
  if(!alvo&&CAMPANHAS.length===1)alvo=CAMPANHAS[0];
  if(!alvo){ PRONTO=true; S.view="escolher"; render(); return; }
  entrarNaCampanha(alvo.id);
}

function entrarNaCampanha(cid){
  var c=CAMPANHAS.filter(function(x){return String(x.id)===String(cid);})[0];
  if(!c){ toast("Campanha não encontrada"); return; }
  CID=c.id; PAPEL=c.papel; GM=(c.papel==="MESTRE"); MIDIABASE="/midia/c"+CID+"/";
  try{ localStorage.setItem("grim_cid",String(CID)); }catch(e){}
  PRONTO=false; BOOTERR=""; VGUIA=-1; VMESA=-1;
  D=JSON.parse(JSON.stringify(VAZIO));
  MESA={resumos:[],ev:[],npcs:[],locais:[],at:0};
  IDX=null; IDXp=null; CATp=null; PDFC={}; LIB={ok:false,faixas:{},docs:{}};
  try{ invalidaIndice(); }catch(e){}
  S.view=GM?"home":"mesa"; S.sessao=0; S.aberta=null; S.rbox=null; CV.init=false;
  S.msec="resumos"; S.resAb=null; S.el="personagens"; S.bib="livros"; S.aj=""; S.antes=null;
  try{ $("#view").innerHTML=htmlDe("t-abrindo",{logo:logoCss(""),nome:c.nome}); }catch(e){}

  var ps=[ api(cAPI("/mesa")).then(function(m){ VMESA=m.versao; aplicaMesa(m); }).catch(function(){}) ];
  if(GM) ps.push( api(cAPI("/guia")).then(function(g){ VGUIA=g.versao;
      try{ var v=JSON.parse(g.json||"{}");
        if(v&&v.campanha&&(Number(v.versao)||0)<FORMATO_GUIA)
          BOOTERR="este guia está num formato antigo, que esta versão do Grimório não converte mais. Nada foi alterado: o conteúdo continua salvo no servidor.";
        else if(v&&v.campanha)D=v;
        else { D=JSON.parse(JSON.stringify(VAZIO)); D.campanha={titulo:c.nome,sistema:c.sistema||""}; }
      }catch(e){ BOOTERR="JSON inválido no guia: "+((e&&e.message)||e); } })
    .catch(function(e){ BOOTERR="não consegui ler o guia: "+((e&&e.message)||e); }) );

  Promise.all(ps).then(function(){
    if(GM&&!D.campanha)D.campanha={titulo:c.nome,sistema:c.sistema||""};
    normalizaCampanha();
    PRONTO=true; aplicarTema(temaAtivo()); pintarMarca();
    render(); zeraDados(); puxaRolagens(false); sondaMesa();
    /* primeira vez com este papel: o tour vem antes, e a sugestao de tema espera ele acabar */
    if(!tourInicial())sugereTema();
    var rpOn=false; try{ rpOn=localStorage.getItem("grim_rolp")==="1"; }catch(e){}
    if(rpOn)painelRolagens(true); else if(rpAberto()){ feedDados([]); } if(GM)carregaCatalogo().then(function(){ if(S.view==="home")render(); });
  });
}


function normalizaSessao(s){
  if(!s||typeof s!=="object")return;
  if(!s.id)s.id=uid("s");
  if(!Array.isArray(s.territorios))s.territorios=[];
  if(!Array.isArray(s.cenas))s.cenas=[];
  s.cenas.forEach(function(c){ if(!c.id)c.id=uid("c"); if(!Array.isArray(c.blocos))c.blocos=[]; });
  if(!s.prep||typeof s.prep!=="object")s.prep={};
  ["terPronto","mecanicas"].forEach(function(k){ if(!Array.isArray(s.prep[k]))s.prep[k]=[]; });
  if(!s.eventosFixos||typeof s.eventosFixos!=="object")s.eventosFixos={};
  if(typeof s.eventosFixos.intro!=="string")s.eventosFixos.intro="";
  if(!Array.isArray(s.eventosFixos.lista))s.eventosFixos.lista=[];
  ["npcIds","localIds","pistaIds"].forEach(function(k){ if(!Array.isArray(s[k]))s[k]=[]; });
  ["plantado","resumo","titulo"].forEach(function(k){ if(typeof s[k]!=="string")s[k]=(s[k]==null?"":String(s[k])); });
}
function normalizaCampanha(){
  var c=D&&D.campanha; if(!c)return;
  ["titulo","sistema"].forEach(function(k){ if(typeof c[k]!=="string")c[k]=""; });
  if(!Array.isArray(c.indiceAS))c.indiceAS=[];
  if(!Array.isArray(c.referencia))c.referencia=[];
  if(!c.sinonimos||typeof c.sinonimos!=="object")c.sinonimos={};
  if(!c.canonicas||typeof c.canonicas!=="object")c.canonicas={};
  if(!Array.isArray(c.categoriasBusca))c.categoriasBusca=[];
  if(!c.vocab||typeof c.vocab!=="object")c.vocab={};
  if(!Array.isArray(D.sessoes))D.sessoes=[];
  if(!Array.isArray(D.trilhaCategorias))D.trilhaCategorias=[];
  if(!D.elenco||typeof D.elenco!=="object")D.elenco={};
  ["personagens","npcs","locais","pistas"].forEach(function(k){ if(!Array.isArray(D.elenco[k]))D.elenco[k]=[]; });
  D.versao=FORMATO_GUIA;
  if(typeof c.apresentacao!=="string")c.apresentacao="";
  if(!Array.isArray(c.secoes))c.secoes=[];
  c.secoes.forEach(function(s){ if(!s.id)s.id=uid("q"); if(!s.tipo)s.tipo="texto";
    if(!Array.isArray(s.itens))s.itens=[]; if(typeof s.texto!=="string")s.texto=""; if(typeof s.titulo!=="string")s.titulo=""; });
  D.elenco.personagens.forEach(function(p){ if(!Array.isArray(p.fichas))p.fichas=[]; });
  D.sessoes.forEach(normalizaSessao);
}
function tituloApp(){
  if(GM&&D&&D.campanha&&D.campanha.titulo)return D.campanha.titulo;
  return (MESA&&MESA.titulo)||"Grimório";
}
function pintarMarca(){
  var b=document.getElementById("brandNome"); if(b)b.textContent=tituloApp();
  var sb=document.getElementById("brandSub");
  if(sb)sb.textContent=GM?"Mesa do Mestre":"Mesa";
  try{ document.title=tituloApp(); }catch(e){}
}
