/* Privacidade e termos (paginas/legal.html): o texto vem da administracao, sem login. */
(function(){
  "use strict";
  document.title=(/termos/.test(location.pathname)?"Termos de uso":"Privacidade")+" · Grimório";
  var chave=/termos/.test(location.pathname)||/[?&]t=termos/.test(location.search)?"termos":"privacidade";
  var outro=document.getElementById("outro");
  outro.href=chave==="termos"?"/privacidade":"/termos";
  outro.textContent=chave==="termos"?"Privacidade":"Termos de uso";
  var caixa=document.getElementById("texto");
  fetch("/api/publico/texto/"+chave,{credentials:"same-origin"}).then(function(r){
    if(!r.ok)throw new Error(String(r.status)); return r.json(); }).then(function(j){
    var tit=j.titulo||(chave==="termos"?"Termos de uso":"Privacidade");
    document.getElementById("tit").textContent=tit;
    document.title=tit+" · Grimório";
    if(!String(j.texto||"").trim())throw new Error("vazio");
    caixa.textContent="";
    /* paragrafos separados por linha em branco; texto entra como texto, nunca como HTML */
    String(j.texto||"").split(/\n\s*\n/).forEach(function(par){
      var p=document.createElement("p"); p.textContent=par.trim(); if(p.textContent)caixa.appendChild(p); });
    document.getElementById("nota").hidden=!j.padrao;
  }).catch(function(){ caixa.innerHTML=""; var p=document.createElement("p");
    p.textContent="Não consegui carregar o texto agora. Tente de novo em instantes."; caixa.appendChild(p); });
})();
