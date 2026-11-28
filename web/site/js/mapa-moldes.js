/* Moldes de mapa: plantas prontas para o mestre nao comecar do zero.

   Cada molde e um gerador: recebe um sorteio (com semente, para "Gerar outro" e para a previa e o mapa
   criado sairem iguais) e devolve uma PLANTA em casas. A planta diz, casa a casa, a zona (0 e rocha
   macica, -1 e chao aberto, >0 e um comodo) e o material do chao; as paredes nao sao desenhadas a mao:
   saem das divisas entre zonas (mmArestas), com as portas e janelas que o gerador marcou nas divisas.

   Da planta saem duas coisas: a imagem do chao, pintada aqui no navegador e enviada como imagem do
   mapa (o repositorio nao carrega arte), e os elementos de verdade do mapa (paredes, portas, janelas,
   obstaculos, marcacoes e tokens), que o mestre edita como qualquer outro. As cores dos materiais sao
   arte (grama verde, pedra cinza), nao interface: por isso sao valores aqui, puxados um pouco para o
   fundo do tema para o mapa nao destoar da mesa. */
"use strict";

var MM_T=70;                 /* pixels por casa: o mesmo tamanho padrao da grade do mapa */
var MM_TINTA=0.14;           /* quanto o fundo do tema entra na cor de cada material */

/* ---------- sorteio ---------- */
function mmRng(semente){
  var a=(semente>>>0)||1;
  function f(){ a=(a+0x6D2B79F5)>>>0; var t=a; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; }
  return {f:f,
    int:function(x,y){ return x+Math.floor(f()*(y-x+1)); },
    pick:function(l){ return l[Math.floor(f()*l.length)]; },
    chance:function(p){ return f()<p; },
    entre:function(x,y){ return x+f()*(y-x); },
    mistura:function(l){ var c=l.slice(); for(var i=c.length-1;i>0;i--){ var j=Math.floor(f()*(i+1)), t=c[i]; c[i]=c[j]; c[j]=t; } return c; }};
}
/* acaso fixo por casa: a textura de uma casa nao muda entre a previa e a imagem final */
function mmHash(x,y,s){
  /* Math.imul ja trunca para 32 bits; o ^ e o >>> de baixo tambem */
  var h=Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(s,1274126177);
  h=Math.imul(h^(h>>>13),1274126177); h^=h>>>16;
  return (h>>>0)/4294967296;
}
function mmSementeNova(){ return Math.floor(Math.random()*2147483646)+1; }

/* ---------- planta ---------- */
function mmGrade(c,r,v){ var g=[]; for(var y=0;y<r;y++){ g.push(new Array(c).fill(v)); } return g; }
function mmPlanta(cols,rows,chao,r){
  return {cols:cols,rows:rows,r:r,chao:chao,parede:"pedra",
    zona:mmGrade(cols,rows,-1),mat:mmGrade(cols,rows,chao),ocup:mmGrade(cols,rows,false),mob:mmGrade(cols,rows,false),
    portas:{},zonas:{},prox:1,objs:[],blocos:[],tokens:[],marcas:[]};
}
function mmDentro(p,x,y){ return x>=0&&y>=0&&x<p.cols&&y<p.rows; }
function mmCada(p,x,y,w,h,fn){
  for(var j=Math.max(0,y);j<Math.min(p.rows,y+h);j++){ for(var i=Math.max(0,x);i<Math.min(p.cols,x+w);i++){ fn(i,j); } }
}
function mmChao(p,x,y,w,h,mat){ mmCada(p,x,y,w,h,function(i,j){ p.mat[j][i]=mat; }); }
function mmRocha(p,x,y,w,h,mat){ mmCada(p,x,y,w,h,function(i,j){ p.zona[j][i]=0; p.mat[j][i]=mat||p.chao; }); }
/* opc: {borda:"janela"} para cerca e amurada (barra o passo, nao a vista), {est} o desenho da parede, {grupo} sem parede entre zonas do grupo */
function mmZona(p,opc){ var id=p.prox++; p.zonas[id]=opc||{}; return id; }
function mmSala(p,x,y,w,h,mat,opc){
  var id=mmZona(p,opc);
  mmCada(p,x,y,w,h,function(i,j){ p.zona[j][i]=id; p.mat[j][i]=mat; p.ocup[j][i]=true; });
  return {id:id,x:x,y:y,w:w,h:h};
}
function mmLivre(p,x,y,w,h,m=0){
  if(x<0||y<0||x+w>p.cols||y+h>p.rows){ return false; }
  var ok=true; mmCada(p,x-m,y-m,w+2*m,h+2*m,function(i,j){ if(p.ocup[j][i]){ ok=false; } });
  return ok;
}
function mmOcupa(p,x,y,w,h){ mmCada(p,x,y,w,h,function(i,j){ p.ocup[j][i]=true; }); }
function mmCentro(s){ return [s.x+Math.floor(s.w/2),s.y+Math.floor(s.h/2)]; }

/* ---------- portas, janelas e aberturas (nas divisas entre casas) ---------- */
function mmChave(x,y,lado){ return {n:"h:"+x+":"+y,s:"h:"+x+":"+(y+1),o:"v:"+x+":"+y,l:"v:"+(x+1)+":"+y}[lado]; }
function mmPorta(p,x,y,lado,kind){ p.portas[mmChave(x,y,lado)]=kind||"porta"; }
/* porta numa parede da sala: pos conta a partir do canto de cima (ou da esquerda) */
function mmPortaSala(p,s,lado,pos,kind){
  if(pos==null){ pos=Math.floor(((lado==="n"||lado==="s")?s.w:s.h)/2); }
  if(lado==="n"){ mmPorta(p,s.x+pos,s.y,"n",kind); }
  else if(lado==="s"){ mmPorta(p,s.x+pos,s.y+s.h-1,"s",kind); }
  else if(lado==="o"){ mmPorta(p,s.x,s.y+pos,"o",kind); }
  else { mmPorta(p,s.x+s.w-1,s.y+pos,"l",kind); }
}
function mmPortaEntre(p,a,b,kind){
  if(b[0]===a[0]+1){ p.portas["v:"+b[0]+":"+a[1]]=kind; }
  else if(b[0]===a[0]-1){ p.portas["v:"+a[0]+":"+a[1]]=kind; }
  else if(b[1]===a[1]+1){ p.portas["h:"+a[0]+":"+b[1]]=kind; }
  else if(b[1]===a[1]-1){ p.portas["h:"+a[0]+":"+a[1]]=kind; }
}
/* janelas espalhadas numa parede externa, longe das portas */
function mmJanelas(p,s,lado,passo){
  var n=(lado==="n"||lado==="s")?s.w:s.h;
  for(var i=1+p.r.int(0,1);i<n-1;i+=passo){
    var k=mmChave(lado==="n"||lado==="s"?s.x+i:(lado==="o"?s.x:s.x+s.w-1),lado==="o"||lado==="l"?s.y+i:(lado==="n"?s.y:s.y+s.h-1),lado);
    if(!p.portas[k]){ p.portas[k]="janela"; }
  }
}
/* as casas dos dois lados de cada porta ficam livres de movel: ninguem poe um barril na frente da porta */
function mmReservaPortas(p){
  Object.keys(p.portas).forEach(function(k){
    var s=k.split(":"), x=+s[1], y=+s[2];
    var cs=s[0]==="h"?[[x,y-1],[x,y]]:[[x-1,y],[x,y]];
    cs.forEach(function(c){ if(mmDentro(p,c[0],c[1])){ p.mob[c[1]][c[0]]=true; } });
  });
}

/* Corredor de A ate B em L, cavado na rocha ou no chao aberto (o que ja e comodo fica como esta).
   Onde o corredor entra num comodo nasce uma porta (ou uma passagem aberta). */
function mmCaminhoL(A,B,hPrimeiro){
  var x=A[0], y=A[1], pts=[[x,y]];
  function anda(eixo){
    if(eixo==="x"){ while(x!==B[0]){ x+=Math.sign(B[0]-x); pts.push([x,y]); } }
    else { while(y!==B[1]){ y+=Math.sign(B[1]-y); pts.push([x,y]); } }
  }
  if(hPrimeiro){ anda("x"); anda("y"); } else { anda("y"); anda("x"); }
  return pts;
}
/* o pincel quadrado do corredor: so cava o que ainda nao e comodo */
function mmCava(p,c,larg,zona,mat){
  mmCada(p,c[0],c[1],larg,larg,function(cx,cy){
    if(p.zona[cy][cx]<=0){ p.zona[cy][cx]=zona; p.mat[cy][cx]=mat; p.ocup[cy][cx]=true; }
  });
}
/* entre o corredor e um comodo, cada casa da largura do corredor ganha a sua porta */
function mmPortaNaPassagem(p,c2,n2,zona,kindPorta){
  if(!mmDentro(p,c2[0],c2[1])||!mmDentro(p,n2[0],n2[1])){ return; }
  var zc=p.zona[c2[1]][c2[0]], zn=p.zona[n2[1]][n2[0]];
  var entra=zc===zona&&zn>0&&zn!==zona, sai=zn===zona&&zc>0&&zc!==zona;
  if(entra||sai){ mmPortaEntre(p,c2,n2,kindPorta()); }
}
function mmCorredor(p,a,b,zona,mat,larg,kindPorta){
  var pts=mmCaminhoL(mmCentro(a),mmCentro(b),p.r.chance(0.5));
  pts.forEach(function(c){ mmCava(p,c,larg,zona,mat); });
  for(var k=1;k<pts.length;k++){
    var c=pts[k-1], n=pts[k], horiz=n[1]===c[1];
    for(var q=0;q<larg;q++){
      mmPortaNaPassagem(p,horiz?[c[0],c[1]+q]:[c[0]+q,c[1]],horiz?[n[0],n[1]+q]:[n[0]+q,n[1]],zona,kindPorta);
    }
  }
}

/* ---------- moveis, obstaculos, tokens e marcacoes ---------- */
/* o: {bloq:"parede"|"janela" vira obstaculo de verdade, forma:"circ", cor, folga} */
function mmObj(p,t,x,y,w,h,o={}){
  p.objs.push({t:t,x:x,y:y,w:w,h:h,o:o});
  mmCada(p,Math.floor(x),Math.floor(y),Math.ceil(x+w)-Math.floor(x),Math.ceil(y+h)-Math.floor(y),function(i,j){ p.mob[j][i]=true; });
  if(o.bloq){ var f=o.folga==null?0.12:o.folga; p.blocos.push({k:o.bloq,forma:o.forma||"ret",x:x+f,y:y+f,w:w-2*f,h:h-2*f}); }
}
function mmMobLivre(p,x,y,w,h){
  if(x<0||y<0||x+w>p.cols||y+h>p.rows){ return false; }
  var ok=true; mmCada(p,x,y,w,h,function(i,j){ if(p.mob[j][i]||p.zona[j][i]===0){ ok=false; } });
  return ok;
}
/* encostado numa parede de dentro da sala, num lugar livre */
/* onde cabe um movel w x h encostado no lado sorteado (nas paredes de lado ele gira) */
function mmPosEncosta(p,s,w,h){
  var lado=p.r.pick(["n","s","o","l"]), deitado=lado==="o"||lado==="l";
  var ww=deitado?h:w, hh=deitado?w:h;
  var x=s.x+p.r.int(0,Math.max(0,s.w-ww)), y=s.y+p.r.int(0,Math.max(0,s.h-hh));
  if(lado==="o"){ x=s.x; } else if(lado==="l"){ x=s.x+s.w-ww; }
  else if(lado==="n"){ y=s.y; } else { y=s.y+s.h-hh; }
  return [x,y,ww,hh];
}
function mmEncosta(p,s,t,w,h,o){
  for(var k=0;k<40;k++){
    var q=mmPosEncosta(p,s,w,h);
    if(mmMobLivre(p,q[0],q[1],q[2],q[3])){ mmObj(p,t,q[0],q[1],q[2],q[3],o); return true; }
  }
  return false;
}
/* solto no meio da sala, longe das paredes */
function mmNoMeio(p,s,t,w,h,o){
  for(var k=0;k<40;k++){
    var x=s.x+1+p.r.int(0,Math.max(0,s.w-w-2)), y=s.y+1+p.r.int(0,Math.max(0,s.h-h-2));
    if(mmMobLivre(p,x,y,w,h)){ mmObj(p,t,x,y,w,h,o); return true; }
  }
  return false;
}
function mmVarios(p,s,t,n,fn){ for(var i=0;i<n;i++){ fn(p,s,t,1,1,{}); } }
function mmMarca(p,rotulo,x,y,cor,vis){ p.marcas.push({rotulo:rotulo,x:x,y:y,cor:cor||"aviso",vis:!!vis}); }
function mmLugar(p,x,y,w,h,tam=1){
  var cs=[];
  mmCada(p,x,y,w-tam+1,h-tam+1,function(i,j){ if(mmMobLivre(p,i,j,tam,tam)){ cs.push([i,j]); } });
  if(!cs.length){ return null; }
  var e=p.r.pick(cs);
  mmCada(p,e[0],e[1],tam,tam,function(i,j){ p.mob[j][i]=true; });
  return e;
}
/* area: [x, y, largura, altura] em casas */
function mmPoe(p,nome,area,npc,tam){
  var e=mmLugar(p,area[0],area[1],area[2],area[3],tam);
  if(e){ p.tokens.push({nome:nome,x:e[0],y:e[1],npc:!!npc,tam:tam||1}); }
  return e;
}
function mmNpcs(p,nome,n,x,y,w,h){ for(var i=1;i<=n;i++){ mmPoe(p,n>1?nome+" "+i:nome,[x,y,w,h],true); } }
function mmNaSala(p,s,nome,n){ mmNpcs(p,nome,n,s.x,s.y,s.w,s.h); }
/* os lugares dos personagens: o mestre troca cada um por uma ficha ou entrega a um jogador */
function mmPJs(p,x,y,w,h){ for(var i=1;i<=4;i++){ mmPoe(p,Vm("personagem")+" "+i,[x,y,w,h],false); } }

/* espelha da esquerda para a direita: mais variacao com o mesmo gerador */
function mmEspelha(p){
  var C=p.cols;
  [p.zona,p.mat,p.ocup,p.mob].forEach(function(g){ g.forEach(function(l){ l.reverse(); }); });
  var np={};
  Object.keys(p.portas).forEach(function(k){
    var s=k.split(":"), x=+s[1], y=+s[2];
    np[s[0]==="h"?"h:"+(C-1-x)+":"+y:"v:"+(C-x)+":"+y]=p.portas[k];
  });
  p.portas=np;
  p.objs.forEach(function(o){ o.x=C-o.x-o.w; });
  p.blocos.forEach(function(b){ b.x=C-b.x-b.w; });
  p.tokens.forEach(function(t){ t.x=C-t.x-t.tam; });
  p.marcas.forEach(function(m){ m.x=C-m.x; });
}

/* ---------- das zonas para as paredes ---------- */
function mmZ(p,x,y){ return mmDentro(p,x,y)?p.zona[y][x]:-1; }
/* entre um comodo e uma cerca vale a parede do comodo */
function mmForte(A,B){
  if(A&&A.borda!=="janela"){ return A; }
  if(B&&B.borda!=="janela"){ return B; }
  return A||B;
}
function mmAresta(p,za,zb,chave){
  var f=p.portas[chave], A=za>0?p.zonas[za]:null, B=zb>0?p.zonas[zb]:null;
  var forte=mmForte(A,B), est=forte?.est||p.parede;
  if(f){ return f==="aberto"?null:{k:f,est:est}; }
  if(za===zb||!forte){ return null; }
  if(A?.grupo&&A.grupo===B?.grupo){ return null; }
  return {k:forte.borda||"parede",est:est};
}
/* uma linha de divisas: trechos seguidos do mesmo tipo viram um elemento so; cada porta e um elemento */
function mmCorreLinha(m,pega,ponto,out){
  var run=null;
  for(var i=0;i<=m;i++){
    var a=i<m?pega(i):null;
    var fecha=run&&(!a||a.k!==run.k||a.est!==run.est||run.k==="porta");
    if(fecha){ out.push({k:run.k,est:run.est,a:ponto(run.i0),b:ponto(i)}); run=null; }
    if(a&&!run){ run={k:a.k,est:a.est,i0:i}; }
  }
}
function mmLinhaH(p,y,out){
  mmCorreLinha(p.cols,function(x){ return mmAresta(p,mmZ(p,x,y-1),mmZ(p,x,y),"h:"+x+":"+y); },function(x){ return [x,y]; },out);
}
function mmLinhaV(p,x,out){
  mmCorreLinha(p.rows,function(y){ return mmAresta(p,mmZ(p,x-1,y),mmZ(p,x,y),"v:"+x+":"+y); },function(y){ return [x,y]; },out);
}
function mmArestas(p){
  var out=[];
  for(var y=0;y<=p.rows;y++){ mmLinhaH(p,y,out); }
  for(var x=0;x<=p.cols;x++){ mmLinhaV(p,x,out); }
  return out;
}
function mmContorno(b){
  if(b.forma==="circ"){
    var cx=b.x+b.w/2, cy=b.y+b.h/2, pts=[];
    for(var i=0;i<=8;i++){ var t=i/8*Math.PI*2; pts.push([cx+Math.cos(t)*b.w/2,cy+Math.sin(t)*b.h/2]); }
    return pts;
  }
  return [[b.x,b.y],[b.x+b.w,b.y],[b.x+b.w,b.y+b.h],[b.x,b.y+b.h],[b.x,b.y]];
}
function mmArr(v){ return Math.round(v*10)/10; }
/* os elementos do mapa, no formato que POST /mapas aceita em "elementos" */
function mmElementos(p){
  var T=MM_T, els=[];
  function px(q){ return [mmArr(q[0]*T),mmArr(q[1]*T)]; }
  mmArestas(p).forEach(function(a){ els.push({tipo:"PAREDE",dados:{kind:a.k,aberta:false,pts:[px(a.a),px(a.b)]}}); });
  p.blocos.forEach(function(b){ els.push({tipo:"PAREDE",dados:{kind:b.k,aberta:false,pts:mmContorno(b).map(px)}}); });
  p.marcas.forEach(function(m){
    els.push({tipo:"DESENHO",visivel:m.vis,dados:{forma:"marca",pts:[px([m.x,m.y])],cor:m.cor,esp:3,preench:0,rotulo:m.rotulo}});
  });
  p.tokens.forEach(function(t){
    els.push({tipo:"TOKEN",visivel:!t.npc,camada:t.npc?"npcs":"personagens",
      dados:{x:mmArr((t.x+t.tam/2)*T),y:mmArr((t.y+t.tam/2)*T),nome:t.nome,img:"",tam:t.tam}});
  });
  return els;
}

/* ---------- pintura ---------- */
/* a cor de fundo do tema, resolvida pelo proprio navegador (o token pode ser qualquer cor CSS) */
function mmCorTema(nome,padrao){
  var cv=document.createElement("canvas"); cv.width=1; cv.height=1;
  var c=cv.getContext("2d"), v=getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  c.fillStyle=padrao; try{ if(v){ c.fillStyle=v; } }catch(error_){ /* cor que o canvas nao entende fica a padrao */ }
  c.fillRect(0,0,1,1);
  var d=c.getImageData(0,0,1,1).data;
  return [d[0],d[1],d[2]];
}
function mmRgb(c){ return "rgb("+c[0]+","+c[1]+","+c[2]+")"; }
function mmPaleta(){
  var fundo=mmCorTema("--bg","#1a1712"), cache={};
  return function(hex,k){
    var ch=hex+(k||0);
    if(cache[ch]){ return cache[ch]; }
    var n=Number.parseInt(hex.slice(1),16), c=[(n>>16)&255,(n>>8)&255,n&255];
    k=k||0;
    c=c.map(function(v,i){ v=k>0?v+(255-v)*k:v*(1+k); return Math.round(v*(1-MM_TINTA)+fundo[i]*MM_TINTA); });
    cache[ch]=mmRgb(c);
    return cache[ch];
  };
}
function mmBase(g,X,Y,T,cor){ g.ctx.fillStyle=cor; g.ctx.fillRect(X-0.5,Y-0.5,T+1,T+1); }
/* op: [quantos pontos, tamanho do ponto (fracao da casa), quanto o tom varia] */
function mmSalpica(g,X,Y,T,h,base,op){
  var c=g.ctx, n=op[0], tam=op[1], vari=op[2];
  mmBase(g,X,Y,T,g.cor(base,(h(0)-0.5)*0.05));
  for(var i=0;i<n;i++){
    c.fillStyle=g.cor(base,(h(i*5+1)-0.5)*vari);
    var s=T*tam*(0.5+h(i*5+2));
    c.fillRect(X+h(i*5+3)*(T-s),Y+h(i*5+4)*(T-s),s,s);
  }
}
function mmLajes(g,X,Y,T,h,base,n){
  var c=g.ctx, s=T/n;
  mmBase(g,X,Y,T,g.cor(base,-0.4));
  for(var i=0;i<n;i++){ for(var j=0;j<n;j++){
    c.fillStyle=g.cor(base,(h(i*n+j+1)-0.5)*0.2);
    c.fillRect(X+i*s+T*0.015,Y+j*s+T*0.015,s-T*0.03,s-T*0.03);
  } }
  if(h(30)<0.15){
    c.strokeStyle=g.cor(base,-0.35); c.lineWidth=T*0.015; c.beginPath();
    var x0=X+h(31)*T, y0=Y+h(32)*T;
    c.moveTo(x0,y0); c.lineTo(x0+(h(33)-0.5)*T*0.5,y0+(h(34)-0.5)*T*0.5); c.lineTo(x0+(h(35)-0.5)*T*0.8,y0+(h(36)-0.5)*T*0.8); c.stroke();
  }
}
/* tabuas que passam de uma casa para a outra: a emenda cai em lugares diferentes em cada fileira */
function mmTabuas(g,X,Y,T,cx,cy,base){
  var c=g.ctx, n=4, semente=11, s=T/n, L=3;
  for(var i=0;i<n;i++){
    var row=cy*n+i, off=mmHash(row,7,semente)*L, seg=Math.floor((cx+off)/L);
    c.fillStyle=g.cor(base,(mmHash(row,seg,semente+1)-0.5)*0.22);
    c.fillRect(X-0.5,Y+i*s-0.5,T+1,s+1);
    var b=Math.ceil((cx+off)/L)*L-off;
    if(b>cx&&b<cx+1){
      var jx=X+(b-cx)*T;
      c.fillStyle=g.cor(base,(mmHash(row,seg+1,semente+1)-0.5)*0.22);
      c.fillRect(jx,Y+i*s-0.5,X+T-jx+0.5,s+1);
      c.fillStyle=g.cor(base,-0.45); c.fillRect(jx-T*0.008,Y+i*s,T*0.016,s);
    }
    c.fillStyle=g.cor(base,-0.4); c.fillRect(X-0.5,Y+i*s+s-T*0.012,T+1,T*0.024);
    c.fillStyle=g.cor(base,-0.12); c.fillRect(X,Y+i*s+s*0.4,T,T*0.008);
  }
}
var MM_CHAO={
  pedra:function(g,X,Y,T,h){ mmLajes(g,X,Y,T,h,"#7a756c",2); },
  laje:function(g,X,Y,T,h){ mmLajes(g,X,Y,T,h,"#615b53",2); },
  madeira:function(g,X,Y,T,h,cx,cy){ mmTabuas(g,X,Y,T,cx,cy,"#8a5c35"); },
  palha:function(g,X,Y,T,h){
    var c=g.ctx; mmSalpica(g,X,Y,T,h,"#a88d52",[6,0.08,0.2]);
    c.lineWidth=T*0.015;
    for(var i=0;i<14;i++){ var x=X+h(50+i)*T, y=Y+h(70+i)*T, a=h(90+i)*Math.PI;
      c.strokeStyle=g.cor("#c9ab62",(h(110+i)-0.5)*0.4); c.beginPath(); c.moveTo(x,y); c.lineTo(x+Math.cos(a)*T*0.18,y+Math.sin(a)*T*0.18); c.stroke(); }
  },
  grama:function(g,X,Y,T,h){
    var c=g.ctx; mmSalpica(g,X,Y,T,h,"#557c3b",[14,0.06,0.28]);
    c.lineWidth=T*0.018;
    for(var i=0;i<9;i++){ var x=X+h(100+i)*T, y=Y+h(120+i)*T;
      c.strokeStyle=g.cor("#557c3b",h(140+i)>0.5?0.25:-0.28); c.beginPath(); c.moveTo(x,y); c.lineTo(x+(h(160+i)-0.5)*T*0.1,y-T*0.09); c.stroke(); }
  },
  terra:function(g,X,Y,T,h){
    var c=g.ctx; mmSalpica(g,X,Y,T,h,"#7f6243",[12,0.05,0.3]);
    for(var i=0;i<3;i++){ c.fillStyle=g.cor("#8d8378",(h(60+i)-0.5)*0.3); c.beginPath(); c.arc(X+h(70+i)*T,Y+h(80+i)*T,T*0.03,0,Math.PI*2); c.fill(); }
  },
  areia:function(g,X,Y,T,h){ mmSalpica(g,X,Y,T,h,"#c2a774",[18,0.03,0.2]); },
  marte:function(g,X,Y,T,h){
    var c=g.ctx; mmSalpica(g,X,Y,T,h,"#8c5a40",[14,0.05,0.3]);
    if(h(40)<0.12){ c.strokeStyle=g.cor("#8c5a40",-0.3); c.lineWidth=T*0.02; c.beginPath(); c.arc(X+h(41)*T,Y+h(42)*T,T*0.15,0,Math.PI*2); c.stroke(); }
  },
  rocha:function(g,X,Y,T,h){
    var c=g.ctx; mmSalpica(g,X,Y,T,h,"#3a3530",[10,0.12,0.35]);
    if(h(40)<0.3){ c.strokeStyle=g.cor("#3a3530",-0.4); c.lineWidth=T*0.02; c.beginPath();
      c.moveTo(X+h(41)*T,Y+h(42)*T); c.lineTo(X+h(43)*T,Y+h(44)*T); c.stroke(); }
  },
  agua:function(g,X,Y,T,h){
    var c=g.ctx; mmBase(g,X,Y,T,g.cor("#2d5b76",(h(0)-0.5)*0.06));
    c.strokeStyle=g.cor("#2d5b76",0.22); c.lineWidth=T*0.02;
    for(var i=0;i<3;i++){ c.beginPath(); c.arc(X+T*0.1+h(i+1)*T*0.8,Y+T*0.15+h(i+5)*T*0.8,T*0.1,Math.PI*1.15,Math.PI*1.85); c.stroke(); }
  },
  calcada:function(g,X,Y,T,h){
    var c=g.ctx, n=3, s=T/n; mmBase(g,X,Y,T,g.cor("#5e5850",-0.1));
    for(var i=0;i<n;i++){ for(var j=0;j<n;j++){
      c.fillStyle=g.cor("#8d867b",(h(i*n+j+1)-0.5)*0.25);
      var d=T*0.02+h(i*n+j+20)*T*0.02;
      if(c.roundRect){ c.beginPath(); c.roundRect(X+i*s+d,Y+j*s+d,s-2*d,s-2*d,s*0.3); c.fill(); } else { c.fillRect(X+i*s+d,Y+j*s+d,s-2*d,s-2*d); }
    } }
  },
  piso:function(g,X,Y,T,h,cx,cy){
    var c=g.ctx, s=T/2; mmBase(g,X,Y,T,g.cor("#a9a397",-0.15));
    for(var i=0;i<2;i++){ for(var j=0;j<2;j++){
      c.fillStyle=g.cor((i+j+cx+cy)%2?"#c9c3b6":"#b3ad9f",(h(i*2+j+1)-0.5)*0.05);
      c.fillRect(X+i*s+T*0.01,Y+j*s+T*0.01,s-T*0.02,s-T*0.02);
    } }
  },
  azulejo:function(g,X,Y,T,h){
    var c=g.ctx, n=3, s=T/n; mmBase(g,X,Y,T,g.cor("#9fb0b4"));
    for(var i=0;i<n;i++){ for(var j=0;j<n;j++){ c.fillStyle=g.cor("#d3dcde",(h(i*n+j+1)-0.5)*0.05); c.fillRect(X+i*s+T*0.01,Y+j*s+T*0.01,s-T*0.02,s-T*0.02); } }
  },
  carpete:function(g,X,Y,T,h){ mmSalpica(g,X,Y,T,h,"#5e2a2a",[10,0.04,0.15]); },
  metal:function(g,X,Y,T,h){
    var c=g.ctx, s=T/2; mmBase(g,X,Y,T,g.cor("#3d444c"));
    for(var i=0;i<2;i++){ for(var j=0;j<2;j++){
      c.fillStyle=g.cor("#5b636c",(h(i*2+j+1)-0.5)*0.12); c.fillRect(X+i*s+T*0.012,Y+j*s+T*0.012,s-T*0.024,s-T*0.024);
      c.fillStyle=g.cor("#8a949e"); [[0.1,0.1],[0.9,0.1],[0.1,0.9],[0.9,0.9]].forEach(function(q){ c.fillRect(X+i*s+q[0]*s-T*0.01,Y+j*s+q[1]*s-T*0.01,T*0.02,T*0.02); });
    } }
  },
  grade:function(g,X,Y,T,h){
    var c=g.ctx; mmBase(g,X,Y,T,g.cor("#262b31"));
    c.strokeStyle=g.cor("#4f5861",(h(1)-0.5)*0.1); c.lineWidth=T*0.03; c.beginPath();
    for(var i=1;i<8;i++){ c.moveTo(X+i*T/8,Y); c.lineTo(X+i*T/8,Y+T); c.moveTo(X,Y+i*T/8); c.lineTo(X+T,Y+i*T/8); }
    c.stroke();
  },
  asfalto:function(g,X,Y,T,h){ mmSalpica(g,X,Y,T,h,"#3a3c3f",[16,0.04,0.25]); },
  concreto:function(g,X,Y,T,h,cx,cy){
    var c=g.ctx; mmSalpica(g,X,Y,T,h,"#8f8d88",[8,0.04,0.12]);
    c.fillStyle=g.cor("#8f8d88",-0.25);
    if(cx%2===0){ c.fillRect(X,Y,T*0.02,T); }
    if(cy%2===0){ c.fillRect(X,Y,T,T*0.02); }
  },
  espaco:function(g,X,Y,T,h){
    var c=g.ctx; mmBase(g,X,Y,T,g.cor("#07080d"));
    for(var i=0;i<4;i++){ if(h(i+1)<0.5){ c.fillStyle=g.cor("#e8ecf5",-h(i+10)*0.5); var s=T*(h(i+20)<0.85?0.015:0.035); c.fillRect(X+h(i+30)*T,Y+h(i+40)*T,s,s); } }
  },
  plantacao:function(g,X,Y,T,h){
    var c=g.ctx; mmSalpica(g,X,Y,T,h,"#6d5233",[8,0.05,0.25]);
    for(var r=0;r<2;r++){ for(var i=0;i<4;i++){
      c.fillStyle=g.cor("#5f8f3a",(h(r*4+i+50)-0.5)*0.3);
      c.beginPath(); c.arc(X+(i+0.5)*T/4,Y+(r+0.5)*T/2,T*0.07,0,Math.PI*2); c.fill();
    } }
  },
  degraus:function(g,X,Y,T,h){
    var c=g.ctx; mmBase(g,X,Y,T,g.cor("#6e695f",(h(0)-0.5)*0.05));
    for(var i=0;i<3;i++){ c.fillStyle=g.cor("#6e695f",-0.35); c.fillRect(X-0.5,Y+(i+1)*T/3-T*0.03,T+1,T*0.03); c.fillStyle=g.cor("#6e695f",0.12); c.fillRect(X-0.5,Y+i*T/3,T+1,T*0.02); }
  }
};

/* moveis e objetos: (g, X, Y, W, H, o) em pixels */
/* ret: [x, y, largura, altura] */
function mmRR(c,ret,r,f,s,lw){
  var x=ret[0], y=ret[1], w=ret[2], h=ret[3];
  c.beginPath();
  if(c.roundRect){ c.roundRect(x,y,w,h,Math.min(r,w/2,h/2)); } else { c.rect(x,y,w,h); }
  if(f){ c.fillStyle=f; c.fill(); }
  if(s){ c.strokeStyle=s; c.lineWidth=lw||2; c.stroke(); }
}
function mmBola(c,x,y,r,f,s,lw){ c.beginPath(); c.arc(x,y,r,0,Math.PI*2); if(f){ c.fillStyle=f; c.fill(); } if(s){ c.strokeStyle=s; c.lineWidth=lw||2; c.stroke(); } }
function mmSombra(g,f){ var c=g.ctx; c.save(); c.globalAlpha=0.28; c.fillStyle="#000"; c.translate(MM_T*0.06,MM_T*0.08); f(); c.restore(); }
function mmFogo(c,x,y,r){
  var gr=c.createRadialGradient(x,y,0,x,y,r);
  gr.addColorStop(0,"#fff2b0"); gr.addColorStop(0.35,"#f5a524"); gr.addColorStop(0.75,"#c2410c"); gr.addColorStop(1,"transparent");
  c.fillStyle=gr; c.beginPath(); c.arc(x,y,r,0,Math.PI*2); c.fill();
}
var MM_OBJ={
  mesa:function(g,X,Y,W,H){ var c=g.ctx, d=MM_T*0.1; mmSombra(g,function(){ c.fillRect(X+d,Y+d,W-2*d,H-2*d); });
    mmRR(c,[X+d,Y+d,W-2*d,H-2*d],MM_T*0.06,g.cor("#7a5030"),g.cor("#7a5030",-0.45),MM_T*0.03);
    c.fillStyle=g.cor("#7a5030",0.15); c.fillRect(X+d*1.6,Y+d*1.6,W-3.2*d,MM_T*0.03); },
  mesaRedonda:function(g,X,Y,W,H){ var c=g.ctx, r=Math.min(W,H)*0.38;
    mmSombra(g,function(){ mmBola(c,X+W/2,Y+H/2,r,"#000"); }); mmBola(c,X+W/2,Y+H/2,r,g.cor("#7a5030"),g.cor("#7a5030",-0.45),MM_T*0.03); },
  cadeira:function(g,X,Y,W,H){ var s=MM_T*0.42; mmRR(g.ctx,[X+(W-s)/2,Y+(H-s)/2,s,s],MM_T*0.06,g.cor("#5c3b22"),g.cor("#5c3b22",-0.4),MM_T*0.025); },
  balcao:function(g,X,Y,W,H){ var c=g.ctx, d=MM_T*0.08; mmSombra(g,function(){ c.fillRect(X+d,Y+d,W-2*d,H-2*d); });
    mmRR(c,[X+d,Y+d,W-2*d,H-2*d],MM_T*0.05,g.cor("#5a3920"),g.cor("#5a3920",-0.45),MM_T*0.03);
    c.fillStyle=g.cor("#8a6040"); if(W<H){ c.fillRect(X+d*2,Y+d*2,MM_T*0.12,H-4*d); } else { c.fillRect(X+d*2,Y+d*2,W-4*d,MM_T*0.12); } },
  barril:function(g,X,Y,W,H){ var c=g.ctx, r=Math.min(W,H)*0.36, x=X+W/2, y=Y+H/2;
    mmSombra(g,function(){ mmBola(c,x,y,r,"#000"); });
    mmBola(c,x,y,r,g.cor("#7a4c26"),g.cor("#3a2716"),MM_T*0.035); mmBola(c,x,y,r*0.62,null,g.cor("#3a2716"),MM_T*0.02); mmBola(c,x,y,r*0.15,g.cor("#3a2716")); },
  caixote:function(g,X,Y,W,H){ var c=g.ctx, d=MM_T*0.1, x=X+d, y=Y+d, w=W-2*d, h=H-2*d;
    mmSombra(g,function(){ c.fillRect(x,y,w,h); });
    mmRR(c,[x,y,w,h],2,g.cor("#9b7444"),g.cor("#5f4424"),MM_T*0.03);
    c.strokeStyle=g.cor("#5f4424"); c.lineWidth=MM_T*0.025; c.beginPath(); c.moveTo(x,y); c.lineTo(x+w,y+h); c.moveTo(x+w,y); c.lineTo(x,y+h); c.stroke(); },
  bau:function(g,X,Y,W,H){ var c=g.ctx, d=MM_T*0.14, x=X+d, y=Y+d*1.3, w=W-2*d, h=H-2.6*d;
    mmSombra(g,function(){ c.fillRect(x,y,w,h); });
    mmRR(c,[x,y,w,h],3,g.cor("#6a4122"),g.cor("#3a2414"),MM_T*0.03);
    c.fillStyle=g.cor("#c9a24a"); c.fillRect(x+w*0.2,y,MM_T*0.05,h); c.fillRect(x+w*0.8-MM_T*0.05,y,MM_T*0.05,h); c.fillRect(x+w/2-MM_T*0.04,y+h*0.35,MM_T*0.08,h*0.3); },
  cama:function(g,X,Y,W,H,o){ var c=g.ctx, d=MM_T*0.1, x=X+d, y=Y+d, w=W-2*d, h=H-2*d, deitada=W>H;
    mmSombra(g,function(){ c.fillRect(x,y,w,h); });
    mmRR(c,[x,y,w,h],4,g.cor("#5e3b22"),g.cor("#3a2414"),MM_T*0.025);
    var cob=o.cor||"#7a2e2e";
    if(deitada){ mmRR(c,[x+w*0.3,y+MM_T*0.04,w*0.68,h-MM_T*0.08],3,g.cor(cob)); mmRR(c,[x+MM_T*0.05,y+h*0.15,w*0.22,h*0.7],4,g.cor("#e8e2d4")); }
    else { mmRR(c,[x+MM_T*0.04,y+h*0.3,w-MM_T*0.08,h*0.68],3,g.cor(cob)); mmRR(c,[x+w*0.15,y+MM_T*0.05,w*0.7,h*0.22],4,g.cor("#e8e2d4")); } },
  lareira:function(g,X,Y,W,H){ var c=g.ctx; mmRR(c,[X+2,Y+2,W-4,H-4],3,g.cor("#5a5550"),g.cor("#36322e"),MM_T*0.04);
    mmRR(c,[X+W*0.22,Y+H*0.22,W*0.56,H*0.56],2,g.cor("#1e1510")); mmFogo(c,X+W/2,Y+H/2,Math.min(W,H)*0.3); },
  fogueira:function(g,X,Y,W,H){ var c=g.ctx, x=X+W/2, y=Y+H/2, r=Math.min(W,H)*0.36;
    for(var i=0;i<9;i++){ var a=i/9*Math.PI*2; mmBola(c,x+Math.cos(a)*r,y+Math.sin(a)*r,MM_T*0.08,g.cor("#6e6a64",(i%3-1)*0.15),g.cor("#3a3632"),MM_T*0.015); }
    mmBola(c,x,y,r*0.8,g.cor("#2a1d14")); mmFogo(c,x,y,r*1.1); },
  arvore:function(g,X,Y,W,H){ var c=g.ctx, x=X+W/2, y=Y+H/2, r=Math.min(W,H)*0.48;
    mmSombra(g,function(){ mmBola(c,x+MM_T*0.06,y+MM_T*0.06,r,"#000"); });
    for(var i=0;i<6;i++){ var a=i/6*Math.PI*2; mmBola(c,x+Math.cos(a)*r*0.45,y+Math.sin(a)*r*0.45,r*0.58,g.cor("#2c5226")); }
    mmBola(c,x-r*0.15,y-r*0.15,r*0.55,g.cor("#3d6c31")); mmBola(c,x-r*0.3,y-r*0.3,r*0.22,g.cor("#5b8a44")); },
  arbusto:function(g,X,Y,W,H){ var c=g.ctx, x=X+W/2, y=Y+H/2, r=Math.min(W,H)*0.3;
    for(var i=0;i<4;i++){ var a=i/4*Math.PI*2+0.4; mmBola(c,x+Math.cos(a)*r*0.5,y+Math.sin(a)*r*0.5,r*0.65,g.cor("#3a6630",(i%2)*0.1)); } },
  rocha:function(g,X,Y,W,H,o){ var c=g.ctx, x=X+W/2, y=Y+H/2, r=Math.min(W,H)*0.42, s=o.s||1;
    function forma(){ c.beginPath(); for(var i=0;i<7;i++){ var a=i/7*Math.PI*2, k=0.72+mmHash(i,s,3)*0.3; if(i){ c.lineTo(x+Math.cos(a)*r*k,y+Math.sin(a)*r*k); } else { c.moveTo(x+Math.cos(a)*r*k,y+Math.sin(a)*r*k); } } c.closePath(); }
    mmSombra(g,function(){ forma(); c.fill(); });
    forma(); c.fillStyle=g.cor("#77726b"); c.fill(); c.strokeStyle=g.cor("#46423d"); c.lineWidth=MM_T*0.03; c.stroke();
    mmBola(c,x-r*0.25,y-r*0.25,r*0.25,g.cor("#8f8a82")); },
  coluna:function(g,X,Y,W,H){ var c=g.ctx, x=X+W/2, y=Y+H/2, r=Math.min(W,H)*0.38;
    mmSombra(g,function(){ mmBola(c,x,y,r,"#000"); });
    mmBola(c,x,y,r,g.cor("#8b857c"),g.cor("#55504a"),MM_T*0.035); mmBola(c,x,y,r*0.7,null,g.cor("#6e6961"),MM_T*0.02); },
  trono:function(g,X,Y,W,H){ var c=g.ctx; mmRR(c,[X+W*0.1,Y+H*0.05,W*0.8,H*0.4],4,g.cor("#8a6a2a"),g.cor("#5a4418"),MM_T*0.03);
    mmRR(c,[X+W*0.18,Y+H*0.35,W*0.64,H*0.55],4,g.cor("#7c1f1f"),g.cor("#4a1212"),MM_T*0.03); },
  tapete:function(g,X,Y,W,H,o){ var c=g.ctx, d=MM_T*0.1; mmRR(c,[X+d,Y+d,W-2*d,H-2*d],2,g.cor(o.cor||"#6e2323"));
    c.strokeStyle=g.cor("#b8913a"); c.lineWidth=MM_T*0.025; c.strokeRect(X+d*2,Y+d*2,W-4*d,H-4*d); },
  estrado:function(g,X,Y,W,H){ var c=g.ctx; mmRR(c,[X+2,Y+2,W-4,H-4],4,g.cor("#8d877d"),g.cor("#5e5952"),MM_T*0.03); },
  palco:function(g,X,Y,W,H){ var c=g.ctx; mmRR(c,[X+3,Y+3,W-6,H-6],3,g.cor("#6a4527"),g.cor("#3d2716"),MM_T*0.04); },
  estante:function(g,X,Y,W,H){ var c=g.ctx, d=MM_T*0.1, x=X+d, y=Y+d, w=W-2*d, h=H-2*d, deitada=W>=H;
    mmRR(c,[x,y,w,h],2,g.cor("#5a3920"),g.cor("#36220f"),MM_T*0.03);
    var cores=["#7a2e2e","#2e4a7a","#2e6a3a","#8a6a2a","#5a2e6a"], n=deitada?Math.floor(w/(MM_T*0.12)):Math.floor(h/(MM_T*0.12));
    for(var i=0;i<n;i++){ c.fillStyle=g.cor(cores[i%5]); if(deitada){ c.fillRect(x+i*MM_T*0.12+3,y+3,MM_T*0.09,h-6); } else { c.fillRect(x+3,y+i*MM_T*0.12+3,w-6,MM_T*0.09); } } },
  poco:function(g,X,Y,W,H){ var c=g.ctx, x=X+W/2, y=Y+H/2, r=Math.min(W,H)*0.42;
    mmSombra(g,function(){ mmBola(c,x,y,r,"#000"); });
    mmBola(c,x,y,r,g.cor("#7d776e"),g.cor("#4a4640"),MM_T*0.04); mmBola(c,x,y,r*0.62,g.cor("#1f3f52")); },
  carroca:function(g,X,Y,W,H){ var c=g.ctx, d=MM_T*0.15, deitada=W>H;
    c.fillStyle=g.cor("#262019");
    if(deitada){ [0.2,0.75].forEach(function(k){ c.fillRect(X+W*k,Y+d*0.4,MM_T*0.3,MM_T*0.12); c.fillRect(X+W*k,Y+H-d*0.4-MM_T*0.12,MM_T*0.3,MM_T*0.12); }); }
    else { [0.2,0.75].forEach(function(k){ c.fillRect(X+d*0.4,Y+H*k,MM_T*0.12,MM_T*0.3); c.fillRect(X+W-d*0.4-MM_T*0.12,Y+H*k,MM_T*0.12,MM_T*0.3); }); }
    mmRR(c,[X+d,Y+d,W-2*d,H-2*d],3,g.cor("#8a6038"),g.cor("#4a321c"),MM_T*0.035);
    c.strokeStyle=g.cor("#4a321c"); c.lineWidth=MM_T*0.015; c.beginPath();
    for(var i=1;i<4;i++){ if(deitada){ c.moveTo(X+d,Y+d+i*(H-2*d)/4); c.lineTo(X+W-d,Y+d+i*(H-2*d)/4); } else { c.moveTo(X+d+i*(W-2*d)/4,Y+d); c.lineTo(X+d+i*(W-2*d)/4,Y+H-d); } }
    c.stroke(); },
  barraca:function(g,X,Y,W,H){ var c=g.ctx, d=MM_T*0.08;
    mmSombra(g,function(){ c.fillRect(X+d,Y+d,W-2*d,H-2*d); });
    mmRR(c,[X+d,Y+d,W-2*d,H-2*d],4,g.cor("#a8946a"),g.cor("#6a5a3c"),MM_T*0.03);
    c.fillStyle=g.cor("#8a7752"); if(W>=H){ c.fillRect(X+d,Y+H/2,W-2*d,H/2-d); } else { c.fillRect(X+W/2,Y+d,W/2-d,H-2*d); }
    c.strokeStyle=g.cor("#5a4a2e"); c.lineWidth=MM_T*0.03; c.beginPath();
    if(W>=H){ c.moveTo(X+d,Y+H/2); c.lineTo(X+W-d,Y+H/2); } else { c.moveTo(X+W/2,Y+d); c.lineTo(X+W/2,Y+H-d); } c.stroke(); },
  feno:function(g,X,Y,W,H){ var c=g.ctx, d=MM_T*0.1; mmRR(c,[X+d,Y+d,W-2*d,H-2*d],4,g.cor("#c9a64b"),g.cor("#8a7030"),MM_T*0.025);
    c.strokeStyle=g.cor("#9a7d34"); c.lineWidth=MM_T*0.015; c.beginPath(); for(var i=1;i<4;i++){ c.moveTo(X+d,Y+d+i*(H-2*d)/4); c.lineTo(X+W-d,Y+d+i*(H-2*d)/4); } c.stroke(); },
  espantalho:function(g,X,Y,W,H){ var c=g.ctx, x=X+W/2, y=Y+H/2; c.strokeStyle=g.cor("#5a3b22"); c.lineWidth=MM_T*0.06;
    c.beginPath(); c.moveTo(x-W*0.35,y); c.lineTo(x+W*0.35,y); c.moveTo(x,y-H*0.3); c.lineTo(x,y+H*0.35); c.stroke(); mmBola(c,x,y-H*0.25,MM_T*0.13,g.cor("#a08a50"),g.cor("#5a4a2a"),MM_T*0.02); },
  animal:function(g,X,Y,W,H,o){ var c=g.ctx, x=X+W/2, y=Y+H/2;
    c.save(); c.translate(x,y); c.rotate(o.rot||0);
    c.beginPath(); c.ellipse(0,0,W*0.36,H*0.2,0,0,Math.PI*2); c.fillStyle=g.cor(o.cor||"#6b4a2e"); c.fill();
    mmBola(c,W*0.36,0,MM_T*0.1,g.cor(o.cor||"#6b4a2e",-0.15)); c.restore(); },
  carro:function(g,X,Y,W,H,o){ var c=g.ctx, d=MM_T*0.08, deitado=W>H, cor=o.cor||"#7a2a2a";
    mmSombra(g,function(){ c.fillRect(X+d,Y+d,W-2*d,H-2*d); });
    mmRR(c,[X+d,Y+d,W-2*d,H-2*d],MM_T*0.2,g.cor(cor),g.cor(cor,-0.5),MM_T*0.03);
    c.fillStyle=g.cor("#28313a");
    if(deitado){ c.fillRect(X+W*0.28,Y+d*2,W*0.12,H-4*d); c.fillRect(X+W*0.66,Y+d*2,W*0.1,H-4*d); }
    else { c.fillRect(X+d*2,Y+H*0.28,W-4*d,H*0.12); c.fillRect(X+d*2,Y+H*0.66,W-4*d,H*0.1); } },
  poste:function(g,X,Y,W,H){ var c=g.ctx, x=X+W/2, y=Y+H/2, gr=c.createRadialGradient(x,y,0,x,y,MM_T*0.9);
    gr.addColorStop(0,"#f5d77a"); gr.addColorStop(1,"transparent"); c.save(); c.globalAlpha=0.28; c.fillStyle=gr; c.fillRect(x-MM_T,y-MM_T,MM_T*2,MM_T*2); c.restore();
    mmBola(c,x,y,MM_T*0.1,g.cor("#3a3c40"),g.cor("#1c1d20"),MM_T*0.02); },
  lixeira:function(g,X,Y,W,H){ mmRR(g.ctx,[X+W*0.2,Y+H*0.2,W*0.6,H*0.6],3,g.cor("#4b5a4b"),g.cor("#2a332a"),MM_T*0.025); },
  console:function(g,X,Y,W,H){ var c=g.ctx, d=MM_T*0.1; mmRR(c,[X+d,Y+d,W-2*d,H-2*d],4,g.cor("#262c33"),g.cor("#131619"),MM_T*0.03);
    c.save(); c.shadowColor="#43b8c9"; c.shadowBlur=MM_T*0.15; mmRR(c,[X+d*2,Y+d*2,W-4*d,H-4*d],3,g.cor("#43b8c9",-0.1)); c.restore(); },
  reator:function(g,X,Y,W,H){ var c=g.ctx, x=X+W/2, y=Y+H/2, r=Math.min(W,H)*0.45;
    mmBola(c,x,y,r,g.cor("#4f5760"),g.cor("#22272c"),MM_T*0.05); mmBola(c,x,y,r*0.7,g.cor("#2b3138"));
    var gr=c.createRadialGradient(x,y,0,x,y,r*0.6); gr.addColorStop(0,"#e6fbff"); gr.addColorStop(0.4,"#4cc9e0"); gr.addColorStop(1,"transparent");
    c.fillStyle=gr; c.beginPath(); c.arc(x,y,r*0.6,0,Math.PI*2); c.fill(); },
  tanque:function(g,X,Y,W,H){ var c=g.ctx, x=X+W/2, y=Y+H/2, r=Math.min(W,H)*0.38;
    mmBola(c,x,y,r,g.cor("#7fc4c9"),g.cor("#6d7378"),MM_T*0.05); mmBola(c,x-r*0.3,y-r*0.3,r*0.2,g.cor("#d9f3f5")); },
  bancada:function(g,X,Y,W,H){ var c=g.ctx, d=MM_T*0.1; mmRR(c,[X+d,Y+d,W-2*d,H-2*d],3,g.cor("#b8bcc0"),g.cor("#6d7378"),MM_T*0.03);
    for(var i=0;i<3;i++){ mmBola(c,X+d*2+(W-4*d)*mmHash(i,Math.round(X),5),Y+d*2+(H-4*d)*mmHash(i,Math.round(Y),6),MM_T*0.05,g.cor(["#43b8c9","#c9a04a","#7a2e2e"][i])); } },
  maca:function(g,X,Y,W,H){ var c=g.ctx, d=MM_T*0.12; mmRR(c,[X+d,Y+d,W-2*d,H-2*d],4,g.cor("#e3e6e8"),g.cor("#8a9095"),MM_T*0.03);
    if(W>H){ mmRR(c,[X+d*1.5,Y+H*0.3,W*0.18,H*0.4],3,g.cor("#ffffff")); } else { mmRR(c,[X+W*0.3,Y+d*1.5,W*0.4,H*0.18],3,g.cor("#ffffff")); } },
  mesaCirurgia:function(g,X,Y,W,H){ var c=g.ctx, d=MM_T*0.12; mmRR(c,[X+d,Y+d,W-2*d,H-2*d],4,g.cor("#9aa3a8"),g.cor("#5a6166"),MM_T*0.03);
    var gr=c.createRadialGradient(X+W/2,Y+H/2,0,X+W/2,Y+H/2,Math.max(W,H)*0.7); gr.addColorStop(0,"#fffbe8"); gr.addColorStop(1,"transparent");
    c.save(); c.globalAlpha=0.35; c.fillStyle=gr; c.fillRect(X-W*0.2,Y-H*0.2,W*1.4,H*1.4); c.restore(); },
  estatua:function(g,X,Y,W,H){ var c=g.ctx, x=X+W/2, y=Y+H/2; mmRR(c,[X+W*0.12,Y+H*0.12,W*0.76,H*0.76],3,g.cor("#6f6a62"),g.cor("#46423d"),MM_T*0.03);
    mmBola(c,x,y,Math.min(W,H)*0.26,g.cor("#a39e95"),g.cor("#6f6a62"),MM_T*0.02); },
  altar:function(g,X,Y,W,H){ var c=g.ctx, d=MM_T*0.1; mmRR(c,[X+d,Y+d,W-2*d,H-2*d],3,g.cor("#6f6a62"),g.cor("#3f3b36"),MM_T*0.035);
    c.fillStyle=g.cor("#d8d2c4"); c.fillRect(X+d*2,Y+H/2-MM_T*0.04,W-4*d,MM_T*0.08);
    [[0.25,0.3],[0.75,0.3],[0.25,0.7],[0.75,0.7]].forEach(function(q){ mmBola(c,X+W*q[0],Y+H*q[1],MM_T*0.04,"#f2c14e"); }); },
  tumulo:function(g,X,Y,W,H){ var c=g.ctx, d=MM_T*0.12; mmRR(c,[X+d,Y+d,W-2*d,H-2*d],4,g.cor("#7b766e"),g.cor("#4a4640"),MM_T*0.03);
    c.strokeStyle=g.cor("#4a4640"); c.lineWidth=MM_T*0.03; c.beginPath();
    if(W>H){ c.moveTo(X+W*0.3,Y+H/2); c.lineTo(X+W*0.7,Y+H/2); c.moveTo(X+W*0.4,Y+H*0.3); c.lineTo(X+W*0.4,Y+H*0.7); }
    else { c.moveTo(X+W/2,Y+H*0.3); c.lineTo(X+W/2,Y+H*0.7); c.moveTo(X+W*0.3,Y+H*0.4); c.lineTo(X+W*0.7,Y+H*0.4); } c.stroke(); },
  ossos:function(g,X,Y,W,H){ var c=g.ctx; c.strokeStyle=g.cor("#d9d2c0"); c.lineWidth=MM_T*0.035; c.lineCap="round"; c.beginPath();
    for(var i=0;i<3;i++){ var x=X+W*(0.2+0.6*mmHash(i,Math.round(X),2)), y=Y+H*(0.2+0.6*mmHash(i,Math.round(Y),3)), a=mmHash(i,Math.round(X+Y),4)*Math.PI;
      c.moveTo(x,y); c.lineTo(x+Math.cos(a)*MM_T*0.22,y+Math.sin(a)*MM_T*0.22); } c.stroke(); mmBola(c,X+W*0.6,Y+H*0.4,MM_T*0.08,g.cor("#d9d2c0")); },
  escada:function(g,X,Y,W,H){ var c=g.ctx; mmRR(c,[X+3,Y+3,W-6,H-6],2,g.cor("#4f4a44"),g.cor("#2e2a26"),MM_T*0.03);
    for(var i=0;i<5;i++){ c.fillStyle=g.cor("#8a847b",-i*0.12); if(W>=H){ c.fillRect(X+4+i*(W-8)/5,Y+4,(W-8)/5-2,H-8); } else { c.fillRect(X+4,Y+4+i*(H-8)/5,W-8,(H-8)/5-2); } } },
  alcapao:function(g,X,Y,W,H){ var c=g.ctx, d=MM_T*0.15; mmRR(c,[X+d,Y+d,W-2*d,H-2*d],2,g.cor("#5e3d22"),g.cor("#2e1d10"),MM_T*0.03);
    c.fillStyle=g.cor("#8a8378"); c.fillRect(X+d*1.5,Y+H*0.3,MM_T*0.12,MM_T*0.05); c.fillRect(X+d*1.5,Y+H*0.65,MM_T*0.12,MM_T*0.05); },
  canhao:function(g,X,Y,W,H,o){ var c=g.ctx, x=X+W/2, y=Y+H/2; c.save(); c.translate(x,y); c.rotate(o.rot||0);
    mmRR(c,[-W*0.2,-H*0.28,W*0.4,H*0.56],3,g.cor("#5a3b22")); mmRR(c,[-W*0.12,-H*0.48,W*0.24,H*0.6],MM_T*0.08,g.cor("#2b2b2b"),g.cor("#111"),MM_T*0.02); c.restore(); },
  mastro:function(g,X,Y,W,H){ var c=g.ctx, x=X+W/2, y=Y+H/2; mmSombra(g,function(){ mmBola(c,x,y,MM_T*0.2,"#000"); });
    mmBola(c,x,y,MM_T*0.2,g.cor("#6a4526"),g.cor("#3a2414"),MM_T*0.03); mmBola(c,x,y,MM_T*0.08,g.cor("#3a2414")); },
  leme:function(g,X,Y,W,H){ var c=g.ctx, x=X+W/2, y=Y+H/2, r=Math.min(W,H)*0.32; c.strokeStyle=g.cor("#7a5030"); c.lineWidth=MM_T*0.04; c.beginPath();
    for(var i=0;i<8;i++){ var a=i/8*Math.PI*2; c.moveTo(x,y); c.lineTo(x+Math.cos(a)*r*1.3,y+Math.sin(a)*r*1.3); } c.stroke(); mmBola(c,x,y,r,null,g.cor("#7a5030"),MM_T*0.05); },
  vaso:function(g,X,Y,W,H){ var c=g.ctx, x=X+W/2, y=Y+H/2; mmBola(c,x,y,MM_T*0.18,g.cor("#8a5a3a"));
    for(var i=0;i<5;i++){ var a=i/5*Math.PI*2; mmBola(c,x+Math.cos(a)*MM_T*0.12,y+Math.sin(a)*MM_T*0.12,MM_T*0.1,g.cor("#3f6f33",(i%2)*0.15)); } },
  sofa:function(g,X,Y,W,H,o){ var c=g.ctx, d=MM_T*0.1, cor=o.cor||"#4a5a7a"; mmRR(c,[X+d,Y+d,W-2*d,H-2*d],MM_T*0.12,g.cor(cor),g.cor(cor,-0.45),MM_T*0.03);
    c.strokeStyle=g.cor(cor,-0.3); c.lineWidth=MM_T*0.02; c.beginPath();
    if(W>H){ c.moveTo(X+W/2,Y+d*2); c.lineTo(X+W/2,Y+H-d*2); } else { c.moveTo(X+d*2,Y+H/2); c.lineTo(X+W-d*2,Y+H/2); } c.stroke(); },
  fogao:function(g,X,Y,W,H){ var c=g.ctx, d=MM_T*0.1; mmRR(c,[X+d,Y+d,W-2*d,H-2*d],3,g.cor("#454545"),g.cor("#222"),MM_T*0.03);
    [[0.3,0.3],[0.7,0.3],[0.3,0.7],[0.7,0.7]].forEach(function(q){ mmBola(c,X+W*q[0],Y+H*q[1],MM_T*0.08,null,g.cor("#888"),MM_T*0.02); }); },
  pia:function(g,X,Y,W,H){ var c=g.ctx, d=MM_T*0.12; mmRR(c,[X+d,Y+d,W-2*d,H-2*d],3,g.cor("#b8bec2"),g.cor("#6d7378"),MM_T*0.03); mmRR(c,[X+d*2,Y+d*2,W-4*d,H-4*d],6,g.cor("#8e969b")); },
  banheira:function(g,X,Y,W,H){ var c=g.ctx, d=MM_T*0.1; mmRR(c,[X+d,Y+d,W-2*d,H-2*d],MM_T*0.2,g.cor("#e8eaec"),g.cor("#8a9095"),MM_T*0.03); mmRR(c,[X+d*2,Y+d*2,W-4*d,H-4*d],MM_T*0.16,g.cor("#bcd8e0")); },
  trilho:function(g,X,Y,W,H){ var c=g.ctx, deitado=W>=H; c.fillStyle=g.cor("#5a3b22");
    var n=Math.round((deitado?W:H)/(MM_T*0.25)); for(var i=0;i<n;i++){ if(deitado){ c.fillRect(X+i*MM_T*0.25,Y+H*0.2,MM_T*0.1,H*0.6); } else { c.fillRect(X+W*0.2,Y+i*MM_T*0.25,W*0.6,MM_T*0.1); } }
    c.fillStyle=g.cor("#8a8f94"); if(deitado){ c.fillRect(X,Y+H*0.3,W,MM_T*0.04); c.fillRect(X,Y+H*0.66,W,MM_T*0.04); } else { c.fillRect(X+W*0.3,Y,MM_T*0.04,H); c.fillRect(X+W*0.66,Y,MM_T*0.04,H); } },
  carrinho:function(g,X,Y,W,H){ var c=g.ctx, d=MM_T*0.15; mmRR(c,[X+d,Y+d,W-2*d,H-2*d],3,g.cor("#5a4a3a"),g.cor("#2a221a"),MM_T*0.03);
    for(var i=0;i<4;i++){ mmBola(c,X+W*(0.3+0.4*mmHash(i,1,9)),Y+H*(0.3+0.4*mmHash(i,2,9)),MM_T*0.06,g.cor("#8d8378")); } },
  nave:function(g,X,Y,W,H){ var c=g.ctx; mmSombra(g,function(){ c.beginPath(); c.moveTo(X+W*0.95,Y+H/2); c.lineTo(X+W*0.1,Y+H*0.1); c.lineTo(X+W*0.25,Y+H/2); c.lineTo(X+W*0.1,Y+H*0.9); c.closePath(); c.fill(); });
    c.beginPath(); c.moveTo(X+W*0.95,Y+H/2); c.lineTo(X+W*0.1,Y+H*0.1); c.lineTo(X+W*0.25,Y+H/2); c.lineTo(X+W*0.1,Y+H*0.9); c.closePath();
    c.fillStyle=g.cor("#8a949e"); c.fill(); c.strokeStyle=g.cor("#3d444c"); c.lineWidth=MM_T*0.04; c.stroke(); mmBola(c,X+W*0.62,Y+H/2,MM_T*0.18,g.cor("#43b8c9",-0.2)); },
  contentor:function(g,X,Y,W,H,o){ var c=g.ctx, d=MM_T*0.08, cor=o.cor||"#5d6e50"; mmSombra(g,function(){ c.fillRect(X+d,Y+d,W-2*d,H-2*d); });
    mmRR(c,[X+d,Y+d,W-2*d,H-2*d],2,g.cor(cor),g.cor(cor,-0.5),MM_T*0.03);
    c.fillStyle=g.cor(cor,-0.25); var deitado=W>=H, n=deitado?Math.floor(W/(MM_T*0.2)):Math.floor(H/(MM_T*0.2));
    for(var i=1;i<n;i++){ if(deitado){ c.fillRect(X+i*MM_T*0.2,Y+d,MM_T*0.03,H-2*d); } else { c.fillRect(X+d,Y+i*MM_T*0.2,W-2*d,MM_T*0.03); } } },
  faixa:function(g,X,Y,W,H){ var c=g.ctx; c.fillStyle=g.cor("#e3dcc0"); if(W>=H){ c.fillRect(X+W*0.15,Y+H/2-MM_T*0.03,W*0.7,MM_T*0.06); } else { c.fillRect(X+W/2-MM_T*0.03,Y+H*0.15,MM_T*0.06,H*0.7); } },
  zebra:function(g,X,Y,W,H){ var c=g.ctx; c.fillStyle=g.cor("#e3dcc0"); var deitada=W>=H, n=Math.round((deitada?W:H)/(MM_T*0.25));
    for(var i=0;i<n;i+=2){ if(deitada){ c.fillRect(X+i*MM_T*0.25,Y+MM_T*0.1,MM_T*0.25,H-MM_T*0.2); } else { c.fillRect(X+MM_T*0.1,Y+i*MM_T*0.25,W-MM_T*0.2,MM_T*0.25); } } },
  tronco:function(g,X,Y,W,H){ var c=g.ctx, d=MM_T*0.22; mmRR(c,[X+MM_T*0.08,Y+d,W-MM_T*0.16,H-2*d],MM_T*0.12,g.cor("#6a4526"),g.cor("#3a2414"),MM_T*0.025);
    mmBola(c,X+W-MM_T*0.18,Y+H/2,(H-2*d)/2-2,g.cor("#a07a50")); },
  bigorna:function(g,X,Y,W,H){ var c=g.ctx; mmRR(c,[X+W*0.2,Y+H*0.3,W*0.6,H*0.4],3,g.cor("#2e2e30"),g.cor("#111"),MM_T*0.02); },
  antena:function(g,X,Y,W,H){ var c=g.ctx, x=X+W/2, y=Y+H/2; mmBola(c,x,y,Math.min(W,H)*0.4,g.cor("#9aa6b2"),g.cor("#3d444c"),MM_T*0.04);
    mmBola(c,x,y,Math.min(W,H)*0.12,g.cor("#3d444c")); c.strokeStyle=g.cor("#3d444c"); c.lineWidth=MM_T*0.03; c.beginPath(); c.moveTo(x,y); c.lineTo(x+W*0.3,y-H*0.3); c.stroke(); }
};

/* paredes desenhadas na imagem: o elemento PAREDE so aparece para o mestre, entao quem joga ve o que esta pintado */
var MM_PAREDE={pedra:["#4d4842","#8a837a"],madeira:["#4a3120","#80593a"],metal:["#353c45","#9aa6b2"],tijolo:["#6a3626","#a2604a"],
  concreto:["#55524d","#a29f99"],rocha:["#25211d","#4a443e"],cerca:["#5a3b22","#8f6a44"],amurada:["#5b3a20","#94683f"]};
function mmPintaPorta(g,a,cor){
  var c=g.ctx, T=MM_T, x0=a.a[0]*T, y0=a.a[1]*T, x1=a.b[0]*T, y1=a.b[1]*T;
  var vert=x0===x1, ehMetal=a.est==="metal", corP=ehMetal?"#6f7b88":"#7b4e2c";
  c.fillStyle=g.cor(cor[0]);
  if(vert){
    c.fillRect(x0-T*0.11,y0,T*0.22,T*0.08); c.fillRect(x0-T*0.11,y1-T*0.08,T*0.22,T*0.08);
    mmRR(c,[x0-T*0.07,y0+T*0.08,T*0.14,T*0.84],2,g.cor(corP),g.cor(corP,-0.5),T*0.02);
  } else {
    c.fillRect(x0,y0-T*0.11,T*0.08,T*0.22); c.fillRect(x1-T*0.08,y0-T*0.11,T*0.08,T*0.22);
    mmRR(c,[x0+T*0.08,y0-T*0.07,T*0.84,T*0.14],2,g.cor(corP),g.cor(corP,-0.5),T*0.02);
  }
  if(!ehMetal){ return; }
  c.fillStyle=g.cor("#e0b341");
  if(vert){ c.fillRect(x0-T*0.02,y0+T*0.1,T*0.04,T*0.8); } else { c.fillRect(x0+T*0.1,y0-T*0.02,T*0.8,T*0.04); }
}
function mmTraco(c,a,cr,lw){ c.strokeStyle=cr; c.lineWidth=lw; c.beginPath(); c.moveTo(a.a[0]*MM_T,a.a[1]*MM_T); c.lineTo(a.b[0]*MM_T,a.b[1]*MM_T); c.stroke(); }
function mmPintaCerca(g,a,cor){
  var c=g.ctx, T=MM_T, x0=a.a[0]*T, y0=a.a[1]*T, x1=a.b[0]*T, y1=a.b[1]*T;
  mmTraco(c,a,g.cor(cor[0]),T*0.05);
  var n=Math.max(1,Math.round(Math.hypot(x1-x0,y1-y0)/T));
  c.fillStyle=g.cor(cor[1]);
  for(var i=0;i<=n;i++){ c.fillRect(x0+(x1-x0)*i/n-T*0.06,y0+(y1-y0)*i/n-T*0.06,T*0.12,T*0.12); }
}
/* um trecho: porta, cerca, amurada, janela ou parede, cada um com o seu desenho */
function mmPintaTrecho(g,a){
  var c=g.ctx, T=MM_T, cor=MM_PAREDE[a.est]||MM_PAREDE.pedra;
  if(a.k==="porta"){ mmPintaPorta(g,a,cor); }
  else if(a.est==="cerca"){ mmPintaCerca(g,a,cor); }
  else if(a.est==="amurada"){ mmTraco(c,a,g.cor(cor[0]),T*0.16); mmTraco(c,a,g.cor(cor[1]),T*0.06); }
  else if(a.k==="janela"){ mmTraco(c,a,g.cor(cor[0]),T*0.2); mmTraco(c,a,g.cor("#a9cfe0"),T*0.07); }
  else { mmTraco(c,a,g.cor(cor[0]),T*0.22); mmTraco(c,a,g.cor(cor[1]),T*0.05); }
}
function mmPintaParedes(g,arestas){
  var c=g.ctx, T=MM_T;
  c.save(); c.lineCap="square";
  c.save(); c.globalAlpha=0.3; c.strokeStyle="#000"; c.lineWidth=T*0.36;
  arestas.forEach(function(a){ if(a.k==="parede"&&a.est!=="cerca"){ c.beginPath(); c.moveTo(a.a[0]*T+T*0.04,a.a[1]*T+T*0.05); c.lineTo(a.b[0]*T+T*0.04,a.b[1]*T+T*0.05); c.stroke(); } });
  c.restore();
  arestas.forEach(function(a){ mmPintaTrecho(g,a); });
  c.restore();
}
/* o acaso fixo de uma casa, para o pintor do chao */
function mmAcasoDaCasa(p,cx,cy){ var s=p.semente||1; return function(n){ return mmHash(cx*31+n,cy*17+n*7,s); }; }
var MM_POR_BAIXO={tapete:1,estrado:1,palco:1,trilho:1,faixa:1,zebra:1};
function mmPintaTokens(ctx,p){
  var T=MM_T, ouro=mmRgb(mmCorTema("--gold","#c9a04a")), sangue=mmRgb(mmCorTema("--blood","#a3302a"));
  p.tokens.forEach(function(t){ mmBola(ctx,(t.x+t.tam/2)*T,(t.y+t.tam/2)*T,t.tam*T*0.38,t.npc?sangue:ouro,"#000",T*0.06); });
}
/* Pinta a planta inteira num canvas. escala 1 e a imagem do mapa; menor, a previa da galeria (com os tokens desenhados por cima). */
function mmPinta(cv,p,escala,comTokens){
  var T=MM_T;
  cv.width=Math.max(1,Math.round(p.cols*T*escala)); cv.height=Math.max(1,Math.round(p.rows*T*escala));
  var ctx=cv.getContext("2d"), g={ctx:ctx,cor:mmPaleta()};
  ctx.save(); ctx.scale(escala,escala);
  for(var y=0;y<p.rows;y++){ for(var x=0;x<p.cols;x++){ (MM_CHAO[p.mat[y][x]]||MM_CHAO.terra)(g,x*T,y*T,T,mmAcasoDaCasa(p,x,y),x,y); } }
  /* o que e tapete e estrado vai por baixo dos outros moveis */
  var baixo=p.objs.filter(function(o){ return MM_POR_BAIXO[o.t]; }), cima=p.objs.filter(function(o){ return !MM_POR_BAIXO[o.t]; });
  baixo.concat(cima).forEach(function(o){ var fn=MM_OBJ[o.t]; if(fn){ fn(g,o.x*T,o.y*T,o.w*T,o.h*T,o.o||{}); } });
  mmPintaParedes(g,mmArestas(p));
  if(comTokens){ mmPintaTokens(ctx,p); }
  ctx.restore();
}


/* ---------- os moldes (cada gerador devolve uma planta; mmGera poe a semente nela) ---------- */
function mmKindPorta(p,chanceAberta){ return function(){ return p.r.chance(chanceAberta||0.25)?"aberto":"porta"; }; }

function mmSobrepoe(l,x,y,w,h,m){ return l.some(function(s){ return x<s.x+s.w+m&&x+w+m>s.x&&y<s.y+s.h+m&&y+h+m>s.y; }); }
/* salas soltas pela planta, sem encostar umas nas outras; lim: [largura min, max, altura min, max] */
function mmSalasSoltas(p,n,lim){
  var r=p.r, cands=[];
  for(var t=0;t<500&&cands.length<n;t++){
    var w=r.int(lim[0],lim[1]), h=r.int(lim[2],lim[3]), x=r.int(1,p.cols-w-1), y=r.int(1,p.rows-h-1);
    if(!mmSobrepoe(cands,x,y,w,h,2)){ cands.push({x:x,y:y,w:w,h:h}); }
  }
  return cands.sort(function(a,b){ return a.x-b.x; });
}
/* arvores e pedras soltas onde o chao esta livre; tipo(k) diz o que cai em cada tentativa */
function mmEspalha(p,n,tipo,marcaOcupado){
  var r=p.r;
  for(var k=0;k<n;k++){
    var x=r.int(0,p.cols-1), y=r.int(0,p.rows-1);
    if(p.ocup[y][x]||!mmMobLivre(p,x,y,1,1)){ continue; }
    mmObj(p,tipo(k),x,y,1,1,{bloq:"parede",forma:"circ",folga:0.22,s:k});
    if(marcaOcupado){ p.ocup[y][x]=true; }
  }
}
function mmSalaDoChefe(p,s){
  if(s.w>=6&&s.h>=6){
    [[1,1],[s.w-2,1],[1,s.h-2],[s.w-2,s.h-2]].forEach(function(q){ mmObj(p,"coluna",s.x+q[0],s.y+q[1],1,1,{bloq:"parede",forma:"circ",folga:0.2}); });
  }
  var meio=s.x+Math.floor(s.w/2)-1;
  mmObj(p,"tapete",meio,s.y+1,2,s.h-2,{cor:"#5a1e1e"});
  mmObj(p,"trono",meio,s.y,2,1);
  mmEncosta(p,s,"bau",1,1);
  mmMarca(p,"Sala do chefe",s.x+s.w/2,s.y+s.h-0.5,"sangue");
  var e=mmLugar(p,s.x+1,s.y+1,s.w-2,s.h-2,2);
  if(e){ p.tokens.push({nome:"Chefe",x:e[0],y:e[1],npc:true,tam:2}); }
  mmNaSala(p,s,"Lacaio",2);
}
var MM_SALAS_MASMORRA={
  deposito:function(p,s){ mmVarios(p,s,"caixote",p.r.int(2,4),mmEncosta); mmVarios(p,s,"barril",p.r.int(1,3),mmEncosta); if(p.r.chance(0.5)){ mmNaSala(p,s,"Rato gigante",p.r.int(1,2)); } },
  cripta:function(p,s){ var n=p.r.int(2,4); for(var q=0;q<n;q++){ mmEncosta(p,s,"tumulo",1,2); } mmVarios(p,s,"ossos",2,mmNoMeio); mmNaSala(p,s,"Esqueleto",p.r.int(2,3)); },
  guarda:function(p,s){ mmNoMeio(p,s,"mesa",2,1); mmVarios(p,s,"cadeira",2,mmNoMeio); mmEncosta(p,s,"estante",1,2); mmNaSala(p,s,"Goblin",p.r.int(2,4)); },
  tesouro:function(p,s){ mmEncosta(p,s,"bau",1,1); mmEncosta(p,s,"bau",1,1); var c=mmCentro(s); mmMarca(p,"Armadilha",c[0]+0.5,c[1]+0.5,"sangue"); },
  templo:function(p,s){ mmEncosta(p,s,"altar",2,1); mmEncosta(p,s,"estatua",1,1); mmEncosta(p,s,"estatua",1,1); mmNaSala(p,s,"Cultista",p.r.int(1,3)); }
};
function mmArmadilhaNoCorredor(p,corr){
  var livres=[];
  mmCada(p,0,0,p.cols,p.rows,function(x,y){ if(p.zona[y][x]===corr&&!p.mob[y][x]){ livres.push([x,y]); } });
  if(livres.length){ var a=p.r.pick(livres); mmMarca(p,"Armadilha",a[0]+0.5,a[1]+0.5,"sangue"); }
}
function mmMasmorra(r){
  var C=36, R=26, p=mmPlanta(C,R,"rocha",r);
  mmRocha(p,0,0,C,R,"rocha");
  var salas=mmSalasSoltas(p,9,[4,8,4,7]).map(function(s){ return mmSala(p,s.x,s.y,s.w,s.h,"laje"); });
  var corr=mmZona(p,{}), porta=mmKindPorta(p,0.3);
  for(var i=1;i<salas.length;i++){ mmCorredor(p,salas[i-1],salas[i],corr,"laje",1,porta); }
  if(salas.length>3){ mmCorredor(p,salas[0],salas[r.int(2,salas.length-2)],corr,"laje",1,porta); }
  mmReservaPortas(p);
  var ent=salas[0];
  mmObj(p,"escada",ent.x,ent.y,1,1);
  mmMarca(p,"Entrada",ent.x+1.5,ent.y+0.5,"ouro");
  mmSalaDoChefe(p,salas.at(-1));
  var tipos=r.mistura(["deposito","cripta","guarda","tesouro","templo","deposito","guarda"]);
  salas.slice(1,-1).forEach(function(s,k){ MM_SALAS_MASMORRA[tipos[k%tipos.length]](p,s); });
  mmArmadilhaNoCorredor(p,corr);
  mmPJs(p,ent.x,ent.y,ent.w,ent.h);
  return p;
}


function mmTaverna(r){
  var C=30, R=22, p=mmPlanta(C,R,"terra",r); p.parede="madeira";
  mmChao(p,0,R-4,C,4,"calcada");
  var bw=r.int(22,25), bh=r.int(13,14), bx=Math.floor((C-bw)/2), by=2, lw=r.int(6,7), kh=Math.floor(bh/2);
  var hall=mmSala(p,bx,by,bw-lw,bh,"madeira");
  var coz=mmSala(p,bx+bw-lw,by,lw,kh,"pedra");
  var dep=mmSala(p,bx+bw-lw,by+kh,lw,bh-kh,"madeira");
  mmPortaSala(p,coz,"o",r.int(1,kh-2));
  mmPortaSala(p,dep,"n",r.int(1,lw-2));
  var hx=r.int(3,hall.w-5);
  mmPortaSala(p,hall,"s",hx); mmPortaSala(p,hall,"s",hx+1);
  mmPortaSala(p,coz,"l",r.int(1,kh-2));
  var fy=Math.floor(bh/2)-1;
  mmObj(p,"lareira",hall.x,hall.y+fy,1,2,{bloq:"parede"});
  mmJanelas(p,hall,"s",4); mmJanelas(p,dep,"l",3);
  mmPortaSala(p,hall,"o",1,"janela"); mmPortaSala(p,hall,"o",bh-2,"janela");
  mmReservaPortas(p);
  var bxb=hall.x+hall.w-3;
  mmObj(p,"balcao",bxb,hall.y+1,1,bh-5,{bloq:"janela"});
  for(var i=0;i<bh-5;i+=2){ if(mmMobLivre(p,hall.x+hall.w-1,hall.y+1+i,1,1)){ mmObj(p,"barril",hall.x+hall.w-1,hall.y+1+i,1,1); } }
  mmObj(p,"palco",hall.x+1,hall.y,3,2);
  for(var ty=hall.y+3;ty<hall.y+bh-3;ty+=3){
    for(var tx=hall.x+2;tx<bxb-2;tx+=3){
      if(!r.chance(0.8)||!mmMobLivre(p,tx-1,ty-1,3,3)){ continue; }
      if(r.chance(0.5)){ mmObj(p,"mesaRedonda",tx,ty,1,1); [[-1,0],[1,0],[0,-1],[0,1]].forEach(function(q){ if(r.chance(0.75)){ mmObj(p,"cadeira",tx+q[0],ty+q[1],1,1); } }); }
      else if(mmMobLivre(p,tx-1,ty-1,4,3)){ mmObj(p,"mesa",tx,ty,2,1); [[0,-1],[1,-1],[0,1],[1,1]].forEach(function(q){ if(r.chance(0.7)){ mmObj(p,"cadeira",tx+q[0],ty+q[1],1,1); } }); }
    }
  }
  mmEncosta(p,coz,"fogao",1,1); mmEncosta(p,coz,"pia",1,1); mmNoMeio(p,coz,"mesa",2,1); mmEncosta(p,coz,"barril",1,1);
  mmVarios(p,dep,"caixote",3,mmEncosta); mmVarios(p,dep,"barril",2,mmEncosta);
  if(mmNoMeio(p,dep,"alcapao",1,1)){ var al=p.objs.at(-1); mmMarca(p,"Alçapão para o porão",al.x+0.5,al.y+1.2); }
  mmPoe(p,"Taverneiro",[hall.x+hall.w-2,hall.y+1,1,bh-5],true);
  mmPoe(p,"Bardo",[hall.x+1,hall.y,3,2],true);
  mmNpcs(p,"Cliente",3,hall.x+1,hall.y+2,hall.w-5,bh-4);
  mmPJs(p,hall.x+hx-1,hall.y+bh-2,4,2);
  if(r.chance(0.5)){ mmEspelha(p); }
  return p;
}

/* a porta abre para o lado da rua mais perto; os dois lados seguintes ganham janela */
function mmPortaParaRua(p,s,rx,ry){
  var lados=[["n",Math.abs(s.y-ry)],["s",Math.abs(s.y+s.h-ry)],["o",Math.abs(s.x-rx)],["l",Math.abs(s.x+s.w-rx)]].sort(function(a,b){ return a[1]-b[1]; });
  mmPortaSala(p,s,lados[0][0]);
  mmJanelas(p,s,lados[1][0],3); mmJanelas(p,s,lados[2][0],3);
}
/* a primeira construcao que cabe e o templo (maior, de pedra), a segunda o ferreiro, o resto casas */
function mmCasasDaVila(p,rx,ry){
  var r=p.r, v={casas:[],templo:null,ferreiro:null};
  for(var t=0;t<600&&v.casas.length<9;t++){
    var grande=!v.templo, w=grande?r.int(7,8):r.int(4,6), h=grande?r.int(6,7):r.int(4,5);
    var x=r.int(1,p.cols-w-1), y=r.int(1,p.rows-h-1);
    if(!mmLivre(p,x,y,w,h,1)){ continue; }
    var s=grande?mmSala(p,x,y,w,h,"pedra",{est:"pedra"}):mmSala(p,x,y,w,h,"madeira");
    mmOcupa(p,x-1,y-1,w+2,h+2);
    mmPortaParaRua(p,s,rx,ry);
    if(grande){ v.templo=s; } else if(v.ferreiro){ v.casas.push(s); } else { v.ferreiro=s; }
  }
  return v;
}
function mmMobiliaVila(p,v){
  var r=p.r, t=v.templo, f=v.ferreiro;
  if(t){ mmEncosta(p,t,"altar",2,1); for(var b=0;b<3;b++){ mmNoMeio(p,t,"mesa",2,1); } mmMarca(p,"Templo",t.x+t.w/2,t.y-0.4,"ouro"); mmNaSala(p,t,"Sacerdote",1); }
  if(f){ mmEncosta(p,f,"lareira",1,1,{bloq:"parede"}); mmNoMeio(p,f,"bigorna",1,1); mmEncosta(p,f,"barril",1,1); mmMarca(p,"Ferreiro",f.x+f.w/2,f.y-0.4,"ouro"); mmNaSala(p,f,"Ferreiro",1); }
  v.casas.forEach(function(s){ mmEncosta(p,s,"cama",1,2,{cor:r.pick(["#7a2e2e","#2e4a7a","#4a6a2e"])}); mmNoMeio(p,s,"mesa",1,1); if(r.chance(0.5)){ mmEncosta(p,s,"barril",1,1); } });
}
function mmVila(r){
  var C=40, R=30, p=mmPlanta(C,R,"grama",r); p.parede="madeira";
  var cx=r.int(17,22), cy=r.int(13,16), pw=r.int(4,5), ph=r.int(3,4);
  var rx=cx+r.int(-1,1), ry=cy+r.int(-1,1);
  mmChao(p,rx-1,0,2,R,"terra"); mmChao(p,0,ry-1,C,2,"terra");
  mmOcupa(p,rx-1,0,2,R); mmOcupa(p,0,ry-1,C,2);
  mmChao(p,cx-pw,cy-ph,pw*2,ph*2,"calcada"); mmOcupa(p,cx-pw,cy-ph,pw*2,ph*2);
  mmObj(p,"poco",cx-1,cy-1,2,2,{bloq:"janela",forma:"circ",folga:0.25});
  var v=mmCasasDaVila(p,rx,ry);
  mmReservaPortas(p);
  mmMobiliaVila(p,v);
  for(var k=0;k<3;k++){
    var bx=cx-pw+1+k*Math.max(2,Math.floor(pw*2/3));
    if(mmMobLivre(p,bx,cy-ph,2,1)){ mmObj(p,"barraca",bx,cy-ph,2,1,{bloq:"janela"}); }
  }
  mmEspalha(p,70,function(){ return r.chance(0.7)?"arvore":"arbusto"; },true);
  if(mmMobLivre(p,rx+1,2,1,2)){ mmObj(p,"carroca",rx+1,2,1,2,{bloq:"janela"}); }
  mmNpcs(p,"Guarda",2,cx-pw,cy-ph,pw*2,ph*2);
  mmNpcs(p,"Mercador",1,cx-pw,cy-ph,pw*2,ph*2);
  mmNpcs(p,"Aldeão",2,cx-pw-2,cy-ph-2,pw*2+4,ph*2+4);
  mmPJs(p,0,ry-1,4,2);
  return p;
}


var MM_VIZ4=[[1,0],[-1,0],[0,1],[0,-1]];
/* quantas das 9 casas em volta (com ela) sao rocha */
function mmRochaEmVolta(g,x,y){
  var n=0;
  for(var j=-1;j<=1;j++){ for(var i=-1;i<=1;i++){ if(!g[y+j][x+i]){ n++; } } }
  return n;
}
/* automato celular: sorteia chao e rocha e alisa quatro vezes; a borda e sempre rocha */
function mmGrutaCrua(C,R,r){
  var g=mmGrade(C,R,false), x, y;
  for(y=1;y<R-1;y++){ for(x=1;x<C-1;x++){ g[y][x]=r.chance(0.56); } }
  for(var it=0;it<4;it++){
    var n=mmGrade(C,R,false);
    for(y=1;y<R-1;y++){ for(x=1;x<C-1;x++){ n[y][x]=mmRochaEmVolta(g,x,y)<5; } }
    g=n;
  }
  return g;
}
function mmRegiao(g,vis,x0,y0){
  var fila=[[x0,y0]], reg=[];
  vis[y0][x0]=true;
  while(fila.length){
    var c=fila.pop(); reg.push(c);
    MM_VIZ4.forEach(function(d){ var nx=c[0]+d[0], ny=c[1]+d[1]; if(g[ny]?.[nx]&&!vis[ny][nx]){ vis[ny][nx]=true; fila.push([nx,ny]); } });
  }
  return reg;
}
/* so a maior gruta fica: o resto vira rocha */
function mmMaiorRegiao(g){
  var R=g.length, C=g[0].length, vis=mmGrade(C,R,false), maior=[];
  for(var y=1;y<R-1;y++){ for(var x=1;x<C-1;x++){
    if(g[y][x]&&!vis[y][x]){ var reg=mmRegiao(g,vis,x,y); if(reg.length>maior.length){ maior=reg; } }
  } }
  return maior;
}
/* andando a partir da entrada, a casa mais longe e o covil */
function mmMaisLonge(p,ini,chao){
  var dist={}, fila=[ini], longe=ini;
  dist[ini.join(",")]=0;
  while(fila.length){
    var c=fila.shift(), d0=dist[c.join(",")];
    if(d0>dist[longe.join(",")]){ longe=c; }
    MM_VIZ4.forEach(function(d){ var nx=c[0]+d[0], ny=c[1]+d[1], k=nx+","+ny; if(mmDentro(p,nx,ny)&&p.zona[ny][nx]===chao&&dist[k]==null){ dist[k]=d0+1; fila.push([nx,ny]); } });
  }
  return longe;
}
/* rio subterraneo: agua rasa (terreno dificil) atravessando a gruta */
function mmRioDaGruta(p,chao){
  var ry=p.r.int(8,p.rows-9), fase=p.r.entre(0,6);
  for(var x=0;x<p.cols;x++){
    var y0=Math.round(ry+Math.sin(x*0.25+fase)*3);
    mmCada(p,x,y0,1,2,function(i,j){ if(p.zona[j][i]===chao){ p.mat[j][i]="agua"; } });
  }
}
function mmLarga(p,c,chao){
  for(var j=-1;j<=1;j++){ for(var i=-1;i<=1;i++){ if(p.zona[c[1]+j]?.[c[0]+i]!==chao){ return false; } } }
  return p.mat[c[1]][c[0]]!=="agua";
}
function mmPoeSoltos(p,lugares,t,o){ lugares.forEach(function(c){ if(mmMobLivre(p,c[0],c[1],1,1)){ mmObj(p,t,c[0],c[1],1,1,o); } }); }
function mmMina(p,ent,chao,largas){
  var tx=ent[0]+1, ty=ent[1];
  for(var q=0;q<10&&mmDentro(p,tx+q,ty)&&p.zona[ty][tx+q]===chao;q++){ if(!p.mob[ty][tx+q]){ mmObj(p,"trilho",tx+q,ty,1,1); } }
  mmPoeSoltos(p,p.r.mistura(largas).slice(0,3),"carrinho");
  mmPoeSoltos(p,p.r.mistura(largas).slice(0,4),"caixote");
}
function mmCaverna(r){
  var C=40, R=30, regiao=[];
  for(var tent=0;tent<6&&regiao.length<=C*R*0.3;tent++){ regiao=mmMaiorRegiao(mmGrutaCrua(C,R,r)); }
  var p=mmPlanta(C,R,"rocha",r); p.parede="rocha";
  mmRocha(p,0,0,C,R,"rocha");
  var chao=mmZona(p,{}), mina=r.chance(0.5), piso=mina?"terra":"laje";
  regiao.forEach(function(c){ p.zona[c[1]][c[0]]=chao; p.mat[c[1]][c[0]]=piso; });
  /* a entrada: da casa mais a esquerda ate a borda, duas casas de largura */
  var ent=regiao.reduce(function(a,b){ return b[0]<a[0]?b:a; },regiao[0]);
  mmCada(p,0,ent[1],ent[0]+1,ent[1]+1<R-1?2:1,function(i,j){ p.zona[j][i]=chao; p.mat[j][i]=piso; });
  var longe=mmMaisLonge(p,[0,ent[1]],chao);
  mmRioDaGruta(p,chao);
  var largas=regiao.filter(function(c){ return mmLarga(p,c,chao); });
  r.mistura(largas).slice(0,9).forEach(function(c,i){
    if(Math.abs(c[0]-ent[0])+Math.abs(c[1]-ent[1])>4){ mmPoeSoltos(p,[c],"rocha",{bloq:"parede",forma:"circ",folga:0.2,s:i}); }
  });
  if(mina){ mmMina(p,ent,chao,largas); }
  var agua=regiao.filter(function(c){ return p.mat[c[1]][c[0]]==="agua"; });
  if(agua.length){ var ag=agua[Math.floor(agua.length/2)]; mmMarca(p,"Água rasa: terreno difícil",ag[0]+0.5,ag[1]+0.5,"aviso"); }
  mmMarca(p,"Covil",longe[0]+0.5,longe[1]-0.3,"sangue");
  mmNpcs(p,"Criatura da caverna",1,longe[0]-2,longe[1]-2,5,5);
  r.mistura(largas).slice(0,3).forEach(function(c,i){ mmPoe(p,"Habitante da gruta "+(i+1),[c[0],c[1],1,1],true); });
  mmPJs(p,0,ent[1],4,2);
  return p;
}


function mmCastelo(r){
  var C=34, R=28, p=mmPlanta(C,R,"grama",r); p.parede="pedra";
  var x0=2, y0=2, sw=r.int(6,7), hw=r.int(12,14), W=sw*2+hw, xH=x0+sw;
  var topo=y0, alt=R-y0-7, atr=4;
  var salao=mmSala(p,xH,topo,hw,alt,"laje");
  var atrio=mmSala(p,xH,topo+alt,hw,atr,"pedra");
  var h1=Math.floor(alt/2);
  var esq1=mmSala(p,x0,topo,sw,h1,"pedra"), esq2=mmSala(p,x0,topo+h1,sw,alt-h1+atr,"madeira");
  var dir1=mmSala(p,xH+hw,topo,sw,h1,"madeira"), dir2=mmSala(p,xH+hw,topo+h1,sw,alt-h1+atr,"pedra");
  mmChao(p,x0,topo+alt+atr,W,R-(topo+alt+atr),"calcada");
  var meio=Math.floor(hw/2);
  mmPortaSala(p,atrio,"s",meio-1); mmPortaSala(p,atrio,"s",meio);
  mmPortaSala(p,salao,"s",meio-1,"aberto"); mmPortaSala(p,salao,"s",meio,"aberto"); mmPortaSala(p,salao,"s",meio-2,"aberto"); mmPortaSala(p,salao,"s",meio+1,"aberto");
  mmPortaSala(p,esq1,"l",r.int(1,h1-2)); mmPortaSala(p,dir1,"o",r.int(1,h1-2));
  mmPortaSala(p,esq2,"l",r.int(1,esq2.h-2)); mmPortaSala(p,dir2,"o",r.int(1,dir2.h-2));
  mmPortaSala(p,esq1,"s",r.int(1,sw-2)); mmPortaSala(p,dir1,"s",r.int(1,sw-2));
  mmJanelas(p,esq1,"o",3); mmJanelas(p,dir1,"l",3); mmJanelas(p,esq2,"o",4); mmJanelas(p,dir2,"l",4);
  mmReservaPortas(p);
  mmObj(p,"estrado",salao.x+meio-3,salao.y,6,2);
  mmObj(p,"trono",salao.x+meio-1,salao.y,2,1);
  mmObj(p,"tapete",salao.x+meio-1,salao.y+2,2,alt-2,{cor:"#6e2323"});
  for(var y=salao.y+3;y<salao.y+alt-1;y+=3){
    mmObj(p,"coluna",salao.x+2,y,1,1,{bloq:"parede",forma:"circ",folga:0.2});
    mmObj(p,"coluna",salao.x+hw-3,y,1,1,{bloq:"parede",forma:"circ",folga:0.2});
  }
  var tipos=r.mistura(["guarda","arsenal","biblioteca","capela"]);
  [esq1,esq2,dir1,dir2].forEach(function(s,i){
    var tp=tipos[i];
    if(tp==="guarda"){ mmNoMeio(p,s,"mesa",2,1); mmVarios(p,s,"cadeira",3,mmNoMeio); mmEncosta(p,s,"estante",1,2); mmNaSala(p,s,"Guarda",2); mmMarca(p,"Guarda",s.x+s.w/2,s.y+0.5); }
    else if(tp==="arsenal"){ mmEncosta(p,s,"estante",1,3); mmEncosta(p,s,"estante",1,3); mmVarios(p,s,"bau",2,mmEncosta); mmMarca(p,"Arsenal",s.x+s.w/2,s.y+0.5); }
    else if(tp==="biblioteca"){ for(var k=0;k<4;k++){ mmEncosta(p,s,"estante",1,2); } mmNoMeio(p,s,"mesa",2,1); mmNaSala(p,s,"Conselheiro",1); mmMarca(p,"Biblioteca",s.x+s.w/2,s.y+0.5); }
    else { mmEncosta(p,s,"altar",2,1); mmVarios(p,s,"vaso",2,mmEncosta); mmMarca(p,"Capela",s.x+s.w/2,s.y+0.5); }
  });
  mmVarios(p,atrio,"vaso",2,mmEncosta);
  p.tokens.push({nome:"Monarca",x:salao.x+meio-1,y:salao.y+1,npc:true,tam:1}); p.mob[salao.y+1][salao.x+meio-1]=true;
  mmNpcs(p,"Guarda real",2,salao.x+meio-3,salao.y+1,6,3);
  mmNpcs(p,"Sentinela",2,atrio.x,atrio.y,atrio.w,atrio.h);
  mmPJs(p,atrio.x+meio-3,R-3,6,3);
  return p;
}

/* a estrada serpenteia de um lado ao outro; cy[x] e a linha do meio dela em cada coluna */
function mmEstradaSinuosa(p){
  var r=p.r, base=r.int(10,15), A=r.entre(2,4), f=r.entre(0.12,0.22), fase=r.entre(0,6), cy=[];
  for(var x=0;x<p.cols;x++){ cy.push(Math.round(base+Math.sin(x*f+fase)*A)); mmChao(p,x,cy[x]-1,1,3,"terra"); mmOcupa(p,x,cy[x]-2,1,5); }
  return cy;
}
function mmRioComPonte(p,cy){
  var rio=p.r.int(24,30);
  for(var y=0;y<p.rows;y++){ mmChao(p,rio,y,2,1,"agua"); mmOcupa(p,rio-1,y,4,1); }
  mmChao(p,rio,cy[rio]-1,2,3,"madeira"); mmMarca(p,"Ponte",rio+1,cy[rio]-1.6,"ouro",true);
}
function mmTemArvoreEm(p,x,y,raio){ return p.objs.some(function(o){ return o.t==="arvore"&&Math.abs(Math.floor(o.x)-x)<=raio&&Math.abs(Math.floor(o.y)-y)<=raio; }); }
/* mata fechada: arvore perto de arvore entra menos, para sobrar passagem */
function mmMata(p,n){
  var r=p.r;
  for(var k=0;k<n;k++){
    var x=r.int(0,p.cols-1), y=r.int(0,p.rows-1);
    var pula=p.ocup[y][x]||!mmMobLivre(p,x,y,1,1)||(mmTemArvoreEm(p,x,y,1)&&r.chance(0.6));
    if(pula){ continue; }
    var t=r.chance(0.82)?"arvore":"arbusto";
    mmObj(p,r.chance(0.1)?"rocha":t,x,y,1,1,{bloq:"parede",forma:"circ",folga:0.22,s:k});
  }
}
/* os bandidos esperam atras das arvores, dos dois lados da estrada, perto da carroca */
function mmBandidos(p,cy,mx){
  var esconde=[];
  mmCada(p,mx-5,0,12,p.rows,function(x,y){
    var d=Math.abs(y-cy[x]);
    if(!p.mob[y][x]&&d>=3&&d<=6&&mmTemArvoreEm(p,x,y,1)){ esconde.push([x,y]); }
  });
  p.r.mistura(esconde).slice(0,5).forEach(function(c,i){
    p.mob[c[1]][c[0]]=true;
    p.tokens.push({nome:i===0?"Líder dos bandidos":"Bandido "+i,x:c[0],y:c[1],npc:true,tam:1});
  });
}
function mmEstrada(r){
  var C=40, R=26, p=mmPlanta(C,R,"grama",r);
  var cy=mmEstradaSinuosa(p);
  if(r.chance(0.5)){ mmRioComPonte(p,cy); }
  mmMata(p,170);
  var mx=r.int(16,22);
  mmObj(p,"carroca",mx,cy[mx]-1,2,1,{bloq:"janela"});
  mmMarca(p,"Carroça tombada",mx+1,cy[mx]-1.5,"aviso");
  mmPoe(p,"Viajante ferido",[mx-1,cy[mx]-1,3,3],true);
  mmBandidos(p,cy,mx);
  mmMarca(p,"Emboscada",mx+1,cy[mx]+2.2,"sangue");
  mmPJs(p,0,cy[0]-1,4,3);
  if(r.chance(0.5)){ mmEspelha(p); }
  return p;
}

/* a clareira: terra no meio, misturada com grama na borda */
function mmClareira(p,cx,cy,ex,ey){
  mmCada(p,0,0,p.cols,p.rows,function(x,y){
    var d=((x+0.5-cx)/ex)**2+((y+0.5-cy)/ey)**2;
    if(d>=1){ return; }
    var terra=d<0.55||mmHash(x,y,4)<0.5;
    p.mat[y][x]=terra?"terra":"grama"; p.ocup[y][x]=true;
  });
}
function mmBarracasEmRoda(p,cx,cy,ex,ey){
  var r=p.r, n=r.int(4,6);
  for(var i=0;i<n;i++){
    var a=i/n*Math.PI*2+r.entre(-0.2,0.2), bx=Math.round(cx+Math.cos(a)*(ex-3))-1, by=Math.round(cy+Math.sin(a)*(ey-2.5))-1;
    if(mmMobLivre(p,bx,by,2,2)){ mmObj(p,"barraca",bx,by,2,2,{bloq:"parede"}); }
  }
}
function mmAcampamento(r){
  var C=34, R=26, p=mmPlanta(C,R,"grama",r);
  var cx=r.int(15,18), cy=r.int(11,14), ex=r.int(8,10), ey=r.int(6,8);
  mmClareira(p,cx,cy,ex,ey);
  mmObj(p,"fogueira",cx-1,cy-1,2,2,{bloq:"janela",forma:"circ",folga:0.35});
  mmMarca(p,"Fogueira",cx,cy+1.4,"ouro");
  [cy-2,cy+1].forEach(function(ty){ if(mmMobLivre(p,cx-1,ty,2,1)){ mmObj(p,"tronco",cx-1,ty,2,1); } });
  mmBarracasEmRoda(p,cx,cy,ex,ey);
  mmEspalha(p,90,function(){ return r.chance(0.85)?"arvore":"rocha"; },false);
  var vx=cx+ex-3, vy=cy-ey+2;
  [["#7a5a3a",0],["#4a3220",2]].forEach(function(a){ if(mmMobLivre(p,vx+a[1],vy,2,1)){ mmObj(p,"animal",vx+a[1],vy,2,1,{cor:a[0]}); } });
  if(mmMobLivre(p,cx-ex+2,cy+ey-3,2,1)){ mmObj(p,"carroca",cx-ex+2,cy+ey-3,2,1,{bloq:"janela"}); }
  mmVarios(p,{x:cx-4,y:cy-3,w:8,h:6},"caixote",2,mmNoMeio);
  mmNpcs(p,"Sentinela",2,cx-ex,cy-ey,ex*2,2);
  mmNpcs(p,"Acampado",3,cx-3,cy-3,6,6);
  mmPJs(p,0,cy-2,3,4);
  return p;
}

/* o casco: retangulo com a proa afinando nas ultimas colunas */
function mmCasco(p,x0,y0,L,B,proa){
  var conves=mmZona(p,{borda:"janela",est:"amurada"}), meio=y0+B/2;
  for(var x=x0;x<x0+L;x++){
    var resta=x0+L-1-x, hw=resta<proa?Math.max(0.6,(B/2)*Math.sqrt((resta+0.5)/proa)):B/2;
    var ya=Math.ceil(meio-hw-0.01), yb=Math.floor(meio+hw+0.01);
    mmCada(p,x,ya,1,yb-ya,function(i,j){ p.zona[j][i]=conves; p.mat[j][i]="madeira"; p.ocup[j][i]=true; });
  }
}
function mmCanhoes(p,de,ate,y0,B){
  for(var cx=de;cx<ate;cx+=3){
    if(mmMobLivre(p,cx,y0,1,1)){ mmObj(p,"canhao",cx,y0,1,1,{rot:0}); }
    if(mmMobLivre(p,cx,y0+B-1,1,1)){ mmObj(p,"canhao",cx,y0+B-1,1,1,{rot:Math.PI}); }
  }
}
/* atracado: o cais no alto e uma prancha ate a amurada */
function mmCais(p,px,y0){
  var r=p.r;
  mmChao(p,0,0,p.cols,2,"madeira");
  mmChao(p,px,2,3,y0-2,"madeira");
  mmPorta(p,px,y0,"n","aberto"); mmPorta(p,px+1,y0,"n","aberto");
  for(var k=0;k<3;k++){ var bx=r.int(0,p.cols-1); if(mmMobLivre(p,bx,0,1,1)){ mmObj(p,"barril",bx,0,1,1); } }
  mmPJs(p,px-2,0,7,2);
}
function mmNavio(r){
  var C=40, R=20, p=mmPlanta(C,R,"agua",r); p.parede="madeira";
  var x0=r.int(3,5), L=r.int(28,31), y0=r.int(5,6), B=9, proa=7, cyM=y0+Math.floor(B/2);
  mmCasco(p,x0,y0,L,B,proa);
  var cab=mmSala(p,x0,y0+1,r.int(5,6),B-2,"madeira");
  mmPortaSala(p,cab,"l",Math.floor((B-2)/2));
  mmJanelas(p,cab,"o",2);
  mmObj(p,"mesa",cab.x+1,cab.y+2,2,1); mmEncosta(p,cab,"bau",1,1); mmEncosta(p,cab,"cama",1,2,{cor:"#2e4a7a"});
  mmMarca(p,"Cabine do capitão",cab.x+cab.w/2,cab.y-0.3,"ouro");
  mmReservaPortas(p);
  mmObj(p,"leme",cab.x+cab.w,cyM-1,1,1);
  var mastros=[x0+Math.floor(L*0.38),x0+Math.floor(L*0.62)];
  if(r.chance(0.5)){ mastros.push(x0+Math.floor(L*0.82)); }
  mastros.forEach(function(mx){ mmObj(p,"mastro",mx,cyM,1,1,{bloq:"parede",forma:"circ",folga:0.25}); });
  mmCanhoes(p,cab.x+cab.w+2,x0+L-proa,y0,B);
  var hx=x0+Math.floor(L*0.5);
  if(mmMobLivre(p,hx,cyM-2,2,1)){ mmObj(p,"alcapao",hx,cyM-2,2,1); mmMarca(p,"Escotilha do porão",hx+1,cyM-2.4); }
  var conv={x:cab.x+cab.w+1,y:y0+1,w:L-cab.w-proa,h:B-2};
  mmVarios(p,conv,"barril",r.int(2,4),mmNoMeio); mmVarios(p,conv,"caixote",r.int(2,4),mmNoMeio);
  var cais=r.chance(0.55);
  if(cais){ mmCais(p,x0+Math.floor(L*0.45),y0); }
  mmPoe(p,"Capitão",[cab.x,cab.y,cab.w,cab.h],true);
  mmPoe(p,"Imediato",[cab.x+cab.w,y0,2,B],true);
  mmNpcs(p,"Marinheiro",3,conv.x,conv.y,conv.w,conv.h);
  if(!cais){ mmPJs(p,x0+L-proa-4,y0+2,4,B-4); }
  return p;
}


/* divide um retangulo em comodos (arvore binaria); cada divisao ganha uma porta, entao todos os comodos se ligam */
function mmDivide(p,x,y,w,h,min,acc){
  var podeV=w>=min*2, podeH=h>=min*2;
  var para=(!podeV&&!podeH)||acc.folhas.length+1>=8||(w*h<min*min*2.2&&p.r.chance(0.6));
  if(para){ acc.folhas.push({x:x,y:y,w:w,h:h}); return; }
  var vert=podeV&&(!podeH||w>h||(w===h&&p.r.chance(0.5)));
  if(vert){ var k=p.r.int(min,w-min); mmDivide(p,x,y,k,h,min,acc); mmDivide(p,x+k,y,w-k,h,min,acc); acc.portas.push({v:true,x:x+k,y:y+p.r.int(0,h-1)}); }
  else { var k2=p.r.int(min,h-min); mmDivide(p,x,y,w,k2,min,acc); mmDivide(p,x,y+k2,w,h-k2,min,acc); acc.portas.push({v:false,x:x+p.r.int(0,w-1),y:y+k2}); }
}

/* uma casa: comodos pela divisao, cada um com o seu tipo e os seus moveis */
function mmCasa(p,x,y,w,h,tipos){
  var folhas=[], portas=[];
  mmDivide(p,x,y,w,h,4,{folhas:folhas,portas:portas});
  folhas.sort(function(a,b){ return b.w*b.h-a.w*a.h; });
  var salas=folhas.map(function(f,i){ var tp=tipos[Math.min(i,tipos.length-1)];
    var mat={sala:"madeira",cozinha:"piso",banheiro:"azulejo",quarto:"madeira",jantar:"madeira",escritorio:"carpete"}[tp]||"madeira";
    var s=mmSala(p,f.x,f.y,f.w,f.h,mat); s.tipo=tp; return s; });
  portas.forEach(function(q){ p.portas[(q.v?"v:":"h:")+q.x+":"+q.y]="porta"; });
  return salas;
}
function mmMobiliaCasa(p,s){
  var r=p.r;
  if(s.tipo==="sala"){ mmObj(p,"tapete",s.x+1,s.y+1,Math.max(1,s.w-2),Math.max(1,s.h-2),{cor:"#4a3a5a"}); mmEncosta(p,s,"sofa",2,1,{cor:r.pick(["#4a5a7a","#6a3a3a","#4a6a4a"])}); mmEncosta(p,s,"lareira",1,1,{bloq:"parede"}); mmEncosta(p,s,"estante",2,1); mmVarios(p,s,"vaso",1,mmEncosta); }
  else if(s.tipo==="cozinha"){ mmEncosta(p,s,"fogao",1,1); mmEncosta(p,s,"pia",1,1); mmEncosta(p,s,"bancada",2,1); mmNoMeio(p,s,"mesa",1,1); }
  else if(s.tipo==="jantar"){ mmNoMeio(p,s,"mesa",Math.max(2,s.w-3),1); mmEncosta(p,s,"estante",2,1); }
  else if(s.tipo==="banheiro"){ mmEncosta(p,s,"banheira",2,1); mmEncosta(p,s,"pia",1,1); }
  else if(s.tipo==="escritorio"){ mmNoMeio(p,s,"mesa",2,1); mmEncosta(p,s,"estante",2,1); mmEncosta(p,s,"estante",2,1); }
  else { mmEncosta(p,s,"cama",1,2,{cor:r.pick(["#7a2e2e","#2e4a7a","#4a6a2e","#6a5a2e"])}); mmEncosta(p,s,"bau",1,1); mmEncosta(p,s,"estante",1,1); }
}
/* a porta da frente: na parede de baixo do comodo que encosta nela (de preferencia a sala) */
function mmPortaDaFrente(p,salas,yBase){
  var na=salas.filter(function(s){ return s.y+s.h===yBase; });
  var s=na.find(function(x){ return x.tipo==="sala"; })||na[0]||salas[0];
  var pos=Math.floor(s.w/2);
  mmPortaSala(p,s,"s",pos);
  return {x:s.x+pos,y:s.y+s.h};
}
function mmJanelasExternas(p,salas,x,y,w,h){
  salas.forEach(function(s){
    if(s.tipo==="banheiro"){ return; }
    if(s.y===y){ mmJanelas(p,s,"n",3); }
    if(s.x===x){ mmJanelas(p,s,"o",3); }
    if(s.x+s.w===x+w){ mmJanelas(p,s,"l",3); }
    if(s.y+s.h===y+h){ mmJanelas(p,s,"s",4); }
  });
}

function mmMansao(r){
  var C=32, R=24, p=mmPlanta(C,R,"grama",r); p.parede="tijolo";
  var jardim=mmZona(p,{borda:"janela",est:"cerca"});
  mmCada(p,1,1,C-2,R-2,function(x,y){ p.zona[y][x]=jardim; });
  var w=r.int(20,24), h=r.int(13,15), x=Math.floor((C-w)/2), y=2;
  var salas=mmCasa(p,x,y,w,h,["sala","jantar","cozinha","quarto","quarto","escritorio","banheiro","quarto"]);
  var frente=mmPortaDaFrente(p,salas,y+h);
  mmJanelasExternas(p,salas,x,y,w,h);
  mmPorta(p,frente.x,R-2,"s","aberto");
  mmChao(p,frente.x,frente.y,1,R-frente.y,"calcada");
  mmReservaPortas(p);
  salas.forEach(function(s){ mmMobiliaCasa(p,s); });
  var porao=r.pick(salas.filter(function(s){ return s.tipo!=="banheiro"; }));
  if(mmEncosta(p,porao,"escada",1,2)){ var es=p.objs.at(-1); mmMarca(p,"Escada para o porão",es.x+0.5,es.y+es.h+0.3,"sangue"); }
  for(var k=0;k<40;k++){ var ax=r.int(1,C-2), ay=r.int(1,R-2); if(p.zona[ay][ax]===jardim&&p.mat[ay][ax]==="grama"&&mmMobLivre(p,ax,ay,1,1)){ mmObj(p,r.chance(0.6)?"arbusto":"arvore",ax,ay,1,1,{bloq:"parede",forma:"circ",folga:0.25}); } }
  var sala=salas.find(function(s){ return s.tipo==="sala"; })||salas[0];
  mmNaSala(p,sala,"Morador",1);
  mmNaSala(p,porao,"Figura misteriosa",1);
  mmPJs(p,frente.x-2,R-3,5,2);
  if(r.chance(0.5)){ mmEspelha(p); }
  return p;
}

function mmFazenda(r){
  var C=40, R=30, p=mmPlanta(C,R,"grama",r); p.parede="madeira";
  var quad=r.mistura([[1,1],[21,1],[1,16],[21,16]]);
  var cx=Math.floor(C/2), cy=Math.floor(R/2);
  mmChao(p,0,cy-1,C,2,"terra"); mmChao(p,cx-1,0,2,R,"terra"); mmOcupa(p,0,cy-1,C,2); mmOcupa(p,cx-1,0,2,R);
  var q=quad[0], hx=q[0]+1, hy=q[1]+1, salas=mmCasa(p,hx,hy,r.int(10,12),r.int(8,9),["sala","cozinha","quarto","quarto","banheiro"]);
  mmOcupa(p,hx-1,hy-1,14,11);
  var hh=salas.reduce(function(m,s){ return Math.max(m,s.y+s.h); },0)-hy, ww=salas.reduce(function(m,s){ return Math.max(m,s.x+s.w); },0)-hx;
  var lado=hy<cy?"s":"n";
  var sf=salas.find(function(s){ return lado==="s"?s.y+s.h===hy+hh:s.y===hy; })||salas[0];
  mmPortaSala(p,sf,lado);
  mmJanelasExternas(p,salas,hx,hy,ww,hh);
  q=quad[1]; var bw=r.int(9,11), bh=r.int(7,8), bx=q[0]+1, by=q[1]+1;
  var celeiro=mmSala(p,bx,by,bw,bh,"palha");
  mmOcupa(p,bx-1,by-1,bw+2,bh+2);
  var lc=by<cy?"s":"n", pc=Math.floor(bw/2)-1;
  mmPortaSala(p,celeiro,lc,pc,"aberto"); mmPortaSala(p,celeiro,lc,pc+1,"aberto");
  q=quad[2]; var cw=r.int(8,10), ch=r.int(6,7), kx=q[0]+1, ky=q[1]+1;
  var curral=mmSala(p,kx,ky,cw,ch,"terra",{borda:"janela",est:"cerca"});
  mmOcupa(p,kx-1,ky-1,cw+2,ch+2);
  mmPortaSala(p,curral,ky<cy?"s":"n",Math.floor(cw/2),"aberto");
  q=quad[3]; var fw=r.int(12,15), fh=r.int(8,10), fx=q[0]+1, fy=q[1]+1;
  mmChao(p,fx,fy,fw,fh,"plantacao"); mmOcupa(p,fx,fy,fw,fh);
  mmMarca(p,"Plantação",fx+fw/2,fy-0.3,"ok");
  mmReservaPortas(p);
  salas.forEach(function(s){ mmMobiliaCasa(p,s); });
  for(var i=0;i<4;i++){ mmEncosta(p,celeiro,"feno",1,1); }
  mmNoMeio(p,celeiro,"carroca",2,1,{bloq:"janela"}); mmEncosta(p,celeiro,"caixote",1,1);
  for(var a=0;a<r.int(3,5);a++){ mmNoMeio(p,curral,"animal",2,1,{cor:r.pick(["#6b4a2e","#d8d2c4","#2e2a26"]),rot:r.chance(0.5)?0:Math.PI}); }
  p.mob[fy+Math.floor(fh/2)][fx+Math.floor(fw/2)]=false;
  mmObj(p,"espantalho",fx+Math.floor(fw/2),fy+Math.floor(fh/2),1,1);
  if(mmMobLivre(p,cx+1,cy+1,1,1)){ mmObj(p,"poco",cx+1,cy+1,1,1,{bloq:"janela",forma:"circ",folga:0.2}); }
  for(var k=0;k<60;k++){ var ax=r.int(0,C-1), ay=r.int(0,R-1); if(!p.ocup[ay][ax]&&mmMobLivre(p,ax,ay,1,1)){ mmObj(p,"arvore",ax,ay,1,1,{bloq:"parede",forma:"circ",folga:0.22}); p.ocup[ay][ax]=true; } }
  var sala=salas.find(function(s){ return s.tipo==="sala"; })||salas[0];
  mmNaSala(p,sala,"Fazendeiro",1);
  mmNaSala(p,celeiro,"Peão",2);
  mmNpcs(p,"Algo no milharal",1,fx,fy,fw,fh);
  mmPJs(p,0,cy-1,4,2);
  return p;
}

function mmHospital(r){
  var C=36, R=26, p=mmPlanta(C,R,"asfalto",r); p.parede="concreto";
  var x0=1, x1=C-1, yc=r.int(9,10), ch=3, yTop=1, yBot=yc+ch, hBot=r.int(7,8);
  var corr=mmSala(p,x0,yc,x1-x0,ch,"azulejo");
  var lab=r.chance(0.5);
  var tipos=lab?["laboratorio","laboratorio","almoxarifado","escritorio","contencao","enfermaria","necroterio"]:["enfermaria","enfermaria","cirurgia","almoxarifado","escritorio","necroterio","laboratorio"];
  var salas=[];
  function fileira(y,h,embaixo){
    var x=x0, lista=r.mistura(tipos);
    while(x<x1-3){
      var w=Math.min(r.int(5,8),x1-x);
      if(x1-x-w<4){ w=x1-x; }
      var s=mmSala(p,x,y,w,h,"azulejo"); s.tipo=lista[salas.length%lista.length];
      mmPortaSala(p,s,embaixo?"n":"s",r.int(1,Math.max(1,w-2)));
      salas.push(s); x+=w;
    }
  }
  fileira(yTop,yc-yTop,false);
  /* a recepcao fica embaixo, no meio, e da para a rua */
  var rw=r.int(8,10), rx=Math.floor((C-rw)/2);
  var esq={x:x0,w:rx-x0}, dir={x:rx+rw,w:x1-rx-rw};
  [esq,dir].forEach(function(b){
    var x=b.x, lista=r.mistura(tipos);
    while(x<b.x+b.w){ var w=Math.min(r.int(5,7),b.x+b.w-x); if(b.x+b.w-x-w<4){ w=b.x+b.w-x; }
      var s=mmSala(p,x,yBot,w,hBot,"azulejo"); s.tipo=lista[salas.length%lista.length]; mmPortaSala(p,s,"n",r.int(1,Math.max(1,w-2))); mmJanelas(p,s,"s",3); salas.push(s); x+=w; }
  });
  var rec=mmSala(p,rx,yBot,rw,hBot,"piso"); rec.tipo="recepcao";
  mmPortaSala(p,rec,"n",Math.floor(rw/2)-1,"aberto"); mmPortaSala(p,rec,"n",Math.floor(rw/2),"aberto");
  mmPortaSala(p,rec,"s",Math.floor(rw/2)-1); mmPortaSala(p,rec,"s",Math.floor(rw/2));
  mmPortaSala(p,corr,"o",1); mmPortaSala(p,corr,"l",1);
  mmReservaPortas(p);
  salas.forEach(function(s){
    var t=s.tipo, nm={enfermaria:"Enfermaria",cirurgia:"Cirurgia",laboratorio:"Laboratório",almoxarifado:"Almoxarifado",escritorio:"Escritório",necroterio:"Necrotério",contencao:"Contenção"}[t];
    if(t==="enfermaria"){ for(var i=0;i<Math.floor(s.w/2);i++){ mmEncosta(p,s,"maca",1,2); } mmNaSala(p,s,"Paciente",1); }
    else if(t==="cirurgia"){ mmNoMeio(p,s,"mesaCirurgia",1,2); mmEncosta(p,s,"bancada",2,1); mmNaSala(p,s,"Cirurgião",1); }
    else if(t==="laboratorio"){ mmEncosta(p,s,"bancada",2,1); mmEncosta(p,s,"bancada",2,1); mmEncosta(p,s,"tanque",1,1); mmNaSala(p,s,"Pesquisador",1); }
    else if(t==="almoxarifado"){ mmVarios(p,s,"estante",1,function(pp,ss){ mmEncosta(pp,ss,"estante",1,2); }); mmVarios(p,s,"caixote",3,mmEncosta); }
    else if(t==="escritorio"){ mmNoMeio(p,s,"mesa",2,1); mmEncosta(p,s,"estante",2,1); }
    else if(t==="contencao"){ mmNoMeio(p,s,"tanque",1,1); mmNoMeio(p,s,"tanque",1,1); mmNaSala(p,s,"Criatura",1); }
    else { for(var j=0;j<2;j++){ mmEncosta(p,s,"maca",1,2); } mmEncosta(p,s,"estante",2,1); }
    if(nm){ mmMarca(p,nm,s.x+s.w/2,s.y+(s.y<yc?0.5:s.h-0.5)); }
  });
  var tranc=r.pick(salas.filter(function(s){ return s.y<yc; }));
  mmMarca(p,"Porta trancada",tranc.x+tranc.w/2,yc+0.4,"sangue");
  mmEncosta(p,rec,"balcao",3,1,{bloq:"janela"}); mmVarios(p,rec,"cadeira",3,mmEncosta); mmVarios(p,rec,"vaso",1,mmEncosta);
  mmNaSala(p,rec,"Plantonista",1);
  mmPoe(p,"Segurança",[corr.x,corr.y,corr.w,corr.h],true);
  var py=yBot+hBot+1;
  for(var cx=1;cx<C-2;cx+=2){ if(cx>=rx-1&&cx<=rx+rw){ continue; } if(r.chance(0.6)&&py+2<=R){ mmObj(p,"carro",cx,py,1,2,{bloq:"janela",cor:r.pick(["#7a2a2a","#2a4a7a","#bdbdbd","#2e2e2e","#c9a04a"])}); } }
  mmPJs(p,rx,R-2,rw,2);
  return p;
}

var MM_CORES_CARRO=["#7a2a2a","#2a4a7a","#bdbdbd","#2e2e2e","#c9a04a"];
var MM_TIPOS_PREDIO=["loja","bar","lanchonete","farmacia","apartamento","loja","escritorio"];
var MM_NOME_PREDIO={loja:"Loja",bar:"Bar",lanchonete:"Lanchonete",farmacia:"Farmácia",apartamento:"Prédio",escritorio:"Escritório"};
/* o cruzamento: duas pistas de asfalto, faixa no meio e faixas de pedestre */
function mmCruzamento(p,ry,vx){
  mmChao(p,0,ry,p.cols,4,"asfalto"); mmChao(p,vx,0,4,p.rows,"asfalto"); mmOcupa(p,0,ry-2,p.cols,8); mmOcupa(p,vx-2,0,8,p.rows);
  for(var x=0;x<p.cols;x+=2){ if(x<vx-1||x>vx+4){ mmObj(p,"faixa",x,ry+1.5,1,1); } }
  for(var y=0;y<p.rows;y+=2){ if(y<ry-1||y>ry+4){ mmObj(p,"faixa",vx+1.55,y,0.9,1); } }
  mmObj(p,"zebra",vx,ry-2,4,1); mmObj(p,"zebra",vx,ry+4,4,1); mmObj(p,"zebra",vx-2,ry,1,4); mmObj(p,"zebra",vx+4,ry,1,4);
}
/* uma fachada inteira de vitrine, com a porta num ponto dela */
function mmFachada(p,s,lado){
  var pos=p.r.int(1,Math.max(1,s.w-2));
  mmPortaSala(p,s,lado,pos);
  for(var j=1;j<s.w-1;j++){ if(j!==pos){ mmPortaSala(p,s,lado,j,"janela"); } }
}
/* q: [x, y, largura, altura, lado da rua]; predios lado a lado, as vezes com um beco entre eles */
function mmPrediosDaQuadra(p,q,predios){
  var r=p.r, x=q[0], lim=q[0]+q[2];
  while(x<lim-3){
    var w=Math.min(r.int(5,8),lim-x);
    if(lim-x-w<4){ w=lim-x; }
    if(r.chance(0.18)&&w<lim-x-4){ mmObj(p,"lixeira",x,q[4]==="s"?q[1]+1:q[1]+q[3]-2,1,1); x+=2; continue; }
    var s=mmSala(p,x,q[1],w,q[3],r.chance(0.5)?"piso":"madeira"); s.tipo=r.pick(MM_TIPOS_PREDIO);
    mmFachada(p,s,q[4]);
    predios.push(s); x+=w;
  }
}
var MM_MOBILIA_PREDIO={
  loja:function(p,s){ mmEncosta(p,s,"estante",2,1); mmEncosta(p,s,"estante",2,1); mmNoMeio(p,s,"balcao",2,1,{bloq:"janela"}); },
  bar:function(p,s){ mmEncosta(p,s,"balcao",3,1,{bloq:"janela"}); mmNoMeio(p,s,"mesaRedonda",1,1); mmNoMeio(p,s,"mesaRedonda",1,1); },
  apartamento:function(p,s){ mmEncosta(p,s,"escada",1,2); mmVarios(p,s,"vaso",1,mmEncosta); },
  escritorio:function(p,s){ mmNoMeio(p,s,"mesa",2,1); mmEncosta(p,s,"estante",2,1); }
};
MM_MOBILIA_PREDIO.farmacia=MM_MOBILIA_PREDIO.loja;
MM_MOBILIA_PREDIO.lanchonete=MM_MOBILIA_PREDIO.bar;
/* carros na pista, fora do cruzamento */
/* um carro deitado na pista horizontal ou em pe na vertical: [x, y, largura, altura], ou null se caiu no cruzamento */
function mmVagaDeCarro(p,ry,vx){
  var r=p.r;
  if(r.chance(0.6)){
    var cx=r.int(0,p.cols-3);
    return cx>vx-3&&cx<vx+5?null:[cx,ry+r.pick([0,3]),2,1];
  }
  var cy=r.int(0,p.rows-3);
  return cy>ry-3&&cy<ry+5?null:[vx+r.pick([0,3]),cy,1,2];
}
function mmCarrosNaRua(p,ry,vx){
  var n=p.r.int(3,5);
  for(var k=0;k<n;k++){
    var v=mmVagaDeCarro(p,ry,vx);
    if(v&&mmMobLivre(p,v[0],v[1],v[2],v[3])){ mmObj(p,"carro",v[0],v[1],v[2],v[3],{bloq:"janela",cor:p.r.pick(MM_CORES_CARRO)}); }
  }
}
function mmRua(r){
  var C=40, R=28, p=mmPlanta(C,R,"concreto",r); p.parede="tijolo";
  var ry=r.int(12,14), vx=r.int(17,22);
  mmCruzamento(p,ry,vx);
  var predios=[];
  [[0,0,vx-2,ry-2,"s"],[vx+6,0,C-vx-6,ry-2,"s"],[0,ry+6,vx-2,R-ry-6,"n"],[vx+6,ry+6,C-vx-6,R-ry-6,"n"]].forEach(function(q){ mmPrediosDaQuadra(p,q,predios); });
  mmReservaPortas(p);
  predios.forEach(function(s){ MM_MOBILIA_PREDIO[s.tipo](p,s); mmMarca(p,MM_NOME_PREDIO[s.tipo],s.x+s.w/2,s.y+s.h/2,"ouro"); });
  [[2,ry-1],[C-3,ry-1],[2,ry+4],[C-3,ry+4],[vx-1,3],[vx+4,R-4]].forEach(function(q){ if(mmMobLivre(p,q[0],q[1],1,1)){ mmObj(p,"poste",q[0],q[1],1,1); } });
  mmCarrosNaRua(p,ry,vx);
  mmNpcs(p,"Pedestre",2,0,ry-2,C,2);
  mmPoe(p,"Suspeito",[vx-2,ry+4,8,4],true);
  mmNaSala(p,r.pick(predios),"Lojista",1);
  mmPJs(p,0,ry+4,4,2);
  return p;
}


function mmNave(r){
  var C=40, R=24, p=mmPlanta(C,R,"espaco",r); p.parede="metal";
  var y0=r.int(10,11), x0=r.int(8,9), x1=r.int(31,32);
  var corr=mmSala(p,x0,y0,x1-x0,2,"metal");
  var ponte=mmSala(p,x1,y0-4,r.int(5,6),10,"metal");
  mmPortaSala(p,ponte,"o",4,"porta"); mmPortaSala(p,ponte,"o",5,"porta");
  var eng=mmSala(p,x0-6,y0-6,6,14,"grade");
  mmPortaSala(p,eng,"l",6); mmPortaSala(p,eng,"l",7);
  var tipos=r.mistura(["alojamento","enfermaria","refeitorio","carga","laboratorio","armas"]), salas=[], k=0;
  [[y0-1,-1],[y0+2,1]].forEach(function(lin){
    var x=x0;
    while(x<x1-3){
      var w=Math.min(r.int(4,6),x1-x); if(x1-x-w<4){ w=x1-x; }
      var h=r.int(4,6), y=lin[1]<0?lin[0]-h+1:lin[0];
      var s=mmSala(p,x,y,w,h,"metal"); s.tipo=tipos[k++%tipos.length];
      mmPortaSala(p,s,lin[1]<0?"s":"n",r.int(1,Math.max(1,w-2)));
      salas.push(s); x+=w;
    }
  });
  /* camara de descompressao: duas portas, uma para dentro e uma para o vazio */
  var cima=salas.filter(function(s){ return s.y<y0; }), alvo=cima[Math.floor(cima.length/2)];
  var ax=alvo.x+Math.floor(alvo.w/2), eclusa=null;
  if(alvo.y-2>=0){
    eclusa=mmSala(p,ax-1,alvo.y-2,2,2,"grade");
    mmPortaSala(p,eclusa,"s",0); mmPortaSala(p,eclusa,"n",0);
    mmMarca(p,"Câmara de descompressão",ax,alvo.y-2.4,"aviso");
  }
  mmReservaPortas(p);
  mmObj(p,"console",ponte.x+ponte.w-2,ponte.y+3,1,4,{bloq:"janela"});
  mmObj(p,"console",ponte.x+1,ponte.y+1,2,1); mmObj(p,"console",ponte.x+1,ponte.y+ponte.h-2,2,1);
  mmObj(p,"cadeira",ponte.x+ponte.w-3,ponte.y+4,1,1);
  mmMarca(p,"Ponte",ponte.x+ponte.w/2,ponte.y-0.3,"ouro");
  mmObj(p,"reator",eng.x+1,eng.y+2,3,3,{bloq:"parede",forma:"circ",folga:0.3});
  mmObj(p,"reator",eng.x+1,eng.y+eng.h-5,3,3,{bloq:"parede",forma:"circ",folga:0.3});
  mmMarca(p,"Engenharia",eng.x+eng.w/2,eng.y-0.3,"ouro");
  salas.forEach(function(s){
    var t=s.tipo;
    if(t==="alojamento"){ mmEncosta(p,s,"cama",1,2,{cor:"#3d4c5c"}); mmEncosta(p,s,"cama",1,2,{cor:"#3d4c5c"}); }
    else if(t==="enfermaria"){ mmEncosta(p,s,"maca",1,2); mmEncosta(p,s,"bancada",2,1); }
    else if(t==="refeitorio"){ mmNoMeio(p,s,"mesa",2,1); mmVarios(p,s,"cadeira",3,mmNoMeio); }
    else if(t==="carga"){ mmVarios(p,s,"contentor",3,function(pp,ss,tt){ mmEncosta(pp,ss,tt,1,2,{cor:r.pick(["#5d6e50","#7a5a2a","#4a5a7a"])}); }); }
    else if(t==="laboratorio"){ mmEncosta(p,s,"bancada",2,1); mmEncosta(p,s,"tanque",1,1); }
    else { mmEncosta(p,s,"estante",2,1); mmEncosta(p,s,"contentor",1,1,{cor:"#6a2a2a"}); }
  });
  mmPoe(p,"Capitão",[ponte.x+ponte.w-3,ponte.y+1,2,ponte.h-2],true);
  mmPoe(p,"Androide",[eng.x,eng.y,eng.w,eng.h],true);
  mmNpcs(p,"Tripulante",2,corr.x,corr.y,corr.w,corr.h);
  var carga=salas.find(function(s){ return s.tipo==="carga"; })||salas.at(-1);
  mmNaSala(p,carga,"Intruso",1);
  mmPJs(p,eclusa?ax-3:x0+4,y0,6,2);
  return p;
}

var MM_NOME_MODULO={hangar:"Hangar",controle:"Controle",laboratorio:"Laboratório",alojamento:"Alojamento",gerador:"Gerador"};
var MM_MOBILIA_MODULO={
  hangar:function(p,m){ mmNoMeio(p,m,"nave",4,3,{bloq:"parede",folga:0.35}); for(var k=0;k<3;k++){ mmEncosta(p,m,"contentor",1,2,{cor:p.r.pick(["#5d6e50","#7a5a2a","#4a5a7a"])}); } },
  controle:function(p,m){ mmEncosta(p,m,"console",3,1,{bloq:"janela"}); mmEncosta(p,m,"console",1,2); mmNoMeio(p,m,"mesa",2,1); mmNaSala(p,m,"Comandante",1); },
  laboratorio:function(p,m){ mmEncosta(p,m,"bancada",2,1); mmEncosta(p,m,"bancada",2,1); mmEncosta(p,m,"tanque",1,1); mmNaSala(p,m,"Técnico",2); },
  alojamento:function(p,m){ for(var k=0;k<3;k++){ mmEncosta(p,m,"cama",1,2,{cor:"#3d4c5c"}); } mmNoMeio(p,m,"mesa",1,1); },
  gerador:function(p,m){ mmNoMeio(p,m,"reator",3,3,{bloq:"parede",forma:"circ",folga:0.3}); mmEncosta(p,m,"console",1,1); }
};
/* cinco modulos em seis vagas sorteadas; o hangar e maior */
function mmModulos(p){
  var r=p.r, tipos=["hangar","controle","laboratorio","alojamento","gerador"];
  var slots=r.mistura([[2,2],[15,2],[28,2],[2,17],[15,17],[28,17]]).slice(0,5);
  var mods=slots.map(function(s,i){
    var t=tipos[i], grande=t==="hangar", w=grande?r.int(10,11):r.int(7,9), h=grande?r.int(9,10):r.int(6,8);
    var x=Math.min(p.cols-w-1,s[0]+r.int(0,2)), y=Math.min(p.rows-h-1,s[1]+r.int(0,2));
    var m=mmSala(p,x,y,w,h,t==="gerador"?"grade":"metal"); m.tipo=t;
    return m;
  });
  return mods.sort(function(a,b){ return a.x+a.y*0.5-(b.x+b.y*0.5); });
}
/* nos tuneis da base toda passagem tem porta (de metal, que fecha) */
function mmSemprePorta(){ return "porta"; }
function mmCasasDeFora(p){
  var fora=[];
  mmCada(p,0,0,p.cols,p.rows,function(x,y){ if(p.zona[y][x]===-1&&!p.mob[y][x]){ fora.push([x,y]); } });
  return fora;
}
function mmEstacao(r){
  var C=40, R=30, p=mmPlanta(C,R,"marte",r); p.parede="metal";
  var mods=mmModulos(p), tubo=mmZona(p,{});
  for(var i=1;i<mods.length;i++){ mmCorredor(p,mods[i-1],mods[i],tubo,"metal",2,mmSemprePorta); }
  var hangar=mods.find(function(m){ return m.tipo==="hangar"; });
  var lado=hangar.y>R/2?"s":"n", pos=Math.floor(hangar.w/2)-1;
  for(var q=0;q<3;q++){ mmPortaSala(p,hangar,lado,pos+q-1,"porta"); }
  mmMarca(p,"Portão do hangar",hangar.x+hangar.w/2,lado==="s"?hangar.y+hangar.h+0.5:hangar.y-0.5,"aviso");
  mmReservaPortas(p);
  mods.forEach(function(m){ MM_MOBILIA_MODULO[m.tipo](p,m); mmMarca(p,MM_NOME_MODULO[m.tipo],m.x+m.w/2,m.y+0.5,"ouro"); });
  mmEspalha(p,40,function(){ return "rocha"; },false);
  var fora=mmCasasDeFora(p);
  var an=r.pick(fora); if(an){ mmObj(p,"antena",an[0],an[1],1,1,{bloq:"parede",forma:"circ",folga:0.2}); }
  var ro=r.pick(fora); if(ro&&mmMobLivre(p,ro[0],ro[1],2,1)){ mmObj(p,"carro",ro[0],ro[1],2,1,{bloq:"janela",cor:"#c9a04a"}); }
  mmPoe(p,"Segurança",[hangar.x,hangar.y,hangar.w,hangar.h],true);
  var vul=r.pick(fora); if(vul){ mmPoe(p,"Presença desconhecida",[vul[0],vul[1],1,1],true); }
  mmPJs(p,hangar.x,hangar.y,hangar.w,hangar.h);
  return p;
}

/* um tunel de duas casas da borda ate a areia, com o portao onde ele encontra a arena */
function mmTunel(p,gy,x,passo,zonas){
  while(mmDentro(p,x,gy)&&p.zona[gy][x]!==zonas.piso){
    mmCada(p,x,gy,1,2,function(i,j){ p.zona[j][i]=zonas.tunel; p.mat[j][i]="laje"; });
    x+=passo;
  }
  for(var k=0;k<2;k++){ mmPortaEntre(p,[x-passo,gy+k],[x,gy+k],"porta"); }
}
function mmPoeCobertura(p,tipo,x,y,w,h){
  if(tipo==="coluna"){ mmObj(p,"coluna",x,y,1,1,{bloq:"parede",forma:"circ",folga:0.18}); }
  else if(tipo==="caixote"){ mmObj(p,"caixote",x,y,1,1,{bloq:"janela"}); }
  else { mmObj(p,"estrado",x,y,w,h,{bloq:"janela",folga:0.25}); }
}
/* cobertura espelhada: os dois lados comecam com a mesma vantagem. el: [cx, cy, ex, ey] da elipse, gy a linha dos portoes */
function mmCoberturas(p,el,gy,piso){
  var r=p.r, n=r.int(3,5), feitos=0, cx=el[0], cy=el[1], ex=el[2], ey=el[3];
  for(var t=0;t<60&&feitos<n;t++){
    var x=r.int(Math.floor(cx-ex+2),Math.floor(cx)-2), y=r.int(Math.floor(cy-ey+2),Math.floor(cy+ey-3)), tipo=r.pick(["coluna","coluna","caixote","muro"]);
    var largo=tipo==="muro"&&r.chance(0.5), w=largo?2:1, h=tipo==="muro"&&!largo?2:1, xm=p.cols-x-w;
    var naPorta=Math.abs(y-gy)<=1&&x<cx-ex+4;
    var cabe=mmMobLivre(p,x,y,w,h)&&mmMobLivre(p,xm,y,w,h)&&p.zona[y][x]===piso&&p.zona[y][xm]===piso;
    if(naPorta||!cabe){ continue; }
    mmPoeCobertura(p,tipo,x,y,w,h); mmPoeCobertura(p,tipo,xm,y,w,h);
    feitos++;
  }
}
function mmArena(r){
  var C=30, R=24, p=mmPlanta(C,R,"degraus",r); p.parede="pedra";
  mmRocha(p,0,0,C,R,"degraus");
  var cx=C/2, cy=R/2, ex=r.entre(10.5,12), ey=r.entre(8,9);
  var zonas={piso:mmZona(p,{}),tunel:mmZona(p,{})}, gy=Math.floor(cy)-1;
  mmCada(p,0,0,C,R,function(x,y){ if(((x+0.5-cx)/ex)**2+((y+0.5-cy)/ey)**2<1){ p.zona[y][x]=zonas.piso; p.mat[y][x]="areia"; } });
  mmTunel(p,gy,0,1,zonas); mmTunel(p,gy,C-1,-1,zonas);
  mmReservaPortas(p);
  mmCoberturas(p,[cx,cy,ex,ey],gy,zonas.piso);
  mmObj(p,"estatua",Math.floor(cx)-1,Math.floor(cy)-1,2,2,{bloq:"parede",folga:0.3});
  mmMarca(p,"Camarote",cx,1,"ouro",true);
  mmNpcs(p,"Oponente",3,C-5,gy-1,5,4);
  mmPJs(p,0,gy-1,5,4);
  return p;
}


/* a galeria: estilos e textos de cada molde. "estilos" decide em quais filtros o cartao aparece */
var MM_MOLDES=[
  {id:"masmorra",nome:"Masmorra",estilos:["fantasia"],desc:"Salas e corredores na rocha, portas, armadilhas e a sala do chefe.",gera:mmMasmorra},
  {id:"taverna",nome:"Taverna",estilos:["fantasia"],desc:"Salão com mesas, balcão e lareira, cozinha e despensa com alçapão.",gera:mmTaverna},
  {id:"vila",nome:"Vila",estilos:["fantasia"],desc:"Praça com poço e feira, casas, ferreiro e templo, ruas de terra.",gera:mmVila},
  {id:"caverna",nome:"Caverna ou mina",estilos:["fantasia"],desc:"Galerias irregulares, rio subterrâneo e o covil no fundo.",gera:mmCaverna},
  {id:"castelo",nome:"Salão do trono",estilos:["fantasia"],desc:"Trono no estrado, colunas, guarda, arsenal, biblioteca e capela.",gera:mmCastelo},
  {id:"estrada",nome:"Emboscada na estrada",estilos:["fantasia","moderno"],desc:"Estrada na mata, carroça tombada e bandidos atrás das árvores.",gera:mmEstrada},
  {id:"acampamento",nome:"Acampamento",estilos:["fantasia"],desc:"Fogueira, barracas, cavalos e sentinelas numa clareira.",gera:mmAcampamento},
  {id:"navio",nome:"Navio",estilos:["fantasia"],desc:"Convés com mastros e canhões, cabine do capitão e porão. Às vezes atracado.",gera:mmNavio},
  {id:"mansao",nome:"Casa ou mansão",estilos:["moderno"],desc:"Cômodos mobiliados, jardim cercado e uma escada para o porão.",gera:mmMansao},
  {id:"fazenda",nome:"Fazenda",estilos:["moderno","fantasia"],desc:"Casa, celeiro, curral, plantação e o que se esconde no milharal.",gera:mmFazenda},
  {id:"hospital",nome:"Hospital ou laboratório",estilos:["moderno","scifi"],desc:"Corredor longo, alas, cirurgia, portas trancadas e estacionamento.",gera:mmHospital},
  {id:"rua",nome:"Quarteirão",estilos:["moderno"],desc:"Cruzamento com carros, lojas, bar, beco e postes.",gera:mmRua},
  {id:"nave",nome:"Nave espacial",estilos:["scifi"],desc:"Ponte, corredor central, engenharia, carga e câmara de descompressão.",gera:mmNave},
  {id:"base",nome:"Estação ou base",estilos:["scifi"],desc:"Módulos ligados por túneis, hangar, controle e gerador.",gera:mmEstacao},
  {id:"arena",nome:"Arena",estilos:["fantasia","moderno","scifi"],desc:"Areia, coberturas espelhadas e dois portões. Combate em qualquer sistema.",gera:mmArena}
];
var MM_FILTROS=[["todos","Todos"],["fantasia","Fantasia"],["moderno","Moderno"],["scifi","Ficção científica"]];

function mmGera(molde,semente){
  var p=molde.gera(mmRng(semente));
  p.semente=semente;
  return p;
}
