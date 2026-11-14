/* Visor de PDF. */
"use strict";

/* ---------- VISOR DE PDF ---------- */
/* o pdf.js e carregado como modulo no index.html, que ja aponta o worker */
var PDFC={};
async function carregaPdf(ab){ if(PDFC[ab])return PDFC[ab];
  await carregaCatalogo();
  var d=LIB.docs[ab]; if(!d)return null;
  PDFC[ab]={doc:await window.pdfjsLib.getDocument({url:d.url}).promise,nome:d.nome}; return PDFC[ab]; }
async function abrirPdf(ab,page,back){
  ab=String(ab||"").toUpperCase();
  await carregaCatalogo();
  if(!LIB.docs[ab]){ var o0=overlay("Abrir documento",htmlDe("t-pdf-ausente",{livro:nomeDoc(ab),mestre:GM}),{back:back});
    var b0=$("#lc2",o0); if(b0)b0.onclick=function(){ o0.close(); abrirArquivos(); }; return; }
  if(!window.pdfjsLib){ toast("Visor de PDF indisponível"); return; }
  var ov=overlay(nomeDoc(ab),htmlDe("t-pdf",{pagina:page||1}),
    {wide:true,cls:"pdfsheet",ovcls:"pdfov",back:back});
  var sheet=ov.querySelector(".sheet");
  var st={p:page||1,z:1,pdf:null,busy:false};
  try{ st.pdf=await carregaPdf(ab); }catch(e){ $("#pCanvas",ov).innerHTML=htmlDe("t-vazio",{texto:"Falha ao abrir o PDF."}); return; }
  if(!st.pdf)return;
  ov.querySelector("h3").textContent=st.pdf.nome;
  $("#pTot",ov).textContent=st.pdf.doc.numPages;
  async function draw(dir){
    if(st.busy)return; st.busy=true;
    st.p=Math.max(1,Math.min(st.pdf.doc.numPages,st.p));
    $("#pNum",ov).value=st.p;
    try{
      var pg=await st.pdf.doc.getPage(st.p), box=$("#pCanvas",ov);
      /* o padding cresce com a raiz: descontar um numero fixo deixava a pagina 4px maior que a
         caixa no ultrawide, e isso acendia a barra de rolagem */
      var cs=getComputedStyle(box);
      var w=box.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight)-2,
          h=box.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom)-2;
      var v1=pg.getViewport({scale:1});
      var fit=Math.min((w>80?w:900)/v1.width,(h>80?h:1200)/v1.height);
      var vp=pg.getViewport({scale:Math.max(.2,fit*st.z)});
      var dpr=Math.min(2,window.devicePixelRatio||1);
      var cv=document.createElement("canvas");
      cv.width=Math.round(vp.width*dpr); cv.height=Math.round(vp.height*dpr);
      cv.style.width=Math.round(vp.width)+"px"; cv.style.height=Math.round(vp.height)+"px";
      await pg.render({canvasContext:cv.getContext("2d"),viewport:vp,transform:dpr!==1?[dpr,0,0,dpr,0,0]:null}).promise;
      var velho=$("canvas:not(.sai)",box);
      if(dir&&velho&&fxLigado()){
        /* a velha fica na mesma celula ate a animacao do tema acabar; zoom e resize passam sem dir */
        $$("canvas.sai",box).forEach(function(x){ x.remove(); });
        velho.className="sai"; cv.className="vem";
        box.classList.add("virando"); box.setAttribute("data-dir",dir>0?"f":"b");
        box.style.setProperty("--dir",dir>0?1:-1);
        box.appendChild(cv);
        clearTimeout(st.vt);
        st.vt=setTimeout(function(){ $$("canvas.sai",box).forEach(function(x){ x.remove(); });
          $$("canvas.vem",box).forEach(function(x){ x.className=""; }); box.classList.remove("virando"); },650);
      } else { box.innerHTML=""; box.appendChild(cv); box.classList.remove("virando"); }
    }catch(e){}
    st.busy=false;
  }
  function vai(d){ var n=Math.max(1,Math.min(st.pdf.doc.numPages,st.p+d)); if(n===st.p)return; st.p=n; som("pagina"); draw(d); }
  $("#pPrev",ov).onclick=function(){vai(-1);};
  $("#pNext",ov).onclick=function(){vai(1);};
  $("#pNum",ov).onchange=function(){ var a=st.p; st.p=+$("#pNum",ov).value; draw(st.p>a?1:st.p<a?-1:0); };
  $("#pIn",ov).onclick=function(){st.z=Math.min(4,st.z*1.18);draw();};
  $("#pFit",ov).onclick=function(){st.z=1;draw();};
  var pt=$("#pTxt",ov); if(pt)pt.onclick=function(){ var n2=st.p; ov.close(); abrirPagina(ab,n2,"",back); };
  $("#pOut",ov).onclick=function(){st.z=Math.max(.4,st.z/1.18);draw();};
  $("#pFs",ov).onclick=function(){
    if(document.fullscreenElement){document.exitFullscreen();sheet.classList.remove("fs");}
    else{ var r=sheet.requestFullscreen&&sheet.requestFullscreen();
      sheet.classList.add("fs"); if(r&&r.catch)r.catch(function(){toast("Tela cheia não permitida aqui");});
      setTimeout(draw,220); } };
  document.addEventListener("fullscreenchange",function(){ if(!document.fullscreenElement)sheet.classList.remove("fs"); setTimeout(draw,180); });
  var kh=function(e){ if(!document.body.contains(ov))return;
    if(e.key==="ArrowRight"||e.key==="PageDown"){e.preventDefault();vai(1);}
    else if(e.key==="ArrowLeft"||e.key==="PageUp"){e.preventDefault();vai(-1);} };
  document.addEventListener("keydown",kh);
  var acc=0;
  $("#pCanvas",ov).addEventListener("wheel",function(e){
    if(e.ctrlKey)return; e.preventDefault(); acc+=e.deltaY;
    if(Math.abs(acc)>120){ vai(acc>0?1:-1); acc=0; } },{passive:false});
  var rt=null, rz=function(){ clearTimeout(rt); rt=setTimeout(draw,160); };
  window.addEventListener("resize",rz);
  var mo=new MutationObserver(function(){ if(!document.body.contains(ov)){
    document.removeEventListener("keydown",kh); window.removeEventListener("resize",rz); mo.disconnect();} });
  mo.observe($("#layer"),{childList:true});
  setTimeout(draw,60);
}
