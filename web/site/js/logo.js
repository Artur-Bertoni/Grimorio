/* O d20 da marca, unico desenho da logo. */
"use strict";

/* ---------- LOGO ----------
   Um d20 visto de frente, com as faces sombreadas como se a luz viesse de cima: a base e
   uma cor so do tema e cada face ganha uma camada clara ou escura por cima. Recebe c(k),
   que devolve a cor de um token: var(--k) na pagina, o hex do tema no favicon.
   O desenho esta em componentes/marca.html; aqui fica so a geometria das faces. */
var LOGO_PONTOS={t:"12,1.5",ur:"21.1,6.75",dr:"21.1,17.25",b:"12,22.5",dl:"2.9,17.25",ul:"2.9,6.75",a:"7,8.5",bb:"17,8.5",cc:"12,17.2"};
var LOGO_POLIGONOS=[];
[["t a bb",.55],["t ul a",.3],["t ur bb",.12],["ul dl a",-.1],["ur dr bb",-.42],
  ["dl a cc",-.22],["dr bb cc",-.5],["dl b cc",-.45],["dr b cc",-.68],["a bb cc",.62]].forEach(function(f){
  /* cada face: a base na cor do tema e, por cima, a camada de luz (clara) ou sombra (escura) */
  var s=f[1], pontos=f[0].split(" ").map(function(k){ return LOGO_PONTOS[k]; }).join(" ");
  LOGO_POLIGONOS.push({pontos:pontos,cor:"blood",opacidade:null},
    {pontos:pontos,cor:s>0?"fg":"bg",opacidade:Math.abs(s*(s>0?.5:.75)).toFixed(2)});
});
function logoSvg(c,cls){ return htmlDe("t-logo",{c:c,cls:cls||"",poligonos:LOGO_POLIGONOS}); }
function logoCss(cls){ return logoSvg(function(k){ return "var(--"+k+")"; },cls); }
/* o icone da aba acompanha o tema: o navegador nao le var() de dentro de um favicon */
function atualizaFavicon(pele){
  var l=document.getElementById("favicon"); if(!l||!pele)return;
  l.href="data:image/svg+xml,"+encodeURIComponent(logoSvg(function(k){ return pele[k]||"#888"; }));
}
