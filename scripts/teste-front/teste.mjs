/**
 * Exercita a tela de verdade contra o stub, num navegador.
 *
 *   node stub.mjs &            # ou --porta 9000
 *   node teste.mjs             # BASE=http://127.0.0.1:9000 node teste.mjs
 *
 * Usa o Edge ou o Chrome que ja estiver na maquina (NAVEGADOR=caminho escolhe um).
 * FOTOS=pasta grava uma captura de cada tela, para olhar o layout.
 *
 * Falha com codigo 1 se alguma checagem nao passar ou se o navegador registrar
 * erro de pagina. "O JS parseia" nao e teste: so rodando pega funcao que nao
 * existe, seletor que mudou, e imagem que nao carrega.
 */
import { chromium } from 'playwright-core';
import { existsSync, readdirSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const AQUI = dirname(fileURLToPath(import.meta.url));

const B = process.env.BASE || 'http://127.0.0.1:8099';
const FOTOS = process.env.FOTOS || '';
if (FOTOS) mkdirSync(FOTOS, { recursive: true });

function acharNavegador() {
  if (process.env.NAVEGADOR) return process.env.NAVEGADOR;
  const pf = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean);
  const fixos = [];
  for (const d of pf) fixos.push(join(d, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    join(d, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  fixos.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
  for (const f of fixos) if (existsSync(f)) return f;
  // algumas instalacoes do Windows so tem o Edge em EdgeCore/<versao>/
  for (const d of pf) {
    const base = join(d, 'Microsoft', 'EdgeCore');
    if (!existsSync(base)) continue;
    for (const v of readdirSync(base).sort().reverse()) {
      const f = join(base, v, 'msedge.exe'); if (existsSync(f)) return f;
    }
  }
  return null;
}
const exe = acharNavegador();
if (!exe) { console.error('Nao achei Edge nem Chrome. Aponte um com NAVEGADOR=caminho.'); process.exit(2); }

const erros = [], falhas = [];
const ok = (c, msg) => { if (!c) falhas.push(msg); console.log((c ? '  ok  ' : '  XX  ') + msg); };
const titulo = t => console.log('\n=== ' + t + ' ===');

const nav = await chromium.launch({ executablePath: exe });
// LARGURA/ALTURA trocam o tamanho da janela: o layout cresce com a tela, entao vale olhar em ultrawide
const ctx = await nav.newContext({ viewport: { width: +process.env.LARGURA || 1366, height: +process.env.ALTURA || 900 } });
const pg = await ctx.newPage();
pg.on('pageerror', e => erros.push('pageerror: ' + e.message));
pg.on('console', m => {
  // o 403 do teste de senha errada e o 507 do armazenamento cheio sao esperados
  // o 409 do bloqueio de movimento do mapa tambem e esperado
  // o 404 dos dois SSE (mapa e aviso da campanha) e esperado quando o teste desliga o tempo real (/__sse/0)
  if (m.type() === 'error' && !/403|507|409/.test(m.text()) && !/\/(mapas\/)?eventos$/.test(m.location()?.url || '') && !/EventSource/.test(m.text())) erros.push('console: ' + m.text());
});
pg.on('dialog', d => d.accept());
const espera = ms => pg.waitForTimeout(ms);
/* reordenar arrastando (js/ordenar.js): pega pela alca e solta antes ou depois do alvo */
async function arrastar(alca, alvo, lado = 'antes') {
  const a = await alca.boundingBox(), b = await alvo.boundingBox();
  await pg.mouse.move(a.x + Math.min(30, a.width / 2), a.y + a.height / 2);
  await pg.mouse.down();
  await pg.mouse.move(a.x + 40, a.y + a.height / 2 + 12, { steps: 3 });
  await pg.mouse.move(b.x + b.width / 2, lado === 'antes' ? b.y + 4 : b.y + b.height - 4, { steps: 8 });
  await pg.mouse.up();
  await espera(350);
}
/* DOM=pasta grava, junto de cada foto, um retrato da estrutura da pagina (elementos, classes,
   atributos e texto). Comparar dois retratos acusa mudanca de HTML que nenhum teste percebe. */
const DOM = process.env.DOM || '';
if (DOM) mkdirSync(DOM, { recursive: true });
const retrato = () => pg.evaluate(() => {
  const fora = new Set(['TEMPLATE', 'SCRIPT', 'STYLE']), linhas = [];
  const volatil = /^(data-(id|eled|elver|ellib|ses|ficha|resp|ini|mres|mresd|mdel|lib|pick|cenaid)|id|style|aria-pressed|title)$/;
  (function anda(n, p) {
    if (n.nodeType === 3) { const t = n.data.replace(/\s+/g, ' ').trim(); if (t) linhas.push(p + '"' + t.slice(0, 80) + '"'); return; }
    if (n.nodeType !== 1 || fora.has(n.tagName) || n.id === 'templates' || n.classList.contains('atmo') || n.classList.contains('toast')) return;
    const at = [...n.attributes].filter(a => a.name !== 'class').map(a => volatil.test(a.name) ? a.name : a.name + '=' + a.value.slice(0, 60)).sort();
    linhas.push(p + n.tagName.toLowerCase() + ([...n.classList].sort().map(c => '.' + c).join('')) + (at.length ? ' [' + at.join(' ') + ']' : ''));
    for (const c of n.childNodes) anda(c, p + ' ');
  })(document.body, '');
  return linhas.join('\n');
});
const foto = async n => {
  if (FOTOS) await pg.screenshot({ path: join(FOTOS, n + '.png'), fullPage: false });
  if (DOM) writeFileSync(join(DOM, n + '.txt'), await retrato());
};
const aba = async rot => { await pg.locator('#tabs .tab', { hasText: rot }).first().click(); await espera(450); };
const guia = async cid => JSON.parse((await (await ctx.request.get(B + '/api/c/' + cid + '/guia')).json()).json);
const mesa = async cid => JSON.parse((await (await ctx.request.get(B + '/api/c/' + cid + '/mesa')).json()).json);
/* anda pelo tour aberto ate o fim; devolve os passos cujo elemento nao apareceu */
const andaTour = async () => {
  const faltas = []; let n = 0, ult = '';
  for (; n < 60; n++) {
    await espera(900);
    if (!(await pg.locator('.tour').count())) break;
    ult = await pg.locator('.tourn').innerText();
    const f = await pg.locator('.tour').getAttribute('data-falta');
    if (f) faltas.push(ult + ': ' + f);
    await pg.locator('.tour [data-t="vai"]').click();
  }
  return { faltas, n, ult };
};
const salvar = async () => { await pg.locator('.ov [data-ok]').last().click(); await espera(500); };
/* tabletop: onde o token esta na tela e o arraste dele no canvas */
const posToken = id => pg.evaluate(i => { const e = MP.els.find(x => String(x.id) === String(i)), v = mpVista(), r = MPC.cv.getBoundingClientRect();
  return { x: r.left + v.x + e.dados.x * v.z, y: r.top + v.y + e.dados.y * v.z, z: v.z, T: mpLado(), dx: e.dados.x, dy: e.dados.y }; }, id);
const arrastaToken = async (id, casas) => {
  const p = await posToken(id);
  await pg.mouse.move(p.x, p.y); await pg.mouse.down();
  await pg.mouse.move(p.x + casas * p.T * p.z, p.y, { steps: 8 }); await pg.mouse.up();
  await espera(700);
  return p;
};
/* as secoes do painel do mapa comecam fechadas: abre a que o teste vai usar */
/* o que se usa menos no mapa mora no menu "Mais" da barra do topo */
const abreMais = async v => { await pg.locator('#mpMais').click(); await espera(250); await pg.locator('.menu [data-v="' + v + '"]').click(); };
const abreSecao = async id => { await pg.evaluate(i => { const d = document.querySelector('details[data-mp-sec="' + i + '"]'); if (d && !d.open) d.open = true; }, id); await espera(150); };
const estadoMapa = async (cid, mid) => (await ctx.request.get(B + '/api/c/' + cid + '/mapas/' + mid)).json();

await ctx.request.get(B + '/api/zerar');
/* com DOM= ligado, o sorteio da pagina vira sempre a mesma sequencia: dois retratos so diferem
   se o HTML mudou, nao porque o d20 caiu em outro numero */
if (DOM) await pg.addInitScript(() => {
  let s = 12345; const prox = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  Math.random = prox;
  crypto.getRandomValues = a => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(prox() * 4294967296); return a; };
});

titulo('campanha de teste abre');
await pg.goto(B + '/#/c/1/campanha', { waitUntil: 'networkidle' });
await espera(1300);
ok(await pg.locator('.tour').isVisible(), 'primeiro acesso do mestre abre o guia inicial');
ok(/guia inicial.* 1 de \d+$/i.test((await pg.locator('.tourn').innerText()).trim()), 'o guia inicial comeca no passo 1, com o nome do guia');
ok(await pg.locator('.tour .tourlogo svg').isVisible(), 'boas-vindas mostram a logo');
await pg.locator('.tour [data-t="vai"]').click();
await espera(700);
await pg.locator('.tour [data-t="vai"]').click();
await espera(900);
ok(/ 3 de/i.test(await pg.locator('.tourn').innerText()) && await pg.locator('.tourfoco').evaluate(f => f.offsetWidth > 20), 'o tour destaca o elemento de cada passo');
await foto('00-tour');
await pg.keyboard.press('ArrowLeft');
await espera(700);
ok(/ 2 de/i.test(await pg.locator('.tourn').innerText()), 'seta para a esquerda volta um passo');
await pg.keyboard.press('/');
await espera(300);
ok((await pg.locator('#bq').count()) === 0, 'atalho da pagina nao passa por baixo do tour');
await pg.locator('.tour [data-t="pula"]').click();
await espera(600);
ok((await pg.locator('.tour').count()) === 0 && await pg.evaluate(() => localStorage.getItem('grim_tour_guia-inicio-m_1')) === '1', 'pular fecha o guia e marca como visto');
await pg.click('#btnAjustes');
await espera(400);
await pg.locator('[data-aj="guias"]').click();
await espera(300);
if (DOM) await foto('r001-aj-guias');
ok((await pg.locator('[data-guia="m-elenco"]').count()) === 1 && (await pg.locator('[data-guia="j-fichas"]').count()) === 1 && (await pg.locator('[data-guia="m-mapa"]').count()) === 1,
  'Configuracoes › Guias lista os guias das abas do mestre e do jogador');
ok(/visto/i.test(await pg.locator('.guiait', { has: pg.locator('[data-guia="inicio-m"]') }).innerText()), 'o guia inicial aparece como visto');
await pg.locator('[data-guia="inicio-m"]').first().click();
const tm = await andaTour();
ok(tm.faltas.length === 0 && tm.n >= 10 && tm.n <= 12, 'o guia inicial do mestre e curto: ' + tm.n + ' passos, todos acham o elemento' + (tm.faltas.length ? ': ' + tm.faltas.join(' | ') : ''));
ok((await pg.locator('.tour').count()) === 0 && await pg.locator('.guialista').first().isVisible(), 'concluir volta para Configuracoes › Guias, de onde saiu');
/* primeira visita a uma aba depois do guia inicial: o guia dela abre sozinho e devolve a pessoa ali */
await aba('Elenco');
await espera(900);
ok(await pg.locator('.tour').isVisible() && /elenco/i.test(await pg.locator('.tourn').innerText()), 'a primeira visita ao Elenco abre o guia do Elenco');
ok(await pg.locator('.tour [data-t="musica"]').getAttribute('aria-pressed') === 'true', 'a musica de fundo nasce ligada');
await pg.locator('.tour [data-t="musica"]').click();
ok(await pg.locator('.tour [data-t="musica"]').getAttribute('aria-pressed') === 'false' && await pg.evaluate(() => localStorage.getItem('grim_guia_musica') === '0' && !MUSICA.no), 'o botao da musica cala e guarda a escolha');
await pg.locator('.tour [data-t="musica"]').click();
const te = await andaTour();
ok(te.faltas.length === 0 && te.n >= 6, 'o guia do Elenco tem ' + te.n + ' passos que acham o elemento' + (te.faltas.length ? ': ' + te.faltas.join(' | ') : ''));
ok(await pg.locator('#elNovo').isVisible() && await pg.evaluate(() => !MUSICA.no), 'o guia termina na aba onde a pessoa estava, e a musica para');
await pg.click('#btnAjustes'); await espera(400); await aba('Elenco');
await espera(900);
ok((await pg.locator('.tour').count()) === 0, 'guia visto nao abre de novo sozinho');
await pg.locator('#view .guiab').click();
await espera(700);
ok(await pg.locator('.tour').isVisible() && /elenco/i.test(await pg.locator('.tourn').innerText()), 'o botao ? ao lado do titulo reabre o guia da aba');
await pg.locator('.tour [data-t="pula"]').click();
await espera(500);
/* o resto do roteiro nao para em guia: todos vistos, menos o inicial do jogador, que o teste ve la na frente */
await pg.evaluate(() => GUIAS_MESTRE.concat(GUIAS_JOGADOR).forEach(id => marcaTourVisto('guia-' + id)));
await aba('Campanha');
ok(await pg.locator('h1.page').first().isVisible(), 'titulo aparece');
const abas = await pg.locator('#tabs .tab').allInnerTexts();
ok(abas.length === 6 && /elenco/i.test(abas.join(' ')) && /biblioteca/i.test(abas.join(' ')) && /mapa/i.test(abas.join(' ')), 'seis abas, com o Mapa: ' + abas.join(' | '));
ok((await pg.locator('#btnEdit, #btnMenu, #editbanner').count()) === 0, 'modo edicao e menu ··· sairam');
ok((await pg.locator('[contenteditable="true"]').count()) === 0, 'nada editavel digitando na pagina');
const txtHome = await pg.locator('#view').innerText();
ok(/Parágrafo de abertura/.test(txtHome), 'apresentacao aparece');
ok(/REGRAS DE OURO/i.test(txtHome) && /Regra um\./.test(txtHome), 'secao de lista aparece');
ok(/Cartão um/.test(txtHome), 'secao de cartoes aparece');
await foto('01-campanha');
let g = await guia(1);
ok(g.versao === 3, 'guia no formato atual');

titulo('mapa do mestre');
await pg.locator('#tabs .tab[data-aba="mapa"]').click();
await espera(900);
ok(/#\/c\/1\/mapa$/.test(pg.url()) && await pg.locator('#mpNovo').isVisible(), 'aba Mapa tem endereco e, sem mapa, oferece criar o primeiro: ' + pg.url());
await pg.locator('#mpNovo').click(); await espera(350);
ok(await pg.locator('.ov .mmgal').isVisible() && (await pg.locator('.ov [data-mm]').count()) === 17, 'criar o primeiro mapa abre a galeria: grade em branco, imagem e os 15 moldes');
await pg.locator('.ov [data-mm="branco"]').click(); await espera(350);
await pg.locator('.ov [data-f="nome"]').fill('Masmorra');
await salvar(); await espera(900);
const mid = await pg.evaluate(() => MP.id);
ok(!!mid && await pg.locator('#mpCanvas').isVisible() && /Masmorra/.test(await pg.locator('h1').first().innerText()), 'criar o mapa abre o canvas com o nome no titulo');
ok(new RegExp('#/c/1/mapa/' + mid + '$').test(pg.url()), 'o endereco leva o id do mapa aberto');
ok(/s[oó] voc[eê] v[eê]/i.test(await pg.locator('.mpbar .chip').innerText()), 'mapa novo nao aparece para os jogadores');
ok(await pg.evaluate(() => mpModoTempoReal()) === 'sse', 'o mapa liga o tempo real por SSE');
await pg.locator('#mpToken').click(); await espera(250);
await pg.locator('.menu [data-v="avulso"]').click(); await espera(350);
await pg.locator('.ov [data-f="nome"]').fill('Goblin');
await salvar(); await espera(700);
ok((await pg.locator('[data-mp-sel]').count()) === 1, 'token avulso entra no mapa e na lista do painel');
const tid = await pg.evaluate(() => MP.els[0].id);
const antes = await arrastaToken(tid, 2);
let em = await estadoMapa(1, mid);
const tk = em.elementos.find(e => e.id === tid);
ok(Math.abs(tk.dados.x - (antes.dx + 140)) < 0.5 && (tk.dados.x - 35) % 70 === 0, 'arrastar o token grava a posicao nova, encaixada na casa: ' + antes.dx + ' -> ' + tk.dados.x);
await pg.locator('#mpEd').click(); await espera(350);
await pg.locator('.ov [data-f="tipo"]').selectOption('hex');
await pg.locator('.ov [data-f="tam"]').fill('80');
await salvar(); await espera(700);
em = await estadoMapa(1, mid);
ok(em.mapa.grid.tipo === 'hex' && em.mapa.grid.tam === 80, 'a grade troca para hexagonal e muda de tamanho pelo formulario');
await pg.locator('#mpAtiva').click(); await espera(600);
ok((await (await ctx.request.get(B + '/api/c/1/mapas')).json()).find(m => m.id === mid).ativo && /veem/i.test(await pg.locator('.mpbar .chip').innerText()), 'mostrar aos jogadores torna o mapa ativo');
await pg.locator('[data-mp-ed="' + tid + '"]').click(); await espera(500);
await pg.locator('.ov [data-f="visivel"]').uncheck();
await salvar(); await espera(600);
em = await estadoMapa(1, mid);
ok(em.elementos.find(e => e.id === tid).visivel === false && (await pg.locator('.mpitem .chip', { hasText: /oculto/i }).count()) === 1, 'esconder o token pelo formulario marca oculto');
await pg.locator('[data-mp-ed="' + tid + '"]').click(); await espera(500);
await pg.locator('.ov [data-del]').click(); await espera(600);
ok((await pg.locator('[data-mp-sel]').count()) === 0, 'remover tira o token sem perguntar');
await pg.locator('.toast.act [data-acao]').click(); await espera(900);
ok((await pg.locator('[data-mp-sel]').count()) === 1, 'e o desfazer devolve o token');
await foto('13-mapa-mestre');

titulo('mapa: regua, deslocamento, desfazer e historico (mestre)');
await pg.locator('#mpEd').click(); await espera(350);
ok((await pg.locator('.ov [data-f="diagonal"]').count()) === 1 && (await pg.locator('.ov [data-f="limite"]').count()) === 1, 'o formulario do mapa tem a diagonal e o que fazer ao passar do deslocamento');
await pg.locator('.ov [data-f="tipo"]').selectOption('quadrado');
await pg.locator('.ov [data-f="tam"]').fill('70');
await pg.locator('.ov [data-f="diagonal"]').selectOption('121');
await pg.locator('.ov [data-f="limite"]').selectOption('bloqueio');
await salvar(); await espera(700);
em = await estadoMapa(1, mid);
ok(em.mapa.grid.tipo === 'quadrado' && em.mapa.grid.diagonal === '121' && em.mapa.regras.limite === 'bloqueio', 'diagonal e limite do mapa gravados');
const dist = (c, d) => pg.evaluate(([c, d]) => { MP.mapa.grid.diagonal = d; const r = mpDistCasas(0, 0, c[0] * 70, c[1] * 70); return r; }, [c, d]);
ok(await dist([3, 3], '121') === 4 && await dist([3, 3], '1') === 3 && Math.abs(await dist([3, 4], 'eu') - 5) < 1e-9, 'a conta de diagonal: 1-2-1 vale 4, uma por casa vale 3, euclidiana vale 5 para 3x4');
await pg.evaluate(() => { MP.mapa.grid.diagonal = '121'; });
ok(await pg.evaluate(() => mpDistTexto(4)) === '6 m · 4 casas', 'o rotulo mostra a unidade do mapa e as casas');
const t2 = await pg.evaluate(() => MP.els[0].id);
await pg.locator('[data-mp-ed="' + t2 + '"]').click(); await espera(500);
await pg.locator('.ov [data-f="desl"]').fill('6');
await salvar(); await espera(600);
em = await estadoMapa(1, mid);
ok(em.elementos.find(e => e.id === t2).dados.desl === 6 && (await pg.locator('.mpitem .chip', { hasText: /6\/6 m/ }).count()) === 1, 'o deslocamento por turno do token e gravado e aparece na lista (6/6 m)');
await pg.keyboard.press('r'); await espera(150);
ok(await pg.locator('#mpRegua').getAttribute('aria-pressed') === 'true' && await pg.evaluate(() => MP.ferramenta) === 'regua', 'a tecla R liga a regua');
const pr = await posToken(t2);
await pg.mouse.move(pr.x, pr.y); await pg.mouse.down();
await pg.mouse.move(pr.x + 3 * pr.T * pr.z, pr.y + 3 * pr.T * pr.z, { steps: 8 }); await pg.mouse.up(); await espera(200);
const reg = await pg.evaluate(() => MP.regua && { n: mpDistCasas(MP.regua.a.x, MP.regua.a.y, MP.regua.b.x, MP.regua.b.y), tok: MP.els.find(e => e.id === MP.sel) });
ok(!!reg && reg.n === 4, 'a regua mede do token ate a casa: 3 na diagonal e 3 em linha dao 4 casas');
em = await estadoMapa(1, mid);
ok(em.elementos.find(e => e.id === t2).dados.x === pr.dx, 'com a regua ligada, arrastar nao move o token');
await foto('15-mapa-regua');
await pg.keyboard.press('Escape'); await espera(150);
ok(await pg.evaluate(() => MP.regua) === null, 'Esc apaga a medida');
await pg.keyboard.press('v'); await espera(100);
ok(await pg.locator('#mpRegua').getAttribute('aria-pressed') === 'false', 'V volta para mover');
await arrastaToken(t2, 5);
em = await estadoMapa(1, mid);
ok(em.elementos.find(e => e.id === t2).dados.x === pr.dx + 350 && em.elementos.find(e => e.id === t2).dados.usado === undefined, 'o mestre anda alem do deslocamento sem ser barrado nem gastar');
await pg.keyboard.press('Control+z'); await espera(700);
em = await estadoMapa(1, mid);
ok(em.elementos.find(e => e.id === t2).dados.x === pr.dx, 'Ctrl+Z desfaz a ultima acao da pessoa no servidor');
await pg.locator('[data-mp-sel="' + t2 + '"]').click(); await espera(300);
await pg.keyboard.press('ArrowRight'); await espera(700);
em = await estadoMapa(1, mid);
ok(em.elementos.find(e => e.id === t2).dados.x === pr.dx + 70, 'seta do teclado move o token selecionado uma casa');
await abreMais('hist'); await espera(700);
const hist = await pg.locator('.ov .mphist').innerText();
ok(/moveu/.test(hist) && /1 casa/.test(hist) && /Desfeito/i.test(hist) && /desfez/.test(hist), 'o historico lista o que foi feito, o que foi desfeito e a distancia: ' + hist.replace(/\s+/g, ' ').slice(0, 120));
await pg.keyboard.press('Escape'); await espera(300);
await abreMais('turno'); await espera(500);
ok(/novo turno começou/i.test(await pg.locator('.toast').last().innerText()), 'o botao Novo turno avisa na tela que um turno novo comecou');

titulo('mapa: camadas, desenho, selecao em grupo, marcadores e areas (mestre)');
const tela = (x, y) => pg.evaluate(([x, y]) => { const r = MPC.cv.getBoundingClientRect(), v = mpVista(); return { x: r.left + v.x + x * v.z, y: r.top + v.y + y * v.z }; }, [x, y]);
const arrastaMundo = async (a, b) => { const p = await tela(a[0], a[1]), q = await tela(b[0], b[1]); await pg.mouse.move(p.x, p.y); await pg.mouse.down(); await pg.mouse.move(q.x, q.y, { steps: 8 }); await pg.mouse.up(); await espera(700); };
const cliqueMundo = async a => { const p = await tela(a[0], a[1]); await pg.mouse.click(p.x, p.y); await espera(250); };
await pg.keyboard.press('Escape'); await pg.evaluate(() => mpSelecionaIds([])); await pg.waitForTimeout(100);
/* desenhar: linha, circulo, retangulo, poligono e marcacao, todos encaixados nos cantos da grade */
await pg.keyboard.press('l'); await espera(100);
ok(await pg.locator('[data-mpf="linha"]').getAttribute('aria-pressed') === 'true', 'a tecla L liga a linha');
await arrastaMundo([707, 612], [1002, 618]);
em = await estadoMapa(1, mid);
let des = em.elementos.filter(e => e.tipo === 'DESENHO');
ok(des.length === 1 && des[0].dados.forma === 'linha' && des[0].camada === 'decoracao' && des[0].dados.pts[0][0] % 70 === 0 && des[0].dados.pts[1][1] % 70 === 0, 'arrastar com a linha cria um desenho encaixado nos cantos da grade, na camada Decoração');
await pg.keyboard.press('o'); await arrastaMundo([700, 840], [840, 840]);
await pg.keyboard.press('b'); await arrastaMundo([1120, 560], [1330, 700]);
await pg.keyboard.press('p'); await cliqueMundo([700, 280]); await cliqueMundo([910, 280]); await cliqueMundo([910, 420]); await pg.keyboard.press('Enter'); await espera(700);
await pg.keyboard.press('m'); await cliqueMundo([1330, 980]); await espera(350);
await pg.locator('.ov [data-f="rotulo"]').fill('Armadilha');
await salvar(); await espera(700);
em = await estadoMapa(1, mid);
des = em.elementos.filter(e => e.tipo === 'DESENHO');
ok(des.map(d => d.dados.forma).sort().join() === 'circulo,linha,marca,poligono,retangulo', 'circulo, retangulo, poligono (Enter fecha) e marcacao com texto entram no mapa: ' + des.map(d => d.dados.forma).join());
ok(des.find(d => d.dados.forma === 'marca').dados.rotulo === 'Armadilha' && des.find(d => d.dados.forma === 'poligono').dados.pts.length === 3, 'a marcacao leva o texto e o poligono, tres vertices');
await pg.keyboard.press('v');
const idLinha = des.find(d => d.dados.forma === 'linha').id;
const pl = await tela(850, 630);
await pg.mouse.click(pl.x, pl.y); await espera(250);
ok(await pg.evaluate(() => mpSelecao().length) === 1 && String(await pg.evaluate(() => MP.sel)) === String(idLinha), 'clicar no traco do desenho o seleciona');
/* seleção em grupo: caixa com a ferramenta Selecionar, mover tudo junto, um Ctrl+Z desfaz o grupo */
/* o teste mede em coordenadas do mapa: com ele inteiro a vista, a caixa cabe na tela */
await pg.evaluate(() => { mpVista().modo = 'inteiro'; mpEnquadra(); }); await espera(150);
await pg.keyboard.press('s'); await espera(100);
await arrastaMundo([560, 180], [1480, 1060]);
const nSel = await pg.evaluate(() => mpSelecao().length);
ok(nSel >= 5 && /Seleção\s*\d+/i.test(await pg.locator('#mpPainel').innerText()), 'a caixa de selecao pega varios itens e o painel mostra a selecao: ' + nSel);
await pg.keyboard.press('v');
const antesG = (await estadoMapa(1, mid)).elementos.map(e => ({ id: e.id, x: e.dados.x ?? e.dados.pts?.[0][0], y: e.dados.y ?? e.dados.pts?.[0][1] }));
await arrastaMundo([850, 630], [850, 755]);
const depoisG = (await estadoMapa(1, mid)).elementos.map(e => ({ id: e.id, x: e.dados.x ?? e.dados.pts?.[0][0], y: e.dados.y ?? e.dados.pts?.[0][1] }));
const selIds = await pg.evaluate(() => mpSelecao().map(Number));
const mexeu = depoisG.filter(d => selIds.includes(d.id) && Math.abs(d.y - antesG.find(a => a.id === d.id).y - 140) < 0.5);
ok(mexeu.length === selIds.length && selIds.length >= 5, 'arrastar um item da selecao leva todos juntos, no mesmo deslocamento: ' + mexeu.length + '/' + selIds.length);
await pg.keyboard.press('Control+z'); await espera(900);
const volta = (await estadoMapa(1, mid)).elementos.filter(e => selIds.includes(e.id)).every(e => Math.abs((e.dados.y ?? e.dados.pts[0][1]) - antesG.find(a => a.id === e.id).y) < 0.5);
ok(volta, 'um Ctrl+Z desfaz o grupo inteiro de uma vez');
/* trancar a selecao, trancar uma camada, esconder uma camada */
await pg.locator('[data-mp-sacao="trancar"]').click(); await espera(700);
em = await estadoMapa(1, mid);
ok(selIds.every(i => em.elementos.find(e => e.id === i).bloqueado === true) && /Destrancar/.test(await pg.locator('[data-mp-sacao="trancar"]').innerText()), 'Trancar na selecao tranca todos e o botao passa a Destrancar');
const antesT = (await estadoMapa(1, mid)).elementos.find(e => e.id === idLinha).dados.pts[0][1];
await arrastaMundo([850, 630], [850, 755]);
ok((await estadoMapa(1, mid)).elementos.find(e => e.id === idLinha).dados.pts[0][1] === antesT, 'o que esta trancado nao anda ao arrastar');
const r409 = await pg.evaluate(id => api(mpAPI('/' + MP.id + '/elementos/' + id), { method: 'PUT', body: { dados: { pts: [[0, 0], [70, 70]] } } }).then(() => 200, e => e.status), idLinha);
ok(r409 === 409, 'o servidor tambem recusa mexer no que esta trancado, ate para o mestre');
await pg.locator('[data-mp-sacao="trancar"]').click(); await espera(700);
ok((await estadoMapa(1, mid)).elementos.every(e => !e.bloqueado), 'Destrancar solta todos');
await abreSecao('camadas');
await pg.locator('[data-mp-ctr="decoracao"]').click(); await espera(900);
em = await estadoMapa(1, mid);
ok(em.mapa.regras.trancadas?.includes('decoracao') && await pg.evaluate(() => mpTrancado(MP.els.find(e => e.tipo === 'DESENHO'))), 'trancar a camada Decoração fica no mapa e vale para o que esta nela');
const r409b = await pg.evaluate(id => api(mpAPI('/' + MP.id + '/elementos'), { method: 'PUT', body: { itens: [{ id, dados: { pts: [[0, 0], [70, 70]] } }] } }).then(() => 200, e => e.status), idLinha);
ok(r409b === 409, 'o grupo com um item de camada trancada e recusado inteiro');
await pg.locator('[data-mp-ctr="decoracao"]').click(); await espera(900);
await pg.locator('[data-mp-cvis="decoracao"]').click(); await espera(200);
ok(await pg.evaluate(() => mpOrdenados().every(e => e.tipo !== 'DESENHO')) && /Oculta/.test(await pg.locator('[data-mp-cvis="decoracao"]').innerText()), 'esconder uma camada tira o que esta nela da tela, so para quem escondeu');
await pg.locator('[data-mp-cvis="decoracao"]').click(); await espera(200);
await pg.evaluate(() => mpSelecionaIds([]));
/* marcadores no token: vida e marcas */
await pg.locator('[data-mp-ed="' + t2 + '"]').click(); await espera(500);
await pg.locator('.ov [data-f="vidaMax"]').fill('20');
await pg.locator('.ov [data-f="vida"]').fill('12');
await pg.locator('.ov [data-addr="marcas"]').click(); await espera(200);
await pg.locator('.ov [data-f="marcas.0.t"]').fill('Envenenado');
await pg.locator('.ov [data-f="vidaPublica"]').check();
await salvar(); await espera(700);
em = await estadoMapa(1, mid);
const dtk = em.elementos.find(e => e.id === t2).dados;
ok(dtk.vidaMax === 20 && dtk.vida === 12 && dtk.marcas?.[0]?.t === 'Envenenado', 'vida e marca gravadas no token');
ok((await pg.locator('.mpitem .chip', { hasText: '12/20' }).count()) === 1 && (await pg.locator('.mpitem .chip', { hasText: 'Envenenado' }).count()) === 1, 'a lista do painel mostra a vida em numero e a marca em texto');
ok(await pg.evaluate(() => mpRotuloDoToken(MP.els.find(e => e.tipo === 'TOKEN').dados)).then(t => /12\/20/.test(t)), 'o rotulo do token no mapa leva a vida em numero, nao so a barra');
/* area: cone com a tecla A, fixar com Enter */
await pg.keyboard.press('a'); await espera(100);
ok(await pg.evaluate(() => MP.ferramenta) === 'a-cone', 'a tecla A liga o molde de area (cone, de saida)');
await arrastaMundo([700, 1100], [1050, 1100]);
const ar = await pg.evaluate(() => { var f = MP.area && mpAreaForma(MP.area); return f && { k: f.k, txt: f.txt, n: f.pts.length }; });
ok(!!ar && ar.k === 'p' && ar.n === 3 && /m$/.test(ar.txt), 'o cone mede o comprimento na unidade do mapa: ' + (ar && ar.txt));
await pg.keyboard.press('Enter'); await espera(800);
em = await estadoMapa(1, mid);
ok(em.elementos.filter(e => e.tipo === 'DESENHO').length === 6 && await pg.evaluate(() => MP.area) === null, 'Enter fixa o cone no mapa como desenho');
await pg.keyboard.press('v'); await pg.keyboard.press('Escape'); await espera(150);
await foto('16-mapa-organizacao');
/* apagar a selecao oferece desfazer */
await pg.keyboard.press('Control+a'); await espera(200);
await pg.keyboard.press('Delete'); await espera(800);
ok((await estadoMapa(1, mid)).elementos.length === 0 && /removidos/.test(await pg.locator('.toast').last().innerText()), 'Delete remove a selecao e avisa com Desfazer');
await pg.keyboard.press('Control+z'); await espera(900);
ok((await estadoMapa(1, mid)).elementos.length >= 7, 'Ctrl+Z traz de volta tudo o que foi removido junto');

/* cada guia de aba do mestre, agora com mapa: todo passo acha o elemento que aponta */
for (const id of await pg.evaluate(() => GUIAS_MESTRE)) {
  await pg.evaluate(i => abrirGuia(i), id);
  await espera(500);
  const r = await andaTour();
  ok(r.faltas.length === 0 && r.n >= 3, "guia " + id + ": " + r.n + " passos, todos acham o elemento" + (r.faltas.length ? ": " + r.faltas.join(" | ") : ""));
}
await pg.evaluate(() => { S.view = "mapa"; render(); });
await espera(600);

/* barra do topo enxuta: Historico e Novo turno no menu "Mais", o Desfazer so nas ferramentas do canvas */
const ordemBarra = await pg.locator('.mpbar .bbacoes > button').evaluateAll(l => l.map(b => b.id || b.dataset.mpUndo || ''));
ok((await pg.locator('.mpbar [data-mp-undo], .mpbar [data-mp-hist], .mpbar [data-mp-turno], #mpEncaixe').count()) === 0 && ordemBarra.slice(-2).join() === 'mpEd,mpMais', 'a barra do mapa leva o que se usa menos para o menu Mais, que fica no fim com os ajustes', ordemBarra);
const encAntes = await pg.evaluate(() => mpEncaixando());
await abreMais('encaixe'); await espera(500);
ok(await pg.evaluate(a => mpEncaixando() !== a, encAntes), 'Encaixar na grade mora no menu Mais e troca para todos');
await abreMais('encaixe'); await espera(500);
/* atalhos: o botao e a tecla ? abrem a mesma janela, e as dicas de rodape sairam */
await pg.locator('#mpAtalhos').click(); await espera(300);
ok(await pg.locator('.ov .mpatalhos').isVisible() && (await pg.locator('.ov .mpatalhos kbd').count()) > 10, 'o botao de atalhos abre a lista de teclas e gestos');
await pg.keyboard.press('Escape'); await espera(200);
await pg.locator('#mpCanvas').click({ position: { x: 5, y: 5 } }); await pg.keyboard.press('?'); await espera(300);
ok(await pg.locator('.ov .mpatalhos').isVisible() && (await pg.locator('.mphint').count()) === 0, 'a tecla ? abre os atalhos, e o rodape de dicas nao existe mais');
await pg.keyboard.press('Escape'); await espera(200);
/* enquadrar: o padrao preenche a area; o 0 alterna para o mapa inteiro */
const cabe = () => pg.evaluate(() => { const v = mpVista(), m = MP.mapa, w = MPC.w - mpLarguraDoPainel(); return { cobre: m.largura * v.z >= w - 1 && m.altura * v.z >= MPC.h - 1, dentro: m.largura * v.z <= w + 1 && m.altura * v.z <= MPC.h + 1, modo: v.modo || 'preenche' }; });
await pg.evaluate(() => { mpVista().modo = 'preenche'; mpEnquadra(); });
const c1 = await cabe();
await pg.keyboard.press('0'); await espera(200);
const c2 = await cabe();
ok(c1.cobre && c2.modo === 'inteiro' && c2.dentro, 'o mapa preenche a area e o 0 mostra ele inteiro', { c1, c2 });
await pg.keyboard.press('0'); await espera(150);

/* atalho do mestre para a cena ligada: abre a janela da cena sem sair do mapa e devolve a sessao de antes */
const ligada = await pg.evaluate(() => { const si = D.sessoes.findIndex(x => (x.cenas || []).length), c = D.sessoes[si].cenas[0]; return { cid: CID, mid: MP.id, cena: c.id, si, antes: S.sessao }; });
await ctx.request.put(B + "/api/c/" + ligada.cid + "/mapas/" + ligada.mid, { data: { cenaId: ligada.cena } });
await pg.evaluate(() => mpAbrir(MP.id));
await espera(700);
ok(await pg.locator("#mpCena").isVisible(), "mapa ligado a uma cena mostra o atalho para ela");
await pg.locator("#mpCena").click();
await espera(500);
ok(await pg.locator(".ov .cenasheet").isVisible() && await pg.evaluate(() => S.view === "mapa"), "o atalho abre a janela da cena por cima do mapa");
await pg.keyboard.press("Escape");
await espera(400);
ok((await pg.locator(".ov .cenasheet").count()) === 0 && await pg.evaluate(a => S.sessao === a, ligada.antes), "fechar a cena devolve a sessao que estava aberta");
await ctx.request.put(B + "/api/c/" + ligada.cid + "/mapas/" + ligada.mid, { data: { cenaId: "" } });
await pg.evaluate(() => mpAbrir(MP.id));
await espera(500);

titulo('mapa: moldes prontos (mestre)');
await pg.evaluate(() => { MM_FILTRO = 'todos'; mpNovoMapa(); }); await espera(1500);
ok(await pg.locator('.ov [data-mm-prev]').evaluateAll(cs => cs.length === 15 && cs.every(c => c.width > 50)), 'a galeria pinta a previa de cada um dos 15 moldes');
await foto('13a-mapa-moldes');
await pg.locator('.ov [data-mm-filtro="scifi"]').click(); await espera(200);
ok(await pg.locator('.ov .mmgal li:not([hidden])').count() === 6 && await pg.locator('.ov [data-mm="nave"]').isVisible() && !(await pg.locator('.ov [data-mm="taverna"]').isVisible()),
  'o filtro Ficcao cientifica deixa so os moldes dela (e a grade e a imagem)');
await pg.locator('.ov [data-mm-filtro="todos"]').click();
await pg.locator('.ov [data-mm="masmorra"]').click(); await espera(600);
const prev1 = await pg.locator('#mmGrande').evaluate(c => c.toDataURL().length);
await pg.locator('#mmOutro').click(); await espera(300);
const prev2 = await pg.locator('#mmGrande').evaluate(c => c.toDataURL().length);
ok(prev1 > 1000 && prev1 !== prev2, 'Gerar outro sorteia outra planta na previa');
ok(await pg.locator('.ov [data-back]').isVisible(), 'a previa do molde tem Voltar para a galeria');
await pg.locator('#mmNome').fill('Cripta');
await pg.locator('#mmCria').click(); await espera(3000);
const md = await pg.evaluate(() => ({ nome: MP.mapa && MP.mapa.nome, img: MP.mapa && MP.mapa.imagem, fog: MP.mapa && MP.mapa.regras.fog,
  paredes: MP.els.filter(e => e.tipo === 'PAREDE').length, portas: MP.els.filter(e => e.tipo === 'PAREDE' && e.dados.kind === 'porta').length,
  ocultos: MP.els.filter(e => e.tipo === 'TOKEN' && !e.visivel).length, pjs: MP.els.filter(e => e.tipo === 'TOKEN' && e.visivel && /^Personagem [1-4]$/.test(e.dados.nome)).length }));
ok(md.nome === 'Cripta' && (md.img || '').startsWith('img/'), 'o molde cria o mapa com a imagem do chao enviada: ' + JSON.stringify(md));
ok(md.paredes > 20 && md.portas > 2, 'o molde ja traz paredes e portas: ' + md.paredes + ' paredes, ' + md.portas + ' portas');
ok(md.ocultos >= 3 && md.pjs === 4, 'o molde traz NPCs escondidos e os 4 lugares dos personagens');
ok(md.fog === 'visao', 'o mapa do molde nasce com a nevoa pela visao');
await foto('13b-mapa-molde');

titulo('mapa: paredes, visao e nevoa (mestre)');
await pg.evaluate(() => mpCriaMapa({ nome: 'Paredes' })); await espera(1500);
const mw = await pg.evaluate(() => MP.id);
ok(!!mw && mw !== mid && await pg.evaluate(() => MP.mapa.largura) === 2100, 'um mapa em branco novo para as paredes: ' + mw);
/* parede: W liga, um clique por ponto, Enter termina; encaixa nos cantos da grade */
await pg.keyboard.press('w'); await espera(100);
ok(await pg.locator('[data-mpf="parede"]').getAttribute('aria-pressed') === 'true', 'a tecla W liga a ferramenta Parede');
await cliqueMundo([700, 350]); await cliqueMundo([700, 700]); await pg.keyboard.press('Enter'); await espera(800);
em = await estadoMapa(1, mw);
let par = em.elementos.filter(e => e.tipo === 'PAREDE');
ok(par.length === 1 && par[0].dados.pts.length === 2 && par[0].dados.kind === 'parede' && par[0].camada === 'cenario' && par[0].visivel === true, 'dois cliques e Enter criam uma parede encaixada nos cantos, sempre visivel');
await pg.keyboard.press('v');
/* a parede nao conta nas camadas e nao e arrastada por engano: clicar nela a seleciona */
const pw = await tela(700, 525); await pg.mouse.click(pw.x, pw.y); await espera(250);
ok(await pg.evaluate(() => mpSelecionados().length === 1 && mpSelecionados()[0].tipo === 'PAREDE'), 'clicar no traco da parede a seleciona');
await pg.keyboard.press('Escape'); await pg.evaluate(() => mpSelecionaIds([]));
/* o heroi (com dono) enxerga, o monstro nao */
await pg.evaluate(() => mpCriaElemento({ dono: 1, dados: { x: 455, y: 525, nome: 'Heroi', tam: 1 } })); await espera(700);
await pg.evaluate(() => mpCriaElemento({ dados: { x: 1505, y: 875, nome: 'Monstro', tam: 1 } })); await espera(700);
await pg.evaluate(() => mpSelecionaIds([]));
ok(await pg.evaluate(() => !mpLivreTrecho(mpTrechos(true), 455, 525, 945, 525, true, true) && mpLivreTrecho(mpTrechos(true), 455, 525, 455, 105, true, true)), 'a parede barra a linha de visao que a cruza e deixa passar a que nao cruza');
ok(await pg.evaluate(() => mpLivreTrecho(mpTrechos(true), 455, 525, 700, 800, true, true) === true && mpLivreTrecho(mpTrechos(false), 455, 525, 945, 525, true, true) === false), 'o canto da parede nao vaza: so passa por fora dela');
/* a regua diz se um ponto enxerga o outro (so o mestre) */
await pg.keyboard.press('r'); await arrastaMundo([455, 525], [945, 525]);
ok(await pg.evaluate(() => !!MP.regua) && await pg.evaluate(() => mpTemParedeDeVisao()), 'a regua entre dois pontos separados por parede fica no mapa para dizer "visao bloqueada"');
await pg.keyboard.press('v'); await pg.keyboard.press('Escape'); await pg.evaluate(() => { MP.regua = null; });
/* nevoa: modo pela visao, no painel */
await abreSecao('visao');
ok(/não saem do servidor/i.test(await pg.locator('#mpPainel').innerText()) === false, 'com a nevoa desligada o painel nao fala do corte');
await pg.locator('#mpFogModo').selectOption('visao'); await espera(900);
em = await estadoMapa(1, mw);
ok(em.mapa.regras.fog === 'visao' && /não saem do servidor/i.test(await pg.locator('#mpPainel').innerText()) && !/s[oó] visual/i.test(await pg.locator('#mpPainel').innerText()), 'ligar a nevoa pela visao fica no mapa e o painel diz que os jogadores so recebem o que ela deixa ver');
ok(await pg.evaluate(() => mpRevelado(630, 525) && !mpRevelado(770, 525) && !mpRevelado(1500, 100)), 'a visao do heroi alcanca ate a parede e nao passa dela, nem alem do alcance');
ok(await pg.evaluate(() => { var t = MP.els.find(e => e.dados.nome === 'Heroi'); return !mpOculto(t); }), 'com a nevoa o mestre ainda ve tudo (translucida)');
await pg.locator('#mpFogComo').check(); await espera(300);
ok(await pg.evaluate(() => MP.comoJogador && mpOculto(MP.els.find(e => e.dados.nome === 'Monstro')) && !mpOculto(MP.els.find(e => e.dados.nome === 'Heroi'))), '"ver como os jogadores" esconde o que a nevoa cobre e deixa o que e do jogador');
ok((await pg.locator('.mpitem', { hasText: 'Monstro' }).count()) === 0 && (await pg.locator('.mpitem', { hasText: 'Heroi' }).count()) === 1, 'a lista de tokens do painel acompanha: o que a nevoa cobre sai dela');
await foto('17-mapa-nevoa');
await pg.locator('#mpFogComo').uncheck(); await espera(200);
/* alcance padrao e memoria do explorado (painel do mestre) */
ok(await pg.evaluate(() => mpAlcanceDe({}) === 6 && mpAlcanceDe({ visaoFicha: 2 }) === 2 && mpAlcanceDe({ visao: 3, visaoFicha: 2 }) === 3 && mpAlcanceDe({ visao: 0, visaoFicha: 2 }) === 0), 'o alcance e o do token, senao o da ficha, senao o padrao do mapa (e 0 e cego)');
ok((await pg.locator('#mpFogMemoria').count()) === 1 && !(await pg.locator('#mpFogMemoria').isChecked()) && (await pg.locator('#mpVisaoPadrao').inputValue()) === '6' && (await pg.locator('#mpFogEsquece').count()) === 0, 'com a nevoa pela visao o painel tem a memoria (desligada de saida) e o alcance padrao, 6 casas');
await pg.locator('#mpVisaoPadrao').fill('4'); await pg.locator('#mpVisaoPadrao').press('Tab'); await espera(900);
em = await estadoMapa(1, mw);
ok(em.mapa.regras.visaoPadrao === 4 && em.mapa.regras.fog === 'visao' && await pg.evaluate(() => mpAlcanceDe({}) === 4), 'mudar o alcance padrao fica no mapa e vale para quem nao tem alcance proprio');
await pg.locator('#mpVisaoPadrao').fill('6'); await pg.locator('#mpVisaoPadrao').press('Tab'); await espera(900);
const lido = (x, y) => pg.evaluate(([a, b]) => { const e = MPC.exp; return !!e && e.cv.getContext('2d').getImageData(Math.round(a * e.esc), Math.round(b * e.esc), 1, 1).data[3] > 0; }, [x, y]);
await pg.locator('#mpFogMemoria').check(); await espera(900);
em = await estadoMapa(1, mw);
ok(em.mapa.regras.fogMemoria === true && em.mapa.regras.fog === 'visao' && em.mapa.regras.visaoPadrao === 6 && (await pg.locator('#mpFogEsquece').count()) === 1, 'ligar a memoria fica no mapa sem mexer no resto das regras e libera o "Esquecer"');
ok(await lido(455, 200) && !(await lido(455, 1200)), 'com a memoria ligada, o que o heroi enxerga entra no explorado');
await pg.evaluate(() => mpMudaElemento(MP.els.find(e => e.dados.nome === 'Heroi'), { dados: { y: 1200 } })); await espera(900);
ok(await pg.evaluate(() => !mpRevelado(455, 200)) && await lido(455, 200) && await lido(455, 1200), 'ao se afastar, o lugar sai da vista mas continua lembrado, e o novo entra no explorado');
await espera(1800);
ok(await pg.evaluate(() => !!localStorage.getItem(MPC.exp.chave)), 'o explorado fica guardado no navegador');
ok(await pg.evaluate(async () => { MPC.exp = null; mpExplorado(); await new Promise(r => setTimeout(r, 500)); const e = MPC.exp; return e.cv.getContext('2d').getImageData(Math.round(455 * e.esc), Math.round(200 * e.esc), 1, 1).data[3] > 0; }), 'e volta quando a pagina abre de novo');
await pg.locator('#mpFogEsquece').click(); await espera(300);
ok(await pg.locator('.ov [role=alertdialog]').isVisible(), 'esquecer o explorado pede confirmacao numa janela do app');
await pg.locator('.ov [data-sim]').click(); await espera(1000);
em = await estadoMapa(1, mw);
ok(em.mapa.regras.fogVer === 1 && !(await lido(455, 200)) && await lido(455, 1200) && await pg.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('grim_exp_c')).length <= 1), 'Esquecer o explorado soma uma versao e recomeca so com o que se ve agora');
await pg.locator('#mpFogMemoria').uncheck(); await espera(900);
em = await estadoMapa(1, mw);
ok(em.mapa.regras.fogMemoria === false && em.mapa.regras.fogVer === 1, 'desligar a memoria volta a mostrar so o campo de visao de agora');
await pg.evaluate(() => mpMudaElemento(MP.els.find(e => e.dados.nome === 'Heroi'), { dados: { y: 525 } })); await espera(700);
/* borda da visao: de nevoa, nao de recorte (a luz some aos poucos perto do alcance) */
await pg.evaluate(() => mpDesenha()); await espera(300);
const alfa = (x, y) => pg.evaluate(([a, b]) => { const v = mpVista(), c = MPC, ab = c.abCv; if (!ab) return -1;
  return ab.getContext('2d').getImageData(Math.round((a * v.z + v.x) * c.dpr), Math.round((b * v.z + v.y) * c.dpr), 1, 1).data[3]; }, [x, y]);
const aCentro = await alfa(455, 525), aBorda = await alfa(455, 105 + 8), aFora = await alfa(455, 105 - 150);
ok(aCentro >= 250 && aBorda > 5 && aBorda < 245 && aFora <= 2, 'a borda da visao e suave: aberta no centro (' + aCentro + '), meio aberta perto do alcance (' + aBorda + ') e fechada alem (' + aFora + ')');
/* fumaca: anda por cima da nevoa e some junto com as animacoes do site */
ok(await pg.evaluate(() => mpFumacaViva() && !!MPC.fumTex), 'com a nevoa ligada e as animacoes ligadas a fumaca esta viva');
await pg.evaluate(() => { window.__nf = 0; window.__of = mpPintaFumaca; mpPintaFumaca = function () { window.__nf++; return window.__of.apply(this, arguments); }; });
await espera(700);
ok(await pg.evaluate(() => window.__nf) >= 4, 'a fumaca redesenha sozinha varias vezes por segundo: ' + await pg.evaluate(() => window.__nf));
await pg.evaluate(() => { document.documentElement.dataset.fx = 'off'; });
await espera(300); await pg.evaluate(() => { window.__nf = 0; }); await espera(600);
ok(await pg.evaluate(() => !mpFumacaViva() && window.__nf <= 1), 'com as animacoes desligadas (Configuracoes > Aparencia) a fumaca para: ' + await pg.evaluate(() => window.__nf));
await pg.evaluate(() => { document.documentElement.dataset.fx = 'on'; mpPintaFumaca = window.__of; mpDesenha(); }); await espera(300);
await abreSecao('pincel');
/* pincel: B liga, arrastar pinta uma area que revela (ou cobre), com diametro, formato e borda do painel */
ok((await pg.locator('#mpPincelCasas').inputValue()) === '2' && (await pg.locator('#mpPincelPonta').inputValue()) === 'redondo' && (await pg.locator('#mpPincelBorda').inputValue()) === 'macia', 'o painel tem o pincel: 2 casas, redondo, borda macia');
await pg.locator('#mpPincelPonta').selectOption('quadrado'); await pg.locator('#mpPincelBorda').selectOption('firme');
await pg.locator('#mpPincelCasas').fill('3'); await pg.locator('#mpPincelCasas').press('Tab');
await pg.evaluate(() => document.activeElement.blur());
await pg.keyboard.press('f'); await espera(100);
ok(await pg.locator('[data-mpf="pincel"]').getAttribute('aria-pressed') === 'true', 'a tecla B liga o Pincel');
await arrastaMundo([1400, 1000], [1700, 1000]); await espera(900);
em = await estadoMapa(1, mw);
let tr = em.elementos.filter(e => e.tipo === 'FOG' && e.dados.forma === 'traco');
ok(tr.length === 1 && tr[0].dados.pts.length >= 2 && tr[0].dados.larg === 210 && tr[0].dados.ponta === 'quadrado' && tr[0].dados.suave === false && tr[0].dados.revela === true, 'arrastar o pincel pinta um traco com 3 casas, ponta quadrada e borda firme, que revela', tr[0]?.dados);
ok(await pg.evaluate(() => mpRevelado(1550, 1000) && mpRevelado(1550, 1090) && !mpRevelado(1550, 1130) && !mpRevelado(1250, 1000)), 'o que o pincel pinta fica a vista, e so ate a largura dele');
await pg.locator('#mpFogAcao').selectOption('cobre'); await pg.locator('#mpPincelPonta').selectOption('redondo'); await pg.locator('#mpPincelBorda').selectOption('macia');
await pg.evaluate(() => document.activeElement.blur());
await cliqueMundo([1550, 1000]); await espera(800);
em = await estadoMapa(1, mw);
tr = em.elementos.filter(e => e.tipo === 'FOG' && e.dados.forma === 'traco');
ok(tr.length === 2 && tr[1].dados.pts.length === 1 && tr[1].dados.revela === false && tr[1].dados.ponta === 'redondo' && tr[1].dados.suave === true, 'um clique com o pincel pinta um ponto, e "cobre de novo" fecha o que estava aberto', tr[1]?.dados);
ok(await pg.evaluate(() => !mpRevelado(1550, 1000) && mpRevelado(1700, 1000)), 'a pincelada mais nova manda sobre a mais antiga');
await pg.locator('#mpFogAcao').selectOption('revela');
await pg.keyboard.press('Escape'); await espera(100);
ok(await pg.locator('[data-mpf="pincel"]').getAttribute('aria-pressed') === 'false', 'Esc desliga o Pincel');
/* enquanto o botao esta apertado, verde onde vai liberar; a nevoa so muda ao soltar */
await pg.keyboard.press('f'); await espera(100);
{
  const p = await tela(1400, 400), q = await tela(1700, 400);
  await pg.mouse.move(p.x, p.y); await pg.mouse.down(); await pg.mouse.move(q.x, q.y, { steps: 8 }); await espera(250);
  const px = await pg.evaluate(([x, y]) => { const r = MPC.cv.getBoundingClientRect(), d = MPC.dpr, g = MPC.ctx.getImageData(Math.round((x - r.left) * d), Math.round((y - r.top) * d), 1, 1).data; return [g[0], g[1], g[2]]; }, [(p.x + q.x) / 2, p.y]);
  ok(px[1] > px[0] + 10 && px[1] > px[2] + 10, 'enquanto o botao esta apertado, o que vai ser liberado fica verde: ' + px);
  em = await estadoMapa(1, mw);
  ok(em.elementos.filter(e => e.dados?.forma === 'traco').length === 2 && await pg.evaluate(() => !mpRevelado(1550, 400)), 'e a nevoa so muda ao soltar o mouse');
  await pg.mouse.up(); await espera(900);
  em = await estadoMapa(1, mw);
  ok(em.elementos.filter(e => e.dados?.forma === 'traco').length === 3 && await pg.evaluate(() => mpRevelado(1550, 400)), 'ao soltar a nevoa abre');
}
await pg.keyboard.press('Escape'); await espera(100);
/* a pincelada nao se seleciona por area nem por clique: so pela lista do painel */
/* o teste mede em coordenadas do mapa: com ele inteiro a vista, a caixa cabe na tela */
await pg.evaluate(() => { mpVista().modo = 'inteiro'; mpEnquadra(); }); await espera(150);
await pg.keyboard.press('s'); await espera(100);
await arrastaMundo([1250, 950], [1850, 1150]); await espera(300);
ok(await pg.evaluate(() => mpSelecionados().length === 0), 'selecionar uma area nao seleciona a pintura do pincel');
await pg.evaluate(() => document.activeElement.blur());
await cliqueMundo([1550, 400]);
ok(await pg.evaluate(() => mpSelecionados().length === 0), 'nem clicar em cima dela');
await pg.keyboard.press('v');
await pg.evaluate(() => mpCobreTudo()); await espera(900);
em = await estadoMapa(1, mw);
ok(em.elementos.filter(e => e.tipo === 'FOG').length === 0, 'as pinceladas saem com o "Cobrir tudo"');
/* area de nevoa: N liga, arrastar revela */
await pg.evaluate(() => document.activeElement.blur());
await pg.keyboard.press('n'); await espera(100);
ok(await pg.locator('[data-mpf="fog"]').getAttribute('aria-pressed') === 'true', 'a tecla N liga a ferramenta Nevoa');
await arrastaMundo([1400, 770], [1610, 980]);
em = await estadoMapa(1, mw);
const fg = em.elementos.filter(e => e.tipo === 'FOG');
ok(fg.length === 1 && fg[0].dados.forma === 'retangulo' && fg[0].dados.revela === true, 'arrastar com a Nevoa cria uma area que revela');
ok(await pg.evaluate(() => mpRevelado(1505, 875)) && (await pg.locator('[data-mp-sec="areas"]').count()) === 1, 'o que a area revela passa a estar a vista e ela entra na lista do painel');
await pg.keyboard.press('v');
await pg.locator('#mpFogCobre').click(); await espera(900);
em = await estadoMapa(1, mw);
ok(em.elementos.filter(e => e.tipo === 'FOG').length === 0 && await pg.evaluate(() => !mpRevelado(1505, 875)), 'Cobrir tudo tira as areas e o mapa volta a ficar coberto');
await pg.locator('#mpFogRevela').click(); await espera(1100);
em = await estadoMapa(1, mw);
ok(em.elementos.filter(e => e.tipo === 'FOG').length === 1 && await pg.evaluate(() => mpRevelado(2000, 1300)), 'Revelar tudo poe uma area do tamanho do mapa');
/* porta: aberta nao barra */
await pg.evaluate(() => mpCriaElemento({ tipo: 'PAREDE', dados: { kind: 'porta', pts: [[1050, 350], [1050, 700]], aberta: false } })); await espera(800);
await pg.evaluate(() => mpSelecionaIds([]));
const idPorta = await pg.evaluate(() => MP.els.find(e => e.tipo === 'PAREDE' && e.dados.kind === 'porta').id);
ok(await pg.evaluate(() => !mpLivreTrecho(mpTrechos(false), 1000, 525, 1100, 525, true, true)), 'porta fechada barra');
await abreSecao('paredes');
await pg.locator('[data-mp-porta="' + idPorta + '"]').click(); await espera(800);
em = await estadoMapa(1, mw);
ok(em.elementos.find(e => e.id === idPorta).dados.aberta === true && await pg.evaluate(() => mpLivreTrecho(mpTrechos(false), 1000, 525, 1100, 525, true, true) && mpLivreTrecho(mpTrechos(true), 1000, 525, 1100, 525, true, true)), 'abrir a porta pelo painel deixa passar o movimento e a visao');
/* janela barra o movimento, nao a visao */
await pg.locator('[data-mp-ed="' + idPorta + '"]').click(); await espera(400);
await pg.locator('.ov [data-f="kind"]').selectOption('janela'); await salvar(); await espera(800);
em = await estadoMapa(1, mw);
ok(em.elementos.find(e => e.id === idPorta).dados.kind === 'janela' && em.elementos.find(e => e.id === idPorta).dados.aberta === false, 'trocar a porta por janela pelo formulario: aberta so vale para porta');
ok(await pg.evaluate(() => !mpLivreTrecho(mpTrechos(false), 1000, 525, 1100, 525, true, true) && mpLivreTrecho(mpTrechos(true), 1000, 525, 1100, 525, true, true)), 'janela barra o movimento e nao a visao');
await pg.evaluate(id => mpAbrir(id), mid); await espera(1200);

await pg.reload(); await espera(1800);
ok(new RegExp('#/c/1/mapa/' + mid + '$').test(pg.url()) && await pg.evaluate(() => String(MP.id)) === String(mid), 'F5 reabre o mesmo mapa');
await ctx.request.post(B + '/__sse/0');
await pg.reload(); await espera(2500);
ok(await pg.evaluate(() => mpModoTempoReal()) === 'polling' && await pg.locator('.mpaviso').isVisible(), 'sem SSE o mapa cai para polling e avisa no painel');
ok(await pg.evaluate(() => !avisosAoVivo() && !!sondaT), 'sem SSE o aviso da campanha tambem desiste e a pergunta de 6 em 6 segundos continua');
await ctx.request.post(B + '/__sse/1');
await pg.locator('#tabs .tab[data-aba="home"]').click(); await espera(600);
ok(await pg.evaluate(() => mpModoTempoReal()) === '', 'sair do mapa desliga o tempo real');
ok(g.elenco.personagens.length === 3 && g.elenco.npcs.length === 1 && g.elenco.pistas.length === 1 && g.elenco.locais.length === 1,
  'elenco: 3 personagens, 1 npc, 1 local, 1 pista');
ok(g.sessoes.length === 2 && g.sessoes[0].npcIds.length === 1, 'duas sessoes; a sessao aponta para o elenco');
ok(new Set(JSON.stringify(g).match(/"id":"[^"]+"/g)).size === JSON.stringify(g).match(/"id":"[^"]+"/g).length, 'nenhum id repetido');

titulo('recarregar nao migra de novo');
await pg.reload({ waitUntil: 'networkidle' });
await espera(1100);
const g2 = await guia(1);
ok(g2.elenco.personagens.length === 3 && g2.campanha.secoes.length === g.campanha.secoes.length, 'sem duplicar');

titulo('editar a campanha por formulario');
await pg.locator('[data-cp="cp-ed"]').click();
await espera(350);
ok((await pg.locator('.ov .form label').count()) >= 3, 'formulario com campos rotulados');
await pg.locator('.ov [data-f="apresentacao"]').fill('Linha um.\nLinha dois.');
await salvar();
ok(/Linha um\.\s*\n\s*Linha dois\./.test(await pg.locator('#view').innerText()), 'quebra de linha preservada');
await espera(300);
ok(await pg.waitForFunction(() => /salvo/i.test(document.querySelector('#saveSt').innerText), null, { timeout: 2500 }).then(() => true, () => false), 'indicador mostra salvo');

titulo('secao nova nao joga a tela para o topo');
await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await espera(150);
const yAntes = await pg.evaluate(() => window.scrollY);
await pg.locator('[data-cp="sec-add"]').click();
await espera(300);
await pg.locator('.ov [data-v="lista"]').click();
await espera(300);
await pg.locator('.ov [data-f="titulo"]').fill('Regras da casa');
await pg.locator('.ov [data-f="itens"]').fill('Sem celular\nDado no chão rola de novo');
await salvar();
const yDepois = await pg.evaluate(() => window.scrollY);
ok(yAntes > 100 && yDepois >= yAntes - 5, 'rolagem mantida (' + yAntes + ' -> ' + yDepois + ')');
ok(/Dado no chão rola de novo/.test(await pg.locator('#view').innerText()), 'secao criada');

titulo('remover oferece desfazer');
const nSec = await pg.locator('[data-sec]').count();
await pg.locator('[data-sec]').last().click();
await espera(300);
await pg.locator('.ov [data-del]').click();
await espera(400);
ok((await pg.locator('[data-sec]').count()) === nSec - 1, 'secao removida');
await pg.locator('.toast.act [data-acao]').click();
await espera(400);
ok((await pg.locator('[data-sec]').count()) === nSec, 'desfazer trouxe de volta');

titulo('secoes trocam de lugar arrastando (sem setinhas)');
ok((await pg.locator('#view .tbtn[title="Subir"], #view .tbtn[title="Descer"]').count()) === 0, 'nao sobrou setinha de subir/descer');
ok(await pg.locator('#view .edb').evaluateAll(l => l.length > 0 && l.every(b => b.querySelector('svg') && !b.textContent.trim() && b.title)),
  'editar e so o lapis, com o nome no title');
ok(await pg.locator('[data-ordena="secoes"] > [data-item]').evaluateAll(l => l.every(s => s.querySelector('button.alca svg rect'))),
  'toda secao que se arrasta mostra as tres barrinhas');
const titulosSec = () => pg.locator('[data-ordena="secoes"] > [data-item] h2.sec').allInnerTexts();
const antesSec = await titulosSec();
await pg.locator('[data-ordena="secoes"] > [data-item]').first().scrollIntoViewIfNeeded();
await arrastar(pg.locator('[data-ordena="secoes"] > [data-item]').nth(1).locator('[data-alca]'),
  pg.locator('[data-ordena="secoes"] > [data-item]').first(), 'antes');
const depoisSec = await titulosSec();
ok(depoisSec[0] === antesSec[1] && depoisSec[1] === antesSec[0] && depoisSec.length === antesSec.length,
  'a segunda secao foi para o topo: ' + depoisSec.slice(0, 2).join(' | '));
await espera(1100);
const gSec = await guia(1);
ok(gSec.campanha.secoes[0].titulo.toUpperCase() === depoisSec[0].toUpperCase(), 'a ordem nova foi gravada no guia');
await pg.locator('[data-ordena="secoes"] > [data-item]').first().locator('.alca').focus();
await pg.keyboard.press('ArrowDown'); await espera(300);
ok((await titulosSec())[1] === depoisSec[0], 'seta do teclado no glifo desce a secao um passo');
ok(await pg.evaluate(() => document.activeElement?.classList.contains('alca')), 'o foco fica no glifo depois de mover');

titulo('cancelar com mudanca pede confirmacao e nao grava');
await pg.locator('[data-cp="cp-ed"]').click();
await espera(300);
await pg.locator('.ov [data-f="titulo"]').fill('NOME ERRADO');
await pg.locator('.ov [data-no]').click();
await espera(300);
ok(await pg.locator('.ov [role=alertdialog]').isVisible(), 'descartar pede confirmacao numa janela do app, nao no confirm do navegador');
await pg.locator('.ov [data-sim]').click();
await espera(300);
ok((await pg.locator('.ov').count()) === 0, 'confirmado o descarte, as duas janelas fecham');
ok(!/NOME ERRADO/.test(await pg.locator('#view').innerText()), 'cancelado nao muda nada');

titulo('elenco: personagens e fotos');
await aba('Elenco');
if (DOM) await foto('r002-aba-Elenco');
ok((await pg.locator('article.pc').count()) === 3, 'tres personagens');
const fotos = await pg.evaluate(() => [...document.querySelectorAll('article.pc .por img')]
  .map(i => ({ mk: i.classList.contains('mk'), src: i.getAttribute('src'), w: i.naturalWidth })));
ok(fotos.length === 6 && fotos.every(f => f.w > 0), 'seis imagens carregaram (3 + 3 de hover)');
ok(fotos.every(f => /^\/midia\/c1\/img\//.test(f.src)), 'todas passam pelo IMG()');
await foto('02-elenco-personagens');

titulo('elenco: criar NPC com imagem, liberar, editar');
await pg.locator('[data-el="npcs"]').click();
await espera(350);
if (DOM) await foto('r003-el-npcs');
await pg.locator('#elNovo').click();
await espera(300);
await pg.locator('.ov [data-f="nome"]').fill('Delegado Rocha');
await pg.locator('.ov [data-f="desc"]').fill('Cansado, honesto.');
await pg.locator('.ov [data-f="segredo"]').fill('Deve dinheiro ao vilão.');
await pg.locator('.ov [data-pk="img"]').click();
await espera(600);
ok((await pg.locator('.eigrid button[data-pick]').count()) > 0, 'seletor lista as imagens');
await pg.locator('.eigrid button[data-pick]').nth(2).click();
await espera(400);
ok((await pg.locator('.ov .pick img').count()) === 1, 'imagem aparece no formulario');
ok((await pg.locator('.ov [data-f="nome"]').inputValue()) === 'Delegado Rocha', 'o que estava digitado nao se perdeu');
await salvar();
ok((await pg.locator('.cad').count()) === 2, 'dois NPCs no elenco');
ok(await pg.locator('.cad .ci img').last().evaluate(i => i.naturalWidth > 0), 'imagem do NPC novo carregou');
await pg.locator('.cad', { hasText: 'Delegado Rocha' }).locator('[data-ellib]').click();
await espera(900);
let ms = await mesa(1);
ok(ms.npcs.length === 1 && ms.npcs[0].id && ms.npcs[0].desc === 'Cansado, honesto.' && !('segredo' in ms.npcs[0]),
  'liberado vai para a mesa com id e sem o segredo');
await pg.locator('.cad', { hasText: 'Delegado Rocha' }).locator('[data-eled]').click();
await espera(300);
await pg.locator('.ov [data-f="nome"]').fill('Delegada Rocha');
await salvar();
await espera(900);
ms = await mesa(1);
ok(ms.npcs.length === 1 && ms.npcs[0].nome === 'Delegada Rocha', 'editar atualiza a copia da mesa em vez de duplicar');
await foto('03-elenco-npcs');

titulo('sessoes: lista, criar, cena e bloco');
await aba('Sess');
if (DOM) await foto('r004-aba-Sess');
ok((await pg.locator('[data-ses]').count()) === 2, 'duas sessoes na lista');
await foto('04-sessoes');
await pg.locator('#sesNova').click();
await espera(300);
await pg.locator('.ov [data-f="titulo"]').fill('O porão');
await salvar();
await espera(400);
ok(await pg.locator('#cvwrap').isVisible(), 'abriu o quadro da sessao nova');
await pg.locator('.terr [data-act="scn-add"]').first().click();
await espera(300);
await pg.locator('.ov [data-f="titulo"]').fill('Descendo a escada');
await salvar();
ok(await pg.locator('.cenasheet').isVisible(), 'cena nova abre para receber conteudo');
await pg.locator('.cenasheet select').selectOption('leitura');
await pg.locator('.cenasheet [data-act="blk-add"]').click();
await espera(300);
await pg.locator('.ov [data-f="texto"]').last().fill('Está escuro.\nCheira a ferro.');
await salvar();
ok(/Está escuro\./.test(await pg.locator('.cenasheet').innerText()), 'bloco de leitura aparece na cena');
await pg.locator('.cenasheet select').selectOption('testes');
await pg.locator('.cenasheet [data-act="blk-add"]').click();
await espera(300);
await pg.locator('.ov [data-addr="itens"]').click();
await espera(250);
await pg.locator('.ov [data-f="itens.0.p"]').fill('Furtividade');
await pg.locator('.ov [data-f="itens.0.t"]').fill('Descer sem ranger');
await pg.locator('.ov [data-f="itens.0.f"]').fill('12 · ninguém ouve');
await pg.locator('.ov [data-addr="itens"]').click();
await espera(250);
await pg.locator('.ov [data-f="itens.1.p"]').fill('Percepção');
await arrastar(pg.locator('.ov .rowed').nth(1).locator('.rowhd'), pg.locator('.ov .rowed').first(), 'antes');
ok((await pg.locator('.ov [data-f="itens.0.p"]').inputValue()) === 'Percepção'
  && (await pg.locator('.ov [data-f="itens.1.t"]').inputValue()) === 'Descer sem ranger',
  'linhas do formulario trocam de lugar arrastando, levando o que ja foi digitado');
await salvar();
ok(/Furtividade/i.test(await pg.locator('.cenasheet').innerText()), 'bloco com linhas repetidas (testes) gravou');
const tiposBloco = () => pg.locator('.cenasheet .sbody > .blk .flb').allInnerTexts();
const blocosAntes = await tiposBloco();
await arrastar(pg.locator('.cenasheet .sbody > .blk').nth(1).locator('.blkhd'), pg.locator('.cenasheet .sbody > .blk').first(), 'antes');
const blocosDepois = await tiposBloco();
ok(blocosDepois[0] === blocosAntes[1] && blocosDepois[1] === blocosAntes[0], 'blocos da cena trocam de lugar arrastando: ' + blocosDepois.join(' | '));
await arrastar(pg.locator('.cenasheet .sbody > .blk').first().locator('.blkhd'), pg.locator('.cenasheet .sbody > .blk').nth(1), 'depois');
ok((await tiposBloco())[0] === blocosAntes[0], 'e voltam arrastando para baixo');
await foto('05-cena');
await pg.locator('.cenasheet .x').click();
await espera(300);
await foto('06-quadro');
const cartaoQ = pg.locator('.cv .card').first();
await cartaoQ.hover();
await espera(500);
ok(await cartaoQ.evaluate(c => { const s = getComputedStyle(c, '::before'); return s.opacity === '1' && s.height === '19px'; }), 'cartao da cena no quadro recebe o efeito do tema, na escala dele');
await pg.mouse.move(5, 5);

titulo('painel do quadro: mover e redimensionar com o mouse');
if (!(await pg.locator('#railFloat').isVisible())) { await pg.click('#railBtn'); await espera(200); }
const caixa = () => pg.locator('#railFloat').boundingBox();
const p0 = await caixa();
// primeiro encolhe: o painel nasce com a altura inteira do quadro e nao teria para onde descer
const gp = await pg.locator('#rfGrip').boundingBox();
await pg.mouse.move(gp.x + 8, gp.y + 8);
await pg.mouse.down(); await pg.mouse.move(gp.x + 108, gp.y - 292, { steps: 6 }); await pg.mouse.up();
await espera(150);
const p1 = await caixa();
ok(Math.abs(p1.width - p0.width - 100) < 4 && Math.abs(p1.height - p0.height + 300) < 4, 'painel mudou de tamanho');
const hd = await pg.locator('#rfHd').boundingBox();
await pg.mouse.move(hd.x + 20, hd.y + hd.height / 2);
await pg.mouse.down(); await pg.mouse.move(hd.x + 320, hd.y + hd.height / 2 + 80, { steps: 6 }); await pg.mouse.up();
await espera(150);
const p2 = await caixa();
ok(Math.abs(p2.x - p1.x - 300) < 4 && Math.abs(p2.y - p1.y - 80) < 4, 'painel mudou de lugar');
await pg.locator('[data-vm="roteiro"]').click(); await espera(300);
await pg.locator('[data-vm="canvas"]').click(); await espera(300);
const p3 = await caixa();
ok(Math.abs(p3.x - p2.x) < 2 && Math.abs(p3.width - p2.width) < 2, 'posicao e tamanho sobrevivem ao redesenho');
await foto('06b-quadro-painel-movido');
await pg.locator('#rfHd').dblclick(); await espera(200);
const p4 = await caixa();
ok(Math.abs(p4.x - p0.x) < 2 && Math.abs(p4.width - p0.width) < 2, 'clique duplo devolve ao lugar');

titulo('roteiro: a cena continua aberta depois de editar');
await pg.locator('[data-vm="roteiro"]').click();
await espera(400);
if (DOM) await foto('r005-vm-roteiro');
ok((await pg.locator('details.scn[open]').count()) === 1, 'a cena recem-criada ja vem aberta no roteiro');
await pg.locator('details.scn[open] [data-act="blk-ed"]').first().click();
await espera(300);
await pg.locator('.ov [data-f="rotulo"]').fill('Leia devagar');
await salvar();
ok((await pg.locator('details.scn[open]').count()) === 1, 'cena segue aberta');
ok(/LEIA DEVAGAR/i.test(await pg.locator('details.scn[open]').innerText()), 'titulo do bloco mudou');

titulo('painel da sessao: puxar NPC do elenco');
await pg.locator('aside.rail details[data-rb="npcs"] summary').click();
await espera(250);
await pg.locator('aside.rail [data-act="el-add"][data-tp="npcs"]').click();
await espera(300);
ok((await pg.locator('.ov [data-add]').count()) === 2, 'oferece os dois NPCs do elenco');
await pg.locator('.ov [data-add]').first().click();
await espera(300);
await pg.locator('.ov .x').last().click();
await espera(300);
ok((await pg.locator('aside.rail details[data-rb="npcs"] .npcrow').count()) === 1, 'NPC entrou na sessao');
ok(await pg.locator('aside.rail details[data-rb="npcs"]').evaluate(d => d.open), 'a caixa do painel continua aberta');
await foto('07-roteiro');

titulo('sessao: blocos da cena aparecem');
await pg.locator('#sesVolta').click();
await espera(350);
await pg.locator('[data-ses]').first().click();
await espera(500);
await pg.locator('[data-vm="roteiro"]').click();
await espera(300);
if (DOM) await foto('r006-vm-roteiro');
await pg.locator('details.scn summary').first().click();
await espera(250);
const cenaAntiga = await pg.locator('details.scn[open]').innerText();
ok(/A chuva não para/.test(cenaAntiga) && /Percepção/i.test(cenaAntiga) && /vê o papel/.test(cenaAntiga), 'leitura e testes da cena');
ok(/OBRIGAT/i.test(cenaAntiga), 'marca "forçado" virou "obrigatório"');

titulo('encerrar sessao: cena pendente passa adiante e o resumo e oferecido');
await pg.locator('details.scn[open] [data-act="ck"]').click();
await espera(300);
await pg.click('#encBtn');
await espera(350);
ok(/Passam adiante 1 de 2/i.test(await pg.locator('.ov').innerText()), 'avisa que uma cena passa adiante');
await pg.click('#encOk');
await espera(600);
ok(await pg.locator('#encRes').isVisible(), 'oferece escrever o resumo');
await pg.click('#encRes');
await espera(350);
ok((await pg.locator('#rN').inputValue()) === '1' && (await pg.locator('#rT').inputValue()) === 'Começo', 'resumo ja vem com numero e titulo');
await pg.locator('#rX').fill('Chegaram na pensão debaixo de chuva.');
await pg.click('#rOk');
await espera(1100);
g = await guia(1);
ok(g.sessoes[0].status === 'encerrada' && g.sessoes[0].cenas.length === 1, 'sessao 1 encerrada, ficou so a cena feita');
ok(g.sessoes[1].cenas.length === 1 && g.sessoes[1].cenas[0].titulo === 'A pensão', 'a cena pendente foi para a sessao 2');
ok(g.sessoes[1].npcIds.length === 1 && g.sessoes[1].territorios.some(t => t.nome === 'CIDADE'), 'elenco e territorio foram junto');
ok((await mesa(1)).resumos.length === 1, 'resumo publicado para a mesa');

titulo('biblioteca');
await aba('Biblioteca');
await espera(400);
if (DOM) await foto('r007-aba-Biblioteca');
ok(/Livro de regras/.test(await pg.locator('#bbList').innerText()), 'lista o livro');
ok(/não veem/i.test(await pg.locator('[data-pub]').innerText()), 'livro comeca privado');
await pg.locator('[data-pub]').click();
await espera(600);
ok(/jogadores veem/i.test(await pg.locator('[data-pub]').innerText()), 'da para tornar o livro publico pela tela');
await foto('08-biblioteca-livros');
ok(/Para que serve/i.test(await pg.locator('#view .aviso').innerText()), 'a aba explica para que servem os livros');
await pg.locator('[data-reidx]').click();
await espera(600);
ok(/80 de 120/i.test(await pg.locator('.toast').last().innerText()), 'reler capitulos responde quantas paginas ganharam capitulo');
await pg.locator('[data-abrir]').first().click();
await espera(1500);
ok((await pg.locator('#pCanvas canvas').count()) === 1, 'visor de PDF desenha a pagina');
ok((await pg.locator('#pTot').innerText()) === '3', 'visor sabe quantas paginas tem');
await pg.locator('#pNext').click();
await espera(250);
ok((await pg.locator('#pCanvas canvas').count()) === 2, 'virar pagina mantem a velha na tela durante a animacao');
ok((await pg.locator('#pCanvas').getAttribute('data-dir')) === 'f', 'a virada sabe a direcao');
await espera(900);
ok((await pg.locator('#pCanvas canvas').count()) === 1 && (await pg.locator('#pNum').inputValue()) === '2', 'depois da virada sobra so a pagina nova');
await pg.locator('#pPrev').click();
await pg.locator('#pPrev').click();
await espera(900);
ok((await pg.locator('#pNum').inputValue()) === '1' && (await pg.locator('#pCanvas canvas').count()) === 1, 'voltar para na primeira pagina');
await pg.locator('.ov .x').last().click();
await espera(300);
await pg.locator('#btnTrilha').click();
await espera(500);
ok(await pg.locator('#plSeek').evaluate(e => getComputedStyle(e).appearance === 'none'), 'barra da musica tem desenho proprio');
ok(await pg.locator('#plVol').evaluate(e => e.style.getPropertyValue('--pct') !== ''), 'volume enche o trilho');
await pg.keyboard.press('Escape');
await espera(300);
await pg.locator('#btnDados').click();
await espera(400);
await pg.locator('[data-dado="20"]').click();
await espera(1200);
const rolou = +(await pg.locator('#ddN').innerText());
ok(rolou >= 1 && rolou <= 20, 'd20 rola um numero de 1 a 20: ' + rolou);
let rols = await (await ctx.request.get(B + '/api/c/1/rolagens')).json();
ok(rols.length === 1 && rols[0].valor === rolou && rols[0].publica === true, 'quem sorteia e o servidor, e a do mestre nasce publica');
ok((await pg.locator('#ddFeed .ddit').count()) === 1, 'rolagem entra na lista da mesa');
await pg.locator('[data-vis="0"]').click();
await pg.locator('[data-dado="6"]').click();
await espera(1200);
rols = await (await ctx.request.get(B + '/api/c/1/rolagens')).json();
ok(rols[0].lados === 6 && rols[0].publica === false, 'mestre escolhe rolar escondido');
ok(/fechada/i.test(await pg.locator('#ddFeed .ddit').first().innerText()), 'rolagem escondida aparece marcada');
await pg.locator('[data-vis="1"]').click();
await ctx.request.post(B + '/__rolagem-de-outro/1');
await espera(3200);
ok(/Jogadora/.test(await pg.locator('#ddFeed').innerText()), 'rolagem de outra pessoa chega na janela aberta');
await pg.keyboard.press('Escape');
await espera(300);
// o aviso dura 4,5s e a sondagem roda a cada 6s: quem conta e um observador, nao uma espera fixa
await pg.evaluate(() => { window.__rol = []; new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
  if (n.classList && n.classList.contains('rol')) window.__rol.push(n.textContent); }))).observe(document.body, { childList: true }); });
await ctx.request.post(B + '/__rolagem-de-outro/1');
/* com o aviso do servidor (SSE) a rolagem chega em menos de 2 s; antes dependia da pergunta de 6 em 6 */
await espera(1800);
ok(await pg.evaluate(() => avisosAoVivo()), 'o aviso da campanha (SSE) esta ligado');
ok((await pg.evaluate(() => window.__rol)).some(t => /Jogadora rolou 1d20: 13/.test(t)), 'rolagem de outra pessoa avisa com a janela fechada, pelo aviso do servidor');
await pg.locator('#btnDados').click();
await espera(400);
await pg.locator('#ddF').fill('2d6+3');
await pg.locator('#ddGo').click();
await espera(1300);
rols = await (await ctx.request.get(B + '/api/c/1/rolagens')).json();
ok(rols[0].formula === '2d6+3' && rols[0].valor >= 5 && rols[0].valor <= 15, 'rolagem por formula: ' + rols[0].detalhe + ' = ' + rols[0].valor);
ok(/=/.test(await pg.locator('#ddDet').innerText()), 'mostra os dados que sairam');
await pg.locator('[data-f="2d20kh1"]').click();
await espera(1300);
rols = await (await ctx.request.get(B + '/api/c/1/rolagens')).json();
ok(rols[0].formula === '2d20kh1', 'atalho de ficar com o maior de dois dados');
await pg.locator('#ddPedir').click();
await espera(400);
await pg.locator('.ov [data-f="rotulo"]').fill('Furtividade');
await pg.locator('.ov [data-f="formula"]').fill('1d20+2');
await salvar();
await espera(600);
rols = await (await ctx.request.get(B + '/api/c/1/rolagens')).json();
ok(rols[0].pedido === true && rols[0].rotulo === 'Furtividade' && rols[0].formula === '1d20+2', 'mestre pede um teste a mesa');
await espera(2800);
ok(/pede/i.test(await pg.locator('#ddFeed .ddit.ped').first().innerText()), 'o pedido aparece na lista da mesa');
await pg.keyboard.press('Escape');
await espera(300);
await pg.locator('#btnRol').click();
await espera(700);
ok(await pg.locator('#rolPainel').isVisible(), 'abre o painel de rolagens');
ok((await pg.locator('#rpFeed .ddit').count()) >= 4, 'o painel mostra as rolagens da mesa');
const antesRp = await pg.locator('#rpFeed .ddit:not(.ped)').count();
await pg.locator('#rpF').fill('3d4');
await pg.locator('#rpGo').click();
await espera(900);
rols = await (await ctx.request.get(B + '/api/c/1/rolagens')).json();
ok(rols[0].formula === '3d4' && (await pg.locator('#rpFeed .ddit:not(.ped)').count()) === antesRp + 1, 'rola direto pelo painel');
ok((await pg.locator('.ov').count()) === 0, 'rolar pelo painel nao abre janela');
const rpBox = await pg.locator('#rpHd').boundingBox();
await pg.mouse.move(rpBox.x + 60, rpBox.y + 10); await pg.mouse.down();
await pg.mouse.move(rpBox.x - 240, rpBox.y + 120, { steps: 6 }); await pg.mouse.up();
const rpG = await pg.evaluate(() => JSON.parse(localStorage.getItem('grim_rolp_g') || 'null'));
ok(!!rpG && Math.abs(rpG.x - (rpBox.x - 300)) < 40, 'o painel de rolagens se move e lembra o lugar');
await aba('Elenco');
if (DOM) await foto('r008-aba-Elenco');
ok(await pg.locator('#rolPainel').isVisible(), 'o painel continua aberto ao trocar de aba');
await pg.locator('#rpX').click();
ok(!(await pg.locator('#rolPainel').isVisible()), 'fecha o painel');
await aba('Biblioteca');
await espera(300);
if (DOM) await foto('r009-aba-Biblioteca');
await pg.locator('[data-ren]').click();
await espera(300);
await pg.locator('.ov [data-f="nome"]').fill('Manual do jogador');
await salvar();
await espera(500);
ok(/Manual do jogador/.test(await pg.locator('#bbList').innerText()), 'da para renomear o livro');
await pg.locator('[data-bib="trilha"]').click();
await espera(500);
if (DOM) await foto('r010-bib-trilha');
ok((await pg.locator('#bbList [data-toca]').count()) === 2, 'duas faixas');
await pg.locator('[data-cated="Ambiente"]').click();
await espera(300);
await pg.locator('.ov [data-f="nome"]').fill('Clima');
await pg.locator('.ov [data-f="cor"]').selectOption({ index: 2 });
await salvar();
await espera(900);
ok(/CLIMA \(1\)/i.test(await pg.locator('#bbList').innerText()), 'categoria da trilha renomeada');
g = await guia(1);
ok(g.trilhaCategorias.some(c => c.id === 'Clima' && c.cor), 'cor da categoria gravada no guia');
ok(JSON.stringify(g.sessoes).includes('"cat":"Clima"'), 'bloco de trilha da cena acompanhou o nome novo');
await pg.locator('[data-fxcat]').last().click();
await espera(300);
await pg.locator('.ov [data-f="categoria"]').fill('Clima');
await salvar();
await espera(700);
ok(/CLIMA \(2\)/i.test(await pg.locator('#bbList').innerText()), 'faixa mudou de categoria');
await pg.locator('[data-bib="imagens"]').click();
await espera(500);
if (DOM) await foto('r011-bib-imagens');
ok((await pg.locator('#bbList img').count()) >= 8, 'imagens listadas');
ok(await pg.locator('#bbList img').first().evaluate(i => i.naturalWidth > 0), 'miniatura carregou');

titulo('ajustes');
await pg.click('#btnAjustes');
await espera(450);
const secs = await pg.locator('[data-aj]').allInnerTexts();
ok(secs.length === 13, 'treze secoes para mestre admin: ' + secs.join(' | '));
ok((await pg.locator('#ajBody h2').first().innerText()).trim() === secs[0].trim(), 'o titulo da secao e o mesmo nome do item do menu');
ok(/^configurações$/i.test((await pg.locator('h1.page').innerText()).trim()) && /configurações/i.test(await pg.locator('#btnAjustes').innerText()), 'a area se chama Configuracoes');
ok(!(await pg.locator('#rodape').isVisible()), 'dentro da campanha nao ha rodape: o suporte fica em Configuracoes');
const grupos = await pg.locator('.ajmenu .ajgt').allInnerTexts();
ok(grupos.length === 3 && /esta campanha/i.test(grupos[0]) && /você/i.test(grupos[1]) && /instância/i.test(grupos[2]), 'o menu de Configuracoes tem os tres grupos de escopo: ' + grupos.join(' | '));
await foto('09-ajustes');
await pg.locator('[data-aj="suporte"]').click();
await espera(300);
if (DOM) await foto('r012-aj-suporte');
await pg.locator('#suM').fill('O mapa nao abre quando clico.');
await pg.locator('#suC').fill('jogador@exemplo.com');
await pg.locator('#suGo').click();
await espera(700);
const sup = await (await ctx.request.get(B + '/__suporte')).json();
ok(sup.length === 1 && /mapa/.test(sup[0].mensagem) && sup[0].contato === 'jogador@exemplo.com' && /tela: ajustes/.test(sup[0].contexto),
  'mensagem de suporte chega ao servidor com o contexto de onde veio');
ok(/registrada/i.test(await pg.locator('#suSt').innerText()), 'sem e-mail configurado, a tela avisa que a mensagem ficou registrada');
await ctx.request.post(B + '/__cheio/1');
await pg.locator('[data-aj="campanha"]').click();
await espera(400);
if (DOM) await foto('r013-aj-campanha');
ok(!/cópia bruta/i.test(await pg.locator('#ajBody').innerText()) && (await pg.locator('#mE, #mI').count()) === 0, 'a copia bruta do guia saiu: o pacote cobre tudo');
await pg.locator('#caCapaEsc').click();
await espera(600);
const [seletor] = await Promise.all([pg.waitForEvent('filechooser'), pg.locator('#eiUp').click()]);
await seletor.setFiles({ name: 'grande.png', mimeType: 'image/png', buffer: Buffer.alloc(2000, 1) });
await espera(1000);
ok(/espaço do servidor acabou/i.test(await pg.locator('.cheio').innerText().catch(() => '')), 'envio com o armazenamento cheio mostra o aviso proprio');
await pg.locator('#chSup').click();
await espera(400);
ok((await pg.locator('.ov #suA').inputValue()) === 'Armazenamento cheio' && /armazenamento/i.test(await pg.locator('.ov #suM').inputValue()),
  'o aviso abre o suporte ja com o assunto certo');
await pg.keyboard.press('Escape');
await espera(300);
await pg.keyboard.press('Escape');
await espera(300);
await ctx.request.post(B + '/__cheio/0');
await pg.locator('[data-aj="admin"]').click();
await espera(500);
if (DOM) await foto('r014-aj-admin');
const arm = await pg.locator('#adArm').innerText();
ok(/compartilhados: 4 cópias evitadas, economizando 305\.2 MB/i.test(arm) && /Campanha de teste/.test(arm), 'administracao mostra o armazenamento e o uso por campanha');
ok(/H2/.test(await pg.locator('#adSis').innerText()) && /1 dia/.test(await pg.locator('#adSis').innerText()), 'administracao mostra banco e tempo no ar');
ok(/Modelo de teste/.test(await pg.locator('#adMod').innerText()), 'administracao lista os modelos de campanha');
ok((await pg.locator('#adMod [data-modcapa]').count()) === 1 && (await pg.locator('#adMod .modcapa img').count()) === 1 && (await pg.locator('#adMod [data-modsemcapa]').count()) === 1,
  'cada modelo mostra a miniatura da capa e os botoes de trocar e tirar a capa');
ok((await pg.locator('#adModCa option').count()) >= 1, 'administracao oferece salvar como modelo uma campanha que a pessoa mestra');
await pg.locator('#adJunta').click();
await espera(500);
ok(/Nada para juntar/i.test(await pg.locator('.toast').last().innerText()), 'juntar arquivos iguais responde na tela');
await ctx.request.post(B + '/__csrf');
await pg.locator('#adReg').click();
await espera(800);
const csrf = await (await ctx.request.post(B + '/__csrf-estado')).json();
ok(csrf.falha === false && csrf.repetiu >= 1 && /Salvo/i.test(await pg.locator('.toast').last().innerText()), 'recusa por token CSRF e repetida sozinha e o ajuste salva');
await pg.locator('#adReg').click();
await espera(500);
ok((await pg.locator('#smS').inputValue()) === '••••••••••••' && (await pg.locator('#iaK').inputValue()) === '••••••••••••'
  && (await pg.locator('#smS').getAttribute('type')) === 'password', 'segredo ja salvo aparece em bolinhas, sem o valor de verdade');
await pg.locator('#smOk').click();
await espera(500);
let uc = await (await ctx.request.get(B + '/__ultconfig')).json();
ok(!('smtpSenha' in uc) && uc.smtpHost === 'smtp.exemplo.com', 'salvar sem mexer na senha nao manda a mascara');
await pg.locator('#smS').fill('senha-nova');
await pg.locator('#smOk').click();
await espera(500);
uc = await (await ctx.request.get(B + '/__ultconfig')).json();
ok(uc.smtpSenha === 'senha-nova' && (await pg.locator('#smS').inputValue()) === 'senha-nova', 'senha nova e enviada e continua no campo depois de salvar');
await pg.locator('#iaKs').click();
await espera(500);
uc = await (await ctx.request.get(B + '/__ultconfig')).json();
ok(!('iaApiKey' in uc), 'salvar a IA sem mexer na chave mantem a chave guardada');
await pg.locator('#smV').selectOption('resend');
ok(await pg.locator('#smSmtp').isHidden() && await pg.locator('#smKey').isVisible() && /resend\.com/i.test(await pg.locator('#smDica').innerText()), 'trocar o provedor de e-mail mostra so os campos dele');
await pg.locator('#smV').selectOption('smtp');
await pg.locator('[data-aj="mesa"]').click();
await espera(500);
if (DOM) await foto('r015-aj-mesa');
ok(/Jogadora/.test(await pg.locator('#ajBody').innerText()), 'lista quem esta na mesa');
await pg.click('#cvGo');
await espera(500);
ok(/convite=tok/.test(await pg.locator('#ajBody').innerText()), 'gera link de convite');
ok((await pg.locator('[data-rol="1"]').getAttribute('aria-pressed')) === 'true', 'rolagens dos jogadores comecam abertas');
await pg.locator('[data-rol="0"]').click();
await espera(500);
ok((await (await ctx.request.get(B + '/api/campanhas')).json()).find(c => c.id === 1).rolagensAbertas === false, 'mestre fecha as rolagens da mesa');
ok((await pg.locator('[data-rol="0"]').getAttribute('aria-pressed')) === 'true', 'a escolha fica marcada');
await pg.locator('[data-rol="1"]').click();
await espera(500);
await pg.locator('[data-aj="vocab"]').click();
await espera(400);
if (DOM) await foto('r016-aj-vocab');
await pg.locator('[data-voc="sessoes"]').fill('Capítulos');
await pg.click('#vcGo');
await espera(500);
ok(/CAP[ÍI]TULOS/i.test((await pg.locator('#tabs .tab').allInnerTexts()).join(' ')), 'vocabulario muda o nome da aba');
await pg.locator('[data-aj="conta"]').click();
await espera(400);
if (DOM) await foto('r017-aj-conta');
await pg.fill('#cnNome', 'Outro nome');
await pg.click('#cnNomeOk');
await espera(400);
await pg.fill('#cnAtual', 'errada');
await pg.fill('#cnNova', 'nova-senha1');
await pg.fill('#cnNova2', 'nova-senha1');
await pg.click('#cnSenhaOk');
await espera(400);
ok((await pg.locator('#cnAtual').inputValue()) === 'errada', 'senha errada nao limpa os campos');
await pg.fill('#cnAtual', 'segredo123');
await pg.click('#cnSenhaOk');
await espera(400);
ok((await pg.locator('#cnAtual').inputValue()) === 'nova-senha1' && (await pg.locator('#cnNova').inputValue()) === 'nova-senha1'
  && (await pg.locator('#cnAtual').getAttribute('type')) === 'password', 'senha trocada continua nos campos, em bolinhas');
await pg.locator('[data-aj="campanha"]').click();
await espera(400);
if (DOM) await foto('r018-aj-campanha');
await pg.click('#caCapaEsc');
await espera(600);
await pg.locator('.eigrid button[data-pick]').first().click();
await espera(700);
const camps = await (await ctx.request.get(B + '/api/campanhas')).json();
ok(/^img\//.test(camps.find(c => c.id === 1).capa || ''), 'capa escolhida nos ajustes vai para a campanha');
ok(await pg.locator('#caCapa img').evaluate(i => i.naturalWidth > 0), 'previa da capa carrega nos ajustes');
await pg.locator('[data-aj="aparencia"]').click();
await espera(300);
if (DOM) await foto('r019-aj-aparencia');
ok((await pg.locator('button[data-tema]').count()) === 11, 'onze temas');
ok((await pg.locator('.temagen').count()) === 5, 'temas agrupados em cinco estilos');
ok(await pg.evaluate(() => document.documentElement.getAttribute('data-tema')) === 'sangue', 'html sabe o tema em uso');
await pg.locator('[data-tema="veu"]').click();
await espera(700);
ok(await pg.evaluate(() => document.documentElement.getAttribute('data-estilo')) === 'misterio', 'tema troca o estilo da pagina');
ok(await pg.evaluate(() => /Cormorant/.test(getComputedStyle(document.querySelector('h1,h2')).fontFamily)), 'estilo troca a letra dos titulos');
ok(await pg.evaluate(() => document.fonts.check('700 20px "Cormorant Garamond"')), 'fonte do estilo carrega do vendor');
await foto('09c-tema-misterio');
await pg.locator('[data-tema="neon"]').click();
await espera(700);
ok(await pg.evaluate(() => document.fonts.check('800 20px "Oxanium"')), 'fonte da ficcao carrega');
await pg.locator('[data-mov="0"]').click();
ok(await pg.evaluate(() => document.documentElement.getAttribute('data-fx')) === 'off', 'da para desligar as animacoes');
await pg.locator('[data-mov="1"]').click();
await pg.locator('#temaLimpa').click();
await espera(700);
ok(await pg.evaluate(() => document.documentElement.getAttribute('data-estilo')) === 'terror', 'voltar ao tema da mesa desfaz o estilo');
await pg.locator('[data-aj="campanha"]').click();
await espera(400);
if (DOM) await foto('r020-aj-campanha');
await pg.locator('#caTema').selectOption('veu');
await espera(1200);
ok((await mesa(1)).tema === 'veu', 'mestre define o tema sugerido da campanha');
ok(await pg.evaluate(() => document.documentElement.getAttribute('data-tema')) === 'veu', 'sem tema pessoal, a sugestao ja veste a tela');
await pg.locator('[data-aj="aparencia"]').click();
await espera(400);
if (DOM) await foto('r021-aj-aparencia');
ok((await pg.locator('.temacard[data-tema="veu"] .tsug').count()) === 1 && (await pg.locator('.tsug').count()) === 1, 'o tema sugerido leva a etiqueta na lista');
await pg.locator('[data-som="1"]').click();
ok(await pg.evaluate(() => localStorage.getItem('grim_som')) === '1', 'da para ligar os sons');
await pg.locator('[data-som="0"]').click();
await pg.locator('[data-aj="campanha"]').click();
await espera(400);
if (DOM) await foto('r022-aj-campanha');
await pg.locator('#caTema').selectOption('');
await espera(1200);
ok(await pg.evaluate(() => document.documentElement.getAttribute('data-tema')) === 'sangue', 'tirar a sugestao volta ao padrao');
await pg.locator('[data-aj="aparencia"]').click();
await espera(300);
if (DOM) await foto('r023-aj-aparencia');

titulo('busca configuravel');
await pg.locator('[data-aj="busca"]').click();
await espera(300);
if (DOM) await foto('r024-aj-busca');
await pg.click('#bsCat');
await espera(300);
await pg.locator('.ov [data-addr="l"]').click();
await espera(200);
await pg.locator('.ov [data-f="l.0.nome"]').fill('Combate');
await pg.locator('.ov [data-f="l.0.termos"]').fill('ataque\ndano');
await salvar();
await pg.click('#bsSin');
await espera(300);
await pg.locator('.ov [data-addr="l"]').click();
await espera(200);
await pg.locator('.ov [data-f="l.0.termo"]').fill('PV');
await pg.locator('.ov [data-f="l.0.iguais"]').fill('pontos de vida');
await salvar();
await pg.click('#bsCan');
await espera(300);
await pg.locator('.ov [data-addr="l"]').click();
await espera(200);
await pg.locator('.ov [data-f="l.0.termo"]').fill('agarrar');
await pg.locator('.ov [data-f="l.0.paginas"]').fill('lb 78 | Manobras');
await salvar();
await espera(900);
g = await guia(1);
ok(g.campanha.categoriasBusca.length === 1 && g.campanha.sinonimos.pv[0] === 'pontos de vida'
  && JSON.stringify(g.campanha.canonicas.agarrar) === '[["LB",78,"Manobras"]]', 'assunto, sinonimo e pagina certa gravados no guia');
ok((await mesa(1)).categoriasBusca.length === 1, 'assuntos vao para a mesa do jogador');

titulo('indice dos livros editavel');
await aba('Campanha');
if (DOM) await foto('r025-aba-Campanha');
await pg.locator('[data-cp="sec-add"]').click();
await espera(300);
await pg.locator('.ov [data-v="indice"]').click();
await espera(300);
await pg.locator('.ov [data-addr="livros"]').click();
await espera(200);
await pg.locator('.ov [data-f="livros.0.doc"]').fill('lb');
await pg.locator('.ov [data-f="livros.0.linhas"]').fill('Combate | 70\n- Iniciativa | 71\n-- Surpresa | 72\nMagia');
await salvar();
await espera(900);
g = await guia(1);
const ix =g.campanha.indiceAS[0];
ok(ix.doc === 'LB' && ix.grupos.length === 2 && ix.grupos[0].p === 70 && ix.grupos[0].itens[0].sub[0].p === 72, 'indice montado a partir das linhas');
ok((await pg.locator('.idx .pg').count()) === 3, 'tres atalhos de pagina na tela');
await pg.click('#btnAjustes');
await espera(300);

titulo('atalho de busca');
await pg.click('#btnAjustes');
await espera(350);
await pg.keyboard.press('/');
await espera(400);
ok(await pg.locator('#bq').isVisible(), '/ abre a busca');
await pg.locator('#bq').fill('rocha');
await espera(500);
ok(/Delegada Rocha/.test(await pg.locator('#br').innerText()), 'a busca acha o NPC do elenco');
await pg.keyboard.press('Escape');
await espera(300);
ok((await pg.locator('.ov').count()) === 0, 'Esc fecha');

titulo('mesa na visao do mestre');
await aba('Mesa');
if (DOM) await foto('r026-aba-Mesa');
await pg.locator('[data-msec="quem"]').click();
await espera(400);
if (DOM) await foto('r027-msec-quem');
ok(await pg.locator('.qcard img').first().evaluate(i => i.naturalWidth > 0), 'foto do NPC liberado carrega na mesa');
await pg.click('#mLib');
await espera(350);
ok((await pg.locator('.ov [data-lib]').count()) === 4, 'liberar lista o elenco inteiro (2 NPCs, 1 local, 1 pista)');
await pg.locator('.ov .x').click();
await espera(300);
ok(await pg.locator('.qcard').first().evaluate(c => getComputedStyle(c, '::before').content !== 'none'), 'bloco de pessoa na mesa recebe o efeito do tema');
await pg.locator('[data-msec="resumos"]').click();
await espera(300);
if (DOM) await foto('r028-msec-resumos');
await pg.locator('#mAddRes').click();
await espera(300);
ok(/^\d{2}\/\d{2}\/\d{4}$/.test(await pg.locator('#rD').inputValue()), 'resumo novo ja vem com a data de hoje');
await pg.locator('#rD').fill('');
await pg.locator('#rD').pressSequentially('12012026');
ok((await pg.locator('#rD').inputValue()) === '12/01/2026', 'a data ganha as barras enquanto digita');
await pg.locator('#rN').fill('1');
await pg.locator('#rT').fill('Primeira noite');
await pg.locator('#rX').fill('Chegaram na pensao.');
await pg.locator('#rOk').click();
await espera(500);
await pg.locator('#mAddRes').click();
await espera(300);
await pg.locator('#rD').fill('');
await pg.locator('#rD').pressSequentially('31022026');
await pg.locator('#rT').fill('Segunda noite');
await pg.locator('#rX').fill('O porao.');
await pg.locator('#rOk').click();
await espera(400);
ok((await pg.locator('.ov #rOk').count()) === 1, 'data que nao existe (31/02) nao deixa publicar');
await pg.locator('#rD').fill('');
await pg.locator('#rD').pressSequentially('15022026');
await pg.locator('#rOk').click();
await espera(600);
const ordem = await pg.locator('.resitem summary').allInnerTexts();
const iS = ordem.findIndex(x => /Segunda/.test(x)), iP = ordem.findIndex(x => /Primeira/.test(x));
ok(iS === 0 && iP > iS, 'resumos do mais novo para o mais antigo: ' + JSON.stringify(ordem));
ok((await pg.locator('.resitem[open]').count()) === 1 && /O porao/.test(await pg.locator('.resitem[open]').innerText()), 'so um resumo aberto por vez, o mais novo');
await pg.locator('.resitem summary').filter({ hasText: 'Primeira' }).click();
await espera(400);
ok((await pg.locator('.resitem[open]').count()) === 1 && /pensao/i.test(await pg.locator('.resitem[open]').innerText()), 'abrir outro resumo fecha o anterior');
ok((await mesa(1)).resumos.some(r => r.data === '15/02/2026'), 'data gravada no formato certo');
await foto('15-resumos');

titulo('abertura de capitulo e iniciativa');
await pg.locator('#tabs .tab').nth(1).click();
await espera(500);
await pg.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('grim_cap_')).forEach(k => localStorage.removeItem(k)));
await pg.locator('[data-ses]').first().click();
await espera(250);
ok((await pg.locator('.capitulo').count()) === 1, 'abrir uma sessao mostra o cartao de capitulo');
await espera(1300);
await pg.locator('#sesVolta').click(); await espera(300);
await pg.locator('[data-ses]').first().click(); await espera(250);
ok((await pg.locator('.capitulo').count()) === 0, 'reabrir a mesma sessao no mesmo dia nao cobre a tela de novo');
await espera(2700);
ok((await pg.locator('.capitulo').count()) === 0, 'o cartao some sozinho');
await pg.locator('#iniBtn').click();
await espera(300);
await pg.locator('#iniPux').click();
await espera(500);
const nIni = await pg.locator('.inichip').count();
ok(nIni >= 3, 'puxa o elenco para a iniciativa: ' + nIni);
await pg.locator('#iniRol').click();
await espera(300);
await pg.locator('.ov [data-f="f"]').fill('1d20+1');
await salvar();
await espera(600);
ok((await pg.locator('.inichip b').allInnerTexts()).every(x => /^\d+$/.test(x.trim())), 'rola a iniciativa de quem estava sem valor');
const vez1 = await pg.locator('.inichip.vez span').first().innerText();
await pg.locator('#iniProx').click();
await espera(1000);
ok((await pg.locator('.inichip.vez span').first().innerText()) !== vez1, 'proximo passa a vez');
const mIni = (await mesa(1)).ini;
ok(!!mIni && mIni.lista.length === nIni && mIni.vez === 1, 'a ordem vai para a mesa dos jogadores');
ok(mIni.lista.some(x => x.nome === '???') || nIni === 3, 'NPC entra na ordem com o nome escondido dos jogadores');
await foto('13-iniciativa');

titulo('iniciativa na tela do mapa');
await pg.locator('#tabs .tab[data-aba="mapa"]').click(); await espera(1500);
ok(await pg.locator('#iniBtn').getAttribute('aria-pressed') === 'true' && (await pg.locator('.inibar .inichip').count()) === nIni, 'a barra de iniciativa aparece sobre o mapa, com a mesma ordem');
/* o elo da iniciativa e o token (decisao 15): sem token na ordem o servidor nao tem turno para avisar */
await pg.evaluate(() => { const s = mpSessaoIni(), ts = MP.els.filter(e => e.tipo === 'TOKEN'); iniDe(s).lista.forEach((x, i) => { x.tokenId = String(ts[i % ts.length].id); }); iniMudou(s); });
await espera(800);
const vezMapa = await pg.locator('.inibar .inichip.vez span').first().innerText();
await pg.locator('#iniProx').click(); await espera(1200);
ok(await pg.locator('#mpCanvas').isVisible() && (await pg.locator('.inibar .inichip.vez span').first().innerText()) !== vezMapa, 'passar a vez pelo mapa funciona e o mapa continua na tela');
await foto('16-mapa-iniciativa');
ok(/turno 1/i.test(await pg.locator('.inibar .inirod').innerText()), 'a iniciativa fala em turno, como o mapa');
await pg.evaluate(() => { MP.avisouEm = 0; });
for (let i = 0; i <= nIni && !/turno 2/i.test(await pg.locator('.inibar .inirod').innerText()); i++) { await pg.locator('#iniProx').click(); await espera(500); }
await espera(300);
ok(/turno 2/i.test(await pg.locator('.inibar .inirod').innerText()) && (await pg.locator('.toast', { hasText: /Turno 2 começou/ }).count()) >= 1, 'a ordem dar a volta comeca o turno 2 e avisa na tela');

titulo('fichas');
await aba('Mesa');
if (DOM) await foto('r029-aba-Mesa');
ok((await pg.locator('#mIni .inichip').count()) === nIni, 'a mesa mostra a ordem de iniciativa');
await pg.locator('[data-msec="fichas"]').click();
await espera(600);
if (DOM) await foto('r030-msec-fichas');
await pg.locator('#fxNova').click();
await espera(700);
ok(await pg.locator('.fichasheet #fxNome').isVisible() && (await pg.locator('#fxEd').getAttribute('aria-pressed')) === 'true',
  'a ficha nova abre na propria ficha, ja no modo edicao');
await pg.locator('#fxNome').fill('Aria');
await pg.locator('.fxsec.ed [data-fv]').first().fill('Ladina');
const nCampos = await pg.locator('.fxsec.ed [data-fr]').count();
await pg.locator('[data-fadd]').first().click(); await espera(200);
await pg.locator('.menu [data-v="num"]').click(); await espera(300);
await pg.keyboard.type('Sorte');
await espera(1000);
let fichas = await (await ctx.request.get(B + '/api/c/1/fichas')).json();
let aria = JSON.parse(fichas[0].json);
ok(fichas[0].nome === 'Aria' && aria.campos[0].val === 'Ladina', 'nome e valor editados no lugar gravam sozinhos');
ok(aria.campos.length === nCampos + 1 && aria.campos.some(c => c.rot === 'Sorte' && c.tipo === 'num'), '+ Campo poe um campo do tipo escolhido, com o foco no rotulo');
await foto('14a-ficha-edicao');
const iSorte = aria.campos.findIndex(c => c.rot === 'Sorte');
await pg.locator(`[data-fmenu="${iSorte}"]`).click(); await espera(200);
await pg.locator('.menu [data-v="rm"]').click(); await espera(1000);
fichas = await (await ctx.request.get(B + '/api/c/1/fichas')).json();
ok(!JSON.parse(fichas[0].json).campos.some(c => c.rot === 'Sorte') && (await pg.locator('.toast', { hasText: /Desfazer/ }).count()) >= 1,
  'remover um campo pelo menu dele tira o campo e oferece desfazer');
await pg.locator('#fxVisao').fill('9'); await espera(1000);
fichas = await (await ctx.request.get(B + '/api/c/1/fichas')).json();
ok(JSON.parse(fichas[0].json).visao === 9, 'o alcance da visao escrito na ficha fica na ficha');
await pg.locator('#fxVisao').fill(''); await espera(1000);
fichas = await (await ctx.request.get(B + '/api/c/1/fichas')).json();
ok(JSON.parse(fichas[0].json).visao === undefined, 'apagar o campo tira o alcance da ficha (volta o padrao do mapa)');
await pg.locator('#fxIcone').click(); await espera(600);
await pg.locator('.ov [data-pick]').first().click(); await espera(1000);
fichas = await (await ctx.request.get(B + '/api/c/1/fichas')).json();
ok(/^img\//.test(JSON.parse(fichas[0].json).img || '') && await pg.locator('.fxavaimg img').count() === 1, 'o icone escolhido na ficha fica nela');
await pg.locator('#fxEd').click(); await espera(400);
ok((await pg.locator('.fxsec').count()) >= 4 && (await pg.locator('#fxNome').count()) === 0, 'o lapis volta a ficha de jogo, com as secoes do modelo');
await foto('14-ficha');
await pg.locator('#fxTokImg').click(); await espera(600);
await pg.locator('.ov [data-pick]').nth(1).click(); await espera(1000);
fichas = await (await ctx.request.get(B + '/api/c/1/fichas')).json();
const imgToken = JSON.parse(fichas[0].json).token || '';
ok(imgToken.startsWith("img/") && imgToken !== JSON.parse(fichas[0].json).img && /Trocar/.test(await pg.locator('#fxTokImg').innerText()),
  'a imagem do token se escolhe na ficha e fica separada do icone');
await pg.locator('#fxTokPor').click(); await espera(600);
if (await pg.locator('.ov [data-mp-pega]').count()) { await pg.locator('.ov [data-mp-pega]').first().click(); await espera(800); }
const toks = await (await ctx.request.get(B + '/api/c/1/fichas/' + fichas[0].id + '/tokens')).json();
ok(toks.length === 1 && (await pg.locator('.fxtoks li').count()) === 1, 'Pôr num mapa cria um token ligado a ficha e ele aparece nela');
ok(toks[0].img === imgToken, 'o token posto pela ficha nasce com a imagem do token dela, nao com o icone');
await pg.locator('[data-fxsolta]').first().click(); await espera(800);
ok((await (await ctx.request.get(B + '/api/c/1/fichas/' + fichas[0].id + '/tokens')).json()).length === 0, 'Desligar tira o token da ficha');
await pg.locator('[data-fb][data-d="1"]').first().click();
await espera(1000);
fichas = await (await ctx.request.get(B + '/api/c/1/fichas')).json();
ok(JSON.parse(fichas[0].json).campos.find(c => c.tipo === 'barra').val === '1', 'mexer na barra grava a ficha');
await pg.locator('.fxnum').first().click();
await espera(1500);
rols = await (await ctx.request.get(B + '/api/c/1/rolagens')).json();
ok(/Aria/.test(rols[0].rotulo) && rols[0].formula === '1d20+0', 'clicar num numero da ficha rola com o nome dela: ' + rols[0].rotulo);
await pg.keyboard.press('Escape');
await espera(300);
await pg.keyboard.press('Escape');
await espera(300);
const pdfFicha = await (await ctx.request.get(B + '/__ficha.pdf')).body();
await pg.locator('#fxArq').setInputFiles({ name: 'lia.pdf', mimeType: 'application/pdf', buffer: pdfFicha });
await espera(2500);
ok((await pg.locator('#fxNome').inputValue().catch(() => '')) === 'Lia', 'importa ficha de PDF e acha o nome (a ficha abre no modo edicao para conferir)');
await pg.keyboard.press('Escape');
await espera(900);
fichas = await (await ctx.request.get(B + '/api/c/1/fichas')).json();
const lia = JSON.parse((fichas.find(f => f.nome === 'Lia') || { json: '{"campos":[]}' }).json).campos;
ok(lia.some(c => /forca/i.test(c.rot) && c.tipo === 'num' && c.val === '3'), 'numero do PDF vira campo de rolar');
ok(lia.some(c => /vida/i.test(c.rot) && c.tipo === 'barra' && c.val === '7' && c.max === '10'), 'atual/maximo do PDF vira barra');
ok(lia.some(c => /conceito/i.test(c.rot) && c.sec === 'Identidade'), 'rotulo que existe no modelo cai na secao do modelo');
/* ficha pelos livros: um livro simulado no indice, so neste trecho */
const livro = { docs: [{ id: 'lb', abrev: 'LB', nome: 'Livro Basico', paginas: 40 }], pages: [
  { d: 'lb', p: 10, s: 'Personagem', t: ['Criando seu personagem', 'Os atributos são: Força, Agilidade, Intelecto, Presença e Vigor.'].join('\n') },
  { d: 'lb', p: 11, s: 'Atributos', t: ['Atributos', 'Força', 'Agilidade', 'Intelecto', 'Presença', 'Vigor', 'Seus Pontos de Vida (PV) iniciais são 20 + Vigor.'].join('\n') },
  { d: 'lb', p: 20, s: 'Perícias', t: ['Perícias', 'Acrobacia (Agi)', 'Atletismo (For)', 'Ciências (Int)', 'Diplomacia (Pre)', 'Furtividade (Agi)', 'Luta (For)', 'Pontaria (Agi)', '', 'Role 1d20 e some o bônus.'].join('\n') },
  { d: 'lb', p: 21, s: 'Perícias', t: 'Acrobacia (Agi): você se equilibra. Luta (For) e Pontaria (Agi) servem no combate. Role 1d20.' },
  { d: 'lb', p: 30, s: 'Combate', t: 'A Defesa é 10 + Agilidade. Seus PV caem com dano. Role 1d20+2.' },
  { d: 'lb', p: 31, s: 'Combate', t: 'Quando seus PV chegam a 0 você cai. A Defesa sobe com escudo. 1d20.' },
  { d: 'lb', p: 32, s: 'Combate', t: 'Recuperar PV. Defesa. 1d20.' }] };
await pg.route('**/api/c/1/indice', r => r.fulfill({ json: livro }));
await pg.evaluate(() => { IDX = null; IDXp = null; window.__modeloAntes = JSON.stringify({ m: MESA.fichaModelo, f: MESA.fichaFormula }); });
await pg.locator('#fxLivros').click(); await espera(1500);
const lidos = await pg.locator('.ov .flcampo').allInnerTexts();
ok(lidos.some(x => /Agilidade/.test(x)) && lidos.some(x => /Acrobacia/.test(x)) && lidos.some(x => x.includes('Pontos de vida (PV)')) && lidos.some(x => /Defesa/.test(x)),
  'Montar pelos livros acha atributos, pericias, recursos e combate no texto dos PDFs: ' + lidos.length + ' campos');
ok(await pg.locator('#flFormula').inputValue() === '1d20+{v}', 'e sugere a rolagem pelo dado que os livros mais usam');
await foto('14b-ficha-livros');
await pg.locator('.ov .flcampo', { hasText: 'Furtividade' }).locator('input').uncheck();
await pg.locator('#flModelo').click(); await espera(800);
const mod = await pg.evaluate(() => MESA.fichaModelo);
ok(mod.some(c => c.rot === 'Agilidade' && c.sec === 'Atributos' && c.tipo === 'num') && !mod.some(c => c.rot === 'Furtividade') && mod.some(c => /Pontos de vida/i.test(c.rot) && c.tipo === 'barra'),
  'Usar como modelo grava so os campos marcados, com secao e tipo');
await pg.locator('#flFicha').click(); await espera(800);
await pg.locator('#fxNome').fill('Bruma'); await espera(1000); await pg.keyboard.press('Escape'); await espera(300);
fichas = await (await ctx.request.get(B + '/api/c/1/fichas')).json();
const bruma = JSON.parse((fichas.find(f => f.nome === 'Bruma') || { json: '{"campos":[]}' }).json).campos;
ok(bruma.some(c => c.rot === 'Acrobacia' && c.sec === 'Perícias'), 'Criar uma ficha com isso cria a ficha com os campos achados');
await pg.unroute('**/api/c/1/indice');
await pg.evaluate(() => { const a = JSON.parse(window.__modeloAntes); MESA.fichaModelo = a.m; MESA.fichaFormula = a.f; salvarMesa(); IDX = null; IDXp = null; });
await espera(800);
const pdfImg = await (await ctx.request.get(B + '/__ficha-imagem.pdf')).body();
await pg.evaluate(() => { window.__toasts = []; new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
  if (n.classList && n.classList.contains('toast')) window.__toasts.push(n.textContent); }))).observe(document.body, { childList: true, subtree: true }); });
await pg.locator('#fxArq').setInputFiles({ name: 'escaneada.pdf', mimeType: 'application/pdf', buffer: pdfImg });
await espera(1500);
ok((await pg.evaluate(() => window.__toasts)).some(x => /só imagem.*IA/i.test(x)), 'PDF so imagem sem IA explica que precisa da IA');
await ctx.request.post(B + '/__ia/1');
await pg.reload();
await espera(1600);
await aba('Mesa');
if (DOM) await foto('r031-aba-Mesa');
await pg.locator('[data-msec="fichas"]').click();
await espera(700);
if (DOM) await foto('r032-msec-fichas');
await pg.locator('#fxArq').setInputFiles({ name: 'escaneada.pdf', mimeType: 'application/pdf', buffer: pdfImg });
await espera(3000);
const imp = await (await ctx.request.get(B + '/__ultimport')).json();
ok(imp.imagens === 1 && imp.tam > 1000, 'PDF so imagem vai desenhado para a IA ler: ' + JSON.stringify(imp));
ok((await pg.locator('#fxNome').inputValue().catch(() => '')) === 'Da imagem', 'a ficha lida da imagem abre para conferir');
await pg.keyboard.press('Escape');
await espera(800);
await pg.locator('[data-ficha]').filter({ hasText: 'Da imagem' }).click();
await espera(500);
await pg.locator('#fxMod').click();
await espera(800);
ok(((await mesa(1)).fichaModelo || []).map(c => c.rot).join(',') === 'AGI,FOR,PV', 'mestre usa uma ficha como modelo da campanha');
await pg.keyboard.press('Escape');
await espera(300);
await ctx.request.post(B + '/__ia/0');
await pg.reload();
await espera(1600);

titulo('home de campanhas');
await pg.click('#brandHome');
await espera(700);
ok((await pg.locator('[data-entrar]').count()) === 3, 'lista as tres campanhas');
const capa = await pg.locator('[data-entrar="1"] .ccimg img').evaluate(i => ({ src: i.getAttribute('src'), w: i.naturalWidth }));
ok(/^\/midia\/c1\/img\//.test(capa.src) && capa.w > 0, 'capa aparece no cartao da home: ' + capa.src);
ok((await pg.locator('[data-entrar="2"] .ccini').count()) === 1, 'campanha sem capa mostra a inicial');
ok(await pg.locator('[data-entrar="1"] .ccses').innerText() === 'Próxima: Sessão 1 · A chegada'
  && await pg.locator('[data-entrar="3"] .ccses').innerText() === 'Última: Capítulo 4 · O porão'
  && (await pg.locator('[data-entrar="2"] .ccses').count()) === 0, 'o cartao mostra a sessao da vez, com a palavra da campanha, e nada sem sessao');
ok(!/direitos reservados/i.test(await pg.locator('#rodape').innerText()) && await pg.locator('#rodape').isVisible(), 'fora da campanha o rodape aparece, sem o aviso de direitos');
await pg.locator('#rdSup').click();
await espera(400);
ok(await pg.locator('.ov #suM').isVisible() && await pg.locator('.ov #suA').isVisible(), 'o rodape abre o contato com o suporte numa janela');
await pg.keyboard.press('Escape');
await espera(300);
await foto('09b-home-campanhas');
const txt = await pg.locator('#view').innerText();
ok(/você mestra/i.test(txt) && /você joga/i.test(txt), 'mostra os dois papeis');
ok(await pg.locator('#btnAjustes').isVisible() && !(await pg.locator('#btnBusca').isVisible()), 'fora da campanha: ajustes sim, busca nao');

titulo('criar campanha: como começar');
await pg.click('#ncAbreCriar');
await espera(500);
ok((await pg.locator('input[name=ncOrigem]').count()) === 3, 'como comecar: em branco, o modelo da instancia e pacote');
ok(await pg.locator('#ncOrigens input[value=branco]').isChecked(), 'em branco vem marcado');
await pg.locator('.origem img').waitFor();
ok(await pg.locator('.origem img').evaluate(i => i.complete && i.naturalWidth > 0), 'o cartao do modelo mostra a capa');
ok(await pg.locator('#ncPacLinha').isHidden(), 'o botao do pacote fica escondido fora da opcao pacote');
await pg.locator('.origem:has(input[value="m:modeloteste1"])').click();
ok((await pg.inputValue('#ncNome')) === '' && (await pg.inputValue('#ncSis')) === 'd20 genérico', 'escolher o modelo preenche so o sistema; o nome e de quem cria');
await foto('09c-criar-de-modelo');
await pg.locator('.origem:has(input[value=pacote])').click();
ok(await pg.locator('#ncPacLinha').isVisible() && (await pg.inputValue('#ncSis')) === '', 'pacote mostra o botao e tira o sistema que o modelo tinha posto');
await pg.fill('#ncSis', 'Meu sistema');
await pg.locator('.origem:has(input[value="m:modeloteste1"])').click();
ok((await pg.inputValue('#ncSis')) === 'Meu sistema', 'sistema digitado nao e trocado pelo do modelo');
await pg.locator('.origem:has(input[value=branco])').click();
await pg.fill('#ncSis', '');
await pg.click('#ncAbreCriar');
await espera(300);

titulo('campanha em branco');
await pg.locator('[data-entrar="2"]').click();
await espera(1200);
ok(/Primeiros passos/i.test(await pg.locator('#view').innerText()), 'mostra os primeiros passos');
const feitos = await pg.locator('.passo.ok').count();
ok((await pg.locator('.passo').count()) === 5 && feitos <= 1, 'cinco passos; so o da biblioteca pode vir feito (o stub ja tem arquivos)');
await foto('10-em-branco');
await pg.locator('[data-cp="ir-elenco"]').click();
await espera(400);
await pg.locator('#elNovo').click();
await espera(300);
await pg.locator('.ov [data-f="nome"]').fill('Heroína');
await salvar();
ok((await pg.locator('article.pc').count()) === 1 && (await pg.locator('article.pc .semfoto').count()) === 1, 'personagem criado, sem foto');
await aba('Campanha');
if (DOM) await foto('r033-aba-Campanha');
ok((await pg.locator('.passo.ok').count()) === feitos + 1, 'o passo dos personagens ficou marcado');
await aba('Sess');
if (DOM) await foto('r034-aba-Sess');
ok(/Nenhuma/.test(await pg.locator('#view').innerText()), 'lista de sessoes vazia tem explicacao');

titulo('guia em formato antigo fica protegido');
const gVelho = await (await ctx.request.get(B + '/api/c/2/guia')).json();
await ctx.request.put(B + '/api/c/2/guia', { data: { json: JSON.stringify({ versao: 2, campanha: { titulo: 'Velha', corpos: [] }, sessoes: [] }), versao: gVelho.versao } });
const vAntes = (await (await ctx.request.get(B + '/api/c/2/guia')).json()).versao;
await pg.reload();
await espera(2200);
ok(/formato antigo/i.test(await pg.locator('#view').innerText()), 'guia em formato antigo abre com aviso, sem converter');
await pg.locator('#vwRetry').click();
await espera(900);
ok(/formato antigo/i.test(await pg.locator('#view').innerText()), '"Tentar de novo" continua recusando o guia antigo');
await pg.evaluate(() => { try { save(); } catch (e) {} });
await espera(1200);
const gDep = await (await ctx.request.get(B + '/api/c/2/guia')).json();
ok(gDep.versao === vAntes && /Velha/.test(gDep.json) && JSON.parse(gDep.json).versao === 2, 'e o que esta no servidor nao e regravado');

titulo('jogador');
await pg.click('#brandHome');
await espera(600);
await pg.locator('[data-entrar="3"]').click();
await espera(1100);
ok((await pg.locator('#tabs .tab:not(.tabmais)').count()) === 8 && (await pg.locator('#tabs .tab[data-aba="mapa"]').count()) === 1, 'as secoes da mesa e o Mapa sao as abas do jogador');
ok(await pg.locator('.tour').isVisible() && /guia inicial/i.test(await pg.locator('.tourn').innerText()), 'primeiro acesso do jogador abre o guia inicial do jogador');
const tj = await andaTour();
ok(tj.faltas.length === 0 && tj.n >= 12 && tj.n <= 13, 'o guia inicial do jogador passa por cada aba: ' + tj.n + ' passos que acham o elemento' + (tj.faltas.length ? ': ' + tj.faltas.join(' | ') : ''));
for (const id of await pg.evaluate(() => GUIAS_JOGADOR)) {
  await pg.evaluate(i => abrirGuia(i), id);
  await espera(500);
  const r = await andaTour();
  ok(r.faltas.length === 0 && r.n >= 1, 'guia ' + id + ' do jogador: ' + r.n + ' passos, todos acham o elemento' + (r.faltas.length ? ': ' + r.faltas.join(' | ') : ''));
}
await espera(600);

titulo('mapa do jogador');
await pg.locator('#tabs .tab[data-aba="mapa"]').click();
await espera(1500);
ok(/Pensao por dentro/.test(await pg.locator('h1').first().innerText()) && (await pg.locator('#mpEd, #mpToken, #mpAtiva').count()) === 0, 'jogador ve o mapa ativo, sem os controles do mestre');
ok((await pg.locator('#mIni').count()) === 1 && (await pg.locator('#iniBtn').count()) === 0, 'o jogador tem o espaco da ordem de iniciativa no mapa, sem os controles do mestre');
ok((await pg.locator('[data-mp-sel]').count()) === 2 && !/Emboscada/.test(await pg.locator('#mpPainel').innerText()), 'token escondido nao chega ao jogador');
ok((await pg.locator('.mpitem .chip', { hasText: /seu/i }).count()) === 1, 'o token do jogador vem marcado como seu');
await arrastaToken(301, 1);
let ej = await estadoMapa(3, 31);
ok(ej.elementos.find(e => e.id === 301).dados.x === 525, 'jogador move o proprio token: ' + ej.elementos.find(e => e.id === 301).dados.x);
await arrastaToken(302, 1);
ej = await estadoMapa(3, 31);
ok(ej.elementos.find(e => e.id === 302).dados.x === 735, 'e nao move o token dos outros');
const xOutro = (await (await ctx.request.post(B + '/__mapa-move-outro/3')).json()).x;
await espera(800);
ok(await pg.evaluate(() => MP.els.find(e => e.id === 302).dados.x) === xOutro, 'o que outra pessoa move chega pelo SSE sem recarregar');
await foto('14-mapa-jogador');
titulo('mapa: deslocamento do turno e desfazer (jogador)');
await ctx.request.post(B + '/__mapa-desl/3/aviso');
await pg.reload(); await espera(1800);
await pg.locator('#mpMais').click(); await espera(250);
const itensJ = await pg.locator('.menu [data-v]').evaluateAll(l => l.map(b => b.dataset.v));
await pg.keyboard.press('Escape'); await espera(150);
ok(await pg.locator('#mpDesfaz').isVisible() && await pg.locator('#mpRegua').isVisible() && itensJ.includes('hist') && !itensJ.includes('turno'), 'jogador tem regua, desfazer e historico, mas nao o Novo turno', itensJ);
ok((await pg.locator('[data-mp-sec="camadas"]').count()) === 0, 'o painel do jogador nao tem a secao de camadas');
ok((await pg.locator('.mpitem .chip', { hasText: /3\/3 m/ }).count()) === 1, 'o jogador ve o deslocamento do proprio token (3/3 m)');
const x301 = (await estadoMapa(3, 31)).elementos.find(e => e.id === 301).dados.x;
await arrastaToken(301, 1);
ok((await pg.locator('.mpitem .chip', { hasText: /1,5\/3 m/ }).count()) === 1, 'andar uma casa gasta 1,5 m e a lista mostra o que resta');
await pg.keyboard.press('Control+z'); await espera(700);
ej = await estadoMapa(3, 31);
ok(ej.elementos.find(e => e.id === 301).dados.x === x301 && (await pg.locator('.mpitem .chip', { hasText: /3\/3 m/ }).count()) === 1, 'o jogador desfaz o proprio movimento e o deslocamento volta');
await arrastaToken(301, 3);
ok(/passou do deslocamento/i.test(await pg.locator('.toast').last().innerText()), 'no modo aviso, passar do deslocamento move e avisa');
ej = await estadoMapa(3, 31);
ok(ej.elementos.find(e => e.id === 301).dados.x === x301 + 210, 'e o token fica onde foi solto');
await abreMais('hist'); await espera(700);
ok(/Você moveu/.test(await pg.locator('.ov .mphist').innerText()), 'o historico do jogador mostra o que ele fez');
await pg.keyboard.press('Escape'); await espera(300);
await ctx.request.post(B + '/__mapa-desl/3/bloqueio');
await pg.reload(); await espera(1800);
await arrastaToken(301, 3);
ej = await estadoMapa(3, 31);
ok(ej.elementos.find(e => e.id === 301).dados.x === x301 + 210 && /custa/i.test(await pg.locator('.toast').last().innerText()), 'no modo bloqueio, o movimento que passa e recusado, o token volta e a tela diz quanto custa e quanto resta');
titulo('mapa: paredes e nevoa (jogador)');
await ctx.request.post(B + '/__mapa-paredes/3');
await pg.reload(); await espera(1800);
ok(await pg.evaluate(() => mpFogModo()) === 'visao' && await pg.evaluate(() => !MP.els.some(e => e.tipo === 'PAREDE' || e.tipo === 'FOG') && MP.vista?.paredes === true && !!MP.vista.png), 'o jogador recebe o modo da nevoa e a mascara, mas nao as paredes');
ok(await pg.evaluate(() => !('imagem' in MP.mapa) && MP.vista.tiles?.v.length > 0 && Object.keys(MPT).length > 0), 'a imagem do mapa chega em pedacos, sem o caminho dela');
ok(await pg.evaluate(() => !MP.els.some(e => e.id === 302)) && !/Guarda/.test(await pg.locator('#mpPainel').innerText()), 'o guarda atras da parede nem chega ao jogador, e nao aparece na lista do painel');
ok((await pg.locator('#mpPainel [data-mp-sec="visao"]').count()) === 0 && (await pg.locator('[data-mpf="parede"], [data-mpf="fog"], [data-mpf="pincel"]').count()) === 0, 'o jogador nao tem as ferramentas de parede, de nevoa nem o pincel');
const p301 = await posToken(301);
/* o pontilhado do arraste segue o contorno que o servidor calculou, assim que a resposta chega, e o rotulo diz */
await pg.evaluate(() => { const el = MP.els.find(e => e.id === 301), x = el.dados.x + 140, y = el.dados.y;
  MP.rotaSrv = null; MP.medida = { x0: el.dados.x, y0: y, x1: x, y1: y, el, trilha: [[el.dados.x, y], [x, y]], rotaChave: mpChaveRota(el, x, y) };
  mpRotaDoServidor(el, x, y, [[el.dados.x, y], [x, y]]); });
await espera(500);
ok(await pg.evaluate(() => MP.medida.contorno === true && MP.medida.trilha.length >= 3 && /contornando a parede/.test(mpRotuloMedida(MP.medida).texto)), 'arrastando para o outro lado da parede, o pontilhado passa a seguir o contorno e o rotulo avisa');
await pg.evaluate(() => { MP.medida = null; MP.rotaSrv = null; });
await arrastaToken(301, 2);
ej = await estadoMapa(3, 31);
ok(ej.elementos.find(e => e.id === 301).dados.x === p301.dx + 140 && !/parede/i.test(await pg.locator('.toast').last().innerText().catch(() => '')), 'arrastar o token para o outro lado da parede segue a rota que a contorna: o servidor aceita');
await espera(600);
ok(await pg.evaluate(() => MP.els.some(e => e.id === 302)) && /Guarda/.test(await pg.locator('#mpPainel').innerText()), 'do outro lado da parede a visao do token alcanca o guarda e ele aparece, na tela e na lista');
await pg.locator('[data-msec="resumos"]').click(); await espera(500);
ok((await pg.locator('.sugtema').count()) === 0, 'quem segue o tema das mesas nao e perguntado sobre o tema sugerido');
ok(await pg.evaluate(() => document.documentElement.getAttribute('data-tema')) === 'luar', 'e a campanha abre direto no tema do mestre');
await pg.evaluate(() => { window.__viu = []; new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
  if (n.classList) window.__viu.push(n.className); }))).observe(document.body, { childList: true }); });
const m3 = await (await ctx.request.get(B + '/api/c/3/mesa')).json();
const j3 = JSON.parse(m3.json);
j3.npcs.push({ id: 'n77', nome: 'Recem-chegada', img: 'img/npc-1.png', desc: 'Acabou de aparecer.' });
await ctx.request.put(B + '/api/c/3/mesa', { data: { json: JSON.stringify(j3), versao: m3.versao } });
await ctx.request.post(B + '/__pedido-de-outro/3');
await espera(7000);
const viu = await pg.evaluate(() => window.__viu);
ok(viu.some(c => /revela/.test(c)), 'o que o mestre libera vira carta na tela do jogador');
ok(viu.some(c => /pedido/.test(c)), 'pedido de teste do mestre aparece para o jogador');
await pg.locator('.revela').click({ timeout: 1500 }).catch(() => {});
await pg.locator('.pedido [data-p="rolar"]').click();
await espera(1600);
const r3 = await (await ctx.request.get(B + '/api/c/3/rolagens')).json();
ok(!!r3[0].pedidoId && r3[0].rotulo === 'Percepcao', 'jogador responde ao pedido rolando');
await pg.keyboard.press('Escape');
await espera(300);
ok(!(await pg.locator('#btnTrilha').isVisible()), 'sem trilha para o jogador');
ok(/Aconteceu muita coisa/.test(await pg.locator('#view').innerText()), 've o resumo');
await pg.locator('[data-msec="quem"]').click();
await espera(400);
if (DOM) await foto('r035-msec-quem');
const qimg = await pg.locator('.qcard img').first().evaluate(i => ({ src: i.getAttribute('src'), w: i.naturalWidth }));
ok(/^\/midia\/c3\/img\//.test(qimg.src) && qimg.w > 0, 'foto do NPC passa pelo IMG() e carrega: ' + qimg.src);
ok((await pg.locator('#view .cad.mloc').count()) === 1 && await pg.locator('#view .cad.mloc img').evaluate(i => i.naturalWidth > 0), 'lugares viram cartao com imagem');
await pg.locator('[data-msec="notas"]').click();
await espera(500);
if (DOM) await foto('r036-msec-notas');
const nota = pg.locator('#mNotas');
const nb = await nota.boundingBox();
await pg.mouse.move(nb.x + nb.width - 3, nb.y + nb.height - 3); await pg.mouse.down();
await pg.mouse.move(nb.x + nb.width - 150, nb.y + nb.height + 120, { steps: 6 }); await pg.mouse.up();
await espera(300);
const tam = await pg.evaluate(() => JSON.parse(localStorage.getItem('grim_notas_tam') || 'null'));
ok(!!tam && Math.abs(tam.h - (nb.height + 120)) < 25, 'anotacoes mudam de tamanho pelo canto: ' + JSON.stringify(tam));
await pg.locator('[data-msec="resumos"]').click();
await espera(300);
if (DOM) await foto('r037-msec-resumos');
await pg.locator('[data-msec="notas"]').click();
await espera(500);
if (DOM) await foto('r038-msec-notas');
ok(Math.abs((await pg.locator('#mNotas').boundingBox()).height - tam.h) < 6, 'e voltam no tamanho escolhido');
await pg.locator('#mNotaTam').click();
ok(await pg.evaluate(() => localStorage.getItem('grim_notas_tam')) === null, 'tamanho padrao desfaz');
await pg.locator('[data-msec="resumos"]').click();
await espera(300);
if (DOM) await foto('r039-msec-resumos');
await pg.click('#btnAjustes');
await espera(400);
ok((await pg.locator('[data-aj]').count()) === 8 && (await pg.locator('#mSaiCamp').count()) === 0, 'ajustes do jogador: aparencia, privacidade, guias, conta, suporte e as tres da administracao');

titulo('cadastro: regras de senha');
await pg.goto(B + '/paginas/login.html');
await espera(600);
await pg.locator('#alt').click();
await espera(200);
ok(await pg.locator('#regras').isHidden(), 'a lista de regras so aparece ao comecar a digitar');
await pg.locator('#login').fill('nova.conta');
await pg.locator('#nome').fill('Nova');
await pg.locator('#senha').pressSequentially('abc');
const okR = async () => (await pg.locator('#regras li.ok').evaluateAll(l => l.map(x => x.dataset.r))).join(',');
ok(await pg.locator('#regras').isVisible() && (await okR()) === 'letra', 'digitando, so o que ja foi cumprido fica verde: ' + await okR());
await pg.locator('#b').click();
await espera(300);
ok(await pg.locator('#aviso').isVisible() && /senha fraca/i.test(await pg.locator('#aviso').innerText()) && /um número/.test(await pg.locator('#aviso').innerText()), 'senha fraca mostra um aviso em destaque com o que falta');
await pg.locator('#senha').pressSequentially('1!x');
ok((await okR()) === 'tam,letra,num,esp', 'cumprindo tudo, a lista fica toda verde');
await pg.locator('#avisoX').click();
ok(await pg.locator('#aviso').isHidden(), 'o aviso fecha no X');
await pg.goto(B + '/');
await espera(1500);
ok((await pg.locator('[data-entrar]').count()) > 0 && /#\/campanhas$/.test(pg.url()), 'entrar no site sem endereco cai sempre na lista de campanhas, nunca numa mesa aberta: ' + pg.url());
await pg.goto(B + '/?convite=abc123');
await espera(1800);
ok(/#\/c\/2\//.test(pg.url()) && !/convite=/.test(pg.url()), 'link de convite entra direto na campanha que convidou e limpa o endereco: ' + pg.url());
await pg.keyboard.press('Escape');
await pg.goto(B + '/');
await espera(1500);

titulo('celular');
await pg.setViewportSize({ width: 390, height: 800 });
await pg.click('#brandHome');
await espera(500);
await pg.locator('[data-entrar="1"]').click();
await espera(1200);
for (const a of ['Campanha', 'Elenco', 'Biblioteca', 'Mesa']) {
  await aba(a);
  const sobra = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(sobra <= 1, a + ' nao estoura a largura (' + sobra + 'px)');
}
await aba('Campanha');
if (DOM) await foto('r040-aba-Campanha');
await foto('11-celular-campanha');
await pg.locator('[data-cp="cp-ed"]').click();
await espera(350);
await foto('12-celular-formulario');
await pg.locator('.ov [data-no]').click();
await espera(300);
ok(await pg.locator('nav.tabs').evaluate(n => getComputedStyle(n).position === 'fixed' && n.getBoundingClientRect().bottom >= innerHeight - 1),
  'no celular as abas ficam na barra de baixo');
ok(await pg.locator('#btnMais').isVisible(), 'no celular as acoes do topo moram no menu Mais');
await pg.locator('#btnMais').click();
await espera(250);
ok(await pg.locator('.menumais [role=menuitem]').count() >= 3 && await pg.evaluate(() => document.activeElement?.getAttribute('role') === 'menuitem'),
  'o menu Mais abre com o foco no primeiro item');
await pg.keyboard.press('Escape');
await espera(200);
ok(await pg.evaluate(() => document.activeElement?.id === 'btnMais'), 'Esc fecha o menu e devolve o foco ao botao');

titulo('larguras de tablet e notebook: navegacao inteira e sem rolagem lateral');
for (const w of [600, 768, 1024, 1180, 1440]) {
  await pg.setViewportSize({ width: w, height: 900 });
  await espera(350);
  const m = await pg.evaluate(() => {
    /* .sobra: aba que no celular mora num menu (o Mapa do mestre fica no Mais do topo) */
    const abas = [...document.querySelectorAll('#tabs .tab')].filter(t => !t.classList.contains('sobra') || getComputedStyle(t).display !== 'none');
    const vis = abas.filter(t => { const r = t.getBoundingClientRect(); return r.width > 0 && r.left >= -1 && r.right <= innerWidth + 1; }).length;
    return { vis, total: abas.length, sobra: document.documentElement.scrollWidth - innerWidth };
  });
  ok(m.vis === m.total && m.total > 0 && m.sobra <= 1, w + 'px: ' + m.vis + '/' + m.total + ' abas visiveis, sobra ' + m.sobra + 'px');
}

titulo('regressoes da segunda auditoria');
await pg.setViewportSize({ width: 1024, height: 800 });
await pg.locator('#tabs .tab[data-aba="sessoes"]').click(); await espera(500);
await pg.locator('[data-ses]').first().click(); await espera(900);
const vaza = await pg.evaluate(() => [...document.querySelectorAll('.boardbar button, .bbacoes button')].filter(b => { if (!b.offsetWidth) return false; const r = document.createRange(); r.selectNodeContents(b); const t = r.getBoundingClientRect(), c = b.getBoundingClientRect(); return t.left < c.left - 1 || t.right > c.right + 1; }).map(b => b.textContent.trim()));
ok(vaza.length === 0, 'em 1024px nenhum botao da barra da sessao tem o texto vazando' + (vaza.length ? ': ' + vaza.join(', ') : ''));
await pg.setViewportSize({ width: 390, height: 800 }); await espera(300);
await pg.evaluate(() => { S.vmodeEscolhido = false; S.vmode = 'roteiro'; render(); }); await espera(500);
ok(await pg.locator('.sessbarra').isVisible(), 'no celular a sessao tem a barra de jogo');
await pg.locator('.sessbarra [data-sb="painel"]').click(); await espera(400);
ok(await pg.evaluate(() => document.body.classList.contains('painel-aberto') && getComputedStyle(document.querySelector('#railSessao')).visibility === 'visible'), 'o painel abre como gaveta');
await pg.locator('.sessbarra [data-sb="painel"]').click(); await espera(400);
ok(await pg.evaluate(() => getComputedStyle(document.querySelector('#railSessao')).visibility === 'hidden'), 'e fecha no mesmo botao');
/* a sessao do teste e curta: estica a pagina para ter o que rolar */
await pg.evaluate(() => { document.querySelector('#view').style.minHeight = '3000px'; scrollTo(0, 0); }); await espera(150);
await pg.evaluate(() => scrollTo(0, 400)); await espera(500);
const fora = await pg.evaluate(() => ({ cls: document.body.classList.contains('barras-fora'),
  abas: document.querySelector('nav.tabs').getBoundingClientRect().top >= innerHeight - 1,
  jogo: document.querySelector('.sessbarra').getBoundingClientRect().top >= innerHeight - 1 }));
ok(fora.cls && fora.abas && fora.jogo, 'rolando para baixo na sessao as duas barras saem da tela: ' + JSON.stringify(fora));
await pg.evaluate(() => scrollTo(0, 300)); await espera(500);
ok(await pg.evaluate(() => !document.body.classList.contains('barras-fora') && document.querySelector('.sessbarra').getBoundingClientRect().bottom <= innerHeight - 1),
  'rolando para cima elas voltam');
await pg.evaluate(() => { document.querySelector('#view').style.minHeight = ''; scrollTo(0, 0); }); await espera(300);
const sobreBarra = await pg.evaluate(() => { const b = document.querySelector('nav.tabs').getBoundingClientRect();
  return [...document.querySelectorAll('body *')].filter(e => { const s = getComputedStyle(e); if (s.position !== 'fixed' || e.closest('nav.tabs') || e.offsetParent === null && s.position !== 'fixed') return false;
    const r = e.getBoundingClientRect(); return r.width && r.height && s.visibility !== 'hidden' && r.bottom > b.top + 1 && r.top < b.bottom && !e.matches('nav.tabs,.sessbarra,.sessbarra *,#toasts,.toasts,.atmo,.atmo *,body::before') && +s.zIndex > 55; }).map(e => e.className || e.tagName); });
ok(sobreBarra.length === 0, 'nenhuma camada fixa cobre a barra de abas no celular' + (sobreBarra.length ? ': ' + sobreBarra.join(', ') : ''));
await pg.click('#btnMais'); await espera(250);
await pg.locator('.menumais [data-mais="btnAjustes"]').click(); await espera(600);
await pg.evaluate(() => { S.aj = ''; render(); }); await espera(400);
ok(await pg.locator('.ajgrade.so-lista').count() === 1 && !(await pg.locator('#ajBody').isVisible()), 'no celular Configuracoes abre como lista de secoes');
await pg.locator('[data-aj="aparencia"]').click(); await espera(500);
ok(await pg.locator('#ajVolta').isVisible() && await pg.locator('#ajBody').isVisible(), 'a secao abre na tela inteira, com voltar');
await pg.locator('#ajVolta').click(); await espera(400);
ok(await pg.locator('.ajgrade.so-lista').count() === 1, 'voltar leva a lista');
await pg.setViewportSize({ width: 1600, height: 900 }); await espera(300);
await pg.evaluate(() => { S.view = 'ajustes'; S.aj = 'campanha'; render(); }); await espera(500);
const lado = await pg.evaluate(() => { const m = document.querySelector('.ajmenu').getBoundingClientRect(), b = document.querySelector('#ajBody').getBoundingClientRect();
  return { volta: getComputedStyle(document.querySelector('#ajVolta')).display, aoLado: b.left >= m.right - 1 && Math.abs(b.top - m.top) < 40 }; });
ok(lado.volta === 'none' && lado.aoLado, 'na tela larga o menu de Configuracoes fica ao lado da secao, sem o voltar do celular');
ok(await pg.evaluate(() => getComputedStyle(document.querySelector('#saveSt .svdot')).opacity === '0'), 'sem nada gravando, o ponto de gravacao fica escondido');
await pg.setViewportSize({ width: 390, height: 800 }); await espera(300);
await pg.click('#btnAjustes').catch(() => {});
await pg.evaluate(() => { S.view = 'home'; render(); }); await espera(500);
await pg.setViewportSize({ width: 320, height: 700 }); await espera(400);
const m320 = await pg.evaluate(() => ({ sobra: document.documentElement.scrollWidth - innerWidth,
  fora: [...document.querySelectorAll('#tabs .tab')].filter(t => t.offsetWidth && t.getBoundingClientRect().right > innerWidth + 1).length }));
ok(m320.sobra <= 1 && m320.fora === 0, '320px: sem rolagem lateral e as cinco abas inteiras (sobra ' + m320.sobra + 'px, ' + m320.fora + ' fora)');

titulo('janela e dialogo: foco e fundo');
await pg.setViewportSize({ width: 1366, height: 900 });
await aba('Campanha');
await pg.locator('[data-cp="cp-ed"]').focus();
await pg.keyboard.press('Enter');
await espera(350);
ok(await pg.locator('.ov [role=dialog][aria-modal=true]').count() === 1, 'janela e um dialogo de verdade (role e aria-modal)');
ok(await pg.evaluate(() => !!document.activeElement?.closest('.ov')), 'o foco entra na janela');
ok(await pg.evaluate(() => document.querySelector('#view').inert && document.querySelector('header.top').inert), 'o fundo fica inerte enquanto a janela esta aberta');
for (let i = 0; i < 12; i++) await pg.keyboard.press('Tab');
ok(await pg.evaluate(() => !!document.activeElement?.closest('.ov')), 'Tab gira dentro da janela');
await pg.keyboard.press('Escape');
await espera(350);
ok(await pg.evaluate(() => document.activeElement?.dataset?.cp === 'cp-ed'), 'fechar devolve o foco ao botao que abriu');
ok(await pg.evaluate(() => !document.querySelector('#view').inert), 'e o fundo volta a responder');

titulo('endereco por tela');
await aba('Elenco');
ok(/#\/c\/1\/elenco/.test(await pg.evaluate(() => location.hash)), 'a tela aparece no endereco');
await pg.goBack();
await espera(500);
ok(/#\/c\/1\/campanha/.test(await pg.evaluate(() => location.hash)) && /campanha de teste/i.test(await pg.locator('h1').first().innerText()), 'Voltar do navegador volta uma tela');
await aba('Biblioteca');
await pg.reload();
await espera(1800);
ok(await pg.locator('#tabs .tab[aria-current="page"]').innerText().then(t => /biblioteca/i.test(t)), 'F5 reabre a mesma tela');

titulo('tema: o seu fora das campanhas, o da mesa dentro');
{
  const temaDa = () => pg.evaluate(() => document.documentElement.getAttribute('data-tema'));
  const guardado = k => pg.evaluate(x => localStorage.getItem(x), k);
  const aparencia = async () => { await pg.click('#btnAjustes'); await espera(400); await pg.locator('[data-aj="aparencia"]').click(); await espera(400); };
  const entra = async () => { await pg.click('#brandHome'); await espera(700); await pg.locator('[data-entrar="3"]').click(); await espera(1500); };
  await pg.evaluate(() => { localStorage.removeItem('grim_tema'); localStorage.removeItem('grim_segue'); localStorage.removeItem('grim_tema_c3'); });
  await pg.click('#brandHome');
  await espera(700);
  await aparencia();
  ok((await pg.locator('#temaLimpa').count()) === 0 && (await pg.locator('#temaCamp').count()) === 0, 'fora de uma campanha a aparencia nao mostra os botoes do tema da mesa');
  await pg.locator('[data-tema="pergaminho"]').click();
  await espera(600);
  ok(await temaDa() === 'pergaminho' && await guardado('grim_tema') === 'pergaminho', 'fora de uma campanha o clique define o seu tema');
  ok((await pg.locator('.temacard[data-tema="pergaminho"] .tseu').count()) === 1, 'o seu tema leva a etiqueta na lista');
  await pg.click('#brandHome');
  await espera(700);
  ok(await temaDa() === 'pergaminho', 'a lista de campanhas fica no seu tema');
  await entra();
  ok(await temaDa() === 'luar', 'ao abrir a campanha com tema sugerido, a tela muda para o tema dela');
  await pg.click('#brandHome');
  await espera(900);
  ok(await temaDa() === 'pergaminho', 'ao sair da campanha volta o seu tema');
  await entra();
  await aparencia();
  ok(await pg.locator('#temaCamp').isVisible() && (await pg.locator('#temaLimpa').count()) === 0, 'dentro da campanha aparece o botao de definir o tema, e o de voltar ainda nao');
  ok(/Definir como meu tema para esta campanha/i.test(await pg.locator('#temaCamp').innerText()), 'o botao diz o que faz');
  await pg.locator('[data-tema="noir"]').click();
  await espera(500);
  ok(await temaDa() === 'noir' && await guardado('grim_tema_c3') === null && await pg.locator('#temaLimpa').isVisible(), 'dentro da campanha o clique so mostra a previa, sem gravar');
  await pg.locator('#temaCamp').click();
  await espera(500);
  ok(await guardado('grim_tema_c3') === 'noir' && (await pg.locator('.temacard[data-tema="noir"] .tesc').count()) === 1, 'definir como meu tema grava a escolha e marca o cartao como escolhido');
  await pg.click('#brandHome');
  await espera(900);
  ok(await temaDa() === 'pergaminho', 'fora da campanha continua o seu tema');
  await entra();
  ok(await temaDa() === 'noir', 'a escolha vale ao voltar na campanha, na frente da sugestao do mestre');
  await aparencia();
  await pg.locator('#temaLimpa').click();
  await espera(500);
  ok(await temaDa() === 'luar' && await guardado('grim_tema_c3') === null, 'voltar ao tema da mesa apaga a escolha');
  await pg.locator('[data-tema="veu"]').click();
  await espera(400);
  await pg.click('#brandHome');
  await espera(900);
  ok(await temaDa() === 'pergaminho', 'previa nao gravada some ao sair da aparencia');
  await entra();
  await aparencia();
  await pg.locator('[data-segue="0"]').click();
  await espera(500);
  ok(await temaDa() === 'pergaminho' && await guardado('grim_segue') === '0', 'usar sempre o meu tema tira o tema da mesa');
  await pg.locator('[data-segue="1"]').click();
  await espera(500);
  ok(await temaDa() === 'luar', 'seguir o tema de cada mesa volta a vestir a campanha');
  await pg.evaluate(() => localStorage.removeItem('grim_tema'));
}

titulo('qualidade de cor: contraste dos temas e nenhuma cor solta');
{
  const temaJs = readFileSync(join(AQUI, '..', '..', 'src', 'main', 'resources', 'static', 'js', 'tema.js'), 'utf8');
  const ini = temaJs.indexOf('var TEMAS={'), fim = temaJs.indexOf('\n};', ini) + 3;
  const TEMAS = (0, eval)('(' + temaJs.slice(ini + 10, fim - 1) + ')');
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const lum = c => { const a = c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * a[0] + .7152 * a[1] + .0722 * a[2]; };
  const cr = (a, b) => { const x = lum(hex(a)), y = lum(hex(b)); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const ruins = [];
  for (const [id, t] of Object.entries(TEMAS)) {
    const v = t.v;
    for (const k of ['fg', 'fg2', 'fg3', 'gold']) for (const f of ['bg', 'bg2', 'bg3', 'bg4']) if (cr(v[k], v[f]) < 4.5) ruins.push(id + ' ' + k + '/' + f + ' ' + cr(v[k], v[f]).toFixed(2));
    for (const k of ['blood2', 'ok']) for (const f of ['bg', 'bg2', 'bg3']) if (cr(v[k], v[f]) < 4.5) ruins.push(id + ' ' + k + '/' + f + ' ' + cr(v[k], v[f]).toFixed(2));
    if (cr(v['sobre-gold'], v.gold) < 4.5) ruins.push(id + ' sobre-gold');
    if (cr(v['sobre-blood'], v.blood) < 4.5) ruins.push(id + ' sobre-blood');
    for (const f of ['bg', 'bg2']) if (cr(v['campo-borda'], v[f]) < 3) ruins.push(id + ' campo-borda/' + f);
  }
  ok(ruins.length === 0, 'texto 4,5:1 e borda de campo 3:1 nos ' + Object.keys(TEMAS).length + ' temas' + (ruins.length ? ': ' + ruins.join(', ') : ''));
  const pasta = join(AQUI, '..', '..', 'src', 'main', 'resources', 'static', 'css'), soltas = [];
  for (const f of readdirSync(pasta).filter(x => x.endsWith('.css'))) {
    readFileSync(join(pasta, f), 'utf8').split('\n').forEach((l, i) => {
      const semDef = l.replace(/--[a-z0-9-]+\s*:[^;]+;?/gi, '').replace(/mask[^;]*/g, '').replace(/url\([^)]*\)/g, '');
      if (/rgba?\(|#[0-9a-f]{3,8}\b/i.test(semDef)) soltas.push(f + ':' + (i + 1));
    });
  }
  ok(soltas.length === 0, 'cor so por token nas folhas (fora de definicao de token e de mascara)' + (soltas.length ? ': ' + soltas.join(', ') : ''));
}

await nav.close();
console.log('\n================');
console.log('falhas: ' + falhas.length + (falhas.length ? '\n - ' + falhas.join('\n - ') : ''));
console.log('erros de pagina: ' + erros.length + (erros.length ? '\n - ' + erros.join('\n - ') : ''));
process.exit(falhas.length || erros.length ? 1 : 0);
