/* Blocos de cena, cena aberta e acoes da sessao. */
"use strict";

/* ---------- BLOCOS DE CENA ---------- */
var TIPOS=[["leitura","Leitura em voz alta"],["lista","Lista"],["quem","Quem está lá"],
  ["avancar","Para avançar"],["dialogo","Diálogo"],["nota","Segredo só seu"],["testes","Testes"],
  ["trilha","Trilha"],["imagens","Imagens"]];
var MARCAS=[["nota","sem marca"],["gancho","gancho"],["pista","pista"],["item","item"],["forcado","obrigatório"]];
function nomeTipo(t){ var f=TIPOS.filter(function(x){return x[0]===t;})[0]; return f?f[1]:t; }
function camposBloco(tipo){
  var rot={k:"rotulo",rot:"Título do bloco (opcional)",ph:nomeTipo(tipo)};
  if(tipo==="leitura")return [rot,{k:"nota",rot:"Instrução para você (opcional)",ph:"ex.: ler devagar, baixar a luz"},
    {k:"texto",rot:"Texto para ler em voz alta",tipo:"area",linhas:9}];
  if(tipo==="nota")return [rot,{k:"texto",rot:"Segredo",tipo:"area",linhas:7,dica:"Aparece borrado na tela até você clicar, para ninguém ler por cima do ombro."}];
  if(tipo==="lista")return [rot,{k:"itens",rot:"Itens",tipo:"linhas",linhas:8}];
  if(tipo==="quem")return [rot,{k:"itens",rot:"Quem está na cena",tipo:"grupo",um:"pessoa",novo:function(){return {t:"",motiva:"",img:""};},
    campos:[{k:"t",rot:"Quem é e o que faz ali",ph:"Nome: descrição curta"},{k:"motiva",rot:"O que quer (opcional)"},
      {k:"img",rot:"Imagem",tipo:"img"}]}];
  if(tipo==="avancar")return [rot,{k:"itens",rot:"O que faz a cena andar",tipo:"grupo",um:"item",novo:function(){return {t:"",tipo:"nota",sub:[]};},
    campos:[{k:"t",rot:"O que acontece",tipo:"area",linhas:2},{k:"tipo",rot:"Marca",tipo:"sel",ops:MARCAS},
      {k:"sub",rot:"Detalhes (opcional)",tipo:"linhas",linhas:3}]}];
  if(tipo==="dialogo")return [rot,{k:"itens",rot:"Falas",tipo:"grupo",um:"fala",novo:function(){return {quem:"",fala:""};},
    campos:[{k:"quem",rot:"Quem fala"},{k:"fala",rot:"A fala",tipo:"area",linhas:3}]}];
  if(tipo==="testes")return [rot,{k:"itens",rot:"Testes possíveis",tipo:"grupo",um:"teste",novo:function(){return {p:"",t:"",f:[]};},
    campos:[{k:"p",rot:"Perícia, atributo ou rolagem"},{k:"t",rot:"O que o personagem tenta"},
      {k:"f",rot:"Resultados",tipo:"linhas",linhas:3,
       dica:"Um por linha. Comece com o número para destacar, ex.: 15 · acha a porta escondida"}]}];
  if(tipo==="trilha")return [rot,{k:"itens",rot:"Faixas",tipo:"grupo",um:"faixa",novo:function(){return {sit:"",faixa:"",cat:""};},
    campos:[{k:"sit",rot:"Quando tocar",ph:"ex.: chegada, combate"},
      {k:"faixa",rot:"Faixa",tipo:"faixa",dica:"Comece a digitar: a lista vem do que está na Biblioteca."}]}];
  if(tipo==="imagens")return [rot,{k:"itens",rot:"Imagens",tipo:"imgs"}];
  return [rot];
}
function novoBloco(tipo){
  if(tipo==="leitura")return {tipo:tipo,rotulo:"",nota:"",texto:""};
  if(tipo==="nota")return {tipo:tipo,rotulo:"",texto:""};
  return {tipo:tipo,rotulo:"",itens:[]};
}
function editarBloco(c,bi,novo){
  var b=novo||c.blocos[bi]; if(!b)return;
  formulario((novo?"Novo bloco · ":"Editar · ")+nomeTipo(b.tipo),camposBloco(b.tipo),b,{wide:true,
    salvar:function(w){
      if(w.tipo==="trilha")(w.itens||[]).forEach(function(tr){ var f=LIB.faixas[keyF(tr.faixa)]; if(f)tr.cat=f.cat; });
      if(novo)c.blocos.push(w); else c.blocos[bi]=w;
      save(); render(); refreshCenaModal(); },
    remover:novo?null:function(){ comDesfazer("Bloco removido",function(){ c.blocos.splice(bi,1); }); }});
}
function blocoHtml(c,b,bi){
  var it=Array.isArray(b.itens)?b.itens:[];
  /* resultado de teste que comeca com numero ("15 · acha a porta") ganha o numero em destaque */
  if(b.tipo==="testes")it=it.map(function(t){
    return {p:t.p,t:t.t,f:(t.f||[]).map(function(f){ var m=/^(\d+\+?)\s*[·:\-]\s*([\s\S]*)$/.exec(f);
      return m?{num:m[1],txt:m[2]}:{num:"",txt:f}; })}; });
  return htmlDe("t-bloco",{cid:c.id,bi:bi,b:b,itens:it,rotulo:b.rotulo||nomeTipo(b.tipo),mestre:GM});
}

/* ---------- CENA / SESSAO ---------- */
function blkDe(c,tipo){ return (c.blocos||[]).filter(function(b){return b.tipo===tipo;})[0]; }
function ckHtml(c,rotulo){ return htmlDe("t-ck",{cid:c.id,feito:!!c.feito,rotulo:rotulo||"Marcar como feita"}); }
function ferrCena(c){ return htmlDe("t-ferr-cena",{cid:c.id}); }
function scnHtml(s,c){
  return htmlDe("t-scn",{c:c,terr:terr(s,c.territorio),aberta:S.aberta===c.id,ck:ckHtml(c),ferr:ferrCena(c),corpo:cenaBodyHtml(c)});
}
function cenaBodyHtml(c){
  return htmlDe("t-cena-corpo",{cid:c.id,blocos:(c.blocos||[]).map(function(b,bi){ return blocoHtml(c,b,bi); }).join("")});
}
var CMODAL=null;
function hydrateCena(root){
  $$("[data-pedir]",root).forEach(function(b){ b.onclick=function(e){ e.stopPropagation(); pedirTeste(b.getAttribute("data-pedir")); }; });
  $$("[data-blur]",root).forEach(function(n){n.onclick=function(){n.classList.add("rev");};});
  $$("[data-lb]",root).forEach(function(n){n.onclick=function(){projetar(n.getAttribute("data-lb"));};});
  $$("[data-faixa]",root).forEach(function(b){b.onclick=function(){ tocar(b.getAttribute("data-faixa")); };});
}
function cenaModalBody(s,c){
  return htmlDe("t-cena-modal",{c:c,terr:terr(s,c.territorio),ck:ckHtml(c),ferr:ferrCena(c),corpo:cenaBodyHtml(c)});
}
function abrirCenaModal(id){
  var s=curSess(); if(!s)return;
  var c=null,i; for(i=0;i<s.cenas.length;i++) if(s.cenas[i].id===id)c=s.cenas[i];
  if(!c)return;
  var k=s.cenas.indexOf(c);
  if(CMODAL&&CMODAL.ov&&document.body.contains(CMODAL.ov))CMODAL.ov.close();
  var corpo=el("div",{id:"cmBody"}); corpo.innerHTML=cenaModalBody(s,c);
  var ov=overlay(c.n+" · "+c.titulo,"",{wide:true,cls:"cenasheet",head:htmlDe("t-cena-modal-cabeca",{k:k,total:s.cenas.length})});
  $(".sbodyscroll",ov).appendChild(corpo);
  CMODAL={id:c.id,ov:ov};
  hydrateCena(ov);
  var pv=$("#cmPrev",ov); if(pv&&k>0)pv.onclick=function(){ abrirCenaModal(s.cenas[k-1].id); };
  var nx=$("#cmNext",ov); if(nx&&k<s.cenas.length-1)nx.onclick=function(){ abrirCenaModal(s.cenas[k+1].id); };
  var kh=function(e){ if(!document.body.contains(ov)){document.removeEventListener("keydown",kh);return;}
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
  var h3=CMODAL.ov.querySelector("h3"); if(h3)h3.textContent=c.n+" · "+c.titulo;
}
function cardHtml(s,c){
  var tb=blkDe(c,"trilha"), ib=blkDe(c,"imagens"), te=blkDe(c,"testes");
  return htmlDe("t-card",{c:c,ck:ckHtml(c,"marcar"),faixa:(tb&&tb.itens&&tb.itens[0])||null,
    testes:(te&&te.itens.length)||0,imagens:ib?ib.itens.slice(0,4):[]});
}
var TPOS=[{x:40,y:24},{x:40,y:186},{x:336,y:110},{x:632,y:40},{x:632,y:430}];
function tpos(s,i){ var t=s.territorios[i]; if(typeof t.x==="number")return t;
  var d=TPOS[i]||{x:40+(i%3)*300,y:24+Math.floor(i/3)*390}; t.x=d.x; t.y=d.y; return t; }

/* O elenco e o cadastro da campanha. A sessao guarda so os ids do que usa. */
var EL={
  personagens:{pre:"p",voc:"personagem",vocs:"personagens"},
  npcs:{ids:"npcIds",lib:"npcs",pre:"n",voc:"npc",vocs:"npcs"},
  locais:{ids:"localIds",lib:"locais",pre:"l",voc:"local",vocs:"locais"},
  pistas:{ids:"pistaIds",lib:"ev",pre:"k",voc:"evidencia",vocs:"evidencias"}
};
var CORES_T=[["#c2458a","rosa"],["#c9a227","ouro"],["#c0392b","vermelho"],["#4a8fa8","azul"],["#8e7cc3","roxo"],["#7ba36f","verde"]];
function elDe(tipo,id){ return ((D.elenco&&D.elenco[tipo])||[]).filter(function(x){return x.id===id;})[0]||null; }
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
    return htmlDe("t-sessao-quadro",{s:s,p:p,painel:!!S.rail,ini:iniHtml(s),quadro:canvasHtml(s)});
  return htmlDe("t-sessao-roteiro",{s:s,p:p,ini:iniHtml(s),painel:railHtml(s),
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
    elenco:["npcs","locais","pistas"].map(function(tp){
      return {tp:tp,titulo:Vm(EL[tp].vocs),itens:daSessao(s,tp).map(function(x){ var t=String(x.desc||x.texto||"");
        return {id:x.id,nome:x.nome,img:x.img,texto:t?corta(t,110):"",lib:GM?{on:jaLib(tp,x)}:null}; })}; })});
}

/* ---------- ACOES ---------- */
function cena(id){var s=curSess();return ((s&&s.cenas)||[]).filter(function(c){return c.id===id;})[0];}
function irCena(id){ S.vmode="roteiro"; S.aberta=id; render(); setTimeout(function(){
  var d=$("#scn-"+id); if(d){d.open=true;d.scrollIntoView({behavior:"smooth",block:"center"});} },50); }

function editarCena(s,c,nova){
  formulario((nova?"Nova ":"Editar ")+V("cena").toLowerCase(),[
      {k:"titulo",rot:"Título",obrig:true,ph:"o que acontece nela"},
      {k:"n",rot:"Rótulo curto",ph:"ex.: Cena 3, Abertura",dica:"Aparece no card do quadro e na lista."},
      {k:"territorio",rot:Vm("territorio"),tipo:"sel",ops:s.territorios.map(function(t){return [t.id,t.nome];})},
      {k:"forcado",rot:"Obrigatória: acontece de qualquer jeito",tipo:"check"}],
    {titulo:c.titulo,n:c.n,territorio:c.territorio,forcado:!!c.forcado},
    {salvar:function(w){
        c.titulo=String(w.titulo).trim(); c.n=String(w.n||"").trim(); c.territorio=w.territorio; c.forcado=!!w.forcado;
        if(nova){ s.cenas.push(c); S.aberta=c.id; }
        save(); render(); refreshCenaModal();
        if(nova){ if(S.vmode==="canvas")abrirCenaModal(c.id); else irCena(c.id); } },
     remover:nova?null:function(){ comDesfazer(Vm("cena")+" removida",function(){
        s.cenas=s.cenas.filter(function(x){return x!==c;}); }); }});
}
function editarTerr(s,tid){
  var t=tid?s.territorios.filter(function(x){return x.id===tid;})[0]:null, novo=!t;
  if(novo)t={id:uid("t"),nome:"",cor:CORES_T[s.territorios.length%CORES_T.length][0]};
  var ops=CORES_T.slice(); if(!ops.some(function(o){return o[0]===t.cor;}))ops.push([t.cor,"cor atual"]);
  formulario((novo?"Novo ":"Editar ")+V("territorio").toLowerCase(),[
      {k:"nome",rot:"Nome",obrig:true,ph:"um lugar, um ato, um grupo de cenas"},
      {k:"cor",rot:"Cor",tipo:"sel",ops:ops}],
    {nome:t.nome,cor:t.cor},
    {salvar:function(w){ t.nome=String(w.nome).trim(); t.cor=w.cor; delete t.padrao;
        if(novo)s.territorios.push(t); save(); render(); },
     remover:novo?null:function(){
        if(s.cenas.some(function(x){return x.territorio===t.id;})){ toast("Mova ou remova as cenas dele primeiro"); return; }
        comDesfazer(Vm("territorio")+" removido",function(){ s.territorios=s.territorios.filter(function(x){return x!==t;}); }); }});
}
function adicionarNaSessao(s,tp){
  var k=EL[tp].ids, um=V(EL[tp].voc).toLowerCase();
  var fora=D.elenco[tp].filter(function(x){return s[k].indexOf(x.id)<0;});
  var ov=overlay("Adicionar "+um+" à "+V("sessao").toLowerCase(),htmlDe("t-adicionar-sessao",{fora:fora}));
  $$("[data-add]",ov).forEach(function(b){ b.onclick=function(){
    s[k].push(b.getAttribute("data-add")); save(); b.remove(); render(); toast("Adicionado"); }; });
  $("#asNovo",ov).onclick=function(){ ov.close(); editarElenco(tp,null,function(x){ s[k].push(x.id); }); };
}

document.addEventListener("click",function(e){
  var b=e.target.closest("[data-act]"); if(!b)return;
  var a=b.getAttribute("data-act"), s=curSess(); if(!s)return;
  var c=b.getAttribute("data-c")?cena(b.getAttribute("data-c")):null;
  var bi=+b.getAttribute("data-b"), tp=b.getAttribute("data-tp"), id=b.getAttribute("data-id");
  function done(){ save(); render(); refreshCenaModal(); }
  if(a==="ck"){ e.preventDefault(); e.stopPropagation(); if(!c)return; c.feito=!c.feito; marcarFeito(s,c); save(); return; }
  if(a==="go"){ if(S.vmode==="canvas")abrirCenaModal(b.getAttribute("data-c")); else irCena(b.getAttribute("data-c")); return; }
  if(a==="lib"){ e.preventDefault(); e.stopPropagation(); var o=elDe(tp,id); if(!o)return;
    var on=alternaLib(tp,o); b.classList.toggle("on",on);
    b.title=on?"Liberado para a mesa. Clique para tirar.":"Liberar para a mesa";
    toast(on?"Liberado para a mesa":"Tirado da mesa"); return; }
  if(a==="el-ver"){ var x=elDe(tp,id); if(x)abrirItem(tp,x,null,s); return; }
  e.preventDefault(); e.stopPropagation();
  switch(a){
    case "scn-add":{
      if(!s.territorios.length)s.territorios.push({id:uid("t"),nome:Vm("territorio")+" 1",cor:CORES_T[0][0],padrao:true});
      var tid=b.getAttribute("data-t")||s.territorios[0].id;
      editarCena(s,{id:uid("c"),n:Vm("cena")+" "+(s.cenas.length+1),titulo:"",territorio:tid,feito:false,blocos:[]},true); break; }
    case "scn-ed": if(c)editarCena(s,c,false); break;
    case "scn-up": case "scn-dn":{ if(!c)break; var k=s.cenas.indexOf(c),n2=k+(a==="scn-up"?-1:1);
      if(n2>=0&&n2<s.cenas.length){ s.cenas.splice(n2,0,s.cenas.splice(k,1)[0]); done(); } break; }
    case "blk-add":{ if(!c)break; var sel=b.parentNode.querySelector("select");
      editarBloco(c,-1,novoBloco(sel?sel.value:"lista")); break; }
    case "blk-ed": if(c)editarBloco(c,bi); break;
    case "blk-up": case "blk-dn":{ if(!c)break; var n3=bi+(a==="blk-up"?-1:1);
      if(n3>=0&&n3<c.blocos.length){ c.blocos.splice(n3,0,c.blocos.splice(bi,1)[0]); done(); } break; }
    case "terr-add": editarTerr(s,null); break;
    case "terr-ed": editarTerr(s,b.getAttribute("data-t")); break;
    case "s-fixos": formulario("Eventos fixos",[
        {k:"intro",rot:"Explicação (opcional)",tipo:"area",linhas:3},
        {k:"lista",rot:"Eventos",tipo:"linhas",linhas:6,dica:"O que acontece em hora marcada, faça o grupo o que fizer. Um por linha."}],
      s.eventosFixos,{salvar:function(w){ s.eventosFixos=w; done(); }}); break;
    case "s-prep": formulario("Preparação",[
        {k:"terPronto",rot:"O que ter pronto",tipo:"linhas",linhas:5},
        {k:"mecanicas",rot:"Regras que vão aparecer",tipo:"linhas",linhas:5}],
      s.prep,{salvar:function(w){ s.prep=w; done(); }}); break;
    case "s-notas": formulario("Notas da "+V("sessao").toLowerCase(),[
        {k:"plantado",rot:"Notas",tipo:"area",linhas:10,dica:"Só você vê. Lembretes, o que foi plantado, o que ficou em aberto."}],
      {plantado:s.plantado},{salvar:function(w){ s.plantado=w.plantado; done(); }}); break;
    case "el-add": adicionarNaSessao(s,tp); break;
  }
});
function escolher(titulo,ops,cb){
  var ov=overlay(titulo,htmlDe("t-escolher",{ops:ops}));
  $$("[data-v]",ov).forEach(function(x){ x.onclick=function(){ ov.close(); cb(x.getAttribute("data-v")); }; });
}
