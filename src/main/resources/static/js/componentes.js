/* Templates HTML das paginas e componentes, e o preenchimento deles com petite-vue. */
"use strict";

/* Cada arquivo em paginas/ e componentes/ guarda um ou mais <template id="...">. Eles sao
   lidos uma vez, antes da partida, e ficam num bloco escondido no fim do <body>.
   Arquivo novo de template precisa entrar nesta lista. */
var TEMPLATES=[
  "componentes/marca.html",
  "componentes/estado.html",
  "componentes/quadro.html",
  "componentes/tour.html",
  "componentes/suporte.html",
  "componentes/conta.html",
  "componentes/busca-config.html",
  "componentes/janelas.html",
  "componentes/midia.html",
  "componentes/pagina.html",
  "paginas/sessoes.html",
  "paginas/elenco.html",
  "componentes/momentos.html",
  "componentes/fichas.html",
  "componentes/rolagens.html",
  "componentes/busca.html",
  "componentes/formulario.html",
  "paginas/biblioteca.html",
  "paginas/campanha.html",
  "paginas/mesa.html",
  "paginas/sessao.html",
  "paginas/configuracoes.html"
];

function carregarTemplates(){
  return Promise.all(TEMPLATES.map(function(u){
    return fetch(u,{credentials:"same-origin"}).then(function(r){
      if(!r.ok)throw new Error("não consegui ler "+u+" ("+r.status+")");
      return r.text(); });
  })).then(function(txts){
    var box=document.createElement("div");
    box.id="templates"; box.hidden=true; box.innerHTML=txts.join("\n");
    document.body.appendChild(box);
  });
}

/* Preenche o template com os dados e devolve o HTML pronto. O petite-vue cuida de
   {{ }}, v-if, v-for, :attr e :class; texto entra sempre escapado, e so v-html (usado
   para encaixar outro template ja preenchido, como a logo) entra como marcacao.
   Os eventos continuam ligados pelo JS de cada tela, depois que o HTML esta no lugar:
   e isso que permite devolver texto e manter o redesenho de tela inteira de sempre. */
function htmlDe(id,dados){
  var t=document.getElementById(id);
  if(!t||!t.content)throw new Error("template "+id+" não existe");
  var d=document.createElement("div");
  d.appendChild(t.content.cloneNode(true));
  PetiteVue.createApp(dados||{}).directive("attr",vAttr).mount(d);
  /* ancoras e recuo nao servem para nada depois de pronto */
  limpaAncoras(d);
  soltaEnvoltorios(d);
  /* :class com valor vazio deixa class=""; o HTML de sempre simplesmente nao tinha o atributo */
  $$("[class=\"\"]",d).forEach(function(e){ e.removeAttribute("class"); });
  return d.innerHTML;
}
/* Os templates enxergam as funcoes globais (V, Vm, IMG, refLivro...). vmin e o rotulo do
   vocabulario em minuscula, sem escapar: no template o {{ }} ja escapa. */
function vmin(k){ return V(k).toLowerCase(); }
/* Cabecalho de pagina. botao: {id, texto}, opcional. */
function cabecaPagina(eyebrow,titulo,botao){ return htmlDe("t-cabeca",{eyebrow:eyebrow,titulo:titulo,botao:botao||null}); }
/* v-attr:nome="expr" grava o atributo de verdade: null, undefined ou false tiram, true deixa
   vazio. O :nome do petite-vue escreve na propriedade quando ela existe, e isso nao serve
   aqui: propriedade nao aparece no innerHTML (value, checked e selected sumiriam) e null
   vira o texto "null" (placeholder, title). Use v-attr nesses casos e para atributo opcional.
   Em <textarea> o conteudo vai como {{ }} entre as tags. */
function vAttr(ctx){
  ctx.effect(function(){ var v=ctx.get();
    if(v==null||v===false)ctx.el.removeAttribute(ctx.arg);
    else ctx.el.setAttribute(ctx.arg,v===true?"":String(v)); });
}
/* <span data-solta v-html="..."> encaixa outro template ja preenchido sem deixar o span:
   o elemento sai e fica so o conteudo, para o HTML final ser o mesmo de sempre. */
function soltaEnvoltorios(no){
  $$("[data-solta]",no).forEach(function(e){ while(e.firstChild)e.parentNode.insertBefore(e.firstChild,e); e.remove(); });
}
/* Tira as ancoras que o petite-vue deixa para v-if/v-for e o recuo dos arquivos de template.
   Recuo e espaco so com quebra de linha: entre botoes inline ele viraria um vao que o HTML
   de sempre nao tinha. Espaco de verdade ("</b> <span>") fica, porque nao tem quebra. */
function limpaAncoras(no){
  var w=document.createTreeWalker(no,NodeFilter.SHOW_COMMENT|NodeFilter.SHOW_TEXT), lixo=[];
  while(w.nextNode()){ var n=w.currentNode;
    if(n.nodeType===8||(n.data.indexOf("\n")>=0&&!n.data.trim()))lixo.push(n); }
  lixo.forEach(function(c){ c.remove(); });
}
