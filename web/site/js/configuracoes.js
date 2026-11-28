/* Pagina de Configuracoes. */
"use strict";

/* ---------- PAGINA DE AJUSTES (no lugar do menu "...") ---------- */
/* Cada secao diz de quem e (o terceiro item): mudar algo da campanha afeta a mesa, o que e da
   pessoa vale so para ela, e o do servidor vale para todo mundo neste servidor. O menu mostra os
   tres grupos com rotulo, para ninguem alterar no lugar errado. */
var GRUPOS_AJUSTE=["campanha","voce","sistema"];
function tituloGrupoAjuste(g){ return g==="campanha"?"Esta "+vmin("campanha"):(g==="voce"?"Você":"Sistema"); }
function secoesAjustes(){
  var l=[];
  if(GM&&CID)l.push(["campanha",Vm("campanha"),"campanha"],["mesa","Mesa e convites","campanha"],["vocab","Vocabulário","campanha"],
    ["busca","Busca","campanha"]);
  l.push(["aparencia","Aparência","voce"],["privacidade","Privacidade e acessibilidade","voce"]);
  if(CID)l.push(["guias","Guias","voce"]);
  l.push(["conta","Conta","voce"],["suporte","Suporte","voce"]);
  if(ADMIN)l.push(["admin","Administração","sistema"],["textos","Textos legais","sistema"],["uso","Uso","sistema"]);
  return l;
}
function menuAjustes(l){
  return htmlDe("t-ajmenu",{grupos:GRUPOS_AJUSTE.map(function(g){
    var itens=l.filter(function(x){ return x[2]===g; }), titulo=tituloGrupoAjuste(g);
    return itens.length?{id:g,titulo:titulo,nav:subnav(itens,S.aj,"data-aj",titulo)}:null;
  }).filter(Boolean)});
}
function rotuloAjuste(k){ return (secoesAjustes().find(function(x){ return x[0]===k; })||[])[1]||""; }
/* No celular Configuracoes e uma lista: cada secao abre numa tela propria, com voltar. Na tela
   larga o menu fica ao lado e a primeira secao ja vem aberta. */
function ajustesEmLista(){ return window.innerWidth<=900; }
function viewAjustes(){
  var l=secoesAjustes();
  if(!l.some(function(x){return x[0]===S.aj;}))S.aj=ajustesEmLista()?"":l[0][0];
  return htmlDe("t-ajustes",{cabeca:cabecaPagina(tituloApp(),"Configurações",{id:"ajCamps",texto:"Minhas "+vmin("campanhas"),sec:true}),
    lista:!S.aj,abas:menuAjustes(l)});
}
/* As janelas de ajuste ja existiam como overlay. Aqui elas sao montadas dentro da
   pagina: a mesma funcao recebe este "fabricante" no lugar do overlay. */
/* O titulo e sempre o nome do item do menu: antes cada janela trazia o seu, e o menu dizia
   "Mesa e convites" enquanto a pagina dizia outra coisa. */
function emPagina(alvo,rotulo){
  return function(titulo,body){
    alvo.innerHTML=htmlDe("t-em-pagina",{titulo:rotulo||titulo,corpo:body});
    alvo.close=function(){ /* dentro da pagina nao ha janela para fechar */ }; return alvo; };
}
function preferencia(k,padrao){ try{ var v=localStorage.getItem(k); return v==null?padrao:v!=="0"; }catch(error_){ return padrao; } }
function gravaPreferencia(k,ligado){ try{ localStorage.setItem(k,ligado?"1":"0"); }catch(error_){ toast("Não consegui guardar a escolha neste navegador.","erro"); } }
function ajustePrivacidade(alvo){
  alvo.innerHTML=htmlDe("t-aj-privacidade",{metricas:preferencia("grim_metricas",true),atalhos:preferencia("grim_atalhos",true)});
  $("#pvMetricas",alvo).onchange=function(e){ gravaPreferencia("grim_metricas",e.target.checked); toast(e.target.checked?"Contagem de uso ligada":"Contagem de uso desligada","ok"); };
  $("#pvAtalhos",alvo).onchange=function(e){ gravaPreferencia("grim_atalhos",e.target.checked); toast(e.target.checked?"Atalhos de uma tecla ligados":"Atalhos de uma tecla desligados","ok"); };
}
function ajusteTextos(alvo){
  alvo.innerHTML=htmlDe("t-aj-textos",{});
  var campos={privacidade:$("#txPriv",alvo),termos:$("#txTerm",alvo)};
  Object.keys(campos).forEach(function(k){ api("/api/publico/texto/"+k).then(function(j){ campos[k].value=j.padrao?"":j.texto;
    campos[k].placeholder=j.padrao?j.texto:""; }).catch(function(e){ toast(mensagemDeErro(e),"erro"); }); });
  var b=$("#txOk",alvo);
  b.onclick=function(){ b.disabled=true; b.setAttribute("aria-busy","true");
    Promise.all(Object.keys(campos).map(function(k){ return api("/api/admin/textos/"+k,{method:"PUT",body:{texto:campos[k].value}}); }))
      .then(function(){ toast("Textos salvos","ok"); }).catch(function(e){ toast(mensagemDeErro(e),"erro"); })
      .finally(function(){ b.disabled=false; b.removeAttribute("aria-busy"); }); };
}
function ajusteUso(alvo){
  alvo.innerHTML=htmlDe("t-carregando-sm",{texto:""});
  api("/api/admin/metricas?dias=30").then(function(r){
    var dias=Object.keys(r.porDia||{}).map(function(d){ return {dia:d.split("-").reverse().join("/"),total:r.porDia[d]}; });
    var max=Math.max.apply(null,dias.map(function(d){ return d.total; }).concat([1]));
    dias.forEach(function(d){ d.pc=Math.round(d.total*100/max); });
    var ev=Object.keys(r.porEvento||{}).map(function(k){ return {nome:k,total:r.porEvento[k]}; })
      .sort(function(a,b){ return b.total-a.total; });
    alvo.innerHTML=htmlDe("t-aj-uso",{periodo:r.dias,eventos:ev,dias:dias.reverse()});
  }).catch(function(e){ alvo.innerHTML=htmlDe("t-vazio",{texto:"Não consegui ler a contagem: "+mensagemDeErro(e)}); });
}
function hydrateAjustes(v){
  $$("[data-aj]",v).forEach(function(b){ b.onclick=function(){ S.aj=b.dataset.aj; render(); }; });
  var bc=$("#ajCamps",v); if(bc)bc.onclick=function(){ trocarCampanha(); };
  var av=$("#ajVolta",v); if(av)av.onclick=function(){ S.aj=""; render(); };
  if(!S.aj)return;
  var alvo=$("#ajBody",v), k=S.aj, mk=emPagina(alvo,rotuloAjuste(k));
  if(k==="privacidade")ajustePrivacidade(alvo);
  else if(k==="textos")ajusteTextos(alvo);
  else if(k==="uso")ajusteUso(alvo);
  else if(k==="mesa")abrirMembros(null,mk);
  else if(k==="vocab")abrirVocabulario(null,mk);
  else if(k==="busca")ajustesBusca(alvo);
  else if(k==="admin")abrirAdmin(null,mk);
  else if(k==="suporte")abrirSuporte(null,mk);
  else if(k==="guias")ajusteGuias(alvo);
  else if(k==="campanha"){
    abrirCampanha(null,mk);
  }
  else if(k==="conta"){
    abrirConta(null,mk);
    alvo.insertAdjacentHTML("beforeend",htmlDe("t-aj-sair",{sairCampanha:!!(CID&&!GM)}));
    $("#mSair",alvo).onclick=sair;
    var sj=$("#mSaiCamp",alvo); if(sj)sj.onclick=function(){
      confirmar("Você perde o acesso até receber outro convite.",{titulo:"Sair desta "+V("campanha").toLowerCase()+"?",sim:"Sair"}).then(function(sim){
        if(!sim)return;
        api("/api/campanhas/"+CID+"/sair",{method:"POST"})
          .then(function(){ trocarCampanha(); })
          .catch(function(e){ toast(mensagemDeErro(e),"erro"); }); }); };
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
    $$("[data-rol]",ov).forEach(function(x){ x.setAttribute("aria-pressed",(x.dataset.rol==="1")===ab); }); }
  marcaRol();
  $$("[data-rol]",ov).forEach(function(b){ b.onclick=function(){
    var ab=b.dataset.rol==="1";
    api("/api/campanhas/"+CID,{method:"PUT",body:{rolagensAbertas:ab}}).then(function(){
      campAtual().rolagensAbertas=ab; marcaRol();
      toast(ab?"Rolagens abertas para a mesa":"Rolagens só para quem rolou e o mestre"); })
     .catch(function(e){ toast(mensagemDeErro(e),"erro"); }); }; });
  function lista(){
    api("/api/campanhas/"+CID+"/membros").then(function(ms){
      $("#mbList",ov).innerHTML=htmlDe("t-membros-lista",{membros:ms||[]});
      $$("[data-pap]",ov).forEach(function(b){ b.onclick=function(){
        api("/api/campanhas/"+CID+"/membros/"+b.dataset.pap,
            {method:"PUT",body:{papel:b.dataset.v}})
          .then(lista).catch(function(e){toast(mensagemDeErro(e),"erro");}); }; });
      $$("[data-rm]",ov).forEach(function(b){ b.onclick=function(){
        confirmar("Ela perde o acesso até receber outro convite.",{titulo:"Tirar essa pessoa da "+V("campanha").toLowerCase()+"?",sim:"Tirar"}).then(function(sim){
          if(!sim)return;
          api("/api/campanhas/"+CID+"/membros/"+b.dataset.rm,{method:"DELETE"})
            .then(lista).catch(function(e){toast(mensagemDeErro(e),"erro");}); }); }; });
    }).catch(function(){ $("#mbList",ov).innerHTML=htmlDe("t-vazio",{texto:"Não consegui listar."}); });
  }
  function convites(){
    api("/api/campanhas/"+CID+"/convites").then(function(cs){
      $("#cvList",ov).innerHTML=htmlDe("t-convites-lista",{convites:(cs||[]).map(function(c){
        return {id:c.id,rotulo:c.rotulo,papel:c.papel,usos:c.usos,usosMax:c.usosMax,valido:c.valido,
          url:location.origin+"/?convite="+encodeURIComponent(c.token)}; })});
      $$("[data-cp]",ov).forEach(function(b){ b.onclick=function(){
        try{ navigator.clipboard.writeText(b.dataset.cp).then(function(){toast("Link copiado");},function(){}); }catch(error_){ /* falha aqui nao muda o que a pessoa ve */ } }; });
      $$("[data-cvdel]",ov).forEach(function(b){ b.onclick=function(){
        api("/api/campanhas/"+CID+"/convites/"+b.dataset.cvdel,{method:"DELETE"})
          .then(convites).catch(function(){toast("não deu");}); }; });
    }).catch(function(){});
  }
  lista(); convites();
  $("#cvGo",ov).onclick=function(){
    api("/api/campanhas/"+CID+"/convites",{method:"POST",body:{
      papel:$("#cvPap",ov).value, rotulo:$("#cvRot",ov).value,
      usos:+$("#cvUsos",ov).value||1, dias:+$("#cvDias",ov).value||null}})
     .then(function(){ $("#cvRot",ov).value=""; convites(); toast("Link gerado"); })
     .catch(function(e){ toast(mensagemDeErro(e),"erro"); }); };
}

function abrirCampanha(back,mk){
  if(!GM){ toast("Só o mestre"); return; }
  var c=(CAMPANHAS.filter(function(x){return String(x.id)===String(CID);})[0])||{};
  var ov=(mk||overlay)("Configurações da campanha",htmlDe("t-campanha-config",{nome:c.nome||"",sistema:c.sistema||"",
    capa:capaHtml(c),temCapa:!!c.capa,tema:MESA.tema,
    estilos:Object.keys(ESTILOS).map(function(e){ return {nome:ESTILOS[e].nome,
      temas:Object.keys(TEMAS).filter(function(k){ return TEMAS[k].estilo===e; }).map(function(k){ return {k:k,nome:TEMAS[k].nome}; })}; })}),
    {wide:true,back:back});

  /* um padrao so de gravacao: ao sair do campo, com o indicador de gravacao do topo */
  var gravado=$("#caNome",ov).value+"\u0000"+$("#caSis",ov).value;
  function gravaIdentidade(){
    var nome=$("#caNome",ov).value.trim(), sis=$("#caSis",ov).value.trim(), agora=nome+"\u0000"+sis;
    if(agora===gravado)return;
    if(!nome){ erroNoCampo($("#caNome",ov),"A "+V("campanha").toLowerCase()+" precisa de um nome."); return; }
    estadoSalvo("salvando…");
    api("/api/campanhas/"+CID,{method:"PUT",body:{nome:nome,sistema:sis}})
     .then(function(){ gravado=agora;
       if(D.campanha){ D.campanha.sistema=sis; D.campanha.titulo=nome; save(); salvarMesa(); }
       estadoSalvo("salvo"); return api("/api/sessao"); })
     .then(function(s2){ CAMPANHAS=s2.campanhas||[]; pintarMarca(); })
     .catch(function(e){ estadoSalvo("não salvou",true); toast(mensagemDeErro(e),"erro"); }); }
  $("#caNome",ov).addEventListener("change",gravaIdentidade);
  $("#caSis",ov).addEventListener("change",gravaIdentidade);

  function gravarCapa(rel){
    api("/api/campanhas/"+CID,{method:"PUT",body:{capa:rel}})
      .then(function(){ return api("/api/sessao"); })
      .then(function(s2){ CAMPANHAS=s2.campanhas||[];
        var c2=(CAMPANHAS.filter(function(x){return String(x.id)===String(CID);})[0])||{};
        $("#caCapa",ov).innerHTML=capaHtml(c2); $("#caCapaTira",ov).hidden=!c2.capa;
        toast(rel?"Capa salva":"Capa tirada"); })
      .catch(function(e){ toast(mensagemDeErro(e),"erro"); });
  }
  $("#caCapaEsc",ov).onclick=function(){
    var c2=(CAMPANHAS.filter(function(x){return String(x.id)===String(CID);})[0])||{};
    escolherImagem(c2.capa||"").then(function(rel){ if(rel!==null)gravarCapa(rel); }); };
  $("#caCapaTira",ov).onclick=function(){ gravarCapa(""); };
  $("#caTema",ov).onchange=function(){ MESA.tema=this.value; salvarMesa(); trocarTema(temaAtivo());
    toast(this.value?"Tema sugerido: "+TEMAS[this.value].nome:"Sem tema sugerido"); };

  /* o zip e montado enquanto desce: a tarefa mostra quanto ja veio contra a estimativa do servidor */
  $("#caExp",ov).onclick=function(){
    var h=tarefaLonga("Exportando o pacote","Montando o pacote no servidor…");
    baixarComProgresso("/api/c/"+CID+"/pacote","campanha-"+CID+".zip",h)
      .then(function(n){ h.fim("Pacote exportado ("+mb(n)+"). O navegador salvou o arquivo nos downloads.","ok"); })
      .catch(function(e){ h.fim("A exportação falhou: "+mensagemDeErro(e),"erro"); }); };

  $("#caImp",ov).onclick=function(){
    escolherArquivos(false,".zip").then(function(fs){
      if(!fs.length)return;
      var fd=new FormData(); fd.append("arquivo",fs[0]);
      fd.append("substituir",$("#caSub",ov).checked?"true":"false");
      var h=tarefaLonga("Importando o pacote",fs[0].name);
      upload("/api/c/"+CID+"/pacote",fd,h.envio("Enviando "+fs[0].name,"Pacote enviado. O servidor está desempacotando e lendo os livros…"))
        .then(function(r){ r=r||{};
          recarregaCatalogo(); recarregaIndice();
          h.fim(resumoPacote(r)+".","ok",null,r.guia?function(){ ov.close(); entrarNaCampanha(CID); }:null); })
        .catch(function(e){ h.fim("A importação falhou: "+mensagemDeErro(e),"erro"); }); }); };

  $("#caDel",ov).onclick=function(){
    confirmar("Guia, mesa, mídia, fichas e anotações somem do servidor. Isso não volta.",
      {titulo:"Apagar a "+V("campanha").toLowerCase()+" inteira?",sim:"Apagar para sempre",detalhe:"Se quiser guardar uma cópia, exporte o pacote antes."}).then(function(sim){
      if(!sim)return;
      api("/api/campanhas/"+CID,{method:"DELETE"})
        .then(function(){ ov.close(); trocarCampanha(); })
        .catch(function(e){ toast(mensagemDeErro(e),"erro"); }); }); };
}

function abrirVocabulario(back,mk){
  if(!GM){ toast("Só o mestre"); return; }
  var chaves=Object.keys(VOCAB_PADRAO);
  var ov=(mk||overlay)("Como sua mesa chama as coisas",htmlDe("t-vocabulario",{termos:chaves.map(function(k){
      return {k:k,padrao:VOCAB_PADRAO[k],valor:(PUBD().vocab||{})[k]||""}; })}),{wide:true,back:back});
  $("#vcGo",ov).onclick=function(){
    var v={};
    $$("[data-voc]",ov).forEach(function(i){ var t=(i.value||"").trim();
      if(t)v[i.dataset.voc]=t; });
    D.campanha.vocab=v; save(); salvarMesa(); ov.close(); render(); toast("Vocabulário salvo"); };
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
  if(!ADMIN){ toast("Só a administração"); return; }
  var ov=(mk||overlay)("Administração",htmlDe("t-admin",{minhas:(CAMPANHAS||[]).filter(function(c){ return c.papel==="MESTRE"; })}),{wide:true,back:back});

  api("/api/admin/config").then(function(c){
    $("#iaKst",ov).textContent=c.iaConfigurada?"Chave salva.":"Nenhuma chave salva ainda.";
    campoSecreto($("#iaK",ov),!!c.iaConfigurada);
    campoSecreto($("#smS",ov),!!c.smtpSenhaSalva); campoSecreto($("#smK",ov),!!c.emailChaveSalva);
    $("#iaM",ov).value=c.iaModelo||"";
    $("#adReg",ov).checked=!!c.registroAberto;
    $("#adMapa",ov).checked=!!c.mapaLiberado;
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
     .catch(function(e){ b.disabled=false; b.textContent="Juntar arquivos iguais agora"; toast(mensagemDeErro(e),"erro"); }); };
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
      .then(function(){ toast("Salvo"); }).catch(function(e){ toast(mensagemDeErro(e),"erro"); }); };
  $("#smT",ov).onclick=function(){ var b=this; b.disabled=true; $("#smSt",ov).textContent="enviando o teste…";
    api("/api/admin/suporte/teste",{method:"POST"}).then(function(r){ b.disabled=false; $("#smSt",ov).textContent="Teste enviado para "+r.para+". Confira a caixa de entrada (e o spam)."; })
      .catch(function(e){ b.disabled=false; $("#smSt",ov).textContent=(e&&e.message)||"não deu"; }); };

  $("#iaKs",ov).onclick=function(){
    var k=segredoDe($("#iaK",ov)), corpo={iaModelo:$("#iaM",ov).value};
    if(k!==null)corpo.iaApiKey=k;
    api("/api/admin/config",{method:"PUT",body:corpo})
      .then(function(){ if(k!==null)IACFG=!!k.trim(); toast("Salvo"); })
      .catch(function(e){toast(mensagemDeErro(e),"erro");}); };
  $("#adReg",ov).onchange=function(){
    api("/api/admin/config",{method:"PUT",body:{registroAberto:$("#adReg",ov).checked?"true":"false"}})
      .then(function(){ toast("Salvo"); }).catch(function(e){toast(mensagemDeErro(e),"erro");}); };

  $("#adMapa",ov).onchange=function(){
    var liga=$("#adMapa",ov).checked;
    api("/api/admin/config",{method:"PUT",body:{mapaLiberado:liga?"true":"false"}})
      .then(function(){ MAPA_LIBERADO=liga; toast("Salvo"); }).catch(function(e){toast(mensagemDeErro(e),"erro");}); };

  function usuarios(){
    api("/api/admin/usuarios").then(function(us){
      $("#adUs",ov).innerHTML=htmlDe("t-admin-usuarios",{usuarios:us||[]});
      $$("[data-pw]",ov).forEach(function(b){ b.onclick=function(){
        var uid=b.dataset.pw;
        formulario("Nova senha",[{k:"senha",rot:"Nova senha",tipo:"senha",obrig:true,
            dica:"Pelo menos 6 caracteres, com letra, número e um caractere especial.",
            valida:function(v){ var f=faltaNaSenha(String(v||"")); return f.length?"Falta: "+f.join(", ")+".":""; }}],{senha:""},
          {rotSalvar:"Trocar a senha",salvar:function(w){
            api("/api/admin/usuarios/"+uid,{method:"PUT",body:{senha:w.senha}})
              .then(function(){toast("Senha trocada","ok");}).catch(function(e){toast(mensagemDeErro(e),"erro");}); }}); }; });
      $$("[data-ad]",ov).forEach(function(b){ b.onclick=function(){
        api("/api/admin/usuarios/"+b.dataset.ad,
            {method:"PUT",body:{admin:b.dataset.v==="true"}})
          .then(usuarios).catch(function(e){toast(mensagemDeErro(e),"erro");}); }; });
      $$("[data-ur]",ov).forEach(function(b){ b.onclick=function(){
        confirmar("A pessoa perde o acesso ao Grimório. As campanhas que só ela mestrava ficam sem mestre.",{titulo:"Remover essa conta?",sim:"Remover a conta"}).then(function(sim){
          if(!sim)return;
          api("/api/admin/usuarios/"+b.dataset.ur,{method:"DELETE"})
            .then(usuarios).catch(function(e){toast(mensagemDeErro(e),"erro");}); }); }; });
    }).catch(function(){ $("#adUs",ov).innerHTML=htmlDe("t-vazio",{texto:"Não consegui listar."}); });
  }
  usuarios();
  $("#auGo",ov).onclick=function(){
    api("/api/admin/usuarios",{method:"POST",body:{
      login:$("#auL",ov).value,nome:$("#auN",ov).value,senha:$("#auS",ov).value}})
     .then(function(){ $("#auL",ov).value="";$("#auN",ov).value="";$("#auS",ov).value="";
       usuarios(); toast("Conta criada"); })
     .catch(function(e){ toast(mensagemDeErro(e),"erro"); }); };

  api("/api/admin/campanhas").then(function(cs){
    $("#adCa",ov).innerHTML=htmlDe("t-admin-campanhas",{campanhas:cs||[]});
  }).catch(function(){});
  adminModelos(ov);
}

/* Modelos de campanha na Administração: a lista, enviar pacote, salvar uma campanha como
   modelo, editar e apagar. Cada ação termina repintando a lista. */
function falhouModelo(e){ toast(mensagemDeErro(e),"erro"); }
function editarModelo(m,depois){
  formulario("Editar · modelo",[{k:"nome",rot:"Nome",obrig:true},
      {k:"descricao",rot:"Descrição",tipo:"area",dica:"Aparece no cartão do modelo, ao criar uma "+vmin("campanha")+"."}],
    {nome:m.nome,descricao:m.descricao},
    {salvar:function(w){
      api("/api/admin/modelos/"+encodeURIComponent(m.id),{method:"PUT",body:{nome:w.nome,descricao:w.descricao}})
        .then(function(){ toast("Modelo salvo","ok"); depois(); }).catch(falhouModelo); }});
}
function apagarModelo(m,depois){
  var apagou=false;
  confirmar("Quem criar uma "+vmin("campanha")+" não vai mais ver “"+m.nome+"”. As "+vmin("campanhas")+" que já começaram por ele não mudam.",
      {titulo:"Apagar este modelo?",sim:"Apagar o modelo"})
    .then(function(sim){ apagou=sim; return sim?api("/api/admin/modelos/"+encodeURIComponent(m.id),{method:"DELETE"}):null; })
    .then(function(){ if(apagou){ toast("Modelo apagado","ok"); depois(); } })
    .catch(falhouModelo);
}
/* troca a capa do cartao do modelo; so o cartao muda, a campanha criada continua sem imagem */
function capaModelo(m,depois){
  escolherArquivos(false,".webp,.png,.jpg,.jpeg,.gif").then(function(fs){
    if(!fs.length)return null;
    var fd=new FormData(); fd.append("arquivo",fs[0]);
    return upload("/api/admin/modelos/"+encodeURIComponent(m.id)+"/capa",fd,null);
  }).then(function(r){ if(r){ toast("Capa de “"+m.nome+"” trocada","ok"); depois(); } }).catch(falhouModelo);
}
function semCapaModelo(m,depois){
  api("/api/admin/modelos/"+encodeURIComponent(m.id)+"/capa",{method:"DELETE"})
    .then(function(){ toast("Capa tirada","ok"); depois(); }).catch(falhouModelo);
}
/* envia os pacotes um depois do outro: cada um vira um modelo, e um que falha nao para os outros */
function enviarModelos(fs,depois){
  var prontos=0, falhas=[], h=tarefaLonga("Enviando modelos");
  function proximo(i){
    if(i>=fs.length)return Promise.resolve();
    var fd=new FormData(), tx=(fs.length>1?"Pacote "+(i+1)+" de "+fs.length+": ":"")+fs[i].name;
    fd.append("arquivo",fs[i]);
    return upload("/api/admin/modelos",fd,function(fr){ if(fr>=1)h.passo(tx+" · conferindo no servidor…",null); else h.passo(tx,(i+fr)/fs.length); })
      .then(function(){ prontos++; },function(e){ falhas.push(fs[i].name+": "+mensagemDeErro(e)); })
      .then(function(){ return proximo(i+1); });
  }
  return proximo(0).then(function(){
    var msg=prontos===1?"1 modelo pronto.":prontos+" modelos prontos.";
    if(falhas.length)msg=(prontos?msg+" ":"")+"Não entraram:";
    h.fim(msg,falhas.length?(prontos?"aviso":"erro"):"ok",falhas);
    depois(); });
}
function adminModelos(ov){
  var lista=[];
  function doId(id){ return lista.find(function(x){ return x.id===id; }); }
  function liga(box,attr,fn){ $$("["+attr+"]",box).forEach(function(b){ b.onclick=function(){
    var m=doId(b.getAttribute(attr)); if(m)fn(m,pinta); }; }); }
  function pinta(){
    api("/api/modelos").then(function(l){
      lista=Array.isArray(l)?l:[];
      var box=$("#adMod",ov);
      box.innerHTML=htmlDe("t-admin-modelos",{modelos:lista.map(function(m){
        return {id:m.id,nome:m.nome,sistema:m.sistema,descricao:m.descricao,tamanho:m.tamanho,
          capa:m.temCapa?"/api/modelos/"+encodeURIComponent(m.id)+"/capa?v="+Date.now():""}; })});
      liga(box,"data-moded",editarModelo); liga(box,"data-modrm",apagarModelo);
      liga(box,"data-modcapa",capaModelo); liga(box,"data-modsemcapa",semCapaModelo);
    }).catch(function(){ $("#adMod",ov).innerHTML=htmlDe("t-vazio",{texto:"Não consegui listar os modelos."}); });
  }
  pinta();
  var env=$("#adModEnv",ov), sal=$("#adModSal",ov);
  env.onclick=function(){
    escolherArquivos(false,".zip").then(function(fs){
      return fs.length?enviarModelos(fs,pinta):null;
    }).catch(falhouModelo); };
  sal.onclick=function(){
    var h=tarefaLonga("Salvando como modelo","Empacotando a campanha no servidor…");
    api("/api/admin/modelos/campanha/"+encodeURIComponent($("#adModCa",ov).value),{method:"POST"})
      .then(function(m){ h.fim("Modelo “"+(m?.nome||"")+"” pronto. Ele já aparece em Como começar.","ok"); pinta(); })
      .catch(function(e){ h.fim("Não consegui salvar o modelo: "+mensagemDeErro(e),"erro"); }); };
}

/* um cartao de tema; as etiquetas dizem de onde cada tema vem: sugerido pelo mestre,
   escolhido pela pessoa para esta campanha, ou o tema dela fora das campanhas */
function temaCard(k,at){
  var t=TEMAS[k];
  return htmlDe("t-tema-card",{k:k,t:t,e:ESTILOS[t.estilo]||ESTILOS.terror,ativo:at===k,
    sugerido:!!(CID&&k===temaMesa()),escolhido:!!(CID&&k===temaEscolhido()),seu:!CID&&k===temaPessoal()});
}
function temaHtml(){
  var at=TEMA_PREVIA||temaAtivo(), fx=true;
  try{ fx=localStorage.getItem("grim_fx")!=="0"; }catch(error_){ /* falha aqui nao muda o que a pessoa ve */ }
  return htmlDe("t-temas",{mestre:GM,fx:fx,som:somLigado(),volume:Math.round(somVol()*100),
    dentro:!!CID,escolhido:temaEscolhido(),previa:!!TEMA_PREVIA,mesa:!!temaMesa(),segue:segueMesa(),
    estilos:Object.keys(ESTILOS).map(function(e){
      var ks=Object.keys(TEMAS).filter(function(k){ return TEMAS[k].estilo===e; });
      return {nome:ESTILOS[e].nome,cartoes:ks.map(function(k){ return temaCard(k,at); }).join("")}; })
      .filter(function(e){ return e.cartoes; })});
}
/* grava ou apaga uma preferencia de tema no navegador */
function guardaTema(chave,valor){
  try{ if(valor)localStorage.setItem(chave,valor); else localStorage.removeItem(chave); }
  catch(error_){ /* sem armazenamento: a escolha vale so ate recarregar */ }
}
function temaWire(ov){
  $$("[data-som]",ov).forEach(function(b){ b.onclick=function(){ var lig=b.dataset.som==="1";
    try{ localStorage.setItem("grim_som",lig?"1":"0"); }catch(error_){ /* falha aqui nao muda o que a pessoa ve */ }
    $$("[data-som]",ov).forEach(function(x){ x.setAttribute("aria-pressed",(x.dataset.som==="1")===lig); });
    if(lig)som("max"); }; });
  var sv=$("#somVol",ov); if(sv){ sv.style.setProperty("--pct",sv.value+"%");
    sv.oninput=function(){ sv.style.setProperty("--pct",sv.value+"%"); try{ localStorage.setItem("grim_somvol",String(sv.value/100)); }catch(error_){ /* falha aqui nao muda o que a pessoa ve */ } };
    sv.onchange=function(){ som("cai"); }; }
  /* redesenha a secao: as etiquetas e os botoes dependem do que acabou de mudar */
  function repinta(){ var box=$("#temaSec",ov); if(box){ box.outerHTML=temaHtml(); temaWire(ov); } }
  /* Fora de uma campanha o clique define o tema da pessoa. Dentro, so mostra como fica: quem
     grava e o botao "Definir como meu tema para esta campanha". */
  $$("[data-tema]",ov).forEach(function(b){ b.onclick=function(){
    var k=b.dataset.tema;
    if(CID){ TEMA_PREVIA=(k===temaAtivo())?null:k; trocarTema(k); }
    else{ guardaTema("grim_tema",k); trocarTema(k); }
    repinta(); }; });
  var tc=$("#temaCamp",ov); if(tc)tc.onclick=function(){
    var k=TEMA_PREVIA||temaAtivo(); TEMA_PREVIA=null;
    guardaTema("grim_tema_c"+CID,k); trocarTema(k); repinta();
    toast("“"+TEMAS[k].nome+"” é o seu tema nesta "+vmin("campanha"),"ok"); };
  var tl=$("#temaLimpa",ov); if(tl)tl.onclick=function(){
    TEMA_PREVIA=null; guardaTema("grim_tema_c"+CID,""); trocarTema(temaAtivo()); repinta();
    toast(temaMesa()?"Voltou ao tema da mesa":"Voltou ao seu tema","ok"); };
  $$("[data-segue]",ov).forEach(function(b){ b.onclick=function(){
    guardaTema("grim_segue",b.dataset.segue==="1"?"":"0");
    if(!TEMA_PREVIA)trocarTema(temaAtivo()); repinta(); }; });
  $$("[data-mov]",ov).forEach(function(b){ b.onclick=function(){
    var lig=b.dataset.mov==="1";
    try{ if(lig)localStorage.removeItem("grim_fx"); else localStorage.setItem("grim_fx","0"); }catch(error_){ /* falha aqui nao muda o que a pessoa ve */ }
    aplicarFx();
    $$("[data-mov]",ov).forEach(function(x){ x.setAttribute("aria-pressed",(x.dataset.mov==="1")===lig); }); }; });
}
function sair(){
  api("/api/logout",{method:"POST"}).then(function(){ location.href="/paginas/login.html"; })
   .catch(function(){ location.href="/paginas/login.html"; });
}
