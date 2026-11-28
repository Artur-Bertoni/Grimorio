/* Aba Elenco. */
"use strict";

/* ---------- ABA ELENCO ---------- */
function camposElenco(tp){
  if(tp==="personagens")return [
    {k:"nome",rot:"Nome",obrig:true},
    {k:"subtitulo",rot:"Conceito, classe ou alcunha"},
    {k:"jogador",rot:"Quem joga"},
    {k:"fichaId",rot:Vm("ficha")+" na "+vmin("mesa"),tipo:"sel",ops:opcoesFichaElenco(),
     dica:"A "+vmin("ficha")+" de jogo deste "+vmin("personagem")+" (a da seção "+Vm("fichas")+" da "+Vm("mesa")+"). O cartão ganha um atalho para abri-la."},
    {k:"img",rot:"Retrato",tipo:"img"},
    {k:"imgAlt",rot:"Segunda imagem",tipo:"img",dica:"Aparece no cartão ao passar o mouse."},
    {k:"etiquetas",rot:"Etiquetas",ph:"separadas por vírgula"},
    {k:"ref",rot:"Página no livro",ph:"LB p42",
     dica:"Opcional. A abreviação do livro, como aparece na Biblioteca, e a página. Vira um atalho para o PDF."},
    {k:"notas",rot:"Notas",tipo:"area",linhas:4},
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
/* as fichas da campanha que o mestre enxerga (todas), para ligar ao personagem do elenco */
function opcoesFichaElenco(){
  return [["","Nenhuma"]].concat(fichasDaCampanha().map(function(f){ return [String(f.id),f.nome+(f.jogador?" · "+f.dono:"")]; }));
}
function novoElenco(tp){
  if(tp==="personagens")return {nome:"",subtitulo:"",jogador:"",img:"",imgAlt:"",etiquetas:"",notas:"",ref:"",fichaId:"",fichas:[]};
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
  /* o personagem escolhe a ficha numa lista: ela desce antes de o formulario abrir (sem ela, abre do mesmo jeito) */
  if(tp==="personagens"&&FICHAS_CID!==CID){
    carregaFichas().catch(function(){ /* sem a lista, o campo da ficha fica so com Nenhuma */ }).then(function(){ if(FICHAS_CID!==CID){ FICHAS=[]; FICHAS_CID=CID; } editarElenco(tp,x,aoCriar); });
    return;
  }
  var novo=!x, um=V(EL[tp].voc).toLowerCase();
  formulario((novo?"Novo · ":"Editar · ")+um,camposElenco(tp),x||novoElenco(tp),{
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
  $$("[data-el]",v).forEach(function(b){ b.onclick=function(){ S.el=b.dataset.el; render(); }; });
  var n=$("#elNovo",v); if(n)n.onclick=function(){ editarElenco(tp,null); };
  $$("[data-eled]",v).forEach(function(b){ b.onclick=function(e){ e.stopPropagation();
    var x=elDe(tp,b.dataset.eled); if(x)editarElenco(tp,x); }; });
  $$("[data-elver]",v).forEach(function(c){
    function abre(){ abrirItem(tp,elDe(tp,c.dataset.elver)); }
    c.onclick=abre; c.onkeydown=function(e){ if(e.key==="Enter"&&e.target===c)abre(); }; });
  $$("[data-ellib]",v).forEach(function(b){ b.onclick=function(e){ e.stopPropagation();
    var x=elDe(tp,b.dataset.ellib); if(!x)return;
    var on=alternaLib(tp,x); render(); toast(on?"Liberado para a mesa":"Tirado da mesa"); }; });
  $$("[data-elficha]",v).forEach(function(b){ b.onclick=function(e){ e.stopPropagation(); abrirFichaPorId(b.dataset.elficha); }; });
  $$("[data-fichas]",v).forEach(function(b){ b.onclick=function(){
    abrirFichasP(elDe("personagens",b.dataset.fichas)); }; });
}
