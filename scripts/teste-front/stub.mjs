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
  { id: 1, nome: 'Campanha de teste', sistema: 'Sistema de teste', papel: 'MESTRE', arquivada: false, rolagensAbertas: true },
  { id: 2, nome: 'Mesa em branco', sistema: '', papel: 'MESTRE', arquivada: false },
  { id: 3, nome: 'Onde eu jogo', sistema: 'Outro sistema', papel: 'JOGADOR', arquivada: false },
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
  ROLAGENS = {}; FICHAS = {};
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

http.createServer(async (req, res) => {
  const p = req.url.split('?')[0], M = req.method;
  let m;
  try {
    if (M === 'GET') {
      if (p === '/api/ping') return envia(res, 200, { ok: true, csrf: 't0', registroAberto: true });
      if (p === '/api/sessao') return envia(res, 200, { ...ST.perfil, campanhas: CAMPS });
      if (p === '/api/campanhas') return envia(res, 200, CAMPS);
      if ((m = p.match(/^\/api\/c\/(\d+)\/rolagens$/))) {
        const desde = Number(new URL(req.url, 'http://x').searchParams.get('desde') || 0);
        return envia(res, 200, (ROLAGENS[m[1]] || []).filter(r => r.id > desde));
      }
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
    if (M === 'PUT') {
      if (p === '/api/admin/config') { ST.ultConfig = b; return envia(res, 200, { ok: true }); }
      if ((m = p.match(/^\/api\/c\/(\d+)\/fichas\/(\d+)$/))) {
        const f = (FICHAS[m[1]] || []).find(x => x.id === Number(m[2])); if (!f) return envia(res, 404, {});
        f.nome = b.nome || f.nome; f.json = b.json || f.json;
        return envia(res, 200, { ok: true });
      }
      if ((m = p.match(/^\/api\/c\/(\d+)\/(guia|mesa)$/))) {
        const d = ST[m[2]][m[1]] || (ST[m[2]][m[1]] = { json: '{}', versao: 0 });
        d.json = b.json || '{}'; d.versao += 1;
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
      if ((m = p.match(/^\/api\/c\/(\d+)\/rolagens$/))) {
        const c = CAMPS.find(x => x.id === Number(m[1])), mestre = c.papel === 'MESTRE';
        const s = rolaStub(b.formula || ('1d' + b.lados));
        if (!s) return envia(res, 400, { erro: 'nao entendi a rolagem' });
        const r = { id: ++ST.seq, autor: ST.perfil.nome, minha: true, mestre, ...s, rotulo: b.rotulo || '',
          publica: mestre ? b.publica !== false : c.rolagensAbertas !== false, pedido: false, pedidoId: b.pedidoId || null, em: Date.now() };
        (ROLAGENS[m[1]] ||= []).unshift(r);
        return envia(res, 200, r);
      }
      if ((m = p.match(/^\/api\/c\/(\d+)\/rolagens\/pedido$/))) {
        const s = rolaStub(b.formula); if (!s) return envia(res, 400, { erro: 'nao entendi a rolagem' });
        const r = { id: ++ST.seq, autor: ST.perfil.nome, minha: true, mestre: true, formula: s.formula, detalhe: '', valor: 0, lados: s.lados,
          extremo: 0, rotulo: b.rotulo || '', publica: true, pedido: true, pedidoId: null, em: Date.now() };
        (ROLAGENS[m[1]] ||= []).unshift(r);
        return envia(res, 200, r);
      }
      if ((m = p.match(/^\/__rolagem-de-outro\/(\d+)$/))) {
        const r = { id: ++ST.seq, autor: 'Jogadora', minha: false, mestre: false, formula: '1d20', detalhe: '[13]', lados: 20, valor: 13,
          extremo: 0, rotulo: '', publica: true, pedido: false, pedidoId: null, em: Date.now() };
        (ROLAGENS[m[1]] ||= []).unshift(r);
        return envia(res, 200, r);
      }
      if ((m = p.match(/^\/__pedido-de-outro\/(\d+)$/))) {
        const r = { id: ++ST.seq, autor: 'Mestre de teste', minha: false, mestre: true, formula: '1d20', detalhe: '', lados: 20, valor: 0,
          extremo: 0, rotulo: 'Percepcao', publica: true, pedido: true, pedidoId: null, em: Date.now() };
        (ROLAGENS[m[1]] ||= []).unshift(r);
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
