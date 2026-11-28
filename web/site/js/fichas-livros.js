/* Ficha pelos livros: um esboco de ficha tirado do texto dos PDFs que a campanha ja indexou (o mesmo
   indice da busca, que o mestre recebe inteiro), sem IA e sem rota nova no servidor.

   Duas leituras, guiadas pelos termos da campanha (D.campanha.fichaBusca, editaveis; sem eles vale
   FL_PADRAO, termos gerais de RPG em portugues e ingles, de nenhum sistema):
   - "termos": campos com nome conhecido (vida, defesa, iniciativa). Cada campo e uma lista de
     sinonimos; entra quando aparece em paginas suficientes, com o nome mais usado pelo livro.
   - "lista": o que o livro enumera depois de um titulo (Atributos, Pericias). Le o bloco de linhas
     curtas logo abaixo do titulo, ou a frase com dois-pontos ("os atributos sao: ..."). Nome que se
     repete em varias paginas pesa mais; o padrao "Acrobacia (Agi)" reforca a pericia e liga a sigla
     ao atributo que comeca com ela.
   O mestre confere tudo na previa antes de aplicar: e um esboco, nao uma leitura certa. */
"use strict";

var FL_PADRAO={
  grupos:[
    {sec:"Identidade",tipo:"texto",modo:"termos",termos:"Conceito / Concept; Classe / Class; Origem / Antecedente / Origin / Background; Ancestralidade / Raça / Ancestry / Race; Nível / Level"},
    {sec:"Atributos",tipo:"num",modo:"lista",termos:"Atributos; Características; Attributes; Ability scores; Abilities"},
    {sec:"Recursos",tipo:"barra",modo:"termos",termos:"Pontos de vida / PV / Vida / Hit points / HP; Pontos de mana / PM / Mana / MP; Pontos de esforço / Energia / PE; Sorte / Luck"},
    {sec:"Combate",tipo:"num",modo:"termos",termos:"Defesa / Defense; Classe de armadura / CA / Armor class / AC; Iniciativa / Initiative; Deslocamento / Movimento / Speed; Esquiva / Dodge; Bloqueio / Block"},
    {sec:"Perícias",tipo:"num",modo:"lista",termos:"Perícias; Skills; Proficiências; Proficiencies"}
  ],
  ficha:"Ficha de personagem; Ficha do personagem; Character sheet",
  ignorar:"Capítulo; Tabela; Página; Exemplo; Exemplos; Nota; Veja; Regras; Introdução; Índice; Sumário; Teste; Testes; Ação; Ações; Total; Valor; Bônus; Chapter; Table; Page; Example; Note; See; Rules; Introduction; Index; Contents; Bonus"
};
var FL_MIN_PAGINAS=3;      /* um campo por nome entra quando aparece em pelo menos tantas paginas */
var FL_MAX_LISTA=30;       /* teto de itens por lista: depois disso e ruido */

function flTermos(){ var b=D?.campanha?.fichaBusca; return b&&Array.isArray(b.grupos)?b:FL_PADRAO; }
function flParte(s,sep){ return String(s||"").split(sep).map(function(x){ return x.trim(); }).filter(Boolean); }
function flEsc(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,String.raw`\$&`); }
/* sigla curta em maiusculas (PV, HP, CA) casa so assim no texto original; o resto casa sem acento e sem caixa */
function flSigla(s){ return /^[A-Z]{2,4}$/.test(s); }
function flTitulo(s){ return s.toLowerCase().replace(/(^|\s)(\S)/g,function(m,a,b){ return a+b.toUpperCase(); }); }

/* o texto de cada pagina, uma vez so: original e sem acento */
function flPaginas(idx){
  var ab={}; (idx.docs||[]).forEach(function(d){ ab[d.id]=d.abrev||d.id; });
  return (idx.pages||[]).map(function(p){ var t=String(p.t||""); return {d:p.d,p:p.p,s:p.s||"",t:t,n:norm(t),ab:String(ab[p.d]||p.d||"").toUpperCase()}; });
}
function flOnde(pg){ return pg.ab+" p. "+pg.p; }

/* ---------- campos por nome ---------- */
function flContaTermo(pgs,termo){
  var re=flSigla(termo)?new RegExp("(^|[^A-Za-zÀ-ÿ])"+flEsc(termo)+"(?![A-Za-zÀ-ÿ])"):new RegExp("(^|[^a-z0-9])"+flEsc(norm(termo))+"(?![a-z0-9])");
  var achadas=[];
  pgs.forEach(function(pg){ if(re.test(flSigla(termo)?pg.t:pg.n)){ achadas.push(pg); } });
  return achadas;
}
function flCamposPorNome(pgs,g,daFicha){
  var out=[];
  flParte(g.termos,";").forEach(function(campo){
    var sins=flParte(campo,"/"), melhor=null, sigla=null, todas={};
    sins.forEach(function(s){
      var ach=flContaTermo(pgs,s);
      ach.forEach(function(pg){ todas[pg.d+":"+pg.p]=pg; });
      if(flSigla(s)){ if(ach.length>=FL_MIN_PAGINAS&&(!sigla||ach.length>sigla.n)){ sigla={s:s,n:ach.length}; } }
      else if(ach.length&&(!melhor||ach.length>melhor.n)){ melhor={s:s,n:ach.length,pg:ach[0]}; }
    });
    var lista=Object.keys(todas).map(function(k){ return todas[k]; });
    var naFicha=lista.some(function(pg){ return daFicha[pg.d+":"+pg.p]; });
    if(lista.length<FL_MIN_PAGINAS&&!naFicha){ return; }
    var rot=melhor?melhor.s:(sigla?sigla.s:sins[0]);
    if(melhor&&sigla&&norm(sigla.s)!==norm(melhor.s)){ rot+=" ("+sigla.s+")"; }
    rot=rot.charAt(0).toUpperCase()+rot.slice(1);
    out.push({rot:rot,tipo:g.tipo,n:lista.length,onde:flOnde(melhor?.pg||lista[0])+(lista.length>1?" e mais "+(lista.length-1):"")});
  });
  return out;
}

/* ---------- listas que o livro enumera ---------- */
/* Um pedaco de linha vira candidato a item: curto, com maiuscula, sem numero no meio. A sigla entre
   parenteses no fim ("Acrobacia (Agi)") sai separada. */
var FL_RABO=" \t.:…·•|*+-–—/0123456789";
/* tira do fim pontilhado, numero e separador ("Força ....... 2"); laco simples, sem regex que volta atras */
function flAparaFim(x){ var n=x.length; while(n>0&&FL_RABO.includes(x.charAt(n-1))){ n--; } return x.slice(0,n); }
function flCandidato(x,ign){
  x=flAparaFim(String(x||"").replace(/^[\s•·\-–—*▪●○◦►✦|]+/,"").replace(/^\d+[.)-]?\s+/,"")).trim();
  var abr="", ab=x.lastIndexOf("(");
  if(x.endsWith(")")&&ab>0&&x.length-ab-2>=1&&x.length-ab-2<=12){ abr=x.slice(ab+1,-1).trim(); x=x.slice(0,ab).trim(); }
  if(x.length<3||x.length>28||/[0-9:;!?=@#%&"“”]/.test(x)){ return null; }
  if(!/^[A-ZÀ-Ý]/.test(x)){ return null; }
  var ws=x.split(/\s+/);
  if(ws.length>3){ return null; }
  if(x===x.toUpperCase()){ x=flTitulo(x); }
  if(ign[norm(x)]){ return null; }
  return {nome:x,abr:abr};
}
function flPedacos(linha){ return linha.split(/\t|\s{3,}|[,;•·|]/).map(function(x){ return x.trim(); }).filter(Boolean); }
/* "Os atributos são: Força, Agilidade e Vigor." (a frase pode seguir na linha de baixo) */
function flListaNaFrase(ls,i,dois,ign){
  var bruto=ls[i].slice(dois+1);
  if(!ls[i].includes(".",dois)&&ls[i+1]){ bruto+=" "+ls[i+1]; }
  bruto=bruto.replace(/\s+/g," ").split(". ")[0];
  return bruto.split(/[,;]/)
    .flatMap(function(x){ return x.split(/ (?:e|and|ou|or) /); })
    .map(function(x){ return flCandidato(x,ign); }).filter(Boolean);
}
/* titulo de bloco: os itens vem nas linhas de baixo, ate a prosa voltar ou tres linhas sem item */
function flListaEmBloco(ls,i,ign){
  var bloco=[], erros=0;
  for(var j=i+1;j<Math.min(ls.length,i+40)&&erros<3;j++){
    var lj=ls[j].trim();
    if(!lj){ continue; }
    if(lj.length>90&&bloco.length){ break; }
    var ps=flPedacos(lj).map(function(x){ return flCandidato(x,ign); }).filter(Boolean);
    if(ps.length){ bloco=bloco.concat(ps); erros=0; } else { erros++; }
  }
  return bloco;
}
/* o que uma linha com o gatilho rende: a lista da frase (peso 2) ou a do bloco abaixo do titulo */
function flListaDaLinha(ls,i,gs,ign){
  var ln=norm(ls[i]).replace(/\s+/g," ").trim();
  var g=gs.find(function(x){ return ln.includes(x); });
  if(!g){ return null; }
  var pos=ln.indexOf(g), dois=ln.indexOf(":",pos);
  if(dois>0){
    var itens=flListaNaFrase(ls,i,dois,ign);
    if(itens.length>=3){ return {itens:itens,peso:2}; }
  }
  if(ln.length>40||pos>3){ return null; }
  var bloco=flListaEmBloco(ls,i,ign);
  return bloco.length>=3?{itens:bloco,peso:1}:null;
}
function flListas(pgs,gatilhos,ign,daFicha){
  var cand={}, gs=gatilhos.map(function(x){ return norm(x); });
  function soma(c,pg,peso){
    var k=norm(c.nome), o=cand[k], chave=pg.d+":"+pg.p;
    if(!o){ o={nome:c.nome,n:0,pags:{},pg:pg,abr:""}; cand[k]=o; }
    if(!o.pags[chave]){ o.pags[chave]=1; o.n+=peso+(daFicha[chave]?1:0); }
    if(c.abr&&!o.abr){ o.abr=c.abr; }
  }
  pgs.forEach(function(pg){
    var ls=pg.t.split("\n");
    for(var i=0;i<ls.length;i++){
      var r=flListaDaLinha(ls,i,gs,ign);
      if(r){ r.itens.forEach(function(c){ soma(c,pg,r.peso+(r.peso===1&&c.abr?1:0)); }); }
    }
  });
  return cand;
}
/* "Acrobacia (Agi)" no texto inteiro: o nome ganha peso como item de lista e a sigla, como atributo */
function flSiglas(pgs){
  var nomes={}, siglas={}, re=/([A-ZÀ-Ý][a-zà-ÿ]+(?: [a-zà-ÿ]+)?(?: [A-ZÀ-Ý][a-zà-ÿ]+)?)\s\(([A-ZÀ-Ý][a-zà-ÿ]{1,3}|[A-Z]{2,4})\)/g;
  pgs.forEach(function(pg){
    var m; re.lastIndex=0;
    while((m=re.exec(pg.t))){ nomes[norm(m[1])]=(nomes[norm(m[1])]||0)+1; siglas[m[2]]=(siglas[m[2]]||0)+1; }
  });
  return {nomes:nomes,siglas:Object.keys(siglas).filter(function(s){ return siglas[s]>=FL_MIN_PAGINAS; })};
}

/* ---------- a rolagem que os livros mais usam ---------- */
function flFormula(pgs){
  var dados={}, combos={}, re=/(^|[^a-z0-9])(\d{0,2})d(4|6|8|10|12|20|100|%)(?![a-z0-9])/gi;
  pgs.forEach(function(pg){ var m; re.lastIndex=0; while((m=re.exec(pg.t))){ var f=m[3]==="%"?"100":m[3]; dados[f]=(dados[f]||0)+1; var k=(m[2]||"1")+"d"+f; combos[k]=(combos[k]||0)+1; } });
  var top=Object.keys(dados).sort(function(a,b){ return dados[b]-dados[a]; })[0];
  if(!top){ return {formula:fichaFormula(),dica:"Os livros não trazem notação de dado; ficou a rolagem de agora."}; }
  var f={"20":"1d20+{v}","100":"1d100","10":"{v}d10","12":"1d12+{v}","8":"1d8+{v}","4":"1d4+{v}"}[top];
  if(top==="6"){ f=(combos["2d6"]||0)>=(combos["3d6"]||0)?((combos["2d6"]||0)>(combos["1d6"]||0)?"2d6+{v}":"{v}d6"):"3d6"; }
  return {formula:f,dica:"O d"+top+" aparece "+dados[top]+" vezes nos livros. {v} vira o valor do campo; ajuste ao jeito do sistema."};
}

/* ---------- a leitura inteira ---------- */
function flAnalisa(idx){
  var pgs=flPaginas(idx), b=flTermos();
  var ign={}; flParte(b.ignorar,";").forEach(function(x){ ign[norm(x)]=1; });
  b.grupos.forEach(function(g){ flParte(g.termos,";").forEach(function(c){ flParte(c,"/").forEach(function(s){ ign[norm(s)]=1; }); }); if(g.sec){ ign[norm(g.sec)]=1; } });
  var daFicha={}, nomesFicha=flParte(b.ficha,";").map(function(x){ return norm(x); });
  pgs.forEach(function(pg){ var s=norm(pg.s); if(nomesFicha.some(function(f){ return pg.n.includes(f)||s.includes(f); })){ daFicha[pg.d+":"+pg.p]=1; } });
  var sg=flSiglas(pgs), listas=[], secoes=[];
  b.grupos.forEach(function(g,gi){
    var sec={sec:g.sec||"Geral",campos:[]};
    secoes.push(sec);
    if(g.modo==="lista"){ listas.push({gi:gi,cand:flListas(pgs,flParte(g.termos,";"),ign,daFicha),g:g}); }
    else { sec.campos=flCamposPorNome(pgs,g,daFicha); }
  });
  /* a sigla que aparece entre parenteses aponta para o atributo que comeca com ela: reforca a primeira lista que o tem */
  listas.forEach(function(l){
    Object.keys(l.cand).forEach(function(k){
      var o=l.cand[k];
      if(sg.nomes[k]){ o.n+=1; }
      if(sg.siglas.some(function(s){ return k.startsWith(norm(s)); })){ o.n+=2; }
    });
  });
  /* o mesmo nome em duas listas fica so onde pesou mais */
  var dono={};
  listas.forEach(function(l){ Object.keys(l.cand).forEach(function(k){ if(!dono[k]||l.cand[k].n>dono[k].n){ dono[k]={n:l.cand[k].n,gi:l.gi}; } }); });
  listas.forEach(function(l){
    secoes[l.gi].campos=Object.keys(l.cand).map(function(k){ return l.cand[k]; })
      .filter(function(o){ return o.n>=2&&dono[norm(o.nome)].gi===l.gi; })
      .sort(function(a,b2){ return b2.n-a.n||a.nome.localeCompare(b2.nome); })
      .slice(0,FL_MAX_LISTA)
      .sort(function(a,b2){ return a.nome.localeCompare(b2.nome); })
      .map(function(o){ var n=Object.keys(o.pags).length; return {rot:o.nome,tipo:l.g.tipo,n:n,onde:flOnde(o.pg)+(n>1?" e mais "+(n-1):"")}; });
  });
  /* o que toda ficha tem e nenhum livro enumera: equipamento e anotacoes (os mesmos do modelo padrao) */
  var livres=FICHA_PADRAO.filter(function(x){ return x.tipo==="area"; });
  if(livres.length){ secoes.push({sec:"Anotações",campos:livres.map(function(x){ return {rot:x.rot,tipo:x.tipo,n:0,onde:"",sec:x.sec}; })}); }
  var fr=flFormula(pgs), livros={};
  pgs.forEach(function(pg){ livros[pg.d]=1; });
  return {secoes:secoes.filter(function(s){ return s.campos.length; }),formula:fr.formula,dica:fr.dica,paginas:pgs.length,livros:Object.keys(livros).length};
}

/* ---------- a tela ---------- */
function abrirFichaLivros(){
  toast("Lendo os livros da "+vmin("campanha")+"…");
  carregaIndice().then(function(idx){
    if(!idx?.pages?.length){
      toast("Nenhum livro com texto nesta "+vmin("campanha")+". Envie os PDFs de regras na Biblioteca e tente de novo.","aviso");
      return;
    }
    /* deixa o aviso aparecer antes da leitura, que segura a tela num livro grande */
    setTimeout(function(){ mostraFichaLivros(flAnalisa(idx)); },30);
  }).catch(function(e){ toast(mensagemDeErro(e),"erro"); });
}
function mostraFichaLivros(r){
  var todos=[];
  var secoes=r.secoes.map(function(s){ return {sec:s.sec,campos:s.campos.map(function(c){
    var i=todos.length; todos.push({sec:c.sec||s.sec,rot:c.rot,tipo:c.tipo});
    return {i:i,rot:c.rot,onde:c.onde,tipoRot:(FICHA_TIPOS.find(function(t){ return t[0]===c.tipo; })||["",""])[1],on:true}; })}; });
  var ov=overlay(Vm("ficha")+" pelos livros",htmlDe("t-ficha-livros",{secoes:secoes,paginas:r.paginas,livros:r.livros,formula:r.formula,dica:r.dica}),{wide:true});
  function escolhidos(){
    return $$("[data-fl]",ov).filter(function(x){ return x.checked; }).map(function(x){ return todos[+x.dataset.fl]; });
  }
  var bm=$("#flModelo",ov);
  if(bm){ bm.onclick=function(){
    var cs=escolhidos();
    if(!cs.length){ toast("Marque pelo menos um campo.","aviso"); return; }
    var antes={m:MESA.fichaModelo,f:MESA.fichaFormula};
    MESA.fichaModelo=cs.map(function(x){ return {sec:x.sec,rot:x.rot,tipo:x.tipo}; });
    MESA.fichaFormula=String($("#flFormula",ov).value||"").trim();
    salvarMesa();
    toastAcao("Modelo trocado: "+cs.length+" campos. As "+vmin("fichas")+" que já existem não mudam.","Desfazer",function(){
      MESA.fichaModelo=antes.m; MESA.fichaFormula=antes.f; salvarMesa(); toast("Desfeito","ok"); });
  }; }
  var bf=$("#flFicha",ov);
  if(bf){ bf.onclick=function(){
    var cs=escolhidos();
    if(!cs.length){ toast("Marque pelo menos um campo.","aviso"); return; }
    ov.close();
    criaFicha("Novo "+vmin("personagem"),cs.map(function(x){ return fichaCampoLimpo(x); }),true);
  }; }
  $("#flTermos",ov).onclick=function(){ ov.close(); flEditaTermos(); };
}
function flEditaTermos(){
  var b=flTermos();
  var copia={grupos:b.grupos.map(function(g){ return {sec:g.sec,tipo:g.tipo,modo:g.modo,termos:g.termos}; }),ficha:b.ficha||"",ignorar:b.ignorar||""};
  formulario("Termos da "+vmin("ficha")+" pelos livros",[
    {k:"grupos",rot:"Seções",tipo:"grupo",um:"seção",novo:function(){ return {sec:"",tipo:"texto",modo:"termos",termos:""}; },campos:[
      {k:"sec",rot:"Seção da "+vmin("ficha")},
      {k:"tipo",rot:"Tipo dos campos",tipo:"sel",ops:FICHA_TIPOS},
      {k:"modo",rot:"Como achar",tipo:"sel",ops:[["termos","Campos com estes nomes"],["lista","A lista depois destes títulos"]]},
      {k:"termos",rot:"Termos",dica:"Separe com ponto e vírgula. Nos campos por nome, os sinônimos vão com barra: Pontos de vida / PV / HP."}]},
    {k:"ficha",rot:"Como os livros chamam a "+vmin("ficha"),dica:"As páginas com estes nomes pesam mais. Separe com ponto e vírgula."},
    {k:"ignorar",rot:"Palavras que nunca são campo",tipo:"area",dica:"Títulos e palavras comuns que aparecem em lista mas não são campo. Separe com ponto e vírgula."}
  ],copia,{wide:true,back:abrirFichaLivros,rotSalvar:"Salvar e ler de novo",salvar:function(c){
    D.campanha.fichaBusca={grupos:(c.grupos||[]).map(function(g){
      return {sec:String(g.sec||"").trim().slice(0,60),tipo:FICHA_TIPOS.some(function(t){ return t[0]===g.tipo; })?g.tipo:"texto",
        modo:g.modo==="lista"?"lista":"termos",termos:String(g.termos||"").trim().slice(0,2000)}; }).filter(function(g){ return g.termos; }),
      ficha:String(c.ficha||"").trim().slice(0,500),ignorar:String(c.ignorar||"").trim().slice(0,4000)};
    save();
    abrirFichaLivros();
  }});
}
