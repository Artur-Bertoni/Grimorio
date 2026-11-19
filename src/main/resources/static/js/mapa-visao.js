/* Tabletop: paredes, nevoa e visao (js/mapa-visao.js). */
"use strict";

/* A nevoa do jogador e cortada no servidor (MapaVisao.java): paredes e areas nunca chegam ao navegador dele, os
   tokens fora da vista tambem nao, e a imagem do mapa vem em pedacos so onde ele ve ou lembra (MP.vista). Tudo o
   que esta aqui de paredes, areas e visao e a tela do mestre (inclusive o "ver como os jogadores veem"); o
   jogador so desenha a mascara que recebeu. A conta de cruzar parede e de rota tem gemea no servidor
   (MapaParedes.java), e e a dele que vale; o jogador pergunta a rota ao servidor (mpRotaDoServidor). */
var MP_VISAO_PADRAO=6;
var MP_PAREDES=[["parede","Parede"],["janela","Janela"],["porta","Porta"]];
var MP_FOG_MODOS=[["nenhum","Desligada"],["manual","Só as áreas que você revela"],["visao","Pela visão dos personagens, mais as áreas"]];
var MP_FORMAS_FOG=[["retangulo","Retângulo"],["circulo","Círculo"],["poligono","Polígono"]];

function mpNomeDoTipo(e){
  return {DESENHO:"Desenho",PAREDE:"Parede",FOG:"Área de névoa"}[e.tipo]||Vm("token");
}
function mpFogModo(){ return MP.mapa?.regras?.fog||"nenhum"; }
/* o jogador ve a nevoa fechada; o mestre a ve translucida, a menos que escolha ver como o jogador */
function mpFogOpaco(){ return !GM||MP.comoJogador; }

/* ---------- paredes ---------- */
/* Trechos que barram: o movimento (parede, janela, porta fechada) ou a visao (parede, porta fechada). Cada
   trecho e [x1, y1, x2, y2]; uma parede de varios pontos vira um trecho por par. */
function mpTrechos(visao){
  var out=[];
  MP.els.forEach(function(e){
    if(e.tipo!=="PAREDE"){ return; }
    var d=e.dados||{}, k=d.kind||"parede", p=d.pts||[];
    if((k==="porta"&&d.aberta)||(visao&&k==="janela")){ return; }
    for(var i=1;i<p.length;i++){ out.push([p[i-1][0],p[i-1][1],p[i][0],p[i][1]]); }
  });
  return out;
}
/* Mesma regra do servidor: encostar so no comeco ou no fim do trecho nao conta; um canto de parede no meio conta. */
function mpCruza(s,ax,ay,bx,by,origem,destino){
  var rx=bx-ax, ry=by-ay, sx=s[2]-s[0], sy=s[3]-s[1], comp=Math.hypot(rx,ry);
  if(comp<1e-9){ return false; }
  var den=rx*sy-ry*sx, qx=s[0]-ax, qy=s[1]-ay;
  if(Math.abs(den)<1e-9*comp*Math.max(1,Math.hypot(sx,sy))){
    if(Math.abs(qx*ry-qy*rx)>1e-6*comp){ return false; }
    var t0=(qx*rx+qy*ry)/(comp*comp), t1=((s[2]-ax)*rx+(s[3]-ay)*ry)/(comp*comp);
    return Math.min(Math.max(t0,t1),1)-Math.max(Math.min(t0,t1),0)>1e-6;
  }
  var t=(qx*sy-qy*sx)/den, u=(qx*ry-qy*rx)/den;
  return (origem?t>1e-6:t>=-1e-6)&&(destino?t<1-1e-6:t<=1+1e-6)&&u>=-1e-6&&u<=1+1e-6;
}
/* origem e destino dizem se as pontas do trecho sao as do movimento (encostar nelas nao conta) ou pontos de passagem */
function mpLivreTrecho(trechos,ax,ay,bx,by,origem,destino){
  for(var s of trechos){ if(mpCruza(s,ax,ay,bx,by,origem,destino)){ return false; } }
  return true;
}
/* O trajeto do token do jogador: null (nada no meio, vale o que ele arrastou), false (parede fecha tudo) ou os
   pontos da rota que contorna, calculada no servidor (a rota que ele cobra). O mestre nunca e barrado. */
function mpRotaDoToken(ox,oy,x,y,trilha,el){
  return GM?null:mpRotaDoServidor(el,x,y,trilha);
}
/* O jogador nao recebe as paredes: a rota vem do servidor, uma pergunta por destino (uma por vez). A resposta que
   chega redesenha na hora o pontilhado do arraste, se ele ainda vai para o mesmo lugar: o jogador ve o contorno que
   vai pagar antes de soltar. Enquanto nao chega, vale a linha arrastada; ao soltar, o servidor decide. */
function mpChaveRota(el,x,y){ return el.id+":"+mpArred(x)+","+mpArred(y); }
function mpRotaDoServidor(el,x,y,trilha){
  if(!MP.vista?.paredes||!el){ return null; }
  var R=MP.rotaSrv||(MP.rotaSrv={}), chave=mpChaveRota(el,x,y);
  if(R.chave===chave){ return R.r; }
  if(R.indo!==chave){
    R.quer={chave:chave,id:el.id,x:mpArred(x),y:mpArred(y),trajeto:trilha.slice(1,-1).map(function(q){ return [mpArred(q[0]),mpArred(q[1])]; })};
    mpPedeRota();
  }
  return null;
}
function mpPedeRota(){
  var R=MP.rotaSrv;
  if(!R||R.indo||!R.quer){ return; }
  var q=R.quer;
  R.quer=null; R.indo=q.chave;
  api(mpAPI("/"+MP.id+"/rota"),{method:"POST",body:{id:q.id,x:q.x,y:q.y,trajeto:q.trajeto}})
    .then(function(r){
      R.chave=q.chave;
      if(r.livre){ R.r=null; } else { R.r=r.semCaminho?false:r.pts; }
      mpAplicaRota(q.chave,R.r);
    })
    .catch(function(){ /* sem resposta, vale o caminho arrastado e o servidor decide ao soltar */ })
    .finally(function(){ R.indo=null; mpPedeRota(); });
}
/* o pontilhado do arraste segue a rota que chegou (se o token ainda vai para o mesmo lugar) */
function mpAplicaRota(chave,rota){
  var a=MP.medida;
  if(!a||a.rotaChave!==chave){ return; }
  a.semCaminho=rota===false;
  a.contorno=Array.isArray(rota);
  if(a.contorno){ a.trilha=rota; }
  mpDesenha();
}
function mpTemParedeDeVisao(){ return mpTrechos(true).length>0; }

/* ---------- visao ---------- */
/* Poligono do que se ve a partir de (cx, cy): um raio para cada ponta de parede (e um pouco para cada lado), mais um a
   cada 5 graus para o contorno do alcance ficar redondo. Cada raio para na primeira parede ou no alcance. */
function mpPoligonoVisao(cx,cy,R,trechos){
  var perto=trechos.filter(function(s){
    return Math.max(s[0],s[2])>=cx-R&&Math.min(s[0],s[2])<=cx+R&&Math.max(s[1],s[3])>=cy-R&&Math.min(s[1],s[3])<=cy+R;
  });
  var angs=[], i;
  for(i=0;i<72;i++){ angs.push(-Math.PI+i*Math.PI/36); }
  perto.forEach(function(s){
    for(var k=0;k<4;k+=2){ var a=Math.atan2(s[k+1]-cy,s[k]-cx); angs.push(a-0.0001,a,a+0.0001); }
  });
  angs.sort(function(a,b){ return a-b; });
  var pts=[];
  angs.forEach(function(a){
    var dx=Math.cos(a), dy=Math.sin(a), t=R;
    perto.forEach(function(s){
      var sx=s[2]-s[0], sy=s[3]-s[1], den=dx*sy-dy*sx;
      if(Math.abs(den)<1e-12){ return; }
      var qx=s[0]-cx, qy=s[1]-cy, tt=(qx*sy-qy*sx)/den, u=(qx*dy-qy*dx)/den;
      if(tt>=0&&u>=0&&u<=1&&tt<t){ t=tt; }
    });
    pts.push([cx+dx*t,cy+dy*t]);
  });
  return pts;
}
/* Alcance em casas: o do proprio token, senao o da ficha de onde ele veio, senao o padrao do mapa (6 se o mestre nao mexeu). */
function mpVisaoPadraoDoMapa(){ return mpNum(MP.mapa?.regras?.visaoPadrao,MP_VISAO_PADRAO); }
function mpAlcanceDe(d){
  var v=d.visao!=null?d.visao:d.visaoFicha;
  return v==null?mpVisaoPadraoDoMapa():mpNum(v,mpVisaoPadraoDoMapa());
}
/* Quem enxerga: o jogador, os tokens dele; o mestre, todos os que tem dono (a mesa inteira). */
function mpFontesVisao(){
  var out=[], T=mpLado();
  MP.els.forEach(function(e){
    if(e.tipo!=="TOKEN"){ return; }
    var d=e.dados||{}, casas=mpAlcanceDe(d);
    var seu=GM?mpNum(e.dono,0)>0:!!e.meu;
    if(seu&&casas>0){ out.push({x:mpNum(d.x,0),y:mpNum(d.y,0),r:casas*T}); }
  });
  return out;
}
/* refeito so quando uma fonte ou uma parede muda de lugar (e nao a cada quadro) */
function mpVisaoAgora(){
  var f=mpFontesVisao(), t=mpTrechos(true);
  var sig=f.map(function(s){ return s.x+","+s.y+","+s.r; }).join(";")+"|"+t.map(function(s){ return s.join(","); }).join(";");
  var c=MPC||{};
  if(c.visao?.sig!==sig){
    c.visao={sig:sig,polis:f.map(function(s){ return {x:s.x,y:s.y,r:s.r,pts:mpPoligonoVisao(s.x,s.y,s.r,t)}; })};
  }
  return c.visao.polis;
}
/* ---------- memoria do explorado ---------- */
/* Com a memoria ligada, o que ja foi visto fica na nevoa mais fraca e o resto continua fechado; os tokens dali
   seguem escondidos, so aparece o que esta a vista agora. Cada navegador guarda a sua, como um mapa pequeno (uma
   imagem de ate 1024 px) no localStorage. "Esquecer o explorado" soma um na versao e todo mundo recomeca. */
var MP_EXP_LADO=1024;
function mpMemoriaLigada(){ return mpFogModo()==="visao"&&!!MP.mapa?.regras?.fogMemoria; }
function mpExpChave(){
  var m=MP.mapa;
  return "grim_exp_c"+CID+"_m"+m.id+"_"+m.largura+"x"+m.altura+"_v"+(m.regras?.fogVer||0)+(GM?"_m":"_j");
}
function mpExplorado(){
  var c=MPC, m=MP.mapa, k=mpExpChave();
  if(c.exp?.chave===k){ return c.exp; }
  var esc=Math.min(1,MP_EXP_LADO/Math.max(1,m.largura,m.altura)), cv=document.createElement("canvas");
  cv.width=Math.max(1,Math.ceil(m.largura*esc)); cv.height=Math.max(1,Math.ceil(m.altura*esc));
  var exp={chave:k,cv:cv,esc:esc,t:0,sig:"",v:0};
  c.exp=exp;
  try{
    var pref="grim_exp_c"+CID+"_m"+m.id+"_";
    Object.keys(localStorage).forEach(function(x){ if(x.startsWith(pref)&&x!==k){ localStorage.removeItem(x); } });
    var salvo=localStorage.getItem(k);
    if(salvo){
      var im=new Image();
      im.onload=function(){ if(c.exp===exp){ cv.getContext("2d").drawImage(im,0,0); exp.v++; mpDesenha(); } };
      im.src=salvo;
    }
  }catch(error_){ /* sem localStorage a memoria vale so ate fechar a pagina */ }
  return exp;
}
/* soma ao explorado o que se ve agora; so refaz quando a vista mudou */
function mpLembraVisao(polis){
  var e=mpExplorado(), sig=MPC.visao?MPC.visao.sig:"";
  if(e.sig===sig){ return e; }
  e.sig=sig;
  var f=e.cv.getContext("2d");
  f.setTransform(e.esc,0,0,e.esc,0,0); f.fillStyle="black";
  polis.forEach(function(p){
    if(p.pts.length<3){ return; }
    f.beginPath(); p.pts.forEach(function(q,i){ if(i){ f.lineTo(q[0],q[1]); } else { f.moveTo(q[0],q[1]); } }); f.closePath(); f.fill();
  });
  e.v++;
  clearTimeout(e.t);
  e.t=setTimeout(function(){
    try{ localStorage.setItem(e.chave,e.cv.toDataURL("image/png")); }catch(error_){ /* cheio ou bloqueado: vale so ate fechar a pagina */ }
  },1500);
  return e;
}
function mpDentroFog(e,x,y){
  var d=e.dados||{}, p=d.pts||[];
  if(d.forma==="traco"){ return mpDentroTraco(d,x,y); }
  if(p.length<2){ return false; }
  if(d.forma==="circulo"){ return Math.hypot(x-p[0][0],y-p[0][1])<=Math.hypot(p[1][0]-p[0][0],p[1][1]-p[0][1]); }
  if(d.forma==="retangulo"){ return x>=Math.min(p[0][0],p[1][0])&&x<=Math.max(p[0][0],p[1][0])&&y>=Math.min(p[0][1],p[1][1])&&y<=Math.max(p[0][1],p[1][1]); }
  return mpDentroPoli(x,y,p);
}
/* O ponto esta a vista? Primeiro o que o mestre revelou ou cobriu (o ultimo que pega o ponto manda); depois a visao dos tokens. */
function mpRevelado(x,y){
  var modo=mpFogModo();
  if(modo==="nenhum"){ return true; }
  var r=false;
  MP.els.forEach(function(e){ if(e.tipo==="FOG"&&mpDentroFog(e,x,y)){ r=!!e.dados.revela; } });
  if(r||modo!=="visao"){ return r; }
  return mpVisaoAgora().some(function(p){ return Math.hypot(x-p.x,y-p.y)<=p.r&&mpDentroPoli(x,y,p.pts); });
}
/* Token que a nevoa esconde de quem olha (so na tela dele): o dele nunca some */
function mpOculto(e){
  /* ao jogador o servidor so manda o token que ele ve: o que chegou aparece */
  if(!GM||e.tipo!=="TOKEN"||mpFogModo()==="nenhum"||!mpFogOpaco()){ return false; }
  if(GM?mpNum(e.dono,0)>0:e.meu){ return false; }
  return !mpRevelado(mpNum(e.dados?.x,0),mpNum(e.dados?.y,0));
}
/* ---------- pincel ---------- */
/* O que o pincel pinta e um "traco": um caminho com a largura do pincel. Redondo e uma linha grossa de pontas
   redondas; quadrado e losango sao o casco convexo da ponta nos dois extremos de cada trecho. */
var MP_PONTAS=[["redondo","Redondo"],["quadrado","Quadrado"],["losango","Losango"]];
var MP_MAX_PTS_TRACO=100;
function mpPincel(){
  return MP.pincel||(MP.pincel={casas:2,ponta:"redondo",suave:true});
}
function mpPincelLarg(){ return Math.max(4,Math.round(mpPincel().casas*mpLado())); }
function mpPontaPts(ponta,r){
  return ponta==="losango"?[[r,0],[0,r],[-r,0],[0,-r]]:[[r,r],[-r,r],[-r,-r],[r,-r]];
}
function mpCruzVet(o,a,b){ return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]); }
function mpCasco(pts){
  var p=pts.slice().sort(function(a,b){ return a[0]-b[0]||a[1]-b[1]; }), baixo=[], alto=[], i;
  for(i=0;i<p.length;i++){
    while(baixo.length>1&&mpCruzVet(baixo.at(-2),baixo.at(-1),p[i])<=0){ baixo.pop(); }
    baixo.push(p[i]);
  }
  for(i=p.length-1;i>=0;i--){
    while(alto.length>1&&mpCruzVet(alto.at(-2),alto.at(-1),p[i])<=0){ alto.pop(); }
    alto.push(p[i]);
  }
  baixo.pop(); alto.pop();
  return baixo.concat(alto);
}
/* os poligonos que a ponta quadrada ou em losango varre ao longo do caminho */
function mpPoligonosDoTraco(d){
  var p=d.pts||[], base=mpPontaPts(d.ponta,mpNum(d.larg,70)/2), out=[];
  if(p.length===1){ out.push(base.map(function(q){ return [p[0][0]+q[0],p[0][1]+q[1]]; })); }
  for(var i=1;i<p.length;i++){
    var c=[];
    base.forEach(function(q){ c.push([p[i-1][0]+q[0],p[i-1][1]+q[1]],[p[i][0]+q[0],p[i][1]+q[1]]); });
    out.push(mpCasco(c));
  }
  return out;
}
function mpDentroTraco(d,x,y){
  var p=d.pts||[];
  if(!p.length){ return false; }
  if(d.ponta==="quadrado"||d.ponta==="losango"){
    return mpPoligonosDoTraco(d).some(function(q){ return mpDentroPoli(x,y,q); });
  }
  var r=mpNum(d.larg,70)/2;
  if(p.length===1){ return Math.hypot(x-p[0][0],y-p[0][1])<=r; }
  for(var i=1;i<p.length;i++){ if(mpDistSeg(x,y,p[i-1],p[i])<=r){ return true; } }
  return false;
}
/* preenche o traco com o fillStyle/strokeStyle que ja estiver no contexto (no espaco do mapa) */
function mpPreencheTraco(f,d){
  var p=d.pts||[];
  if(!p.length){ return; }
  if(d.ponta==="quadrado"||d.ponta==="losango"){
    mpPoligonosDoTraco(d).forEach(function(q){
      f.beginPath(); q.forEach(function(pt,i){ if(i){ f.lineTo(pt[0],pt[1]); } else { f.moveTo(pt[0],pt[1]); } }); f.closePath(); f.fill();
    });
    return;
  }
  f.lineCap="round"; f.lineJoin="round"; f.lineWidth=mpNum(d.larg,70);
  f.beginPath(); f.moveTo(p[0][0],p[0][1]);
  if(p.length===1){ f.lineTo(p[0][0]+0.01,p[0][1]); }
  for(var i=1;i<p.length;i++){ f.lineTo(p[i][0],p[i][1]); }
  f.stroke();
}
/* o cursor do pincel: o contorno da ponta onde o mouse esta (so quem pinta o ve) */
function mpPintaPincel(ctx,z,cor){
  if(MP.ferramenta!=="pincel"||!GM){ return; }
  var q=MP.pincelCur, r=MP.rascunho;
  ctx.save();
  /* enquanto o botao esta apertado, verde onde vai liberar (vermelho onde vai cobrir): a nevoa so muda ao soltar */
  if(r?.forma==="traco"){
    ctx.globalAlpha=0.4; ctx.fillStyle=MP.fogRevela===false?cor.perigo:cor.ok; ctx.strokeStyle=ctx.fillStyle;
    mpPreencheTraco(ctx,{pts:r.pts,larg:r.larg,ponta:r.ponta});
    ctx.globalAlpha=1;
  }
  if(q){
    var L=mpPincelLarg(), pt=mpPincel().ponta;
    ctx.strokeStyle=cor.ouro; ctx.lineWidth=Math.max(1.5/z,1/z); ctx.setLineDash([5/z,4/z]);
    ctx.beginPath();
    if(pt==="redondo"){ ctx.arc(q.x,q.y,L/2,0,Math.PI*2); }
    else { mpPontaPts(pt,L/2).forEach(function(s,i){ if(i){ ctx.lineTo(q.x+s[0],q.y+s[1]); } else { ctx.moveTo(q.x+s[0],q.y+s[1]); } }); ctx.closePath(); }
    ctx.stroke();
  }
  ctx.restore();
}
function mpComecaPincel(e,p){
  var P=mpPincel(), a={x:p.x,y:p.y};
  MP.rascunho={forma:"traco",pts:[[a.x,a.y]],larg:mpPincelLarg(),ponta:P.ponta,suave:P.suave};
  MP.pincelCur=a;
  return {m:"pn",sx:e.clientX,sy:e.clientY,moveu:false};
}
function mpSeguePincel(e){
  var r=MP.rascunho, q=mpMundo(e);
  MP.pincelCur=q;
  if(r?.forma!=="traco"){ return; }
  var u=r.pts[r.pts.length-1];
  if(Math.hypot(q.x-u[0],q.y-u[1])>=Math.max(2/mpVista().z,r.larg*0.12)){ r.pts.push([q.x,q.y]); }
}
/* o caminho cabe em 100 pontos: passando disso, ficam os mais espalhados, sempre com o primeiro e o ultimo */
function mpAfinaTraco(pts){
  if(pts.length<=MP_MAX_PTS_TRACO){ return pts; }
  var out=[];
  for(var i=0;i<MP_MAX_PTS_TRACO;i++){ out.push(pts[Math.round(i*(pts.length-1)/(MP_MAX_PTS_TRACO-1))]); }
  return out;
}
function mpTerminaPincel(a,cancelou){
  var r=MP.rascunho; MP.rascunho=null;
  if(cancelou||r?.forma!=="traco"){ mpDesenha(); return; }
  mpCriaTraco(r);
}
function mpCriaTraco(r){
  return mpCriaElemento({tipo:"FOG",dados:{forma:"traco",pts:mpArredPts(mpAfinaTraco(r.pts)),larg:r.larg,ponta:r.ponta,suave:r.suave!==false,revela:MP.fogRevela!==false}},"não consegui pintar a névoa")
    .catch(function(){ /* o aviso ja saiu em mpGrava */ });
}

/* ---------- fumaca ---------- */
/* Uma fumaca bem leve anda por cima da nevoa fechada, so por imersao. Duas camadas de manchas macias (uma textura
   que repete, gerada uma vez) deslizam em sentidos diferentes. Sai junto com as animacoes do site
   (Configuracoes > Aparencia > Movimento e o "reduzir movimento" do sistema). */
var MP_FUMACA_LADO=512;
var MP_FUMACA_CAMADAS=[{esc:1,vx:14,vy:4,a:0.13},{esc:1.7,vx:-9,vy:6,a:0.09}];
function mpFumacaViva(){
  return mpFogModo()!=="nenhum"&&!mpMovimentoReduzido()&&!document.hidden&&typeof DOMMatrix!=="undefined";
}
function mpFumacaTextura(c,tom){
  if(c.fumTex&&c.fumTex.tom===tom){ return c.fumTex.cv; }
  var L=MP_FUMACA_LADO, cv=document.createElement("canvas"), g, semente=7;
  cv.width=L; cv.height=L; g=cv.getContext("2d");
  function alea(){ semente=(semente*16807)%2147483647; return semente/2147483647; }
  for(var i=0;i<16;i++){
    var x=alea()*L, y=alea()*L, r=70+alea()*110, a=(0.35+alea()*0.4).toFixed(2);
    /* cada mancha e desenhada tambem deslocada de um lado, para a textura emendar sem costura */
    for(var dx=-L;dx<=L;dx+=L){
      for(var dy=-L;dy<=L;dy+=L){
        var gr=g.createRadialGradient(x+dx,y+dy,0,x+dx,y+dy,r);
        gr.addColorStop(0,"rgb(255 255 255 / "+a+")"); gr.addColorStop(1,"rgb(255 255 255 / 0)");
        g.fillStyle=gr; g.fillRect(x+dx-r,y+dy-r,2*r,2*r);
      }
    }
  }
  g.globalCompositeOperation="source-in"; g.fillStyle=tom; g.fillRect(0,0,L,L);
  c.fumTex={tom:tom,cv:cv};
  return cv;
}
/* pinta a fumaca so onde ja ha nevoa (source-atop), antes de a visao abrir os buracos */
function mpPintaFumaca(f,cv,c,v,cor){
  if(!mpFumacaViva()){ return; }
  var tex=mpFumacaTextura(c,cor.texto2), t=performance.now()/1000, k=v.z*c.dpr, base=Math.max(v.z,0.5)*c.dpr;
  f.save();
  f.setTransform(1,0,0,1,0,0); f.globalCompositeOperation="source-atop";
  MP_FUMACA_CAMADAS.forEach(function(l){
    var pat=f.createPattern(tex,"repeat");
    if(!pat?.setTransform){ return; }
    pat.setTransform(new DOMMatrix([base*l.esc,0,0,base*l.esc,v.x*c.dpr+t*l.vx*k,v.y*c.dpr+t*l.vy*k]));
    f.globalAlpha=l.a; f.fillStyle=pat; f.fillRect(0,0,cv.width,cv.height);
  });
  f.restore();
}
/* o que o mapa faz de tempos em tempos enquanto a fumaca anda: redesenhar (15 quadros por segundo bastam para algo lento) */
function mpAgendaFumaca(c){
  if(!mpFumacaViva()||c.fumT){ return; }
  c.fumT=setTimeout(function(){ c.fumT=0; mpDesenha(); },66);
}

/* ---------- a nevoa ---------- */
function mpTelaCanvas(cv,ref){
  if(cv.width!==ref.width||cv.height!==ref.height){ cv.width=ref.width; cv.height=ref.height; }
  return cv.getContext("2d");
}
/* O que a visao abre: o explorado (60%) e o que se ve agora (inteiro), pintados numa mascara e borrados, para a borda
   da luz ser de nevoa e nao de recorte. Refeito so quando a vista, as paredes, os tokens ou o explorado mudam. */
function mpAbertura(c,v,cv,m){
  var polis=mpVisaoAgora(), ex=mpMemoriaLigada()?mpLembraVisao(polis):null, px=c.dpr*v.z;
  var bl=Math.max(3,Math.min(26,mpLado()*px*0.2));
  var chave=[c.visao.sig,v.x,v.y,v.z,cv.width,cv.height,ex?ex.sig+"/"+ex.v:"-",bl].join("|");
  if(c.abChave===chave&&c.abCv){ return c.abCv; }
  var mk=c.abMask||(c.abMask=document.createElement("canvas")), g=mpTelaCanvas(mk,cv);
  g.setTransform(1,0,0,1,0,0); g.globalAlpha=1; g.clearRect(0,0,mk.width,mk.height);
  g.setTransform(c.dpr,0,0,c.dpr,0,0); g.translate(v.x,v.y); g.scale(v.z,v.z);
  g.fillStyle="white";
  if(ex){ g.globalAlpha=0.6; g.drawImage(ex.cv,0,0,m.largura,m.altura); g.globalAlpha=1; }
  polis.forEach(function(p){
    if(p.pts.length<3){ return; }
    g.beginPath(); p.pts.forEach(function(q,i){ if(i){ g.lineTo(q[0],q[1]); } else { g.moveTo(q[0],q[1]); } }); g.closePath(); g.fill();
  });
  var ab=c.abCv||(c.abCv=document.createElement("canvas")), h=mpTelaCanvas(ab,cv);
  h.setTransform(1,0,0,1,0,0); h.clearRect(0,0,ab.width,ab.height);
  h.filter="blur("+bl+"px)"; h.drawImage(mk,0,0); h.filter="none";
  c.abChave=chave;
  return ab;
}
/* A mascara que o servidor mandou ao jogador (uma casa pequena por pixel: opaca onde ele ve, 60% onde lembra),
   esticada sobre o mapa e borrada como a visao do mestre. Nula enquanto a imagem nao carregou: a nevoa fica fechada. */
function mpAberturaServidor(c,v,cv){
  var vi=MP.vista;
  if(!vi?.png){ return null; }
  var mi=c.vistaImg;
  if(!mi||mi.src!==vi.png){
    mi=c.vistaImg={src:vi.png,img:new Image(),ok:false};
    mi.img.onload=function(){ if(c.vistaImg===mi){ mi.ok=true; mpDesenha(); } };
    mi.img.src=vi.png;
  }
  if(!mi.ok){ return null; }
  var bl=Math.max(3,Math.min(26,mpLado()*c.dpr*v.z*0.2));
  var chave=["s",MP.vistaV,v.x,v.y,v.z,cv.width,cv.height,bl].join("|");
  if(c.abChave===chave&&c.abCv){ return c.abCv; }
  var mk=c.abMask||(c.abMask=document.createElement("canvas")), g=mpTelaCanvas(mk,cv);
  g.setTransform(1,0,0,1,0,0); g.globalAlpha=1; g.clearRect(0,0,mk.width,mk.height);
  g.setTransform(c.dpr,0,0,c.dpr,0,0); g.translate(v.x,v.y); g.scale(v.z,v.z);
  g.imageSmoothingEnabled=true;
  g.drawImage(mi.img,0,0,vi.cols*vi.cel,vi.lins*vi.cel);
  var ab=c.abCv||(c.abCv=document.createElement("canvas")), h=mpTelaCanvas(ab,cv);
  h.setTransform(1,0,0,1,0,0); h.clearRect(0,0,ab.width,ab.height);
  h.filter="blur("+bl+"px)"; h.drawImage(mk,0,0); h.filter="none";
  c.abChave=chave;
  return ab;
}
/* as areas de nevoa (e o pincel), na ordem em que foram feitas: so o mestre as tem */
function mpPintaAreasFog(f,cor,px){
  MP.els.forEach(function(e){
    if(e.tipo!=="FOG"){ return; }
    var d=e.dados||{};
    if(!d.pts?.length){ return; }
    f.globalCompositeOperation=d.revela?"destination-out":"source-over";
    if(d.forma==="traco"){
      /* a borda macia e um borrao do traco, em pixels da tela */
      f.filter=d.suave===false?"none":"blur("+Math.max(2,Math.min(30,mpNum(d.larg,70)*px*0.2))+"px)";
      f.fillStyle=cor.fundo; f.strokeStyle=cor.fundo; mpPreencheTraco(f,d); f.filter="none";
      return;
    }
    if(d.pts.length<2){ return; }
    f.fillStyle=cor.fundo; mpTracaForma(f,d.forma,d.pts); f.fill();
  });
}
/* A nevoa e uma camada a parte, desenhada na tela e nao no mapa: preenche tudo, a fumaca anda por cima, as areas
   (e o pincel) abrem ou fecham na ordem em que foram feitas, e por fim a visao abre os buracos. Para o jogador,
   areas e visao ja vem juntas na mascara do servidor. */
function mpPintaFog(ctx,z,cor){
  var modo=mpFogModo(), c=MPC, m=MP.mapa, v=mpVista();
  if(modo==="nenhum"||!m){ return; }
  var cv=c.fogCv||(c.fogCv=document.createElement("canvas")), f=mpTelaCanvas(cv,c.cv);
  f.setTransform(1,0,0,1,0,0); f.globalCompositeOperation="source-over"; f.globalAlpha=1; f.filter="none"; f.clearRect(0,0,cv.width,cv.height);
  f.setTransform(c.dpr,0,0,c.dpr,0,0); f.translate(v.x,v.y); f.scale(v.z,v.z);
  f.fillStyle=cor.fundo; f.fillRect(0,0,m.largura,m.altura);
  if(GM){ mpPintaAreasFog(f,cor,c.dpr*v.z); }
  mpPintaFumaca(f,cv,c,v,cor);
  var ab=null;
  if(!GM){ ab=mpAberturaServidor(c,v,cv); } else if(modo==="visao"){ ab=mpAbertura(c,v,cv,m); }
  if(ab){
    f.setTransform(1,0,0,1,0,0); f.globalCompositeOperation="destination-out";
    f.drawImage(ab,0,0);
  }
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.globalAlpha=mpFogOpaco()?1:0.5;
  ctx.drawImage(cv,0,0);
  ctx.restore();
  mpAgendaFumaca(c);
}

/* ---------- pintura dos elementos (so o mestre os ve) ---------- */
function mpPintaParede(ctx,e,z,cor){
  var d=e.dados||{}, p=d.pts||[], k=d.kind||"parede";
  if(!GM||MP.comoJogador||p.length<2){ return; }
  ctx.save();
  ctx.lineCap="round"; ctx.lineJoin="round";
  ctx.strokeStyle=k==="parede"?cor.perigo:(k==="porta"&&d.aberta?cor.ok:cor.ouro);
  ctx.lineWidth=Math.max(k==="porta"?5:3,2/z);
  /* o traco diz o tipo mesmo sem cor: janela pontilhada, porta aberta tracejada, o resto inteiro */
  if(k==="janela"){ ctx.setLineDash([2/z,5/z]); } else if(k==="porta"&&d.aberta){ ctx.setLineDash([8/z,6/z]); }
  ctx.beginPath(); p.forEach(function(q,i){ if(i){ ctx.lineTo(q[0],q[1]); } else { ctx.moveTo(q[0],q[1]); } }); ctx.stroke();
  ctx.setLineDash([]);
  if(mpEhSel(e.id)){
    ctx.fillStyle=cor.ouro; p.forEach(function(q){ ctx.fillRect(q[0]-3/z,q[1]-3/z,6/z,6/z); });
    var b=mpBBox(e); ctx.strokeStyle=cor.ouro; ctx.lineWidth=2/z; ctx.setLineDash([6/z,4/z]);
    ctx.strokeRect(b.x0-4/z,b.y0-4/z,b.x1-b.x0+8/z,b.y1-b.y0+8/z);
  }
  ctx.restore();
  if(mpTrancado(e)){ var b2=mpBBox(e); mpPintaCadeado(ctx,b2.x0-4/z,b2.y0-4/z,z,cor); }
}
/* o contorno das areas de nevoa: tracejado, verde onde revela e vermelho onde cobre (a forma tambem diz: so existe com a nevoa ligada) */
function mpPintaFogForma(ctx,e,z,cor){
  var d=e.dados||{}, p=d.pts||[];
  if(!GM||MP.comoJogador||mpFogModo()==="nenhum"||p.length<(d.forma==="traco"?1:2)){ return; }
  /* a pincelada nao fica desenhada: ela so abre (ou fecha) a nevoa. O caminho aparece so enquanto esta selecionada. */
  if(d.forma==="traco"&&!mpEhSel(e.id)){ return; }
  ctx.save();
  ctx.strokeStyle=d.revela?cor.ok:cor.perigo; ctx.lineWidth=Math.max(1.5/z,1/z); ctx.setLineDash([d.revela?10/z:3/z,5/z]);
  /* o traco do pincel mostra so o caminho (o miolo do pincel e a propria nevoa) */
  var linha=function(){
    if(d.forma!=="traco"){ mpTracaForma(ctx,d.forma,p); return; }
    ctx.beginPath(); ctx.moveTo(p[0][0],p[0][1]);
    if(p.length===1){ ctx.lineTo(p[0][0]+0.01,p[0][1]); }
    for(var i=1;i<p.length;i++){ ctx.lineTo(p[i][0],p[i][1]); }
  };
  linha(); ctx.stroke();
  if(mpEhSel(e.id)){ ctx.lineWidth=3/z; ctx.setLineDash([]); ctx.strokeStyle=cor.ouro; linha(); ctx.stroke(); }
  ctx.restore();
  if(mpTrancado(e)){ var b=mpBBox(e); mpPintaCadeado(ctx,b.x0-3/z,b.y0-3/z,z,cor); }
}
function mpAcertaParede(e,wx,wy,z){
  var p=e.dados?.pts||[], tol=Math.max(5,9/z);
  for(var i=1;i<p.length;i++){ if(mpDistSeg(wx,wy,p[i-1],p[i])<=tol){ return true; } }
  return false;
}

/* ---------- criar ---------- */
function mpArredPts(pts){ return pts.map(function(q){ return [mpArred(q[0]),mpArred(q[1])]; }); }
function mpCriaParede(pts){
  return mpCriaElemento({tipo:"PAREDE",dados:{kind:MP.paredeKind,pts:mpArredPts(pts),aberta:false}},"não consegui pôr a parede")
    .catch(function(){ /* o aviso ja saiu em mpGrava */ });
}
function mpCriaFog(forma,pts){
  return mpCriaElemento({tipo:"FOG",dados:{forma:forma,pts:mpArredPts(pts),revela:MP.fogRevela!==false}},"não consegui desenhar a névoa")
    .catch(function(){ /* o aviso ja saiu em mpGrava */ });
}
/* o que a ferramenta ativa faz com o que foi desenhado: parede, nevoa ou desenho comum */
function mpCriaForma(forma,pts){
  if(MP.ferramenta==="parede"){ return mpCriaParede(pts); }
  if(MP.ferramenta==="fog"){ return mpCriaFog(forma,pts); }
  return mpCriaDesenho(forma,pts);
}
/* a pincelada nao e desenho nem se seleciona por area, clique ou Ctrl+A: ela so abre ou fecha a nevoa, e se acha pela lista do painel */
function mpPincelada(e){ return e.tipo==="FOG"&&e.dados?.forma==="traco"; }
function mpFogDoMapa(){ return MP.els.filter(function(e){ return e.tipo==="FOG"; }); }
/* "Cobrir tudo" tira todas as areas; "Revelar tudo" tira e poe uma que cobre o mapa inteiro. */
function mpCobreTudo(){
  var l=mpFogDoMapa();
  if(!l.length){ return Promise.resolve(); }
  return mpLote(l.map(function(e){ return {id:e.id,remover:true}; }),"não consegui cobrir o mapa").catch(function(){ /* aviso em mpGrava */ });
}
function mpRevelaTudo(){
  var m=MP.mapa;
  return mpCobreTudo().then(function(){
    return mpCriaElemento({tipo:"FOG",dados:{forma:"retangulo",pts:[[0,0],[m.largura,m.altura]],revela:true}},"não consegui revelar o mapa");
  }).catch(function(){ /* aviso em mpGrava */ });
}
/* as regras da nevoa: o que nao vai aqui o servidor mantem como estava */
function mpSalvaFog(modo,mais){
  var r=MP.mapa?.regras||{};
  return mpSalvaMapa({regras:{quem:r.quem,limite:r.limite,trancadas:r.trancadas||[],encaixe:r.encaixe!==false,fog:modo||mpFogModo(),...mais}})
    .catch(function(){ /* o aviso ja saiu em mpGrava */ });
}
/* Porta: abrir e fechar e do mestre (muda o que barra o movimento e a visao de todos). */
function mpAlternaPorta(e){
  return mpMudaElemento(e,{dados:{aberta:!e.dados?.aberta}},"não consegui mexer na porta").catch(function(){ /* aviso em mpGrava */ });
}
