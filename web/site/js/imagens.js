/* Seletor de imagem. */
"use strict";

/* ---------- ESCOLHER IMAGEM ---------- */
/* Devolve o caminho relativo ("img/x.webp"), "" para tirar a imagem, ou null
   se a pessoa fechou sem escolher. Guardamos o caminho relativo e nao a URL:
   e isso que o IMG() sabe resolver, e e isso que o pacote carrega.
   o.subir(arquivo) troca o envio para a Biblioteca por outra rota (o icone da ficha do jogador) e devolve {arquivo}. */
function escolherImagem(atual,o){
  var subir=o?.subir||subirImagem;
  return new Promise(function(res){
    var escolhido=null, resolvido=false;
    var ov=overlay("Escolher imagem",htmlDe("t-imagens",{campanha:V("campanha").toLowerCase()}),{wide:true});
    var fechar=ov.close;
    ov.close=function(){ if(!resolvido){ resolvido=true; res(escolhido); } fechar(); };
    function pinta(figs){
      $("#eiList",ov).innerHTML=htmlDe("t-imagens-lista",{campanha:V("campanha").toLowerCase(),atual:atual,
        figuras:figs.map(function(x){ var rel=x.arquivo||("img/"+x.nome); return {rel:rel,url:x.url,mini:IMG(rel,"mini"),nome:x.nome}; })});
      $$("[data-pick]",ov).forEach(function(b){ b.onclick=function(){
        escolhido=b.dataset.pick; ov.close();
      };});
    }
    function carrega(){
      api(cAPI("/midia")).then(function(c){ pinta(c?.imagens||[]); })
        .catch(function(e){ $("#eiList",ov).innerHTML=htmlDe("t-vazio",{texto:e?.message||"não deu para listar"}); });
    }
    carrega();
    $("#eiClr",ov).onclick=function(){ escolhido=""; ov.close(); };
    $("#eiUp",ov).onclick=function(){ eiEnviar(ov,subir,function(ultimo,n){
      recarregaCatalogo();
      if(n===1&&ultimo){ escolhido=ultimo; ov.close(); return; }
      carrega(); toast(n+" imagens enviadas");
    }); };
  });
}
/* escolhe arquivos e envia; fim(caminho da ultima, quantas) so quando alguma subiu */
function eiEnviar(ov,subir,fim){
  var b=$("#eiUp",ov), n=0;
  escolherArquivos(false,"image/*")
    .then(function(fs){
      n=fs.length;
      if(!n){ return null; }
      b.disabled=true; b.textContent="Enviando…";
      return enviaEmFila(fs,subir);
    })
    .then(function(ultimo){ if(n){ fim(ultimo,n); } })
    .catch(function(e){ toast(e?.message||"não deu para enviar"); })
    .then(function(){ b.disabled=false; b.textContent="Enviar imagem nova"; });
}
/* uma de cada vez, na ordem; devolve o caminho da ultima que subiu */
function enviaEmFila(fs,subir){
  var ultimo=null;
  return fs.reduce(function(fila,f){
    return fila.then(function(){ return subir(f); }).then(function(r){ ultimo=r?.arquivo||ultimo; });
  },Promise.resolve()).then(function(){ return ultimo; });
}
function subirImagem(f){
  var fd=new FormData();
  fd.append("nome",f.name.replace(/\.[^.]+$/,""));
  fd.append("arquivo",f);
  return upload(cAPI("/midia/img"),fd);
}
