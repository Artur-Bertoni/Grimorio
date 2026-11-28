/* Envio de arquivos ao servidor, com progresso. */
"use strict";

/* ---------- MENU ---------- */
function upload(url,fd,onProg,repetido){
  return new Promise(function(res,rej){
    var x=new XMLHttpRequest();
    x.open("POST",url,true); x.withCredentials=true;
    var t=cookie("XSRF-TOKEN"); if(t)x.setRequestHeader("X-XSRF-TOKEN",t);
    if(x.upload)x.upload.onprogress=function(e){ if(e.lengthComputable&&onProg)onProg(e.loaded/e.total); };
    x.onload=function(){ var b=null; try{ b=JSON.parse(x.responseText); }catch(error_){ /* falha aqui nao muda o que a pessoa ve */ }
      if(x.status>=200&&x.status<300)res(b||{});
      else if(x.status===403&&b?.codigo==="csrf"&&!repetido){
        renovaCsrf().then(function(){ return upload(url,fd,onProg,true); }).then(res,rej); }
      else { if(x.status===507)avisoArmazenamento();
        var er=new Error(b?.erro||ERRO_HTTP[x.status]||(x.status>=500?ERRO_HTTP[500]:"Erro "+x.status)); er.status=x.status; er.corpo=b; rej(er); } };
    x.onerror=function(){ var er=new Error(ERRO_HTTP[0]); er.status=0; rej(er); };
    x.ontimeout=function(){ rej(new Error("tempo esgotado")); };
    x.send(fd);
  });
}
/* ---------- TAREFA DEMORADA ----------
   Envio, importacao e exportacao grandes: uma janela que prende a pessoa ate terminar (sem Esc,
   sem X, sem Voltar, e o navegador pergunta antes de fechar a aba), com a barra e, no fim, o
   resultado e um Ok. passo(texto, fracao): fracao null e barra sem medida (o servidor esta
   trabalhando). envio(texto) devolve o onProg do upload(): ao chegar a 100% o arquivo ja subiu,
   e o resto e o servidor lendo. fim(msg, tipo, erros, depois): depois roda quando a pessoa fecha. */
var TAREFA=null;
function tarefaLonga(titulo,texto){
  var ov=overlay(titulo,htmlDe("t-tarefa",{titulo:titulo,texto:texto||"Começando…"}),{firme:true,cls:"tarefasheet",foco:"[data-bar]"});
  var fecha=ov.close;
  ov.close=function(){ /* trabalhando: so fecha no fim */ };
  ov.classList.add("ocupada");
  TAREFA=ov;
  var bar=$("[data-bar]",ov), pct=$("[data-pct]",ov), tx=$("[data-tx]",ov);
  bar.tabIndex=-1;
  var h={
    passo:function(t,fr){
      if(t!=null)tx.textContent=t;
      if(fr==null){ bar.removeAttribute("value"); pct.textContent=""; return; }
      var p=Math.max(0,Math.min(100,Math.round(fr*100)));
      bar.value=p; pct.textContent=p+"%";
    },
    envio:function(t,depois){ return function(fr){
      if(fr>=1)h.passo(depois||"Arquivo enviado. O servidor está processando…",null); else h.passo(t,fr); }; },
    fim:function(msg,tipo,erros,depois){
      if(TAREFA===ov)TAREFA=null;
      ov.classList.remove("ocupada");
      ov.classList.add(tipo==="erro"?"falhou":"pronta");
      $(".stit",ov).textContent={erro:"Não deu certo",aviso:"Terminou, com falhas"}[tipo]||"Pronto";
      $("[data-andando]",ov).hidden=true;
      var f=$("[data-fim]",ov); f.hidden=false;
      $("[data-fimtx]",ov).textContent=msg;
      var ul=$("[data-erros]",ov);
      if(erros?.length){ ul.hidden=false; erros.forEach(function(e){ ul.appendChild(el("li",{text:e})); }); }
      ov.close=function(){ fecha(); if(depois)depois(); };
      $("[data-ok]",ov).onclick=function(){ ov.close(); };
      focar($("[data-ok]",ov));
      anunciar(msg,tipo==="erro");
      som(tipo==="erro"?"fecha":"abre");
    }
  };
  return h;
}
window.addEventListener("beforeunload",function(e){ if(TAREFA)e.preventDefault(); });
/* baixa o arquivo com a barra: o zip do pacote sai em fluxo, sem tamanho, e o servidor manda
   uma estimativa em X-Tamanho-Estimado */
function baixarComProgresso(url,nome,h){
  return fetch(url,{credentials:"same-origin"}).then(function(r){
    if(!r.ok){ var er=new Error(ERRO_HTTP[r.status]||"Erro "+r.status); er.status=r.status; throw er; }
    var total=Number(r.headers.get("Content-Length")||r.headers.get("X-Tamanho-Estimado")||0);
    var leitor=r.body.getReader(), partes=[], veio=0;
    function le(){ return leitor.read().then(function(p){
      if(p.done)return;
      partes.push(p.value); veio+=p.value.length;
      h.passo("Baixando… "+mb(veio)+(total?" de cerca de "+mb(total):""),total?Math.min(0.99,veio/total):null);
      return le(); }); }
    return le().then(function(){
      var a=el("a",{href:URL.createObjectURL(new Blob(partes,{type:"application/zip"})),download:nome});
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){ URL.revokeObjectURL(a.href); },60000);
      return veio; });
  });
}
function mb(n){ n=+n||0; if(n<1024)return n+" B";
  if(n<1048576)return (n/1024).toFixed(0)+" KB";
  if(n<1073741824)return (n/1048576).toFixed(1)+" MB";
  return (n/1073741824).toFixed(2)+" GB"; }
function abrevDe(nome){
  var base=nome.replace(/\.pdf$/i,"");
  var ab=norm(base).replace(/[^a-z0-9 ]+/g," ").trim().split(/\s+/)
    .map(function(w){return /^\d+$/.test(w)?w:w[0];}).join("").toUpperCase().slice(0,8)||"DOC";
  return {ab:ab,nome:base};
}
function escolherArquivos(pasta,aceita){
  return new Promise(function(res){
    var inp=el("input",{type:"file"});
    if(pasta)inp.webkitdirectory=true; else inp.multiple=true;
    if(aceita)inp.accept=aceita;
    inp.style.display="none"; document.body.appendChild(inp);
    inp.onchange=function(){ var fs=Array.prototype.slice.call(inp.files||[]); inp.remove(); res(fs); };
    inp.click();
  });
}
