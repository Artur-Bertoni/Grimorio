#!/usr/bin/env node
/**
 * Servidor de mentira para testar o front sem subir o Spring.
 *
 * Responde os endpoints que o index.html usa, guarda guia e mesa em memoria e
 * serve as imagens de uma campanha de teste gerada na hora. Nao e teste de
 * backend: e o que permite exercitar a tela de verdade num navegador.
 *
 *     node stub.mjs              # http://127.0.0.1:8099
 *     node stub.mjs --porta 9000
 *
 * A campanha 1 nasce no formato ANTIGO (v2, com corpos, episodios e NPCs dentro
 * da sessao) de proposito: e ela que prova que a migracao para a v3 funciona.
 */
import http from 'node:http';
import zlib from 'node:zlib';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = normalize(join(AQUI, '..', '..', 'src', 'main', 'resources', 'static'));
const iPorta = process.argv.indexOf('--porta');
const PORTA = iPorta > 0 ? Number(process.argv[iPorta + 1]) : 8099;

// PNG 8x8 de uma cor so. Evita depender de arte de verdade.
const TAB = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xffffffff; for (const x of b) c = TAB[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function png(r, g, b) {
  const bloco = (tipo, dados) => {
    const corpo = Buffer.concat([Buffer.from(tipo), dados]);
    const tam = Buffer.alloc(4); tam.writeUInt32BE(dados.length);
    const soma = Buffer.alloc(4); soma.writeUInt32BE(crc(corpo));
    return Buffer.concat([tam, corpo, soma]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(8, 0); ihdr.writeUInt32BE(8, 4); ihdr[8] = 8; ihdr[9] = 2;
  const linha = Buffer.concat([Buffer.from([0]), Buffer.from(Array(8).fill([r, g, b]).flat())]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr), bloco('IDAT', zlib.deflateSync(Buffer.concat(Array(8).fill(linha)))), bloco('IEND', Buffer.alloc(0))]);
}
const IMGS = {
  'pc-1.png': png(180, 40, 40), 'pc-1-hover.png': png(90, 20, 20),
  'pc-2.png': png(40, 120, 180), 'pc-2-hover.png': png(20, 60, 90),
  'pc-3.png': png(200, 170, 60), 'pc-3-hover.png': png(100, 85, 30),
  'ficha-1.png': png(60, 60, 60), 'npc-1.png': png(120, 60, 160), 'pista-1.png': png(30, 150, 110),
};

/* A campanha de teste mora num arquivo, no formato do guia de verdade. */
const GUIA_TESTE = readFileSync(join(AQUI, 'campanha-teste.json'), 'utf8');
const GUIA_BRANCO = JSON.stringify({ versao: 3, campanha: { titulo: '', sistema: '' },
  elenco: { personagens: [], npcs: [], locais: [], pistas: [] }, sessoes: [], trilhaCategorias: [] });

const CAMPS = [
  { id: 1, nome: 'Campanha de teste', sistema: 'Sistema de teste', papel: 'MESTRE', arquivada: false, rolagensAbertas: true,
    sessao: JSON.stringify({ tipo: 'proxima', rotulo: 'Sessão', n: 1, titulo: 'A chegada' }) },
  { id: 2, nome: 'Mesa em branco', sistema: '', papel: 'MESTRE', arquivada: false },
  { id: 3, nome: 'Onde eu jogo', sistema: 'Outro sistema', papel: 'JOGADOR', arquivada: false,
    sessao: JSON.stringify({ tipo: 'ultima', rotulo: 'Capítulo', n: 4, titulo: 'O porão' }) },
];
let ST = {};
/* SEMENTE=n deixa o sorteio do stub previsivel, para comparar retratos de duas rodadas */
if (process.env.SEMENTE) { let s = Number(process.env.SEMENTE) || 1; Math.random = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; }
/* PDF minimo de tres paginas, com a tabela xref calculada: o pdf.js recusa offset errado */
function pdfDeTeste(n, linhas) {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', ''], kids = [];
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  for (let i = 1; i <= n; i++) {
    const txt = linhas ? linhas.map((l, k) => 'BT /F1 14 Tf 60 ' + (520 - k * 30) + ' Td (' + l + ') Tj ET').join('\n')
      : 'BT /F1 48 Tf 60 400 Td (Pagina ' + i + ') Tj ET';
    objs.push('<< /Length ' + txt.length + ' >>\nstream\n' + txt + '\nendstream');
    objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 595] /Contents ' + (objs.length) + ' 0 R /Resources << /Font << /F1 3 0 R >> >> >>');
    kids.push(objs.length + ' 0 R');
  }
  objs[1] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>';
  let s = '%PDF-1.4\n'; const off = [];
  objs.forEach((o, i) => { off.push(s.length); s += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const x = s.length;
  s += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + off.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  s += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF\n';
  return Buffer.from(s, 'latin1');
}
const PDF3 = pdfDeTeste(3);
/* ficha em texto corrido, um "rotulo: valor" por linha: e o caminho de importacao sem IA */
const PDF_FICHA = pdfDeTeste(1, ['Nome: Lia', 'Conceito: Batedora', 'Forca: 3', 'Vida: 7/10']);
/* ficha sem uma letra de texto, como a escaneada: so a IA consegue ler */
const PDF_IMAGEM = pdfDeTeste(1, []);
/* rolagem do stub: so NdS com soma, o bastante para a tela; a gramatica inteira e do servidor Java */
function rolaStub(formula) {
  const m = /^(\d*)d(\d+)(?:(kh|kl|dh|dl)(\d+))?([+-]\d+)?$/.exec(String(formula).toLowerCase().replace(/\s+/g, ''));
  if (!m) return null;
  const q = Number(m[1] || 1), l = Number(m[2]), soma = Number(m[5] || 0);
  const v = Array.from({ length: q }, () => 1 + Math.floor(Math.random() * l));
  let ficam = v.slice();
  if (m[3]) { const o = v.slice().sort((a, b) => a - b), k = Number(m[4]);
    ficam = m[3] === 'kh' ? o.slice(-k) : m[3] === 'kl' ? o.slice(0, k) : m[3] === 'dl' ? o.slice(k) : o.slice(0, q - k); }
  const total = ficam.reduce((a, b) => a + b, 0) + soma;
  return { formula: q + 'd' + l + (m[3] ? m[3] + m[4] : '') + (m[5] || ''), detalhe: '[' + v.join(', ') + ']' + (soma ? (soma > 0 ? ' + ' : ' - ') + Math.abs(soma) : ''),
    valor: total, lados: l, extremo: ficam.every(x => x === l) ? 1 : ficam.every(x => x === 1) ? -1 : 0 };
}
/* rolagens por campanha; a de outra pessoa entra por POST /__rolagem-de-outro, so no teste */
let ROLAGENS = {}, FICHAS = {};
function zera() {
  ROLAGENS = {}; FICHAS = {}; mapasIniciais();
  for (const c of CAMPS) { c.capa = ''; c.rolagensAbertas = true; }
  const mesaVazia = () => ({ json: JSON.stringify({ resumos: [], ev: [], npcs: [], locais: [], at: 0 }), versao: 1 });
  ST = {
    guia: {
      1: { json: GUIA_TESTE, versao: 1 },
      2: { json: GUIA_BRANCO, versao: 1 },
    },
    mesa: {
      1: mesaVazia(), 2: mesaVazia(),
      3: { json: JSON.stringify({ titulo: 'Onde eu jogo', tema: 'luar',
        locais: [{ id: 'l9', nome: 'Pensao', img: 'img/npc-1.png', desc: 'Onde todos dormem.' }], resumos: [{ n: 1, titulo: 'O começo', data: '01/01/2026', texto: 'Aconteceu muita coisa.' }],
        ev: [], npcs: [{ id: 'n9', nome: 'Liberado', img: 'img/npc-1.png', desc: 'Um rosto conhecido.' }], at: 1 }), versao: 1 },
    },
    perfil: { id: 1, login: 'mestre', nome: 'Mestre de teste', admin: true, iaConfigurada: false },
    senha: 'segredo123',
    imgs: Object.keys(IMGS).sort(),
    docs: [{ id: 50, abrev: 'LB', nome: 'Livro de regras', paginas: 120, tamanho: 1048576, publico: false }],
    faixas: [{ id: 60, chave: 'chuva', nome: 'Chuva', cat: 'Ambiente', tamanho: 2097152 },
             { id: 61, chave: 'luta', nome: 'Luta', cat: 'Combate', tamanho: 3145728 }],
    membros: [{ usuarioId: 1, nome: 'Mestre de teste', login: 'mestre', papel: 'MESTRE', dono: true },
              { usuarioId: 2, nome: 'Jogadora', login: 'jogadora', papel: 'JOGADOR', dono: false }],
    convites: [], mural: [], notas: '', seq: 100, suporte: [], cheio: false,
  };
}
zera();

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8', '.map': 'application/json' };

function envia(res, code, corpo, ct = 'application/json; charset=utf-8') {
  if (corpo !== null && typeof corpo === 'object' && !Buffer.isBuffer(corpo)) corpo = JSON.stringify(corpo);
  const b = Buffer.isBuffer(corpo) ? corpo : Buffer.from(corpo ?? '');
  res.writeHead(code, { 'Content-Type': ct, 'Content-Length': b.length, 'Set-Cookie': 'XSRF-TOKEN=t0; Path=/' });
  res.end(b);
}
const lerCorpo = req => new Promise(ok => { const p = []; req.on('data', d => p.push(d)); req.on('end', () => ok(Buffer.concat(p))); });
const json = b => { try { return JSON.parse(b.toString('utf8') || '{}'); } catch { return {}; } };
const catalogo = cid => ({
  docs: ST.docs.map(d => ({ ...d, url: `/midia/c${cid}/pdf/${d.abrev}.pdf` })),
  faixas: ST.faixas.map(f => ({ ...f, url: `/midia/c${cid}/audio/${f.chave}.mp3` })),
  imagens: ST.imgs.map((n, i) => ({ id: i + 1, nome: n, chave: n, arquivo: 'img/' + n, tamanho: 64, url: `/midia/c${cid}/img/${n}` })),
  base: `/midia/c${cid}/`,
});

/* Tabletop: mapas por campanha, com o mesmo corte do servidor (o jogador so ve o mapa ativo e
   so os tokens visiveis). /eventos e um SSE de verdade; com /__sse/0 ele responde 404 e a tela
   tem de cair para polling. */
var MAPAS = {}, TURNOS = {}, MAPA_SEQ = 500, SSE = {}, SEM_SSE = false; // var: zera() roda antes desta linha
/* o aviso da campanha (/api/c/{id}/eventos): so diz o que mudou, a tela le pelas rotas de sempre.
   /__sse/0 tambem o desliga, e a tela volta a perguntar de 6 em 6 segundos. */
var AVISOS_SSE = {};
const avisa = (cid, ev) => { for (const r of (AVISOS_SSE[cid] || [])) r.write('event: campanha\ndata: ' + JSON.stringify(ev) + '\n\n'); };
const sseEnvia = (cid, ev) => { for (const r of (SSE[cid] || [])) r.write('event: mapa\ndata: ' + JSON.stringify(ev) + '\n\n'); };
function mapasIniciais() {
  TURNOS = {};
  const grid = { tipo: 'quadrado', tam: 70, ox: 0, oy: 0, opac: 0.35, escala: 1.5, unidade: 'm', diagonal: '121' };
  MAPAS = {
    3: [{ id: 31, nome: 'Pensao por dentro', imagem: 'img/pc-2.png', largura: 1400, altura: 980, grid, regras: { quem: 'dono' }, ativo: true, ordem: 0, seq: 3, cenaId: '',
      els: [{ id: 301, tipo: 'TOKEN', camada: 'personagens', dono: 1, visivel: true, bloqueado: false, ordem: 0, dados: { x: 455, y: 315, tam: 1, rot: 0, nome: 'Minha heroina', img: 'img/npc-1.png' } },
            { id: 302, tipo: 'TOKEN', camada: 'personagens', dono: 0, visivel: true, bloqueado: false, ordem: 1, dados: { x: 735, y: 455, tam: 1, rot: 90, nome: 'Guarda', img: '' } },
            { id: 303, tipo: 'TOKEN', camada: 'personagens', dono: 0, visivel: false, bloqueado: false, ordem: 2, dados: { x: 105, y: 105, tam: 2, rot: 0, nome: 'Emboscada', img: '', npcId: 'n1' } }] }],
  };
}
mapasIniciais();
const mestreEm = cid => (CAMPS.find(x => x.id === Number(cid)) || {}).papel !== 'JOGADOR';
const mapaJson = (m, mestre) => { const { els, hist, ...r } = m; if (!mestre) { delete r.cenaId; delete r.imagem; } return r; };
const camadaTrancada = (m, e) => (m.regras.trancadas || []).includes(e.camada);
const trancado = (m, e) => !!e.bloqueado || camadaTrancada(m, e);
const podeMover = (m, e, mestre) => mestre ? !trancado(m, e) : (e.tipo === 'TOKEN' && e.visivel && !trancado(m, e) && (e.dono === ST.perfil.id || e.dados.livre || m.regras.quem === 'todos'));
const elJson = (m, e, mestre) => {
  const r = { ...e, dados: { ...e.dados }, meu: e.dono === ST.perfil.id, podeMover: podeMover(m, e, mestre) };
  if (!mestre) {
    if (e.tipo === 'TOKEN') {
      const fica = ['x', 'y', 'tam', 'rot', 'nome', 'img', 'marcas', ...(r.meu || r.podeMover ? ['desl', 'usado', 'visao', 'visaoFicha'] : []), ...(r.meu || e.dados.vidaPublica ? ['vida', 'vidaMax'] : [])];
      for (const k of Object.keys(r.dados)) if (!fica.includes(k)) delete r.dados[k];
    }
    delete r.bloqueado;
  }
  return r;
};
/* Fase 4b: o corte da nevoa e do servidor. Aqui, por alto: parede e area nunca saem para o jogador; token so o
   dele ou o que um token dele enxerga (alcance em casas, sem parede de visao no meio) ou o que uma area retangular
   revela; a vista traz uma mascara (aqui, toda aberta) e os pedacos da imagem. */
const MASCARA = 'data:image/png;base64,' + png(255, 255, 255).toString('base64');
const barraVisao = w => w.tipo === 'PAREDE' && w.dados.kind !== 'janela' && !(w.dados.kind === 'porta' && w.dados.aberta);
const cruzaParede = (mp, a, b, filtro) => mp.els.filter(filtro).some(w => w.dados.pts.some((q, i) => i && segCruza(w.dados.pts[i - 1], q, a, b)));
const fogDe = m => m.regras.fog || 'nenhum';
const jogadorVe = (mp, x, y) => {
  if (fogDe(mp) === 'nenhum') return true;
  let r = false;
  for (const f of mp.els.filter(e => e.tipo === 'FOG' && e.dados.forma === 'retangulo')) {
    const [a, b] = f.dados.pts;
    if (x >= Math.min(a[0], b[0]) && x <= Math.max(a[0], b[0]) && y >= Math.min(a[1], b[1]) && y <= Math.max(a[1], b[1])) r = !!f.dados.revela;
  }
  if (r || fogDe(mp) !== 'visao') return r;
  return mp.els.some(t => t.tipo === 'TOKEN' && t.visivel && t.dono === ST.perfil.id && Math.hypot(t.dados.x - x, t.dados.y - y) <= (t.dados.visao ?? mp.regras.visaoPadrao ?? 6) * mp.grid.tam
    && !cruzaParede(mp, [t.dados.x, t.dados.y], [x, y], barraVisao));
};
const chegaAoJogador = (mp, e) => e.visivel && e.tipo !== 'PAREDE' && e.tipo !== 'FOG' && (e.tipo !== 'TOKEN' || e.dono === ST.perfil.id || jogadorVe(mp, e.dados.x, e.dados.y));
const vistaDe = mp => {
  const cols = Math.ceil(mp.largura / 512), lins = Math.ceil(mp.altura / 512);
  return { modo: fogDe(mp), cel: 10, cols: Math.ceil(mp.largura / 10), lins: Math.ceil(mp.altura / 10), ...(fogDe(mp) === 'nenhum' ? {} : { png: MASCARA }),
    paredes: mp.els.some(e => e.tipo === 'PAREDE'), ...(mp.imagem ? { tiles: { lado: 512, w: mp.largura, h: mp.altura, cols, lins, v: Array(cols * lins).fill('sf') } } : {}) };
};
/* historico e desfazer, no mesmo desenho do servidor: cada operacao guarda o estado de antes */
const casasEntre = (mp, a, b) => {
  const T = mp.grid.tam, dx = Math.abs(b.x - a.x) / T, dy = Math.abs(b.y - a.y) / T;
  if (mp.grid.diagonal === 'eu') return Math.hypot(dx, dy);
  const p = Math.round(dx), q = Math.round(dy);
  return mp.grid.diagonal === '1' ? Math.max(p, q) : Math.max(p, q) + Math.floor(Math.min(p, q) / 2);
};
const registra = (mp, op, e, antes) => { (mp.hist ||= []).push({ seq: mp.seq, usuario: ST.perfil.id, op, id: e.id, antes: antes ? structuredClone(antes) : null, depois: op === 'remover' ? null : structuredClone(e), desfeito: false }); };
function rotaMapa(M, p, b, req, res) {
  const tl = p.match(/^\/api\/c\/(\d+)\/mapas\/(\d+)\/tile\/(\d+)\/(\d+)$/);
  if (tl) {
    const mp = (MAPAS[tl[1]] || []).find(x => String(x.id) === tl[2]);
    if (!mp || (!mestreEm(tl[1]) && !mp.ativo)) { envia(res, 404, { erro: 'não encontrado' }); return true; }
    envia(res, 200, IMGS['pc-2.png'], 'image/png'); return true;
  }
  let m = p.match(/^\/api\/c\/(\d+)\/mapas(?:\/(\w+))?(?:\/(elementos|ativo|desfazer|historico|ping|rota))?(?:\/(\d+))?$/);
  if (!m) return false;
  const cid = m[1], lista = (MAPAS[cid] ||= []), mestre = mestreEm(cid);
  const sem = (c = 204) => { res.writeHead(c, { 'Set-Cookie': 'XSRF-TOKEN=t0; Path=/' }); res.end(); return true; };
  if (m[2] === 'eventos') {
    if (SEM_SSE) { envia(res, 404, { erro: 'sem SSE agora' }); return true; }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    (SSE[cid] ||= new Set()).add(res);
    req.on('close', () => SSE[cid].delete(res));
    const at = lista.find(x => x.ativo);
    res.write('event: mapa\ndata: ' + JSON.stringify({ tipo: 'ola', ativo: at ? at.id : null }) + '\n\n');
    return true;
  }
  if (!m[2]) {
    if (M === 'GET') { envia(res, 200, lista.filter(x => mestre || x.ativo).map(x => mapaJson(x, mestre))); return true; }
    if (M === 'POST' && mestre) {
      const novo = { id: ++MAPA_SEQ, nome: b.nome || 'Mapa sem nome', imagem: b.imagem || '', largura: b.imagem ? 1400 : 2100, altura: b.imagem ? 980 : 1400,
        grid: { tipo: 'quadrado', tam: 70, ox: 0, oy: 0, opac: 0.35, escala: 1.5, unidade: 'm', diagonal: '121' }, regras: { quem: 'dono' }, ativo: false, ordem: lista.length, seq: 0, cenaId: '', els: [] };
      lista.push(novo); envia(res, 200, mapaJson(novo, true)); return true;
    }
    envia(res, 403, { erro: 'so o mestre', codigo: 'proibido' }); return true;
  }
  /* turno: POST e o "Novo turno" a mao; PUT e a iniciativa do mestre (comeca, vira de turno, passa a vez) */
  if (m[2] === 'turno' && (M === 'POST' || M === 'PUT')) {
    const at = lista.find(x => x.ativo), T = (TURNOS[cid] ||= { ativo: false, rodada: 0 });
    let n = 0, novo = M === 'POST';
    if (M === 'PUT') { const ativo = !!b.ativo && (b.ids || []).length > 0; novo = ativo && (!T.ativo || b.rodada !== T.rodada); T.ativo = ativo; T.rodada = ativo ? b.rodada : 0; }
    if (mestre && at && novo) for (const e of at.els) if (e.dados.usado > 0) { e.dados.usado = 0; n++; }
    if (at && (novo || n)) at.seq++;
    sseEnvia(cid, { tipo: 'turno', ...(at ? { seq: at.seq } : {}), mapa: at ? at.id : null, rodada: T.rodada, novo, ...(M === 'PUT' ? { comIni: true, ini: b.ini || {} } : {}) });
    envia(res, 200, M === 'POST' ? { zerados: n } : { novo, rodada: T.rodada }); return true;
  }
  const mp = lista.find(x => String(x.id) === m[2]);
  if (!mp || (!mestre && !mp.ativo)) { envia(res, 404, { erro: 'não encontrado' }); return true; }
  if (!m[3]) {
    if (M === 'GET') {
      const desde = new URL(req.url, 'http://x').searchParams.get('desde');
      if (desde != null && Number(desde) === mp.seq) { envia(res, 200, { seq: mp.seq, igual: true }); return true; }
      envia(res, 200, { seq: mp.seq, mapa: mapaJson(mp, mestre), elementos: mp.els.filter(e => mestre || chegaAoJogador(mp, e)).map(e => elJson(mp, e, mestre)), ...(mestre ? {} : { vista: vistaDe(mp) }) }); return true;
    }
    if (!mestre) { envia(res, 403, { erro: 'so o mestre', codigo: 'proibido' }); return true; }
    if (M === 'PUT') { for (const k of ['nome', 'imagem', 'grid', 'regras', 'cenaId']) if (b[k] != null) mp[k] = k === 'regras' ? { ...mp.regras, ...b[k], trancadas: b[k].trancadas || mp.regras.trancadas || [], fog: b[k].fog || mp.regras.fog || 'nenhum' } : b[k]; mp.seq++; envia(res, 200, mapaJson(mp, true)); return true; }
    if (M === 'DELETE') { MAPAS[cid] = lista.filter(x => x !== mp); return sem(); }
  }
  /* a rota do servidor: so do token que o jogador move; atravessando parede, um desvio pela ponta de baixo dela */
  if (m[3] === 'rota' && M === 'POST') {
    const t = mp.els.find(x => x.id === b.id);
    if (!t || (!mestre && !podeMover(mp, t, false))) { envia(res, 403, { erro: 'este token não é seu para mover', codigo: 'proibido' }); return true; }
    const o = [t.dados.x, t.dados.y], d = [b.x, b.y], barra = w => w.tipo === 'PAREDE' && !(w.dados.kind === 'porta' && w.dados.aberta);
    if (mestre || !cruzaParede(mp, o, d, barra)) { envia(res, 200, { livre: true }); return true; }
    const w = mp.els.find(x => barra(x) && x.dados.pts.some((q, i) => i && segCruza(x.dados.pts[i - 1], q, o, d)));
    const ponta = w.dados.pts.reduce((a, q) => (q[1] > a[1] ? q : a));
    envia(res, 200, { pts: [o, [ponta[0], ponta[1] + 35], d] }); return true;
  }
  if (m[3] === 'ping' && M === 'POST') { sseEnvia(cid, { tipo: 'ping', mapa: mp.id, x: b.x, y: b.y, quem: ST.perfil.nome || 'Alguem', meu: false }); return sem(); }
  if (m[3] === 'historico' && M === 'GET') {
    const linhas = (mp.hist || []).filter(h => mestre || h.usuario === ST.perfil.id).slice().reverse().map(h => {
      const a = h.antes?.dados, d = h.depois?.dados, l = { seq: h.seq, em: new Date().toISOString(), quem: ST.perfil.nome || 'Alguem', operacao: h.op, elemento: h.id,
        nome: d?.nome || a?.nome || d?.rotulo || a?.rotulo || '', tipo: (h.depois || h.antes)?.tipo || 'TOKEN', desfeito: h.desfeito, meu: h.usuario === ST.perfil.id };
      if (a && d && (a.x !== d.x || a.y !== d.y)) l.casas = casasEntre(mp, a, d);
      return l;
    });
    envia(res, 200, linhas); return true;
  }
  if (m[3] === 'desfazer' && M === 'POST') {
    const alvo = b.seq == null ? null : Number(b.seq);
    const h0 = (mp.hist || []).slice().reverse().find(x => x.usuario === ST.perfil.id && !x.desfeito && ['criar', 'mudar', 'remover'].includes(x.op) && (alvo == null || x.seq === alvo));
    if (!h0) { envia(res, alvo == null ? 409 : 404, { erro: 'não há nada seu para desfazer' }); return true; }
    const grupo = mp.hist.filter(x => x.usuario === ST.perfil.id && !x.desfeito && ['criar', 'mudar', 'remover'].includes(x.op) && x.seq === h0.seq);
    const rs = [];
    for (const h of grupo) {
      h.desfeito = true;
      let e = mp.els.find(x => x.id === h.id), saiu = false;
      if (h.op === 'criar') { mp.els = mp.els.filter(x => x !== e); saiu = true; }
      else if (h.op === 'mudar' && e) { if (mestre) Object.assign(e, { dono: h.antes.dono, visivel: h.antes.visivel, camada: h.antes.camada, bloqueado: h.antes.bloqueado, dados: structuredClone(h.antes.dados) }); else { for (const k of ['x', 'y']) if (k in h.antes.dados) e.dados[k] = h.antes.dados[k]; e.dados.usado = Math.max(0, (e.dados.usado || 0) - Math.max(0, (h.depois.dados.usado || 0) - (h.antes.dados.usado || 0))); } }
      else if (h.op === 'remover' && !e) { e = { ...structuredClone(h.antes), id: ++MAPA_SEQ }; mp.els.push(e); for (const x of mp.hist) if (x.id === h.id) x.id = e.id; }
      if (e) rs.push({ id: e.id, el: saiu ? null : elJson(mp, e, mestre) });
    }
    mp.seq++; registra(mp, 'desfazer', { id: h0.id }, null);
    envia(res, 200, { seq: mp.seq, ...rs[0], ...(rs.length > 1 ? { outros: rs.slice(1) } : {}) }); return true;
  }
  if (m[3] === 'ativo' && mestre) { const liga = b.ativo !== false; for (const x of lista) x.ativo = liga && x === mp; envia(res, 200, { ativo: liga ? mp.id : null }); return true; }
  if (m[3] === 'elementos') {
    if (M === 'PUT' && mestre && !m[4]) {
      /* grupo: tudo ou nada, um seq so */
      const antesTudo = structuredClone(mp.els); mp.seq++;
      try {
        const out = [];
        for (const it of b.itens || []) {
          const e = mp.els.find(x => x.id === it.id);
          if (!e) throw new Error('nao achado');
          if (trancado(mp, e) && !(it.bloqueado === false && e.bloqueado && !camadaTrancada(mp, e))) throw new Error('Está trancado: destranque para mexer.');
          const antes = structuredClone(e);
          if (it.remover) { mp.els = mp.els.filter(x => x !== e); registra(mp, 'remover', e, e); out.push({ id: e.id, removido: true }); continue; }
          Object.assign(e.dados, it.dados || {});
          for (const k of ['visivel', 'camada', 'bloqueado']) if (it[k] != null) e[k] = it[k];
          registra(mp, 'mudar', e, antes); out.push(elJson(mp, e, true));
        }
        for (const el of out) sseEnvia(cid, el.removido ? { tipo: 'some', seq: mp.seq, mapa: mp.id, id: el.id } : { tipo: 'elemento', seq: mp.seq, mapa: mp.id, el });
        envia(res, 200, { seq: mp.seq, itens: out }); return true;
      } catch (err) { mp.els = antesTudo; mp.seq--; envia(res, 409, { erro: err.message }); return true; }
    }
    if (M === 'POST' && mestre) {
      const d = b.dados || {};
      if (b.tipo === 'DESENHO') {
        if (!['linha', 'circulo', 'retangulo', 'poligono', 'marca'].includes(d.forma) || !Array.isArray(d.pts) || !d.pts.length) { envia(res, 400, { erro: 'forma de desenho inválida' }); return true; }
        const e = { id: ++MAPA_SEQ, tipo: 'DESENHO', camada: b.camada || 'decoracao', dono: 0, visivel: b.visivel !== false, bloqueado: !!b.bloqueado, ordem: mp.els.length,
          dados: { forma: d.forma, pts: d.pts, cor: d.cor || 'ouro', esp: d.esp || 3, preench: d.preench || 0, rotulo: d.rotulo || '' } };
        mp.els.push(e); mp.seq++; registra(mp, 'criar', e, null); envia(res, 200, elJson(mp, e, true)); return true;
      }
      if (b.tipo === 'PAREDE' || b.tipo === 'FOG') {
        const ok = Array.isArray(d.pts) && d.pts.length >= (d.forma === 'traco' ? 1 : 2) && (b.tipo === 'PAREDE' || ['retangulo', 'circulo', 'poligono', 'traco'].includes(d.forma));
        if (!ok) { envia(res, 400, { erro: 'forma inválida' }); return true; }
        const e = { id: ++MAPA_SEQ, tipo: b.tipo, camada: 'cenario', dono: 0, visivel: true, bloqueado: !!b.bloqueado, ordem: mp.els.length,
          dados: b.tipo === 'PAREDE' ? { kind: d.kind || 'parede', aberta: !!d.aberta && d.kind === 'porta', pts: d.pts } : { forma: d.forma, pts: d.pts, revela: d.revela !== false, ...(d.forma === 'traco' ? { larg: d.larg || 70, ponta: d.ponta || 'redondo', suave: d.suave !== false } : {}) } };
        mp.els.push(e); mp.seq++; registra(mp, 'criar', e, null); envia(res, 200, elJson(mp, e, true)); return true;
      }
      const e = { id: ++MAPA_SEQ, tipo: 'TOKEN', camada: b.camada || (d.npcId ? 'npcs' : 'personagens'), dono: b.dono ?? 0, visivel: b.visivel !== false, bloqueado: false, ordem: mp.els.length,
        dados: { x: d.x ?? mp.largura / 2, y: d.y ?? mp.altura / 2, tam: d.tam || 1, rot: d.rot || 0, nome: d.nome || 'Token', img: d.img || '', ...(d.fichaId != null ? { fichaId: d.fichaId, vinculo: d.vinculo !== false } : {}), ...(d.npcId ? { npcId: d.npcId } : {}), ...(d.vidaMax ? { vidaMax: d.vidaMax, vida: d.vida ?? d.vidaMax, ...(d.vidaCampo ? { vidaCampo: d.vidaCampo } : {}) } : {}) } };
      mp.els.push(e); mp.seq++; registra(mp, 'criar', e, null); envia(res, 200, elJson(mp, e, true)); return true;
    }
    const e = mp.els.find(x => String(x.id) === m[4] && (mestre || x.visivel));
    if (!e) { envia(res, 404, { erro: 'não encontrado' }); return true; }
    if (M === 'PUT') {
      if (!mestre && e.dono === ST.perfil.id && ('vida' in (b.dados || {}) || 'marcas' in (b.dados || {}))) {
        const antes = structuredClone(e); if (b.dados.vida != null) e.dados.vida = Math.min(b.dados.vida, e.dados.vidaMax || b.dados.vida); if (b.dados.marcas) e.dados.marcas = b.dados.marcas;
        mp.seq++; registra(mp, 'mudar', e, antes); envia(res, 200, elJson(mp, e, false)); return true;
      }
      if (!mestre && !podeMover(mp, e, mestre)) { envia(res, 403, { erro: 'este token não é seu para mover', codigo: 'proibido' }); return true; }
      const d = b.dados || {}, antes = structuredClone(e);
      let passou = false;
      if (mestre) {
        if (trancado(mp, e) && !(b.bloqueado === false && e.bloqueado && !camadaTrancada(mp, e))) { envia(res, 409, { erro: 'Está trancado: destranque para mexer.' }); return true; }
        Object.assign(e.dados, d);
        for (const k of ['visao', 'visaoFicha']) if (e.dados[k] === null || e.dados[k] === '') delete e.dados[k];
        if (e.tipo === 'PAREDE' && e.dados.kind !== 'porta') e.dados.aberta = false;
        if (b.dono != null) e.dono = b.dono; if (b.visivel != null) e.visivel = b.visivel; if (b.camada) e.camada = b.camada; if (b.bloqueado != null) e.bloqueado = b.bloqueado;
        if (e.dados.vidaMax === 0) { delete e.dados.vidaMax; delete e.dados.vida; }
        if (Array.isArray(e.dados.marcas) && !e.dados.marcas.length) delete e.dados.marcas;
      }
      else {
        const x0 = e.dados.x, y0 = e.dados.y, x1 = d.x ?? x0, y1 = d.y ?? y0, desl = e.dados.desl || 0;
        /* parede no meio e sem trajeto que a contorne: o servidor de verdade calcula a rota, aqui basta recusar o que cruza */
        const barra = mp.els.filter(w => w.tipo === 'PAREDE' && !(w.dados.kind === 'porta' && w.dados.aberta));
        const cruzaReta = barra.some(w => w.dados.pts.some((q, i) => i && segCruza(w.dados.pts[i - 1], q, [x0, y0], [x1, y1])));
        if (cruzaReta && !(b.trajeto || []).length) { envia(res, 409, { erro: 'Há uma parede no caminho: não há por onde passar até lá.', codigo: 'parede' }); return true; }
        if (desl > 0 && (x0 !== x1 || y0 !== y1)) {
          const custo = casasEntre(mp, { x: x0, y: y0 }, { x: x1, y: y1 }) * mp.grid.escala, usado = e.dados.usado || 0;
          passou = custo > desl - usado + 1e-6;
          if (passou && mp.regras.limite === 'bloqueio') { envia(res, 409, { erro: 'Esse movimento custa ' + custo + ' ' + mp.grid.unidade + ' e restam ' + (desl - usado) + ' neste turno.', codigo: 'limite-de-movimento' }); return true; }
          e.dados.usado = usado + custo;
        }
        e.dados.x = x1; e.dados.y = y1;
        /* como o servidor: com a nevoa ligada, quem esta olhando recebe so o aviso e pede o que ve agora */
        if (fogDe(mp) !== 'nenhum') setTimeout(() => sseEnvia(cid, { tipo: 'vista', seq: mp.seq, mapa: mp.id }), 50);
      }
      mp.seq++; registra(mp, 'mudar', e, antes);
      envia(res, 200, { ...elJson(mp, e, mestre), ...(passou ? { passou: true } : {}) }); return true;
    }
    if (M === 'DELETE' && mestre && trancado(mp, e)) { envia(res, 409, { erro: 'Está trancado: destranque para mexer.' }); return true; }
    if (M === 'DELETE' && mestre) { mp.els = mp.els.filter(x => x !== e); mp.seq++; registra(mp, 'remover', e, e); envia(res, 200, { seq: mp.seq }); return true; }
  }
  envia(res, 403, { erro: 'sem permissão', codigo: 'proibido' }); return true;
}
const segCruza = (a, b, c, d) => { const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0; };
/* so no teste: o "outro jogador" mexe no token do guarda, como faria pelo servidor de verdade */
function moveDeOutro(cid) {
  const mp = (MAPAS[cid] || []).find(x => x.ativo); if (!mp) return null;
  const e = mp.els.find(x => x.id === 302); e.dados.x += 70; mp.seq++;
  sseEnvia(cid, { tipo: 'elemento', seq: mp.seq, mapa: mp.id, el: elJson(mp, e, mestreEm(cid)) });
  return e.dados.x;
}
http.createServer(async (req, res) => {
  const p = req.url.split('?')[0], M = req.method;
  let m;
  try {
    if (M === 'GET') {
      if (p === '/api/ping') return envia(res, 200, { ok: true, csrf: 't0', registroAberto: true });
      if (p === '/api/sessao') return envia(res, 200, { ...ST.perfil, campanhas: CAMPS });
      if (p === '/api/campanhas') return envia(res, 200, CAMPS);
      /* um modelo de campanha cadastrado pela administracao, com capa */
      if (p === '/api/modelos') return envia(res, 200, [{ id: 'modeloteste1', nome: 'Modelo de teste', sistema: 'd20 genérico',
        descricao: 'Uma campanha pronta para experimentar.', temCapa: true, tamanho: 4096, criadoEm: Date.now() }]);
      if (p === '/api/modelos/modeloteste1/capa') return envia(res, 200, IMGS['pc-2.png'], 'image/png');
      if (p === '/__ultmodelo') return envia(res, 200, ST.ultModelo || {});
      if ((m = p.match(/^\/api\/c\/(\d+)\/rolagens$/))) {
        const desde = Number(new URL(req.url, 'http://x').searchParams.get('desde') || 0);
        return envia(res, 200, (ROLAGENS[m[1]] || []).filter(r => r.id > desde));
      }
      if ((m = p.match(/^\/api\/c\/(\d+)\/eventos$/))) {
        if (SEM_SSE) return envia(res, 404, { erro: 'sem SSE agora' });
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        const cid = m[1]; (AVISOS_SSE[cid] ||= new Set()).add(res);
        req.on('close', () => AVISOS_SSE[cid].delete(res));
        res.write('event: campanha\ndata: ' + JSON.stringify({ tipo: 'ola' }) + '\n\n');
        return;
      }
      if (rotaMapa(M, p, {}, req, res)) return;
      if ((m = p.match(/^\/api\/c\/(\d+)\/fichas$/))) return envia(res, 200, FICHAS[m[1]] || []);
      if (p === '/api/zerar') { zera(); return envia(res, 200, { ok: true }); }
      if ((m = p.match(/^\/api\/c\/(\d+)\/(guia|mesa)$/))) {
        const d = (ST[m[2]][m[1]]) || ST[m[2]][2];
        return envia(res, 200, d);
      }
      if ((m = p.match(/^\/api\/c\/(\d+)\/mesa\/versao$/))) return envia(res, 200, { versao: (ST.mesa[m[1]] || ST.mesa[2]).versao });
      if ((m = p.match(/^\/api\/c\/(\d+)\/midia$/))) return envia(res, 200, catalogo(m[1]));
      if (/^\/api\/c\/\d+\/indice$/.test(p)) return envia(res, 200, { docs: [], pages: [] });
      if (/^\/api\/c\/\d+\/mural$/.test(p)) return envia(res, 200, ST.mural);
      if (/^\/api\/c\/\d+\/notas$/.test(p)) return envia(res, 200, { texto: ST.notas });
      if (/^\/api\/campanhas\/\d+\/membros$/.test(p)) return envia(res, 200, ST.membros);
      if (/^\/api\/campanhas\/\d+\/convites$/.test(p)) return envia(res, 200, ST.convites);
      if (p === '/api/admin/config') return envia(res, 200, { iaConfigurada: true, iaModelo: '', registroAberto: true,
        emailProvedor: 'smtp', smtpHost: 'smtp.exemplo.com', smtpPorta: '587', smtpSenhaSalva: true, emailChaveSalva: false, emailConfigurado: true });
      if (p === '/__ultconfig') return envia(res, 200, ST.ultConfig || {});
      if (p === '/api/admin/sistema') return envia(res, 200, {
        armazenamento: { links: true, livre: 8e9, total: 10e9, usado: 1.5e9, economizado: 3.2e8, compartilhados: 4,
          porCampanha: [{ id: 1, nome: 'Campanha de teste', arquivos: 12, bytes: 9e8, compartilhados: 2 }, { id: 2, nome: 'Mesa em branco', arquivos: 3, bytes: 4e8, compartilhados: 2 }] },
        sistema: { banco: 'H2 2.2.224', midiaDir: '/data/midia', java: '21.0.5', memoriaUsada: 2e8, memoriaMax: 5.12e8, noArDesde: Date.now() - 90000000,
          contas: 3, campanhas: 3, suporteNaoEnviado: ST.suporte.length } });
      if (p === '/api/admin/suporte') return envia(res, 200, ST.suporte.map((x, i) => ({ id: i + 1, autor: 'Mestre de teste (mestre)', ...x, enviado: false, em: Date.now() })));
      if (p === '/api/admin/usuarios' || p === '/api/admin/campanhas') return envia(res, 200, []);
      if (p.startsWith('/api/')) return envia(res, 200, {});
      if (/^\/midia\/c\d+\/pdf\/.+\.pdf$/.test(p)) return envia(res, 200, PDF3, 'application/pdf');
      if (p === '/__ficha.pdf') return envia(res, 200, PDF_FICHA, 'application/pdf');
      if (p === '/__ficha-imagem.pdf') return envia(res, 200, PDF_IMAGEM, 'application/pdf');
      if (p === '/__ultimport') return envia(res, 200, ST.ultImport || {});
      if (p === '/__suporte') return envia(res, 200, ST.suporte);
      if ((m = p.match(/^\/midia\/c\d+\/img\/(.+)$/))) {
        const d = IMGS[decodeURIComponent(m[1])];
        return d ? envia(res, 200, d, 'image/png') : envia(res, 404, 'nao achei', 'text/plain');
      }
      const f = join(RAIZ, p === '/' || p === '' ? 'index.html' : decodeURIComponent(p).replace(/^\/+/, ''));
      if (f.startsWith(RAIZ) && existsSync(f) && statSync(f).isFile())
        return envia(res, 200, readFileSync(f), TIPOS[extname(f)] || 'application/octet-stream');
      return envia(res, 404, 'nao achei', 'text/plain');
    }
    const bruto = await lerCorpo(req), b = json(bruto);
    if (p === '/__csrf') { ST.csrf = { falha: true, repetiu: 0 }; return envia(res, 200, { ok: true }); }
    if (p === '/__csrf-estado') return envia(res, 200, ST.csrf || {});
    /* recusa por CSRF simulada, uma vez: a tela tem de pedir token novo e repetir */
    if (ST.csrf && p.startsWith('/api/')) {
      if (ST.csrf.falha) { ST.csrf.falha = false; return envia(res, 403, { erro: 'a sessao de seguranca expirou, tente de novo', codigo: 'csrf' }); }
      ST.csrf.repetiu++;
    }
    if (rotaMapa(M, p, b, req, res)) return;
    if ((m = p.match(/^\/__mapa-move-outro\/(\d+)$/))) return envia(res, 200, { x: moveDeOutro(m[1]) });
    /* so no teste: uma parede entre a heroina e o guarda, nevoa pela visao e deslocamento sem limite */
    if ((m = p.match(/^\/__mapa-paredes\/(\d+)$/))) {
      const mp = (MAPAS[m[1]] || []).find(x => x.ativo), t = mp.els.find(x => x.id === 301), g = mp.els.find(x => x.id === 302);
      t.dados.desl = 0; mp.regras.limite = 'aviso'; g.dados.x = t.dados.x + 210; g.dados.y = t.dados.y;
      mp.els.push({ id: ++MAPA_SEQ, tipo: 'PAREDE', camada: 'cenario', dono: 0, visivel: true, bloqueado: false, ordem: mp.els.length,
        dados: { kind: 'parede', aberta: false, pts: [[t.dados.x + 105, t.dados.y - 210], [t.dados.x + 105, t.dados.y + 210]] } });
      mp.regras.fog = 'visao'; mp.seq++; return envia(res, 200, { ok: true });
    }
    /* so no teste: o token da jogadora ganha 3 m de deslocamento por turno e o mapa passa a avisar ou a bloquear */
    if ((m = p.match(/^\/__mapa-desl\/(\d+)\/(aviso|bloqueio)$/))) { const mp = (MAPAS[m[1]] || []).find(x => x.ativo), e = mp.els.find(x => x.id === 301); e.dados.desl = 3; e.dados.usado = 0; mp.regras.limite = m[2]; mp.hist = []; mp.seq++; return envia(res, 200, { ok: true }); }
    if ((m = p.match(/^\/__sse\/(\d)$/))) { SEM_SSE = m[1] === '0'; return envia(res, 200, { ok: true }); }
    if (M === 'PUT') {
      if (p === '/api/admin/config') { ST.ultConfig = b; return envia(res, 200, { ok: true }); }
      if ((m = p.match(/^\/api\/c\/(\d+)\/fichas\/(\d+)$/))) {
        const f = (FICHAS[m[1]] || []).find(x => x.id === Number(m[2])); if (!f) return envia(res, 404, {});
        f.nome = b.nome || f.nome; f.json = b.json || f.json;
        /* como o servidor: o alcance da ficha vai para a copia dos tokens ligados a ela */
        let v; try { v = JSON.parse(f.json).visao; } catch { v = null; }
        for (const mp of MAPAS[m[1]] || []) for (const e of mp.els) {
          if (e.tipo !== 'TOKEN' || e.dados.fichaId !== f.id || !e.dados.vinculo) continue;
          if (v == null || v === '') delete e.dados.visaoFicha; else e.dados.visaoFicha = Number(v);
          mp.seq++;
        }
        return envia(res, 200, { ok: true });
      }
      if ((m = p.match(/^\/api\/c\/(\d+)\/(guia|mesa)$/))) {
        const d = ST[m[2]][m[1]] || (ST[m[2]][m[1]] = { json: '{}', versao: 0 });
        d.json = b.json || '{}'; d.versao += 1;
        if (m[2] === 'mesa') avisa(m[1], { tipo: 'mesa', versao: d.versao });
        return envia(res, 200, { versao: d.versao });
      }
      if ((m = p.match(/^\/api\/c\/\d+\/midia\/(\d+)$/))) {
        const d = ST.docs.find(x => x.id === Number(m[1])), fx = ST.faixas.find(x => x.id === Number(m[1]));
        if (d) { if (b.publico != null) d.publico = !!b.publico; if (b.nome) d.nome = b.nome; }
        if (fx) { if (b.categoria) fx.cat = b.categoria; if (b.nome) fx.nome = b.nome; }
        return envia(res, 200, { ok: true });
      }
      if (/^\/api\/c\/\d+\/notas$/.test(p)) { ST.notas = b.texto || ''; return envia(res, 200, { ok: true }); }
      if (p === '/api/perfil') {
        if (b.senhaNova && b.senhaAtual !== ST.senha) return envia(res, 403, { erro: 'a senha atual nao confere' });
        if (b.nome) ST.perfil.nome = b.nome;
        if (b.senhaNova) ST.senha = b.senhaNova;
        return envia(res, 200, { ...ST.perfil, senhaTrocada: !!b.senhaNova });
      }
      if ((m = p.match(/^\/api\/campanhas\/(\d+)$/))) {
        const c = CAMPS.find(x => x.id === Number(m[1])); if (c) { c.nome = b.nome || c.nome; c.sistema = b.sistema ?? c.sistema; if (b.capa != null) c.capa = b.capa; if (b.rolagensAbertas != null) c.rolagensAbertas = b.rolagensAbertas; }
        return envia(res, 200, { ok: true });
      }
      return envia(res, 200, {});
    }
    if (M === 'POST') {
      /* volume cheio simulado: vem antes das rotas de envio, como o 507 do servidor de verdade */
      if (ST.cheio && /^\/api\/c\/\d+\/midia\/(img|pdf|audio)$/.test(p))
        return envia(res, 507, { erro: 'o armazenamento está cheio', codigo: 'armazenamento-cheio' });
      if (/^\/api\/c\/\d+\/midia\/img$/.test(p)) {
        const nome = 'enviada-no-teste.png';
        IMGS[nome] ??= png(20, 160, 90);
        if (!ST.imgs.includes(nome)) ST.imgs.push(nome);
        return envia(res, 200, { id: 999, nome, arquivo: 'img/' + nome });
      }
      if (/^\/api\/c\/\d+\/midia\/\d+\/reindexar$/.test(p)) return envia(res, 200, { paginas: 120, comCapitulo: 80 });
      /* aceitar convite: a pessoa entra na campanha 2 */
      if (/^\/api\/convites\/[^/]+$/.test(p)) return envia(res, 200, CAMPS.find(c => c.id === 2));
      if ((m = p.match(/^\/api\/c\/(\d+)\/modelo\/([a-z0-9]+)$/))) {
        ST.ultModelo = { cid: Number(m[1]), id: m[2] };
        return envia(res, 200, { nome: 'Modelo de teste', indices: 0, imagens: 3, pdfs: 1, faixas: 2, guia: true, mesa: true, fichas: 0 });
      }
      if ((m = p.match(/^\/api\/c\/(\d+)\/rolagens$/))) {
        const c = CAMPS.find(x => x.id === Number(m[1])), mestre = c.papel === 'MESTRE';
        const s = rolaStub(b.formula || ('1d' + b.lados));
        if (!s) return envia(res, 400, { erro: 'nao entendi a rolagem' });
        const r = { id: ++ST.seq, autor: ST.perfil.nome, minha: true, mestre, ...s, rotulo: b.rotulo || '',
          publica: mestre ? b.publica !== false : c.rolagensAbertas !== false, pedido: false, pedidoId: b.pedidoId || null, em: Date.now() };
        (ROLAGENS[m[1]] ||= []).unshift(r);
        avisa(m[1], { tipo: 'rolagem' });
        return envia(res, 200, r);
      }
      if ((m = p.match(/^\/api\/c\/(\d+)\/rolagens\/pedido$/))) {
        const s = rolaStub(b.formula); if (!s) return envia(res, 400, { erro: 'nao entendi a rolagem' });
        const r = { id: ++ST.seq, autor: ST.perfil.nome, minha: true, mestre: true, formula: s.formula, detalhe: '', valor: 0, lados: s.lados,
          extremo: 0, rotulo: b.rotulo || '', publica: true, pedido: true, pedidoId: null, em: Date.now() };
        (ROLAGENS[m[1]] ||= []).unshift(r);
        avisa(m[1], { tipo: 'rolagem' });
        return envia(res, 200, r);
      }
      if ((m = p.match(/^\/__rolagem-de-outro\/(\d+)$/))) {
        const r = { id: ++ST.seq, autor: 'Jogadora', minha: false, mestre: false, formula: '1d20', detalhe: '[13]', lados: 20, valor: 13,
          extremo: 0, rotulo: '', publica: true, pedido: false, pedidoId: null, em: Date.now() };
        (ROLAGENS[m[1]] ||= []).unshift(r);
        avisa(m[1], { tipo: 'rolagem' });
        return envia(res, 200, r);
      }
      if ((m = p.match(/^\/__pedido-de-outro\/(\d+)$/))) {
        const r = { id: ++ST.seq, autor: 'Mestre de teste', minha: false, mestre: true, formula: '1d20', detalhe: '', lados: 20, valor: 0,
          extremo: 0, rotulo: 'Percepcao', publica: true, pedido: true, pedidoId: null, em: Date.now() };
        (ROLAGENS[m[1]] ||= []).unshift(r);
        avisa(m[1], { tipo: 'rolagem' });
        return envia(res, 200, r);
      }
      if ((m = p.match(/^\/api\/c\/(\d+)\/fichas$/))) {
        const f = { id: ++ST.seq, nome: b.nome || 'Sem nome', dono: ST.perfil.nome, minha: true, json: b.json || '{}', em: Date.now() };
        (FICHAS[m[1]] ||= []).push(f);
        return envia(res, 200, f);
      }
      if (/^\/api\/c\/\d+\/fichas\/importar$/.test(p)) {
        if (!ST.perfil.iaConfigurada) return envia(res, 503, { erro: 'sem IA nesta instancia' });
        ST.ultImport = { imagens: (b.imagens || []).length, tam: ((b.imagens || [])[0] || '').length, texto: (b.texto || '').length };
        return envia(res, 200, { nome: 'Da imagem', campos: [{ sec: 'Atributos', rot: 'AGI', tipo: 'num', val: '' }, { sec: 'Atributos', rot: 'FOR', tipo: 'num', val: '' },
          { sec: 'Recursos', rot: 'PV', tipo: 'barra', val: '', max: '' }] });
      }
      if ((m = p.match(/^\/__ia\/(\d)$/))) { ST.perfil.iaConfigurada = m[1] === '1'; return envia(res, 200, { ok: true }); }
      if (p === '/api/suporte') {
        ST.suporte.push(b);
        return envia(res, 200, { id: ST.suporte.length, enviado: false, motivo: 'o envio de e-mail não está configurado nesta instância' });
      }
      if ((m = p.match(/^\/__cheio\/(\d)$/))) { ST.cheio = m[1] === '1'; return envia(res, 200, { ok: true }); }
      if (p === '/api/admin/armazenamento/juntar') return envia(res, 200, { liberado: 0 });
      if (/^\/api\/c\/\d+\/mural$/.test(p)) {
        ST.mural.unshift({ id: ++ST.seq, usuarioId: 1, autor: ST.perfil.nome, em: new Date().toISOString(), texto: b.texto || '' });
        return envia(res, 200, { ok: true });
      }
      if (/^\/api\/campanhas\/\d+\/convites$/.test(p)) {
        ST.convites.push({ id: ++ST.seq, token: 'tok' + ST.seq, rotulo: b.rotulo || '', papel: b.papel || 'JOGADOR', usos: 0, usosMax: b.usos || 1, valido: true });
        return envia(res, 200, { ok: true });
      }
      return envia(res, 200, {});
    }
    if (M === 'DELETE') {
      if ((m = p.match(/^\/api\/c\/(\d+)\/fichas\/(\d+)$/))) {
        FICHAS[m[1]] = (FICHAS[m[1]] || []).filter(x => x.id !== Number(m[2]));
        res.writeHead(204, { 'Set-Cookie': 'XSRF-TOKEN=t0; Path=/' }); return res.end();
      }
      if ((m = p.match(/^\/api\/c\/\d+\/midia\/(\d+)$/))) {
        const id = Number(m[1]);
        ST.docs = ST.docs.filter(x => x.id !== id); ST.faixas = ST.faixas.filter(x => x.id !== id);
        if (id <= ST.imgs.length) ST.imgs.splice(id - 1, 1);
      }
      res.writeHead(204, { 'Set-Cookie': 'XSRF-TOKEN=t0; Path=/' }); return res.end();
    }
    envia(res, 405, 'metodo', 'text/plain');
  } catch (e) { envia(res, 500, { erro: String(e && e.message || e) }); }
}).listen(PORTA, '127.0.0.1', () => {
  if (!existsSync(RAIZ)) { console.error('nao achei o static em ' + RAIZ); process.exit(1); }
  console.log(`stub em http://127.0.0.1:${PORTA}  (static de ${RAIZ})`);
});
