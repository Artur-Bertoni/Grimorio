/* Sessoes: criar, mover cena, encerrar. */
"use strict";

/* ---------- SESSOES: mover cena, criar, escolher, encerrar ---------- */
function idxCena(s,id){ for(var i=0;i<s.cenas.length;i++) if(s.cenas[i].id===id)return i; return -1; }
function moverCena(s,id,terrId,k){
  var i=idxCena(s,id); if(i<0)return;
  var c=s.cenas.splice(i,1)[0];
  c.territorio=terrId;
  var lista=s.cenas.filter(function(x){return x.territorio===terrId;});
  var destino;
  if(k>=lista.length) destino=lista.length?(s.cenas.indexOf(lista[lista.length-1])+1):s.cenas.length;
  else destino=s.cenas.indexOf(lista[k]);
  s.cenas.splice(destino,0,c);
  save(); render();
}
function novaSessao(n,titulo,resumo){
  var num=Number(n)||(D.sessoes.reduce(function(m,x){return Math.max(m,x.numero||0);},0)+1);
  var s={id:uid("s"),numero:num,titulo:titulo||(Vm("sessao")+" "+num),status:"planejada",resumo:resumo||"",
    territorios:[{id:uid("t"),nome:Vm("territorio")+" 1",cor:CORES_T[0][0],padrao:true}],
    prep:{terPronto:[],mecanicas:[]},eventosFixos:{intro:"",lista:[]},
    npcIds:[],localIds:[],pistaIds:[],cenas:[],plantado:""};
  D.sessoes.push(s);
  D.sessoes.sort(function(a,b){return (a.numero||0)-(b.numero||0);});
  return D.sessoes.indexOf(s);
}
function irSessao(i){ S.view="sessao"; S.sessao=i; CV.init=false; render(); abreCapitulo(curSess()); }
function estadoSessao(s){
  if(s.status==="encerrada")return "encerrada";
  var f=s.cenas.filter(function(c){return c.feito;}).length;
  return s.cenas.length?(f+"/"+s.cenas.length+" "+V("cenas").toLowerCase()):"sem "+V("cenas").toLowerCase();
}
function linhaSessao(s){
  return htmlDe("t-sessao-linha",{id:s.id,numero:s.numero,titulo:s.titulo,resumo:s.resumo,
    encerrada:s.status==="encerrada",estado:estadoSessao(s)});
}
function viewSessoes(){
  return htmlDe("t-sessoes",{cabeca:cabecaPagina(tituloApp(),Vm("sessoes"),{id:"sesNova",texto:"+ "+vmin("sessao")}),
    linhas:D.sessoes.map(linhaSessao).join("")});
}
function ligarSessoes(v){
  $$("[data-ses]",v).forEach(function(b){ b.onclick=function(){ var id=b.getAttribute("data-ses");
    for(var i=0;i<D.sessoes.length;i++) if(D.sessoes[i].id===id){ irSessao(i); return; } }; });
  var n=$("#sesNova",v); if(n)n.onclick=function(){ editarSessao(null); };
}
function editarSessao(s){
  var nova=!s, um=V("sessao").toLowerCase();
  var prox=D.sessoes.reduce(function(m,x){return Math.max(m,x.numero||0);},0)+1;
  var campos=[{k:"numero",rot:"Número",tipo:"num"},{k:"titulo",rot:"Título",obrig:true},
    {k:"resumo",rot:"O que deve acontecer",tipo:"area",linhas:4,dica:"Só você vê. O resumo para os jogadores é escrito ao encerrar."}];
  if(!nova)campos.push({k:"status",rot:"Situação",tipo:"sel",
    ops:[["planejada","planejada"],["jogada","em andamento"],["encerrada","encerrada"]]});
  formulario((nova?"Nova ":"Editar ")+um,campos,
    nova?{numero:prox,titulo:"",resumo:""}:{numero:s.numero,titulo:s.titulo,resumo:s.resumo,status:s.status||"planejada"},
    {salvar:function(w){
        if(nova){ var i=novaSessao(w.numero,String(w.titulo).trim(),w.resumo); save(); irSessao(i); toast(Vm("sessao")+" criada"); return; }
        s.numero=Number(w.numero)||s.numero; s.titulo=String(w.titulo).trim(); s.resumo=w.resumo; s.status=w.status;
        D.sessoes.sort(function(a,b){return (a.numero||0)-(b.numero||0);});
        S.sessao=D.sessoes.indexOf(s); save(); render(); },
     rotRemover:"Remover "+um,
     remover:nova?null:function(){ comDesfazer(Vm("sessao")+" removida, com as "+V("cenas").toLowerCase()+" dela",function(){
        D.sessoes=D.sessoes.filter(function(x){return x!==s;}); S.view="sessoes"; S.sessao=0; }); }});
}
function encerrarSessao(){
  var s=curSess(); if(!s)return;
  var um=V("sessao").toLowerCase();
  var pend=s.cenas.filter(function(c){return !c.feito;});
  var prox=D.sessoes.filter(function(x){return x.numero===s.numero+1;})[0];
  var ov=overlay("Encerrar "+um+" "+s.numero,htmlDe("t-encerrar",{Um:Vm("sessao"),numero:s.numero,total:s.cenas.length,
    pendentes:pend.map(function(c){ return {n:c.n,titulo:c.titulo}; }),
    prox:prox?{numero:prox.numero,titulo:prox.titulo}:null}));
  $("#encNo",ov).onclick=function(){ov.close();};
  $("#encOk",ov).onclick=function(){ ov.close(); aplicarEncerramento(s); };
}
function aplicarEncerramento(s){
  var pend=s.cenas.filter(function(c){return !c.feito;}), prox=null, movTerr=[];
  if(pend.length){
    prox=D.sessoes.filter(function(x){return x.numero===s.numero+1;})[0];
    if(!prox)prox=D.sessoes[novaSessao(s.numero+1)];
    pend.forEach(function(c){
      var t=(s.territorios||[]).filter(function(x){return x.id===c.territorio;})[0];
      if(t&&!prox.territorios.filter(function(x){return x.id===t.id;})[0]){
        prox.territorios.push({id:t.id,nome:t.nome,cor:t.cor}); movTerr.push(t.nome); } });
    ["npcIds","localIds","pistaIds"].forEach(function(k){
      (s[k]||[]).forEach(function(id){ if(prox[k].indexOf(id)<0)prox[k].push(id); }); });
    s.cenas=s.cenas.filter(function(c){return !!c.feito;});
    prox.cenas=prox.cenas.concat(pend);
    /* o territorio que a sessao nova ganhou ao nascer sai se ficou vazio */
    if(prox.territorios.length>1&&prox.territorios[0].padrao
       &&!prox.cenas.some(function(c){return c.territorio===prox.territorios[0].id;}))prox.territorios.shift();
  }
  s.status="encerrada";
  save();
  if(prox){ S.view="sessao"; S.sessao=D.sessoes.indexOf(prox); S.vmode="canvas"; CV.init=false; }
  else { S.view="sessoes"; }
  render();
  var Um=Vm("sessao");
  var blocos=[{titulo:Vm("cenas")+" que passaram adiante",itens:pend.map(function(c){return c.n+" · "+c.titulo;})},
    {titulo:Vm("territorios")+" levados junto",itens:movTerr}].filter(function(b){ return b.itens.length; });
  var ov=overlay(Um+" encerrada",htmlDe("t-encerrada",{Um:Um,numero:s.numero,prox:prox?prox.numero:null,blocos:blocos}));
  $("#encDep",ov).onclick=function(){ ov.close(); };
  $("#encRes",ov).onclick=function(){ ov.close();
    var hoje=""; try{ hoje=new Date().toLocaleDateString("pt-BR"); }catch(e){}
    editarResumo(-1,{n:s.numero,titulo:s.titulo,data:hoje,texto:""}); };
}
