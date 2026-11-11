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

function campanhaAntiga() {
  const corpo = (n, nome) => ({
    pc: `img/pc-${n}.png`, mask: `img/pc-${n}-hover.png`, assassino: nome, alcunha: 'ALCUNHA ' + n, agente: '',
    agenteNota: 'a definir', termos: 'um, dois, tres', dificuldade: 'média', as: '', fichas: ['img/ficha-1.png'],
  });
  return {
    titulo: 'Campanha de teste', sistema: 'Sistema de teste', verdadeIntro: 'Parágrafo de abertura.',
    corposTitulo: 'Personagens dos jogadores',
    corpos: [corpo(1, 'Primeiro'), corpo(2, 'Segundo'), corpo(3, 'Terceiro')],
    sacrificio: 'Nota de rodapé dos personagens.',
    preSessao: { titulo: 'Antes da primeira sessão', intro: 'Intro.', textoAbertura: 'Leia em voz alta.',
      perguntasTitulo: 'Perguntas para a mesa', metodoTitulo: 'Como usar as respostas',
      perguntas: ['Pergunta um?', 'Pergunta dois?'], metodo: ['Passo um.', 'Passo dois.'] },
    adaptacao: { titulo: 'O que é cânone', itens: ['Item um.', 'Item dois.'] },
    episodiosTitulo: 'Mapa das sessões',
    episodios: [{ n: 1, nome: 'Começo', resumo: 'A primeira.' }, { n: 2, nome: 'Meio', resumo: 'A segunda.' }],
    conceitoTitulo: 'O conceito', conceitoTexto: 'Do que a campanha trata.',
    regrasDeOuroTitulo: 'Regras de ouro', regrasDeOuro: ['Regra um.', 'Regra dois.'],
    metodo: [{ t: 'Cartão um', d: 'Explicação um.' }], metodoNota: 'Como conduzir.',
    indiceTitulo: 'Índice dos livros', indiceAS: [], vocab: {}, referencia: [], sinonimos: {}, canonicas: {},
  };
}
function sessaoAntiga() {
  return {
    id: 's1', numero: 1, titulo: 'Começo', status: 'planejada', resumo: '',
    territorios: [{ id: 't1', nome: 'ABERTURA', cor: '#c2458a' }, { id: 't2', nome: 'CIDADE', cor: '#c9a227' }],
    prep: { terPronto: ['Mapa impresso'], mecanicas: [] }, eventosFixos: { intro: '', lista: ['Meia-noite: o sino toca'] },
    npcs: [{ nome: 'Dona Marta', img: 'img/npc-1.png', desc: 'Dona da pensão.', segredo: 'Sabe de tudo.' }],
    locais: [{ nome: 'Pensão', desc: 'Três andares, cheiro de mofo.' }],
    handouts: [{ nome: 'Bilhete rasgado', img: 'img/pista-1.png', texto: 'Não confie em M.' }],
    plantado: 'O bilhete aponta para a Marta.',
    cenas: [
      { id: 'c1', n: 'Cena 1', titulo: 'Chegada', territorio: 't1', feito: false, forcado: true, blocos: [
        { tipo: 'leitura', rotulo: 'CINEMÁTICA', nota: '', texto: 'A chuva não para.\nNinguém na rua.' },
        { tipo: 'avancar', rotulo: 'PARA AVANÇAR', itens: [{ t: 'Alguém bate na porta', tipo: 'forcado', sub: ['duas vezes'] }] },
        { tipo: 'testes', rotulo: 'TESTES', itens: [{ p: 'Percepção', t: 'Notar o bilhete', f: ['10 · vê o papel', '15 · lê o nome'] }] },
        { tipo: 'trilha', rotulo: 'TRILHA', itens: [{ sit: 'CHEGADA', faixa: 'Chuva', cat: 'Ambiente' }] },
      ] },
      { id: 'c2', n: 'Cena 2', titulo: 'A pensão', territorio: 't2', feito: false, blocos: [
        { tipo: 'quem', rotulo: 'QUEM ESTÁ LÁ', itens: [{ t: 'Dona Marta: atrás do balcão', motiva: 'esconder o hóspede', img: 'img/npc-1.png' }] },
      ] },
    ],
  };
}

const CAMPS = [
  { id: 1, nome: 'Campanha de teste', sistema: 'Sistema de teste', papel: 'MESTRE', arquivada: false },
  { id: 2, nome: 'Mesa em branco', sistema: '', papel: 'MESTRE', arquivada: false },
  { id: 3, nome: 'Onde eu jogo', sistema: 'Outro sistema', papel: 'JOGADOR', arquivada: false },
];
let ST = {};
function zera() {
  const mesaVazia = () => ({ json: JSON.stringify({ resumos: [], ev: [], npcs: [], locais: [], at: 0 }), versao: 1 });
  ST = {
    guia: {
      1: { json: JSON.stringify({ versao: 2, campanha: campanhaAntiga(), sessoes: [sessaoAntiga()], trilhaCategorias: [], galeria: [] }), versao: 1 },
      2: { json: JSON.stringify({ campanha: { titulo: '', sistema: '' }, sessoes: [] }), versao: 1 },
    },
    mesa: {
      1: mesaVazia(), 2: mesaVazia(),
      3: { json: JSON.stringify({ titulo: 'Onde eu jogo', resumos: [{ n: 1, titulo: 'O começo', data: '01/01/2026', texto: 'Aconteceu muita coisa.' }],
        ev: [], npcs: [{ id: 'n9', nome: 'Liberado', img: 'img/npc-1.png', desc: 'Um rosto conhecido.' }], locais: [], at: 1 }), versao: 1 },
    },
    perfil: { id: 1, login: 'mestre', nome: 'Mestre de teste', admin: true, iaConfigurada: false },
    senha: 'segredo123',
    imgs: Object.keys(IMGS).sort(),
    docs: [{ id: 50, abrev: 'LB', nome: 'Livro de regras', paginas: 120, tamanho: 1048576, publico: false }],
    faixas: [{ id: 60, chave: 'chuva', nome: 'Chuva', cat: 'Ambiente', tamanho: 2097152 },
             { id: 61, chave: 'luta', nome: 'Luta', cat: 'Combate', tamanho: 3145728 }],
    membros: [{ usuarioId: 1, nome: 'Mestre de teste', login: 'mestre', papel: 'MESTRE', dono: true },
              { usuarioId: 2, nome: 'Jogadora', login: 'jogadora', papel: 'JOGADOR', dono: false }],
    convites: [], mural: [], notas: '', seq: 100,
  };
}
zera();

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
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
      if (p === '/api/admin/config') return envia(res, 200, { iaConfigurada: false, iaModelo: '', registroAberto: true });
      if (p === '/api/admin/usuarios' || p === '/api/admin/campanhas') return envia(res, 200, []);
      if (p.startsWith('/api/')) return envia(res, 200, {});
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
    if (M === 'PUT') {
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
        const c = CAMPS.find(x => x.id === Number(m[1])); if (c) { c.nome = b.nome || c.nome; c.sistema = b.sistema ?? c.sistema; }
        return envia(res, 200, { ok: true });
      }
      return envia(res, 200, {});
    }
    if (M === 'POST') {
      if (/^\/api\/c\/\d+\/midia\/img$/.test(p)) {
        const nome = 'enviada-no-teste.png';
        IMGS[nome] ??= png(20, 160, 90);
        if (!ST.imgs.includes(nome)) ST.imgs.push(nome);
        return envia(res, 200, { id: 999, nome, arquivo: 'img/' + nome });
      }
      if (/^\/api\/c\/\d+\/midia\/\d+\/reindexar$/.test(p)) return envia(res, 200, { paginas: 120, comCapitulo: 80 });
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
