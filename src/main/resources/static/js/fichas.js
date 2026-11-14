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
function fichaDados(f){ if(f._c)return f._c; var c={}; try{ c=JSON.parse(f.json||"{}")||{}; }catch(e){}
  if(!Array.isArray(c.campos))c.campos=[]; f._c=c; return c; }
function fichaCampoLimpo(x){ var t=String((x&&x.tipo)||"texto");
  if(!FICHA_TIPOS.some(function(o){ return o[0]===t; }))t="texto";
  return {sec:String((x&&x.sec)||"").trim().slice(0,60),rot:String((x&&x.rot)||"").trim().slice(0,80),tipo:t,
    val:String(x&&x.val!=null?x.val:"").slice(0,4000),max:String(x&&x.max!=null?x.max:"").slice(0,12)}; }
function gravaFicha(f,ja){
  clearTimeout(fichaT[f.id]);
  var faz=function(){ f.json=JSON.stringify(fichaDados(f));
    api(cAPI("/fichas/"+f.id),{method:"PUT",body:{nome:f.nome,json:f.json}}).catch(function(e){ toast((e&&e.message)||"não consegui salvar a ficha"); }); };
  if(ja)faz(); else fichaT[f.id]=setTimeout(faz,600);
}
function carregaFichas(){ return api(cAPI("/fichas")).then(function(l){ FICHAS=Array.isArray(l)?l:[]; return FICHAS; }); }
function fichasSecHtml(){
  return htmlDe("t-fichas",{mestre:GM,ia:!!IACFG});
}
function pintaFichas(){
  var box=$("#fxList"); if(!box)return;
  box.innerHTML=htmlDe("t-fichas-lista",{fichas:FICHAS.map(function(f){ var c=fichaDados(f);
    return {id:f.id,nome:f.nome,dono:GM&&!f.minha?f.dono:"",campos:c.campos.length,
      barras:c.campos.filter(function(x){ return x.tipo==="barra"&&x.max; }).slice(0,2)}; })});
  $$("[data-ficha]",box).forEach(function(b){ b.onclick=function(){
    abrirFicha(FICHAS.filter(function(f){ return String(f.id)===b.getAttribute("data-ficha"); })[0]); }; });
}
function ligarFichas(){
  carregaFichas().then(pintaFichas).catch(function(){ var b=$("#fxList"); if(b)b.innerHTML=htmlDe("t-vazio",{texto:"Não consegui ler as fichas."}); });
  var n=$("#fxNova"); if(n)n.onclick=function(){
    criaFicha("Novo personagem",fichaModelo().map(function(x){ return fichaCampoLimpo(x); }),true); };
  var m=$("#fxModelo"); if(m)m.onclick=editarModeloFicha;
  var p=$("#fxPdf"), a=$("#fxArq");
  if(p&&a){ p.onclick=function(){ a.value=""; a.click(); };
    a.onchange=function(){ if(a.files&&a.files[0])importarFichaPdf(a.files[0]); }; }
}
function criaFicha(nome,campos,editar){
  return api(cAPI("/fichas"),{method:"POST",body:{nome:nome,json:JSON.stringify({campos:campos})}}).then(function(f){
    FICHAS.push(f); pintaFichas(); if(editar)editarFicha(f); return f; })
   .catch(function(e){ toast((e&&e.message)||"não deu para criar a ficha"); });
}
function fichaGrupo(comValor){
  var cs=[{k:"sec",rot:"Seção"},{k:"rot",rot:"Rótulo"},{k:"tipo",rot:"Tipo",tipo:"sel",ops:FICHA_TIPOS}];
  if(comValor)cs.push({k:"val",rot:"Valor"},{k:"max",rot:"Máximo (só em barra)"});
  return {k:"campos",rot:"Campos",tipo:"grupo",um:"campo",novo:function(){ return {sec:"",rot:"",tipo:"texto",val:"",max:""}; },campos:cs};
}
function editarFicha(f,depois){
  var c=fichaDados(f);
  formulario("Editar · ficha",[{k:"nome",rot:"Nome do personagem",obrig:true},fichaGrupo(true)],{nome:f.nome,campos:c.campos},{
    salvar:function(w){ f.nome=String(w.nome).trim()||"Sem nome";
      c.campos=(w.campos||[]).map(fichaCampoLimpo).filter(function(x){ return x.rot||x.val; });
      gravaFicha(f,true); pintaFichas(); if(depois)depois(); },
    remover:function(){ if(!confirm("Apagar esta ficha? Não tem volta."))return;
      api(cAPI("/fichas/"+f.id),{method:"DELETE"}).then(function(){
        FICHAS=FICHAS.filter(function(x){ return x!==f; }); pintaFichas(); if(depois)depois(true); toast("Ficha apagada"); })
       .catch(function(e){ toast((e&&e.message)||"não deu"); }); }
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
        var mx=parseFloat(o.x.max)||0, v=parseFloat(o.x.val)||0;
        return {x:o.x,i:o.i,pc:mx>0?Math.max(0,Math.min(100,v/mx*100)):0}; })}; })});
}
function abrirFicha(f){
  if(!f)return;
  var ov=overlay(f.nome,"",{wide:true,cls:"fichasheet",head:htmlDe("t-ficha-cabeca",{mestre:GM})});
  $(".sbodyscroll",ov).appendChild(el("div",{id:"fxBody"}));
  var fm=$("#fxMod",ov); if(fm)fm.onclick=function(){
    if(!confirm("Trocar o modelo de ficha da campanha pelos campos desta ficha? As fichas que já existem não mudam."))return;
    MESA.fichaModelo=fichaDados(f).campos.map(function(x){ return {sec:x.sec,rot:x.rot,tipo:x.tipo}; }).filter(function(x){ return x.rot; });
    salvarMesa(); toast("Modelo trocado: "+MESA.fichaModelo.length+" campos"); };
  function pinta(){
    if(!document.body.contains(ov))return;
    ov.querySelector("h3").textContent=f.nome+(GM&&!f.minha?" · "+f.dono:"");
    var b=$("#fxBody",ov), c=fichaDados(f); b.innerHTML=fichaCorpoHtml(f);
    $$("[data-fb]",b).forEach(function(bt){ bt.onclick=function(e){ var x=c.campos[+bt.getAttribute("data-fb")];
      var mx=parseFloat(x.max), v=(parseFloat(x.val)||0)+(+bt.getAttribute("data-d"))*(e.shiftKey?5:1);
      if(v<0)v=0; if(isFinite(mx)&&mx>0&&v>mx)v=mx; x.val=String(v); gravaFicha(f); pinta(); pintaFichas(); }; });
    $$("[data-fc]",b).forEach(function(ck){ ck.onchange=function(){ c.campos[+ck.getAttribute("data-fc")].val=ck.checked?"1":""; gravaFicha(f); }; });
    $$("[data-fn]",b).forEach(function(bt){ bt.onclick=function(){ var x=c.campos[+bt.getAttribute("data-fn")], fo=fichaFormula(); if(!fo)return;
      var n=parseInt(String(x.val).replace(/[^\d+-]/g,""),10)||0;
      abrirDados({formula:fo.replace(/\{v\}/g,(n<0?"-":"")+Math.abs(n)).replace(/\+-/g,"-"),rotulo:x.rot+" · "+f.nome,auto:true}); }; });
  }
  $("#fxEd",ov).onclick=function(){ editarFicha(f,function(apagou){ if(apagou)ov.close(); else pinta(); }); };
  pinta();
}

/* ---- importar ficha de PDF ----
   Primeiro os campos de formulario do PDF (ficha preenchivel entrega rotulo e valor prontos),
   depois o texto das paginas. Com IA configurada ela organiza; sem, a montagem e local. */
function lerPdfFicha(arq){
  return arq.arrayBuffer().then(function(buf){ return window.pdfjsLib.getDocument({data:buf}).promise; }).then(function(doc){
    var campos=[], linhas=[], n=Math.min(doc.numPages,8), ch=Promise.resolve();
    var pag=function(i){ return doc.getPage(i).then(function(p){
      return Promise.all([p.getAnnotations().catch(function(){ return []; }),
                          p.getTextContent().catch(function(){ return {items:[]}; })]).then(function(r){
        r[0].forEach(function(a){ if(a.subtype!=="Widget"||!a.fieldName)return;
          var v=a.fieldValue, ck=!!(a.checkBox||a.radioButton);
          if(ck){ if(!v||v==="Off")return; if(a.radioButton&&a.buttonValue!=null&&v!==a.buttonValue)return; v=a.checkBox?"1":String(v); }
          if(Array.isArray(v))v=v.join(", ");
          v=String(v==null?"":v).trim(); if(!v)return;
          var rot=String(a.alternativeText||a.fieldName).replace(/[_.\[\]]+/g," ").replace(/\s+/g," ").trim();
          if(rot)campos.push({rot:rot.slice(0,80),val:v,ck:!!a.checkBox}); });
        var ys={}; r[1].items.forEach(function(it){ if(!it.str||!it.str.trim())return;
          var y=Math.round(it.transform[5]/3); (ys[y]=ys[y]||[]).push(it); });
        Object.keys(ys).map(Number).sort(function(a,b){ return b-a; }).forEach(function(y){
          linhas.push(ys[y].sort(function(a,b){ return a.transform[4]-b.transform[4]; }).map(function(it){ return it.str; }).join(" ").replace(/\s+/g," ").trim()); });
      }); }); };
    for(var i=1;i<=n;i++)(function(k){ ch=ch.then(function(){ return pag(k); }); })(i);
    return ch.then(function(){ return {campos:campos,linhas:linhas,doc:doc}; });
  });
}
/* paginas do PDF desenhadas em JPEG, so o base64, para a IA ler */
function paginasEmImagem(doc,max){
  var out=[], ch=Promise.resolve(), n=Math.min(doc.numPages,max||3);
  for(var i=1;i<=n;i++)(function(k){ ch=ch.then(function(){ return doc.getPage(k).then(function(p){
    var v1=p.getViewport({scale:1}), vp=p.getViewport({scale:Math.min(2.5,1500/v1.width)});
    var cv=document.createElement("canvas"); cv.width=Math.round(vp.width); cv.height=Math.round(vp.height);
    var cx=cv.getContext("2d"); cx.fillStyle="#fff"; cx.fillRect(0,0,cv.width,cv.height);
    return p.render({canvasContext:cx,viewport:vp}).promise.then(function(){
      out.push(cv.toDataURL("image/jpeg",.82).split(",")[1]); }); }); }); })(i);
  return ch.then(function(){ return out; });
}
function fichaDoLido(lido,nomeArq){
  var secDe={}; fichaModelo().forEach(function(m){ secDe[norm(m.rot)]=m; });
  var bruto=lido.campos.slice();
  if(!bruto.length)lido.linhas.forEach(function(l){ var m=/^(.{2,40}?)\s*:\s*(.{1,400})$/.exec(l); if(m)bruto.push({rot:m[1].trim(),val:m[2].trim()}); });
  var nome="", campos=[];
  bruto.slice(0,200).forEach(function(b){
    if(!nome&&/^(nome|name|personagem|character)\b/i.test(b.rot)&&b.val.length<80){ nome=b.val; return; }
    var m=secDe[norm(b.rot)], bar=/^(-?\d+)\s*\/\s*(\d+)$/.exec(b.val), tipo, val=b.val, max="";
    if(b.ck)tipo="check"; else if(bar){ tipo="barra"; val=bar[1]; max=bar[2]; }
    else if(/^[+-]?\d{1,4}$/.test(b.val))tipo="num"; else if(b.val.length>70||/\n/.test(b.val))tipo="area"; else tipo="texto";
    campos.push(fichaCampoLimpo({sec:m?m.sec:"Importado do PDF",rot:b.rot,tipo:tipo,val:val,max:max})); });
  return {nome:nome||String(nomeArq||"Ficha importada").replace(/\.pdf$/i,""),campos:campos};
}
function importarFichaPdf(arq){
  if(!window.pdfjsLib){ toast("Leitor de PDF indisponível"); return; }
  toast("Lendo o PDF…");
  lerPdfFicha(arq).then(function(lido){
    /* PDF que e so imagem (escaneado, ou ficha que e toda arte): as paginas vao desenhadas
       para a IA, que le o que esta impresso. Sem IA nesta instancia nao ha como ler. */
    var semTexto=!lido.campos.length&&lido.linhas.join("").replace(/\s/g,"").length<20;
    if(semTexto){
      if(!IACFG){ toast("Esse PDF é só imagem. Para ler ficha escaneada ou desenhada, a IA precisa estar configurada nesta instância."); return; }
      toast("O PDF é só imagem: a IA está lendo as páginas…");
      return paginasEmImagem(lido.doc,3).then(function(imgs){
        return api(cAPI("/fichas/importar"),{method:"POST",body:{texto:"",imagens:imgs}}); })
       .then(function(r){ if(typeof r==="string")r=JSON.parse(r);
         var cs=(r.campos||[]).map(fichaCampoLimpo).filter(function(x){ return x.rot; });
         if(!cs.length){ toast("A IA não achou campos nessa ficha."); return; }
         var vazios=cs.filter(function(x){ return !x.val; }).length;
         return criaFicha(String(r.nome||"").trim()||String(arq.name||"Ficha").replace(/\.pdf$/i,""),cs,true).then(function(f){
           if(f)toast("A IA leu "+cs.length+" campos"+(vazios===cs.length?" (ficha em branco: preencha os valores)":"")+". Confira e ajuste."); }); })
       .catch(function(e){ toast("A IA não conseguiu ler a imagem"+(e&&e.message?": "+e.message:"")); });
    }
    var local=function(){ return fichaDoLido(lido,arq.name); };
    var monta=IACFG
      ?api(cAPI("/fichas/importar"),{method:"POST",body:{texto:(lido.campos.map(function(c){ return c.rot+": "+c.val; }).join("\n")
            +"\n--- TEXTO DAS PAGINAS ---\n"+lido.linhas.join("\n")).slice(0,40000)}})
          .then(function(r){ if(typeof r==="string")r=JSON.parse(r);
            var cs=(r.campos||[]).map(fichaCampoLimpo).filter(function(x){ return x.rot; });
            if(!cs.length)throw new Error("vazio");
            return {nome:String(r.nome||"").trim()||local().nome,campos:cs}; })
          .catch(function(){ toast("A IA não respondeu; montei a ficha só com a leitura do PDF."); return local(); })
      :Promise.resolve(local());
    return monta.then(function(fi){
      if(!fi.campos.length){ toast("Li o PDF, mas não achei campos com rótulo e valor."); return; }
      return criaFicha(fi.nome,fi.campos,true).then(function(f){ if(f)toast("Li "+fi.campos.length+" campos do PDF. Confira e ajuste."); }); });
  }).catch(function(e){ toast("Não consegui ler esse PDF"+(e&&e.message?": "+e.message:"")); });
}
