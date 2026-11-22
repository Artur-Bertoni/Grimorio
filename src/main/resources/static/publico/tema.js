/* Paginas publicas (login, privacidade e termos, 404): vestem o ultimo tema usado neste aparelho.
   O app grava a pele em grim_pele (aplicarTema, so fora de uma campanha); sem nada gravado, fica o
   padrao. Arquivo e nao script inline: a CSP so aceita script do proprio site. Roda no <head>,
   antes de pintar, para nao piscar no tema padrao. */
"use strict";
try{ var p=JSON.parse(localStorage.getItem("grim_pele")||"null");
  if(p&&p.v){ var r=document.documentElement; for(var k in p.v)r.style.setProperty("--"+k,p.v[k]);
    r.dataset.estilo=p.estilo||""; r.style.setProperty("color-scheme",p.esquema||"dark"); }
  if(localStorage.getItem("grim_fx")==="0")document.documentElement.dataset.fx="off";
}catch(error_){ /* sem armazenamento: fica o tema padrao */ }
