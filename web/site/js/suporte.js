/* Contato com o suporte e aviso de armazenamento cheio. */
"use strict";

/* ---------- SUPORTE E ARMAZENAMENTO CHEIO ----------
   O envio que esbarra no volume cheio volta 507; em vez de um erro generico, a pessoa ve o
   que aconteceu e um caminho para falar com o suporte, que ja abre com o assunto certo. */
var AVISO_CHEIO=0;
function avisoArmazenamento(){
  if(Date.now()-AVISO_CHEIO<4000)return; AVISO_CHEIO=Date.now();
  var ov=overlay("Armazenamento cheio",htmlDe("t-aviso-cheio",{logo:logoCss("")}),{cls:"cheiosheet"});
  $("#chOk",ov).onclick=function(){ ov.close(); };
  $("#chSup",ov).onclick=function(){ ov.close(); abrirSuporte(null,null,{assunto:"Armazenamento cheio",
    mensagem:"Tentei subir um arquivo e o servidor avisou que o armazenamento está cheio."}); };
  som("min");
}
function contextoSuporte(){
  var c=CID?campAtual():null;
  return [c&&c.nome?V("campanha")+": "+c.nome+" (#"+CID+", "+(GM?"mestre":"jogador")+")":"fora de campanha",
    "tela: "+S.view, "navegador: "+navigator.userAgent].join(" · ").slice(0,1000);
}
function abrirSuporte(back,mk,pre){
  pre=pre||{};
  var ov=(mk||overlay)("Falar com o suporte",htmlDe("t-suporte",{campanha:V("campanha").toLowerCase(),
    assuntos:["Algo não funciona","Armazenamento cheio","Dúvida","Sugestão","Outro"],assunto:pre.assunto||""}),
    {back:back});
  $("#suM",ov).value=pre.mensagem||"";
  $("#suGo",ov).onclick=function(){
    var b=this, m=$("#suM",ov).value.trim();
    if(m.length<5){ toast("Escreva um pouco mais sobre o que aconteceu"); $("#suM",ov).focus(); return; }
    b.disabled=true; $("#suSt",ov).textContent="enviando…";
    api("/api/suporte",{method:"POST",body:{assunto:$("#suA",ov).value,mensagem:m,contato:$("#suC",ov).value.trim(),contexto:contextoSuporte()}})
      .then(function(r){
        b.disabled=false; $("#suM",ov).value="";
        var t=r.enviado?"Mensagem enviada ao suporte. Obrigado!"
          :"Mensagem registrada. "+(r.motivo?r.motivo.charAt(0).toUpperCase()+r.motivo.slice(1):"")+", mas o administrador vê a mensagem na Administração.";
        $("#suSt",ov).textContent=t; toast(r.enviado?"Enviado ao suporte":"Mensagem registrada"); })
      .catch(function(e){ b.disabled=false; $("#suSt",ov).textContent=""; toast((e&&e.message)||"não deu para enviar"); });
  };
}
function quando2(ms){ try{ return new Date(ms).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}); }catch(e){ return ""; } }
