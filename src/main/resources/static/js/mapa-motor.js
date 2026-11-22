/* Tabletop: desenho do mapa no canvas, pan, zoom, pinca, arraste e ferramentas (js/mapa-motor.js).
   Camadas, desenhos, areas e selecao moram em js/mapa-formas.js. */
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
  /* o estilo do tema tambem chega ao canvas: a letra dos titulos no nome do token e o canto dos botoes no marcador */
  var rb=c("--rb"), canto=Number.parseFloat(rb)*(/rem/.test(rb)?16:1);
  return {fundo:c("--bg"),area:c("--bg2"),ficha:c("--bg3"),ficha2:c("--bg4"),grade:c("--fg"),linha:c("--line2"),borda:c("--line2"),
    texto:c("--fg"),texto2:c("--fg2"),ouro:c("--gold"),perigo:c("--blood"),ok:c("--ok"),aviso:c("--warn"),rotulo:c("--bg"),fonte:c("--ui")||"sans-serif",
    titulo:c("--disp")||c("--ui")||"serif",canto:Number.isFinite(canto)?canto:4};
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
  if(v.novo){ v.novo=false; mpEnquadra(true); mpCentralizaNoMeu(); }
  ctx.translate(v.x,v.y); ctx.scale(v.z,v.z);
  var W=m.largura, H=m.altura;
  ctx.fillStyle=cor.area; ctx.fillRect(0,0,W,H);
  /* so o que esta na tela: a grade de um mapa enorme nao e desenhada inteira a cada quadro */
  var tela={x0:-v.x/v.z,y0:-v.y/v.z,x1:(c.w-v.x)/v.z,y1:(c.h-v.y)/v.z};
  if(GM){
    var im=m.imagem?mpImagem(IMG(m.imagem,"mapa")):null;
    if(im){ ctx.drawImage(im,0,0,W,H); }
  } else { mpPintaTiles(ctx,tela,W,H,v.z); }
  mpPintaVinheta(ctx,W,H,cor);
  mpPintaGrid(ctx,tela,v.z,cor,W,H);
  ctx.strokeStyle=cor.linha; ctx.lineWidth=1/v.z; ctx.strokeRect(0,0,W,H);
  /* camada por camada, de baixo para cima; dentro de cada uma, na ordem da lista */
  mpOrdenados().forEach(function(el){
    if(el.tipo==="DESENHO"){ mpPintaDesenho(ctx,el,v.z,cor); }
    else if(el.tipo==="PAREDE"){ mpPintaParede(ctx,el,v.z,cor); }
    else if(el.tipo==="FOG"){ mpPintaFogForma(ctx,el,v.z,cor); }
    else if(!mpOculto(el)){ mpPintaToken(ctx,el,v.z,cor,tela); }
  });
  mpPintaFog(ctx,v.z,cor);
  mpPintaFerramentas(ctx,v.z,cor);
  mpPintaMedidas(ctx,v.z,cor);
  mpAgendaAnimacao();
}
/* Imersao: as bordas do mapa escurecem na cor de fundo do tema, como uma mesa iluminada no meio */
function mpPintaVinheta(ctx,W,H,cor){
  var R=Math.hypot(W,H)/2, g=ctx.createRadialGradient(W/2,H/2,R*0.55,W/2,H/2,R);
  g.addColorStop(0,"transparent"); g.addColorStop(1,cor.fundo);
  ctx.save(); ctx.globalAlpha=0.45; ctx.fillStyle=g; ctx.fillRect(0,0,W,H); ctx.restore();
}
/* ---------- movimento na tela ---------- */
/* O token movido por outra pessoa desliza ate o lugar novo em vez de saltar. So o desenho anda: a posicao
   gravada (dados.x/y) ja e a nova, entao clique, visao e medidas usam o lugar certo desde o primeiro quadro. */
/* O trajeto vem do servidor (`via`: o que quem moveu desenhou, ou a volta pela parede); sem ele, a linha reta.
   A duracao cresce com o caminho (cerca de 600 px do mapa por segundo), de 260 ms a 1,8 s. */
var MP_DESLIZA_MIN=260, MP_DESLIZA_MAX=1800, MP_DESLIZA_VEL=0.6;
var MPD={};
function mpDesliza(id,x0,y0,x1,y1,via){
  if(mpMovimentoReduzido()||(x0===x1&&y0===y1)||!Number.isFinite(x0)||!Number.isFinite(y0)){ delete MPD[id]; return; }
  var atual=mpPosNaTela({id:id,dados:{x:x0,y:y0}});
  var pts=[atual];
  (Array.isArray(via)?via:[]).forEach(function(p){ if(Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])){ pts.push([p[0],p[1]]); } });
  pts.push([x1,y1]);
  var len=0, ac=[0];
  for(var i=1;i<pts.length;i++){ len+=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]); ac.push(len); }
  MPD[id]={pts:pts,ac:ac,len:len,dur:Math.min(MP_DESLIZA_MAX,Math.max(MP_DESLIZA_MIN,len/MP_DESLIZA_VEL)),t0:performance.now()};
}
/* onde o token aparece agora: ao longo do caminho enquanto desliza */
function mpPosNaTela(el){
  var d=el.dados||{}, x=mpNum(d.x,0), y=mpNum(d.y,0), a=MPD[el.id];
  if(!a){ return [x,y]; }
  var k=(performance.now()-a.t0)/a.dur;
  if(k>=1||a.len<=0){ delete MPD[el.id]; return [x,y]; }
  /* entra e sai devagar, no meio anda a velocidade constante */
  var e=k*k*(3-2*k), alvo=e*a.len, i=1;
  while(i<a.ac.length-1&&a.ac[i]<alvo){ i++; }
  var seg=a.ac[i]-a.ac[i-1], t=seg>0?(alvo-a.ac[i-1])/seg:1, p=a.pts[i-1], q=a.pts[i];
  return [p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];
}
/* Compara a lista antiga com a nova e faz deslizar os tokens que mudaram de lugar (menos o que esta na mao) */
function mpDeslizaMudados(antigos,novos,via){
  var pos={};
  (antigos||[]).forEach(function(e){ if(e.tipo==="TOKEN"){ pos[e.id]=[mpNum(e.dados?.x,NaN),mpNum(e.dados?.y,NaN)]; } });
  (novos||[]).forEach(function(e){
    var p=pos[e.id];
    if(e.tipo!=="TOKEN"||!p||MP.arrastando?.includes(String(e.id))){ return; }
    mpDesliza(e.id,p[0],p[1],mpNum(e.dados?.x,0),mpNum(e.dados?.y,0),via);
  });
}
/* Deslize e halo da vez pedem mais quadros; o halo pulsa a 15 quadros por segundo, o deslize a 60 */
function mpAgendaAnimacao(){
  if(!MPC){ return; }
  if(Object.keys(MPD).length){ mpDesenha(); return; }
  if(MPC.haloT||mpMovimentoReduzido()||document.hidden||!MP.els.some(function(e){ return e.daVez&&e.tipo==="TOKEN"; })){ return; }
  MPC.haloT=setTimeout(function(){ MPC.haloT=0; mpDesenha(); },66);
}
/* Seguir a vez: quando a vez passa para outro token, a tela vai ate ele (se a pessoa ligou) */
function mpSegueAVez(){
  if(!mpSegueVez()||!mpNaTela()){ return; }
  var el=MP.els.find(function(e){ return e.daVez&&e.tipo==="TOKEN"; });
  if(!el||String(el.id)===MP.vezVista){ return; }
  MP.vezVista=String(el.id);
  mpCentralizaSuave(el);
}
function mpCentralizaSuave(el){
  if(!MPC||!el){ return; }
  var v=mpVista(), b=mpBBox(el);
  var x1=(MPC.w-mpLarguraDoPainel())/2-(b.x0+b.x1)/2*v.z, y1=MPC.h/2-(b.y0+b.y1)/2*v.z;
  if(mpMovimentoReduzido()){ v.x=x1; v.y=y1; mpDesenha(); return; }
  var x0=v.x, y0=v.y, t0=performance.now(), dur=450;
  (function passo(){
    var k=Math.min(1,(performance.now()-t0)/dur), e=1-Math.pow(1-k,3);
    v.x=x0+(x1-x0)*e; v.y=y0+(y1-y0)*e; mpDesenha();
    if(k<1){ requestAnimationFrame(passo); }
  })();
}
/* O jogador nao recebe a imagem do mapa, so os pedacos de 512px que a nevoa deixa ver, ja cortados pelo servidor
   (o que esta coberto vem preto). Cada pedaco tem uma versao: mudou, pede de novo e mostra o antigo ate chegar. */
function mpPintaTiles(ctx,tela,W,H,z){
  var t=MP.vista?.tiles;
  if(!t){ return; }
  var L=t.lado*W/Math.max(1,t.w);
  for(var ty=0;ty<t.lins;ty++){
    for(var tx=0;tx<t.cols;tx++){ mpPintaTile(ctx,t,tx,ty,{L:L,W:W,H:H,z:z,tela:tela}); }
  }
}
function mpPintaTile(ctx,t,tx,ty,o){
  var ver=t.v[ty*t.cols+tx], x=tx*o.L, y=ty*o.L, w=Math.min(o.L,o.W-x), h=Math.min(o.L,o.H-y), tela=o.tela;
  if(!ver||x>tela.x1||y>tela.y1||x+w<tela.x0||y+h<tela.y0){ return; }
  var im=mpTile(tx,ty,ver);
  if(!im){ return; }
  /* um fio a mais em cada pedaco, para a emenda entre dois nao aparecer com o zoom */
  var folga=0.6/o.z;
  ctx.drawImage(im,x,y,w+(x+w<o.W?folga:0),h+(y+h<o.H?folga:0));
}
function mpTile(tx,ty,ver){
  var k=MP.id+":"+tx+","+ty, c=MPT[k];
  if(!c||c.v!==ver){
    var velho=c?(c.ok?c.img:c.velho):null, novo={v:ver,img:new Image(),ok:false,velho:velho};
    novo.img.decoding="async";
    novo.img.onload=function(){ novo.ok=true; novo.velho=null; mpDesenha(); };
    novo.img.src=mpAPI("/"+MP.id+"/tile/"+tx+"/"+ty+"?v="+encodeURIComponent(ver));
    MPT[k]=c=novo;
  }
  return c.ok?c.img:c.velho;
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
  var d=el.dados||{}, R=mpRaio(el), p=mpPosNaTela(el), x=p[0], y=p[1];
  if(x+R<tela.x0||x-R>tela.x1||y+R<tela.y0||y-R>tela.y1){ return; }
  var sel=mpEhSel(el.id);
  ctx.save();
  ctx.translate(x,y);
  if(el.daVez){ mpPintaHalo(ctx,R,z,cor); }
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
  if(R*z>=8){ mpPintaVida(ctx,d,R,z,cor); }
  if(R*z>=12||sel){ mpPintaRotulo(ctx,mpRotuloDoToken(d),R,z,cor); mpPintaMarcas(ctx,d,R,z,cor); }
  if(GM&&mpTrancado(el)){ mpPintaCadeado(ctx,-R,-R,z,cor); }
  if(GM&&el.visivel===false){ ctx.globalAlpha=1; mpPintaOlhoFechado(ctx,R-14/z,-R,z,cor); }
  ctx.restore();
}
/* A vez da iniciativa: um brilho dourado em volta do token, que respira devagar (parado com o movimento reduzido) */
function mpPintaHalo(ctx,R,z,cor){
  var k=mpMovimentoReduzido()?0.5:(Math.sin(performance.now()/420)+1)/2;
  var r0=R*0.9, r1=R+(10+6*k)/z, g=ctx.createRadialGradient(0,0,r0,0,0,r1);
  g.addColorStop(0,cor.ouro); g.addColorStop(1,"transparent");
  ctx.save(); ctx.globalAlpha=0.35+0.25*k; ctx.fillStyle=g;
  ctx.beginPath(); ctx.arc(0,0,r1,0,Math.PI*2); ctx.fill(); ctx.restore();
}
/* Oculto para os jogadores: so o mestre ve o token, meio apagado e com um olho cortado no canto */
function mpPintaOlhoFechado(ctx,x,y,z,cor){
  var u=1/z;
  ctx.save();
  ctx.translate(x,y);
  ctx.fillStyle=cor.rotulo; ctx.fillRect(0,0,14*u,14*u);
  ctx.strokeStyle=cor.texto; ctx.lineWidth=1.3*u; ctx.lineCap="round";
  ctx.beginPath(); ctx.ellipse(7*u,7*u,5*u,3*u,0,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(7*u,7*u,1.3*u,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(2.5*u,11.5*u); ctx.lineTo(11.5*u,2.5*u); ctx.stroke();
  ctx.restore();
}
/* o nome e, com vida, quanto ela vale: a barra sozinha seria so cor */
function mpRotuloDoToken(d){
  var max=mpNum(d.vidaMax,0);
  return max>0?String(d.nome||"")+" · "+mpFmt(mpNum(d.vida,0))+"/"+mpFmt(max):d.nome;
}
/* cabe inteira dentro de 2R x 2R, mantendo a proporcao */
function mpPintaImagem(ctx,im,R){
  var k=Math.min(2*R/im.width,2*R/im.height);
  ctx.drawImage(im,-im.width*k/2,-im.height*k/2,im.width*k,im.height*k);
}
/* token sem imagem: um quadrado liso, para ainda ter onde pegar */
function mpPintaMarcador(ctx,R,cor){
  var g=ctx.createLinearGradient(0,-R,0,R), k=Math.min(cor.canto,R*0.5);
  g.addColorStop(0,cor.ficha2); g.addColorStop(1,cor.ficha);
  ctx.fillStyle=g; ctx.strokeStyle=cor.borda; ctx.lineWidth=Math.max(1,R*0.06);
  ctx.beginPath();
  if(ctx.roundRect){ ctx.roundRect(-R,-R,2*R,2*R,k); } else { ctx.rect(-R,-R,2*R,2*R); }
  ctx.fill(); ctx.stroke();
}
function mpPintaIniciais(ctx,d,R,cor){
  ctx.fillStyle=cor.texto; ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.font="700 "+Math.max(6,R*0.8)+"px "+cor.titulo;
  ctx.fillText(mpIniciais(d.nome),0,R*0.04);
}
/* nome embaixo do token, sempre com 12px na tela, seja qual for o zoom */
function mpPintaRotulo(ctx,nome,R,z,cor){
  var t=String(nome||"");
  if(!t){ return; }
  var fs=13/z, pad=4/z;
  ctx.font="700 "+fs+"px "+cor.titulo;
  var w=ctx.measureText(t).width;
  ctx.globalAlpha=Math.min(ctx.globalAlpha,0.88);
  ctx.fillStyle=cor.rotulo; ctx.strokeStyle=cor.linha; ctx.lineWidth=1/z;
  ctx.beginPath();
  if(ctx.roundRect){ ctx.roundRect(-w/2-pad,R+pad,w+pad*2,fs+pad*2,Math.min(cor.canto,6)/z); } else { ctx.rect(-w/2-pad,R+pad,w+pad*2,fs+pad*2); }
  ctx.fill(); ctx.stroke();
  ctx.globalAlpha=1;
  ctx.fillStyle=cor.texto; ctx.textAlign="center"; ctx.textBaseline="top";
  ctx.fillText(t,0,R+pad*2);
}
/* barra de vida em cima do token; o numero vai no rotulo, a cor so reforca */
function mpPintaVida(ctx,d,R,z,cor){
  var max=mpNum(d.vidaMax,0);
  if(max<=0){ return; }
  var f=Math.max(0,Math.min(1,mpNum(d.vida,0)/max)), h=6/z, y=-R-h-2/z;
  ctx.save(); ctx.globalAlpha=1;
  ctx.fillStyle=cor.ficha; ctx.fillRect(-R,y,2*R,h);
  ctx.fillStyle=f>0.5?cor.ok:(f>0.25?cor.aviso:cor.perigo); ctx.fillRect(-R,y,2*R*f,h);
  ctx.strokeStyle=cor.linha; ctx.lineWidth=1/z; ctx.strokeRect(-R,y,2*R,h);
  ctx.restore();
}
/* condicoes, efeitos e status ao lado do token: o texto e o que vale, a cor e so a faixa */
function mpPintaMarcas(ctx,d,R,z,cor){
  var ms=Array.isArray(d.marcas)?d.marcas:[];
  if(!ms.length){ return; }
  var fs=12/z, pad=3/z, alt=fs+pad*2, x=R+4/z;
  ctx.save(); ctx.globalAlpha=1;
  ctx.font="600 "+fs+"px "+cor.fonte; ctx.textAlign="left"; ctx.textBaseline="middle";
  var lista=ms.slice(0,3).map(function(m){ return {t:m.t,c:m.c}; });
  if(ms.length>3){ lista.push({t:"+"+(ms.length-3),c:"neutro"}); }
  lista.forEach(function(m,i){
    var w=ctx.measureText(m.t).width, y=-R+i*(alt+2/z);
    ctx.globalAlpha=0.92; ctx.fillStyle=cor.rotulo; ctx.fillRect(x,y,w+pad*2+3/z,alt);
    ctx.globalAlpha=1; ctx.fillStyle=mpCorDe(m.c,cor); ctx.fillRect(x,y,3/z,alt);
    ctx.fillStyle=cor.texto; ctx.fillText(m.t,x+pad+3/z,y+alt/2);
  });
  ctx.restore();
}
/* o cadeado so aparece para o mestre: o jogador nao sabe o que esta trancado, so que nao se mexe */
function mpPintaCadeado(ctx,x,y,z,cor){
  var u=1/z;
  ctx.save();
  ctx.translate(x,y);
  ctx.fillStyle=cor.rotulo; ctx.fillRect(0,0,14*u,14*u);
  ctx.fillStyle=cor.texto; ctx.fillRect(3*u,7*u,8*u,5*u);
  ctx.strokeStyle=cor.texto; ctx.lineWidth=1.5*u;
  ctx.beginPath(); ctx.arc(7*u,6*u,2.5*u,Math.PI,0); ctx.stroke();
  ctx.restore();
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
/* Regua por pontos: cada clique e um ponto do caminho; Enter ou duplo clique termina, o clique seguinte comeca outro. */
function mpPontoDoTrajeto(a){
  var r=MP.regua;
  if(!r?.pts||r.fim){ MP.regua={a:a,b:a,pts:[a],fim:false,cursor:a}; return; }
  r.pts.push(a); r.b=a;
}
function mpTerminaTrajeto(doisCliques){
  var r=MP.regua;
  if(!r?.pts){ return; }
  /* o segundo clique do duplo clique ja pos um ponto igual ao anterior */
  if(doisCliques&&r.pts.length>1){
    var u=r.pts[r.pts.length-1], v=r.pts[r.pts.length-2];
    if(Math.hypot(u.x-v.x,u.y-v.y)<2){ r.pts.pop(); }
  }
  r.fim=true; r.cursor=null; mpDesenha();
}
function mpPintaMedidas(ctx,z,cor){
  var a=MP.medida;
  if(a){ mpPintaTraco(ctx,z,cor,a); }
  var r=MP.regua;
  if(r?.pts){
    var t=r.pts.map(function(q){ return [q.x,q.y]; });
    if(r.cursor&&!r.fim){ t.push([r.cursor.x,r.cursor.y]); }
    if(t.length>1){ mpPintaTraco(ctx,z,cor,{x0:t[0][0],y0:t[0][1],x1:t[t.length-1][0],y1:t[t.length-1][1],trilha:t,fantasma:0}); }
    return;
  }
  if(r&&(r.a.x!==r.b.x||r.a.y!==r.b.y)){ mpPintaTraco(ctx,z,cor,{x0:r.a.x,y0:r.a.y,x1:r.b.x,y1:r.b.y,fantasma:0,visao:true}); }
}
/* a linha, as pontas e o rotulo com 12px na tela; passando do deslocamento, a linha vira vermelha
   e o rotulo diz quanto passou (a cor sozinha nao conta) */
/* a soma dos trechos de um caminho; nunca menos que a reta, como o servidor cobra */
function mpDistTrilha(t){
  var s=0;
  for(var i=1;i<t.length;i++){ s+=mpDistCasas(t[i-1][0],t[i-1][1],t[i][0],t[i][1]); }
  var u=t[t.length-1];
  return Math.max(s,mpDistCasas(t[0][0],t[0][1],u[0],u[1]));
}
/* o rotulo da medida e se ela passa do limite (deslocamento do turno, visao bloqueada, sem caminho) */
function mpRotuloMedida(a){
  var casas=a.trilha?mpDistTrilha(a.trilha):mpDistCasas(a.x0,a.y0,a.x1,a.y1), texto=mpDistTexto(casas), passa=false;
  if(a.el&&!GM&&mpNum(a.el.dados?.desl,0)>0){
    var resta=a.el.dados.desl-mpNum(a.el.dados.usado,0), custo=casas*mpEscalaCasa();
    passa=custo>resta+0.000001;
    texto+=passa?" · passa "+mpFmt(custo-resta)+" "+mpUnidade():" · restam "+mpFmt(resta-custo)+" "+mpUnidade();
  }
  /* so o mestre, e so com parede de visao no mapa: a regua diz se um ponto enxerga o outro */
  if(a.visao&&GM&&mpTemParedeDeVisao()){
    var ve=mpLivreTrecho(mpTrechos(true),a.x0,a.y0,a.x1,a.y1,true,true);
    texto+=ve?" · visão livre":" · visão bloqueada"; passa=!ve;
  }
  /* o jogador que arrasta o token para um lugar sem caminho: a cor sozinha nao diz, entao o rotulo diz */
  if(a.semCaminho){ texto="sem caminho: há parede"; passa=true; }
  /* o jogador ve que o token vai dar a volta (e paga a volta): a linha segue o contorno e o rotulo diz */
  else if(a.contorno){ texto+=" · contornando a parede"; }
  return {texto:texto,passa:passa};
}
function mpPintaTraco(ctx,z,cor,a){
  var rot=mpRotuloMedida(a), texto=rot.texto, passa=rot.passa;
  ctx.save();
  ctx.strokeStyle=passa?cor.perigo:cor.ouro; ctx.fillStyle=ctx.strokeStyle; ctx.lineWidth=2/z;
  ctx.setLineDash([8/z,5/z]);
  ctx.beginPath(); ctx.moveTo(a.x0,a.y0);
  if(a.trilha){ a.trilha.forEach(function(q,i){ if(i){ ctx.lineTo(q[0],q[1]); } }); } else { ctx.lineTo(a.x1,a.y1); }
  ctx.stroke();
  ctx.setLineDash([]);
  [[a.x0,a.y0],[a.x1,a.y1]].forEach(function(p){ ctx.beginPath(); ctx.arc(p[0],p[1],4/z,0,Math.PI*2); ctx.fill(); });
  if(a.destino){ ctx.strokeRect(a.destino.x-a.destino.R,a.destino.y-a.destino.R,2*a.destino.R,2*a.destino.R); }
  var fs=12/z, pad=4/z, mx=a.trilha?a.x1:(a.x0+a.x1)/2, my=a.trilha?a.y1-14/z:(a.y0+a.y1)/2;
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
/* O token (so token) que esta embaixo do ponto: de cima para baixo, sem as camadas escondidas. */
function mpTokenEm(wx,wy){
  var l=mpOrdenados();
  for(var i=l.length-1;i>=0;i--){
    var el=l[i];
    if(el.tipo==="TOKEN"&&!mpOculto(el)&&mpAcertaToken(el,wx,wy)){ return el; }
  }
  return null;
}
function mpAcertaToken(el,wx,wy){
  var d=el.dados||{}, R=mpRaio(el);
  return Math.abs(wx-mpNum(d.x,0))<=R&&Math.abs(wy-mpNum(d.y,0))<=R;
}
/* O elemento de cima do ponto, token ou desenho: e o que o mestre seleciona. */
function mpElementoEm(wx,wy){
  var l=mpOrdenados(), z=mpVista().z;
  for(var i=l.length-1;i>=0;i--){
    var el=l[i];
    if((el.tipo==="FOG"&&mpFogModo()==="nenhum")||mpPincelada(el)){ continue; }
    var acerta=el.tipo==="TOKEN"?mpAcertaToken(el,wx,wy):(el.tipo==="PAREDE"?mpAcertaParede(el,wx,wy,z):mpAcertaDesenho(el,wx,wy,z));
    if(acerta){ return el; }
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
/* Dois enquadramentos: "preenche" (o padrao) ocupa a area toda e corta o que sobra de um lado; "inteiro" mostra
   o mapa todo com uma margem. O 0 e o botao alternam entre os dois. */
function mpEnquadra(semDesenhar){
  var m=MP.mapa;
  if(!MPC||!m||!MPC.w){ return; }
  var v=mpVista(), inteiro=v.modo==="inteiro", pad=inteiro?24:0, esq=mpLarguraDasFerramentas(), w=MPC.w-mpLarguraDoPainel()-esq;
  var kx=(w-pad*2)/m.largura, ky=(MPC.h-pad*2)/m.altura;
  v.z=Math.min(MP_ZOOM_MAX,Math.max(MP_ZOOM_MIN,inteiro?Math.min(kx,ky):Math.max(kx,ky)));
  v.x=esq+(w-m.largura*v.z)/2; v.y=(MPC.h-m.altura*v.z)/2;
  if(!semDesenhar){ mpDesenha(); }
}
/* na tela larga o painel aberto cobre a direita do mapa: enquadrar usa so o que sobra. No
   celular ele e uma gaveta que a pessoa abre e fecha, entao nao conta. */
function mpAlternaEnquadre(){
  var v=mpVista();
  v.modo=v.modo==="inteiro"?"preenche":"inteiro";
  mpEnquadra();
  var b=$('[data-mpz="0"]');
  if(b){ var t=v.modo==="inteiro"?"Preencher a tela com o "+vmin("mapa"):"Ver o "+vmin("mapa")+" inteiro"; b.title=t+" (0)"; b.setAttribute("aria-label",t); }
}
/* A coluna de ferramentas flutua sobre a esquerda do mapa: enquadrar comeca depois dela, senao o
   que estava no canto (no celular, o proprio token do jogador) nascia escondido embaixo dos botoes. */
function mpLarguraDasFerramentas(){
  var f=MPC?.wrap.querySelector(".cvtools:not(.mpdesenho)");
  if(!f?.offsetWidth){ return 0; }
  var r=f.getBoundingClientRect(), w=MPC.wrap.getBoundingClientRect();
  return r.left-w.left<w.width/2?Math.round(r.right-w.left)+8:0;
}
/* Na abertura, o jogador ve primeiro o proprio personagem: com um token dele no mapa, a vista
   centraliza nele (no mesmo zoom do enquadramento). Sem token, fica o enquadramento. */
function mpCentralizaNoMeu(){
  if(GM||!MPC){ return; }
  var el=MP.els.find(function(e){ return e.tipo==="TOKEN"&&e.meu; });
  if(!el){ return; }
  var v=mpVista(), b=mpBBox(el), esq=mpLarguraDasFerramentas();
  v.x=esq+(MPC.w-mpLarguraDoPainel()-esq)/2-(b.x0+b.x1)/2*v.z; v.y=MPC.h/2-(b.y0+b.y1)/2*v.z;
}
function mpLarguraDoPainel(){
  var p=$("#mpPainel");
  if(!p||p.hidden||window.innerWidth<=900){ return 0; }
  return p.offsetWidth+16;
}
function mpZoom(fator,cx,cy){
  var v=mpVista(), nz=Math.min(MP_ZOOM_MAX,Math.max(MP_ZOOM_MIN,v.z*fator));
  v.x=cx-(cx-v.x)*(nz/v.z); v.y=cy-(cy-v.y)*(nz/v.z); v.z=nz;
  mpDesenha();
}
function mpCentraliza(el){
  if(!MPC||!el){ return; }
  var v=mpVista(), b=mpBBox(el), esq=mpLarguraDasFerramentas();
  v.x=esq+(MPC.w-mpLarguraDoPainel()-esq)/2-(b.x0+b.x1)/2*v.z; v.y=MPC.h/2-(b.y0+b.y1)/2*v.z;
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
/* mover e selecionar arrastam; regua, area e as formas de desenho "miram" (cursor de mira) */
function mpMira(){ return MP.ferramenta!=="mover"&&MP.ferramenta!=="selecionar"; }
/* Encaixar na grade e escolha do mestre para todos (regras.encaixe do mapa); o Alt, so do mestre, inverte no arraste. */
function mpEncaixando(){ return MP.mapa?.regras?.encaixe!==false; }
function mpLivre(e){
  var enc=mpEncaixando();
  return GM?(enc?e.altKey:!e.altKey):!enc;
}
function mpMotor(wrap){
  var cv=$("#mpCanvas",wrap);
  if(!cv){ return; }
  MPC={wrap:wrap,cv:cv,ctx:cv.getContext("2d"),w:0,h:0,dpr:1,pedido:0};
  cv.classList.toggle("regua",mpMira());
  mpMede();
  if(window.ResizeObserver){ new ResizeObserver(mpMede).observe(wrap); }
  var toques={}, pinca=null, arr=null;
  function dois(){ var k=Object.keys(toques); return k.length===2?[toques[k[0]],toques[k[1]]]:null; }
  cv.addEventListener("pointerdown",function(e){
    if(e.pointerType==="mouse"&&e.button>1){ return; }
    try{ cv.setPointerCapture(e.pointerId); }catch(error_){ /* sem captura o arraste so para na borda */ }
    toques[e.pointerId]={x:e.clientX,y:e.clientY};
    var par=dois();
    if(par){ mpRestauraArraste(arr); MP.arrastando=null; MP.medida=null; MP.rascunho=null; MP.caixa=null; arr=null; pinca=mpComecaPinca(par,cv); return; }
    arr=mpComecaArraste(e);
    mpPintaPainel(); mpDesenha();
  });
  cv.addEventListener("pointermove",function(e){
    if(toques[e.pointerId]){ toques[e.pointerId]={x:e.clientX,y:e.clientY}; }
    if(MP.ferramenta==="pincel"&&!arr){ MP.pincelCur=mpMundo(e); mpDesenha(); }
    if(pinca){ var par=dois(); if(par){ mpSeguePinca(pinca,par); } return; }
    if(arr){ mpSegueArraste(arr,e); return; }
    /* o poligono e o trajeto da regua mostram o proximo lado seguindo o cursor, mesmo sem botao apertado */
    if(mpEhPoli(MP.rascunho)){ var q=mpPontoDesenho(e,mpMundo(e)); MP.rascunho.cursor=q; mpDesenha(); }
    else if(MP.regua?.pts&&!MP.regua.fim){ MP.regua.cursor=mpPontoDaRegua(e,mpMundo(e)); mpDesenha(); }
  });
  function fim(e,cancelou){
    delete toques[e.pointerId];
    if(!dois()){ pinca=null; }
    var a=arr; arr=null;
    if(a){ mpTerminaArraste(a,e,cancelou); } else { MP.arrastando=null; }
    MP.medida=null; mpDesenha();
  }
  cv.addEventListener("pointerleave",function(){ if(MP.pincelCur){ MP.pincelCur=null; mpDesenha(); } });
  cv.addEventListener("pointerup",function(e){ fim(e,false); });
  cv.addEventListener("pointercancel",function(e){ fim(e,true); });
  cv.addEventListener("dblclick",function(e){
    if(mpEhPoli(MP.rascunho)){ mpFechaPoligono(true); return; }
    if(MP.regua?.pts&&!MP.regua.fim){ mpTerminaTrajeto(true); return; }
    if(!GM){
      /* o jogador abre so o proprio token: nele ele muda a vida e as marcas */
      var q=mpMundo(e), meu=mpTokenEm(q.x,q.y);
      if(meu?.meu){ mpEditaMeuToken(meu); }
      return;
    }
    var p=mpMundo(e), el=mpElementoEm(p.x,p.y);
    if(!el){ return; }
    if(el.tipo==="DESENHO"){ mpEditaDesenho(el); } else if(el.tipo==="PAREDE"){ mpEditaParede(el); } else if(el.tipo==="FOG"){ mpEditaFog(el); } else { mpEditaToken(el); }
  });
  cv.addEventListener("wheel",function(e){
    e.preventDefault();
    var r=cv.getBoundingClientRect();
    mpZoom(e.deltaY<0?1.15:1/1.15,e.clientX-r.left,e.clientY-r.top);
  },{passive:false});
}
/* O que cada modo de arraste faz ao soltar (arr.m: t token do jogador, g grupo do mestre, p fundo,
   r regua, a area, d/dp/dm desenho, s caixa de selecao). */
function mpTerminaArraste(a,e,cancelou){
  var livre=mpLivre(e);
  if(a.m==="t"&&a.moveu&&!cancelou){ mpSoltaToken(a,livre); }
  else if(a.m==="g"&&a.moveu&&!cancelou){ mpSoltaGrupo(a,livre); }
  else { if(cancelou){ mpRestauraArraste(a); } MP.arrastando=null; }
  /* um clique solto com a regua ou a area apaga a medida; arrastar deixa ela na tela ate o proximo clique ou Esc */
  if(a.m==="r"&&(!a.moveu||cancelou)){ MP.regua=null; }
  if(a.m==="a"){ if(!a.moveu||cancelou){ MP.area=null; } mpPintaPainel(); }
  if(a.m==="d"||a.m==="dp"||a.m==="dm"){ mpTerminaDesenho(a,cancelou); }
  if(a.m==="pn"){ mpTerminaPincel(a,cancelou); }
  if(a.m==="s"){ mpTerminaCaixa(a,cancelou); }
}
/* ponta da regua: o centro do token que esta embaixo, ou o ponto (no centro da casa, se encaixa) */
function mpPontoDaRegua(e,p){
  var el=mpTokenEm(p.x,p.y);
  if(el){ return {x:mpNum(el.dados.x,0),y:mpNum(el.dados.y,0)}; }
  return mpLivre(e)?{x:p.x,y:p.y}:mpEncaixa(p.x,p.y,1);
}
/* origem de uma area: o centro do token, ou o canto da casa mais perto (e onde o molde se apoia) */
function mpPontoDaArea(e,p){
  var el=mpTokenEm(p.x,p.y);
  if(el){ return {x:mpNum(el.dados.x,0),y:mpNum(el.dados.y,0)}; }
  return mpPontoDesenho(e,p);
}
function mpArrastaFundo(e,v){ return {m:"p",sx:e.clientX,sy:e.clientY,ox:v.x,oy:v.y,moveu:false}; }
function mpComecaArraste(e){
  var p=mpMundo(e), v=mpVista(), f=MP.ferramenta;
  if(e.button===1){ return mpArrastaFundo(e,v); }
  if(f==="ping"){ mpPing(p); return {m:"n",sx:e.clientX,sy:e.clientY,moveu:false}; }
  if(f==="regua"){
    var a=mpPontoDaRegua(e,p);
    if(MP.reguaModo==="trajeto"){ mpPontoDoTrajeto(a); return {m:"n",sx:e.clientX,sy:e.clientY,moveu:false}; }
    MP.regua={a:a,b:a};
    return {m:"r",sx:e.clientX,sy:e.clientY,moveu:false};
  }
  if(f.indexOf("a-")===0){
    var o=mpPontoDaArea(e,p);
    MP.area={tipo:f.slice(2),a:o,b:o};
    return {m:"a",sx:e.clientX,sy:e.clientY,moveu:false};
  }
  if(GM&&MP_FORMAS.includes(f)){ return mpComecaDesenho(e,p,f); }
  if(GM&&f==="parede"){ return mpComecaDesenho(e,p,"parede"); }
  if(GM&&f==="fog"){ return mpComecaDesenho(e,p,MP.fogForma); }
  if(GM&&f==="pincel"){ return mpComecaPincel(e,p); }
  return GM?mpComecaSelecao(e,p,v):mpComecaJogador(e,p,v);
}
/* o jogador so mexe nos tokens: tocar em desenho ou fundo arrasta o fundo */
function mpComecaJogador(e,p,v){
  var el=mpTokenEm(p.x,p.y);
  mpSelecionaIds(el?[el.id]:[]);
  /* o servidor so libera o token na vez dele: sem este aviso o arraste viraria um empurrao no fundo, sem explicacao */
  if(el?.esperaVez&&Date.now()-(MP.avisouVezEm||0)>1500){ MP.avisouVezEm=Date.now(); toast("Ainda não é a vez de "+(el.dados.nome||Vm("token"))+".","aviso"); }
  if(el&&mpMovivel(el)){
    return {m:"t",el:el,dx:p.x-mpNum(el.dados.x,0),dy:p.y-mpNum(el.dados.y,0),sx:e.clientX,sy:e.clientY,
      ox:el.dados.x,oy:el.dados.y,moveu:false,trilha:[[mpNum(el.dados.x,0),mpNum(el.dados.y,0)]]};
  }
  return mpArrastaFundo(e,v);
}
/* O mestre seleciona token e desenho. Shift ou Ctrl soma ou tira da selecao; arrastar um item da
   selecao leva todos os soltos juntos; arrastar o vazio (com Shift, ou na ferramenta Selecionar)
   desenha a caixa de selecao. */
function mpComecaSelecao(e,p,v){
  var el=mpElementoEm(p.x,p.y), aditivo=e.shiftKey||e.ctrlKey||e.metaKey;
  if(el){
    if(aditivo){ mpAlternaSel(el.id); return {m:"n",sx:e.clientX,sy:e.clientY,moveu:false}; }
    if(!mpEhSel(el.id)){ mpSelecionaIds([el.id]); }
    if(mpMovivel(el)){ return mpComecaGrupo(e,p,el); }
    if(Date.now()-(MP.avisouTrancoEm||0)>1500){ MP.avisouTrancoEm=Date.now(); toast("Está trancado: destranque para mexer.","aviso"); }
    return mpArrastaFundo(e,v);
  }
  if(MP.ferramenta==="selecionar"||aditivo){
    MP.caixa={a:p,b:p};
    return {m:"s",a:p,b:p,add:aditivo,base:aditivo?mpSelecao():[],sx:e.clientX,sy:e.clientY,moveu:false};
  }
  mpSelecionaIds([]);
  return mpArrastaFundo(e,v);
}
/* ---------- arraste em grupo (mestre) ---------- */
function mpAncora(el){
  var d=el.dados||{};
  return el.tipo!=="TOKEN"?{x:d.pts[0][0],y:d.pts[0][1]}:{x:mpNum(d.x,0),y:mpNum(d.y,0)};
}
/* o estado de antes de cada item: e dele que se parte a cada quadro, e para ele que se volta se der errado */
function mpSnap(el){
  var d=el.dados, s={el:el};
  if(el.tipo!=="TOKEN"){ s.pts=d.pts.map(function(q){ return [q[0],q[1]]; }); } else { s.x=mpNum(d.x,0); s.y=mpNum(d.y,0); }
  return s;
}
function mpAplicaSnap(s,dx,dy){
  var d=s.el.dados;
  if(s.pts){ d.pts=s.pts.map(function(q){ return [q[0]+dx,q[1]+dy]; }); } else { d.x=s.x+dx; d.y=s.y+dy; }
}
function mpComecaGrupo(e,p,el){
  var snaps=mpSelecionados().filter(mpMovivel).map(mpSnap), an=mpAncora(el);
  return {m:"g",el:el,snaps:snaps,an:an,dx:p.x-an.x,dy:p.y-an.y,delta:{x:0,y:0},sx:e.clientX,sy:e.clientY,moveu:false};
}
/* onde o grupo cai: o item que se segura vai para o encaixe (o centro da casa, para o token; o canto, para o desenho) e os outros andam o mesmo */
function mpDeltaFinal(arr,livre){
  if(livre){ return {dx:arr.delta.x,dy:arr.delta.y}; }
  var tx=arr.an.x+arr.delta.x, ty=arr.an.y+arr.delta.y;
  var s=arr.el.tipo!=="TOKEN"?mpEncaixaPonto(tx,ty):mpEncaixa(tx,ty,mpNum(arr.el.dados.tam,1));
  return {dx:s.x-arr.an.x,dy:s.y-arr.an.y};
}
function mpRestauraGrupo(arr){
  arr.snaps.forEach(function(s){ mpAplicaSnap(s,0,0); });
  mpDesenha();
}
function mpRestauraArraste(a){
  if(!a?.moveu){ return; }
  if(a.m==="t"){ a.el.dados.x=a.ox; a.el.dados.y=a.oy; mpDesenha(); }
  else if(a.m==="g"){ mpRestauraGrupo(a); }
}
function mpArred(n){ return Math.round(n*10)/10; }
function mpItemMovido(el){
  var d=el.dados;
  return {id:el.id,dados:d.pts?{pts:d.pts.map(function(q){ return [mpArred(q[0]),mpArred(q[1])]; })}:{x:mpArred(d.x),y:mpArred(d.y)}};
}
function mpSoltaGrupo(arr,livre){
  var f=mpDeltaFinal(arr,livre);
  MP.arrastando=null;
  if(Math.abs(f.dx)<0.05&&Math.abs(f.dy)<0.05){ mpRestauraGrupo(arr); return; }
  var un=arr.snaps.length===1?arr.snaps[0]:null;
  /* um token so segue o caminho de sempre (PUT do token); o resto vai numa operacao so */
  if(un&&!un.pts){ mpAplicaSnap(un,0,0); mpMover(un.el,mpArred(un.x+f.dx),mpArred(un.y+f.dy)); return; }
  var itens=arr.snaps.map(function(s){ mpAplicaSnap(s,f.dx,f.dy); return mpItemMovido(s.el); });
  mpLote(itens,"não consegui mover").catch(function(){ mpRestauraGrupo(arr); });
}
/* ---------- desenhar ---------- */
function mpComecaDesenho(e,p,f){
  var a=mpPontoDesenho(e,p), base={sx:e.clientX,sy:e.clientY,moveu:false,forma:f,p:a};
  if(f==="marca"){ base.m="dm"; return base; }
  if(f==="poligono"||f==="parede"){ base.m="dp"; return base; }
  MP.rascunho={forma:f,pts:[[a.x,a.y],[a.x,a.y]]};
  base.m="d";
  return base;
}
function mpTerminaDesenho(a,cancelou){
  if(a.m==="d"){
    var r=MP.rascunho; MP.rascunho=null;
    if(!cancelou&&a.moveu&&r&&Math.hypot(r.pts[1][0]-r.pts[0][0],r.pts[1][1]-r.pts[0][1])>=2){ mpCriaForma(r.forma,r.pts); }
  } else if(!cancelou&&!a.moveu){
    if(a.m==="dm"){ mpNovaMarca(a.p); } else { mpPontoPoligono(a.p,a.forma); }
  }
}
/* cada clique e um vertice; clicar perto do primeiro, dar dois cliques ou apertar Enter fecha */
function mpEhPoli(r){ return !!r&&(r.forma==="poligono"||r.forma==="parede"); }
function mpPontoPoligono(p,forma){
  var r=MP.rascunho;
  if(!r){ MP.rascunho={forma:forma||"poligono",pts:[[p.x,p.y]],cursor:p}; return; }
  var pr=r.pts[0];
  /* a parede e uma linha aberta: so Enter ou duplo clique terminam */
  if(r.forma==="poligono"&&r.pts.length>=3&&Math.hypot(p.x-pr[0],p.y-pr[1])<=10/mpVista().z){ mpFechaPoligono(false); return; }
  r.pts.push([p.x,p.y]);
}
function mpFechaPoligono(doisCliques){
  var r=MP.rascunho;
  if(!r){ return; }
  var pts=r.pts.slice();
  /* o segundo clique do duplo clique ja pos um vertice igual ao anterior */
  if(doisCliques&&pts.length>1){
    var u=pts[pts.length-1], a=pts[pts.length-2];
    if(Math.hypot(u[0]-a[0],u[1]-a[1])<2){ pts.pop(); }
  }
  MP.rascunho=null;
  if(pts.length>=(r.forma==="parede"?2:3)){ mpCriaForma(r.forma,pts); } else { mpDesenha(); }
}
/* ---------- caixa de selecao ---------- */
function mpTerminaCaixa(a,cancelou){
  MP.caixa=null;
  if(cancelou){ return; }
  if(!a.moveu){ if(!a.add){ mpSelecionaIds([]); } return; }
  var r={x0:Math.min(a.a.x,a.b.x),y0:Math.min(a.a.y,a.b.y),x1:Math.max(a.a.x,a.b.x),y1:Math.max(a.a.y,a.b.y)};
  var ids=mpOrdenados().filter(function(el){ if(mpPincelada(el)){ return false; } var b=mpBBox(el); return b.x1>=r.x0&&b.x0<=r.x1&&b.y1>=r.y0&&b.y0<=r.y1; })
    .map(function(el){ return String(el.id); });
  mpSelecionaIds(a.base.concat(ids.filter(function(i){ return !a.base.includes(i); })));
}
function mpSegueArraste(arr,e){
  var dx=e.clientX-arr.sx, dy=e.clientY-arr.sy;
  if(!arr.moveu&&Math.abs(dx)<4&&Math.abs(dy)<4){ return; }
  arr.moveu=true;
  var m=arr.m;
  if(m==="pn"){
    mpSeguePincel(e);
  } else if(m==="r"){
    MP.regua.b=mpPontoDaRegua(e,mpMundo(e));
  } else if(m==="a"){
    MP.area.b=mpPontoDaArea(e,mpMundo(e));
  } else if(m==="d"){
    var b=mpPontoDesenho(e,mpMundo(e));
    MP.rascunho.pts[1]=[b.x,b.y];
  } else if(m==="s"){
    arr.b=mpMundo(e); MP.caixa={a:arr.a,b:arr.b};
  } else if(m==="t"){
    MP.arrastando=[String(arr.el.id)];
    var p=mpMundo(e), d=arr.el.dados;
    d.x=p.x-arr.dx; d.y=p.y-arr.dy;
    /* o trajeto mostra onde o token vai cair, ja com o encaixe, e quanto custa chegar la */
    var s=mpLivre(e)?{x:d.x,y:d.y}:mpEncaixa(d.x,d.y,mpNum(d.tam,1));
    mpAnotaTrilha(arr,d);
    var trilha=arr.trilha.concat([[s.x,s.y]]), rota=mpRotaDoToken(arr.ox,arr.oy,s.x,s.y,trilha,arr.el);
    MP.medida={x0:arr.ox,y0:arr.oy,x1:s.x,y1:s.y,el:arr.el,destino:{x:s.x,y:s.y,R:mpRaio(arr.el)},
      trilha:Array.isArray(rota)?rota:trilha,semCaminho:rota===false,contorno:Array.isArray(rota),rotaChave:mpChaveRota(arr.el,s.x,s.y)};
  } else if(m==="g"){
    mpSegueGrupo(arr,e);
  } else if(m==="p"){
    var v=mpVista(); v.x=arr.ox+dx; v.y=arr.oy+dy;
  }
  mpDesenha();
}
function mpSegueGrupo(arr,e){
  MP.arrastando=arr.snaps.map(function(s){ return String(s.el.id); });
  var p=mpMundo(e);
  arr.delta={x:p.x-arr.dx-arr.an.x,y:p.y-arr.dy-arr.an.y};
  arr.snaps.forEach(function(s){ mpAplicaSnap(s,arr.delta.x,arr.delta.y); });
  if(arr.el.tipo!=="TOKEN"){ return; }
  var f=mpDeltaFinal(arr,mpLivre(e));
  MP.medida={x0:arr.an.x,y0:arr.an.y,x1:arr.an.x+f.dx,y1:arr.an.y+f.dy,el:arr.el,destino:{x:arr.an.x+f.dx,y:arr.an.y+f.dy,R:mpRaio(arr.el)}};
}
/* Um passo de teclado: uma casa para o lado escolhido. Na grade hexagonal as setas para os lados andam
   uma casa e as de cima e de baixo vao para a vizinha da direita (com Shift, da esquerda). Com varios
   itens selecionados (mestre) todos andam juntos, numa operacao so. */
function mpAnda(dx,dy,esquerda){
  var sels=mpSelecionados().filter(mpMovivel);
  if(!sels.length){ return; }
  var g=mpGrid(), T=mpLado(), pdx=dx*T, pdy=dy*T;
  if(g.tipo==="hex"&&dy!==0){ pdy=dy*1.5*T/Math.sqrt(3); pdx=(esquerda?-1:1)*T/2; }
  if(sels.length===1&&sels[0].tipo==="TOKEN"){
    var d=sels[0].dados, x=mpNum(d.x,0)+pdx, y=mpNum(d.y,0)+pdy;
    var s=mpEncaixando()?mpEncaixa(x,y,mpNum(d.tam,1)):{x:x,y:y};
    mpMover(sels[0],mpArred(s.x),mpArred(s.y));
    return;
  }
  mpLote(sels.map(function(el){
    var sn=mpSnap(el); mpAplicaSnap(sn,pdx,pdy); var it=mpItemMovido(el); mpAplicaSnap(sn,0,0); return it;
  }),"não consegui mover").catch(function(){ /* o aviso ja saiu em mpGrava */ });
}
/* O arraste do jogador guarda os pontos por onde passou: o deslocamento do turno e cobrado pelo caminho (nunca menos que a reta). */
function mpAnotaTrilha(arr,d){
  var u=arr.trilha[arr.trilha.length-1];
  if(Math.hypot(d.x-u[0],d.y-u[1])<mpLado()/2){ return; }
  arr.trilha.push([d.x,d.y]);
  /* o servidor aceita ate 60 pontos: passando de 50, fica um sim e um nao */
  if(arr.trilha.length>50){ arr.trilha=arr.trilha.filter(function(q,i){ return i===0||i%2===0||i===arr.trilha.length-1; }); }
}
function mpSoltaToken(arr,livre){
  var el=arr.el, d=el.dados, s=livre?{x:d.x,y:d.y}:mpEncaixa(d.x,d.y,mpNum(d.tam,1));
  /* volta ao ponto de partida antes de gravar: se o servidor recusar, mpMover desfaz para la */
  d.x=arr.ox; d.y=arr.oy;
  MP.arrastando=null;
  /* parede no meio: vale a rota que a contorna (o servidor refaz a conta e e quem decide); sem rota, nem tenta */
  var rota=mpRotaDoToken(arr.ox,arr.oy,s.x,s.y,arr.trilha.concat([[s.x,s.y]]),el);
  if(rota===false){ mpDesenha(); toast("Não há por onde passar: tem parede no caminho.","aviso"); return; }
  mpMover(el,mpArred(s.x),mpArred(s.y),rota?rota.slice(1,-1):arr.trilha.slice(1));
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
