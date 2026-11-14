/* Aba Elenco. */
"use strict";

/* ---------- ABA ELENCO ---------- */
function camposElenco(tp){
  if(tp==="personagens")return [
    {k:"nome",rot:"Nome",obrig:true},
    {k:"subtitulo",rot:"Conceito, classe ou alcunha"},
    {k:"jogador",rot:"Quem joga"},
    {k:"img",rot:"Retrato",tipo:"img"},
    {k:"imgAlt",rot:"Segunda imagem (aparece ao passar o mouse)",tipo:"img"},
    {k:"etiquetas",rot:"Etiquetas",ph:"palavras soltas, separadas por vírgula"},
    {k:"notas",rot:"Notas",tipo:"area",linhas:5},
    {k:"ref",rot:"Página no livro (opcional)",ph:"ex.: LB p42",
     dica:"A abreviação do livro, como aparece na Biblioteca, e a página. Vira um atalho para o PDF."},
    {k:"fichas",rot:"Fichas e imagens para mostrar na tela",tipo:"imgs"}];
  if(tp==="npcs")return [
    {k:"nome",rot:"Nome",obrig:true},{k:"img",rot:"Retrato",tipo:"img"},
    {k:"desc",rot:"O que a mesa pode saber",tipo:"area",linhas:4,dica:"É isto que os jogadores veem quando você libera."},
    {k:"segredo",rot:"Só para você",tipo:"area",linhas:4,dica:"Nunca vai para os jogadores."}];
  if(tp==="locais")return [
    {k:"nome",rot:"Nome",obrig:true},{k:"img",rot:"Imagem",tipo:"img"},
    {k:"desc",rot:"Descrição",tipo:"area",linhas:5,dica:"É isto que os jogadores veem quando você libera."}];
  return [
    {k:"nome",rot:"Nome",obrig:true},{k:"img",rot:"Imagem",tipo:"img"},
    {k:"texto",rot:"Texto",tipo:"area",linhas:6,dica:"O que está escrito, ou o que os jogadores descobrem. Vai para eles quando você libera."}];
}
function novoElenco(tp){
  if(tp==="personagens")return {nome:"",subtitulo:"",jogador:"",img:"",imgAlt:"",etiquetas:"",notas:"",ref:"",fichas:[]};
  if(tp==="npcs")return {nome:"",img:"",desc:"",segredo:""};
  if(tp==="locais")return {nome:"",img:"",desc:""};
  return {nome:"",img:"",texto:""};
}
function removerElenco(tp,x){
  D.elenco[tp]=D.elenco[tp].filter(function(y){return y!==x;});
  if(EL[tp].ids)D.sessoes.forEach(function(s){ s[EL[tp].ids]=(s[EL[tp].ids]||[]).filter(function(i){return i!==x.id;}); });
  if(jaLib(tp,x)){ tirar(tp,x); salvarMesa(); }
}
function editarElenco(tp,x,aoCriar){
  var novo=!x, um=V(EL[tp].voc).toLowerCase();
  formulario((novo?"Novo · ":"Editar · ")+um,camposElenco(tp),x||novoElenco(tp),{wide:tp==="personagens",
    salvar:function(w){ w.nome=String(w.nome).trim();
      if(novo){ w.id=uid(EL[tp].pre); D.elenco[tp].push(w); if(aoCriar)aoCriar(w); }
      else { for(var k in w)x[k]=w[k]; sincLib(tp,x); }
      save(); render(); },
    remover:novo?null:function(){ comDesfazer("Removido: "+x.nome,function(){ removerElenco(tp,x); }); }});
}
function viewElenco(){
  var tp=EL[S.el]?S.el:"personagens", l=D.elenco[tp], um=V(EL[tp].voc).toLowerCase();
  return htmlDe("t-elenco",{tipo:tp,um:um,
    cabeca:cabecaPagina(tituloApp(),"Elenco",{id:"elNovo",texto:"+ "+um}),
    abas:subnav(["personagens","npcs","locais","pistas"].map(function(k){
      return [k,Vm(EL[k].vocs)+" ("+D.elenco[k].length+")"];}),tp,"data-el"),
    itens:tp==="personagens"?l:l.map(function(x){
      return {id:x.id,nome:x.nome,img:x.img,texto:String(x.desc||x.texto||""),on:jaLib(tp,x)}; })});
}
function hydrateElenco(v){
  var tp=EL[S.el]?S.el:"personagens";
  ligarPdfs(v);
  $$("[data-el]",v).forEach(function(b){ b.onclick=function(){ S.el=b.getAttribute("data-el"); render(); }; });
  var n=$("#elNovo",v); if(n)n.onclick=function(){ editarElenco(tp,null); };
  $$("[data-eled]",v).forEach(function(b){ b.onclick=function(e){ e.stopPropagation();
    var x=elDe(tp,b.getAttribute("data-eled")); if(x)editarElenco(tp,x); }; });
  $$("[data-elver]",v).forEach(function(c){
    function abre(){ abrirItem(tp,elDe(tp,c.getAttribute("data-elver"))); }
    c.onclick=abre; c.onkeydown=function(e){ if(e.key==="Enter"&&e.target===c)abre(); }; });
  $$("[data-ellib]",v).forEach(function(b){ b.onclick=function(e){ e.stopPropagation();
    var x=elDe(tp,b.getAttribute("data-ellib")); if(!x)return;
    var on=alternaLib(tp,x); render(); toast(on?"Liberado para a mesa":"Tirado da mesa"); }; });
  $$("[data-fichas]",v).forEach(function(b){ b.onclick=function(){
    abrirFichasP(elDe("personagens",b.getAttribute("data-fichas"))); }; });
}
