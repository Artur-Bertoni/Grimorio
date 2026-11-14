/* Minha conta. */
"use strict";

/* ---------- MINHA CONTA ---------- */
/* a mesma regra do servidor (UsuarioService.validaSenha) e da tela de cadastro */
function faltaNaSenha(s){ var f=[];
  if(s.length<6)f.push("6 caracteres ou mais"); if(!/\p{L}/u.test(s))f.push("uma letra");
  if(!/\d/.test(s))f.push("um número"); if(!/[^\p{L}\d\s]/u.test(s))f.push("um caractere especial");
  return f; }
function abrirConta(back,mk){
  var ov=(mk||overlay)("Minha conta",htmlDe("t-conta",{login:(EU&&EU.login)||"?",nome:(EU&&EU.nome)||""}),{back:back});

  ["#cnAtual","#cnNova","#cnNova2"].forEach(function(s){ campoSecreto($(s,ov)); });
  function atualizaSessao(){
    return api("/api/sessao").then(function(s2){
      EU=s2; ADMIN=!!s2.admin; CAMPANHAS=s2.campanhas||[];
    });
  }
  $("#cnNomeOk",ov).onclick=function(){
    var b=$("#cnNomeOk",ov), nome=($("#cnNome",ov).value||"").trim();
    if(!nome){ toast("Escreva um nome"); return; }
    b.disabled=true;
    api("/api/perfil",{method:"PUT",body:{nome:nome}})
      .then(atualizaSessao).then(function(){ b.disabled=false; toast("Nome salvo"); })
      .catch(function(e){ b.disabled=false; toast((e&&e.message)||"não deu"); });
  };
  $("#cnSenhaOk",ov).onclick=function(){
    var b=$("#cnSenhaOk",ov);
    var at=$("#cnAtual",ov).value||"", nv=$("#cnNova",ov).value||"", n2=$("#cnNova2",ov).value||"";
    var falta=faltaNaSenha(nv);
    if(falta.length){ toast("A senha nova precisa de: "+falta.join(", ")); return; }
    if(nv!==n2){ toast("As duas senhas novas não batem"); return; }
    b.disabled=true;
    api("/api/perfil",{method:"PUT",body:{senhaAtual:at,senhaNova:nv}})
      .then(function(){
        b.disabled=false;
        /* a nova passa a ser a atual: os campos continuam preenchidos, sempre em bolinhas */
        $("#cnAtual",ov).value=nv;
        toast("Senha trocada");
      })
      .catch(function(e){ b.disabled=false; toast((e&&e.message)||"não deu"); });
  };
}
