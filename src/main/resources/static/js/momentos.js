/* Momentos de mesa: tema sugerido, critico, pedido de teste, capitulo, revelacao e iniciativa. */
"use strict";

/* ---------- TEMA SUGERIDO PELO MESTRE ----------
   MESA.tema e a sugestao da campanha. A pessoa tem um tema dela (grim_tema, vale em toda
   campanha) e pode, campanha a campanha, escolher seguir o mestre (grim_tema_c{id}="mesa"). */
function temaMesa(){ var m=MESA&&MESA.tema; return (m&&TEMAS[m])?m:""; }
function temaDaCampanha(){ if(!CID)return ""; try{ return localStorage.getItem("grim_tema_c"+CID)||""; }catch(e){ return ""; } }
function sugereTema(){
  var m=temaMesa(); if(!CID||!m)return;
  var k="grim_tema_visto_c"+CID, visto="";
  try{ visto=localStorage.getItem(k)||""; localStorage.setItem(k,m); }catch(e){}
  /* aparece uma vez por sugestao: se o mestre trocar o tema, a pergunta volta */
  if(visto===m||GM)return;
  $$(".sugtema").forEach(function(x){ x.remove(); });
  var d=el("div",{"class":"sugtema"}), igual=(temaAtivo()===m);
  d.innerHTML=htmlDe("t-sugere-tema",{cartao:temaCard(m,""),nome:TEMAS[m].nome,
    estilo:(ESTILOS[TEMAS[m].estilo]||{}).nome||"",igual:igual});
  var pv=$(".temacard",d); if(pv){ pv.disabled=true; pv.removeAttribute("data-tema"); }
  $$("[data-s]",d).forEach(function(b){ b.onclick=function(){
    if(b.getAttribute("data-s")==="usar"){ try{ localStorage.setItem("grim_tema_c"+CID,"mesa"); }catch(e){}
      trocarTema(temaAtivo()); toast("Tema do "+V("mestre").toLowerCase()+" aplicado nesta "+V("campanha").toLowerCase()); }
    d.remove(); }; });
  document.body.appendChild(d);
  setTimeout(function(){ if(d.parentNode)d.remove(); },igual?9000:30000);
}

/* ---------- CRITICO NA TELA TODA ---------- */
function telaCritica(extremo){
  if(!extremo||!fxLigado())return;
  $$(".critfx").forEach(function(x){ x.remove(); });
  var d=el("div",{"class":"critfx "+(extremo>0?"max":"min"),"aria-hidden":"true"});
  d.innerHTML=htmlDe("t-critico");
  document.body.appendChild(d);
  if(extremo<0){ document.body.classList.add("treme"); setTimeout(function(){ document.body.classList.remove("treme"); },500); }
  setTimeout(function(){ d.remove(); },1500);
}

/* ---------- PEDIDO DE TESTE ---------- */
function pedirTeste(rotulo){
  if(!GM)return;
  var ult="1d20"; try{ ult=localStorage.getItem("grim_pedf")||"1d20"; }catch(e){}
  formulario("Pedir teste à "+V("mesa").toLowerCase(),[
    {k:"rotulo",rot:"Para quê",dica:"Aparece para os "+V("jogadores").toLowerCase()+" junto do pedido."},
    {k:"formula",rot:"Rolagem",obrig:true,dica:"Ex.: 1d20, 2d6+3, 2d20kh1 (fica o maior), 4d6dl1 (descarta o menor)."}
  ],{rotulo:rotulo||"",formula:ult},{
    salvar:function(w){
      try{ localStorage.setItem("grim_pedf",w.formula); }catch(e){}
      api(cAPI("/rolagens/pedido"),{method:"POST",body:{formula:w.formula,rotulo:w.rotulo}})
        .then(function(r){ toast("Pedido enviado: "+(r.rotulo||r.formula)); puxaRolagens(false); })
        .catch(function(e){ toast((e&&e.message)||"não deu para pedir"); });
    }
  });
}
function avisaPedido(r){
  $$(".pedido").forEach(function(x){ x.remove(); });
  var d=el("div",{"class":"pedido"});
  d.innerHTML=htmlDe("t-pedido",{dado:d20Svg(""),autor:r.autor,rotulo:r.rotulo,formula:r.formula});
  $('[data-p="rolar"]',d).onclick=function(){ d.remove(); abrirDados({formula:r.formula,rotulo:r.rotulo,pedidoId:r.id,auto:true}); };
  $('[data-p="x"]',d).onclick=function(){ d.remove(); };
  document.body.appendChild(d); som("pedido");
  setTimeout(function(){ if(d.parentNode)d.remove(); },90000);
}

/* ---------- ABERTURA DE CAPITULO ---------- */
function abreCapitulo(s){
  if(!s||!fxLigado())return;
  $$(".capitulo").forEach(function(x){ x.remove(); });
  var d=el("div",{"class":"capitulo","aria-hidden":"true"});
  d.innerHTML=htmlDe("t-capitulo",{numero:s.numero==null?"":s.numero,titulo:s.titulo||""});
  document.body.appendChild(d); som("capitulo");
  setTimeout(function(){ d.remove(); },2400);
}

/* ---------- REVELACAO PARA OS JOGADORES ----------
   O que o mestre libera chega pela sondagem da mesa. Em vez de so aparecer na lista,
   a carta vira na tela de quem joga. */
function idsMesa(){ var o={};
  ["ev","npcs","locais"].forEach(function(k){ (MESA[k]||[]).forEach(function(x){ o[k+":"+(x.id||x.nome)]=1; }); });
  return o; }
function revelaNovos(antes){
  if(GM||!antes)return;
  var fila=[];
  [["ev",V("evidencia")],["npcs",V("npc")],["locais",V("local")]].forEach(function(p){
    (MESA[p[0]]||[]).forEach(function(x){ if(!antes[p[0]+":"+(x.id||x.nome)])fila.push({tp:p[1],x:x}); }); });
  if(fila.length)revelar(fila.slice(0,6));
}
function revelar(fila){
  var it=fila.shift(); if(!it)return;
  var x=it.x, d=el("div",{"class":"revela"});
  d.innerHTML=htmlDe("t-revela",{dado:d20Svg(""),img:x.img?IMG(x.img):"",tipo:it.tp,nome:x.nome||x.titulo||"",
    desc:x.desc?String(x.desc).slice(0,260):""});
  var fim=function(){ if(!d.parentNode)return; d.remove(); revelar(fila); };
  d.onclick=fim; document.body.appendChild(d); som("revela");
  setTimeout(fim,5500);
}

/* ---------- INICIATIVA ----------
   Mora na sessao (guia) e um espelho so com o que o jogador pode ver vai para a mesa. */
function iniDe(s){ if(!s.ini||typeof s.ini!=="object")s.ini={lista:[],vez:"",rodada:1};
  if(!Array.isArray(s.ini.lista))s.ini.lista=[]; if(!s.ini.rodada)s.ini.rodada=1; return s.ini; }
function iniOrdem(ini){ return ini.lista.slice().sort(function(a,b){ return (+b.v||0)-(+a.v||0); }); }
function espelhaIni(s){
  var ini=iniDe(s), o=iniOrdem(ini);
  MESA.ini=o.length?{rodada:ini.rodada,vez:Math.max(0,o.map(function(x){return x.id;}).indexOf(ini.vez)),
    lista:o.map(function(x){ return {nome:x.oc?"???":x.nome,v:x.oc?"":x.v}; })}:null;
  salvarMesa();
}
function iniMudou(s){ save(); espelhaIni(s); render(); }
function iniHtml(s){
  var ini=iniDe(s); if(!S.ini&&!ini.lista.length)return "";
  var o=iniOrdem(ini);
  return htmlDe("t-ini",{rodada:ini.rodada,vez:ini.vez,lista:o});
}
function iniPubHtml(){
  var p=MESA.ini; if(!p||!p.lista||!p.lista.length)return "";
  return htmlDe("t-ini-pub",{rodada:p.rodada||1,vez:p.vez,lista:p.lista});
}
function iniEditar(s,x){
  var ini=iniDe(s), novo=!x;
  formulario(novo?"Entrar na iniciativa":"Editar · iniciativa",[
    {k:"nome",rot:"Quem",obrig:true},{k:"v",rot:"Iniciativa",tipo:"num"},
    {k:"oc",rot:"Esconder nome e valor dos "+V("jogadores").toLowerCase(),tipo:"check"}
  ],x||{nome:"",v:"",oc:false},{
    salvar:function(w){ var alvo=x||{id:uid("i")}; alvo.nome=String(w.nome).trim(); alvo.v=w.v; alvo.oc=!!w.oc;
      if(novo)ini.lista.push(alvo); if(!ini.vez)ini.vez=iniOrdem(ini)[0].id; iniMudou(s); },
    remover:novo?null:function(){ comDesfazer("Saiu da iniciativa",function(){
      ini.lista=ini.lista.filter(function(y){ return y!==x; }); if(ini.vez===x.id)ini.vez=(iniOrdem(ini)[0]||{}).id||""; iniMudou(s); }); }
  });
}
function iniLigar(v,s){
  var b=$("#iniBtn",v); if(b)b.onclick=function(){ S.ini=!S.ini; render(); };
  var ini=iniDe(s);
  $$("[data-ini]",v).forEach(function(c){ c.onclick=function(){
    iniEditar(s,ini.lista.filter(function(x){ return x.id===c.getAttribute("data-ini"); })[0]); }; });
  var a=$("#iniAdd",v); if(a)a.onclick=function(){ iniEditar(s,null); };
  var p=$("#iniProx",v); if(p)p.onclick=function(){ var o=iniOrdem(ini); if(!o.length)return;
    var i=o.map(function(x){return x.id;}).indexOf(ini.vez)+1;
    if(i>=o.length){ i=0; ini.rodada++; }
    ini.vez=o[i].id; som("vez"); iniMudou(s); };
  var px=$("#iniPux",v); if(px)px.onclick=function(){
    var tem={}; ini.lista.forEach(function(x){ tem[norm(x.nome)]=1; });
    var n=0, poe=function(nome,oc){ if(!nome||tem[norm(nome)])return; tem[norm(nome)]=1; ini.lista.push({id:uid("i"),nome:nome,v:"",oc:oc}); n++; };
    ((D.elenco&&D.elenco.personagens)||[]).forEach(function(q){ poe(q.nome,false); });
    (s.npcIds||[]).forEach(function(id){ var q=elDe("npcs",id); if(q)poe(q.nome,true); });
    if(!ini.vez&&ini.lista.length)ini.vez=iniOrdem(ini)[0].id;
    toast(n?n+" entraram na ordem. NPC entra oculto.":"Todo mundo já estava na ordem"); iniMudou(s); };
  var rl=$("#iniRol",v); if(rl)rl.onclick=function(){
    var ult="1d20"; try{ ult=localStorage.getItem("grim_inif")||"1d20"; }catch(e){}
    formulario("Rolar iniciativa de quem está sem valor",[{k:"f",rot:"Rolagem",obrig:true,dica:"Um dado com soma opcional: 1d20, 1d10+2, 2d6."}],{f:ult},{
      salvar:function(w){ var m=/^\s*(\d{0,2})d(\d{1,4})\s*([+-]\s*\d{1,3})?\s*$/i.exec(w.f);
        if(!m){ toast("Não entendi essa rolagem"); return; }
        try{ localStorage.setItem("grim_inif",w.f); }catch(e){}
        ini.lista.forEach(function(x){ if(x.v!==""&&x.v!=null)return;
          var t=m[3]?parseInt(m[3].replace(/\s/g,""),10):0; for(var k=0;k<(+m[1]||1);k++)t+=rolaDado(+m[2]); x.v=t; });
        ini.vez=iniOrdem(ini)[0].id; ini.rodada=1; iniMudou(s); } }); };
  var f=$("#iniFim",v); if(f)f.onclick=function(){ comDesfazer("Iniciativa encerrada",function(){
    s.ini={lista:[],vez:"",rodada:1}; S.ini=false; iniMudou(s); }); };
}
