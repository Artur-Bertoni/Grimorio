/* Aba Biblioteca. */
"use strict";

/* ---------- ABA BIBLIOTECA ---------- */
function abrirArquivos(){ $$(".ov").forEach(function(o){ if(o.close)o.close(); }); S.view="biblioteca"; render(); }
function viewBiblioteca(){
  var k=S.bib;
  return htmlDe("t-biblioteca",{aba:k,cabeca:cabecaPagina(tituloApp(),"Biblioteca"),
    abas:subnav([["livros","Livros"],["trilha",Vm("trilha")],["imagens","Imagens"]],k,"data-bib"),
    texto:k==="livros"?textoLivros():(k==="trilha"?textoTrilha():"")});
}
function hydrateBiblioteca(v){
  var k=S.bib;
  $$("[data-bib]",v).forEach(function(b){ b.onclick=function(){ S.bib=b.getAttribute("data-bib"); render(); }; });
  function aqui(){ return S.view==="biblioteca"&&S.bib===k&&!!$("#bbList",v); }
  function lista(){
    api(cAPI("/midia")).then(function(c){ if(!aqui())return; c=c||{};
      var alvo=$("#bbList",v), jg=V("jogadores").toLowerCase();
      if(k==="livros")alvo.innerHTML=htmlDe("t-bib-livros",{docs:c.docs||[],jogadores:jg});
      if(k==="trilha"){ var porCat={};
        (c.faixas||[]).forEach(function(f){ var ct=f.cat||"Sem categoria"; (porCat[ct]=porCat[ct]||[]).push(f); });
        alvo.innerHTML=htmlDe("t-bib-trilha",{categorias:Object.keys(porCat).sort().map(function(ct){
          return {nome:ct,cor:catColor(ct),faixas:porCat[ct]}; })}); }
      if(k==="imagens")alvo.innerHTML=htmlDe("t-bib-imagens",{imagens:c.imagens||[]});
      $$("[data-pub]",alvo).forEach(function(b){ b.onclick=function(){ b.disabled=true;
        api(cAPI("/midia/"+b.getAttribute("data-pub")),{method:"PUT",body:{publico:b.getAttribute("data-v")==="1"}})
          .then(function(){ recarregaIndice(); lista(); })
          .catch(function(e){ b.disabled=false; toast((e&&e.message)||"não deu"); }); }; });
      $$("[data-reidx]",alvo).forEach(function(b){ b.onclick=function(){ b.disabled=true; b.textContent="lendo…";
        api(cAPI("/midia/"+b.getAttribute("data-reidx")+"/reindexar"),{method:"POST"}).then(function(r){ r=r||{};
          recarregaIndice(); if(aqui())lista();
          toast(r.comCapitulo?(r.comCapitulo+" de "+r.paginas+" páginas ganharam capítulo")
            :"Índice refeito. Este PDF não traz sumário interno, então fica sem capítulos"); })
        .catch(function(e){ b.disabled=false; b.textContent="Reler capítulos"; toast((e&&e.message)||"não deu"); }); }; });
      $$("[data-ren]",alvo).forEach(function(b){ b.onclick=function(){ renomearLivro(b.getAttribute("data-ren"),b.getAttribute("data-nome"),lista); }; });
      $$("[data-cated]",alvo).forEach(function(b){ b.onclick=function(){ var ct=b.getAttribute("data-cated");
        editarCategoria(ct,(porCat&&porCat[ct])||[],function(){ if(aqui())lista(); }); }; });
      $$("[data-fxcat]",alvo).forEach(function(b){ b.onclick=function(){
        moverFaixa(b.getAttribute("data-fxcat"),b.getAttribute("data-nome"),b.getAttribute("data-cat"),Object.keys(porCat||{}).sort(),function(){ if(aqui())lista(); }); }; });
      $$("[data-abrir]",alvo).forEach(function(b){ b.onclick=function(){ abrirPdf(b.getAttribute("data-abrir"),1); }; });
      $$("[data-toca]",alvo).forEach(function(b){ b.onclick=function(){ tocar(b.getAttribute("data-toca")); }; });
      $$("[data-ver]",alvo).forEach(function(n){ n.onclick=function(){ projetar(n.getAttribute("data-ver"),n.getAttribute("data-cap")); }; });
      $$("[data-del]",alvo).forEach(function(b){ b.onclick=function(){
        /* arquivo apagado no servidor nao volta: aqui a confirmacao e de verdade */
        if(!confirm('Remover "'+b.getAttribute("data-nome")+'"? O arquivo sai do servidor e não dá para desfazer.'))return;
        b.disabled=true;
        api(cAPI("/midia/"+b.getAttribute("data-del")),{method:"DELETE"})
          .then(function(){ recarregaCatalogo(); recarregaIndice(); lista(); })
          .catch(function(e){ b.disabled=false; toast((e&&e.message)||"não deu"); }); }; });
    }).catch(function(){ if(aqui())$("#bbList",v).innerHTML=htmlDe("t-vazio",{texto:"Não consegui listar."}); });
  }
  lista();

  function progresso(i,tot,nome,frac){ var box=$("#bbProg",v); if(!box)return;
    box.hidden=false; $("#bbN",v).textContent=(i+1)+"/"+tot+" · "+nome;
    $("#bbB",v).style.width=Math.round(((i+(frac||0))/tot)*100)+"%"; }
  function fila(arqs,fn){
    if(!arqs.length){ toast("Nenhum arquivo desse tipo no que você escolheu"); return; }
    var i=0,erros=[];
    (function passo(){
      if(i>=arqs.length){ var box=$("#bbProg",v); if(box)box.hidden=true;
        recarregaCatalogo(); recarregaIndice(); lista();
        toast(erros.length?(arqs.length-erros.length)+" enviados, "+erros.length+" falharam: "+erros[0]
                          :arqs.length+(arqs.length===1?" arquivo enviado":" arquivos enviados"));
        return; }
      var f=arqs[i];
      progresso(i,arqs.length,f.name,0);
      fn(f,function(fr){ progresso(i,arqs.length,f.name,fr); })
        .catch(function(e){ erros.push(f.name+" ("+((e&&e.message)||e)+")"); })
        .then(function(){ i++; passo(); });
    })();
  }
  function enviaPdf(f,onp){ var m=abrevDe(f.name), fd=new FormData();
    fd.append("abrev",f.__ab||m.ab); fd.append("nome",f.__nome||m.nome); fd.append("arquivo",f);
    return upload(cAPI("/midia/pdf"),fd,onp); }
  function enviaImg(f,onp){ var fd=new FormData();
    fd.append("nome",f.name.replace(/\.[^.]+$/,"")); fd.append("arquivo",f);
    return upload(cAPI("/midia/img"),fd,onp); }
  function enviaMp3(f,onp){ var rel=f.webkitRelativePath||f.name, p=rel.split("/");
    var fd=new FormData();
    fd.append("categoria",p.length>1?p[p.length-2]:"Sem categoria");
    fd.append("nome",f.name.replace(/\.[^.]+$/,"")); fd.append("arquivo",f);
    return upload(cAPI("/midia/audio"),fd,onp); }
  var TP={livros:{re:/\.pdf$/i,ac:".pdf",fn:enviaPdf},
          trilha:{re:/\.(mp3|m4a|ogg|wav)$/i,ac:"audio/*",fn:enviaMp3},
          imagens:{re:/\.(webp|png|jpe?g|gif|avif|svg)$/i,ac:"image/*",fn:enviaImg}}[k];
  function manda(pasta){ escolherArquivos(pasta,pasta?null:TP.ac).then(function(fs){
    var bons=fs.filter(function(f){return TP.re.test(f.name);});
    if(k==="livros"&&bons.length)confirmarLivros(bons,function(l){ if(l.length)fila(l,TP.fn); });
    else if(k==="trilha"&&bons.length)confirmarFaixas(bons,function(){ fila(bons,TP.fn); });
    else fila(bons,TP.fn); }); }
  var up=$("#bbUp",v); if(up)up.onclick=function(){ manda(false); };
  var pa=$("#bbPasta",v); if(pa)pa.onclick=function(){ manda(true); };
  var sc=$("#bbScan",v); if(sc)sc.onclick=function(){
    sc.disabled=true; sc.textContent="Procurando…";
    api(cAPI("/midia/reescanear"),{method:"POST"}).then(function(r){
      sc.disabled=false; sc.textContent="Reescanear o volume";
      recarregaCatalogo(); recarregaIndice(); lista();
      var n=(r.pdfs||0)+(r.audios||0)+(r.imagens||0);
      toast(n?((r.pdfs||0)+" PDFs, "+(r.audios||0)+" faixas e "+(r.imagens||0)+" imagens registrados"):"Nada novo no volume");
    }).catch(function(e){ sc.disabled=false; sc.textContent="Reescanear o volume"; toast((e&&e.message)||"não deu"); }); };
}
