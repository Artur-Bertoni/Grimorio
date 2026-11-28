/* A tela de entrar, criar conta e redefinir a senha (paginas/login.html). */
(function(){
  "use strict";
  function $(id){ return document.getElementById(id); }
  function cookie(n){ var m=document.cookie.match(new RegExp("(^|; )"+n+"=([^;]*)")); return m?decodeURIComponent(m[2]):""; }
  function cabecalho(json){ var h={"Content-Type":json?"application/json;charset=UTF-8":"application/x-www-form-urlencoded;charset=UTF-8"};
    var t=cookie("XSRF-TOKEN"); if(t)h["X-XSRF-TOKEN"]=t; return h; }
  var f=$("f"), b=$("b"), senhaEl=$("senha"), regras=$("regras"), aviso=$("aviso");
  var FORA="O servidor está fora do ar. Tente de novo em instantes.";

  /* aviso geral no alto do cartao: fica ate a pessoa fechar ou tentar de novo (nao some sozinho) */
  function avisa(msg,titulo,ok){
    $("avisoTit").textContent=titulo||"Não deu";
    $("avisoTxt").textContent=msg.charAt(0).toUpperCase()+msg.slice(1);
    aviso.classList.toggle("ok",!!ok); aviso.setAttribute("role",ok?"status":"alert");
    aviso.hidden=true; aviso.getBoundingClientRect(); aviso.hidden=false;
  }
  $("avisoX").onclick=function(){ aviso.hidden=true; };
  /* erro de um campo: embaixo dele, ligado por aria-describedby, e o campo marcado */
  function erroCampo(id,msg){ var c=$(id), e=$(id+"Erro");
    if(e)e.textContent=msg||""; if(msg){ c.setAttribute("aria-invalid","true"); c.focus(); } else c.removeAttribute("aria-invalid"); }
  function limpaErros(raiz){ Array.prototype.forEach.call(raiz.querySelectorAll("input"),function(c){ erroCampo(c.id,""); }); aviso.hidden=true; }
  Array.prototype.forEach.call(document.querySelectorAll("input"),function(c){
    c.addEventListener("input",function(){ if(c.getAttribute("aria-invalid"))erroCampo(c.id,""); }); });

  /* a mesma regra do servidor (UsuarioService.validaSenha); cada regra diz em texto se ja foi atendida */
  function faltaNaSenha(s){
    var r={tam:s.length>=6,letra:/\p{L}/u.test(s),num:/\d/.test(s),esp:/[^\p{L}\d\s]/u.test(s)};
    Array.prototype.forEach.call(regras.children,function(li){ var ok=!!r[li.dataset.r];
      li.classList.toggle("ok",ok); li.querySelector(".sr").textContent=ok?" (atendida)":" (falta)"; });
    return Array.prototype.filter.call(regras.children,function(li){ return !li.classList.contains("ok"); })
      .map(function(li){ return li.firstChild.textContent; });
  }
  senhaEl.addEventListener("input",function(){
    if(modo!=="criar")return;
    regras.hidden=!senhaEl.value&&regras.hidden;
    regras.classList.remove("falta"); faltaNaSenha(senhaEl.value); });
  var alt=$("alt"), hint=$("hint"), campoNome=$("campoNome");
  var params=new URLSearchParams(location.search), convite=params.get("convite")||"", token=params.get("redefinir")||"";
  var modo="entrar", registroAberto=false, porEmail=false;

  function mostra(qual){ f.hidden=qual!=="f"; $("fEsq").hidden=qual!=="esq"; $("fRed").hidden=qual!=="red"; }
  function pinta(){
    var criar=(modo==="criar");
    b.textContent=criar?"Criar conta":"Entrar";
    campoNome.hidden=!criar;
    $("nome").required=criar;
    senhaEl.setAttribute("autocomplete",criar?"new-password":"current-password");
    alt.textContent=criar?"Já tenho conta":"Criar uma conta";
    alt.hidden=!(registroAberto||convite||criar);
    $("esqueci").hidden=criar;
    hint.textContent=convite
      ? "Você chegou por um convite. Entre ou crie a conta e já cai na campanha."
      : (criar ? "" : "Recebeu um convite? Abra o link dele para criar sua conta já na mesa.");
    hint.hidden=!hint.textContent;
    $("login").placeholder=criar?"sem espaço, ex.: ana.souza":"";
    if(!criar){ regras.hidden=true; regras.classList.remove("falta"); }
    else if(senhaEl.value){ regras.hidden=false; faltaNaSenha(senhaEl.value); }
  }
  alt.onclick=function(){ modo=(modo==="criar")?"entrar":"criar"; limpaErros(f); pinta(); $("login").focus(); };

  fetch("/api/ping",{credentials:"same-origin"})
    .then(function(r){ return r.json(); })
    .then(function(j){ registroAberto=!!j?.registroAberto; pinta(); })
    .catch(function(){ pinta(); });
  fetch("/api/publico/recuperacao",{credentials:"same-origin"})
    .then(function(r){ return r.json(); }).then(function(j){ porEmail=!!j?.porEmail; })
    .catch(function(){ porEmail=false; });

  function destino(){ return convite ? ("/?convite="+encodeURIComponent(convite)) : "/"; }

  f.onsubmit=function(e){
    e.preventDefault();
    limpaErros(f);
    var login=$("login").value, senha=senhaEl.value;
    /* validacao nativa desligada (novalidate): o erro sai embaixo do campo, que recebe o foco */
    if(!login.trim()){ erroCampo("login","Escreva o seu login."); return; }
    if(!senha){ erroCampo("senha","Escreva a sua senha."); return; }
    if(modo==="criar"){
      if(!$("nome").value.trim()){ erroCampo("nome","Escreva o seu nome na mesa: é como os outros vão te ver."); return; }
      if(/\s/.test(login.trim())||login.trim().length<3){ erroCampo("login","O login precisa de 3 caracteres ou mais e não pode ter espaço."); return; }
      var falta=faltaNaSenha(senha);
      if(falta.length){
        regras.hidden=false; regras.classList.remove("falta"); regras.getBoundingClientRect(); regras.classList.add("falta");
        avisa("A senha ainda precisa de: "+falta.join(", ")+".","Senha fraca"); erroCampo("senha","A senha ainda não atende às regras abaixo."); return; }
      var em=$("email").value.trim();
      if(em&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){ erroCampo("email","Esse e-mail parece errado."); return; }
    }
    b.disabled=true;
    if(modo==="criar"){
      b.textContent="Criando…";
      fetch("/api/registrar",{method:"POST",credentials:"same-origin",headers:cabecalho(true),
        body:JSON.stringify({login:login,senha:senha,nome:$("nome").value,convite:convite})})
        .then(function(r){ return r.json().catch(function(){return {};}).then(function(j){
          if(!r.ok){ b.disabled=false; pinta(); avisa(j?.erro||"não consegui criar a conta"); return; }
          var em2=$("email").value.trim();
          modo="entrar"; entrar(login,senha,em2); }); })
        .catch(function(){ b.disabled=false; pinta(); avisa(FORA); });
      return;
    }
    b.textContent="Entrando…";
    entrar(login,senha,"");
  };

  function entrar(login,senha,email){
    var body=new URLSearchParams();
    body.set("login",login); body.set("senha",senha);
    fetch("/api/login",{method:"POST",credentials:"same-origin",headers:cabecalho(false),body:body.toString()})
      .then(function(r){
        if(r.ok){
          /* o e-mail de recuperacao entra depois do primeiro login, ja com a sessao */
          if(!email){ location.href=destino(); return; }
          return fetch("/api/ping",{credentials:"same-origin"}).then(function(){
            return fetch("/api/perfil",{method:"PUT",credentials:"same-origin",headers:cabecalho(true),body:JSON.stringify({email:email})}); })
            .catch(function(){ return null; }).then(function(){ location.href=destino(); }); }
        return r.json().catch(function(){return {};}).then(function(j){
          b.disabled=false; pinta();
          avisa(j?.erro||"login ou senha inválidos");
          senhaEl.value=""; erroCampo("senha","Confira o login e a senha e tente de novo."); });
      })
      .catch(function(){ b.disabled=false; pinta(); avisa(FORA); });
  }

  /* esqueci a senha: com e-mail configurado manda o link; sem, explica a quem pedir */
  $("esqueci").onclick=function(){ limpaErros(f); mostra("esq");
    $("esqTexto").textContent=porEmail
      ? "Escreva o seu login ou o e-mail da conta. Se ele estiver cadastrado, chega um link para escolher uma senha nova."
      : "O envio de e-mail não está ativo. Peça à administração do Grimório para trocar a sua senha em Administração › Contas, ou fale com quem mestra a sua mesa.";
    $("esqConta").value=$("login").value; $("esqB").hidden=!porEmail; $("esqConta").parentNode.querySelector("label[for=esqConta]").hidden=!porEmail; $("esqConta").hidden=!porEmail;
    (porEmail?$("esqConta"):$("esqVolta")).focus(); };
  $("esqVolta").onclick=function(){ limpaErros($("fEsq")); mostra("f"); $("login").focus(); };
  $("fEsq").onsubmit=function(e){ e.preventDefault(); limpaErros($("fEsq"));
    var conta=$("esqConta").value.trim();
    if(!conta){ erroCampo("esqConta","Escreva o login ou o e-mail."); return; }
    $("esqB").disabled=true; $("esqB").textContent="Enviando…";
    fetch("/api/ping",{credentials:"same-origin"}).then(function(){
      return fetch("/api/publico/senha/esqueci",{method:"POST",credentials:"same-origin",headers:cabecalho(true),body:JSON.stringify({conta:conta})}); })
      .then(function(){ avisa("Se essa conta tiver e-mail cadastrado, o link chega em alguns minutos. Confira também a caixa de spam. O link vale por uma hora.","Pedido enviado",true); })
      .catch(function(){ avisa(FORA); })
      .then(function(){ $("esqB").disabled=false; $("esqB").textContent="Enviar o link"; }); };

  /* vindo do link do e-mail */
  $("fRed").onsubmit=function(e){ e.preventDefault(); limpaErros($("fRed"));
    var s1=$("redSenha").value, s2=$("redSenha2").value;
    var falta=faltaNaSenha(s1);
    if(falta.length){ erroCampo("redSenha","A senha ainda precisa de: "+falta.join(", ")+"."); return; }
    if(s1!==s2){ erroCampo("redSenha2","As duas senhas não são iguais."); return; }
    $("redB").disabled=true;
    fetch("/api/ping",{credentials:"same-origin"}).then(function(){
      return fetch("/api/publico/senha/redefinir",{method:"POST",credentials:"same-origin",headers:cabecalho(true),body:JSON.stringify({token:token,senha:s1})}); })
      .then(function(r){ return r.json().catch(function(){return {};}).then(function(j){
        $("redB").disabled=false;
        if(!r.ok){ avisa(j?.erro||"não consegui trocar a senha"); return; }
        history.replaceState({},"",location.pathname); token="";
        mostra("f"); $("login").value=j.login||""; senhaEl.focus();
        avisa("Senha trocada. Entre com a senha nova.","Pronto",true); }); })
      .catch(function(){ $("redB").disabled=false; avisa(FORA); }); };

  pinta();
  if(token){ mostra("red"); $("redSenha").focus(); } else $("login").focus();
})();
