/* Janelas (overlay), projecao e fichas de elenco abertas. */
"use strict";

/* ---------- OVERLAY ---------- */
/* Quem fecha uma janela conta com ela fora do DOM na hora (o Voltar testa isso), entao a de
   verdade sai de uma vez e quem some devagar e uma copia inerte, sem id e sem clique. */
var OVT=0;
function fantasma(ov){
  OVT=Date.now(); som("fecha");
  var f=$("#fantasmas");
  if(!f||!fxLigado()||ov.querySelector("canvas,iframe,audio,video"))return;
  var g=ov.cloneNode(true), a=$$(".sbodyscroll",ov);
  g.className="ovg"; g.inert=true;
  $$("[id]",g).forEach(function(x){ x.removeAttribute("id"); });
  f.appendChild(g);
  $$(".sbodyscroll",g).forEach(function(x,i){ if(a[i])x.scrollTop=a[i].scrollTop; });
  setTimeout(function(){ g.remove(); },220);
}
function overlay(title,body,o){ o=o||{};
  var ov=el("div",{"class":"ov"+(o.ovcls?" "+o.ovcls:"")});
  /* janela que abre no lugar de outra que acabou de fechar (Voltar, trocar de ficha) nao
     repete a entrada: seria uma piscada a cada passo */
  if(Date.now()-OVT<80){ ov.classList.add("seco"); var fz=$("#fantasmas"); if(fz)fz.innerHTML=""; } else som("abre");
  ov.innerHTML=htmlDe("t-janela",{titulo:title,corpo:body,cabeca:o.head||"",wide:!!o.wide,cls:o.cls||"",voltar:!!o.back});
  function close(){ if(document.body.contains(ov))fantasma(ov); ov.remove(); document.removeEventListener("keydown",k); }
  /* com janelas empilhadas (formulario + seletor de imagem), Esc fecha so a de cima.
     Quem chama pode trocar ov.close; por isso X, Esc e fundo passam sempre por ele. */
  function k(e){ if(e.key!=="Escape")return;
    var l=$("#layer"); if(l&&l.lastElementChild!==ov)return;
    e.stopPropagation(); ov.close(); }
  ov.close=close;
  ov.querySelector(".x").onclick=function(){ ov.close(); };
  var bk=ov.querySelector("[data-back]");
  if(bk)bk.onclick=function(){ ov.close(); if(!document.body.contains(ov))o.back(); };
  if(!o.firme)ov.addEventListener("pointerdown",function(e){ if(e.target===ov)ov.close(); });
  document.addEventListener("keydown",k);
  $("#layer").appendChild(ov); return ov;
}
function projetar(src,cap){
  var p=el("div",{"class":"proj"});
  var ho=GM?pistaPorImg(src):null;
  p.innerHTML=htmlDe("t-projecao",{src:IMG(src),legenda:cap||"",liberar:ho?libBtnHtml("projLib"):""});
  if(ho)libWire(p,"projLib","pistas",ho);
  function close(){p.remove();document.removeEventListener("keydown",k);}
  function k(e){ if(e.key!=="Escape")return; var l=$("#layer"); if(l&&l.lastElementChild!==p)return; close(); }
  p.querySelector("[data-close]").onclick=close;
  p.addEventListener("click",function(e){if(e.target===p)close();});
  document.addEventListener("keydown",k); $("#layer").appendChild(p);
}
/* Ficha de um NPC, local ou evidencia. s = sessao de onde foi aberto, se foi. */
function abrirItem(tp,x,back,s){ if(!x)return;
  if(tp==="personagens"){ editarElenco(tp,x); return; }
  var txt=(tp==="pistas"?x.texto:x.desc)||"";
  var ov=overlay(x.nome,htmlDe("t-item-elenco",{img:x.img?IMG(x.img):"",largura:tp==="pistas"?22.5:13.75,
    texto:txt,segredo:x.segredo||"",mestre:GM,liberar:GM?libBtnHtml("itLib"):"",
    sessao:s?V("sessao").toLowerCase():""}),{wide:tp==="pistas",back:back});
  $$("[data-proj]",ov).forEach(function(b){ b.onclick=function(){projetar(x.img,x.nome);}; });
  libWire(ov,"itLib",tp,x);
  var ed=$("#itEd",ov); if(ed)ed.onclick=function(){ ov.close(); editarElenco(tp,x); };
  var ti=$("#itTira",ov); if(ti)ti.onclick=function(){ var k=EL[tp].ids;
    s[k]=s[k].filter(function(i){return i!==x.id;}); save(); ov.close(); render();
    toast("Saiu da "+V("sessao").toLowerCase()+"; continua no elenco"); };
}
function abrirFichasP(p){ if(!p)return;
  var ov=overlay(Vm("fichas")+" · "+p.nome,htmlDe("t-fichas-imagem",
    {fichas:(p.fichas||[]).map(function(f){ return {url:IMG(f),rel:f}; })}),{wide:true});
  $$("[data-f]",ov).forEach(function(n){n.onclick=function(){projetar(n.getAttribute("data-f"),p.nome);};});
}
