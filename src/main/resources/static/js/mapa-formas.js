/* Tabletop: camadas, selecao, desenhos e areas (js/mapa-formas.js). */
"use strict";

/* Da de baixo para a de cima: e a ordem em que o canvas desenha. O servidor guarda so o id. */
var MP_CAMADAS=["cenario","objetos","personagens","npcs","decoracao"];
var MP_FORMAS=["linha","circulo","retangulo","poligono","marca"];
/* Nome de cor, nao cor: o canvas traduz cada um para um token do tema (a cor escolhida pelo mestre
   nunca vira texto, so traco e faixa). */
var MP_CORES=[["ouro","Dourado"],["sangue","Vermelho"],["neutro","Neutro"],["ok","Verde"],["aviso","Laranja"]];
var MP_COR_TOKEN={ouro:"ouro",sangue:"perigo",neutro:"texto",ok:"ok",aviso:"aviso"};
function mpCorDe(nome,cor){ return cor[MP_COR_TOKEN[nome]||"ouro"]; }
function mpCamadaNome(id){
  return {cenario:"Cenário",objetos:"Objetos",personagens:Vm("personagens"),npcs:Vm("npcs"),decoracao:"Decoração"}[id]||id;
}

/* ---------- camadas ---------- */
function mpCamadaDe(e){ return MP_CAMADAS.includes(e.camada)?e.camada:"personagens"; }
/* esconder uma camada e coisa de quem olha (so nesta tela); trancar e do mapa e vale para todos */
function mpCamadaOculta(id){ return !!MP.ocultas[id]; }
function mpCamadaTrancada(id){ return (MP.mapa?.regras?.trancadas||[]).includes(id); }
function mpTrancado(e){ return !!e.bloqueado||mpCamadaTrancada(mpCamadaDe(e)); }
/* O servidor tem a ultima palavra; aqui so se evita arrastar o que ele recusaria. */
function mpMovivel(e){ return GM?!mpTrancado(e):(!!e.podeMover&&!mpCamadaTrancada(mpCamadaDe(e))); }
function mpOrdenados(){
  var out=[];
  MP_CAMADAS.forEach(function(c){
    if(mpCamadaOculta(c)){ return; }
    MP.els.forEach(function(e){ if(mpCamadaDe(e)===c){ out.push(e); } });
  });
  return out;
}

/* ---------- selecao ---------- */
/* MP.sel e o principal (o ultimo tocado); MP.multi guarda a lista toda quando passa de um */
function mpSelecao(){
  if(MP.multi.length){ return MP.multi.slice(); }
  return MP.sel==null?[]:[String(MP.sel)];
}
function mpEhSel(id){
  if(MP.multi.length){ return MP.multi.includes(String(id)); }
  return MP.sel!=null&&String(MP.sel)===String(id);
}
function mpSelecionaIds(ids){
  var l=(ids||[]).map(String);
  MP.multi=l.length>1?l:[];
  MP.sel=l.length?l[l.length-1]:null;
}
function mpSelecionados(){ return mpSelecao().map(mpEl).filter(Boolean); }
function mpAlternaSel(id){
  var l=mpSelecao(), s=String(id), i=l.indexOf(s);
  if(i>=0){ l.splice(i,1); } else { l.push(s); }
  mpSelecionaIds(l);
}
/* tira da selecao o que deixou de existir (outra pessoa removeu, ou o desfazer) */
function mpPodaSel(){
  mpSelecionaIds(mpSelecao().filter(function(id){ return !!mpEl(id); }));
}

/* ---------- geometria dos elementos ---------- */
function mpBBox(e){
  var d=e.dados||{};
  if(e.tipo==="TOKEN"){
    var R=mpRaio(e), x=mpNum(d.x,0), y=mpNum(d.y,0);
    return {x0:x-R,y0:y-R,x1:x+R,y1:y+R};
  }
  var p=d.pts||[];
  if(!p.length){ return {x0:0,y0:0,x1:0,y1:0}; }
  if(d.forma==="circulo"&&p.length>1){
    var r=Math.hypot(p[1][0]-p[0][0],p[1][1]-p[0][1]);
    return {x0:p[0][0]-r,y0:p[0][1]-r,x1:p[0][0]+r,y1:p[0][1]+r};
  }
  var b={x0:Infinity,y0:Infinity,x1:-Infinity,y1:-Infinity};
  p.forEach(function(q){ b.x0=Math.min(b.x0,q[0]); b.y0=Math.min(b.y0,q[1]); b.x1=Math.max(b.x1,q[0]); b.y1=Math.max(b.y1,q[1]); });
  if(d.forma==="marca"){ b.x0-=8; b.y0-=8; b.x1+=8; b.y1+=8; }
  if(d.forma==="traco"){ var rt=mpNum(d.larg,70)/2; b.x0-=rt; b.y0-=rt; b.x1+=rt; b.y1+=rt; }
  return b;
}
function mpDistSeg(px,py,a,b){
  var dx=b[0]-a[0], dy=b[1]-a[1], l=dx*dx+dy*dy;
  var t=l?Math.max(0,Math.min(1,((px-a[0])*dx+(py-a[1])*dy)/l)):0;
  return Math.hypot(px-(a[0]+t*dx),py-(a[1]+t*dy));
}
function mpDentroPoli(px,py,q){
  var dentro=false;
  for(var i=0,j=q.length-1;i<q.length;j=i++){
    if((q[i][1]>py)!==(q[j][1]>py)&&px<(q[j][0]-q[i][0])*(py-q[i][1])/(q[j][1]-q[i][1])+q[i][0]){ dentro=!dentro; }
  }
  return dentro;
}
function mpPtsRetangulo(p){
  return [[p[0][0],p[0][1]],[p[1][0],p[0][1]],[p[1][0],p[1][1]],[p[0][0],p[1][1]]];
}
/* Acerta o traco (ou o miolo, quando a forma e preenchida). A tolerancia acompanha o zoom: perto
   do mapa inteiro, uma linha fina ainda se pega. */
function mpAcertaDesenho(e,wx,wy,z){
  var d=e.dados||{}, p=d.pts||[], tol=Math.max(mpNum(d.esp,3)/2+2,8/z), cheio=mpNum(d.preench,0)>0;
  if(!p.length){ return false; }
  if(d.forma==="marca"){ return Math.hypot(wx-p[0][0],wy-p[0][1])<=Math.max(10,12/z); }
  if(p.length<2){ return false; }
  if(d.forma==="linha"){ return mpDistSeg(wx,wy,p[0],p[1])<=tol; }
  if(d.forma==="circulo"){
    var r=Math.hypot(p[1][0]-p[0][0],p[1][1]-p[0][1]), dc=Math.hypot(wx-p[0][0],wy-p[0][1]);
    return cheio?dc<=r+tol:Math.abs(dc-r)<=tol;
  }
  var q=d.forma==="retangulo"?mpPtsRetangulo(p):p;
  if(cheio&&mpDentroPoli(wx,wy,q)){ return true; }
  for(var i=0;i<q.length;i++){
    if(mpDistSeg(wx,wy,q[i],q[(i+1)%q.length])<=tol){ return true; }
  }
  return false;
}

/* ---------- pintura ---------- */
function mpTracaForma(ctx,forma,p){
  ctx.beginPath();
  if(forma==="linha"){ ctx.moveTo(p[0][0],p[0][1]); ctx.lineTo(p[1][0],p[1][1]); return; }
  if(forma==="circulo"){ ctx.arc(p[0][0],p[0][1],Math.hypot(p[1][0]-p[0][0],p[1][1]-p[0][1]),0,Math.PI*2); return; }
  var q=forma==="retangulo"?mpPtsRetangulo(p):p;
  q.forEach(function(pt,i){ if(i){ ctx.lineTo(pt[0],pt[1]); } else { ctx.moveTo(pt[0],pt[1]); } });
  ctx.closePath();
}
/* texto com 12px na tela e um fundo, preso ao ponto (x, y) pelo topo */
function mpPintaTexto(ctx,t,x,y,z,cor){
  if(!t){ return; }
  var fs=12/z, pad=4/z;
  ctx.save();
  ctx.font="600 "+fs+"px "+cor.fonte;
  var w=ctx.measureText(t).width;
  ctx.globalAlpha=0.92; ctx.fillStyle=cor.rotulo; ctx.fillRect(x-w/2-pad,y,w+pad*2,fs+pad*2);
  ctx.globalAlpha=1; ctx.fillStyle=cor.texto; ctx.textAlign="center"; ctx.textBaseline="top";
  ctx.fillText(t,x,y+pad);
  ctx.restore();
}
function mpPintaDesenho(ctx,e,z,cor){
  var d=e.dados||{}, p=d.pts||[];
  if(!p.length||(d.forma!=="marca"&&p.length<2)){ return; }
  var c=mpCorDe(d.cor,cor), b=mpBBox(e);
  ctx.save();
  if(e.visivel===false){ ctx.globalAlpha=0.5; }
  ctx.strokeStyle=c; ctx.fillStyle=c; ctx.lineWidth=Math.max(mpNum(d.esp,3),1/z); ctx.lineJoin="round"; ctx.lineCap="round";
  if(d.forma==="marca"){
    ctx.beginPath(); ctx.moveTo(p[0][0],p[0][1]-8/z); ctx.lineTo(p[0][0]+7/z,p[0][1]); ctx.lineTo(p[0][0],p[0][1]+8/z); ctx.lineTo(p[0][0]-7/z,p[0][1]); ctx.closePath();
    ctx.fill(); ctx.strokeStyle=cor.rotulo; ctx.lineWidth=1.5/z; ctx.stroke();
  } else {
    mpTracaForma(ctx,d.forma,p);
    var pre=mpNum(d.preench,0);
    if(pre>0&&d.forma!=="linha"){ var a=ctx.globalAlpha; ctx.globalAlpha=a*pre; ctx.fill(); ctx.globalAlpha=a; }
    ctx.stroke();
  }
  ctx.restore();
  mpPintaTexto(ctx,d.rotulo,(b.x0+b.x1)/2,d.forma==="marca"?p[0][1]+10/z:(b.y0+b.y1)/2-6/z,z,cor);
  if(mpEhSel(e.id)){
    ctx.save(); ctx.strokeStyle=cor.ouro; ctx.lineWidth=2/z; ctx.setLineDash([6/z,4/z]);
    ctx.strokeRect(b.x0-3/z,b.y0-3/z,b.x1-b.x0+6/z,b.y1-b.y0+6/z);
    ctx.restore();
  }
  if(GM&&mpTrancado(e)){ mpPintaCadeado(ctx,b.x0-3/z,b.y0-3/z,z,cor); }
}
/* o que a ferramenta ativa esta fazendo agora: rascunho de desenho, molde de area e caixa de selecao */
function mpPintaFerramentas(ctx,z,cor){
  mpPintaPings(ctx,z,cor);
  mpPintaRascunho(ctx,z,cor);
  mpPintaPincel(ctx,z,cor);
  mpPintaArea(ctx,z,cor);
  var c=MP.caixa;
  if(c){
    ctx.save(); ctx.strokeStyle=cor.ouro; ctx.fillStyle=cor.ouro; ctx.lineWidth=1.5/z; ctx.setLineDash([5/z,4/z]);
    ctx.globalAlpha=0.1; ctx.fillRect(c.a.x,c.a.y,c.b.x-c.a.x,c.b.y-c.a.y);
    ctx.globalAlpha=1; ctx.strokeRect(c.a.x,c.a.y,c.b.x-c.a.x,c.b.y-c.a.y);
    ctx.restore();
  }
}
/* Aceno no mapa: um anel que cresce e some em poucos segundos, com o nome de quem apontou. Sem animacao
   (movimento reduzido ou efeitos desligados) o anel fica parado e some do mesmo jeito. */
var MP_PING_MS=3500;
function mpMovimentoReduzido(){
  return document.documentElement.dataset.fx==="off"||!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}
function mpPintaPings(ctx,z,cor){
  var agora=Date.now(), anima=!mpMovimentoReduzido();
  MP.pings=MP.pings.filter(function(p){ return agora-p.t<MP_PING_MS; });
  MP.pings.forEach(function(p){
    var k=(agora-p.t)/MP_PING_MS, r=(18+(anima?Math.min(1,(agora-p.t)/700)*34:20))/z;
    ctx.save(); ctx.globalAlpha=1-k*k; ctx.strokeStyle=cor.ouro; ctx.fillStyle=cor.ouro; ctx.lineWidth=3/z;
    ctx.beginPath(); ctx.arc(p.x,p.y,r,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x,p.y,5/z,0,Math.PI*2); ctx.fill();
    ctx.restore();
    if(p.quem){ ctx.save(); ctx.globalAlpha=1-k*k; mpPintaTexto(ctx,p.quem,p.x,p.y+r+4/z,z,cor); ctx.restore(); }
  });
  if(MP.pings.length){ mpDesenha(); }
}
function mpPintaRascunho(ctx,z,cor){
  var r=MP.rascunho;
  if(!r||r.forma==="traco"){ return; }
  var pts=r.pts.slice(), e=MP.estilo, c=mpCorDe(e.cor,cor);
  /* parede e nevoa tem a cor propria do que fazem, e nao a do estilo de desenho */
  if(MP.ferramenta==="parede"){ c=cor.perigo; } else if(MP.ferramenta==="fog"){ c=MP.fogRevela===false?cor.perigo:cor.ok; }
  if(mpEhPoli(r)&&r.cursor){ pts.push([r.cursor.x,r.cursor.y]); }
  if(pts.length<2&&!mpEhPoli(r)){ return; }
  ctx.save();
  ctx.strokeStyle=c; ctx.fillStyle=c; ctx.lineWidth=Math.max(e.esp,1/z); ctx.lineJoin="round"; ctx.lineCap="round"; ctx.setLineDash([8/z,5/z]);
  if(mpEhPoli(r)){
    ctx.beginPath();
    pts.forEach(function(q,i){ if(i){ ctx.lineTo(q[0],q[1]); } else { ctx.moveTo(q[0],q[1]); } });
    ctx.stroke(); ctx.setLineDash([]);
    r.pts.forEach(function(q){ ctx.beginPath(); ctx.arc(q[0],q[1],4/z,0,Math.PI*2); ctx.fill(); });
  } else {
    mpTracaForma(ctx,r.forma,pts);
    if(e.preench>0&&r.forma!=="linha"){ ctx.globalAlpha=e.preench; ctx.fill(); ctx.globalAlpha=1; }
    ctx.stroke();
  }
  ctx.restore();
}

/* ---------- grade: encaixe de desenho ---------- */
/* Desenho se apoia nos cantos da grade (no hexagono, nos vertices), nao no centro da casa como o token. */
function mpEncaixaPonto(x,y){
  var g=mpGrid(), T=mpLado();
  if(g.tipo==="nenhum"){ return {x:x,y:y}; }
  var ox=mpNum(g.ox,0), oy=mpNum(g.oy,0);
  if(g.tipo!=="hex"){ return {x:ox+Math.round((x-ox)/T)*T,y:oy+Math.round((y-oy)/T)*T}; }
  var h=mpHexIJ(x,y,g,T), r=T/Math.sqrt(3), melhor={x:x,y:y}, dist=Infinity;
  for(var dj=-1;dj<=1;dj++){
    for(var di=-1;di<=1;di++){
      var c=mpCentroHex(h.i+di,h.j+dj,g,T);
      for(var k=0;k<6;k++){
        var a=Math.PI/180*(30+60*k), px=c.x+r*Math.cos(a), py=c.y+r*Math.sin(a), dd=Math.hypot(x-px,y-py);
        if(dd<dist){ dist=dd; melhor={x:px,y:py}; }
      }
    }
  }
  return melhor;
}
function mpPontoDesenho(e,p){ return mpLivre(e)?{x:p.x,y:p.y}:mpEncaixaPonto(p.x,p.y); }

/* ---------- areas: cone, circulo e linha ---------- */
/* Moldes de medir, no mesmo espirito da regua: so existem na tela de quem mede. O mestre pode fixar
   o molde no mapa (vira um desenho). Cone: a largura no fim e igual ao comprimento. Linha: uma
   casa de largura. */
function mpAreaForma(a){
  var T=mpLado(), L=Math.hypot(a.b.x-a.a.x,a.b.y-a.a.y);
  if(L<1){ return null; }
  var ang=Math.atan2(a.b.y-a.a.y,a.b.x-a.a.x), esc=mpEscalaCasa(), u=mpUnidade();
  function medida(px){ return (mpFmt(px/T*esc)+" "+u).trim(); }
  if(a.tipo==="circulo"){ return {k:"c",x:a.a.x,y:a.a.y,r:L,txt:"raio "+medida(L)}; }
  if(a.tipo==="cone"){
    var meia=Math.atan(0.5), R=L/Math.cos(meia);
    return {k:"p",txt:medida(L),pts:[[a.a.x,a.a.y],
      [a.a.x+R*Math.cos(ang-meia),a.a.y+R*Math.sin(ang-meia)],[a.a.x+R*Math.cos(ang+meia),a.a.y+R*Math.sin(ang+meia)]]};
  }
  var nx=-Math.sin(ang)*T/2, ny=Math.cos(ang)*T/2;
  return {k:"p",txt:medida(L),pts:[[a.a.x+nx,a.a.y+ny],[a.b.x+nx,a.b.y+ny],[a.b.x-nx,a.b.y-ny],[a.a.x-nx,a.a.y-ny]]};
}
function mpPintaArea(ctx,z,cor){
  var a=MP.area, f=a&&mpAreaForma(a);
  if(!f){ return; }
  ctx.save();
  ctx.strokeStyle=cor.ouro; ctx.fillStyle=cor.ouro; ctx.lineWidth=2/z; ctx.setLineDash([8/z,5/z]);
  ctx.beginPath();
  if(f.k==="c"){ ctx.arc(f.x,f.y,f.r,0,Math.PI*2); }
  else { f.pts.forEach(function(q,i){ if(i){ ctx.lineTo(q[0],q[1]); } else { ctx.moveTo(q[0],q[1]); } }); ctx.closePath(); }
  ctx.globalAlpha=0.18; ctx.fill(); ctx.globalAlpha=1; ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(a.a.x,a.a.y,4/z,0,Math.PI*2); ctx.fill();
  ctx.restore();
  mpPintaTexto(ctx,f.txt,a.b.x,a.b.y+8/z,z,cor);
}
/* Enter (ou o botao do painel) deixa o molde no mapa como desenho: circulo, ou poligono para o resto */
function mpFixaArea(){
  var a=MP.area, f=a&&mpAreaForma(a);
  if(!f||!GM){ return; }
  MP.area=null;
  if(f.k==="c"){ mpCriaDesenho("circulo",[[f.x,f.y],[f.x+f.r,f.y]]); } else { mpCriaDesenho("poligono",f.pts); }
  mpDesenha(); mpPintaPainel();
}
