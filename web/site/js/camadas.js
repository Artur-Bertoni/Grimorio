/* Camadas por cima da pagina: dialogo (foco, fundo inerte), menu solto, confirmacao, avisos
   (toast) e atalhos de teclado. Tudo que abre por cima passa por aqui para que teclado e leitor
   de tela tratem igual qualquer janela do app. */
"use strict";

/* ---------- FOCO ---------- */
var FOCAVEIS='a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),'+
  'textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),summary';
function visivel(e){ return !e.closest("[inert]")&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length); }
function focaveis(r){ return $$(FOCAVEIS,r).filter(visivel); }
function aspas(v){ return String(v).replaceAll("\\",String.raw`\\`).replaceAll('"',String.raw`\"`); }
/* Um jeito de achar "o mesmo elemento" depois que render() trocou o HTML: id, ou a tag com os
   data-* dele. Sem isso o foco do teclado voltava ao topo a cada acao. */
function seletorEstavel(e){
  if(!e?.tagName||e===document.body||e===document.documentElement)return null;
  if(e.id)return "#"+CSS.escape(e.id);
  var at=Array.prototype.filter.call(e.attributes,function(a){ return a.name.startsWith("data-")&&a.name!=="data-solta"; });
  var tag=e.tagName.toLowerCase();
  if(at.length)return tag+at.map(function(a){ return "["+a.name+'="'+aspas(a.value)+'"]'; }).join("");
  var r=e.getAttribute("aria-label");
  return r?tag+'[aria-label="'+aspas(r)+'"]':null;
}
function focar(e){
  if(!e)return false;
  try{ e.focus(); }catch(error_){ console.warn("sem foco:",error_); return false; }
  return document.activeElement===e;
}

/* ---------- PILHA DE CAMADAS ----------
   So a camada de cima responde: o resto da pagina (topo, conteudo, rodape, paineis soltos e as
   camadas de baixo) fica inerte enquanto ela esta aberta. Ao fechar, o foco volta para quem
   abriu, ou para o equivalente dele se a tela foi redesenhada nesse meio tempo. */
var CAMADAS=[];
var FORA_DA_INERCIA={layer:1,toasts:1,anuncio:1,alerta:1,templates:1,fantasmas:1};
function camadaTopo(){ return CAMADAS.length?CAMADAS.at(-1).el:null; }
function inerteFilho(e,topo){
  if(FORA_DA_INERCIA[e.id]||e.tagName==="SCRIPT"||e.classList.contains("tour"))return;
  var deve=!!topo&&!e.contains(topo);
  if(deve&&!e.inert){ e.inert=true; e.dataset.inerte="1"; }
  else if(!deve&&e.dataset.inerte){ e.inert=false; delete e.dataset.inerte; }
}
function atualizaInerte(){
  var topo=camadaTopo();
  for(var e of document.body.children){ inerteFilho(e,topo); }
  var l=document.getElementById("layer");
  if(l){ for(var c of l.children){ c.inert=!!topo&&c!==topo&&!c.contains(topo); } }
}
function primeiroFoco(el,o){
  return (o.foco&&$(o.foco,el))||$("[autofocus]",el)||
    $("input:not([type=hidden]):not([type=checkbox]):not([readonly]),textarea,select",el);
}
function abrirCamada(el,o){
  o=o||{};
  var a=document.activeElement;
  CAMADAS.push({el:el,volta:a,voltaSel:seletorEstavel(a)});
  atualizaInerte();
  if(o.foco===false)return;
  if(focar(primeiroFoco(el,o)))return;
  var d=$("[role=dialog],[role=alertdialog],[role=menu]",el)||el;
  if(!d.hasAttribute("tabindex")){ d.setAttribute("tabindex","-1"); }
  focar(d);
}
function quemRecebeFoco(c){
  if(c.volta&&document.body.contains(c.volta)&&!c.volta.closest("[inert]"))return c.volta;
  var v=null;
  if(c.voltaSel){ try{ v=document.querySelector(c.voltaSel); }catch(error_){ v=null; console.warn(error_); } }
  return v&&!v.closest("[inert]")?v:null;
}
function fecharCamada(el){
  var i=CAMADAS.findIndex(function(c){ return c.el===el; });
  if(i<0)return;
  var c=CAMADAS.splice(i,1)[0];
  atualizaInerte();
  var at=document.activeElement;
  /* so devolve o foco se ele estava na camada que fechou (ou se perdeu); quem fechou uma janela
     para abrir outra ja colocou o foco no lugar certo */
  if(at&&at!==document.body&&document.body.contains(at)&&!el.contains(at))return;
  if(focar(quemRecebeFoco(c)))return;
  var t=camadaTopo();
  if(t){ focar(focaveis(t)[0]); return; }
  var h=$("#view h1");
  if(h){ h.setAttribute("tabindex","-1"); focar(h); }
}
/* Tab e Shift+Tab giram dentro da camada de cima */
document.addEventListener("keydown",function(e){
  if(e.key!=="Tab"||!CAMADAS.length||TOUR)return;
  var fs=focaveis(camadaTopo());
  if(!fs.length){ e.preventDefault(); return; }
  var i=fs.indexOf(document.activeElement);
  if(e.shiftKey&&i<=0){ e.preventDefault(); focar(fs.at(-1)); }
  else if(!e.shiftKey&&(i<0||i===fs.length-1)){ e.preventDefault(); focar(fs[0]); }
});

/* ---------- ANUNCIOS PARA LEITOR DE TELA ---------- */
function anunciar(t,urgente){
  var n=document.getElementById(urgente?"alerta":"anuncio");
  if(!n)return;
  n.textContent="";
  setTimeout(function(){ n.textContent=t; },30);
}

/* ---------- MENU SOLTO ----------
   ancora: o botao que abriu (recebe aria-expanded); html: o template ja preenchido, com
   role="menu" e itens role="menuitem"; escolheu(item): chamado com o botao escolhido. */
var MENU=null;
function fecharMenu(devolve){
  if(!MENU)return;
  var m=MENU; MENU=null;
  m.el.remove();
  document.removeEventListener("pointerdown",m.fora,true);
  window.removeEventListener("resize",m.fecha);
  m.ancora?.setAttribute("aria-expanded","false");
  fecharCamada(m.el);
  if(devolve!==false&&document.body.contains(m.ancora))focar(m.ancora);
}
function posicionaMenu(m,ancora,alinha){
  var r=ancora.getBoundingClientRect(), W=window.innerWidth, H=window.innerHeight;
  m.style.position="fixed";
  var w=m.offsetWidth, h=m.offsetHeight;
  var left=alinha==="esquerda"?r.left:r.right-w;
  left=Math.max(8,Math.min(left,W-w-8));
  var top=r.bottom+6;
  if(top+h>H-8)top=Math.max(8,r.top-h-6);
  m.style.left=left+"px"; m.style.top=top+"px";
}
var TECLA_MENU={ArrowDown:function(i,n){ return (i+1)%n; },ArrowUp:function(i,n){ return (i-1+n)%n; },
  Home:function(){ return 0; },End:function(i,n){ return n-1; }};
function teclasDoMenu(m,itens){
  m.addEventListener("keydown",function(e){
    var anda=TECLA_MENU[e.key];
    if(anda){ e.preventDefault(); focar(itens[anda(itens.indexOf(document.activeElement),itens.length)]); }
    else if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); fecharMenu(); }
    else if(e.key==="Tab"){ fecharMenu(false); }
  });
}
function menuSolto(ancora,html,escolheu,o){
  o=o||{};
  if(MENU&&MENU.ancora===ancora){ fecharMenu(); return null; }
  fecharMenu(false);
  var caixa=el("div",{"class":"menucamada"});
  caixa.innerHTML=html;
  var m=caixa.firstElementChild;
  $("#layer").appendChild(caixa);
  posicionaMenu(m,ancora,o.alinha);
  var itens=$$("[role=menuitem]:not([disabled])",m);
  MENU={el:caixa,ancora:ancora,
    fora:function(e){ if(!m.contains(e.target)&&!ancora.contains(e.target))fecharMenu(false); },
    fecha:function(){ fecharMenu(false); }};
  ancora.setAttribute("aria-expanded","true");
  document.addEventListener("pointerdown",MENU.fora,true);
  window.addEventListener("resize",MENU.fecha);
  teclasDoMenu(m,itens);
  itens.forEach(function(b){ b.addEventListener("click",function(){ fecharMenu(); escolheu(b); }); });
  abrirCamada(caixa,{foco:false});
  focar(itens[0]);
  return m;
}

/* Alternativa ao arraste de painel solto (WCAG 2.5.7): um menu com posicoes e tamanhos prontos.
   aplica(v) recebe "esq", "dir", "baixo", "p", "m", "g" ou "padrao". */
var OPCOES_PAINEL=[{v:"esq",rot:"Encostar à esquerda"},{v:"dir",rot:"Encostar à direita"},{v:"baixo",rot:"Encostar embaixo"},
  {v:"p",rot:"Tamanho pequeno"},{v:"m",rot:"Tamanho médio"},{v:"g",rot:"Tamanho grande"},{v:"padrao",rot:"Voltar ao lugar padrão"}];
function menuPainel(botao,aplica){
  menuSolto(botao,htmlDe("t-menu",{titulo:"Posição e tamanho",itens:OPCOES_PAINEL.map(function(o){
    return {v:o.v,rot:o.rot,dica:"",perigo:false,desligado:false}; })}),function(b){ aplica(b.dataset.v); anunciar("Painel ajustado."); });
}
/* geometria nova a partir da atual g={x,y,w,h} dentro de uma area W x H */
var TAMANHO_PAINEL={p:[.22,.4],m:[.3,.6],g:[.42,.85]};
function geometriaPainel(v,g,W,H){
  var t=TAMANHO_PAINEL[v];
  if(t)return {x:g.x,y:g.y,w:Math.round(W*t[0]),h:Math.round(H*t[1])};
  if(v==="esq")return {x:8,y:8,w:g.w,h:Math.min(g.h,H-16)};
  if(v==="dir")return {x:W-g.w-8,y:8,w:g.w,h:Math.min(g.h,H-16)};
  if(v==="baixo")return {x:8,y:H-Math.min(g.h,H*.4)-8,w:W-16,h:Math.min(g.h,Math.round(H*.4))};
  return null;
}

/* ---------- CONFIRMACAO ----------
   Para o que nao tem volta (arquivo no servidor, apagar campanha, sair dela). O resto usa
   comDesfazer. Devolve uma Promise<boolean>. */
function confirmar(texto,o){
  o=o||{};
  return new Promise(function(fim){
    var feito=false;
    var ov=overlay(o.titulo||"Confirmar",htmlDe("t-confirmar",{texto:texto,detalhe:o.detalhe||"",
      sim:o.sim||"Confirmar",nao:o.nao||"Cancelar",perigo:o.perigo!==false}),{cls:"confirma",alerta:true,foco:"[data-nao]"});
    var fecha=ov.close;
    function sai(v){ if(feito)return; feito=true; fecha(); fim(v); }
    ov.close=function(){ sai(false); };
    $("[data-sim]",ov).onclick=function(){ sai(true); };
    $("[data-nao]",ov).onclick=function(){ sai(false); };
  });
}

/* ---------- AVISOS (toast) ----------
   Pilha no rodape da tela, um embaixo do outro, nunca por cima. Fica o tempo de ler (5s no
   minimo, mais para texto longo), pausa com o mouse ou o foco em cima e tem botao de fechar.
   O tipo muda a cor e o icone: ok, erro, aviso ou nenhum. Erro tambem vai para role=alert. */
var TOAST_MAX=3;
var ICONE_AVISO={ok:"✓",erro:"!",aviso:"!"};
function tipoDoAviso(m){
  if(/^(erro|falh|não consegui|não deu|não vou|não foi|sem conexão|recusad)/i.test(m))return "erro";
  if(/^(salvo|pronto|feito|desfeito|liberado|enviad|copiad|criad|importad|você entrou)/i.test(m))return "ok";
  return "";
}
function tiraAviso(v){ if(v.some){ v.some(); } else { v.remove(); } }
function avisoCaixa(m,tipo,duracao){
  var box=document.getElementById("toasts")||document.body;
  var t=el("div",{"class":"toast"+(tipo?" "+tipo:"")});
  if(ICONE_AVISO[tipo]){ t.appendChild(el("span",{"class":"tico",text:ICONE_AVISO[tipo],"aria-hidden":"true"})); }
  t.appendChild(el("span",{"class":"ttx",text:m}));
  var vivo=true, resta=duracao, ini=Date.now(), tm=null;
  function some(){ if(!vivo)return; vivo=false; clearTimeout(tm); t.remove(); }
  function conta(){ clearTimeout(tm); ini=Date.now(); tm=setTimeout(some,resta); }
  function pausa(){ clearTimeout(tm); resta=Math.max(1500,resta-(Date.now()-ini)); }
  t.addEventListener("pointerenter",pausa); t.addEventListener("pointerleave",conta);
  t.addEventListener("focusin",pausa); t.addEventListener("focusout",conta);
  t.some=some; t.conta=conta;
  box.appendChild(t);
  var vs=$$(".toast",box);
  while(vs.length>TOAST_MAX){ tiraAviso(vs.shift()); }
  if(tipo==="erro")anunciar(m,true);
  return t;
}
function duracaoAviso(m,minimo){ return Math.min(12000,Math.max(minimo||5000,2500+String(m).length*60)); }
function botaoFecharAviso(t){
  var x=el("button",{"class":"tx",type:"button",text:"✕","aria-label":"Fechar aviso"});
  x.onclick=function(){ t.some(); };
  return x;
}
function toast(m,tipo){
  m=String(m??"");
  var t=avisoCaixa(m,tipo===undefined?tipoDoAviso(m):tipo,duracaoAviso(m));
  t.appendChild(botaoFecharAviso(t));
  t.conta();
  return t;
}
/* aviso com uma acao (Desfazer). Ctrl+Z dispara a ultima, fora de campo de texto. */
var ULTIMA_ACAO=null;
function toastAcao(m,rot,fn){
  $$(".toast.act").forEach(tiraAviso);
  var t=avisoCaixa(m,"",duracaoAviso(m,8000));
  t.classList.add("act");
  var acao=function(){ ULTIMA_ACAO=null; t.some(); fn(); };
  var b=el("button",{type:"button",text:rot,"data-acao":"1"});
  b.onclick=acao;
  t.appendChild(b); t.appendChild(botaoFecharAviso(t));
  ULTIMA_ACAO={t:t,fn:acao};
  t.conta();
  var some=t.some;
  t.some=function(){ if(ULTIMA_ACAO?.t===t){ ULTIMA_ACAO=null; } some(); };
  return t;
}
function emCampoDeTexto(e){
  var g=e?.target, tag=(g?.tagName||"").toLowerCase();
  return tag==="input"||tag==="textarea"||tag==="select"||!!g?.isContentEditable;
}
/* Tecla de navegacao de uma janela (setas no PDF, na cena, na pagina do livro): so vale com ela
   por cima de tudo, com o foco fora de campo de texto e sem o tour. */
function teclaDaCamada(e,el){ return !TOUR&&camadaTopo()===el&&!emCampoDeTexto(e)&&!e.defaultPrevented; }

/* ---------- ATALHOS ----------
   Um despachante so. Atalho de uma tecla nao dispara com o foco num campo, com uma camada
   aberta (a nao ser que seja dela) nem com o tour; e pode ser desligado em Configuracoes >
   Acessibilidade (grim_atalhos=0), porque leitor de tela e ditado usam teclas soltas. */
var ATALHOS=[];
function atalhosLigados(){
  try{ return localStorage.getItem("grim_atalhos")!=="0"; }
  catch(error_){ console.warn(error_); return true; }
}
/* a: {tecla, ctrl, quando(e), faz(e), naCamada}; tecla e o e.key; ctrl aceita Ctrl ou Cmd */
function atalho(a){ ATALHOS.push(a); }
function atalhoVale(a,e){
  if(String(e.key).toLowerCase()!==String(a.tecla).toLowerCase())return false;
  if(!!a.ctrl!==!!(e.ctrlKey||e.metaKey))return false;
  if(!a.ctrl&&(e.altKey||!atalhosLigados()||emCampoDeTexto(e)))return false;
  if(CAMADAS.length&&!a.naCamada)return false;
  return !a.quando||a.quando(e);
}
document.addEventListener("keydown",function(e){
  if(TOUR||e.defaultPrevented||e.isComposing)return;
  var a=ATALHOS.find(function(x){ return atalhoVale(x,e); });
  if(!a)return;
  e.preventDefault(); e.stopPropagation(); a.faz(e);
},true);
/* Elemento com role="button" que nao e <button> (o cartao do quadro, uma imagem que abre em tela
   cheia) responde a Enter e Espaco como um botao de verdade. */
document.addEventListener("keydown",function(e){
  if(e.key!=="Enter"&&e.key!==" ")return;
  var t=e.target;
  if(!t?.matches?.('[role="button"]:not(button):not(a):not(input)'))return;
  e.preventDefault(); t.click();
});
atalho({tecla:"z",ctrl:true,quando:function(e){ return !!ULTIMA_ACAO&&!emCampoDeTexto(e); },faz:function(){ ULTIMA_ACAO.fn(); }});
