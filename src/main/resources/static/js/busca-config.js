/* Editores dos dados de busca da campanha (assuntos, sinonimos, indice dos livros). */
"use strict";

/* ---------- O QUE ERA FIXO DE UM SISTEMA E VIROU DADO DA CAMPANHA ----------
   Assuntos da busca, sinonimos, paginas certas, indice dos livros, abreviacao de
   cada livro e categorias da trilha: nada disso mora no codigo. */
function ajustesBusca(alvo){
  var c=D.campanha;
  alvo.innerHTML=htmlDe("t-ajustes-busca",{campanha:V("campanha").toLowerCase(),blocos:[
    {titulo:"Assuntos",n:c.categoriasBusca.length,id:"bsCat",texto:"Viram filtros na tela de busca. Cada assunto é uma lista de palavras: a página entra no filtro se o título da seção ou o começo do texto tiver uma delas."},
    {titulo:"Sinônimos",n:Object.keys(c.sinonimos).length,id:"bsSin",texto:"Quem busca um termo também acha os outros. Bom para siglas e apelidos de regra."},
    {titulo:"Páginas certas",n:Object.keys(c.canonicas).length,id:"bsCan",texto:"Para um termo, a página que deve aparecer sempre em primeiro lugar."}]});
  function grava(){ save(); salvarMesa(); render(); toast("Busca atualizada"); }
  $("#bsCat",alvo).onclick=function(){
    formulario("Assuntos da busca",[{k:"l",rot:"Assuntos",tipo:"grupo",um:"assunto",novo:function(){return {nome:"",termos:[]};},
        campos:[{k:"nome",rot:"Nome do filtro",ph:"ex.: Combate, Magia, Criaturas"},
          {k:"termos",rot:"Palavras que marcam esse assunto",tipo:"linhas",linhas:5,dica:"Uma palavra ou expressão por linha."}]}],
      {l:c.categoriasBusca},{wide:true,salvar:function(w){
        c.categoriasBusca=(w.l||[]).filter(function(x){return String(x.nome||"").trim()&&(x.termos||[]).length;})
          .map(function(x){return {nome:String(x.nome).trim(),termos:x.termos};});
        BUSCA.fcat="tudo"; grava(); }}); };
  $("#bsSin",alvo).onclick=function(){
    formulario("Sinônimos",[{k:"l",rot:"Termos",tipo:"grupo",um:"termo",novo:function(){return {termo:"",iguais:[]};},
        campos:[{k:"termo",rot:"Quando buscarem por",ph:"ex.: pv"},
          {k:"iguais",rot:"Achar também",tipo:"linhas",linhas:3,dica:"Um por linha. Ex.: pontos de vida"}]}],
      {l:Object.keys(c.sinonimos).map(function(k){return {termo:k,iguais:c.sinonimos[k]||[]};})},{wide:true,salvar:function(w){
        var o={}; (w.l||[]).forEach(function(x){ var k=norm(x.termo).trim(); if(k&&(x.iguais||[]).length)o[k]=x.iguais; });
        c.sinonimos=o; invalidaIndice(); grava(); }}); };
  $("#bsCan",alvo).onclick=function(){
    formulario("Páginas certas",[{k:"l",rot:"Termos",tipo:"grupo",um:"termo",novo:function(){return {termo:"",paginas:[]};},
        campos:[{k:"termo",rot:"Quando buscarem por",ph:"ex.: agarrar"},
          {k:"paginas",rot:"Mostrar primeiro",tipo:"linhas",linhas:3,
           dica:"Uma por linha: abreviação do livro, página e, se quiser, um rótulo. Ex.: LB 78 | Manobras de combate"}]}],
      {l:Object.keys(c.canonicas).map(function(k){ return {termo:k,paginas:(c.canonicas[k]||[]).map(function(e){
          return e[0]+" "+e[1]+(e[2]?" | "+e[2]:"");})}; })},{wide:true,salvar:function(w){
        var o={}; (w.l||[]).forEach(function(x){ var k=norm(x.termo).trim(); if(!k)return;
          var ps=(x.paginas||[]).map(function(ln){ var m=/^\s*(\S+)\s+p?\.?\s*(\d+)\s*(?:\|\s*(.*))?$/i.exec(ln);
            return m?[m[1].toUpperCase(),+m[2],(m[3]||"").trim()]:null; }).filter(Boolean);
          if(ps.length)o[k]=ps; });
        c.canonicas=o; grava(); }}); };
}

/* Indice dos livros: atalhos para paginas do PDF, escritos como linhas de texto.
   Sem prefixo e um grupo; "-" e um item do grupo; "--" e um subitem. */
function indiceParaLinhas(d){ var l=[];
  function ln(pre,o){ l.push(pre+o.t+(o.p?" | "+o.p:"")); }
  (d.grupos||[]).forEach(function(g){ ln("",g);
    (g.itens||[]).forEach(function(it){ ln("- ",it); (it.sub||[]).forEach(function(s){ ln("-- ",s); }); }); });
  return l; }
function linhasParaIndice(l){ var gs=[],g=null,it=null;
  (l||[]).forEach(function(x){ var m=/^(-{0,2})\s*(.*?)\s*(?:\|\s*p?\.?\s*(\d+))?\s*$/.exec(x); if(!m||!m[2])return;
    var o={t:m[2]}; if(m[3])o.p=+m[3];
    if(m[1]==="--"&&it){ (it.sub=it.sub||[]).push(o); }
    else if(m[1]&&g){ it=o; g.itens.push(o); }
    else { g=o; g.itens=[]; it=null; gs.push(g); } });
  return gs; }
function editarIndice(){
  var c=D.campanha, abs=Object.keys(LIB.docs||{});
  formulario("Índice dos livros",[{k:"titulo",rot:"Título da seção"},
      {k:"livros",rot:"Livros",tipo:"grupo",um:"livro",novo:function(){return {doc:abs[0]||"",nome:"",linhas:[]};},
       campos:[{k:"doc",rot:"Abreviação do livro",
          dica:"Como aparece na Biblioteca"+(abs.length?" ("+abs.join(", ")+")":"")+". É por ela que o atalho acha o PDF."},
        {k:"nome",rot:"Nome que aparece"},
        {k:"linhas",rot:"Entradas",tipo:"linhas",linhas:10,
         dica:"Uma por linha: Título | página. Comece com - para um item dentro do anterior e com -- para um subitem."}]}],
    {titulo:c.indiceTitulo||"Índice dos livros",
     livros:c.indiceAS.map(function(d){return {doc:d.doc,nome:d.nome,linhas:indiceParaLinhas(d)};})},
    {wide:true,salvar:function(w){
      c.indiceTitulo=String(w.titulo||"").trim()||"Índice dos livros";
      c.indiceAS=(w.livros||[]).filter(function(l){return String(l.doc||"").trim();}).map(function(l){
        var ab=String(l.doc).trim().toUpperCase();
        return {doc:ab,nome:String(l.nome||"").trim()||nomeDoc(ab),grupos:linhasParaIndice(l.linhas)}; });
      save(); render(); }});
}

/* Livro novo: a pessoa confere nome e abreviacao antes de subir. A abreviacao e a
   chave do livro no servidor e nao muda depois. */
function confirmarLivros(arqs,cb){
  if(!arqs.length){ cb([]); return; }
  formulario(arqs.length===1?"Livro a enviar":"Livros a enviar",[{k:"l",rot:"Confira antes de enviar",tipo:"grupo",um:"livro",fixo:true,
      campos:[{k:"arq",rot:"Arquivo",ro:true},{k:"nome",rot:"Nome do livro"},
        {k:"ab",rot:"Abreviação",dica:"Curta, sem espaço. Aparece nas referências (ex.: LB p.42) e é a chave do livro: não muda depois."}]}],
    {l:arqs.map(function(f){ var m=abrevDe(f.name); return {arq:f.name,nome:m.nome,ab:m.ab}; })},
    {wide:true,rotSalvar:"Enviar",intro:textoLivros(true),salvar:function(w){ var por={};
      (w.l||[]).forEach(function(x){ por[x.arq]=x; });
      var usados={}, vai=[];
      arqs.forEach(function(f){ var x=por[f.name]; if(!x)return;
        var ab=String(x.ab||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,8)||abrevDe(f.name).ab;
        if(usados[ab]){ toast("Abreviação repetida: "+ab+". Pulei "+f.name); return; }
        usados[ab]=1; f.__ab=ab; f.__nome=String(x.nome||"").trim()||abrevDe(f.name).nome; vai.push(f); });
      cb(vai); }});
}
/* O que cada tipo de arquivo vira dentro do app. Aparece na aba e de novo na hora
   de enviar, porque e ali que a pessoa decide se e isso mesmo que ela quer subir. */
/* aviso=true acrescenta o lembrete de nao fechar a pagina durante o envio */
function textoLivros(aviso){
  return htmlDe("t-texto-livros",{sessao:V("sessao").toLowerCase(),fichas:V("fichas").toLowerCase(),
    jogadores:V("jogadores").toLowerCase(),aviso:!!aviso});
}
function textoTrilha(){
  return htmlDe("t-texto-trilha",{sessao:V("sessao").toLowerCase(),trilha:Vm("trilha"),cena:V("cena").toLowerCase(),
    jogadores:V("jogadores").toLowerCase()});
}
function confirmarFaixas(arqs,cb){
  var cats={}; arqs.forEach(function(f){ var p=(f.webkitRelativePath||f.name).split("/");
    var c=p.length>1?p[p.length-2]:"Sem categoria"; cats[c]=(cats[c]||0)+1; });
  var ov=overlay(arqs.length+(arqs.length===1?" faixa a enviar":" faixas a enviar"),htmlDe("t-confirma-faixas",{texto:textoTrilha(),
    categorias:Object.keys(cats).sort().map(function(c){ return {nome:c,n:cats[c]}; })}));
  $("#cfNo",ov).onclick=function(){ ov.close(); };
  $("#cfOk",ov).onclick=function(){ ov.close(); cb(); };
}
function renomearLivro(id,nome,depois){
  formulario("Nome do livro",[{k:"nome",rot:"Nome que aparece",obrig:true}],{nome:nome},{salvar:function(w){
    api(cAPI("/midia/"+id),{method:"PUT",body:{nome:String(w.nome).trim()}})
      .then(function(){ recarregaCatalogo(); recarregaIndice(); depois(); toast("Nome salvo"); })
      .catch(function(e){ toast((e&&e.message)||"não deu"); }); }});
}
/* A categoria mora em cada faixa (no servidor); a cor mora no guia. Renomear a
   categoria percorre as faixas dela e os blocos de trilha que a citam. */
function editarCategoria(nome,faixas,depois){
  var reg=(D.trilhaCategorias||[]).filter(function(x){return x.id===nome;})[0];
  var ops=[["","sem cor"]].concat(CORES_T);
  if(reg&&reg.cor&&!ops.some(function(o){return o[0]===reg.cor;}))ops.push([reg.cor,"cor atual"]);
  formulario("Categoria da trilha",[{k:"nome",rot:"Nome",obrig:true},{k:"cor",rot:"Cor",tipo:"sel",ops:ops}],
    {nome:nome,cor:reg?reg.cor:""},{salvar:function(w){
      var novo=String(w.nome).trim(), p=Promise.resolve();
      D.trilhaCategorias=(D.trilhaCategorias||[]).filter(function(x){return x.id!==nome&&x.id!==novo;});
      if(w.cor)D.trilhaCategorias.push({id:novo,cor:w.cor});
      if(novo!==nome){
        D.sessoes.forEach(function(s){ s.cenas.forEach(function(c){ (c.blocos||[]).forEach(function(b){
          if(b.tipo==="trilha")(b.itens||[]).forEach(function(tr){ if(tr.cat===nome)tr.cat=novo; }); }); }); });
        p=(faixas||[]).reduce(function(fila,f){ return fila.then(function(){
          return api(cAPI("/midia/"+f.id),{method:"PUT",body:{categoria:novo}}); }); },p);
      }
      save();
      p.then(function(){ recarregaCatalogo(); depois(); toast("Categoria salva"); })
       .catch(function(e){ recarregaCatalogo(); depois(); toast("Nem todas as faixas mudaram: "+((e&&e.message)||e)); }); }});
}
function moverFaixa(id,nome,atual,cats,depois){
  formulario("Categoria de “"+nome+"”",[{k:"categoria",rot:"Categoria",obrig:true,
      dica:"Existentes: "+cats.join(", ")+". Escreva um nome novo para criar outra."}],
    {categoria:atual},{salvar:function(w){
      api(cAPI("/midia/"+id),{method:"PUT",body:{categoria:String(w.categoria).trim()}})
        .then(function(){ recarregaCatalogo(); depois(); toast("Faixa movida"); })
        .catch(function(e){ toast((e&&e.message)||"não deu"); }); }});
}
