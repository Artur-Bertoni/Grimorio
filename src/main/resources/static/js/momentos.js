/* Momentos de mesa: tema sugerido, critico, pedido de teste, capitulo, revelacao e iniciativa. */
"use strict";

/* ---------- TEMA SUGERIDO PELO MESTRE ----------
   MESA.tema e a sugestao da campanha. Quem segue o tema das mesas (o padrao) entra na campanha
   ja vestido com ela; quem prefere o proprio tema pode definir um so para aquela campanha. */
function temaMesa(){ var m=MESA?.tema; return (m&&TEMAS[m])?m:""; }
/* o tema que a pessoa definiu para a campanha aberta; "mesa" e de uma versao anterior, quando
   seguir o mestre era escolha campanha a campanha, e hoje e o padrao */
function temaEscolhido(){ if(!CID)return "";
  var c="";
  try{ c=localStorage.getItem("grim_tema_c"+CID)||""; }catch(error_){ /* sem armazenamento: nenhuma escolha por campanha */ }
  return TEMAS[c]?c:""; }
function segueMesa(){ var v="";
  try{ v=localStorage.getItem("grim_segue")||""; }catch(error_){ /* sem armazenamento: vale o padrao, seguir a mesa */ }
  return v!=="0"; }
function sugereTema(){
  var m=temaMesa(); if(!CID||!m)return;
  var k="grim_tema_visto_c"+CID, visto="";
  try{ visto=localStorage.getItem(k)||""; localStorage.setItem(k,m); }catch(error_){ /* falha aqui nao muda o que a pessoa ve */ }
  /* Aparece uma vez por sugestao (se o mestre trocar o tema, a pergunta volta), e so para quem
     escolheu usar sempre o proprio tema: quem segue as mesas ja esta vendo o tema do mestre. */
  if(visto===m||GM||segueMesa()||temaEscolhido())return;
  $$(".sugtema").forEach(function(x){ x.remove(); });
  var d=el("div",{"class":"sugtema"}), igual=(temaAtivo()===m);
  d.innerHTML=htmlDe("t-sugere-tema",{cartao:temaCard(m,""),nome:TEMAS[m].nome,
    estilo:(ESTILOS[TEMAS[m].estilo]||{}).nome||"",igual:igual});
  var pv=$(".temacard",d); if(pv){ pv.disabled=true; pv.removeAttribute("data-tema"); }
  $$("[data-s]",d).forEach(function(b){ b.onclick=function(){
    if(b.dataset.s==="usar"){ try{ localStorage.setItem("grim_tema_c"+CID,m); }catch(error_){ /* falha aqui nao muda o que a pessoa ve */ }
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
  var ult="1d20"; try{ ult=localStorage.getItem("grim_pedf")||"1d20"; }catch(error_){ /* falha aqui nao muda o que a pessoa ve */ }
  formulario("Pedir teste à "+V("mesa").toLowerCase(),[
    {k:"rotulo",rot:"Para quê",dica:"Aparece para os "+V("jogadores").toLowerCase()+" junto do pedido."},
    {k:"formula",rot:"Rolagem",obrig:true,dica:"Ex.: 1d20, 2d6+3, 2d20kh1 (fica o maior), 4d6dl1 (descarta o menor)."}
  ],{rotulo:rotulo||"",formula:ult},{
    salvar:function(w){
      try{ localStorage.setItem("grim_pedf",w.formula); }catch(error_){ /* falha aqui nao muda o que a pessoa ve */ }
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
/* Uma vez por sessao por dia, em 1,2s: abrir e fechar a mesma sessao varias vezes durante a
   preparacao nao pode cobrir a tela a cada vez. */
function capituloJaVisto(s){
  var k="grim_cap_"+CID+"_"+s.id, hoje=new Date().toDateString();
  try{ if(localStorage.getItem(k)===hoje)return true; localStorage.setItem(k,hoje); }
  catch(error_){ console.warn(error_); /* sem armazenamento: mostra sempre */ }
  return false;
}
function abreCapitulo(s){
  if(!s||!fxLigado()||capituloJaVisto(s))return;
  $$(".capitulo").forEach(function(x){ x.remove(); });
  var d=el("div",{"class":"capitulo","aria-hidden":"true"});
  d.innerHTML=htmlDe("t-capitulo",{numero:s.numero??"",titulo:s.titulo||""});
  document.body.appendChild(d); som("capitulo");
  setTimeout(function(){ d.remove(); },1200);
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
/* o mapa fica sabendo de toda mudanca da ordem: e dai que sai o turno novo e de quem e a vez de mover */
function iniMudou(s){ save(); espelhaIni(s); mpSincronizaTurno(s); render(); }
function iniHtml(s){
  var ini=iniDe(s); if(!S.ini&&!ini.lista.length)return "";
  var o=iniOrdem(ini);
  return htmlDe("t-ini",{rodada:ini.rodada,vez:ini.vez,lista:o,mapa:true});
}
function iniPubHtml(){
  var p=MESA.ini; if(!p||!p.lista||!p.lista.length)return "";
  return htmlDe("t-ini-pub",{rodada:p.rodada||1,vez:p.vez,lista:p.lista});
}
/* personagens e NPCs do elenco para escolher na ordem; o NPC entra, como no "Puxar elenco", sem esconder nada por conta propria */
function iniOpcoesElenco(){
  var el=D.elenco||{};
  return [["","Ninguém (digitar o nome)"]].concat((el.personagens||[]).map(function(p){ return [String(p.id),p.nome||V("personagem")]; }),
    (el.npcs||[]).map(function(n){ return [String(n.id),(n.nome||V("npc"))+" ("+V("npc")+")"]; }));
}
function iniNomeDoElenco(id){
  var el=D.elenco||{}, q=(el.personagens||[]).concat(el.npcs||[]).find(function(p){ return String(p.id)===String(id); });
  return q?(q.nome||""):"";
}
/* Quem tem token ligado ao elenco no mapa ativo entra na ordem (token escondido entra escondido). */
/* os tokens do mapa que a iniciativa pode apontar: o mapa aberto na tela do mestre ou, sem ele, o que os jogadores veem */
function iniTokensDoMapa(){
  var fim=function(els){ return (els||[]).filter(function(e){ return e.tipo==="TOKEN"; }).map(function(e){ return [String(e.id),e.dados?.nome||V("token")]; }); };
  if(MP.id&&MP.els.length&&String(MP.cid)===String(CID)){ return Promise.resolve(fim(MP.els)); }
  return api(cAPI("/mapas")).then(function(l){
    var m=(l||[]).find(function(x){ return x.ativo; });
    return m?api(cAPI("/mapas/"+m.id)):null;
  }).then(function(r){ return fim(r?.elementos); }).catch(function(){ return []; });
}
function iniPuxaDoMapa(s){
  var ini=iniDe(s);
  api(cAPI("/mapas")).then(function(l){
    var m=(l||[]).find(function(x){ return x.ativo; });
    return m?api(cAPI("/mapas/"+m.id)):null;
  }).then(function(r){
    if(!r){ toast("Nenhum "+vmin("mapa")+" está sendo mostrado aos "+vmin("jogadores")+"."); return; }
    var ja={}; ini.lista.forEach(function(x){ if(x.tokenId)ja["t"+x.tokenId]=1; if(x.elencoId)ja["e"+x.elencoId]=1; });
    var n=0, com=0;
    (r.elementos||[]).forEach(function(e){
      if(e.tipo!=="TOKEN")return;
      com++;
      var eid=e.dados?.elencoId?String(e.dados.elencoId):"";
      /* entrada antiga, que so sabia do elenco, passa a apontar para o token */
      var velha=eid&&ini.lista.find(function(x){ return !x.tokenId&&String(x.elencoId||"")===eid; });
      if(velha){ velha.tokenId=String(e.id); }
      if(ja["t"+e.id]||(eid&&ja["e"+eid]))return;
      ja["t"+e.id]=1; n++;
      ini.lista.push({id:uid("i"),nome:e.dados?.nome||"",tokenId:String(e.id),elencoId:eid,v:"",oc:e.visivel===false}); });
    if(!com){ toast("Nenhum token no "+vmin("mapa")+"."); return; }
    if(!ini.vez&&ini.lista.length)ini.vez=iniOrdem(ini)[0].id;
    toast(n?n+" entraram na ordem. Token escondido entra oculto.":"Todo mundo do mapa já estava na ordem"); iniMudou(s);
  }).catch(function(e){ toast(e?.message||"não consegui ler o mapa","erro"); });
}
function iniEditar(s,x){
  iniTokensDoMapa().then(function(toks){ iniEditarForm(s,x,toks); });
}
function iniEditarForm(s,x,toks){
  var ini=iniDe(s), novo=!x, nomeTok=function(id){ var t=toks.find(function(o){ return o[0]===String(id); }); return t?t[1]:""; };
  /* entrada antiga, so com elenco: o token do mapa ligado ao mesmo alguem aparece ja escolhido */
  var tokenAtual=x?mpTokenDaOrdem(x):"";
  if(tokenAtual&&!toks.some(function(o){ return o[0]===tokenAtual; })){ toks=toks.concat([[tokenAtual,"Token de outro mapa"]]); }
  formulario(novo?"Entrar na iniciativa":"Editar · iniciativa",[
    {k:"elencoId",rot:"Alguém do elenco (opcional)",tipo:"sel",ops:iniOpcoesElenco(),
      dica:"Preenche o nome."},
    {k:"tokenId",rot:"Token no mapa (opcional)",tipo:"sel",ops:[["","Nenhum"]].concat(toks),
      dica:"O token ligado aqui só se move na vez desta entrada (o do jogador, não o seu)."},
    {k:"nome",rot:"Quem",dica:"Vazio, usa o nome do token ou de quem do elenco foi escolhido.",
      valida:function(v,w){ return String(v||"").trim()||w.elencoId||w.tokenId?"":"Informe um nome ou escolha alguém do elenco ou um token."; }},
    {k:"v",rot:"Iniciativa",tipo:"num"},
    {k:"oc",rot:"Esconder nome e valor dos "+V("jogadores").toLowerCase(),tipo:"check"}
  ],x?{...x,tokenId:tokenAtual}:{nome:"",v:"",oc:false,elencoId:"",tokenId:""},{
    salvar:function(w){ var alvo=x||{id:uid("i")}; alvo.elencoId=w.elencoId||""; alvo.tokenId=w.tokenId||"";
      alvo.nome=String(w.nome).trim()||nomeTok(w.tokenId)||iniNomeDoElenco(w.elencoId); alvo.v=w.v; alvo.oc=!!w.oc;
      if(novo)ini.lista.push(alvo); if(!ini.vez)ini.vez=iniOrdem(ini)[0].id; iniMudou(s); },
    remover:novo?null:function(){ comDesfazer("Saiu da iniciativa",function(){
      ini.lista=ini.lista.filter(function(y){ return y!==x; }); if(ini.vez===x.id)ini.vez=(iniOrdem(ini)[0]||{}).id||""; iniMudou(s); }); }
  });
}
function iniLigar(v,s){
  var b=$("#iniBtn",v); if(b)b.onclick=function(){ S.ini=!S.ini; render(); };
  var ini=iniDe(s);
  $$("[data-ini]",v).forEach(function(c){ c.onclick=function(){
    iniEditar(s,ini.lista.filter(function(x){ return x.id===c.dataset.ini; })[0]); }; });
  var a=$("#iniAdd",v); if(a)a.onclick=function(){ iniEditar(s,null); };
  var p=$("#iniProx",v); if(p)p.onclick=function(){ var o=iniOrdem(ini); if(!o.length)return;
    var i=o.map(function(x){return x.id;}).indexOf(ini.vez)+1;
    if(i>=o.length){ i=0; ini.rodada++; }
    ini.vez=o[i].id; som("vez"); iniMudou(s); };
  var px=$("#iniPux",v); if(px)px.onclick=function(){
    var tem={}; ini.lista.forEach(function(x){ tem[x.elencoId?"e"+x.elencoId:norm(x.nome)]=1; });
    var n=0, poe=function(q,oc){ var ch=q.id?"e"+q.id:norm(q.nome); if(!q.nome||tem[ch]||tem[norm(q.nome)])return; tem[ch]=1;
      ini.lista.push({id:uid("i"),nome:q.nome,elencoId:q.id?String(q.id):"",v:"",oc:oc}); n++; };
    ((D.elenco&&D.elenco.personagens)||[]).forEach(function(q){ poe(q,false); });
    (s.npcIds||[]).forEach(function(id){ var q=elDe("npcs",id); if(q)poe(q,true); });
    if(!ini.vez&&ini.lista.length)ini.vez=iniOrdem(ini)[0].id;
    toast(n?n+" entraram na ordem. NPC entra oculto.":"Todo mundo já estava na ordem"); iniMudou(s); };
  var pm=$("#iniMapa",v); if(pm)pm.onclick=function(){ iniPuxaDoMapa(s); };
  var rl=$("#iniRol",v); if(rl)rl.onclick=function(){
    var ult="1d20"; try{ ult=localStorage.getItem("grim_inif")||"1d20"; }catch(error_){ /* falha aqui nao muda o que a pessoa ve */ }
    formulario("Rolar iniciativa de quem está sem valor",[{k:"f",rot:"Rolagem",obrig:true,dica:"Um dado com soma opcional: 1d20, 1d10+2, 2d6."}],{f:ult},{
      salvar:function(w){ var m=/^\s*(\d{0,2})d(\d{1,4})\s*([+-]\s*\d{1,3})?\s*$/i.exec(w.f);
        if(!m){ toast("Não entendi essa rolagem"); return; }
        try{ localStorage.setItem("grim_inif",w.f); }catch(error_){ /* falha aqui nao muda o que a pessoa ve */ }
        ini.lista.forEach(function(x){ if(x.v!==""&&x.v!=null)return;
          var t=m[3]?Number.parseInt(m[3].replace(/\s/g,""),10):0; for(var k=0;k<(+m[1]||1);k++)t+=rolaDado(+m[2]); x.v=t; });
        ini.vez=iniOrdem(ini)[0].id; ini.rodada=1; iniMudou(s); } }); };
  var f=$("#iniFim",v); if(f)f.onclick=function(){ comDesfazer("Iniciativa encerrada",function(){
    s.ini={lista:[],vez:"",rodada:1}; S.ini=false; iniMudou(s); }); };
}
