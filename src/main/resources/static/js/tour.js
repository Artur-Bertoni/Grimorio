/* Tour guiado do mestre e do jogador. */
"use strict";

/* ---------- TOUR GUIADO ----------
   Um por papel, na primeira vez que a pessoa entra numa campanha com aquele papel. Fica em
   Configurações > Tour guiado para rever. Cada passo pode mudar de tela (ir) antes de apontar
   para um elemento (a); sem elemento, o cartao aparece no meio. */
var TOUR=null;
function tourChave(p){ return "grim_tour_"+p+"_"+(MYID||"0"); }
function tourVisto(p){ try{ return localStorage.getItem(tourChave(p))==="1"; }catch(e){ return true; } }
function tourInicial(){
  if(!CID)return false;
  var p=GM?"mestre":"jogador"; if(tourVisto(p))return false;
  setTimeout(function(){ if(CID&&!TOUR)iniciarTour(p,function(){ sugereTema(); }); },700);
  return true;
}
function tourIr(view,extra){ return function(){ S.view=view; if(extra)extra(); render(); }; }
function passosTour(p){
  var m=vmin("mestre"), j=vmin("jogadores"), L=[];
  var fim={t:"Pronto para jogar",x:"Esse foi o Grimório inteiro. Para rever, é só ir em Configurações › Tour guiado. Boa sessão!"};
  if(p==="mestre"){
    L.push({t:"Bem-vindo à sua mesa",x:"Este tour mostra todas as partes do Grimório, uma de cada vez. Use as setas do teclado ou os botões. Dá para pular agora e rever quando quiser em Configurações.",logo:true});
    L.push({a:".brand",t:"Suas "+vmin("campanhas"),x:"Clique na logo para voltar à lista de "+vmin("campanhas")+": criar outra, importar um pacote pronto ou entrar numa com convite."});
    L.push({a:"#tabs .tab:nth-child(1)",ir:tourIr("home"),t:Vm("campanha"),x:"A página da "+vmin("campanha")+": apresentação, a próxima "+vmin("sessao")+" e as seções que você escreve, como regras da casa, método e perguntas para a mesa."});
    L.push({a:".seccols .sec-wrap",ir:tourIr("home"),t:"Tudo se edita por formulário",x:"Cada bloco tem editar e setas para mudar a ordem. Remover não pergunta: faz e oferece desfazer por alguns segundos."});
    L.push({a:"#tabs .tab:nth-child(2)",ir:tourIr("sessoes"),t:Vm("sessoes"),x:"A lista das "+vmin("sessoes")+". Cada uma tem "+vmin("cenas")+" organizadas em "+vmin("territorios")+" e os nomes do elenco que ela usa."});
    L.push({a:"#sesNova",ir:tourIr("sessoes"),t:"Nova "+vmin("sessao"),x:"Crie a próxima "+vmin("sessao")+" aqui. Ao abrir uma, aparece o cartão de capítulo."});
    if(D&&D.sessoes&&D.sessoes.length){
      var abre=function(){ S.view="sessao"; S.sessao=0; S.vmode="canvas"; S.rail=true; CV.init=false; render(); };
      L.push({a:".cvwrap",ir:abre,t:"O "+vmin("quadro"),x:"As "+vmin("cenas")+" viram cartões dentro dos "+vmin("territorios")+". Arraste para reorganizar, use a roda do mouse para o zoom e clique numa "+vmin("cena")+" para abrir os blocos dela."});
      L.push({a:"#railFloat",ir:abre,t:"O painel",x:"O que não pode faltar, eventos fixos, preparação, NPCs, locais e notas da "+vmin("sessao")+". Arraste pelo título e redimensione pelo canto."});
      L.push({a:"#iniBtn",ir:abre,t:"Iniciativa",x:"Puxe o elenco, role quem falta e passe a vez. Os "+j+" veem a ordem; NPC entra com o nome escondido."});
      L.push({a:"#libBtn",ir:abre,t:"Liberar para a "+vmin("mesa"),x:"Escolha o que os "+j+" passam a ver: NPCs, locais e "+vmin("evidencias")+". Na tela deles, o que é novo chega como uma carta virando."});
      L.push({a:"#encBtn",ir:abre,t:"Encerrar",x:"Marca a "+vmin("sessao")+" como encerrada, passa as "+vmin("cenas")+" pendentes para a próxima e oferece escrever o resumo."});
      L.push({a:'[data-vm="roteiro"]',ir:abre,t:Vm("roteiro"),x:"A mesma "+vmin("sessao")+" em lista. Nos blocos de testes há o botão pedir: o pedido aparece na tela dos "+j+" para eles rolarem."});
    }
    L.push({a:"#tabs .tab:nth-child(3)",ir:tourIr("elenco"),t:"Elenco",x:"Personagens, NPCs, locais e "+vmin("evidencias")+" cadastrados uma vez e usados em qualquer "+vmin("sessao")+". O botão liberar coloca na "+vmin("mesa")+"."});
    L.push({a:"#tabs .tab:nth-child(4)",ir:tourIr("biblioteca"),t:"Biblioteca",x:"Livros em PDF (a busca acha a página certa), a trilha sonora e as imagens da "+vmin("campanha")+"."});
    L.push({a:"#tabs .tab:nth-child(5)",ir:tourIr("mesa",function(){ S.msec="resumos"; }),t:Vm("mesa"),x:"Exatamente o que os "+j+" veem: resumos, "+vmin("evidencias")+", quem é quem, consulta rápida, fichas e mural."});
    L.push({a:"#mLib",ir:tourIr("mesa",function(){ S.msec="resumos"; }),t:"Liberar daqui também",x:"O mesmo liberar do "+vmin("quadro")+", com o elenco inteiro."});
    L.push({a:'[data-msec="fichas"]',ir:tourIr("mesa",function(){ S.msec="fichas"; }),t:Vm("fichas"),x:"Você vê as fichas de todo mundo. Dá para importar de PDF, até escaneado se a IA estiver configurada, e definir o modelo de ficha da "+vmin("campanha")+". Clicar num número da ficha rola o dado."});
  } else {
    L.push({t:"Bem-vindo à "+vmin("mesa"),x:"Este tour mostra tudo que você tem aqui, uma parte de cada vez. Use as setas do teclado ou os botões. Dá para pular agora e rever em Configurações.",logo:true});
    L.push({a:".brand",t:"Suas "+vmin("campanhas"),x:"Clique na logo para ver as "+vmin("campanhas")+" em que você está ou entrar numa nova com o convite do "+m+"."});
    var sec=function(k){ return tourIr("mesa",function(){ S.msec=k; }); };
    L.push({a:".mesanav",ir:sec("resumos"),t:"A "+vmin("mesa"),x:"Tudo que o "+m+" liberar aparece aqui, separado por abas."});
    L.push({a:'[data-msec="resumos"]',ir:sec("resumos"),t:"Resumos",x:"O que aconteceu em cada "+vmin("sessao")+", da mais nova para a mais antiga. Abra uma de cada vez."});
    L.push({a:'[data-msec="ev"]',ir:sec("ev"),t:Vm("evidencias"),x:"O que vocês encontraram. Clique na imagem para ver grande."});
    L.push({a:'[data-msec="quem"]',ir:sec("quem"),t:"Quem é quem",x:"As pessoas e os lugares que vocês conhecem."});
    L.push({a:'[data-msec="regras"]',ir:sec("regras"),t:Vm("referencia"),x:"O resumo das regras da "+vmin("mesa")+", para não travar o jogo."});
    L.push({a:'[data-msec="fichas"]',ir:sec("fichas"),t:Vm("fichas"),x:"Suas fichas: crie do zero ou importe de PDF. Barras de vida têm − e +, e clicar num número rola o dado com o nome do campo. Só você e o "+m+" veem."});
    L.push({a:'[data-msec="notas"]',ir:sec("notas"),t:"Minhas anotações",x:"Só você lê, nem o "+m+". Puxe o canto da caixa para deixar do tamanho que quiser."});
    L.push({a:'[data-msec="mural"]',ir:sec("mural"),t:"Mural",x:"Recados que a "+vmin("mesa")+" toda vê, inclusive o "+m+"."});
  }
  L.push({a:"#btnBusca",t:"Buscar",x:"Procura na "+vmin("campanha")+" e nos livros, com a tecla / de qualquer lugar. Com a IA configurada, dá para perguntar sobre as regras."});
  if(p==="mestre")L.push({a:"#btnTrilha",t:Vm("trilha"),x:"Toca a trilha sonora com troca suave entre faixas. O que está tocando fica no topo."});
  L.push({a:"#btnDados",t:"Dados",x:"Clique num dado ou escreva a rolagem: 2d6+3, 2d20kh1 (fica o maior), 4d6dl1 (sai o menor). Quem sorteia é o servidor."
    +(p==="mestre"?" Você escolhe se a mesa toda vê cada rolagem sua, e pode pedir um teste aos "+j+".":" O "+m+" decide se a mesa vê as suas rolagens.")});
  L.push({a:"#btnRol",t:"Rolagens da "+vmin("mesa"),x:"Um painel solto com as rolagens de todo mundo e os pedidos de teste. Abre, fecha, move e muda de tamanho."});
  if(p!=="mestre")L.push({t:"Pedidos e revelações",x:"Quando o "+m+" pedir um teste, aparece um aviso no topo com o botão Rolar. Quando ele liberar algo novo, a carta vira na sua tela. Na hora do combate, a ordem de iniciativa aparece no topo da "+vmin("mesa")+"."});
  L.push({a:"#rdSup",t:"Suporte",x:"No rodapé de qualquer página: escreva o que aconteceu e a mensagem vai para quem cuida deste Grimório."});
  L.push({a:"#btnAjustes",t:"Configurações",x:(p==="mestre"
    ?"A "+vmin("campanha")+" (capa, tema sugerido, pacote), convites e a regra das rolagens, vocabulário, consulta rápida, busca, aparência e conta."
    :"O tema da página (o sugerido pelo "+m+" vem marcado), os sons, as animações e a sua conta.")+" O tour e o contato com o suporte também ficam aqui."});
  L.push(fim);
  return L;
}
function iniciarTour(p,fim){
  fecharTour(true);
  $$("#layer .ov").forEach(function(o){ if(o.close)o.close(); });
  var passos=passosTour(p), i=0, d=el("div",{"class":"tour",role:"dialog","aria-modal":"true","aria-label":"Tour guiado"});
  d.innerHTML=htmlDe("t-tour",{logo:logoCss("")});
  document.body.appendChild(d);
  var foco=$(".tourfoco",d), card=$(".tourcard",d), vez=0;
  TOUR={el:d,p:p,fim:fim};
  function alvo(){ var s=passos[i]; if(!s.a)return null; var e=$(s.a); if(!e)return null;
    var r=e.getBoundingClientRect(); return (r.width||r.height)?e:null; }
  function posiciona(){
    if(!TOUR||TOUR.el!==d)return;
    var e=alvo();
    if(!e){ d.classList.add("centro"); return; }
    d.classList.remove("centro");
    var r=e.getBoundingClientRect(), W=window.innerWidth, H=window.innerHeight, m=6;
    var fx=Math.max(4,r.left-m), fy=Math.max(4,r.top-m), fw=Math.min(W-fx-4,r.width+2*m), fh=Math.min(H-fy-4,r.height+2*m);
    foco.style.left=fx+"px"; foco.style.top=fy+"px"; foco.style.width=fw+"px"; foco.style.height=fh+"px";
    var cw=card.offsetWidth, ch=card.offsetHeight, g=14, top;
    if(fy+fh+g+ch<=H-8)top=fy+fh+g; else if(fy-g-ch>=8)top=fy-g-ch; else top=Math.max(8,H-ch-8);
    card.style.left=Math.min(Math.max(8,fx+fw/2-cw/2),W-cw-8)+"px"; card.style.top=top+"px";
  }
  function mostra(){
    var s=passos[i], minha=++vez;
    if(s.ir){ try{ s.ir(); }catch(x){} }
    $(".tourn",card).textContent=(i+1)+" de "+passos.length;
    $("h4",card).textContent=s.t; $("p",card).textContent=s.x;
    card.classList.toggle("comlogo",!!s.logo);
    $(".tourdots",card).innerHTML=htmlDe("t-tour-pontos",{total:passos.length,atual:i});
    $('[data-t="volta"]',card).disabled=(i===0);
    $('[data-t="vai"]',card).textContent=(i===passos.length-1)?"Concluir":"Próximo ›";
    card.classList.remove("entra"); void card.offsetWidth; card.classList.add("entra");
    d.setAttribute("data-falta","…");
    /* espera a tela nova montar antes de procurar o elemento e rolar ate ele */
    setTimeout(function(){
      if(minha!==vez)return;
      var e=alvo();
      if(e){ var r=e.getBoundingClientRect();
        if(r.top<60||r.bottom>window.innerHeight-20)e.scrollIntoView({block:"center"}); }
      posiciona();
      d.setAttribute("data-falta",(s.a&&!e)?s.a:"");
    },s.ir?420:40);
    som("abre");
  }
  function anda(n){ if(n<0&&i>0){ i--; mostra(); } else if(n>0){ if(i<passos.length-1){ i++; mostra(); } else fecharTour(); } }
  $$("[data-t]",card).forEach(function(b){ b.onclick=function(){ var t=b.getAttribute("data-t");
    if(t==="pula")fecharTour(); else anda(t==="vai"?1:-1); }; });
  /* o tour segura o teclado: nenhum atalho da pagina (busca com /, Esc das janelas) passa por baixo */
  TOUR.k=function(e){ if(e.key==="Tab")return; e.stopPropagation();
    if(e.key==="Escape"){ e.preventDefault(); fecharTour(); }
    else if(e.key==="ArrowRight"||e.key==="Enter"){ e.preventDefault(); anda(1); }
    else if(e.key==="ArrowLeft"){ e.preventDefault(); anda(-1); } };
  TOUR.rz=function(){ posiciona(); };
  document.addEventListener("keydown",TOUR.k,true);
  window.addEventListener("resize",TOUR.rz); window.addEventListener("scroll",TOUR.rz,true);
  mostra();
}
function fecharTour(silencio){
  if(!TOUR)return;
  var t=TOUR; TOUR=null;
  try{ localStorage.setItem(tourChave(t.p),"1"); }catch(e){}
  document.removeEventListener("keydown",t.k,true);
  window.removeEventListener("resize",t.rz); window.removeEventListener("scroll",t.rz,true);
  t.el.remove();
  if(silencio)return;
  /* volta para a tela de partida, que o tour pode ter trocado varias vezes */
  S.view=GM?"home":"mesa"; if(!GM)S.msec="resumos"; render();
  if(t.fim)t.fim();
}
