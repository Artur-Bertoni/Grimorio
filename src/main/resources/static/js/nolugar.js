/* Edicao no lugar: o lapis de um bloco libera os campos dele onde eles ja estao, sem janela e sem
   mudar o desenho da tela. Decisao do dono: so um leve fundo atras do texto mostra o que e editavel.
   Um bloco aberto por vez, em toda a tela. Grava sozinho enquanto a pessoa digita; "Pronto" (ou o
   lapis de novo, ou Esc) fecha, limpa o que ficou vazio e redesenha.

   O bloco aberto e uma chave ("blk:{cena}:{i}", "sec:{i}", "res:{i}"…). NL_ALVOS[prefixo](partes)
   devolve o alvo: {obj, grava, desenha?, abre?, limpa?, vazio?, tira?, remove?, fecha?, mudou?, tecla?}.
   obj e onde os caminhos dos campos se aplicam; tira e remover sem desfazer (o bloco novo que ficou
   vazio); remove e o "Remover" da pessoa, com desfazer.

   Na marcacao (sempre dentro de [data-nlb="chave"]):
     data-nl="caminho"          campo; o input grava pget/pset em obj (data-nlt="num": numero)
     data-nl-li                 item de lista de texto: Enter abre o proximo, Backspace no comeco junta
     data-nl-re                 o campo muda o desenho (marca, territorio): redesenha depois de gravar
     data-nl-foco               o campo que recebe o foco ao abrir
     data-nl-add="caminho"      acrescenta um item (data-nl-novo: o molde em NL_NOVO)
     data-nl-del="caminho.i"    tira um item (data-nl-desfaz: com desfazer)
     data-nl-img / -addimg      troca a imagem / acrescenta uma imagem a lista
     data-nl-alt="caminho"      liga e desliga um valor booleano
     data-nl-pronto, data-nl-tira (remove o bloco)
   e, fora dele, o lapis: data-nl-abre="chave". */
"use strict";

var NL={k:"",novo:false,dados:null};
var NL_ALVOS={};
/* o que cada bloco precisa preparar antes de abrir (o indice edita uma copia em linhas) */
var NL_DADOS={};
var NL_NOVO={
  txt:function(){ return ""; },
  quem:function(){ return {t:"",motiva:"",img:""}; },
  avancar:function(){ return {t:"",tipo:"nota",sub:[]}; },
  fala:function(){ return {quem:"",fala:""}; },
  teste:function(){ return {p:"",t:"",f:[]}; },
  faixa:function(){ return {sit:"",faixa:"",cat:""}; },
  cartao:function(){ return {t:"",d:""}; },
  grupo:function(){ return {t:"",itens:[""]}; },
  livro:function(){ return {doc:Object.keys(LIB.docs||{})[0]||"",nome:"",linhas:[{n:0,t:"",p:""}]}; }
};
/* campos que nao contam como conteudo: um item so com eles esta vazio */
var NL_SEM_CONTEUDO={tipo:1,cat:1,id:1,n:1};

function nlEd(k){ return !!k&&NL.k===k; }
function nlAlvo(k){
  var p=String(k||"").split(":"), f=NL_ALVOS[p[0]];
  return f?f.apply(null,p.slice(1)):null;
}
function nlRedesenho(){ render(); refreshCenaModal(); }
function nlDesenha(a){ (a?.desenha||nlRedesenho)(); }

function nlVazio(x){
  if(x==null){ return true; }
  if(typeof x==="string"){ return !x.trim(); }
  if(Array.isArray(x)){ return x.every(nlVazio); }
  if(typeof x==="object"){ return Object.keys(x).every(function(k){ return NL_SEM_CONTEUDO[k]||nlVazio(x[k]); }); }
  return false;
}
/* tira das listas (em qualquer nivel) o item que ficou sem nada */
function nlLimpa(x){
  if(Array.isArray(x)){
    for(var i=x.length-1;i>=0;i--){ if(nlVazio(x[i])){ x.splice(i,1); } else { nlLimpa(x[i]); } }
  } else if(x&&typeof x==="object"){
    Object.keys(x).forEach(function(k){ if(Array.isArray(x[k])){ nlLimpa(x[k]); } });
  }
}

/* grava com folga: cada tecla mexe no guia, e a gravacao junta as teclas */
var nlT=null, nlPend=null;
function nlGrava(a){ nlPend=a; clearTimeout(nlT); nlT=setTimeout(nlGravaJa,250); }
function nlGravaJa(){ clearTimeout(nlT); var x=nlPend; nlPend=null; if(x){ x.grava(); } }

function nlAbre(k,o){
  o=o||{};
  if(NL.k&&NL.k!==k){ nlFecha(true); }
  var pre=String(k).split(":")[0];
  NL.k=k; NL.novo=!!o.novo;
  NL.dados=o.dados||(NL_DADOS[pre]?NL_DADOS[pre]():null);
  var a=nlAlvo(k);
  if(!a){ NL.k=""; NL.dados=null; return; }
  if(a.abre){ a.abre(a.obj); }
  nlDesenha(a);
  nlFoca(k,o.foco);
}
/* semDesenhar: quem chama ja vai redesenhar (troca de tela, outro bloco abrindo) */
function nlFecha(semDesenhar){
  if(!NL.k){ return; }
  var k=NL.k, a=nlAlvo(k), novo=NL.novo;
  nlGravaJa();
  if(a){
    if(a.limpa){ a.limpa(a.obj); }
    if(novo&&a.tira&&(a.vazio||nlVazio)(a.obj)){ a.tira(); }
    else if(a.fecha){ a.fecha(a.obj); }
    a.grava();
  }
  NL.k=""; NL.novo=false; NL.dados=null;
  if(semDesenhar){ return; }
  nlDesenha(a);
  focar($('[data-nl-abre="'+CSS.escape(k)+'"]'));
}
function nlRaiz(k){ return $('[data-nlb="'+CSS.escape(k)+'"]'); }
/* leva o foco ao campo pedido: o caminho exato, ou o primeiro campo dentro dele ("itens.2" acha "itens.2.t");
   sem pedido, o marcado com data-nl-foco. pos: onde fica o cursor (numero, ou o fim) */
function nlFoca(k,caminho,pos){
  var r=nlRaiz(k); if(!r){ return; }
  var cs=$$("[data-nl]",r), alvo=null;
  if(caminho!=null){ alvo=cs.find(function(c){ var p=c.dataset.nl; return p===caminho||p.startsWith(caminho+"."); }); }
  alvo=alvo||$("[data-nl-foco]",r)||cs[0]||$("[data-nl-pronto]",r);
  if(!alvo||!focar(alvo)){ return; }
  if(alvo.tagName==="TEXTAREA"||(typeof alvo.setSelectionRange==="function"&&/^(text|search)$/.test(alvo.type))){
    var n=pos==null?alvo.value.length:Math.min(pos,alvo.value.length);
    try{ alvo.setSelectionRange(n,n); }catch(error_){ /* campo sem cursor (numero): fica onde o navegador poe */ }
  }
}
/* mudanca de estrutura: grava ja, redesenha e devolve o foco */
function nlRefaz(a,caminho,pos){ nlPend=null; clearTimeout(nlT); a.grava(); nlDesenha(a); nlFoca(NL.k,caminho,pos); }

/* textarea do tamanho do texto: o navegador que nao tem field-sizing ganha a altura pelo JS */
var NL_CRESCE_CSS=typeof CSS!=="undefined"&&CSS.supports("field-sizing","content");
function nlCresce(c){
  if(NL_CRESCE_CSS||c.tagName!=="TEXTAREA"){ return; }
  c.style.height="auto"; c.style.height=c.scrollHeight+"px";
}
if(!NL_CRESCE_CSS&&window.MutationObserver){
  var nlQuadro=0;
  new MutationObserver(function(){
    cancelAnimationFrame(nlQuadro);
    nlQuadro=requestAnimationFrame(function(){ $("textarea.nl").forEach(nlCresce); });
  }).observe(document.body,{childList:true,subtree:true});
}

function nlCampo(e){
  var c=e.target?.closest?.("[data-nl]"); if(!c){ return null; }
  var r=c.closest("[data-nlb]"); if(!r||r.dataset.nlb!==NL.k){ return null; }
  var a=nlAlvo(NL.k);
  return a?{c:c,r:r,a:a,p:c.dataset.nl}:null;
}
function nlLe(c){
  if(c.type==="checkbox"){ return c.checked; }
  if(c.dataset.nlt==="num"){ var x=Number.parseFloat(c.value); return Number.isFinite(x)?x:""; }
  return c.value;
}
document.addEventListener("input",function(e){
  if(e.target.matches?.("textarea.nl")){ nlCresce(e.target); }
  var o=nlCampo(e); if(!o){ return; }
  pset(o.a.obj,o.p,nlLe(o.c));
  if(o.a.mudou){ o.a.mudou(o.p,o.c); }
  if(o.c.hasAttribute("data-nl-re")){ nlRefaz(o.a,o.p); return; }
  nlGrava(o.a);
});

/* lista de texto: Enter parte o item no cursor; Backspace no comeco junta com o de cima */
function nlTeclaDeLista(e,o){
  var m=/^(.*)\.(\d+)$/.exec(o.p); if(!m){ return false; }
  var arr=pget(o.a.obj,m[1]), i=+m[2], c=o.c, ini=c.selectionStart, fim=c.selectionEnd;
  if(!Array.isArray(arr)){ return false; }
  if(e.key==="Enter"&&!e.shiftKey){
    arr[i]=c.value.slice(0,ini); arr.splice(i+1,0,c.value.slice(fim));
    nlRefaz(o.a,m[1]+"."+(i+1),0); return true;
  }
  if(e.key==="Backspace"&&ini===0&&fim===0&&i>0){
    var antes=String(arr[i-1]||"");
    arr[i-1]=antes+c.value; arr.splice(i,1);
    nlRefaz(o.a,m[1]+"."+(i-1),antes.length); return true;
  }
  return false;
}
document.addEventListener("keydown",function(e){
  var o=nlCampo(e); if(!o||e.isComposing){ return; }
  /* Esc fecha so a edicao: a janela em volta (a cena no quadro) continua aberta */
  if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); nlFecha(); return; }
  var tratou=o.a.tecla?o.a.tecla(e,o):false;
  if(!tratou&&o.c.hasAttribute("data-nl-li")){ tratou=nlTeclaDeLista(e,o); }
  if(tratou){ e.preventDefault(); e.stopPropagation(); }
},true);
/* campo dentro de <summary> (o cabecalho da cena, o do resumo): clicar ou teclar espaco nele nao abre nem fecha */
document.addEventListener("click",function(e){ if(e.target.closest?.("summary .nl")){ e.preventDefault(); } },true);
document.addEventListener("keyup",function(e){ if(e.key===" "&&e.target.closest?.("summary .nl")){ e.preventDefault(); } },true);

document.addEventListener("click",function(e){
  var t=e.target; if(!t?.closest){ return; }
  var lp=t.closest("[data-nl-abre]");
  if(lp){ e.preventDefault(); e.stopPropagation();
    if(NL.k===lp.dataset.nlAbre){ nlFecha(); } else { nlAbre(lp.dataset.nlAbre); }
    return; }
  var r=t.closest("[data-nlb]"); if(!r||r.dataset.nlb!==NL.k){ return; }
  var b=t.closest("[data-nl-pronto],[data-nl-add],[data-nl-del],[data-nl-img],[data-nl-addimg],[data-nl-alt],[data-nl-tira]");
  if(!b){ return; }
  var a=nlAlvo(NL.k); if(!a){ return; }
  e.preventDefault(); e.stopPropagation();
  nlBotao(a,b);
});
function nlBotao(a,b){
  var d=b.dataset;
  if(d.nlPronto!=null){ nlFecha(); return; }
  if(d.nlTira!=null){ var k=NL.k; NL.k=""; NL.novo=false; NL.dados=null; if(a.remove){ a.remove(); } else { focar($('[data-nl-abre="'+CSS.escape(k)+'"]')); } return; }
  if(d.nlAdd!=null){ nlAcrescenta(a,d.nlAdd,d.nlNovo); return; }
  if(d.nlDel!=null){ nlTiraItem(a,d.nlDel,d.nlDesfaz!=null); return; }
  if(d.nlAlt!=null){ pset(a.obj,d.nlAlt,!pget(a.obj,d.nlAlt)); nlRefaz(a,null); focar($('[data-nl-alt="'+CSS.escape(d.nlAlt)+'"]',nlRaiz(NL.k))); return; }
  if(d.nlImg!=null){ var p=d.nlImg, k2=NL.k;
    escolherImagem(pget(a.obj,p)||"").then(function(r){
      if(r==null||NL.k!==k2){ return; }
      pset(a.obj,p,r); nlRefaz(a,null); focar($('[data-nl-img="'+CSS.escape(p)+'"]',nlRaiz(k2))); });
    return; }
  if(d.nlAddimg!=null){ var lp=d.nlAddimg, k3=NL.k;
    escolherImagem("").then(function(r){
      if(!r||NL.k!==k3){ return; }
      var l=pget(a.obj,lp); if(!Array.isArray(l)){ l=[]; pset(a.obj,lp,l); }
      l.push(r); nlRefaz(a,null); focar($('[data-nl-addimg="'+CSS.escape(lp)+'"]',nlRaiz(k3))); });
  }
}
function nlAcrescenta(a,p,molde){
  var l=pget(a.obj,p);
  if(!Array.isArray(l)){ l=[]; pset(a.obj,p,l); }
  l.push((NL_NOVO[molde||"txt"]||NL_NOVO.txt)());
  nlRefaz(a,p+"."+(l.length-1));
}
function nlTiraItem(a,p,desfaz){
  var m=/^(.*)\.(\d+)$/.exec(p); if(!m){ return; }
  var l=pget(a.obj,m[1]), i=+m[2];
  if(!Array.isArray(l)){ return; }
  var foco=l.length>1?m[1]+"."+Math.max(0,i-1):null;
  if(desfaz&&!nlVazio(l[i])){
    comDesfazer("Item removido",function(){ l.splice(i,1); a.grava(); });
    nlFoca(NL.k,foco);
    return;
  }
  l.splice(i,1);
  nlRefaz(a,foco);
}

/* o rodape do bloco aberto: os "+ item" dele, remover o bloco e Pronto */
function nlFim(adds,tira){ return htmlDe("t-nl-fim",{adds:adds||[],tira:tira||""}); }
function nlLapis(k,rotulo){ return htmlDe("t-nl-lapis",{k:k,ed:nlEd(k),rotulo:rotulo}); }
