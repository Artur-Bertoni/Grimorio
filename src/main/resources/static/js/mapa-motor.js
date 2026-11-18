/* Tabletop: desenho do mapa no canvas, pan, zoom, pinca e arraste de token (js/mapa-motor.js). */
"use strict";

/* O mapa e desenhado num canvas 2D, nao em DOM: uma imagem de 4096px com centenas de casas e
   tokens arrastando a 60 quadros nao caberia em elementos soltos. As coordenadas sao as do
   original da imagem (largura e altura do mapa); a vista (zoom e deslocamento) e de quem olha,
   guardada por mapa so nesta aba do navegador. Nada aqui grava: soltar um token chama mpMover. */
var MPV={};
var MPIMG={};
var MPC=null;
var MP_ZOOM_MIN=0.05, MP_ZOOM_MAX=8;

function mpVista(){
  var id=String(MP.id);
  if(!MPV[id]){ MPV[id]={z:1,x:0,y:0,novo:true}; }
  return MPV[id];
}
function mpGrid(){ return MP.mapa?.grid||{tipo:"quadrado",tam:70,ox:0,oy:0,opac:0.35}; }
function mpLado(){ return Math.max(8,Number(mpGrid().tam)||70); }
function mpNum(v,p){ var n=Number(v); return Number.isFinite(n)?n:p; }

/* imagem carregada uma vez por endereco; quando chega, o mapa se redesenha */
function mpImagem(url){
  if(!url){ return null; }
  var c=MPIMG[url];
  if(!c){
    c={img:new Image(),ok:false};
    MPIMG[url]=c;
    c.img.decoding="async";
    c.img.onload=function(){ c.ok=true; mpDesenha(); };
    c.img.src=url;
  }
  return c.ok?c.img:null;
}
/* as cores saem dos tokens do tema: o canvas nao le CSS, entao le o valor calculado */
function mpCores(){
  var s=getComputedStyle(document.documentElement);
  function c(n){ return s.getPropertyValue(n).trim(); }
  return {fundo:c("--bg"),area:c("--bg2"),ficha:c("--bg3"),grade:c("--fg"),linha:c("--line2"),
    texto:c("--fg"),texto2:c("--fg2"),ouro:c("--gold"),perigo:c("--blood"),rotulo:c("--bg"),fonte:c("--ui")||"sans-serif"};
}

/* ---------- desenho ---------- */
function mpDesenha(){
  if(!MPC?.cv.isConnected||MPC.pedido){ return; }
  MPC.pedido=requestAnimationFrame(mpPinta);
}
function mpPinta(){
  var c=MPC; c.pedido=0;
  var ctx=c.ctx, cor=mpCores(), m=MP.mapa, v=mpVista();
  ctx.setTransform(c.dpr,0,0,c.dpr,0,0);
  ctx.fillStyle=cor.fundo; ctx.fillRect(0,0,c.w,c.h);
  if(!m||!c.w){ return; }
  if(v.novo){ v.novo=false; mpEnquadra(true); }
  ctx.translate(v.x,v.y); ctx.scale(v.z,v.z);
  var W=m.largura, H=m.altura;
  ctx.fillStyle=cor.area; ctx.fillRect(0,0,W,H);
  var im=m.imagem?mpImagem(IMG(m.imagem,"mapa")):null;
  if(im){ ctx.drawImage(im,0,0,W,H); }
  /* so o que esta na tela: a grade de um mapa enorme nao e desenhada inteira a cada quadro */
  var tela={x0:-v.x/v.z,y0:-v.y/v.z,x1:(c.w-v.x)/v.z,y1:(c.h-v.y)/v.z};
  mpPintaGrid(ctx,tela,v.z,cor,W,H);
  ctx.strokeStyle=cor.linha; ctx.lineWidth=1/v.z; ctx.strokeRect(0,0,W,H);
  MP.els.forEach(function(el){ mpPintaToken(ctx,el,v.z,cor,tela); });
  mpPintaMedidas(ctx,v.z,cor);
}
function mpPintaGrid(ctx,tela,z,cor,W,H){
  var g=mpGrid(), T=mpLado();
  if(g.tipo==="nenhum"||T*z<4){ return; }
  var vis={x0:Math.max(0,tela.x0),y0:Math.max(0,tela.y0),x1:Math.min(W,tela.x1),y1:Math.min(H,tela.y1)};
  if(vis.x1<=vis.x0||vis.y1<=vis.y0){ return; }
  ctx.save();
  ctx.beginPath(); ctx.rect(0,0,W,H); ctx.clip();
  ctx.globalAlpha=Math.min(1,Math.max(0,mpNum(g.opac,0.35)));
  ctx.strokeStyle=cor.grade; ctx.lineWidth=1/z;
  ctx.beginPath();
  if(g.tipo==="hex"){ mpHexes(ctx,vis,g,T); } else { mpQuadrados(ctx,vis,g,T); }
  ctx.stroke();
  ctx.restore();
}
function mpQuadrados(ctx,vis,g,T){
  var ox=mpNum(g.ox,0), oy=mpNum(g.oy,0);
  for(var x=ox+Math.ceil((vis.x0-ox)/T)*T;x<=vis.x1;x+=T){ ctx.moveTo(x,vis.y0); ctx.lineTo(x,vis.y1); }
  for(var y=oy+Math.ceil((vis.y0-oy)/T)*T;y<=vis.y1;y+=T){ ctx.moveTo(vis.x0,y); ctx.lineTo(vis.x1,y); }
}
/* Hexagono de ponta para cima. T e a distancia entre centros vizinhos na mesma linha (a
   largura do hexagono); as linhas impares andam meia casa para o lado. */
function mpCentroHex(i,j,g,T){
  var r=T/Math.sqrt(3);
  return {x:mpNum(g.ox,0)+T/2+i*T+((j%2+2)%2)*T/2, y:mpNum(g.oy,0)+r+j*1.5*r};
}
function mpHexes(ctx,vis,g,T){
  var r=T/Math.sqrt(3), dy=1.5*r, oy=mpNum(g.oy,0), ox=mpNum(g.ox,0);
  var j0=Math.floor((vis.y0-oy-2*r)/dy), j1=Math.ceil((vis.y1-oy)/dy);
  var i0=Math.floor((vis.x0-ox-T)/T), i1=Math.ceil((vis.x1-ox)/T);
  if((j1-j0+1)*(i1-i0+1)>40000){ return; }
  for(var j=j0;j<=j1;j++){
    for(var i=i0;i<=i1;i++){
      var c=mpCentroHex(i,j,g,T);
      for(var k=0;k<6;k++){
        var a=Math.PI/180*(30+60*k), px=c.x+r*Math.cos(a), py=c.y+r*Math.sin(a);
        if(k===0){ ctx.moveTo(px,py); } else { ctx.lineTo(px,py); }
      }
      ctx.closePath();
    }
  }
}
function mpIniciais(n){
  return String(n||"?").trim().split(/\s+/).slice(0,2).map(function(p){ return p.charAt(0).toUpperCase(); }).join("")||"?";
}
function mpRaio(el){ return Math.max(4,mpNum(el.dados?.tam,1)*mpLado()/2); }
function mpPintaToken(ctx,el,z,cor,tela){
  var d=el.dados||{}, R=mpRaio(el), x=mpNum(d.x,0), y=mpNum(d.y,0);
  if(x+R<tela.x0||x-R>tela.x1||y+R<tela.y0||y-R>tela.y1){ return; }
  var sel=String(MP.sel)===String(el.id);
  ctx.save();
  ctx.translate(x,y);
  if(el.visivel===false){ ctx.globalAlpha=0.5; }
  /* a imagem original, inteira, ajustada ao quadrado do tamanho escolhido; sem recorte nem moldura */
  var im=d.img?mpImagem(IMG(d.img)):null;
  ctx.save();
  ctx.rotate(mpNum(d.rot,0)*Math.PI/180);
  if(im){ mpPintaImagem(ctx,im,R); } else { mpPintaMarcador(ctx,R,cor); }
  /* so a selecao desenha algo em volta, e e o contorno da area do token */
  if(sel){ ctx.lineWidth=2/z; ctx.strokeStyle=cor.ouro; ctx.strokeRect(-R,-R,2*R,2*R); }
  ctx.restore();
  /* a vez da iniciativa: contorno tracejado em volta do token (o da selecao e inteiro) */
  if(el.daVez){ ctx.lineWidth=2/z; ctx.strokeStyle=cor.ouro; ctx.setLineDash([6/z,4/z]); ctx.strokeRect(-R-3/z,-R-3/z,2*R+6/z,2*R+6/z); ctx.setLineDash([]); }
  if(!im){ mpPintaIniciais(ctx,d,R,cor); }
  if(R*z>=12||sel){ mpPintaRotulo(ctx,d.nome,R,z,cor); }
  ctx.restore();
}
/* cabe inteira dentro de 2R x 2R, mantendo a proporcao */
function mpPintaImagem(ctx,im,R){
  var k=Math.min(2*R/im.width,2*R/im.height);
  ctx.drawImage(im,-im.width*k/2,-im.height*k/2,im.width*k,im.height*k);
}
/* token sem imagem: um quadrado liso, para ainda ter onde pegar */
function mpPintaMarcador(ctx,R,cor){
  ctx.fillStyle=cor.ficha; ctx.fillRect(-R,-R,2*R,2*R);
}
function mpPintaIniciais(ctx,d,R,cor){
  ctx.fillStyle=cor.texto; ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.font="600 "+Math.max(6,R*0.7)+"px "+cor.fonte;
  ctx.fillText(mpIniciais(d.nome),0,0);
}/* nome embaixo do token, sempre com 12px na tela, seja qual for o zoom */
function mpPintaRotulo(ctx,nome,R,z,cor){
  var t=String(nome||"");
  if(!t){ return; }
  var fs=12/z, pad=4/z;
  ctx.font="600 "+fs+"px "+cor.fonte;
  var w=ctx.measureText(t).width;
  ctx.globalAlpha=Math.min(ctx.globalAlpha,0.88);
  ctx.fillStyle=cor.rotulo;
  ctx.fillRect(-w/2-pad,R+pad,w+pad*2,fs+pad*2);
  ctx.globalAlpha=1;
  ctx.fillStyle=cor.texto; ctx.textAlign="center"; ctx.textBaseline="top";
  ctx.fillText(t,0,R+pad*2);
}

/* ---------- medidas: regua e trajeto do token ---------- */
/* Duas coisas se medem: a regua (dois pontos ou tokens, so na tela de quem mede) e o trajeto do
   token que a pessoa segura. As duas usam a mesma conta e a regra de diagonal do mapa. */
function mpUnidade(){ return String(mpGrid().unidade||""); }
function mpEscalaCasa(){ var e=Number(mpGrid().escala); return Number.isFinite(e)&&e>0?e:1; }
function mpFmt(n){ return String(Math.round(n*100)/100).replace(".",","); }
function mpDistTexto(casas){
  var t=mpFmt(casas*mpEscalaCasa())+" "+mpUnidade(), c=mpFmt(casas);
  return t.trim()+" · "+c+(c==="1"?" casa":" casas");
}
function mpPintaMedidas(ctx,z,cor){
  var a=MP.medida;
  if(a){ mpPintaTraco(ctx,z,cor,a); }
  var r=MP.regua;
  if(r&&(r.a.x!==r.b.x||r.a.y!==r.b.y)){ mpPintaTraco(ctx,z,cor,{x0:r.a.x,y0:r.a.y,x1:r.b.x,y1:r.b.y,fantasma:0}); }
}
/* a linha, as pontas e o rotulo com 12px na tela; passando do deslocamento, a linha vira vermelha
   e o rotulo diz quanto passou (a cor sozinha nao conta) */
function mpPintaTraco(ctx,z,cor,a){
  var casas=mpDistCasas(a.x0,a.y0,a.x1,a.y1), texto=mpDistTexto(casas), passa=false;
  if(a.el&&!GM&&mpNum(a.el.dados?.desl,0)>0){
    var resta=a.el.dados.desl-mpNum(a.el.dados.usado,0), custo=casas*mpEscalaCasa();
    passa=custo>resta+0.000001;
    texto+=passa?" · passa "+mpFmt(custo-resta)+" "+mpUnidade():" · restam "+mpFmt(resta-custo)+" "+mpUnidade();
  }
  ctx.save();
  ctx.strokeStyle=passa?cor.perigo:cor.ouro; ctx.fillStyle=ctx.strokeStyle; ctx.lineWidth=2/z;
  ctx.setLineDash([8/z,5/z]);
  ctx.beginPath(); ctx.moveTo(a.x0,a.y0); ctx.lineTo(a.x1,a.y1); ctx.stroke();
  ctx.setLineDash([]);
  [[a.x0,a.y0],[a.x1,a.y1]].forEach(function(p){ ctx.beginPath(); ctx.arc(p[0],p[1],4/z,0,Math.PI*2); ctx.fill(); });
  if(a.destino){ ctx.strokeRect(a.destino.x-a.destino.R,a.destino.y-a.destino.R,2*a.destino.R,2*a.destino.R); }
  var fs=12/z, pad=4/z, mx=(a.x0+a.x1)/2, my=(a.y0+a.y1)/2;
  ctx.font="600 "+fs+"px "+cor.fonte;
  var w=ctx.measureText(texto).width;
  ctx.globalAlpha=0.92; ctx.fillStyle=cor.rotulo; ctx.fillRect(mx-w/2-pad,my-fs/2-pad,w+pad*2,fs+pad*2);
  ctx.globalAlpha=1; ctx.fillStyle=cor.texto; ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.fillText(texto,mx,my);
  ctx.restore();
}

/* ---------- geometria ---------- */
function mpMundo(e){
  var r=MPC.cv.getBoundingClientRect(), v=mpVista();
  return {x:(e.clientX-r.left-v.x)/v.z, y:(e.clientY-r.top-v.y)/v.z};
}
function mpTokenEm(wx,wy){
  for(var i=MP.els.length-1;i>=0;i--){
    var el=MP.els[i], d=el.dados||{};
    var R=mpRaio(el);
    if(Math.abs(wx-mpNum(d.x,0))<=R&&Math.abs(wy-mpNum(d.y,0))<=R){ return el; }
  }
  return null;
}
/* Ao soltar, o token encaixa na grade: no centro da casa (ou, nos de 2x2 e 4x4, na esquina),
   e no centro do hexagono mais perto. Com Alt apertado fica onde caiu. */
function mpEncaixa(x,y,tam){
  var g=mpGrid(), T=mpLado();
  if(g.tipo==="nenhum"){ return {x:x,y:y}; }
  if(g.tipo==="hex"){ return mpHexPerto(x,y,g,T); }
  var meia=Math.max(1,Math.round(tam))*T/2, ox=mpNum(g.ox,0), oy=mpNum(g.oy,0);
  return {x:ox+Math.round((x-ox-meia)/T)*T+meia, y:oy+Math.round((y-oy-meia)/T)*T+meia};
}
/* o hexagono mais perto do ponto, como coluna e linha (i, j) da grade deslocada */
function mpHexIJ(x,y,g,T){
  var r=T/Math.sqrt(3), j0=Math.round((y-mpNum(g.oy,0)-r)/(1.5*r)), melhor=null, dist=Infinity;
  for(var j=j0-1;j<=j0+1;j++){
    var desl=((j%2+2)%2)*T/2, i=Math.round((x-mpNum(g.ox,0)-T/2-desl)/T);
    for(var di=-1;di<=1;di++){
      var c=mpCentroHex(i+di,j,g,T), dd=Math.hypot(x-c.x,y-c.y);
      if(dd<dist){ dist=dd; melhor={i:i+di,j:j}; }
    }
  }
  return melhor;
}
function mpHexPerto(x,y,g,T){ var h=mpHexIJ(x,y,g,T); return mpCentroHex(h.i,h.j,g,T); }
/* Distancia em casas entre dois pontos pela regra de diagonal do mapa: 1 por casa, 1-2-1 (cada
   segunda diagonal custa dois) ou euclidiana. Na grade hexagonal conta passos. E a mesma conta do
   servidor (MapaMedida.java), que e a que vale para o deslocamento do turno. */
function mpDistCasas(x0,y0,x1,y1){
  var g=mpGrid(), T=mpLado(), diag=g.diagonal||"121";
  if(g.tipo==="hex"){
    if(diag==="eu"){ return Math.hypot(x1-x0,y1-y0)/T; }
    var a=mpAxial(mpHexIJ(x0,y0,g,T)), b=mpAxial(mpHexIJ(x1,y1,g,T)), dq=a.q-b.q, dr=a.r-b.r;
    return (Math.abs(dq)+Math.abs(dr)+Math.abs(dq+dr))/2;
  }
  var dx=Math.abs(x1-x0)/T, dy=Math.abs(y1-y0)/T;
  if(g.tipo==="nenhum"||diag==="eu"){ return Math.hypot(dx,dy); }
  var p=Math.round(dx), q=Math.round(dy), maior=Math.max(p,q), menor=Math.min(p,q);
  return diag==="1"?maior:maior+Math.floor(menor/2);
}
function mpAxial(h){ return {q:h.i-(h.j-((h.j%2+2)%2))/2,r:h.j}; }

/* ---------- vista ---------- */
function mpEnquadra(semDesenhar){
  var m=MP.mapa;
  if(!MPC||!m||!MPC.w){ return; }
  var v=mpVista(), pad=24, w=MPC.w-mpLarguraDoPainel();
  v.z=Math.min(MP_ZOOM_MAX,Math.max(MP_ZOOM_MIN,Math.min((w-pad*2)/m.largura,(MPC.h-pad*2)/m.altura)));
  v.x=(w-m.largura*v.z)/2; v.y=(MPC.h-m.altura*v.z)/2;
  if(!semDesenhar){ mpDesenha(); }
}
/* na tela larga o painel aberto cobre a direita do mapa: enquadrar usa so o que sobra. No
   celular ele e uma gaveta que a pessoa abre e fecha, entao nao conta. */
function mpLarguraDoPainel(){
  var p=$("#mpPainel");
  if(!p||p.hidden||window.innerWidth<900){ return 0; }
  return p.offsetWidth+16;
}
function mpZoom(fator,cx,cy){
  var v=mpVista(), nz=Math.min(MP_ZOOM_MAX,Math.max(MP_ZOOM_MIN,v.z*fator));
  v.x=cx-(cx-v.x)*(nz/v.z); v.y=cy-(cy-v.y)*(nz/v.z); v.z=nz;
  mpDesenha();
}
function mpCentraliza(el){
  if(!MPC||!el){ return; }
  var v=mpVista(), d=el.dados||{};
  v.x=(MPC.w-mpLarguraDoPainel())/2-mpNum(d.x,0)*v.z; v.y=MPC.h/2-mpNum(d.y,0)*v.z;
  mpDesenha();
}
function mpMede(){
  if(!MPC?.cv.isConnected){ return; }
  var r=MPC.wrap.getBoundingClientRect(), dpr=Math.min(2,window.devicePixelRatio||1);
  MPC.w=Math.max(1,Math.round(r.width)); MPC.h=Math.max(1,Math.round(r.height)); MPC.dpr=dpr;
  MPC.cv.width=Math.round(MPC.w*dpr); MPC.cv.height=Math.round(MPC.h*dpr);
  mpDesenha();
}

/* ---------- mouse, dedo e caneta ---------- */
function mpMotor(wrap){
  var cv=$("#mpCanvas",wrap);
  if(!cv){ return; }
  MPC={wrap:wrap,cv:cv,ctx:cv.getContext("2d"),w:0,h:0,dpr:1,pedido:0};
  cv.classList.toggle("regua",MP.ferramenta==="regua");
  mpMede();
  if(window.ResizeObserver){ new ResizeObserver(mpMede).observe(wrap); }
  var toques={}, pinca=null, arr=null;
  function dois(){ var k=Object.keys(toques); return k.length===2?[toques[k[0]],toques[k[1]]]:null; }
  function soltaToken(volta){
    if(arr?.m==="t"&&arr.moveu&&volta){ arr.el.dados.x=arr.ox; arr.el.dados.y=arr.oy; mpDesenha(); }
    MP.arrastando=null;
  }
  cv.addEventListener("pointerdown",function(e){
    if(e.pointerType==="mouse"&&e.button>1){ return; }
    try{ cv.setPointerCapture(e.pointerId); }catch(error_){ /* sem captura o arraste so para na borda */ }
    toques[e.pointerId]={x:e.clientX,y:e.clientY};
    var par=dois();
    if(par){ soltaToken(true); MP.medida=null; arr=null; pinca=mpComecaPinca(par,cv); return; }
    arr=mpComecaArraste(e);
    mpPintaPainel(); mpDesenha();
  });
  cv.addEventListener("pointermove",function(e){
    if(toques[e.pointerId]){ toques[e.pointerId]={x:e.clientX,y:e.clientY}; }
    if(pinca){ var par=dois(); if(par){ mpSeguePinca(pinca,par); } return; }
    if(arr){ mpSegueArraste(arr,e); }
  });
  function fim(e,cancelou){
    delete toques[e.pointerId];
    if(!dois()){ pinca=null; }
    if(arr?.m==="t"&&arr.moveu&&!cancelou){ mpSoltaToken(arr,MP.encaixa?e.altKey:!e.altKey); }
    else { soltaToken(cancelou); }
    /* um clique solto com a regua apaga a medida; arrastar deixa ela na tela ate o proximo clique ou Esc */
    if(arr?.m==="r"&&(!arr.moveu||cancelou)){ MP.regua=null; }
    MP.medida=null; mpDesenha();
    arr=null;
  }
  cv.addEventListener("pointerup",function(e){ fim(e,false); });
  cv.addEventListener("pointercancel",function(e){ fim(e,true); });
  cv.addEventListener("dblclick",function(e){
    var p=mpMundo(e), el=mpTokenEm(p.x,p.y);
    if(el&&GM){ mpEditaToken(el); }
  });
  cv.addEventListener("wheel",function(e){
    e.preventDefault();
    var r=cv.getBoundingClientRect();
    mpZoom(e.deltaY<0?1.15:1/1.15,e.clientX-r.left,e.clientY-r.top);
  },{passive:false});
}
/* ponta da regua: o centro do token que esta embaixo, ou o ponto (no centro da casa, se encaixa) */
function mpPontoDaRegua(e,p){
  var el=mpTokenEm(p.x,p.y);
  if(el){ return {x:mpNum(el.dados.x,0),y:mpNum(el.dados.y,0)}; }
  return (MP.encaixa?e.altKey:!e.altKey)?{x:p.x,y:p.y}:mpEncaixa(p.x,p.y,1);
}
function mpComecaArraste(e){
  var p=mpMundo(e), v=mpVista();
  if(MP.ferramenta==="regua"&&e.button!==1){
    var a=mpPontoDaRegua(e,p);
    MP.regua={a:a,b:a};
    return {m:"r",sx:e.clientX,sy:e.clientY,moveu:false};
  }
  var el=e.button===1?null:mpTokenEm(p.x,p.y);
  MP.sel=el?el.id:null;
  /* o servidor so libera o token na vez dele: sem este aviso o arraste viraria um empurrao no fundo, sem explicacao */
  if(el?.esperaVez&&Date.now()-(MP.avisouVezEm||0)>1500){ MP.avisouVezEm=Date.now(); toast("Ainda não é a vez de "+(el.dados.nome||Vm("token"))+".","aviso"); }
  if(el?.podeMover){
    return {m:"t",el:el,dx:p.x-mpNum(el.dados.x,0),dy:p.y-mpNum(el.dados.y,0),sx:e.clientX,sy:e.clientY,
      ox:el.dados.x,oy:el.dados.y,moveu:false};
  }
  return {m:"p",sx:e.clientX,sy:e.clientY,ox:v.x,oy:v.y,moveu:false};
}
function mpSegueArraste(arr,e){
  var dx=e.clientX-arr.sx, dy=e.clientY-arr.sy;
  if(!arr.moveu&&Math.abs(dx)<4&&Math.abs(dy)<4){ return; }
  arr.moveu=true;
  if(arr.m==="r"){
    MP.regua.b=mpPontoDaRegua(e,mpMundo(e));
  } else if(arr.m==="t"){
    MP.arrastando=arr.el.id;
    var p=mpMundo(e), d=arr.el.dados;
    d.x=p.x-arr.dx; d.y=p.y-arr.dy;
    /* o trajeto mostra onde o token vai cair, ja com o encaixe, e quanto custa chegar la */
    var s=(MP.encaixa?e.altKey:!e.altKey)?{x:d.x,y:d.y}:mpEncaixa(d.x,d.y,mpNum(d.tam,1));
    MP.medida={x0:arr.ox,y0:arr.oy,x1:s.x,y1:s.y,el:arr.el,destino:{x:s.x,y:s.y,R:mpRaio(arr.el)}};
  } else {
    var v=mpVista(); v.x=arr.ox+dx; v.y=arr.oy+dy;
  }
  mpDesenha();
}
/* Um passo de teclado: uma casa para o lado escolhido. Na grade hexagonal as setas para os lados andam
   uma casa e as de cima e de baixo vao para a vizinha da direita (com Shift, da esquerda). */
function mpAnda(dx,dy,esquerda){
  var el=mpEl(MP.sel);
  if(!el?.podeMover){ return; }
  var d=el.dados, g=mpGrid(), T=mpLado(), x=mpNum(d.x,0), y=mpNum(d.y,0), nx=x+dx*T, ny=y+dy*T;
  if(g.tipo==="hex"&&dy!==0){ ny=y+dy*1.5*T/Math.sqrt(3); nx=x+(esquerda?-1:1)*T/2; }
  var s=MP.encaixa?mpEncaixa(nx,ny,mpNum(d.tam,1)):{x:nx,y:ny};
  mpMover(el,Math.round(s.x*10)/10,Math.round(s.y*10)/10);
}
function mpSoltaToken(arr,livre){
  var el=arr.el, d=el.dados, s=livre?{x:d.x,y:d.y}:mpEncaixa(d.x,d.y,mpNum(d.tam,1));
  /* volta ao ponto de partida antes de gravar: se o servidor recusar, mpMover desfaz para la */
  d.x=arr.ox; d.y=arr.oy;
  MP.arrastando=null;
  mpMover(el,Math.round(s.x*10)/10,Math.round(s.y*10)/10);
}
function mpComecaPinca(par,cv){
  var r=cv.getBoundingClientRect(), v=mpVista();
  return {d:Math.hypot(par[0].x-par[1].x,par[0].y-par[1].y)||1,z:v.z,x:v.x,y:v.y,
    cx:(par[0].x+par[1].x)/2-r.left,cy:(par[0].y+par[1].y)/2-r.top};
}
function mpSeguePinca(p,par){
  var v=mpVista(), d=Math.hypot(par[0].x-par[1].x,par[0].y-par[1].y)||1;
  var nz=Math.min(MP_ZOOM_MAX,Math.max(MP_ZOOM_MIN,p.z*d/p.d));
  v.x=p.cx-(p.cx-p.x)*(nz/p.z); v.y=p.cy-(p.cy-p.y)*(nz/p.z); v.z=nz;
  mpDesenha();
}
