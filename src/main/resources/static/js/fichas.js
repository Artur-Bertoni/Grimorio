/* Fichas de personagem e importacao de PDF. */
"use strict";

/* ---------- FICHAS ----------
   Os campos sao da campanha (MESA.fichaModelo), nunca de um sistema. A ficha e uma lista
   plana de campos com a secao escrita em cada um: e o que o formulario de grupo sabe editar. */
var FICHAS=[], fichaT={};
var FICHA_TIPOS=[["texto","Texto curto"],["num","Número (clicar rola)"],["barra","Barra (atual / máximo)"],["area","Texto longo"],["check","Caixa de marcar"]];
var FICHA_PADRAO=[{sec:"Identidade",rot:"Conceito",tipo:"texto"},{sec:"Identidade",rot:"Jogador",tipo:"texto"},
  {sec:"Recursos",rot:"Vida",tipo:"barra"},{sec:"Recursos",rot:"Energia",tipo:"barra"},
  {sec:"Atributos",rot:"Atributo",tipo:"num"},{sec:"Perícias",rot:"Perícia",tipo:"num"},
  {sec:"Equipamento",rot:"Itens",tipo:"area"},{sec:"Anotações",rot:"Notas",tipo:"area"}];
function fichaModelo(){ return (Array.isArray(MESA.fichaModelo)&&MESA.fichaModelo.length)?MESA.fichaModelo:FICHA_PADRAO; }
function fichaFormula(){ return typeof MESA.fichaFormula==="string"?MESA.fichaFormula:"1d20+{v}"; }
function fichaDados(f){
  if(f._c){ return f._c; }
  var c={};
  try{ c=JSON.parse(f.json||"{}")||{}; }catch(error_){ /* falha aqui nao muda o que a pessoa ve */ }
  if(!Array.isArray(c.campos)){ c.campos=[]; }
  f._c=c; return c;
}
function fichaCampoLimpo(x){
  var t=String(x?.tipo||"texto");
  if(!FICHA_TIPOS.some(function(o){ return o[0]===t; })){ t="texto"; }
  return {sec:String(x?.sec||"").trim().slice(0,60),rot:String(x?.rot||"").trim().slice(0,80),tipo:t,
    val:String(x?.val??"").slice(0,4000),max:String(x?.max??"").slice(0,12)};
}
function gravaFicha(f,ja){
  clearTimeout(fichaT[f.id]);
  var faz=function(){ f.json=JSON.stringify(fichaDados(f));
    api(cAPI("/fichas/"+f.id),{method:"PUT",body:{nome:f.nome,json:f.json}}).catch(function(e){ toast(e?.message||"não consegui salvar a ficha"); }); };
  if(ja){ faz(); } else { fichaT[f.id]=setTimeout(faz,600); }
}
function carregaFichas(){ return api(cAPI("/fichas")).then(function(l){ FICHAS=Array.isArray(l)?l:[]; return FICHAS; }); }
function fichasSecHtml(){
  return htmlDe("t-fichas",{mestre:GM,ia:!!IACFG});
}
function pintaFichas(){
  var box=$("#fxList"); if(!box){ return; }
  box.innerHTML=htmlDe("t-fichas-lista",{fichas:FICHAS.map(function(f){ var c=fichaDados(f);
    return {id:f.id,nome:f.nome,dono:GM&&!f.minha?f.dono:"",campos:c.campos.length,
      barras:c.campos.filter(function(x){ return x.tipo==="barra"&&x.max; }).slice(0,2)}; })});
  $$("[data-ficha]",box).forEach(function(b){ b.onclick=function(){
    abrirFicha(FICHAS.find(function(f){ return String(f.id)===b.dataset.ficha; })); }; });
}
function ligarFichas(){
  carregaFichas().then(pintaFichas).catch(function(){ var b=$("#fxList"); if(b){ b.innerHTML=htmlDe("t-vazio",{texto:"Não consegui ler as fichas."}); } });
  var n=$("#fxNova");
  if(n){ n.onclick=function(){ criaFicha("Novo personagem",fichaModelo().map(function(x){ return fichaCampoLimpo(x); }),true); }; }
  var m=$("#fxModelo"); if(m){ m.onclick=editarModeloFicha; }
  var lv=$("#fxLivros"); if(lv){ lv.onclick=abrirFichaLivros; }
  var p=$("#fxPdf"), a=$("#fxArq");
  if(p&&a){
    p.onclick=function(){ a.value=""; a.click(); };
    a.onchange=function(){ if(a.files?.[0]){ importarFichaPdf(a.files[0]); } };
  }
}
function criaFicha(nome,campos,editar){
  return api(cAPI("/fichas"),{method:"POST",body:{nome:nome,json:JSON.stringify({campos:campos})}}).then(function(f){
    FICHAS.push(f); pintaFichas(); if(editar){ editarFicha(f); } return f; })
   .catch(function(e){ toast(e?.message||"não deu para criar a ficha"); });
}
function fichaGrupo(comValor){
  var cs=[{k:"sec",rot:"Seção"},{k:"rot",rot:"Rótulo"},{k:"tipo",rot:"Tipo",tipo:"sel",ops:FICHA_TIPOS}];
  if(comValor){ cs.push({k:"val",rot:"Valor"},{k:"max",rot:"Máximo (só em barra)"}); }
  return {k:"campos",rot:"Campos",tipo:"grupo",um:"campo",novo:function(){ return {sec:"",rot:"",tipo:"texto",val:"",max:""}; },campos:cs};
}
function apagaFicha(f,depois){
  confirmar("A ficha sai do servidor e não dá para desfazer.",{titulo:"Apagar esta ficha?",sim:"Apagar a ficha"})
    .then(function(sim){ return sim?api(cAPI("/fichas/"+f.id),{method:"DELETE"}):false; })
    .then(function(r){
      if(r===false){ return; }
      FICHAS=FICHAS.filter(function(x){ return x!==f; }); pintaFichas();
      if(depois){ depois(true); }
      toast("Ficha apagada","ok");
    })
    .catch(function(e){ toast(mensagemDeErro(e),"erro"); });
}
function editarFicha(f,depois){
  var c=fichaDados(f);
  formulario("Editar · ficha",[{k:"nome",rot:"Nome do personagem",obrig:true},
    {k:"visao",rot:"Alcance da visão (casas)",tipo:"num",dica:"Quanto este personagem enxerga na névoa do mapa. Vazio usa o alcance padrão do mapa; 0 é cego."},
    fichaGrupo(true)],{nome:f.nome,visao:c.visao==null||c.visao===""?null:c.visao,campos:c.campos},{
    salvar:function(w){ f.nome=String(w.nome).trim()||"Sem nome";
      if(w.visao==null||w.visao===""){ delete c.visao; } else { c.visao=Math.min(100,Math.max(0,Number(w.visao)||0)); }
      c.campos=(w.campos||[]).map(fichaCampoLimpo).filter(function(x){ return x.rot||x.val; });
      gravaFicha(f,true); pintaFichas(); if(depois){ depois(); } },
    remover:function(){ apagaFicha(f,depois); }
  });
}
function editarModeloFicha(){
  formulario("Modelo da ficha",[
    {k:"formula",rot:"Rolagem ao clicar num número",dica:"{v} vira o valor do campo. Ex.: 1d20+{v}. Deixe vazio para o clique não rolar nada."},
    fichaGrupo(false)
  ],{formula:fichaFormula(),campos:fichaModelo()},{
    salvar:function(w){ MESA.fichaFormula=String(w.formula||"").trim();
      MESA.fichaModelo=(w.campos||[]).map(function(x){ var y=fichaCampoLimpo(x); return {sec:y.sec,rot:y.rot,tipo:y.tipo}; })
        .filter(function(x){ return x.rot; });
      salvarMesa(); toast("Modelo salvo. Vale para as próximas fichas."); }
  });
}
function fichaCorpoHtml(f){
  var c=fichaDados(f), secs=[], mapa={};
  c.campos.forEach(function(x,i){ var s=x.sec||"Geral"; if(!mapa[s]){ mapa[s]=[]; secs.push(s); } mapa[s].push({x:x,i:i}); });
  return htmlDe("t-ficha-corpo",{rola:!!fichaFormula(),secoes:secs.map(function(s){ var l=mapa[s];
    return {nome:s,nums:l.filter(function(o){ return o.x.tipo==="num"; }),
      resto:l.filter(function(o){ return o.x.tipo!=="num"; }).map(function(o){
        var mx=Number.parseFloat(o.x.max)||0, v=Number.parseFloat(o.x.val)||0;
        return {x:o.x,i:o.i,pc:mx>0?Math.max(0,Math.min(100,v/mx*100)):0}; })}; })});
}
/* o + e o - da barra: nunca abaixo de zero nem acima do maximo */
function fichaPasso(x,passo){
  var mx=Number.parseFloat(x.max), v=Math.max(0,(Number.parseFloat(x.val)||0)+passo);
  if(Number.isFinite(mx)&&mx>0&&v>mx){ v=mx; }
  x.val=String(v);
}
/* clicar num numero rola a formula do modelo com o valor do campo no lugar de {v} */
function fichaRola(x,nome){
  var fo=fichaFormula();
  if(!fo){ return; }
  var n=Number.parseInt(String(x.val).replace(/[^\d+-]/g,""),10)||0;
  abrirDados({formula:fo.replaceAll("{v}",(n<0?"-":"")+Math.abs(n)).replaceAll("+-","-"),rotulo:x.rot+" · "+nome,auto:true});
}
function abrirFicha(f){
  if(!f){ return; }
  var ov=overlay(f.nome,"",{wide:true,cls:"fichasheet",head:htmlDe("t-ficha-cabeca",{mestre:GM})});
  $(".sbodyscroll",ov).appendChild(el("div",{id:"fxBody"}));
  var fm=$("#fxMod",ov);
  if(fm){ fm.onclick=function(){
    /* reversivel: troca na hora e oferece desfazer, como as outras remocoes */
    var antes=MESA.fichaModelo;
    MESA.fichaModelo=fichaDados(f).campos.map(function(x){ return {sec:x.sec,rot:x.rot,tipo:x.tipo}; }).filter(function(x){ return x.rot; });
    salvarMesa();
    toastAcao("Modelo trocado: "+MESA.fichaModelo.length+" campos. As fichas que já existem não mudam.","Desfazer",function(){
      MESA.fichaModelo=antes; salvarMesa(); toast("Desfeito","ok"); }); }; }
  function pinta(){
    if(!document.body.contains(ov)){ return; }
    ov.querySelector(".stit").textContent=f.nome+(GM&&!f.minha?" · "+f.dono:"");
    var b=$("#fxBody",ov), c=fichaDados(f); b.innerHTML=fichaCorpoHtml(f);
    $$("[data-fb]",b).forEach(function(bt){ bt.onclick=function(e){
      fichaPasso(c.campos[+bt.dataset.fb],(+bt.dataset.d)*(e.shiftKey?5:1)); gravaFicha(f); pinta(); pintaFichas(); }; });
    $$("[data-fc]",b).forEach(function(ck){ ck.onchange=function(){ c.campos[+ck.dataset.fc].val=ck.checked?"1":""; gravaFicha(f); }; });
    $$("[data-fn]",b).forEach(function(bt){ bt.onclick=function(){ fichaRola(c.campos[+bt.dataset.fn],f.nome); }; });
  }
  $("#fxEd",ov).onclick=function(){ editarFicha(f,function(apagou){ if(apagou){ ov.close(); } else { pinta(); } }); };
  pinta();
}

/* ---- importar ficha de PDF ----
   Primeiro os campos de formulario do PDF (ficha preenchivel entrega rotulo e valor prontos),
   depois o texto das paginas. Com IA configurada ela organiza; sem, a montagem e local. */
/* um campo de formulario do PDF: rotulo e valor; caixa desmarcada e campo vazio nao entram */
function fichaCampoDoWidget(a){
  if(a.subtype!=="Widget"||!a.fieldName){ return null; }
  var v=a.fieldValue;
  if(a.checkBox||a.radioButton){
    if(!v||v==="Off"){ return null; }
    if(a.radioButton&&a.buttonValue!=null&&v!==a.buttonValue){ return null; }
    v=a.checkBox?"1":String(v);
  }
  if(Array.isArray(v)){ v=v.join(", "); }
  v=String(v??"").trim();
  var rot=String(a.alternativeText||a.fieldName).replace(/[_.[\]]+/g," ").replace(/\s+/g," ").trim();
  return v&&rot?{rot:rot.slice(0,80),val:v,ck:!!a.checkBox}:null;
}
/* o texto da pagina em linhas: o que esta na mesma altura (em passos de 3 pt) vira uma linha, da esquerda para a direita */
function fichaLinhasDoTexto(itens){
  var ys={};
  itens.forEach(function(it){
    if(!it.str?.trim()){ return; }
    var y=Math.round(it.transform[5]/3);
    if(!ys[y]){ ys[y]=[]; }
    ys[y].push(it);
  });
  return Object.keys(ys).map(Number).sort(function(a,b){ return b-a; }).map(function(y){
    return ys[y].sort(function(a,b){ return a.transform[4]-b.transform[4]; }).map(function(it){ return it.str; }).join(" ").replace(/\s+/g," ").trim();
  });
}
function fichaLePagina(doc,i,acc){
  return doc.getPage(i).then(function(p){
    return Promise.all([p.getAnnotations().catch(function(){ return []; }),p.getTextContent().catch(function(){ return {items:[]}; })]);
  }).then(function(r){
    r[0].forEach(function(a){ var c=fichaCampoDoWidget(a); if(c){ acc.campos.push(c); } });
    fichaLinhasDoTexto(r[1].items).forEach(function(l){ acc.linhas.push(l); });
  });
}
function lerPdfFicha(arq){
  return Promise.all([arq.arrayBuffer(),carregaPdfjs()]).then(function(r){ return r[1].getDocument({data:r[0]}).promise; }).then(function(doc){
    var acc={campos:[],linhas:[],doc:doc}, n=Math.min(doc.numPages,8), ch=Promise.resolve();
    for(var i=1;i<=n;i++){ ch=ch.then(fichaLePagina.bind(null,doc,i,acc)); }
    return ch.then(function(){ return acc; });
  });
}
/* uma pagina do PDF desenhada em JPEG, so o base64, para a IA ler */
function fichaPaginaEmJpeg(doc,k,out){
  var cv=document.createElement("canvas");
  return doc.getPage(k).then(function(p){
    var v1=p.getViewport({scale:1}), vp=p.getViewport({scale:Math.min(2.5,1500/v1.width)});
    cv.width=Math.round(vp.width); cv.height=Math.round(vp.height);
    var cx=cv.getContext("2d"); cx.fillStyle="#fff"; cx.fillRect(0,0,cv.width,cv.height);
    return p.render({canvasContext:cx,viewport:vp}).promise;
  }).then(function(){ out.push(cv.toDataURL("image/jpeg",0.82).split(",")[1]); });
}
function paginasEmImagem(doc,max){
  var out=[], ch=Promise.resolve(), n=Math.min(doc.numPages,max||3);
  for(var i=1;i<=n;i++){ ch=ch.then(fichaPaginaEmJpeg.bind(null,doc,i,out)); }
  return ch.then(function(){ return out; });
}
/* o tipo pelo jeito do valor: "7/10" e barra, numero curto e numero, texto comprido e area */
function fichaTipoDoValor(b){
  var bar=/^(-?\d+)\s*\/\s*(\d+)$/.exec(b.val);
  if(b.ck){ return {tipo:"check",val:b.val,max:""}; }
  if(bar){ return {tipo:"barra",val:bar[1],max:bar[2]}; }
  if(/^[+-]?\d{1,4}$/.test(b.val)){ return {tipo:"num",val:b.val,max:""}; }
  return {tipo:b.val.length>70||b.val.includes("\n")?"area":"texto",val:b.val,max:""};
}
function fichaDoLido(lido,nomeArq){
  var secDe={}; fichaModelo().forEach(function(m){ secDe[norm(m.rot)]=m; });
  var bruto=lido.campos.slice();
  if(!bruto.length){ lido.linhas.forEach(function(l){ var m=/^(.{2,40}?)\s*:\s*(.{1,400})$/.exec(l); if(m){ bruto.push({rot:m[1].trim(),val:m[2].trim()}); } }); }
  var nome="", campos=[];
  bruto.slice(0,200).forEach(function(b){
    if(!nome&&/^(nome|name|personagem|character)\b/i.test(b.rot)&&b.val.length<80){ nome=b.val; return; }
    var m=secDe[norm(b.rot)], t=fichaTipoDoValor(b);
    campos.push(fichaCampoLimpo({sec:m?m.sec:"Importado do PDF",rot:b.rot,tipo:t.tipo,val:t.val,max:t.max}));
  });
  return {nome:nome||String(nomeArq||"Ficha importada").replace(/\.pdf$/i,""),campos:campos};
}
function fichaDaIa(r){
  var o=typeof r==="string"?JSON.parse(r):r;
  return {nome:String(o.nome||"").trim(),campos:(o.campos||[]).map(fichaCampoLimpo).filter(function(x){ return x.rot; })};
}
/* PDF que e so imagem (escaneado, ou ficha que e toda arte): as paginas vao desenhadas para a IA,
   que le o que esta impresso. Sem IA nesta instancia nao ha como ler. */
function importarFichaImagem(lido,arq){
  if(!IACFG){ toast("Esse PDF é só imagem. Para ler ficha escaneada ou desenhada, a IA precisa estar configurada nesta instância."); return Promise.resolve(); }
  toast("O PDF é só imagem: a IA está lendo as páginas…");
  var lida=null;
  return paginasEmImagem(lido.doc,3)
    .then(function(imgs){ return api(cAPI("/fichas/importar"),{method:"POST",body:{texto:"",imagens:imgs}}); })
    .then(function(r){
      lida=fichaDaIa(r);
      if(!lida.campos.length){ toast("A IA não achou campos nessa ficha."); return null; }
      return criaFicha(lida.nome||String(arq.name||"Ficha").replace(/\.pdf$/i,""),lida.campos,true);
    })
    .then(function(f){
      if(!f){ return; }
      var vazios=lida.campos.filter(function(x){ return !x.val; }).length;
      toast("A IA leu "+lida.campos.length+" campos"+(vazios===lida.campos.length?" (ficha em branco: preencha os valores)":"")+". Confira e ajuste.");
    })
    .catch(function(e){ toast("A IA não conseguiu ler a imagem"+(e?.message?": "+e.message:"")); });
}
/* PDF com texto: com IA ela organiza os campos; sem IA, ou se ela falhar, vale a montagem local */
function fichaMontada(lido,arq){
  var local=fichaDoLido(lido,arq.name);
  if(!IACFG){ return Promise.resolve(local); }
  var texto=(lido.campos.map(function(c){ return c.rot+": "+c.val; }).join("\n")+"\n--- TEXTO DAS PAGINAS ---\n"+lido.linhas.join("\n")).slice(0,40000);
  return api(cAPI("/fichas/importar"),{method:"POST",body:{texto:texto}}).then(function(r){
    var fi=fichaDaIa(r);
    if(!fi.campos.length){ throw new Error("vazio"); }
    return {nome:fi.nome||local.nome,campos:fi.campos};
  }).catch(function(){ toast("A IA não respondeu; montei a ficha só com a leitura do PDF."); return local; });
}
function importarFichaTexto(lido,arq){
  var fi=null;
  return fichaMontada(lido,arq).then(function(x){
    fi=x;
    if(!fi.campos.length){ toast("Li o PDF, mas não achei campos com rótulo e valor."); return null; }
    return criaFicha(fi.nome,fi.campos,true);
  }).then(function(f){ if(f){ toast("Li "+fi.campos.length+" campos do PDF. Confira e ajuste."); } });
}
function importarFichaPdf(arq){
  toast("Lendo o PDF…");
  lerPdfFicha(arq).then(function(lido){
    var semTexto=!lido.campos.length&&lido.linhas.join("").replace(/\s/g,"").length<20;
    return semTexto?importarFichaImagem(lido,arq):importarFichaTexto(lido,arq);
  }).catch(function(e){ toast("Não consegui ler esse PDF"+(e?.message?": "+e.message:"")); });
}
