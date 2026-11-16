/* Reordenar arrastando: secoes da campanha, cenas do roteiro, blocos da cena, linhas e
   imagens do formulario. Um jeito so, para a mesma acao nao ter dois gestos diferentes. */
"use strict";

/* A marcacao diz o que arrasta:
     data-ordena="nome"  a lista (data-eixo="x" quando ela corre na horizontal)
     data-item="i"       cada item, com o indice dele no dado
     data-alca           por onde se pega o item (o cabecalho); botao e campo dentro dela
                         continuam sendo clique
     .alca               o glifo de pegar: e por ele que o toque arrasta, e com ele em foco
                         as setas do teclado andam um passo
   Quem trata a soltura e ORDENA[nome](lista, de, para), que move o item `de` para a
   posicao `para` (ja contada sem ele). Lista que vive numa janela com estado proprio (o
   formulario) liga o seu tratador com ligarOrdem(raiz, fn). */
var ORDENA={};

/* o item sai de `de` e entra em `para`, com `para` ja contado sem ele */
function moverNaLista(a,de,para){
  if(de===para||de<0||de>=a.length)return false;
  a.splice(Math.max(0,Math.min(para,a.length-1)),0,a.splice(de,1)[0]);
  return true;
}

function itensDaLista(lista){
  return Array.prototype.slice.call(lista.querySelectorAll("[data-item]"))
    .filter(function(n){ return n.closest("[data-ordena]")===lista; });
}
/* o que identifica a lista depois do redesenho, para devolver o foco ao glifo */
function chaveDaLista(lista){
  return ["ordena","c","p"].map(function(k){ var v=lista.dataset[k];
    return v==null?"":"[data-"+k+"="+JSON.stringify(v)+"]"; }).join("");
}
function rotuloDaAlca(alca){
  var c=alca.cloneNode(true);
  $$("button,select,input,textarea,.alca",c).forEach(function(x){ x.remove(); });
  var t=(c.textContent||"").replace(/\s+/g," ").trim();
  if(!t)return "mover";
  return t.length>48?t.slice(0,46)+"…":t;
}
function emGrade(lista){ var cs=getComputedStyle(lista);
  return cs.display==="grid"&&cs.gridTemplateColumns.trim().split(/\s+/).length>1; }
/* quem rola quando o arraste chega perto da borda: a janela do formulario ou a pagina */
function rolavelDe(n){
  for(var p=n;p&&p!==document.body;p=p.parentElement){
    var oy=getComputedStyle(p).overflowY;
    if((oy==="auto"||oy==="scroll")&&p.scrollHeight>p.clientHeight)return p; }
  return document.scrollingElement||document.documentElement;
}
/* o clique que fecha o arraste nao pode abrir a cena nem o item por baixo */
function engoleClique(e){ e.stopPropagation(); e.preventDefault(); }
function engolirProximoClique(){
  document.addEventListener("click",engoleClique,true);
  setTimeout(function(){ document.removeEventListener("click",engoleClique,true); },60);
}
/* de onde a lista sai pelo teclado ou pelo ponteiro: item, lista e tratador, ou nada */
function alvoDeOrdem(raiz,de,tratador){
  var item=de.closest("[data-item]"), lista=item?.closest("[data-ordena]"), fn=lista&&tratador(lista);
  if(!fn||!raiz.contains(lista))return null;
  return {item:item,lista:lista,fn:fn,x:lista.dataset.eixo==="x",i:+item.dataset.item};
}

function ligarOrdem(raiz,tratador){
  var arr=null;

  /* o alvo e o item mais perto do ponteiro, antes ou depois conforme a metade em que ele esta */
  function alvo(x,y){
    var melhor=null,dist=Infinity;
    arr.itens.forEach(function(n,k){ var r=n.getBoundingClientRect();
      var dx=Math.max(r.left-x,0,x-r.right), dy=Math.max(r.top-y,0,y-r.bottom), d=dx*dx+dy*dy;
      if(d<dist){ dist=d; melhor={k:k,r:r}; } });
    if(!melhor)return null;
    /* numa grade de varias colunas a ordem corre em linhas: antes/depois e pela metade da largura */
    var r=melhor.r, depois=(arr.x||arr.grade)?x>r.left+r.width/2:y>r.top+r.height/2;
    return {k:melhor.k+(depois?1:0),r:r,depois:depois};
  }
  function marca(){
    var a=alvo(arr.cx,arr.cy), l=arr.linha;
    arr.para=a?a.k:null; l.hidden=!a;
    if(!a)return;
    var r=a.r;
    if(arr.x||arr.grade){ l.style.left=((a.depois?r.right:r.left)-2)+"px"; l.style.top=r.top+"px";
      l.style.width="3px"; l.style.height=r.height+"px"; }
    else { l.style.left=r.left+"px"; l.style.top=((a.depois?r.bottom:r.top)-2)+"px";
      l.style.width=r.width+"px"; l.style.height="3px"; }
  }
  /* perto da borda de cima ou de baixo, a lista rola sozinha */
  function rolar(){
    if(!arr?.ativo)return;
    var sc=arr.sc, pagina=sc===document.scrollingElement||sc===document.documentElement;
    var cx=pagina?{top:0,bottom:window.innerHeight}:sc.getBoundingClientRect(), m=56, v=0;
    if(arr.cy<cx.top+m)v=-Math.ceil((cx.top+m-arr.cy)/4);
    else if(arr.cy>cx.bottom-m)v=Math.ceil((arr.cy-cx.bottom+m)/4);
    if(v){ sc.scrollTop+=v; marca(); }
    arr.raf=requestAnimationFrame(rolar);
  }
  function inicia(){
    arr.ativo=true;
    arr.item.classList.add("ord-origem");
    document.documentElement.classList.add("ord-arrastando");
    arr.linha=el("div",{"class":"ord-linha"}); arr.linha.hidden=true;
    arr.fantasma=el("div",{"class":"ord-fantasma",text:rotuloDaAlca(arr.alca)});
    document.body.appendChild(arr.linha); document.body.appendChild(arr.fantasma);
    arr.raf=requestAnimationFrame(rolar);
  }
  function move(e){
    if(e.pointerId!==arr?.pid)return;
    arr.cx=e.clientX; arr.cy=e.clientY;
    if(!arr.ativo){
      if(Math.abs(e.clientX-arr.sx)<5&&Math.abs(e.clientY-arr.sy)<5)return;
      inicia(); }
    e.preventDefault();
    arr.fantasma.style.transform="translate("+(e.clientX+14)+"px,"+(e.clientY+10)+"px)";
    marca();
  }
  function solta(e){ if(e.pointerId===arr?.pid)encerra(true); }
  function cancela(){ encerra(false); }
  function esc(e){ if(arr&&e.key==="Escape"){ e.stopPropagation(); encerra(false); } }
  /* os ouvintes do documento so existem durante o arraste: cada formulario liga o seu */
  function escuta(liga){
    var f=liga?document.addEventListener:document.removeEventListener;
    f.call(document,"pointermove",move); f.call(document,"pointerup",solta);
    f.call(document,"pointercancel",cancela); f.call(document,"keydown",esc,true);
  }
  function encerra(soltou){
    var a=arr; arr=null; escuta(false);
    if(!a?.ativo)return;
    cancelAnimationFrame(a.raf);
    a.item.classList.remove("ord-origem");
    document.documentElement.classList.remove("ord-arrastando");
    a.linha.remove(); a.fantasma.remove();
    engolirProximoClique();
    if(!soltou||a.para==null)return;
    var para=a.para>a.i?a.para-1:a.para;
    if(para!==a.i)a.fn(a.lista,a.i,para);
  }

  raiz.addEventListener("pointerdown",function(e){
    if(e.button!==0||arr)return;
    var alca=e.target.closest("[data-alca]");
    if(!alca||e.target.closest("button:not(.alca),select,input,textarea,a,[data-act]"))return;
    /* no toque, o cabecalho inteiro precisa continuar rolando a pagina: so o glifo arrasta */
    if(e.pointerType!=="mouse"&&!e.target.closest(".alca"))return;
    var o=alvoDeOrdem(raiz,alca,tratador); if(!o)return;
    var itens=itensDaLista(o.lista); if(itens.length<2)return;
    e.preventDefault();
    arr={fn:o.fn,lista:o.lista,item:o.item,i:o.i,x:o.x,alca:alca,itens:itens,
      sx:e.clientX,sy:e.clientY,cx:e.clientX,cy:e.clientY,ativo:false,para:null,
      sc:rolavelDe(o.lista),pid:e.pointerId,grade:emGrade(o.lista)};
    escuta(true);
  });
  /* imagem de alca nao pode abrir o arrastar nativo do navegador */
  raiz.addEventListener("dragstart",function(e){ if(e.target.closest?.("[data-alca]"))e.preventDefault(); });

  raiz.addEventListener("keydown",function(e){
    var g=e.target.closest?.(".alca"); if(!g)return;
    var o=alvoDeOrdem(raiz,g,tratador); if(!o)return;
    var passo=0;
    if(e.key===(o.x?"ArrowLeft":"ArrowUp"))passo=-1;
    else if(e.key===(o.x?"ArrowRight":"ArrowDown"))passo=1;
    if(!passo)return;
    e.preventDefault(); e.stopPropagation();
    var para=o.i+passo;
    if(para<0||para>=itensDaLista(o.lista).length)return;
    moverPara(o,para);
  });

  /* Clique na alca (sem arrastar) abre "Mover para…": quem nao consegue arrastar nem usar as
     setas escolhe a posicao num menu (WCAG 2.5.7). */
  raiz.addEventListener("click",function(e){
    var g=e.target.closest?.("button.alca"); if(!g)return;
    var o=alvoDeOrdem(raiz,g,tratador); if(!o)return;
    var itens=itensDaLista(o.lista), n=itens.length; if(n<2)return;
    var ops=[];
    if(o.i>0)ops.push({v:"0",rot:"Para o início"});
    if(o.i>0)ops.push({v:String(o.i-1),rot:"Uma posição "+(o.x?"para trás":"acima")});
    if(o.i<n-1)ops.push({v:String(o.i+1),rot:"Uma posição "+(o.x?"para a frente":"abaixo")});
    if(o.i<n-1)ops.push({v:String(n-1),rot:"Para o fim"});
    itens.forEach(function(it,k){ if(k===o.i||k===o.i+1||ops.length>14)return;
      var a=it.querySelector("[data-alca]")||it;
      ops.push({v:String(k>o.i?k-1:k),rot:"Antes de: "+rotuloDaAlca(a)}); });
    menuSolto(g,htmlDe("t-menu",{titulo:"Mover para",itens:ops}),function(b){ moverPara(o,+b.dataset.v); },{alinha:"esquerda"});
  });
}
/* move, devolve o foco a alca do item na posicao nova e anuncia onde ele ficou */
function moverPara(o,para){
  var chave=chaveDaLista(o.lista), n=itensDaLista(o.lista).length;
  o.fn(o.lista,o.i,para);
  setTimeout(function(){ var l=document.querySelector(chave), it=l&&itensDaLista(l)[para];
    it?.querySelector(".alca")?.focus(); anunciar("Posição "+(para+1)+" de "+n+"."); },0);
}

ligarOrdem(document,function(lista){ return ORDENA[lista.dataset.ordena]; });
/* a alca e um botao (recebe foco e seta), mas clicar nela nao faz nada: dentro do <summary>
   abriria ou fecharia a cena */
document.addEventListener("click",function(e){ if(e.target.closest?.("button.alca"))e.preventDefault(); });
