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
      else if(x.status===403&&b&&b.codigo==="csrf"&&!repetido){
        renovaCsrf().then(function(){ return upload(url,fd,onProg,true); }).then(res,rej); }
      else { if(x.status===507)avisoArmazenamento();
        var er=new Error(b?.erro||ERRO_HTTP[x.status]||(x.status>=500?ERRO_HTTP[500]:"Erro "+x.status)); er.status=x.status; er.corpo=b; rej(er); } };
    x.onerror=function(){ var er=new Error(ERRO_HTTP[0]); er.status=0; rej(er); };
    x.ontimeout=function(){ rej(new Error("tempo esgotado")); };
    x.send(fd);
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
