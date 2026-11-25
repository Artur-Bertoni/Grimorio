/* Guias: o inicial de cada papel e o detalhado de cada aba. */
"use strict";

/* ---------- GUIAS ----------
   Dois niveis. O guia inicial (um por papel) passa rapido por cada aba, termina mostrando
   Configuracoes > Guias e abre sozinho na primeira entrada com aquele papel. Os guias de aba
   explicam uma tela inteira; cada um abre sozinho na primeira vez que a pessoa chega na aba
   (depois do inicial), pelo botao ? ao lado do titulo e pela lista em Configuracoes > Guias.
   Cada passo e {a: seletor, ir: troca de tela, t, x}; sem elemento, o cartao aparece no meio.
   Passo com opc:1 aponta para algo que pode nao existir (lista vazia, sessao sem cena): sem
   ele o cartao vai para o meio, e o texto foi escrito para fazer sentido assim tambem. */
var TOUR=null, GUIA_PAUSA=false;
var GUIAS_MESTRE=["m-campanha","m-sessoes","m-elenco","m-biblioteca","m-mesa","m-mapa","m-topo"];
var GUIAS_JOGADOR=["j-resumos","j-ev","j-quem","j-regras","j-fichas","j-notas","j-mural","j-mapa","j-topo"];
/* o que o guia troca de tela e devolve no fim, para a pessoa voltar para onde estava */
var GUIA_VOLTA=["view","msec","el","bib","aj","sessao","vmode","vmodeEscolhido","rail"];
function tourChave(k){ return "grim_tour_"+k+"_"+(MYID||"0"); }
/* visto fica na conta (servidor), para nao aparecer de novo em outro aparelho, e no navegador */
function tourVisto(k){
  if((EU?.toursVistos||[]).includes(k))return true;
  try{ return localStorage.getItem(tourChave(k))==="1"; }catch(error_){ return true; }
}
function marcaTourVisto(k){
  try{ localStorage.setItem(tourChave(k),"1"); }catch(error_){ console.warn(error_); }
  if(EU&&!(EU.toursVistos||[]).includes(k)){ EU.toursVistos=(EU.toursVistos||[]).concat([k]);
    api("/api/perfil",{method:"PUT",body:{tourVisto:k}}).catch(function(){ /* fica so no navegador */ }); }
}
function guiaVisto(id){ return tourVisto("guia-"+id); }
function guiaInicial(){ return GM?"inicio-m":"inicio-j"; }
function guiaLiberado(id){ return !id.endsWith("-mapa")||!mapaBloqueado(); }
function guiaInfo(id){
  var j=vmin("jogadores"), m=vmin("mestre");
  var I={
    "inicio-m":["Guia inicial do "+m,"Uma passada rápida por todas as abas."],
    "inicio-j":["Guia inicial do "+vmin("jogador"),"Uma passada rápida pelo que os "+j+" têm."],
    "m-campanha":[Vm("campanha"),"Apresentação, próxima "+vmin("sessao")+", seções e o índice dos livros."],
    "m-sessoes":[Vm("sessoes"),"A lista, o "+vmin("quadro")+", o painel, a iniciativa, liberar e encerrar."],
    "m-elenco":["Elenco","Personagens, NPCs, locais e "+vmin("evidencias")+", e o que liberar."],
    "m-biblioteca":["Biblioteca","Livros em PDF, trilha sonora e imagens."],
    "m-mesa":[Vm("mesa"),"O que os "+j+" veem: resumos, fichas, mural e o resto."],
    "m-mapa":[Vm("mapa"),vmin("tokens")+", régua, desenhos, paredes, névoa e iniciativa."],
    "m-topo":["Barra do topo","Busca, trilha, dados, rolagens, configurações e suporte."],
    "j-resumos":["Resumos","O que aconteceu em cada "+vmin("sessao")+"."],
    "j-ev":[Vm("evidencias"),"O que o grupo encontrou."],
    "j-quem":["Quem é quem","As pessoas e os lugares conhecidos."],
    "j-regras":[Vm("referencia"),"O resumo das regras da "+vmin("mesa")+"."],
    "j-fichas":[Vm("fichas"),"Criar, importar e usar a ficha no jogo."],
    "j-notas":["Minhas anotações","O caderno que só a própria pessoa lê."],
    "j-mural":["Mural","Recados para a "+vmin("mesa")+" toda."],
    "j-mapa":[Vm("mapa"),"Mover o "+vmin("token")+", medir e apontar."],
    "j-topo":["Barra do topo","Busca, dados, rolagens, configurações e suporte."]
  }[id]||[id,""];
  return {id:id,nome:I[0],desc:I[1]};
}
/* o guia da tela que esta aberta, ou null quando ela nao tem um */
function guiaDaTela(){
  if(!CID||(GM&&BOOTERR))return null;
  var id=null;
  if(GM)id={home:"m-campanha",sessoes:"m-sessoes",sessao:"m-sessoes",elenco:"m-elenco",biblioteca:"m-biblioteca",mesa:"m-mesa",mapa:"m-mapa"}[S.view]||null;
  else if(S.view==="mesa")id="j-"+S.msec;
  else if(S.view==="mapa")id="j-mapa";
  return id&&guiaInfo(id).desc&&guiaLiberado(id)?id:null;
}
/* o botao ? que mora ao lado do titulo de cada aba */
function botaoGuia(){ var id=guiaDaTela(); return id?htmlDe("t-guia-botao",guiaInfo(id)):""; }
/* a lista de Configuracoes > Guias */
function guiaItem(id){ var g=guiaInfo(id); g.visto=guiaVisto(id); return g; }
function gruposDeGuias(){
  var ab=function(l){ return l.filter(guiaLiberado).map(guiaItem); };
  if(!GM)return [{titulo:"Guia inicial",itens:[guiaItem("inicio-j")]},{titulo:"Cada aba",abas:true,itens:ab(GUIAS_JOGADOR)}];
  return [{titulo:"Guias iniciais",itens:[guiaItem("inicio-m"),guiaItem("inicio-j")]},
    {titulo:"Abas do "+vmin("mestre"),abas:true,itens:ab(GUIAS_MESTRE)},
    {titulo:"Abas dos "+vmin("jogadores"),itens:ab(GUIAS_JOGADOR)}];
}

/* Configuracoes > Guias. Os botoes [data-guia] abrem pelo clique delegado, no fim do arquivo. */
function ajusteGuias(alvo){
  alvo.innerHTML=htmlDe("t-aj-guias",{grupos:gruposDeGuias(),inicial:guiaInicial(),musica:musicaQuer(),som:somLigado()});
  $("#guiaMus",alvo).onchange=function(e){
    try{ localStorage.setItem("grim_guia_musica",e.target.checked?"1":"0"); }catch(error_){ toast("Não consegui guardar a escolha neste navegador.","erro"); }
    toast(e.target.checked?"Música dos guias ligada":"Música dos guias desligada","ok"); };
}

/* Na primeira entrada com o papel vem o guia inicial; a sugestao de tema espera ele acabar. */
function tourInicial(){
  if(!CID)return false;
  var id=guiaInicial(); if(guiaVisto(id))return false;
  setTimeout(function(){ if(CID&&!TOUR)abrirGuia(id,function(){ sugereTema(); }); },700);
  return true;
}
/* Primeira vez numa aba: o guia dela abre sozinho. So depois do inicial, nunca por cima de uma
   janela, e nao no redesenho que fecha um guia (a pessoa acabou de sair de um). */
function guiaNaTela(){
  if(GUIA_PAUSA||TOUR||!PRONTO)return;
  var id=guiaDaTela(); if(!id||guiaVisto(id)||!guiaVisto(guiaInicial()))return;
  setTimeout(function(){
    if(!TOUR&&!CAMADAS.length&&guiaDaTela()===id&&!guiaVisto(id))abrirGuia(id);
  },700);
}

/* ---------- ROTEIROS ---------- */
function tourIr(view,extra){ return function(){ S.view=view; if(extra){ extra(); } render(); }; }
function irElenco(k){ return tourIr("elenco",function(){ S.el=k; }); }
function irBiblioteca(k){ return tourIr("biblioteca",function(){ S.bib=k; }); }
function irMesa(k){ return tourIr("mesa",function(){ S.msec=k; }); }
function passosGuia(id){
  var R={"inicio-m":guiaInicioMestre,"inicio-j":guiaInicioJogador,"m-campanha":guiaCampanha,"m-sessoes":guiaSessoes,
    "m-elenco":guiaElenco,"m-biblioteca":guiaBiblioteca,"m-mesa":guiaMesaMestre,"m-mapa":guiaMapaMestre,"m-topo":guiaTopoMestre,
    "j-resumos":guiaResumos,"j-ev":guiaEvidencias,"j-quem":guiaQuem,"j-regras":guiaRegras,"j-fichas":guiaFichas,
    "j-notas":guiaNotas,"j-mural":guiaMural,"j-mapa":guiaMapaJogador,"j-topo":guiaTopoJogador}[id];
  return R?R():[];
}
/* a penultima parada dos dois guias iniciais: onde moram os guias de cada aba */
function passoGuias(){
  return {a:".guiasabas .guialista",ir:tourIr("ajustes",function(){ S.aj="guias"; }),t:"Os guias de cada aba",
    x:"Aqui, em Configurações › Guias, fica um guia para cada aba, com tudo o que ela faz. Cada um também abre sozinho na primeira vez que você entra na aba, e pelo botão ? ao lado do título."};
}
function guiaInicioMestre(){
  var j=vmin("jogadores");
  return [
    {t:"Bem-vindo à sua mesa",x:"Uma passada rápida, para não ficar completamente perdido por aqui. Use as setas do teclado ou os botões. A música de fundo se cala no botão ♪.",logo:true},
    {a:".brand",t:"Suas "+vmin("campanhas"),x:"A logo leva à lista de "+vmin("campanhas")+": criar outra (em branco, de um modelo ou de um pacote) ou entrar numa com convite."},
    {a:'#tabs [data-aba="home"]',ir:tourIr("home"),t:Vm("campanha"),x:"A página da "+vmin("campanha")+": apresentação, a próxima "+vmin("sessao")+" e as seções que você escreve."},
    {a:'#tabs [data-aba="sessoes"]',ir:tourIr("sessoes"),t:Vm("sessoes"),x:"Onde cada "+vmin("sessao")+" é preparada e conduzida: "+vmin("cenas")+" num "+vmin("quadro")+", iniciativa e o que liberar para a "+vmin("mesa")+"."},
    {a:'#tabs [data-aba="elenco"]',ir:tourIr("elenco"),t:"Elenco",x:"Personagens, NPCs, locais e "+vmin("evidencias")+", cadastrados uma vez e usados em qualquer "+vmin("sessao")+"."},
    {a:'#tabs [data-aba="biblioteca"]',ir:tourIr("biblioteca"),t:"Biblioteca",x:"Livros em PDF, trilha sonora e imagens."},
    {a:'#tabs [data-aba="mesa"]',ir:tourIr("mesa",function(){ S.msec="resumos"; }),t:Vm("mesa"),x:"Exatamente o que os "+j+" veem. Daqui você publica resumos e libera conteúdo."},
    mapaBloqueado()?null:{a:'#tabs [data-aba="mapa"]',t:Vm("mapa"),x:"Um "+vmin("mapa")+" interativo, ao vivo para a "+vmin("mesa")+": "+vmin("tokens")+", régua, paredes e névoa."},
    {a:".acts",t:"Sempre à mão",x:"No alto ficam a busca (tecla /), a trilha sonora, os dados, o painel de rolagens e as Configurações."},
    passoGuias(),
    {t:"Pronto para jogar",x:"Boa "+vmin("sessao")+"! Quando quiser os detalhes de uma aba, é só abrir o guia dela."}
  ].filter(Boolean);
}
function guiaInicioJogador(){
  var m=vmin("mestre");
  return [
    {t:"Bem-vindo à "+vmin("mesa"),x:"Uma passada rápida pelo que você tem aqui. Use as setas do teclado ou os botões. A música de fundo se cala no botão ♪.",logo:true},
    {a:".brand",t:"Suas "+vmin("campanhas"),x:"A logo mostra as "+vmin("campanhas")+" em que você está e deixa entrar numa nova com o convite do "+m+"."},
    {a:'[data-msec="resumos"]',ir:irMesa("resumos"),t:"Resumos",x:"O que aconteceu em cada "+vmin("sessao")+", escrito pelo "+m+"."},
    {a:'[data-msec="ev"]',ir:irMesa("ev"),t:Vm("evidencias"),x:"O que o grupo encontrou: documentos, objetos, imagens."},
    {a:'[data-msec="quem"]',ir:irMesa("quem"),t:"Quem é quem",x:"As pessoas e os lugares que vocês já conhecem."},
    {a:'[data-msec="regras"]',ir:irMesa("regras"),t:Vm("referencia"),x:"O resumo das regras da "+vmin("mesa")+", para consultar no meio do jogo."},
    {a:'[data-msec="fichas"]',ir:irMesa("fichas"),t:Vm("fichas"),x:"As fichas dos seus personagens. Clicar num número rola o dado."},
    {a:'[data-msec="notas"]',ir:irMesa("notas"),t:"Minhas anotações",x:"Um caderno só seu: nem o "+m+" lê."},
    {a:'[data-msec="mural"]',ir:irMesa("mural"),t:"Mural",x:"Recados que a "+vmin("mesa")+" toda vê, inclusive o "+m+"."},
    mapaBloqueado()?null:{a:'#tabs [data-aba="mapa"]',t:Vm("mapa"),x:"O "+vmin("mapa")+" que o "+m+" mostrar, com o seu "+vmin("token")+" para mover."},
    {a:".acts",t:"Sempre à mão",x:"No alto ficam a busca (tecla /), os dados, o painel de rolagens e as Configurações."},
    passoGuias(),
    {t:"Pronto para jogar",x:"Boa "+vmin("sessao")+"! Quando quiser os detalhes de uma aba, é só abrir o guia dela."}
  ].filter(Boolean);
}
function guiaCampanha(){
  var ir=tourIr("home"), c=vmin("campanha");
  return [
    {ir:ir,t:"A página da "+c,x:"É a primeira tela quando você entra. Apresenta a "+c+" e reúne o que você quer ter sempre à vista. Nada daqui chega aos "+vmin("jogadores")+": o que eles veem fica na aba "+Vm("mesa")+"."},
    {a:'[data-cp="cp-ed"]',ir:ir,t:"Nome e apresentação",x:"O lápis ao lado do título edita o nome, o sistema de regras e o texto de apresentação."},
    {a:".proxima",opc:1,ir:ir,t:"Próxima "+vmin("sessao"),x:"A primeira "+vmin("sessao")+" ainda não encerrada aparece em destaque, com o botão para abri-la direto. Ver todas leva à lista."},
    {a:'[aria-labelledby="passosT"]',opc:1,ir:ir,t:"Primeiros passos",x:"Enquanto a "+c+" está começando, uma lista mostra o que falta fazer, cada item com o botão que leva até lá. Dispensar esconde a lista."},
    {a:".seccols .sec-wrap[data-item]",opc:1,ir:ir,t:"Seções",x:"Regras da casa, método, perguntas para a "+vmin("mesa")+": as seções são suas. Cada uma pode ser texto corrido, lista de itens ou cartões com título e explicação."},
    {a:".seccols .sec-wrap[data-item] .alca",opc:1,ir:ir,t:"Mudar a ordem",x:"Arraste pelas três barrinhas. Com o foco nelas, as setas do teclado também movem, e um clique abre um menu para escolher a posição."},
    {a:".seccols .sec-wrap[data-item] .edb",opc:1,ir:ir,t:"Editar e remover",x:"O lápis abre o formulário da seção. Remover não pergunta: faz e oferece desfazer por alguns segundos. Isso vale para todo o Grimório."},
    {a:'[data-cp="sec-add"]',ir:ir,t:"Nova seção",x:"Acrescenta uma seção no fim. O tipo se escolhe no formulário."},
    {a:'[aria-labelledby="idxT"]',opc:1,ir:ir,t:"Índice dos livros",x:"Com livros na Biblioteca, aparece o índice dos capítulos. Clique numa página (P12) para abrir o PDF direto nela. O lápis edita o índice."}
  ];
}
function guiaSessoes(){
  var ir=tourIr("sessoes"), s=vmin("sessao"), cs=vmin("cenas"), j=vmin("jogadores"), tr=vmin("territorios");
  var L=[
    {ir:ir,t:Vm("sessoes"),x:"Aqui você prepara cada "+s+" antes do jogo e conduz durante: as "+cs+", o elenco que aparece, a iniciativa e o que liberar para os "+j+"."},
    {a:"#sesNova",ir:ir,t:"Nova "+s,x:"Cria a próxima "+s+", já com o número seguinte e um "+vmin("quadro")+" vazio para montar as "+cs+"."},
    {a:".eps",opc:1,ir:ir,t:"A lista",x:"Cada "+s+" mostra número, título, resumo e estado. As encerradas ficam apagadas. Clique numa para abrir: aparece o cartão de capítulo."}];
  if(!D?.sessoes?.length){
    L.push({ir:ir,t:"Abra uma "+s,x:"Crie a primeira "+s+" para ver o "+vmin("quadro")+", o painel, a iniciativa e o liberar. Depois, é só abrir este guia de novo pelo botão ?."});
    return L;
  }
  var k=Math.max(0,D.sessoes.findIndex(function(x){ return x.status!=="encerrada"; }));
  var quadro=function(){ S.view="sessao"; S.sessao=k; S.vmode="canvas"; S.vmodeEscolhido=true; S.rail=true; CV.init=false; render(); };
  var roteiro=function(){ S.view="sessao"; S.sessao=k; S.vmode="roteiro"; S.vmodeEscolhido=true; render(); };
  L.push(
    {a:"#sesEd",ir:quadro,t:"Editar a "+s,x:"Título, número, resumo e data da "+s+"."},
    {a:".cvwrap",ir:quadro,t:"O "+vmin("quadro"),x:"As "+cs+" viram cartões dentro dos "+tr+": lugares, atos, linhas da trama, como você preferir. Arraste o fundo para mover e use a roda do mouse para o zoom. No toque, um dedo move e dois dão zoom."},
    {a:".terr .card",opc:1,ir:quadro,t:"O cartão da "+vmin("cena"),x:"Mostra número, título, a faixa da trilha, quantos testes e as imagens. Clique para abrir a "+vmin("cena")+", arraste para levá-la a outro "+vmin("territorio")+" e use a caixinha para marcar como feita."},
    {a:".terr .tl",opc:1,ir:quadro,t:Vm("territorios"),x:"Cada "+vmin("territorio")+" tem nome e cor. Arraste pelo nome para mudar de lugar, use + "+vmin("cena")+" para criar uma dentro dele e o lápis para editar."},
    {a:".cvwrap .cvtools",ir:quadro,t:"Zoom e "+vmin("territorio")+" novo",x:"Aproximar, afastar, enquadrar tudo e ⬡ para criar um "+vmin("territorio")+"."},
    {a:"#railFloat",ir:quadro,t:"O painel",x:"O que não pode faltar, eventos fixos, preparação, o elenco da "+s+" e as notas. Arraste pelo título, redimensione pelo canto ou use Posição e tamanho. O botão Painel mostra e esconde."},
    {a:'#railFloat [data-rb="obrig"]',ir:quadro,t:"Não pode faltar",x:"Junta as "+cs+" e os itens marcados como obrigatórios, para nada essencial ficar para trás. Clique no número para ir à "+vmin("cena")+"."},
    {a:'#railFloat [data-rb="prep"]',ir:quadro,t:"Preparação e eventos fixos",x:"O que ter pronto, as regras que vão aparecer e os eventos que acontecem de qualquer jeito. O lápis de cada caixa edita."},
    {a:"#railFloat details.rbox:nth-of-type(4) > summary",opc:1,ir:quadro,t:"O elenco da "+s,x:"NPCs, locais e "+vmin("evidencias")+" que esta "+s+" usa. + adicionar puxa do Elenco ou cria um novo, e o ✓ ao lado de cada um libera para a "+vmin("mesa")+" na hora."},
    {a:"#iniBtn",ir:quadro,t:"Iniciativa",x:"Abre a barra da ordem: Puxar elenco (ou do "+vmin("mapa")+"), + alguém, Rolar quem falta e Próximo para passar a vez. Os "+j+" veem a ordem no topo da "+Vm("mesa")+"; NPC oculto aparece como ???."},
    {a:"#libBtn",ir:quadro,t:"Liberar para a "+vmin("mesa"),x:"Escolha o que os "+j+" passam a ver, com o que é desta "+s+" marcado. Nada é liberado sozinho. Na tela deles, o que é novo chega como uma carta virando."},
    {a:"#encBtn",ir:quadro,t:"Encerrar",x:"Marca a "+s+" como encerrada, passa as "+cs+" não feitas (com os "+tr+" delas) para a próxima e oferece escrever o resumo para os "+j+"."},
    {a:'[data-vm="roteiro"]',ir:quadro,t:Vm("quadro")+" ou "+vmin("roteiro"),x:"A mesma "+s+" em lista, uma "+vmin("cena")+" depois da outra. No celular, ela já abre assim."},
    {a:".roteiro",ir:roteiro,t:"O "+vmin("roteiro"),x:"Cada "+vmin("cena")+" abre e fecha no lugar. Arraste pelas três barrinhas para reordenar e use + "+vmin("cena")+" no fim."},
    {a:".roteiro details.scn",opc:1,ir:roteiro,t:"Os blocos da "+vmin("cena"),x:"Uma "+vmin("cena")+" é feita de blocos: leitura em voz alta, lista, quem está lá, para avançar, diálogo, segredo só seu (fica borrado até você clicar), testes, trilha e imagens. Escolha o tipo e use + bloco."},
    {ir:roteiro,t:"Durante o jogo",x:"No bloco de testes, Pedir manda o teste para a tela dos "+j+" rolarem. No bloco de trilha, um clique toca a faixa com troca suave. Com a "+vmin("cena")+" aberta numa janela, as setas passam para a anterior e a próxima"+(mapaBloqueado()?".":", e o ícone de "+vmin("mapa")+" abre o "+vmin("mapa")+" ligado a ela.")});
  return L;
}
function guiaElenco(){
  var ir=irElenco, j=vmin("jogadores");
  return [
    {ir:ir("personagens"),t:"Elenco",x:"Cadastre uma vez e use em qualquer "+vmin("sessao")+". São quatro listas: os personagens dos "+j+", NPCs, locais e "+vmin("evidencias")+"."},
    {a:"#view .mesanav",ir:ir("personagens"),t:"As quatro listas",x:"Troque de lista por aqui."},
    {a:"#elNovo",ir:ir("personagens"),t:"Criar",x:"Cria um item na lista aberta. O formulário muda conforme o tipo."},
    {a:".grid.pcs .pc",opc:1,ir:ir("personagens"),t:"Personagens",x:"Retrato (com uma segunda imagem que aparece ao passar o mouse), conceito, quem joga, etiquetas e notas. O chip do livro abre a página no PDF, e o de "+vmin("fichas")+" mostra as imagens que você anexou."},
    {a:".cadgrid .cad",opc:1,ir:ir("npcs"),t:"NPCs, locais e "+vmin("evidencias"),x:"Clique no cartão para ver em tamanho grande. O lápis edita, e é no formulário que fica o remover, com desfazer."},
    {a:".cadgrid [data-ellib]",opc:1,ir:ir("npcs"),t:"Liberar",x:"liberar põe o item na "+Vm("mesa")+" dos "+j+"; ✓ na mesa mostra que eles já veem, e outro clique tira. Também dá para liberar pelo painel da "+vmin("sessao")+" e pela aba "+Vm("mesa")+"."},
    {ir:ir("npcs"),t:"O que a "+vmin("mesa")+" sabe",x:"No NPC, \"O que a mesa pode saber\" é o texto que vai para os "+j+" quando você libera, e \"Só para você\" nunca sai daqui. Em locais e "+vmin("evidencias")+", a descrição e o texto vão para a "+vmin("mesa")+"."},
    {ir:ir("npcs"),t:"Usar nas "+vmin("sessoes"),x:"No painel de cada "+vmin("sessao")+", + adicionar puxa do Elenco quem vai aparecer. Editar aqui atualiza todas as "+vmin("sessoes")+" de uma vez."}
  ];
}
function guiaBiblioteca(){
  var ir=irBiblioteca, j=vmin("jogadores");
  return [
    {ir:ir("livros"),t:"Biblioteca",x:"Os arquivos da "+vmin("campanha")+" ficam no servidor: enviou uma vez, abre de qualquer aparelho. São três partes: livros, trilha e imagens."},
    {a:'[data-bib="livros"]',ir:ir("livros"),t:"Livros",x:"Os PDFs de regras e aventuras. A busca lê o texto deles e acha a página certa."},
    {a:"#bbUp",ir:ir("livros"),t:"Enviar",x:"Escolha um ou vários arquivos. Enviar uma pasta inteira manda tudo de uma vez."},
    {a:"#bbList",ir:ir("livros"),t:"Cada livro",x:"Renomear, Reler capítulos (refaz o índice pelo sumário do PDF), Abrir e Remover. O chip Veem / Não veem decide se os "+j+" podem abrir o livro e buscar nele."},
    {a:"#view details > summary",opc:1,ir:ir("livros"),t:"Avançado",x:"Reescanear o volume acha os arquivos grandes demais para o envio, colocados direto no servidor."},
    {a:'[data-bib="trilha"]',ir:ir("trilha"),t:Vm("trilha"),x:"Músicas e ambientes. Ao enviar uma pasta, cada subpasta vira uma categoria."},
    {a:"#bbList",ir:ir("trilha"),t:"Faixas e categorias",x:"Toque, mude a categoria ou remova cada faixa. O lápis da categoria troca o nome e a cor. Nos blocos de trilha das "+vmin("cenas")+", a faixa toca com um clique."},
    {a:'[data-bib="imagens"]',ir:ir("imagens"),t:"Imagens",x:"Retratos, "+vmin("mapas")+" e "+vmin("evidencias")+". Os "+j+" só veem as que estiverem em algo que você liberou. Clique numa para ver em tela cheia."},
    {ir:ir("imagens"),t:"Remover daqui não tem volta",x:"Diferente do resto do Grimório, remover um arquivo pede confirmação: ele sai do servidor."}
  ];
}
function guiaMesaMestre(){
  var j=vmin("jogadores");
  return [
    {ir:irMesa("resumos"),t:Vm("mesa"),x:"Esta aba mostra exatamente o que os "+j+" veem, seção por seção. É daqui que você publica os resumos e confere o que já foi liberado."},
    {a:".gmstrip",ir:irMesa("resumos"),t:"Visão do "+vmin("mestre"),x:"A faixa lembra que esta é a tela deles. Liberar conteúdo abre a mesma janela do "+vmin("quadro")+", com o elenco inteiro."},
    {a:"#view .mesanav",ir:irMesa("resumos"),t:"As seções",x:"Resumos, "+vmin("evidencias")+", quem é quem, "+vmin("referencia")+", "+vmin("fichas")+", anotações e mural. Para os "+j+", cada uma é uma aba."},
    {a:"#mAddRes",ir:irMesa("resumos"),t:"Resumos",x:"Publique o que aconteceu em cada "+vmin("sessao")+": número, título, data e texto. O lápis edita e Remover tira. Encerrar uma "+vmin("sessao")+" também oferece escrever o resumo."},
    {a:'#view [data-msec="ev"]',ir:irMesa("ev"),t:Vm("evidencias"),x:"As "+vmin("evidencias")+" que você liberou, com a imagem e o texto da mesa."},
    {a:'#view [data-msec="quem"]',ir:irMesa("quem"),t:"Quem é quem",x:"NPCs e locais liberados, com o retrato e o que a mesa pode saber de cada um."},
    {a:'#view [data-msec="regras"]',ir:irMesa("regras"),t:Vm("referencia"),x:"O resumo das regras, para consulta rápida. O lápis abre o editor, que também fica em Configurações."},
    {a:"#fxModelo",ir:irMesa("fichas"),t:Vm("fichas")+" e modelo",x:"Você vê e edita as "+vmin("fichas")+" de todo mundo. Modelo da ficha define os campos e a rolagem que as novas recebem."},
    {a:"#fxPdf",ir:irMesa("fichas"),t:"Importar de PDF",x:"O PDF é lido no navegador; com a IA configurada, ela organiza os campos, até de ficha escaneada. Funciona melhor com ficha preenchível."},
    {a:"#fxList",ir:irMesa("fichas"),t:"A ficha aberta",x:"Clicar num número rola o dado com o nome do campo e barras têm − e +. O lápis do topo edita ali mesmo: valores, rótulos, seções, campos novos e o ícone. Na ficha também se escolhe a imagem do "+vmin("token")+" e se põe o personagem num "+vmin("mapa")+" ou se liga a ela um "+vmin("token")+" já posto. Usar como modelo transforma os campos de uma ficha no modelo das próximas."},
    {a:"#mNotas",ir:irMesa("notas"),t:"Minhas anotações",x:"Um caderno só seu, guardado na sua conta."},
    {a:"#mPost",ir:irMesa("mural"),t:"Mural",x:"Recados que a "+vmin("mesa")+" toda lê. Você escreve aqui também e pode apagar qualquer recado."}
  ];
}
function guiaMapaMestre(){
  var ir=tourIr("mapa"), mp=vmin("mapa"), j=vmin("jogadores"), tk=vmin("token");
  if(!MP.lista.length)return [
    {a:"#mpNovo",ir:ir,t:"O primeiro "+mp,x:"Comece por um molde pronto (masmorra, taverna, nave…), já com paredes, móveis e "+vmin("tokens")+", por uma grade em branco ou pela imagem de um "+mp+"."},
    {ir:ir,t:"O que dá para fazer",x:vmin("tokens")+" ligados a fichas e NPCs, régua e áreas, desenhos, paredes e portas, névoa manual ou pela visão dos personagens, e iniciativa ligada ao "+vmin("turno")+". Depois de criar o primeiro, abra este guia de novo pelo botão ?."}];
  var painel=tourIr("mapa",function(){ MP.painel=true; });
  return [
    {ir:ir,t:Vm("mapa"),x:"Um tabuleiro ao vivo: imagem com grade, "+vmin("tokens")+", medição, paredes e névoa. Você prepara quantos "+vmin("mapas")+" quiser e mostra um de cada vez."},
    {a:"#mpAtiva",ir:ir,t:"Mostrar aos "+j,x:"Só o "+mp+" mostrado aparece para eles, e o chip ao lado do nome diz se veem."},
    {a:"#mpToken",ir:ir,t:"Novo "+tk,x:"Avulso, de uma ficha ou de um NPC do elenco (o de NPC nasce escondido). A vida pode ficar ligada à ficha, e cada "+tk+" pode ter um dono que o move."},
    {a:"#mpEd",ir:ir,t:"Ajustes do "+mp,x:"Imagem, grade, quanto vale cada casa, como conta a diagonal, quem move os "+vmin("tokens")+" e se dá para passar do deslocamento do "+vmin("turno")+"."},
    {a:"#mpPainel",ir:painel,t:"O painel",x:"Os "+vmin("mapas")+", as camadas, os "+vmin("tokens")+", os desenhos, as paredes e a névoa. Clicar num "+tk+" centraliza nele, e o lápis edita."},
    {a:'[data-mpf="selecionar"]',ir:ir,t:"Selecionar",x:"Arraste uma caixa para pegar vários itens; Shift soma. A seleção ganha ações no painel: trancar, esconder, frente e trás, mudar de camada e remover."},
    {a:'[data-mpf="ping"]',ir:ir,t:"Apontar",x:"Clique num ponto para todos verem onde você quer chamar atenção."},
    {a:"#mpRegua",ir:ir,t:"Régua",x:"Meça em linha reta ou pelo trajeto, ponto a ponto. As paredes contam, e o deslocamento do "+vmin("turno")+" entra na conta."},
    {a:"#mpArea",ir:ir,t:"Áreas",x:"Cone, círculo, linha ou explosão, para ver o alcance de um efeito. No painel, Fixar a área deixa o molde desenhado no "+mp+"."},
    {a:"#mpDesBtn",ir:ir,t:"Desenhar",x:"Linha, círculo, retângulo, polígono e marcação. Cor, espessura, preenchimento e se os "+j+" veem ficam em Estilo do desenho, no painel."},
    {a:'[data-mpf="parede"]',ir:ir,t:"Paredes e portas",x:"Um clique por ponto, Enter termina. Parede barra o movimento e a visão; janela, só o movimento; porta fechada, os dois. No painel, cada porta abre e fecha."},
    {a:'[data-mpf="fog"]',ir:ir,t:"Névoa",x:"No painel, escolha a névoa: nenhuma, manual (só o que você revelar) ou pela visão dos personagens, que pode lembrar o que já foi explorado. Com esta ferramenta, desenhe áreas para revelar ou cobrir."},
    {a:'[data-mpf="pincel"]',ir:ir,t:"Pincel de névoa",x:"Pinte por cima do "+mp+" para revelar ou cobrir, com diâmetro, formato e borda escolhidos no painel. Ver como os "+j+" veem confere o resultado."},
    {a:"#mpDesfaz",ir:ir,t:"Desfazer",x:"Ctrl+Z desfaz a sua última ação. Cada pessoa desfaz só o que ela mesma fez."},
    {a:"#mpMais",ir:ir,t:"Mais",x:"Encaixar na grade, o histórico de ações, novo "+vmin("turno")+", seguir a vez da iniciativa e os atalhos."},
    {a:"#mpAtalhos",ir:ir,t:"Atalhos",x:"Cada ferramenta tem uma tecla: R régua, S selecionar, W parede, N névoa… A tecla ? mostra todas, com os gestos de toque."},
    {a:"#iniBtn",opc:1,ir:ir,t:"Iniciativa no "+mp,x:"Com uma "+vmin("sessao")+" em andamento, a iniciativa abre aqui também. Puxar do "+mp+" põe na ordem quem tem "+tk+", e o deslocamento de cada um zera a cada "+vmin("turno")+"."},
    {a:"#mpCena",opc:1,ir:ir,t:Vm("mapa")+" e "+vmin("cena"),x:"Um "+mp+" pode ficar ligado a uma "+vmin("cena")+": o botão com o nome dela aparece no alto, e a "+vmin("cena")+" ganha o ícone para abrir o "+mp+"."}
  ];
}
function guiaTopoMestre(){
  var ir=tourIr("home");
  return [
    {ir:ir,a:"#btnBusca",t:"Buscar",x:"Procura de uma vez na "+vmin("campanha")+", na consulta rápida e nas páginas dos livros. Abre com / ou Ctrl+K; os filtros escolhem livros e assuntos, e Enter abre o resultado."},
    {ir:ir,a:"#btnBusca",t:"Perguntar à IA",x:"Com a chave da API configurada pela administração, a busca ganha o botão de perguntar à IA, que responde a partir dos trechos dos seus livros e cita a página. O nome dela se troca em Configurações › Aparência."},
    {ir:ir,a:"#btnTrilha",t:Vm("trilha"),x:"Toca a trilha sonora com troca suave entre faixas. O que está tocando fica no topo, com pausar, parar e repetir."},
    {ir:ir,a:"#btnDados",t:"Dados",x:"Clique num dado ou escreva a rolagem: 2d6+3, 2d20kh1 (fica o maior), 4d6dl1 (sai o menor). Quem sorteia é o servidor. Você escolhe se a "+vmin("mesa")+" vê cada rolagem sua, e Pedir teste manda um pedido aos "+vmin("jogadores")+"."},
    {ir:ir,a:"#btnRol",t:"Rolagens da "+vmin("mesa"),x:"Um painel solto com as rolagens de todo mundo e os pedidos de teste, com um campo para rolar dali. Abre, fecha, move e muda de tamanho."},
    {ir:ir,a:"#btnAjustes",t:"Configurações",x:"A "+vmin("campanha")+" (capa, tema sugerido, pacote), mesa e convites, vocabulário, "+vmin("referencia")+", busca, aparência, privacidade, guias e a sua conta."},
    {ir:ir,a:"#btnAjustes",t:"Suporte",x:"Em Configurações › Suporte: escreva o que aconteceu, e a mensagem vai para quem cuida deste Grimório. Fora de uma "+vmin("campanha")+", o link também fica no rodapé."}
  ];
}
function guiaResumos(){
  var m=vmin("mestre"), ir=irMesa("resumos");
  return [
    {a:'[data-msec="resumos"]',ir:ir,t:"Resumos",x:"O que aconteceu em cada "+vmin("sessao")+", escrito pelo "+m+", da mais nova para a mais antiga."},
    {a:".reslist",opc:1,ir:ir,t:"Abrir um resumo",x:"Clique no título para abrir e fechar. Um fica aberto de cada vez."},
    {a:"#mIni",opc:1,ir:ir,t:"Iniciativa",x:"Na hora do combate, a ordem de iniciativa aparece no topo, com quem está na vez. NPC escondido aparece como ???."},
    {ir:ir,t:"Revelações",x:"Quando o "+m+" libera algo novo, uma carta vira na sua tela e o item aparece na aba certa."}
  ];
}
function guiaEvidencias(){
  var ir=irMesa("ev");
  return [
    {a:'[data-msec="ev"]',ir:ir,t:Vm("evidencias"),x:"Tudo o que o grupo encontrou e o "+vmin("mestre")+" liberou: documentos, objetos, imagens."},
    {a:".evgrid",opc:1,ir:ir,t:"Ver de perto",x:"Clique na imagem para ver em tela cheia. Embaixo vem o que se sabe dela."},
    {a:"#btnBusca",ir:ir,t:"Procurar",x:"A busca do topo (tecla /) também acha as "+vmin("evidencias")+" pelo nome e pelo texto."}
  ];
}
function guiaQuem(){
  var ir=irMesa("quem");
  return [
    {a:'[data-msec="quem"]',ir:ir,t:"Quem é quem",x:"As pessoas e os lugares que vocês já conhecem, com o que o "+vmin("mestre")+" liberou sobre cada um."},
    {a:".qgrid",opc:1,ir:ir,t:"Pessoas",x:"O retrato e o que se sabe. Quando o "+vmin("mestre")+" revela mais, o texto muda aqui."},
    {a:".mloc",opc:1,ir:ir,t:"Lugares",x:"Clique na imagem de um lugar para ver em tela cheia."}
  ];
}
function guiaRegras(){
  var ir=irMesa("regras");
  return [
    {a:'[data-msec="regras"]',ir:ir,t:Vm("referencia"),x:"O resumo das regras que o "+vmin("mestre")+" preparou, para não travar o jogo. Em caso de dúvida, o livro manda."},
    {a:".reggrid",opc:1,ir:ir,t:"Por assunto",x:"Cada bloco reúne as regras de um assunto: testes, combate, condições, o que a "+vmin("mesa")+" usar."},
    {a:"#btnBusca",ir:ir,t:"Achar no livro",x:"A busca do topo (tecla /) procura também nas páginas dos livros que o "+vmin("mestre")+" abriu para vocês, e abre o PDF na página."}
  ];
}
function guiaFichas(){
  var ir=irMesa("fichas");
  return [
    {a:'[data-msec="fichas"]',ir:ir,t:Vm("fichas"),x:"As fichas dos seus personagens. Só você e o "+vmin("mestre")+" veem."},
    {a:"#fxNova",ir:ir,t:"Nova ficha",x:"Cria uma ficha com os campos do modelo que o "+vmin("mestre")+" definiu. Dá para ter mais de uma."},
    {a:"#fxPdf",ir:ir,t:"Importar de PDF",x:"Escolha o PDF da ficha: ele é lido no seu navegador. Funciona melhor com ficha preenchível."},
    {a:"#fxList",ir:ir,t:"Usar a ficha",x:"Clique numa ficha para abrir. Número rola o dado com o nome do campo, barras de vida têm − e +, e caixas marcam condições. O lápis edita na própria ficha, com o ícone do personagem, e dali você põe o seu "+vmin("token")+" no "+vmin("mapa")+" aberto."},
    {ir:ir,t:"Os campos",x:"Texto curto, número (clicar rola), barra com atual e máximo, texto longo e caixa de marcar, organizados em seções."}
  ];
}
function guiaNotas(){
  var ir=irMesa("notas");
  return [
    {a:'[data-msec="notas"]',ir:ir,t:"Minhas anotações",x:"Um caderno só seu. Fica guardado na sua conta, e nem o "+vmin("mestre")+" consegue ler."},
    {a:"#mNotas",ir:ir,t:"Escrever",x:"Teorias, nomes, pistas soltas. Puxe o canto da caixa para deixar do tamanho que quiser."},
    {a:"#mNotaSave",ir:ir,t:"Salvar",x:"Grava na conta, e o aviso ao lado confirma. Tamanho padrão devolve a caixa ao tamanho original."}
  ];
}
function guiaMural(){
  var ir=irMesa("mural");
  return [
    {a:'[data-msec="mural"]',ir:ir,t:"Mural",x:"Recados que a "+vmin("mesa")+" toda lê, inclusive o "+vmin("mestre")+": teorias, perguntas, lembretes para a próxima "+vmin("sessao")+"."},
    {a:"#mPost",ir:ir,t:"Escrever",x:"Escreva e use Publicar. Quebra de linha vale."},
    {a:"#mural",ir:ir,t:"Os recados",x:"Cada recado mostra quem escreveu e quando. Você apaga os seus; o "+vmin("mestre")+" pode apagar qualquer um."}
  ];
}
function guiaMapaJogador(){
  var ir=tourIr("mapa"), mp=vmin("mapa"), m=vmin("mestre");
  if(!MP.lista.some(function(x){ return x.ativo; }))return [
    {a:'#tabs [data-aba="mapa"]',ir:ir,t:Vm("mapa"),x:"O "+m+" ainda não mostrou nenhum "+mp+". Quando mostrar, ele aparece aqui sozinho, e você move o seu "+vmin("token")+", mede distâncias e aponta lugares para a "+vmin("mesa")+"."}];
  return [
    {a:'#tabs [data-aba="mapa"]',ir:ir,t:Vm("mapa"),x:"O "+mp+" que o "+m+" mostrar aparece aqui sozinho, ao vivo. Você só vê o que o seu personagem enxerga."},
    {ir:ir,t:"Mover o seu "+vmin("token"),x:"Arraste o seu "+vmin("token")+". Se for preciso esperar a vez, ou se o deslocamento do "+vmin("turno")+" acabar, a tela avisa. A roda do mouse dá zoom e o botão do meio arrasta o fundo; no toque, dois dedos."},
    {a:"#mpPainelBtn",ir:ir,t:"O painel",x:"A lista dos "+vmin("tokens")+" à vista. Clicar num centraliza; o seu tem a marca Seu e o lápis para editar."},
    {a:'[data-mpf="ping"]',ir:ir,t:"Apontar",x:"Clique num ponto para a "+vmin("mesa")+" toda ver onde você quer chamar atenção."},
    {a:"#mpRegua",ir:ir,t:"Régua",x:"Meça em linha reta ou pelo trajeto, ponto a ponto."},
    {a:"#mpArea",ir:ir,t:"Áreas",x:"Cone, círculo, linha ou explosão, para ver o alcance de um efeito."},
    {a:"#mpDesfaz",ir:ir,t:"Desfazer",x:"Ctrl+Z desfaz o seu último movimento."},
    {a:"#mpMais",ir:ir,t:"Mais",x:"O histórico das suas ações, seguir a vez da iniciativa e os atalhos, que também abrem com a tecla ?."}
  ];
}
function guiaTopoJogador(){
  var ir=irMesa("resumos");
  var m=vmin("mestre");
  return [
    {ir:ir,a:"#btnBusca",t:"Buscar",x:"Procura nos resumos, "+vmin("evidencias")+", pessoas e lugares liberados e nas páginas dos livros que o "+m+" abriu para vocês. Abre com / ou Ctrl+K."},
    {ir:ir,a:"#btnDados",t:"Dados",x:"Clique num dado ou escreva a rolagem: 2d6+3, 2d20kh1 (fica o maior), 4d6dl1 (sai o menor). Quem sorteia é o servidor, e o "+m+" decide se a "+vmin("mesa")+" vê as suas rolagens."},
    {ir:ir,a:"#btnRol",t:"Rolagens da "+vmin("mesa"),x:"Um painel solto com as rolagens que você pode ver e os pedidos de teste. Abre, fecha, move e muda de tamanho."},
    {ir:ir,t:"Pedidos de teste",x:"Quando o "+m+" pedir um teste, aparece um aviso no topo com o botão Rolar, e o resultado vai direto para ele."},
    {ir:ir,a:"#btnAjustes",t:"Configurações",x:"O tema da página (o sugerido pelo "+m+" vem marcado), sons e animações, privacidade, os guias e a sua conta."},
    {ir:ir,a:"#btnAjustes",t:"Suporte",x:"Em Configurações › Suporte: escreva o que aconteceu, e a mensagem vai para quem cuida deste Grimório. Fora de uma "+vmin("campanha")+", o link também fica no rodapé."}
  ];
}

/* ---------- O CARTAO ---------- */
/* a lista de mapas decide o que os guias dizem do mapa: le antes de montar os passos */
function abrirGuia(id,fim){
  fecharTour(true);
  if(!CID)return;
  if(mapaBloqueado())return iniciaTour(id,fim);
  mpCarregaLista().then(function(){ iniciaTour(id,fim); },function(){ MP.lista=[]; iniciaTour(id,fim); });
}
function iniciaTour(id,fim){
  fecharTour(true);
  $$("#layer .ov").forEach(function(o){ if(o.close)o.close(); });
  var passos=passosGuia(id), nome=guiaInfo(id).nome, i=0;
  if(!passos.length)return;
  var volta={}; GUIA_VOLTA.forEach(function(k){ volta[k]=S[k]; });
  var d=el("div",{"class":"tour",role:"dialog","aria-modal":"true","aria-labelledby":"tourTit","aria-describedby":"tourTx"});
  d.innerHTML=htmlDe("t-tour",{logo:logoCss(""),nome:nome});
  document.body.appendChild(d);
  var foco=$(".tourfoco",d), card=$(".tourcard",d), vez=0, bm=$('[data-t="musica"]',card);
  TOUR={el:d,id:id,fim:fim,volta:volta};
  function pintaMusica(){ var on=musicaQuer(); bm.hidden=!somLigado(); bm.classList.toggle("on",on); bm.setAttribute("aria-pressed",String(on)); }
  pintaMusica(); musicaToca();
  function alvo(){ var s=passos[i], e=s.a?$(s.a):null;
    if(!e)return null;
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
    if(s.ir){ try{ s.ir(); }catch(error_){ /* falha aqui nao muda o que a pessoa ve */ } }
    $(".tourn",card).textContent=nome+" · "+(i+1)+" de "+passos.length;
    $(".tourtit",card).textContent=s.t; $("#tourTx",card).textContent=s.x;
    card.classList.toggle("comlogo",!!s.logo);
    $(".tourdots",card).innerHTML=htmlDe("t-tour-pontos",{total:passos.length,atual:i});
    $('[data-t="volta"]',card).disabled=(i===0);
    $('[data-t="vai"]',card).textContent=(i===passos.length-1)?"Concluir":"Próximo ›";
    card.classList.remove("entra"); card.getBoundingClientRect(); card.classList.add("entra");
    d.dataset.falta="…";
    /* espera a tela nova montar antes de procurar o elemento e rolar ate ele */
    setTimeout(function(){
      if(minha!==vez)return;
      var e=alvo();
      /* no quadro da sessao quem anda e o quadro, nao a pagina: o cartao pode estar atras do painel */
      if(e&&!quadroMostra(e)){ var r=e.getBoundingClientRect();
        if(r.top<60||r.bottom>window.innerHeight-20)e.scrollIntoView({block:"center"}); }
      posiciona();
      d.dataset.falta=(s.a&&!e&&!s.opc)?s.a:"";
    },s.ir?420:40);
    som("abre");
    /* o foco vai para o Proximo: Enter e Espaco acionam o botao focado, nada mais */
    focar($('[data-t="vai"]',card));
  }
  function anda(n){ if(n<0&&i>0){ i--; mostra(); } else if(n>0){ if(i<passos.length-1){ i++; mostra(); } else fecharTour(); } }
  $$("[data-t]",card).forEach(function(b){ b.onclick=function(){ var t=b.dataset.t;
    if(t==="pula")fecharTour();
    else if(t==="musica"){ musicaGrava(!musicaQuer()); pintaMusica(); }
    else anda(t==="vai"?1:-1); }; });
  /* o guia segura o teclado: nenhum atalho da pagina (busca com /, Esc das janelas) passa por baixo */
  TOUR.k=function(e){
    if(e.key==="Tab"){ var fs=focaveis(card), k=fs.indexOf(document.activeElement);
      if(e.shiftKey&&k<=0){ e.preventDefault(); focar(fs.at(-1)); }
      else if(!e.shiftKey&&k===fs.length-1){ e.preventDefault(); focar(fs[0]); }
      return; }
    if(e.key==="Enter"||e.key===" ")return;
    e.stopPropagation();
    if(e.key==="Escape"){ e.preventDefault(); fecharTour(); }
    else if(e.key==="ArrowRight"){ e.preventDefault(); anda(1); }
    else if(e.key==="ArrowLeft"){ e.preventDefault(); anda(-1); } };
  TOUR.rz=function(){ posiciona(); };
  document.addEventListener("keydown",TOUR.k,true);
  window.addEventListener("resize",TOUR.rz); window.addEventListener("scroll",TOUR.rz,true);
  mostra();
}
function fecharTour(silencio){
  if(!TOUR)return;
  var t=TOUR; TOUR=null;
  marcaTourVisto("guia-"+t.id);
  musicaPara();
  document.removeEventListener("keydown",t.k,true);
  window.removeEventListener("resize",t.rz); window.removeEventListener("scroll",t.rz,true);
  t.el.remove();
  if(silencio)return;
  /* volta para onde a pessoa estava: o guia pode ter trocado de tela varias vezes */
  GUIA_VOLTA.forEach(function(k){ S[k]=t.volta[k]; });
  GUIA_PAUSA=true;
  try{ render(); } finally { GUIA_PAUSA=false; }
  if(t.fim)t.fim();
}
/* o botao ? das abas e a lista de Configuracoes > Guias */
document.addEventListener("click",function(e){
  var b=e.target.closest?.("[data-guia]"); if(!b||TOUR)return;
  e.preventDefault(); abrirGuia(b.dataset.guia);
});
