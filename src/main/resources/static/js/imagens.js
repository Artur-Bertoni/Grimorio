/* Seletor de imagem. */
"use strict";

/* ---------- ESCOLHER IMAGEM ---------- */
/* Devolve o caminho relativo ("img/x.webp"), "" para tirar a imagem, ou null
   se a pessoa fechou sem escolher. Guardamos o caminho relativo e nao a URL:
   e isso que o IMG() sabe resolver, e e isso que o pacote carrega. */
function escolherImagem(atual){
  return new Promise(function(res){
    var escolhido=null, resolvido=false;
    var ov=overlay("Escolher imagem",htmlDe("t-imagens",{campanha:V("campanha").toLowerCase()}),{wide:true});
    var fechar=ov.close;
    ov.close=function(){ if(!resolvido){ resolvido=true; res(escolhido); } fechar(); };
    function pinta(figs){
      $("#eiList",ov).innerHTML=htmlDe("t-imagens-lista",{campanha:V("campanha").toLowerCase(),atual:atual,
        figuras:figs.map(function(x){ return {rel:x.arquivo||("img/"+x.nome),url:x.url,nome:x.nome}; })});
      $$("[data-pick]",ov).forEach(function(b){ b.onclick=function(){
        escolhido=b.getAttribute("data-pick"); ov.close();
      };});
    }
    function carrega(){
      api(cAPI("/midia")).then(function(c){ pinta((c&&c.imagens)||[]); })
        .catch(function(e){ $("#eiList",ov).innerHTML=htmlDe("t-vazio",{texto:(e&&e.message)||"não deu para listar"}); });
    }
    carrega();
    $("#eiClr",ov).onclick=function(){ escolhido=""; ov.close(); };
    $("#eiUp",ov).onclick=function(){
      escolherArquivos(false,"image/*").then(function(fs){
        if(!fs.length)return;
        var b=$("#eiUp",ov); b.disabled=true; b.textContent="Enviando…";
        var ultimo=null;
        fs.reduce(function(fila,f){
          return fila.then(function(){ return subirImagem(f).then(function(r){ ultimo=r&&r.arquivo; }); });
        },Promise.resolve()).then(function(){
          b.disabled=false; b.textContent="Enviar imagem nova";
          recarregaCatalogo();
          if(fs.length===1&&ultimo){ escolhido=ultimo; ov.close(); return; }
          carrega(); toast(fs.length+" imagens enviadas");
        }).catch(function(e){
          b.disabled=false; b.textContent="Enviar imagem nova";
          toast((e&&e.message)||"não deu para enviar");
        });
      });
    };
  });
}
function subirImagem(f){
  var fd=new FormData();
  fd.append("nome",f.name.replace(/\.[^.]+$/,""));
  fd.append("arquivo",f);
  return upload(cAPI("/midia/img"),fd);
}
