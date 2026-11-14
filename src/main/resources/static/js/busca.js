/* Busca na campanha e nos livros, e pergunta a IA. */
"use strict";

/* ---------- BUSCA ---------- */
var IDX=null,IDXp=null,BUSCA={q:"",aba:"campanha",fdoc:"todos",fcat:"tudo"};
function carregaIndice(){ if(IDX)return Promise.resolve(IDX); if(IDXp)return IDXp;
  IDXp=api(cAPI("/indice")).then(function(j){
    j=j||{}; IDX={docs:(j.docs||[]).slice(),pages:(j.pages||[]).slice()};
    invalidaIndice(); return IDX;})
    .catch(function(){IDX={docs:[],pages:[]};return IDX;}); return IDXp; }
function recarregaIndice(){ IDX=null; IDXp=null; invalidaIndice(); return carregaIndice(); }
function catsBusca(){ return [{id:"tudo",nome:"Tudo",termos:null}].concat((PUBD().categoriasBusca||[]).map(function(c,i){
  return {id:"c"+i,nome:c.nome,termos:(c.termos||[]).map(function(t){return norm(t).trim();}).filter(Boolean)}; })); }
function trecho(t,q){ var n=norm(t),k=norm(q),i=n.indexOf(k); if(i<0)return "";
  var a=Math.max(0,i-70),b=Math.min(t.length,i+k.length+110);
  return (a>0?"…":"")+t.slice(a,b).replace(/\s+/g," ")+(b<t.length?"…":""); }
/* O texto com o termo buscado destacado em <mark>. norm() preserva o tamanho, entao a
   posicao achada no texto normalizado vale no original. */
function partesMarca(s,q){ var k=norm(q), partes=[];
  if(k){ var t=norm(s),p=0,i=t.indexOf(k);
    while(i>=0){ partes.push({t:s.slice(p,i)},{t:s.slice(i,i+k.length),m:true}); p=i+k.length; i=t.indexOf(k,p); }
    s=s.slice(p); }
  partes.push({t:s});
  return partes; }
function marca(s,q){ return htmlDe("t-marcado",{partes:partesMarca(s,q)}); }
function textoCena(c){ var p=[c.titulo];
  (c.blocos||[]).forEach(function(b){
    if(b.texto)p.push(b.texto); if(b.nota)p.push(b.nota);
    (b.itens||[]).forEach(function(x){ if(typeof x==="string")p.push(x);
      else p.push([x.t,x.motiva,x.quem,x.fala,x.p,x.sit,x.faixa].filter(Boolean).join(" ")+" "+((x.sub||[]).join(" "))+" "+((x.f||[]).join(" "))); });
  }); return p.join(" · "); }
function buscaMesa(q){ var r=[],k=norm(q); if(!k)return r;
  (MESA.resumos||[]).forEach(function(x){ if(norm(x.titulo+" "+x.texto).indexOf(k)>=0)
    r.push({src:"Resumo",ti:"Sessão "+x.n+" · "+(x.titulo||""),sub:x.data||"",sn:trecho(x.texto||"",q),
      go:function(){S.view="mesa";S.msec="resumos";render();}}); });
  (MESA.ev||[]).forEach(function(x){ if(norm(x.nome+" "+(x.texto||"")).indexOf(k)>=0)
    r.push({src:"Evidência",ti:x.nome,sub:"",sn:trecho(x.texto||"",q)||(x.texto||"").slice(0,110),
      go:function(){S.view="mesa";S.msec="ev";render();}}); });
  (MESA.npcs||[]).forEach(function(x){ if(norm(x.nome+" "+(x.desc||"")).indexOf(k)>=0)
    r.push({src:"Pessoa",ti:x.nome,sub:"",sn:x.desc||"",go:function(){S.view="mesa";S.msec="quem";render();}}); });
  (MESA.locais||[]).forEach(function(x){ if(norm(x.nome+" "+(x.desc||"")).indexOf(k)>=0)
    r.push({src:"Lugar",ti:x.nome,sub:"",sn:x.desc||"",go:function(){S.view="mesa";S.msec="quem";render();}}); });
  return r; }
function buscaCampanha(q){ if(!GM)return buscaMesa(q); var r=buscaMesa(q),k=norm(q); if(!k)return r;
  if(!D.campanha)return r;
  D.elenco.personagens.forEach(function(p){
    if(norm([p.nome,p.subtitulo,p.jogador,p.etiquetas,p.notas].join(" ")).indexOf(k)>=0)
      r.push({src:Vm("personagem"),ti:p.nome,sub:p.subtitulo||"",sn:p.etiquetas||p.notas||"",
        go:function(){S.view="elenco";S.el="personagens";render();}}); });
  ["npcs","locais","pistas"].forEach(function(tp){ D.elenco[tp].forEach(function(x){
    var t=String(x.desc||x.texto||"");
    if(norm([x.nome,t,x.segredo||""].join(" ")).indexOf(k)>=0)
      r.push({src:Vm(EL[tp].voc),ti:x.nome,sub:"Elenco",sn:trecho(t,q)||t.slice(0,110),
        go:function(){abrirItem(tp,x,voltarBusca);}}); }); });
  D.sessoes.forEach(function(s,si){
    s.cenas.forEach(function(c){ var blob=textoCena(c);
      if(norm(blob).indexOf(k)>=0) r.push({src:"S"+s.numero,ti:c.n+" · "+c.titulo,sub:terr(s,c.territorio).nome,
        sn:trecho(blob,q),go:function(){S.view="sessao";S.sessao=si;irCena(c.id);}}); }); });
  (D.campanha.secoes||[]).forEach(function(s){
    var blob=[s.titulo,s.texto].concat((s.itens||[]).map(function(x){
      return typeof x==="string"?x:((x.t||"")+" "+(x.d||""));})).join(" · ");
    if(norm(blob).indexOf(k)>=0)
      r.push({src:Vm("campanha"),ti:s.titulo,sub:"seção",sn:trecho(blob,q),go:function(){S.view="home";render();}}); });
  (D.campanha.indiceAS||[]).forEach(function(d){ (d.grupos||[]).forEach(function(g){
    function chk(o,path){ if(o.p&&norm(o.t).indexOf(k)>=0)
      r.push({src:d.doc,ti:o.t,sub:path,sn:"Índice · página "+o.p,go:function(){abrirPdf(d.doc,o.p,voltarBusca);}}); }
    chk(g,d.nome); (g.itens||[]).forEach(function(it){chk(it,d.nome+" · "+g.t);(it.sub||[]).forEach(function(s2){chk(s2,d.nome+" · "+it.t);});});
  });});
  return r; }

/* ---------- indice de busca: tokens + fallback ---------- */
var IDXN=null;
function invalidaIndice(){ IDXN=null; }
function prepararIndice(){
  if(IDXN||!IDX||!IDX.pages)return IDXN;
  var pg=[],sq=[],tok={},i,j;
  for(i=0;i<IDX.pages.length;i++){
    var t=norm(IDX.pages[i].t||"");
    pg.push(t); sq.push(t.replace(/[^a-z0-9]+/g,""));
    var ws=t.split(/[^a-z0-9]+/), vis={};
    for(j=0;j<ws.length;j++){ var w=ws[j];
      if(w.length<2||vis[w])continue; vis[w]=1;
      (tok[w]||(tok[w]=[])).push(i); }
  }
  IDXN={pg:pg,sq:sq,tok:tok,keys:Object.keys(tok)};
  return IDXN;
}
function defineTermo(txt,t){
  try{ return new RegExp("(^|[.\\n;:»])\\s*"+t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\s*[.:•]\\s+[a-zà-ÿA-Z(\"]","i").test(txt); }catch(e){ return false; }
}
function buscaDocs(q,fd,fc){
  if(!IDX||!IDX.pages||!IDX.pages.length)return [];
  var N=prepararIndice(); if(!N)return [];
  var k=norm(q).trim(); if(k.length<2)return [];
  var termos=k.split(/\s+/).filter(function(x){return x.length>=2;});
  if(!termos.length)return [];
  var cat=catsBusca().filter(function(c){return c.id===fc;})[0], ab={};
  IDX.docs.forEach(function(d){ab[d.id]=d.abrev;});

  var SIN=(PUBD().sinonimos||{});
  function mapaDe(t,peso){
    var m={},w,key;
    if(N.tok[t])N.tok[t].forEach(function(i){ m[i]=peso; });
    if(t.length>=4){
      for(w=0;w<N.keys.length;w++){ key=N.keys[w];
        if(key.length>t.length&&key.indexOf(t)===0)
          N.tok[key].forEach(function(i){ if(!m[i])m[i]=Math.round(peso*0.65); }); }
    }
    if(!Object.keys(m).length){
      var sqt=t.replace(/[^a-z0-9]+/g,"");
      if(sqt.length>=4)for(w=0;w<N.sq.length;w++) if(N.sq[w].indexOf(sqt)>=0)m[w]=Math.round(peso*0.35);
    }
    return m;
  }
  var alt=SIN[k]||null;
  var frases=[]; if(termos.length>1)frases.push(termos.join(" "));
  (alt||[]).forEach(function(sy){ var f=norm(sy); if(f.indexOf(" ")>0)frases.push(f); });
  termos.forEach(function(t){ (SIN[t]||[]).forEach(function(sy){ var f=norm(sy); if(f.indexOf(" ")>0&&frases.indexOf(f)<0)frases.push(f); }); });
  var mapas=termos.map(function(t){
    var m=mapaDe(t,t.length<=3?8:14);
    var ex=(alt&&termos.length===1)?alt:(SIN[t]||[]);
    ex.forEach(function(sy){
      var sub=norm(sy).split(/\s+/), mm=null;
      sub.forEach(function(st){ var x=mapaDe(st,7);
        if(mm===null)mm=x; else { var u={}; Object.keys(x).forEach(function(i){ if(mm[i]!=null)u[i]=Math.min(mm[i],x[i]); }); mm=u; } });
      if(mm)Object.keys(mm).forEach(function(i){ if(m[i]==null)m[i]=mm[i]; });
    });
    return m;
  });

  var base=Object.keys(mapas[0]), out=[];
  base.forEach(function(ix){
    var i=+ix, sc=0, ok=true;
    for(var z=0;z<mapas.length;z++){ if(mapas[z][i]==null){ok=false;break;} sc+=mapas[z][i]; }
    if(!ok)return;
    var pgo=IDX.pages[i];
    if(fd&&fd!=="todos"&&pgo.d!==fd)return;
    var txt=N.pg[i], sec=norm(pgo.s||"");
    /* indice extraido pelo servidor nao tem titulo de secao: o comeco da pagina faz as vezes */
    if(cat&&cat.termos&&!cat.termos.some(function(t){return sec.indexOf(t)>=0||txt.slice(0,260).indexOf(t)>=0;}))return;
    var emTit=0; termos.forEach(function(t){ if(sec.indexOf(t)>=0)emTit++; });
    if(emTit===termos.length)sc+=70; else if(emTit)sc+=32;
    var pos=txt.indexOf(termos[0]);
    if(pos>=0&&pos<320)sc+=20;
    else if(pos>=0&&txt.length&&pos<txt.length*0.15)sc+=10;
    var n=0,pp=txt.indexOf(termos[0]);
    while(pp>=0&&n<6){n++;pp=txt.indexOf(termos[0],pp+termos[0].length);}
    sc+=Math.min(4,n-1)*2;
    if(defineTermo(txt,termos[0]))sc+=70;
    var fr=0;
    for(var fi=0;fi<frases.length;fi++){ var fp=txt.indexOf(frases[fi]);
      if(fp>=0){ fr=Math.max(fr,55); if(fp<320)fr=Math.max(fr,75); if(defineTermo(txt,frases[fi]))fr=Math.max(fr,95); } }
    sc+=fr;
    if(!fr&&termos.length>1){
      var a=txt.indexOf(termos[0]), b2=txt.indexOf(termos[1]);
      if(a>=0&&b2>=0&&Math.abs(a-b2)<120)sc+=20;
    }
    if(/indice remissivo|sumario|creditos|folha de rosto|sobrecapa/.test(sec))sc-=120;
    out.push({sc:sc,i:i,d:pgo.d,p:pgo.p,s:pgo.s,sn:trecho(pgo.t,termos[0])||String(pgo.t||"").replace(/\s+/g," ").slice(0,150),ab:ab[pgo.d]||pgo.d});
  });
  out.sort(function(a,b){return b.sc-a.sc;});

  var CAN=(PUBD().canonicas||{}), fix=CAN[k];
  if(fix&&fix.length){
    var pin=[],vistos={};
    fix.forEach(function(e){
      var abv=String(e[0]).toUpperCase(), num=e[1], rot=e[2]||"";
      if(fd&&fd!=="todos"&&String(ab[fd]||"").toUpperCase()!==abv)return;
      for(var i=0;i<IDX.pages.length;i++){ var pgo=IDX.pages[i];
        if(pgo.p!==num)continue;
        if(String(ab[pgo.d]||pgo.d).toUpperCase()!==abv)continue;
        var ch=abv+":"+num; if(vistos[ch])return; vistos[ch]=1;
        pin.push({sc:9999,i:i,d:pgo.d,p:num,s:rot||pgo.s,ab:abv,canon:true,
          sn:trecho(pgo.t,termos[0])||String(pgo.t||"").replace(/\s+/g," ").slice(0,150)});
        return; }
    });
    if(pin.length){
      var fora={}; pin.forEach(function(x){fora[x.ab+":"+x.p]=1;});
      out=pin.concat(out.filter(function(x){return !fora[x.ab+":"+x.p];}));
    }
  }
  return out.slice(0,50);
}

/* ---------- leitor de pagina (texto extraido) ---------- */
function paginaDe(doc,num){
  if(!IDX||!IDX.pages)return null;
  for(var i=0;i<IDX.pages.length;i++){ var p2=IDX.pages[i];
    if(p2.p===num&&(p2.d===doc||(p2.d||"").toUpperCase()===String(doc).toUpperCase()))return p2; }
  return null;
}
function docIdPorAbrev(ab){ var r=null;
  (IDX&&IDX.docs||[]).forEach(function(d){ if((d.abrev||"").toUpperCase()===String(ab).toUpperCase())r=d.id; });
  return r||ab; }
function abrirResultado(ab,num,q,back){
  var abv=String(ab).toUpperCase();
  if(LIB.ok&&LIB.docs[abv]){ abrirPdf(abv,num,back); return; }
  abrirPagina(ab,num,q,back);
}
function abrirPagina(ab,num,q,back){
  var did=docIdPorAbrev(ab), pg=paginaDe(did,num);
  if(!pg){ abrirPdf(ab,num,back); return; }
  var temPdf=!!(LIB.ok&&LIB.docs[String(ab).toUpperCase()]);
  var paragrafos=String(pg.t||"").replace(/­/g,"").split(/\n{2,}/).map(function(b){
    return partesMarca(b.replace(/\s*\n\s*/g," "),q||""); });
  var ov=overlay(pg.s||"Página "+num,htmlDe("t-pagina-texto",{paragrafos:paragrafos,temPdf:temPdf}),
    {wide:true,cls:"pgsheet",back:back,head:htmlDe("t-pagina-cabeca",{ref:refDoc(ab,num)})});
  var pp=$("#pgPrev",ov); if(pp)pp.onclick=function(){ ov.close(); abrirPagina(ab,num-1,q,back); };
  var pn=$("#pgNext",ov); if(pn)pn.onclick=function(){ ov.close(); abrirPagina(ab,num+1,q,back); };
  var kp=function(e){ if(!document.body.contains(ov)){document.removeEventListener("keydown",kp);return;}
    if(e.target&&(e.target.isContentEditable||/input|textarea|select/i.test(e.target.tagName)))return;
    if(e.key==="ArrowLeft"){e.preventDefault();ov.close();abrirPagina(ab,num-1,q,back);}
    else if(e.key==="ArrowRight"){e.preventDefault();ov.close();abrirPagina(ab,num+1,q,back);} };
  document.addEventListener("keydown",kp);
  var pf=$("#pgPdf",ov); if(pf)pf.onclick=function(){ ov.close(); abrirPdf(String(ab).toUpperCase(),num,function(){abrirPagina(ab,num,q,back);}); };
}

/* ---------- perguntar a IA (pelo servidor) ---------- */
var SAMPLE;
function temSample(){ return Promise.resolve(IACFG?true:null); }

function paraHtml(t){ return htmlDe("t-paragrafos",{paragrafos:String(t||"").split(/\n{2,}/).map(function(b){ return b.split("\n"); })}); }
function perguntarClaude(q,trechos,back){
  var ov=overlay(iaNome()+" · "+q,htmlDe("t-ia-lendo"),{wide:true,back:back});
  var corpo={pergunta:q,
    sistema:(GM&&D&&D.campanha&&D.campanha.sistema)||MESA.sistema||"",
    campanha:tituloApp(),
    trechos:(trechos||[]).slice(0,12).map(function(x){
      return {livro:nomeDoc(x.ab),pagina:x.p,secao:x.s||"",texto:String(x.t||"").slice(0,6000)}; })};
  api(cAPI("/ia"),{method:"POST",body:corpo}).then(function(r){
    var m=$("#aiTxt",ov); if(!m)return;
    m.innerHTML=htmlDe("t-ia-resposta",{texto:paraHtml(r&&r.texto),ia:iaNome(),comTrechos:!!(trechos&&trechos.length)});
  }).catch(function(e){
    var m=$("#aiTxt",ov); if(!m)return;
    var msg=(e&&e.message)||"Não deu certo";
    m.innerHTML=htmlDe("t-ia-erro",{msg:msg,admin:!!ADMIN});
    var b=$("#aiCfg",ov); if(b)b.onclick=function(){ ov.close(); abrirAdmin(); };
  });
}

/* ---------- BUSCA UNIFICADA ---------- */
function voltarBusca(){ abrirBusca(); }
function abrirBusca(){
  var ov=overlay("Buscar",htmlDe("t-busca",{q:BUSCA.q}),{wide:true});
  var inp=$("#bq",ov);
  var SEL=-1;
  function ritens(){ return $$(".rit",$("#br",ov)); }
  function selMark(){ var L=ritens(); L.forEach(function(b,i){b.classList.toggle("sel",i===SEL);});
    if(SEL>=0&&L[SEL]&&L[SEL].scrollIntoView)L[SEL].scrollIntoView({block:"nearest"}); }
  function selInit(){ SEL=ritens().length?0:-1; selMark(); }
  function selMov(d){ var L=ritens(); if(!L.length)return;
    SEL=(SEL<0?(d>0?-1:0):SEL)+d; if(SEL<0)SEL=L.length-1; if(SEL>=L.length)SEL=0; selMark(); }
  ov.addEventListener("keydown",function(e){
    if(e.key==="ArrowDown"){e.preventDefault();selMov(1);}
    else if(e.key==="ArrowUp"){e.preventDefault();selMov(-1);}
    else if(e.key==="Enter"){ var L=ritens(), b=L[SEL>=0?SEL:0]; if(b){e.preventDefault();b.click();} } });
  $("#br",ov).addEventListener("pointerover",function(e){
    var b=e.target.closest&&e.target.closest(".rit"); if(!b)return;
    var L=ritens(), i=L.indexOf(b); if(i>=0&&i!==SEL){SEL=i;L.forEach(function(x,j){x.classList.toggle("sel",j===SEL);});} });

  function filtros(){ var f=$("#bf",ov);
    var ds=(IDX&&IDX.docs)||[];
    if(!ds.length){f.innerHTML="";return;}
    var cs=catsBusca(); if(!cs.some(function(c){return c.id===BUSCA.fcat;}))BUSCA.fcat="tudo";
    f.innerHTML=htmlDe("t-busca-filtros",{todos:BUSCA.fdoc==="todos",
      livros:ds.map(function(d){ return {id:d.id,nome:d.nome||d.abrev,on:BUSCA.fdoc===d.id}; }),
      assuntos:cs.map(function(c){ return {id:c.id,nome:c.nome,on:BUSCA.fcat===c.id}; })});
    $$("[data-fd]",f).forEach(function(b){b.onclick=function(){BUSCA.fdoc=b.getAttribute("data-fd");filtros();run();};});
    $$("[data-fc]",f).forEach(function(b){b.onclick=function(){BUSCA.fcat=b.getAttribute("data-fc");filtros();run();};}); }

  /* o = {n: contador ao lado do titulo} ou {carregando: true} */
  function grupo(box,titulo,o){ o=o||{};
    var d=el("div",{"class":"grp"});
    d.innerHTML=htmlDe("t-busca-grupo",{titulo:titulo,n:o.n==null?null:o.n,carregando:!!o.carregando});
    box.appendChild(d); return d; }
  function item(pai,src,classe,ti,sub,sn,q,go){
    var b=el("button",{"class":"rit"});
    b.innerHTML=htmlDe("t-busca-item",{fonte:src,classe:classe,titulo:marca(ti,q),sub:sub,trecho:sn?marca(sn,q):""});
    b.onclick=go; pai.appendChild(b); return b; }

  var TRECHOS=[];
  var ai=$("#askAI",ov), aiPronto=false;
  if(ai){ ai.textContent=iaPergunta();
    aiPronto=true; ai.hidden=!(inp.value.trim().length>=2);
    ai.onclick=function(){ var qq=inp.value.trim(); if(qq.length<2){inp.focus();return;}
      ov.close(); perguntarClaude(qq,TRECHOS,voltarBusca); }; }
  function run(){ BUSCA.q=inp.value.trim(); var q=BUSCA.q, box=$("#br",ov);
    if(ai&&aiPronto)ai.hidden=!(q.length>=2);
    TRECHOS=[];
    if(q.length<2){ box.innerHTML=htmlDe("t-busca-curta",{paginas:(IDX&&IDX.pages&&IDX.pages.length)||0}); SEL=-1; return; }
    box.innerHTML="";
    var achouAlgo=false;

    var rg=[];
    (PUBD().referencia||[]).forEach(function(g){ (g.itens||[]).forEach(function(x){
      if(norm(x).indexOf(norm(q))>=0)rg.push({t:g.t,x:x}); }); });
    if(rg.length){ achouAlgo=true;
      var g1=grupo(box,"Consulta rápida");
      rg.slice(0,4).forEach(function(r){ item(g1,"Regra","reg",r.t,"resumo de mesa",r.x,q,
        function(){ ov.close(); S.view="mesa"; S.msec="regras"; render(); }); }); }

    var rc=buscaCampanha(q);
    if(rc.length){ achouAlgo=true;
      var g2=grupo(box,GM?"Na sua campanha":"Na mesa",{n:rc.length});
      rc.slice(0,14).forEach(function(x){ item(g2,x.src,"camp",x.ti,x.sub,x.sn,q,
        function(){ ov.close(); x.go(); }); }); }

    var g3=grupo(box,"Nos livros",{carregando:true});
    carregaIndice().then(function(){
      filtros();
      var r=buscaDocs(q,BUSCA.fdoc,BUSCA.fcat);
      var n=$("#bn",ov); if(n)n.textContent=r.length?(r.length+(r.length>=50?"+":"")):"0";
      if(!r.length)g3.insertAdjacentHTML("beforeend",htmlDe("t-busca-livros-vazio",{filtrado:BUSCA.fdoc!=="todos"||BUSCA.fcat!=="tudo"}));
      else {
        r.forEach(function(x){ item(g3,refDoc(x.ab,x.p),x.canon?"canon":"",x.s||"(sem seção)",
          x.canon?"página canônica desse termo":"ler a página",x.sn,q,
          function(){ ov.close(); abrirResultado(x.ab,x.p,q,voltarBusca); }); });
      }
      TRECHOS=r.slice(0,6).map(function(x){
        var pp=IDX.pages[x.i]||{}; return {ab:x.ab,p:x.p,s:x.s,t:pp.t}; });
      if(!achouAlgo&&!r.length)box.innerHTML=htmlDe("t-vazio",{texto:"Nada encontrado."});
      selInit();
    });
    selInit();
  }

  var t=null; inp.oninput=function(){clearTimeout(t);t=setTimeout(run,200);};
  carregaIndice().then(filtros);
  run(); setTimeout(function(){inp.focus();inp.select();},30);
}
