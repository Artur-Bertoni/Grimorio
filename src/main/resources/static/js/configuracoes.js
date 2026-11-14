/* Pagina de Configuracoes. */
"use strict";

/* ---------- PAGINA DE AJUSTES (no lugar do menu "...") ---------- */
function secoesAjustes(){
  var l=[];
  if(GM&&CID)l.push(["campanha",Vm("campanha")],["mesa","Mesa e convites"],["vocab","Vocabulário"],["ref",Vm("referencia")],["busca","Busca"]);
  l.push(["aparencia","Aparência"]);
  if(CID)l.push(["tour","Tour guiado"]);
  l.push(["conta","Conta"],["suporte","Suporte"]);
  if(ADMIN)l.push(["admin","Administração"]);
  return l;
}
function viewAjustes(){
  var l=secoesAjustes();
  if(!l.some(function(x){return x[0]===S.aj;}))S.aj=l[0][0];
  return htmlDe("t-ajustes",{cabeca:cabecaPagina(tituloApp(),"Configurações",{id:"ajCamps",texto:"Minhas "+vmin("campanhas"),sec:true}),
    abas:subnav(l,S.aj,"data-aj")});
}
/* As janelas de ajuste ja existiam como overlay. Aqui elas sao montadas dentro da
   pagina: a mesma funcao recebe este "fabricante" no lugar do overlay. */
function emPagina(alvo){
  return function(titulo,body){
    alvo.innerHTML=htmlDe("t-em-pagina",{titulo:titulo,corpo:body});
    alvo.close=function(){}; return alvo; };
}
function hydrateAjustes(v){
  $$("[data-aj]",v).forEach(function(b){ b.onclick=function(){ S.aj=b.getAttribute("data-aj"); render(); }; });
  var bc=$("#ajCamps",v); if(bc)bc.onclick=function(){ trocarCampanha(); };
  var alvo=$("#ajBody",v), mk=emPagina(alvo), k=S.aj;
  if(k==="mesa")abrirMembros(null,mk);
  else if(k==="vocab")abrirVocabulario(null,mk);
  else if(k==="ref")abrirReferencia(null,mk);
  else if(k==="busca")ajustesBusca(alvo);
  else if(k==="admin")abrirAdmin(null,mk);
  else if(k==="suporte")abrirSuporte(null,mk);
  else if(k==="tour"){
    alvo.innerHTML=htmlDe("t-aj-tour",{mestre:GM});
    var tmb=$("#tourMestre",alvo); if(tmb)tmb.onclick=function(){ iniciarTour("mestre"); };
    $("#tourJog",alvo).onclick=function(){ iniciarTour("jogador"); };
  }
  else if(k==="campanha"){
    abrirCampanha(null,mk);
  }
  else if(k==="conta"){
    abrirConta(null,mk);
    alvo.insertAdjacentHTML("beforeend",htmlDe("t-aj-sair",{sairCampanha:!!(CID&&!GM)}));
    $("#mSair",alvo).onclick=sair;
    var sj=$("#mSaiCamp",alvo); if(sj)sj.onclick=function(){
      if(!confirm("Sair desta campanha? Você perde o acesso até receber outro convite."))return;
      api("/api/campanhas/"+CID+"/sair",{method:"POST"})
        .then(function(){ trocarCampanha(); })
        .catch(function(e){ toast((e&&e.message)||"não deu"); }); };
  }
  else {
    alvo.innerHTML=htmlDe("t-aj-aparencia",{temas:temaHtml(),ia:!!(GM&&CID),iaNome:MESA.iaNome||""});
    temaWire(alvo);
    var iN=$("#iaN",alvo), iA=$("#iaA",alvo), iP=$("#iaPrev",alvo);
    if(iN&&iA){ iA.value=iaArt();
      var prev=function(){ if(iP)iP.textContent="Perguntar "+iA.value+" "+((iN.value||"").trim()||"Claude"); };
      iN.oninput=prev; iA.onchange=prev; prev();
      $("#iaOk",alvo).onclick=function(){ MESA.iaNome=(iN.value||"").trim(); MESA.iaArt=iA.value;
        salvarMesa(); prev(); toast("Nome salvo"); }; }
  }
}


function abrirMembros(back,mk){
  if(!GM){ toast("Só o mestre"); return; }
  var ov=(mk||overlay)("Quem está na mesa",htmlDe("t-membros"),{wide:true,back:back});

  function marcaRol(){ var ab=rolagensAbertas();
    $$("[data-rol]",ov).forEach(function(x){ x.setAttribute("aria-pressed",(x.getAttribute("data-rol")==="1")===ab); }); }
  marcaRol();
  $$("[data-rol]",ov).forEach(function(b){ b.onclick=function(){
    var ab=b.getAttribute("data-rol")==="1";
    api("/api/campanhas/"+CID,{method:"PUT",body:{rolagensAbertas:ab}}).then(function(){
      campAtual().rolagensAbertas=ab; marcaRol();
      toast(ab?"Rolagens abertas para a mesa":"Rolagens só para quem rolou e o mestre"); })
     .catch(function(e){ toast((e&&e.message)||"não deu"); }); }; });
  function lista(){
    api("/api/campanhas/"+CID+"/membros").then(function(ms){
      $("#mbList",ov).innerHTML=htmlDe("t-membros-lista",{membros:ms||[]});
      $$("[data-pap]",ov).forEach(function(b){ b.onclick=function(){
        api("/api/campanhas/"+CID+"/membros/"+b.getAttribute("data-pap"),
            {method:"PUT",body:{papel:b.getAttribute("data-v")}})
          .then(lista).catch(function(e){toast((e&&e.message)||"não deu");}); }; });
      $$("[data-rm]",ov).forEach(function(b){ b.onclick=function(){
        if(!confirm("Tirar essa pessoa da campanha?"))return;
        api("/api/campanhas/"+CID+"/membros/"+b.getAttribute("data-rm"),{method:"DELETE"})
          .then(lista).catch(function(e){toast((e&&e.message)||"não deu");}); }; });
    }).catch(function(){ $("#mbList",ov).innerHTML=htmlDe("t-vazio",{texto:"Não consegui listar."}); });
  }
  function convites(){
    api("/api/campanhas/"+CID+"/convites").then(function(cs){
      $("#cvList",ov).innerHTML=htmlDe("t-convites-lista",{convites:(cs||[]).map(function(c){
        return {id:c.id,rotulo:c.rotulo,papel:c.papel,usos:c.usos,usosMax:c.usosMax,valido:c.valido,
          url:location.origin+"/?convite="+encodeURIComponent(c.token)}; })});
      $$("[data-cp]",ov).forEach(function(b){ b.onclick=function(){
        try{ navigator.clipboard.writeText(b.getAttribute("data-cp")).then(function(){toast("Link copiado");},function(){}); }catch(e){} }; });
      $$("[data-cvdel]",ov).forEach(function(b){ b.onclick=function(){
        api("/api/campanhas/"+CID+"/convites/"+b.getAttribute("data-cvdel"),{method:"DELETE"})
          .then(convites).catch(function(){toast("não deu");}); }; });
    }).catch(function(){});
  }
  lista(); convites();
  $("#cvGo",ov).onclick=function(){
    api("/api/campanhas/"+CID+"/convites",{method:"POST",body:{
      papel:$("#cvPap",ov).value, rotulo:$("#cvRot",ov).value,
      usos:+$("#cvUsos",ov).value||1, dias:+$("#cvDias",ov).value||null}})
     .then(function(){ $("#cvRot",ov).value=""; convites(); toast("Link gerado"); })
     .catch(function(e){ toast((e&&e.message)||"não deu"); }); };
}

function abrirCampanha(back,mk){
  if(!GM){ toast("Só o mestre"); return; }
  var c=(CAMPANHAS.filter(function(x){return String(x.id)===String(CID);})[0])||{};
  var ov=(mk||overlay)("Configurações da campanha",htmlDe("t-campanha-config",{nome:c.nome||"",sistema:c.sistema||"",
    capa:capaHtml(c),temCapa:!!c.capa,tema:MESA.tema,
    estilos:Object.keys(ESTILOS).map(function(e){ return {nome:ESTILOS[e].nome,
      temas:Object.keys(TEMAS).filter(function(k){ return TEMAS[k].estilo===e; }).map(function(k){ return {k:k,nome:TEMAS[k].nome}; })}; })}),
    {wide:true,back:back});

  $("#caGo",ov).onclick=function(){
    api("/api/campanhas/"+CID,{method:"PUT",body:{
      nome:$("#caNome",ov).value, sistema:$("#caSis",ov).value}})
     .then(function(){ if(D.campanha){ D.campanha.sistema=$("#caSis",ov).value;
         D.campanha.titulo=$("#caNome",ov).value.trim()||D.campanha.titulo; save(); salvarMesa(); }
       toast("Salvo"); return api("/api/sessao"); })
     .then(function(s2){ CAMPANHAS=s2.campanhas||[]; pintarMarca(); })
     .catch(function(e){ toast((e&&e.message)||"não deu"); }); };

  function gravarCapa(rel){
    api("/api/campanhas/"+CID,{method:"PUT",body:{capa:rel}})
      .then(function(){ return api("/api/sessao"); })
      .then(function(s2){ CAMPANHAS=s2.campanhas||[];
        var c2=(CAMPANHAS.filter(function(x){return String(x.id)===String(CID);})[0])||{};
        $("#caCapa",ov).innerHTML=capaHtml(c2); $("#caCapaTira",ov).hidden=!c2.capa;
        toast(rel?"Capa salva":"Capa tirada"); })
      .catch(function(e){ toast((e&&e.message)||"não deu"); });
  }
  $("#caCapaEsc",ov).onclick=function(){
    var c2=(CAMPANHAS.filter(function(x){return String(x.id)===String(CID);})[0])||{};
    escolherImagem(c2.capa||"").then(function(rel){ if(rel!==null)gravarCapa(rel); }); };
  $("#caCapaTira",ov).onclick=function(){ gravarCapa(""); };
  $("#caTema",ov).onchange=function(){ MESA.tema=this.value; salvarMesa(); trocarTema(temaAtivo());
    toast(this.value?"Tema sugerido: "+TEMAS[this.value].nome:"Sem tema sugerido"); };

  var ex=$("#caExp",ov);
  ex.href="/api/c/"+CID+"/pacote?imagens=true";
  ex.setAttribute("download","");

  $("#caImp",ov).onclick=function(){
    escolherArquivos(false,".zip").then(function(fs){
      if(!fs.length)return;
      var fd=new FormData(); fd.append("arquivo",fs[0]);
      fd.append("substituir",$("#caSub",ov).checked?"true":"false");
      toast("Enviando o pacote…");
      upload("/api/c/"+CID+"/pacote",fd,null)
        .then(function(r){ toast((r.indices||0)+" índices e "+(r.imagens||0)+" imagens importados");
          recarregaCatalogo(); recarregaIndice();
          if(r.guia){ ov.close(); entrarNaCampanha(CID); } })
        .catch(function(e){ toast((e&&e.message)||"não deu"); }); }); };

  $("#caDel",ov).onclick=function(){
    if(!confirm("Apagar a campanha inteira? Isso não volta."))return;
    if(!confirm("Confirma mesmo? Guia, mesa, mídia e anotações somem."))return;
    api("/api/campanhas/"+CID,{method:"DELETE"})
      .then(function(){ ov.close(); trocarCampanha(); })
      .catch(function(e){ toast((e&&e.message)||"não deu"); }); };
}

function abrirVocabulario(back,mk){
  if(!GM){ toast("Só o mestre"); return; }
  var chaves=Object.keys(VOCAB_PADRAO);
  var ov=(mk||overlay)("Como sua mesa chama as coisas",htmlDe("t-vocabulario",{termos:chaves.map(function(k){
      return {k:k,padrao:VOCAB_PADRAO[k],valor:(PUBD().vocab||{})[k]||""}; })}),{wide:true,back:back});
  $("#vcGo",ov).onclick=function(){
    var v={};
    $$("[data-voc]",ov).forEach(function(i){ var t=(i.value||"").trim();
      if(t)v[i.getAttribute("data-voc")]=t; });
    D.campanha.vocab=v; save(); salvarMesa(); ov.close(); render(); toast("Vocabulário salvo"); };
}

function abrirReferencia(back,mk){
  if(!GM){ toast("Só o mestre"); return; }
  var ref=JSON.parse(JSON.stringify(PUBD().referencia||[]));
  function corpo(){ return htmlDe("t-referencia-grupos",{grupos:ref}); }
  var ov=(mk||overlay)(Vm("referencia"),htmlDe("t-referencia",{corpo:corpo()}),{wide:true,back:back});
  function colher(){
    $$("[data-rt]",ov).forEach(function(i){ ref[+i.getAttribute("data-rt")].t=i.value; });
    $$("[data-ri]",ov).forEach(function(t){
      ref[+t.getAttribute("data-ri")].itens=(t.value||"").split("\n")
        .map(function(x){return x.trim();}).filter(Boolean); });
  }
  function ligar(){
    $("#rfAdd",ov).onclick=function(){ colher(); ref.push({t:"Novo grupo",itens:[]});
      $("#rfBody",ov).innerHTML=corpo(); ligar(); };
    $("#rfGo",ov).onclick=function(){ colher();
      D.campanha.referencia=ref.filter(function(g){return (g.t||"").trim()||(g.itens||[]).length;});
      save(); salvarMesa(); ov.close(); render(); toast("Consulta rápida salva"); };
    $$("[data-rdel]",ov).forEach(function(b){ b.onclick=function(){ colher();
      ref.splice(+b.getAttribute("data-rdel"),1); $("#rfBody",ov).innerHTML=corpo(); ligar(); }; });
  }
  ligar();
}

/* Segredo ja salvo aparece como bolinhas. O valor de verdade nunca sai do servidor, entao o
   campo recebe uma mascara: quem salva sem mexer manda "nao mexi" (null), e o que esta
   guardado fica. Campo de senha nao deixa copiar; o bloqueio de copiar e cortar e reforco. */
var MASCARA="••••••••••••";
function campoSecreto(inp,salvo){
  if(!inp)return;
  if(salvo!==undefined)inp.value=salvo?MASCARA:"";
  inp.onfocus=function(){ if(inp.value===MASCARA)inp.select(); };
  inp.oncopy=inp.oncut=function(e){ e.preventDefault(); };
}
function segredoDe(inp){ return inp.value===MASCARA?null:inp.value; }
function abrirAdmin(back,mk){
  if(!ADMIN){ toast("Só o administrador da instância"); return; }
  var ov=(mk||overlay)("Administração da instância",htmlDe("t-admin"),{wide:true,back:back});

  api("/api/admin/config").then(function(c){
    $("#iaKst",ov).textContent=c.iaConfigurada?"Chave salva.":"Nenhuma chave salva ainda.";
    campoSecreto($("#iaK",ov),!!c.iaConfigurada);
    campoSecreto($("#smS",ov),!!c.smtpSenhaSalva); campoSecreto($("#smK",ov),!!c.emailChaveSalva);
    $("#iaM",ov).value=c.iaModelo||"";
    $("#adReg",ov).checked=!!c.registroAberto;
    $("#smD",ov).value=c.suporteEmail||""; $("#smH",ov).value=c.smtpHost||""; $("#smP",ov).value=c.smtpPorta||"";
    $("#smU",ov).value=c.smtpUsuario||""; $("#smR",ov).value=c.smtpRemetente||"";
    $("#smV",ov).value=c.emailProvedor||"smtp"; mostraProv();
    $("#smSt",ov).textContent=(c.emailConfigurado?"Envio configurado. ":"Envio não configurado: as mensagens ficam só registradas aqui embaixo. ")
      +((c.emailProvedor==="smtp"?c.smtpSenhaSalva:c.emailChaveSalva)?"Já há uma "+(c.emailProvedor==="smtp"?"senha":"chave")+" salva; deixar o campo vazio mantém.":"");
  }).catch(function(){});
  function pintaSistema(){ api("/api/admin/sistema").then(function(r){
    var a=r.armazenamento||{}, s=r.sistema||{};
    $("#adArm",ov).innerHTML=htmlDe("t-admin-armazenamento",{a:a});
    var desde=s.noArDesde?Math.max(0,Date.now()-s.noArDesde):0, h=Math.floor(desde/3600000), d=Math.floor(h/24);
    $("#adSis",ov).innerHTML=htmlDe("t-admin-sistema",{s:s,
      noAr:d?d+" dia(s) e "+(h%24)+" h":h?h+" h":Math.floor(desde/60000)+" min"});
  }).catch(function(){ $("#adArm",ov).innerHTML=htmlDe("t-carregando-sm",{texto:"não consegui ler"}); }); }
  pintaSistema();
  $("#adJunta",ov).onclick=function(){ var b=this; b.disabled=true; b.textContent="Juntando…";
    api("/api/admin/armazenamento/juntar",{method:"POST"}).then(function(r){
      b.disabled=false; b.textContent="Juntar arquivos iguais agora";
      toast(r.liberado?mb(r.liberado)+" liberados":"Nada para juntar: os arquivos iguais já estavam compartilhados"); pintaSistema(); })
     .catch(function(e){ b.disabled=false; b.textContent="Juntar arquivos iguais agora"; toast((e&&e.message)||"não deu"); }); };
  var DICAS={
    smtp:"Funciona em hospedagem que libera a saída SMTP. Railway Trial e Hobby bloqueiam: dá \"Couldn't connect\". Gmail: smtp.gmail.com, porta 587, senha de app.",
    resend:"resend.com › API Keys › Create API Key. Sem domínio próprio, deixe o remetente vazio (usa onboarding@resend.dev) e crie a conta Resend com o mesmo e-mail que recebe o suporte: sem domínio verificado, o Resend só entrega para o dono da conta. 3.000 e-mails/mês grátis.",
    brevo:"brevo.com › SMTP e API › Chaves de API. Em Remetentes, adicione e verifique o e-mail que vai enviar e escreva o mesmo no campo remetente. 300 e-mails/dia grátis."};
  function mostraProv(){ var p=$("#smV",ov).value;
    $("#smSmtp",ov).hidden=(p!=="smtp"); $("#smKey",ov).hidden=(p==="smtp");
    $("#smDica",ov).textContent=DICAS[p]||""; }
  $("#smV",ov).onchange=mostraProv; mostraProv();
  function pintaSup(){ api("/api/admin/suporte").then(function(l){
    $("#adSup",ov).innerHTML=htmlDe("t-admin-suporte",{mensagens:l||[]}); }).catch(function(){}); }
  pintaSup();
  $("#smOk",ov).onclick=function(){
    var corpo={suporteEmail:$("#smD",ov).value,emailProvedor:$("#smV",ov).value,smtpHost:$("#smH",ov).value,
      smtpPorta:$("#smP",ov).value,smtpUsuario:$("#smU",ov).value,smtpRemetente:$("#smR",ov).value};
    var sn=segredoDe($("#smS",ov)), ch=segredoDe($("#smK",ov));
    if(sn!==null)corpo.smtpSenha=sn; if(ch!==null)corpo.emailChave=ch;
    api("/api/admin/config",{method:"PUT",body:corpo})
      .then(function(){ toast("Salvo"); }).catch(function(e){ toast((e&&e.message)||"não deu"); }); };
  $("#smT",ov).onclick=function(){ var b=this; b.disabled=true; $("#smSt",ov).textContent="enviando o teste…";
    api("/api/admin/suporte/teste",{method:"POST"}).then(function(r){ b.disabled=false; $("#smSt",ov).textContent="Teste enviado para "+r.para+". Confira a caixa de entrada (e o spam)."; })
      .catch(function(e){ b.disabled=false; $("#smSt",ov).textContent=(e&&e.message)||"não deu"; }); };

  $("#iaKs",ov).onclick=function(){
    var k=segredoDe($("#iaK",ov)), corpo={iaModelo:$("#iaM",ov).value};
    if(k!==null)corpo.iaApiKey=k;
    api("/api/admin/config",{method:"PUT",body:corpo})
      .then(function(){ if(k!==null)IACFG=!!k.trim(); toast("Salvo"); })
      .catch(function(e){toast((e&&e.message)||"não deu");}); };
  $("#adReg",ov).onchange=function(){
    api("/api/admin/config",{method:"PUT",body:{registroAberto:$("#adReg",ov).checked?"true":"false"}})
      .then(function(){ toast("Salvo"); }).catch(function(e){toast((e&&e.message)||"não deu");}); };

  function usuarios(){
    api("/api/admin/usuarios").then(function(us){
      $("#adUs",ov).innerHTML=htmlDe("t-admin-usuarios",{usuarios:us||[]});
      $$("[data-pw]",ov).forEach(function(b){ b.onclick=function(){
        var p=prompt("Nova senha (mínimo 6):"); if(!p)return;
        api("/api/admin/usuarios/"+b.getAttribute("data-pw"),{method:"PUT",body:{senha:p}})
          .then(function(){toast("Trocada");}).catch(function(e){toast((e&&e.message)||"não deu");}); }; });
      $$("[data-ad]",ov).forEach(function(b){ b.onclick=function(){
        api("/api/admin/usuarios/"+b.getAttribute("data-ad"),
            {method:"PUT",body:{admin:b.getAttribute("data-v")==="true"}})
          .then(usuarios).catch(function(e){toast((e&&e.message)||"não deu");}); }; });
      $$("[data-ur]",ov).forEach(function(b){ b.onclick=function(){
        if(!confirm("Remover essa conta?"))return;
        api("/api/admin/usuarios/"+b.getAttribute("data-ur"),{method:"DELETE"})
          .then(usuarios).catch(function(e){toast((e&&e.message)||"não deu");}); }; });
    }).catch(function(){ $("#adUs",ov).innerHTML=htmlDe("t-vazio",{texto:"Não consegui listar."}); });
  }
  usuarios();
  $("#auGo",ov).onclick=function(){
    api("/api/admin/usuarios",{method:"POST",body:{
      login:$("#auL",ov).value,nome:$("#auN",ov).value,senha:$("#auS",ov).value}})
     .then(function(){ $("#auL",ov).value="";$("#auN",ov).value="";$("#auS",ov).value="";
       usuarios(); toast("Conta criada"); })
     .catch(function(e){ toast((e&&e.message)||"não deu"); }); };

  api("/api/admin/campanhas").then(function(cs){
    $("#adCa",ov).innerHTML=htmlDe("t-admin-campanhas",{campanhas:cs||[]});
  }).catch(function(){});
}

function temaCard(k,at){
  var t=TEMAS[k];
  return htmlDe("t-tema-card",{k:k,t:t,e:ESTILOS[t.estilo]||ESTILOS.terror,ativo:at===k,sugerido:!!(CID&&k===temaMesa())});
}
function temaHtml(){
  var at=temaAtivo(), fx=true;
  try{ fx=localStorage.getItem("grim_fx")!=="0"; }catch(e){}
  return htmlDe("t-temas",{mestre:GM,fx:fx,som:somLigado(),volume:Math.round(somVol()*100),
    estilos:Object.keys(ESTILOS).map(function(e){
      var ks=Object.keys(TEMAS).filter(function(k){ return TEMAS[k].estilo===e; });
      return {nome:ESTILOS[e].nome,cartoes:ks.map(function(k){ return temaCard(k,at); }).join("")}; })
      .filter(function(e){ return e.cartoes; })});
}
function temaWire(ov){
  $$("[data-som]",ov).forEach(function(b){ b.onclick=function(){ var lig=b.getAttribute("data-som")==="1";
    try{ localStorage.setItem("grim_som",lig?"1":"0"); }catch(e){}
    $$("[data-som]",ov).forEach(function(x){ x.setAttribute("aria-pressed",(x.getAttribute("data-som")==="1")===lig); });
    if(lig)som("max"); }; });
  var sv=$("#somVol",ov); if(sv){ sv.style.setProperty("--pct",sv.value+"%");
    sv.oninput=function(){ sv.style.setProperty("--pct",sv.value+"%"); try{ localStorage.setItem("grim_somvol",String(sv.value/100)); }catch(e){} };
    sv.onchange=function(){ som("cai"); }; }
  function marca(){ $$("[data-tema]",ov).forEach(function(x){
    x.setAttribute("aria-pressed", x.getAttribute("data-tema")===temaAtivo()); }); }
  $$("[data-tema]",ov).forEach(function(b){ b.onclick=function(){
    var k=b.getAttribute("data-tema");
    try{ localStorage.setItem("grim_tema",k); if(CID)localStorage.removeItem("grim_tema_c"+CID); }catch(e){}
    trocarTema(k); marca(); }; });
  $$("[data-mov]",ov).forEach(function(b){ b.onclick=function(){
    var lig=b.getAttribute("data-mov")==="1";
    try{ if(lig)localStorage.removeItem("grim_fx"); else localStorage.setItem("grim_fx","0"); }catch(e){}
    aplicarFx();
    $$("[data-mov]",ov).forEach(function(x){ x.setAttribute("aria-pressed",(x.getAttribute("data-mov")==="1")===lig); }); }; });
  var tm=$("#temaMesa",ov); if(tm)tm.onclick=function(){
    MESA.tema=temaAtivo(); salvarMesa(); toast("Tema aplicado para a mesa inteira"); };
  var tl=$("#temaLimpa",ov); if(tl)tl.onclick=function(){
    try{ localStorage.removeItem("grim_tema"); if(CID)localStorage.removeItem("grim_tema_c"+CID); }catch(e){}
    trocarTema(temaAtivo()); marca(); toast("Voltou ao tema da mesa"); };
}
function sair(){
  api("/api/logout",{method:"POST"}).then(function(){ location.href="/paginas/login.html"; })
   .catch(function(){ location.href="/paginas/login.html"; });
}
