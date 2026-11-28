/* Blocos de cena, cena aberta e acoes da sessao. */
"use strict";

/* ---------- BLOCOS DE CENA ---------- */
var TIPOS=[["leitura","Leitura em voz alta"],["lista","Lista"],["quem","Quem está lá"],
  ["avancar","Para avançar"],["dialogo","Diálogo"],["nota","Segredo só seu"],["testes","Testes"],
  ["trilha","Trilha"],["imagens","Imagens"]];
var MARCAS=[["nota","sem marca"],["gancho","gancho"],["pista","pista"],["item","item"],["forcado","obrigatório"]];
function nomeTipo(t){ var f=TIPOS.find(function(x){return x[0]===t;}); return f?f[1]:t; }
function novoBloco(tipo){
  if(tipo==="leitura")return {tipo:tipo,rotulo:"",nota:"",texto:""};
  if(tipo==="nota")return {tipo:tipo,rotulo:"",texto:""};
  return {tipo:tipo,rotulo:"",itens:[]};
}
/* Bloco aberto (js/nolugar.js): cada tipo ganha os "+" dele no rodape, e a lista vazia ja abre com um item */
var NOVO_DO_BLOCO={lista:"txt",quem:"quem",avancar:"avancar",dialogo:"fala",testes:"teste",trilha:"faixa"};
var ADD_DO_BLOCO={lista:"item",quem:"pessoa",avancar:"item",dialogo:"fala",testes:"teste",trilha:"faixa"};
NL_ALVOS.blk=function(cid,bi){
  var c=cena(cid), i=+bi, b=c?.blocos?.[i];
  if(!b){ return null; }
  return {obj:b,grava:save,limpa:nlLimpa,
    abre:function(x){ if(Array.isArray(x.itens)&&!x.itens.length&&NOVO_DO_BLOCO[x.tipo]){ x.itens.push(NL_NOVO[NOVO_DO_BLOCO[x.tipo]]()); } },
    tira:function(){ c.blocos.splice(i,1); },
    remove:function(){ comDesfazer("Bloco removido",function(){ c.blocos.splice(i,1); }); },
    /* a faixa escolhida traz a categoria dela (a cor do ponto) */
    mudou:function(p){ var m=/^(itens\.\d+)\.faixa$/.exec(p); if(!m){ return; }
      var tr=pget(b,m[1]), f=LIB.faixas[keyF(tr.faixa)]; tr.cat=f?f.cat:""; }};
};
function blocoHtml(c,b,bi){
  var k="blk:"+c.id+":"+bi, ed=nlEd(k), it=Array.isArray(b.itens)?b.itens:[];
  /* resultado de teste que comeca com numero ("15 · acha a porta") ganha o numero em destaque */
  if(b.tipo==="testes"&&!ed)it=it.map(function(t){
    return {p:t.p,t:t.t,f:(t.f||[]).map(function(f){ var m=/^(\d+\+?)\s*[·:-]([\s\S]*)$/.exec(f);
      return m?{num:m[1],txt:m[2].trimStart()}:{num:"",txt:f}; })}; });
  var rot=b.rotulo||nomeTipo(b.tipo);
  return htmlDe("t-bloco",{cid:c.id,bi:bi,b:b,itens:it,rotulo:rot,mestre:GM,ed:ed,k:k,lapis:nlLapis(k,"o bloco "+rot),
    fim:ed?nlFim(ADD_DO_BLOCO[b.tipo]?[{rot:ADD_DO_BLOCO[b.tipo],p:"itens",novo:NOVO_DO_BLOCO[b.tipo]}]:[],"Remover bloco"):"",
    faixas:ed&&b.tipo==="trilha"?Object.keys(LIB.faixas||{}).map(function(f){ return LIB.faixas[f].nome; }):[]});
}

/* ---------- CENA / SESSAO ---------- */
function blkDe(c,tipo){ return (c.blocos||[]).find(function(b){return b.tipo===tipo;}); }
function ckHtml(c,rotulo){ return htmlDe("t-ck",{cid:c.id,feito:!!c.feito,rotulo:rotulo||"Marcar como feita"}); }
function ferrCena(c){ return htmlDe("t-ferr-cena",{cid:c.id,lapis:nlLapis("scn:"+c.id,"a "+vmin("cena")+" "+c.titulo)}); }
/* o cabecalho da cena aberto: rotulo, titulo, territorio e "obrigatoria" no lugar; o rodape fica no comeco do corpo */
function cabecaCena(s,c){
  var k="scn:"+c.id, ed=nlEd(k);
  if(!ed){ return {k:k,ed:false,fim:"",campos:""}; }
  var cab={territorios:s.territorios.map(function(t){ return {id:t.id,nome:t.nome,on:t.id===c.territorio}; })};
  return {k:k,ed:true,fim:nlFim([],"Remover "+vmin("cena")),campos:htmlDe("t-cena-campos",{c:c,cab:cab,terr:terr(s,c.territorio)})};
}
NL_ALVOS.scn=function(cid){
  var s=curSess(), c=cena(cid);
  if(!c){ return null; }
  function fora(){ s.cenas=s.cenas.filter(function(x){ return x!==c; }); }
  return {obj:c,grava:save,
    vazio:function(x){ return !String(x.titulo||"").trim()&&!(x.blocos||[]).length; },
    tira:fora,
    fecha:function(x){ x.titulo=String(x.titulo||"").trim()||"Sem título"; x.n=String(x.n||"").trim(); },
    remove:function(){ comDesfazer(Vm("cena")+" removida",fora); }};
};
function scnHtml(s,c){
  return htmlDe("t-scn",{c:c,k:s.cenas.indexOf(c),terr:terr(s,c.territorio),aberta:S.aberta===c.id,ck:ckHtml(c),ferr:ferrCena(c),
    cab:cabecaCena(s,c),corpo:cenaBodyHtml(c)});
}
function cenaBodyHtml(c){
  return htmlDe("t-cena-corpo",{cid:c.id,blocos:(c.blocos||[]).map(function(b,bi){ return blocoHtml(c,b,bi); }).join("")});
}
var CMODAL=null;
function hydrateCena(root){
  $$("[data-pedir]",root).forEach(function(b){ b.onclick=function(e){ e.stopPropagation(); pedirTeste(b.dataset.pedir); }; });
  $$("[data-blur]",root).forEach(function(n){n.onclick=function(){n.classList.add("rev");};});
  $$("[data-lb]",root).forEach(function(n){n.onclick=function(){projetar(n.dataset.lb);};});
  $$("[data-faixa]",root).forEach(function(b){b.onclick=function(){ tocar(b.dataset.faixa); };});
}
function cenaModalBody(s,c){
  return htmlDe("t-cena-modal",{c:c,terr:terr(s,c.territorio),ck:ckHtml(c),ferr:ferrCena(c),cab:cabecaCena(s,c),corpo:cenaBodyHtml(c)});
}
function abrirCenaModal(id){
  var s=curSess(); if(!s)return;
  var c=null,i; for(i=0;i<s.cenas.length;i++) if(s.cenas[i].id===id)c=s.cenas[i];
  if(!c)return;
  var k=s.cenas.indexOf(c);
  if(CMODAL?.ov&&document.body.contains(CMODAL.ov))CMODAL.ov.close();
  var corpo=el("div",{id:"cmBody"}); corpo.innerHTML=cenaModalBody(s,c);
  var ov=overlay(c.n+" · "+c.titulo,"",{wide:true,cls:"cenasheet",head:htmlDe("t-cena-modal-cabeca",{k:k,total:s.cenas.length})});
  $(".sbodyscroll",ov).appendChild(corpo);
  /* fechar a cena com um bloco dela aberto fecha a edicao junto (e o quadro mostra o que mudou) */
  var fechaCena=ov.close;
  ov.close=function(){ var ed=/^(blk|scn):/.test(NL.k); if(ed){ nlFecha(true); } fechaCena(); if(ed){ render(); } };
  CMODAL={id:c.id,ov:ov};
  hydrateCena(ov);
  var pv=$("#cmPrev",ov); if(pv&&k>0)pv.onclick=function(){ abrirCenaModal(s.cenas[k-1].id); };
  var nx=$("#cmNext",ov); if(nx&&k<s.cenas.length-1)nx.onclick=function(){ abrirCenaModal(s.cenas[k+1].id); };
  var kh=function(e){ if(!document.body.contains(ov)){document.removeEventListener("keydown",kh);return;}
    if(!teclaDaCamada(e,ov))return;
    if(e.target&&(e.target.isContentEditable||/input|textarea|select/i.test(e.target.tagName)))return;
    if(e.key==="ArrowLeft"&&k>0){e.preventDefault();abrirCenaModal(s.cenas[k-1].id);}
    else if(e.key==="ArrowRight"&&k<s.cenas.length-1){e.preventDefault();abrirCenaModal(s.cenas[k+1].id);} };
  document.addEventListener("keydown",kh);
}
function refreshCenaModal(){
  if(!CMODAL)return;
  if(!document.body.contains(CMODAL.ov)){ CMODAL=null; return; }
  var s=curSess(), c=null,i;
  if(s)for(i=0;i<s.cenas.length;i++) if(s.cenas[i].id===CMODAL.id)c=s.cenas[i];
  if(!c){ CMODAL.ov.close(); CMODAL=null; return; }
  var b=CMODAL.ov.querySelector("#cmBody");
  if(b){ b.innerHTML=cenaModalBody(s,c); hydrateCena(b); }
  var h3=CMODAL.ov.querySelector(".stit"); if(h3)h3.textContent=c.n+" · "+c.titulo;
}
function cardHtml(s,c){
  var tb=blkDe(c,"trilha"), ib=blkDe(c,"imagens"), te=blkDe(c,"testes");
  return htmlDe("t-card",{c:c,ck:ckHtml(c,"marcar"),faixa:tb?.itens?.[0]||null,
    testes:te?.itens.length||0,imagens:ib?ib.itens.slice(0,4):[]});
}
var TPOS=[{x:40,y:24},{x:40,y:186},{x:336,y:110},{x:632,y:40},{x:632,y:430}];
function tposPadrao(i){ return TPOS[i]||{x:40+(i%3)*300,y:24+Math.floor(i/3)*390}; }
/* Territorio que ninguem arrastou (sem posicao, ou ainda exatamente na posicao padrao, que versoes
   antigas gravavam) e automatico: depois de medido ele desce ate nao encostar no de cima (CV.auto,
   em quadro.js). Isso nao e gravado, para acompanhar o territorio de cima quando ele ganha cenas.
   Arrastar grava x e y e o territorio deixa de ser automatico. */
function tposAuto(s,i){ var t=s.territorios[i], d=tposPadrao(i); return typeof t.x!=="number"||(t.x===d.x&&t.y===d.y); }
function tpos(s,i){ var t=s.territorios[i]; if(!tposAuto(s,i))return t;
  return CV.auto?.[t.id]||tposPadrao(i); }

/* O elenco e o cadastro da campanha. A sessao guarda so os ids do que usa. */
var EL={
  personagens:{pre:"p",voc:"personagem",vocs:"personagens"},
  npcs:{ids:"npcIds",lib:"npcs",pre:"n",voc:"npc",vocs:"npcs"},
  locais:{ids:"localIds",lib:"locais",pre:"l",voc:"local",vocs:"locais"},
  pistas:{ids:"pistaIds",lib:"ev",pre:"k",voc:"evidencia",vocs:"evidencias"}
};
var CORES_T=[["#c2458a","rosa"],["#c9a227","ouro"],["#c0392b","vermelho"],["#4a8fa8","azul"],["#8e7cc3","roxo"],["#7ba36f","verde"]];
function elDe(tipo,id){ return (D.elenco?.[tipo]||[]).find(function(x){return x.id===id;})||null; }
function daSessao(s,tipo){ return (s[EL[tipo].ids]||[]).map(function(id){return elDe(tipo,id);}).filter(Boolean); }

function viewSessao(){
  var s=curSess(); if(!s)return viewSessoes();
  var tot=s.cenas.length,fei=s.cenas.filter(function(c){return c.feito;}).length;
  var p={volta:htmlDe("t-sessao-volta"),
    prog:htmlDe("t-sessao-prog",{feitas:fei,total:tot,pc:tot?Math.round(fei/tot*100):0}),
    enc:htmlDe("t-sessao-enc",{encerrada:s.status==="encerrada"}),
    acoes:htmlDe("t-sessao-acoes",{ini:!!(S.ini||iniDe(s).lista.length)}),
    modos:htmlDe("t-sessao-modos",{modo:S.vmode})};
  if(S.vmode==="canvas")
    return htmlDe("t-sessao-quadro",{s:s,p:p,guia:botaoGuia(),painel:!!S.rail,ini:iniHtml(s),quadro:canvasHtml(s)});
  return htmlDe("t-sessao-roteiro",{s:s,p:p,guia:botaoGuia(),ini:iniHtml(s),painel:railHtml(s),
    cenas:s.cenas.map(function(c){return scnHtml(s,c);}).join("")});
}
function canvasHtml(s){
  return htmlDe("t-quadro",{aberto:!!S.rail,painel:railHtml(s),territorios:s.territorios.map(function(t,i){ var p=tpos(s,i);
    return {id:t.id,nome:t.nome,cor:t.cor,x:p.x,y:p.y,cards:s.cenas.filter(function(c){return c.territorio===t.id;})
      .map(function(c){return cardHtml(s,c);}).join("")}; })});
}
function corta(t,n){ t=String(t); return t.slice(0,n)+(t.length>n?"…":""); }
function railHtml(s){
  /* "nao pode faltar": as cenas obrigatorias e os itens obrigatorios de "Para avancar" */
  var obrig=[];
  s.cenas.forEach(function(c){
    if(c.forcado)obrig.push({cid:c.id,n:c.n,texto:c.titulo});
    var ab=blkDe(c,"avancar"); if(!ab)return;
    (ab.itens||[]).forEach(function(a){ if(a.tipo==="forcado")obrig.push({cid:c.id,n:c.n,texto:corta(a.t,92)}); }); });
  return htmlDe("t-painel-sessao",{s:s,aberta:S.rbox||"obrig",obrig:obrig,
    fixos:caixaPainel("fixos","os eventos fixos"),prep:caixaPainel("prep","a preparação"),notas:caixaPainel("notas","as notas"),
    elenco:["npcs","locais","pistas"].map(function(tp){
      return {tp:tp,titulo:Vm(EL[tp].vocs),itens:daSessao(s,tp).map(function(x){ var t=String(x.desc||x.texto||"");
        return {id:x.id,nome:x.nome,img:x.img,texto:t?corta(t,110):"",lib:GM?{on:jaLib(tp,x)}:null}; })}; })});
}

/* ---------- ACOES ---------- */
function cena(id){ return (curSess()?.cenas||[]).find(function(c){ return c.id===id; }); }
function irCena(id){ S.vmode="roteiro"; S.aberta=id; render(); setTimeout(function(){
  var d=$("#scn-"+id); if(d){d.open=true;d.scrollIntoView({behavior:fxLigado()?"smooth":"auto",block:"center"});} },50); }

/* a cena nova entra na lista ja com o cabecalho aberto no lugar; sem titulo nem bloco, o Pronto a tira de novo */
function novaCena(s,tid){
  if(!s.territorios.length){ s.territorios.push({id:uid("t"),nome:Vm("territorio")+" 1",cor:CORES_T[0][0],padrao:true}); }
  var c={id:uid("c"),n:Vm("cena")+" "+(s.cenas.length+1),titulo:"",territorio:tid||s.territorios[0].id,feito:false,blocos:[]};
  s.cenas.push(c); S.aberta=c.id;
  if(S.vmode==="canvas"){ render(); abrirCenaModal(c.id); }
  nlAbre("scn:"+c.id,{novo:true,foco:"titulo"});
}
/* o bloco novo entra no fim da cena ja aberto, com o cursor no conteudo */
function novoBlocoNaCena(c,tipo){
  c.blocos=c.blocos||[];
  c.blocos.push(novoBloco(tipo||"lista"));
  nlAbre("blk:"+c.id+":"+(c.blocos.length-1),{novo:true});
}

/* as caixas do painel da sessao (eventos fixos, preparacao, notas): as listas vazias ja abrem com um item */
NL_ALVOS.rb=function(qual){
  var s=curSess();
  if(!s){ return null; }
  return {obj:s,grava:save,
    abre:function(x){
      if(qual==="fixos"&&!x.eventosFixos.lista.length){ x.eventosFixos.lista.push(""); }
      if(qual==="prep"){ ["terPronto","mecanicas"].forEach(function(k){ if(!x.prep[k].length){ x.prep[k].push(""); } }); }
    },
    limpa:function(x){ nlLimpa(x.eventosFixos.lista); nlLimpa(x.prep.terPronto); nlLimpa(x.prep.mecanicas); }};
};
function caixaPainel(qual,rotulo){
  var k="rb:"+qual, ed=nlEd(k);
  return {k:k,ed:ed,lapis:nlLapis(k,rotulo),fim:ed?nlFim([]):""};
}
function editarTerr(s,tid){
  var t=tid?s.territorios.find(function(x){return x.id===tid;}):null, novo=!t;
  if(novo)t={id:uid("t"),nome:"",cor:CORES_T[s.territorios.length%CORES_T.length][0]};
  var ops=CORES_T.slice(); if(!ops.some(function(o){return o[0]===t.cor;}))ops.push([t.cor,"cor atual"]);
  formulario((novo?"Novo ":"Editar ")+V("territorio").toLowerCase(),[
      {k:"nome",rot:"Nome",obrig:true,ph:"um lugar, um ato, um grupo de cenas",larg:"mg"},
      {k:"cor",rot:"Cor",tipo:"sel",ops:ops,larg:"p"}],
    {nome:t.nome,cor:t.cor},
    {salvar:function(w){ t.nome=String(w.nome).trim(); t.cor=w.cor; delete t.padrao;
        if(novo){ s.territorios.push(t); } save(); render(); },
     remover:novo?null:function(){
        if(s.cenas.some(function(x){return x.territorio===t.id;})){ toast("Mova ou remova as cenas dele primeiro"); return; }
        comDesfazer(Vm("territorio")+" removido",function(){ s.territorios=s.territorios.filter(function(x){return x!==t;}); }); }});
}
function adicionarNaSessao(s,tp){
  var k=EL[tp].ids, um=V(EL[tp].voc).toLowerCase();
  var fora=D.elenco[tp].filter(function(x){return !s[k].includes(x.id);});
  var ov=overlay("Adicionar "+um+" à "+V("sessao").toLowerCase(),htmlDe("t-adicionar-sessao",{fora:fora}));
  $$("[data-add]",ov).forEach(function(b){ b.onclick=function(){
    s[k].push(b.dataset.add); save(); b.remove(); render(); toast("Adicionado"); }; });
  $("#asNovo",ov).onclick=function(){ ov.close(); editarElenco(tp,null,function(x){ s[k].push(x.id); }); };
}

/* reordenar arrastando (js/ordenar.js): cenas no roteiro, blocos na cena */
ORDENA.cenas=function(_l,de,para){ var s=curSess();
  if(s&&moverNaLista(s.cenas,de,para)){ save(); render(); refreshCenaModal(); } };
ORDENA.blocos=function(l,de,para){ var c=cena(l.dataset.c);
  if(c&&moverNaLista(c.blocos,de,para)){ save(); render(); refreshCenaModal(); } };

/* os botoes da sessao, por data-act: os que so trocam algo na tela (marcar, liberar, abrir) e os que abrem
   outra coisa (cena nova, bloco novo, territorio, mapa, elenco) */
function acaoLib(b){
  var o=elDe(b.dataset.tp,b.dataset.id); if(!o){ return; }
  var on=alternaLib(b.dataset.tp,o);
  b.classList.toggle("on",on); b.setAttribute("aria-pressed",String(on));
  b.title=on?"Liberado para a mesa. Clique para tirar.":"Liberar para a mesa";
  toast(on?"Liberado para a mesa":"Tirado da mesa");
}
var ACOES_SESSAO={
  "scn-add":function(s,b){ novaCena(s,b.dataset.t); },
  "scn-mapa":function(_s,_b,c){ if(c){ mpAbrirMapaDaCena(c.id); } },
  "blk-add":function(_s,b,c){ if(c){ novoBlocoNaCena(c,b.parentNode.querySelector("select")?.value); } },
  "terr-add":function(s){ editarTerr(s,null); },
  "terr-ed":function(s,b){ editarTerr(s,b.dataset.t); },
  "el-add":function(s,b){ adicionarNaSessao(s,b.dataset.tp); }
};
document.addEventListener("click",function(e){
  var b=e.target.closest("[data-act]"); if(!b){ return; }
  var a=b.dataset.act, s=curSess(); if(!s){ return; }
  var c=b.dataset.c?cena(b.dataset.c):null;
  if(a==="go"){ if(S.vmode==="canvas"){ abrirCenaModal(b.dataset.c); } else { irCena(b.dataset.c); } return; }
  if(a==="el-ver"){ var x=elDe(b.dataset.tp,b.dataset.id); if(x){ abrirItem(b.dataset.tp,x,null,s); } return; }
  e.preventDefault(); e.stopPropagation();
  if(a==="ck"){ if(c){ c.feito=!c.feito; marcarFeito(s,c); save(); } return; }
  if(a==="lib"){ acaoLib(b); return; }
  if(ACOES_SESSAO[a]){ ACOES_SESSAO[a](s,b,c); }
});
function escolher(titulo,ops,cb){
  var ov=overlay(titulo,htmlDe("t-escolher",{ops:ops}));
  $$("[data-v]",ov).forEach(function(x){ x.onclick=function(){ ov.close(); cb(x.dataset.v); }; });
}
