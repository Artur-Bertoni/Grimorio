/* Catalogo de midia do servidor. */
"use strict";

/* ---------- BIBLIOTECA NO SERVIDOR ---------- */
var LIB={ok:false,faixas:{},docs:{}};
function keyF(n){return norm(n).replace(/\.mp3$/,"").replace(/[^a-z0-9]+/g," ").trim();}
var CATp=null;
function carregaCatalogo(){ if(CATp)return CATp;
  CATp=api(cAPI("/midia")).then(function(c){
    c=c||{}; LIB.faixas={}; LIB.docs={};
    (c.faixas||[]).forEach(function(f){
      LIB.faixas[keyF(f.nome)]={id:f.id,nome:f.nome,cat:f.cat||"Sem categoria",url:f.url,tamanho:f.tamanho}; });
    (c.docs||[]).forEach(function(d){
      LIB.docs[String(d.abrev||"").toUpperCase()]=
        {id:d.id,abrev:d.abrev,nome:d.nome,url:d.url,paginas:d.paginas,tamanho:d.tamanho}; });
    LIB.ok=Object.keys(LIB.faixas).length>0||Object.keys(LIB.docs).length>0;
    return LIB; }).catch(function(){ LIB.ok=false; return LIB; });
  return CATp; }
function recarregaCatalogo(){ CATp=null; PDFC={}; return carregaCatalogo(); }
