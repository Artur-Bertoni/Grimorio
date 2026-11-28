/**
 * Captura de cada formulario e janela de edicao, para olhar o layout (nao confere nada).
 *
 *   node stub.mjs &
 *   FOTOS=pasta node fotos-formularios.mjs        # LARGURA=390 para o celular
 *
 * Abre cada janela chamando a funcao do proprio app (editarElenco, mpEditaToken, …) na campanha de
 * teste do stub e grava uma foto da janela inteira (rolando o corpo, quando passa da tela).
 */
import { chromium } from 'playwright-core';
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const B = process.env.BASE || 'http://127.0.0.1:8099';
const FOTOS = process.env.FOTOS || 'fotos-formularios';
mkdirSync(FOTOS, { recursive: true });
const L = +process.env.LARGURA || 1366, A = +process.env.ALTURA || 900;

/* o Edge que vem com o Windows mora numa pasta por versao (EdgeCore/<versao>/msedge.exe): a mais nova primeiro */
function edgeCore(pastas) {
  const versoes = pastas.map(d => join(d, 'Microsoft', 'EdgeCore')).filter(existsSync)
    .flatMap(base => readdirSync(base).sort().reverse().map(v => join(base, v, 'msedge.exe')));
  return versoes.find(existsSync) || null;
}
function acharNavegador() {
  if (process.env.NAVEGADOR) return process.env.NAVEGADOR;
  const pf = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean);
  const fixos = pf.flatMap(d => [join(d, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), join(d, 'Google', 'Chrome', 'Application', 'chrome.exe')])
    .concat(['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']);
  return fixos.find(existsSync) || edgeCore(pf);
}
const exe = acharNavegador();
if (!exe) { console.error('Nao achei Edge nem Chrome. Aponte um com NAVEGADOR=caminho.'); process.exit(2); }

const nav = await chromium.launch({ executablePath: exe });
const ctx = await nav.newContext({ viewport: { width: L, height: A } });
const pg = await ctx.newPage();
const erros = [];
pg.on('pageerror', e => erros.push(e.message));
const espera = ms => pg.waitForTimeout(ms);
/* fecha janela e guia abertos, um Esc por vez (cada Esc fecha so a camada de cima) */
const fechaTudo = async (resta = 6) => {
  if (!resta || !(await pg.locator('.ov, .tour').count())) return;
  await pg.keyboard.press('Escape'); await espera(200);
  await fechaTudo(resta - 1);
};
/* a janela de cima, inteira: a altura cresce ate caber o corpo rolavel */
async function foto(nome) {
  await espera(500);
  const alto = await pg.evaluate(() => { const ov = [...document.querySelectorAll('#layer .ov')].pop(); const s = ov?.querySelector('.sbodyscroll'); return s ? s.scrollHeight - s.clientHeight : 0; });
  if (alto > 0) await pg.setViewportSize({ width: L, height: Math.min(4000, A + alto + 40) });
  await espera(250);
  await pg.screenshot({ path: join(FOTOS, nome + '.png') });
  await pg.setViewportSize({ width: L, height: A });
  console.log('  ' + nome);
}
async function janela(nome, abre, depois) {
  await fechaTudo();
  try { await pg.evaluate(abre); } catch (e) { console.log('  !! ' + nome + ': ' + e.message.split('\n')[0]); return; }
  await espera(700);
  if (depois) await depois();
  await foto(nome);
  await fechaTudo();
}

await ctx.request.get(B + '/api/zerar');
await pg.goto(B + '/#/c/1/campanha', { waitUntil: 'networkidle' });
await espera(1300);
await fechaTudo();

await janela('03-elenco-personagem', 'editarElenco("personagens", D.elenco.personagens[0])');
await janela('04-elenco-npc', 'editarElenco("npcs", D.elenco.npcs[0])');
await janela('05-elenco-local', 'editarElenco("locais", D.elenco.locais[0])');
await janela('06-elenco-pista', 'editarElenco("pistas", D.elenco.pistas[0])');
await janela('07-sessao', 'editarSessao(D.sessoes[0])');
await janela('09-territorio', 'editarTerr(D.sessoes[0], (D.sessoes[0].territorios||[])[0]?.id)');
await janela('12-pedir-teste', 'pedirTeste("Percepção")');
await janela('13-modelo-ficha', 'editarModeloFicha()');

/* mapa: o token, o mapa, a parede, a nevoa e o desenho (a campanha 1 do stub comeca sem mapa) */
await ctx.request.post(B + '/api/c/1/mapas', { data: { nome: 'Fotos', elementos: [
  { tipo: 'TOKEN', dados: { nome: 'Heroína', x: 315, y: 315 } },
  { tipo: 'PAREDE', dados: { kind: 'parede', pts: [[140, 140], [560, 140]] } },
  { tipo: 'DESENHO', dados: { forma: 'retangulo', pts: [[700, 420], [980, 630]] } }] } });
await pg.evaluate(() => { S.view = 'mapa'; render(); }); await espera(1500); await fechaTudo();
await janela('20-mapa-token', 'mpEditaToken(MP.els.find(e => e.tipo === "TOKEN"))');
await janela('21-mapa-editar', 'mpEditaMapa()');
await janela('22-mapa-novo-branco', 'mpNovoMapaBranco()');
await janela('23-mapa-token-novo', 'mpTokenAvulso()');
await janela('24-mapa-parede', 'mpEditaParede(MP.els.find(e => e.tipo === "PAREDE") || {dados:{}})');
await janela('25-mapa-desenho', 'mpEditaDesenho(MP.els.find(e => e.tipo === "DESENHO") || {dados:{forma:"retangulo"}})');
await janela('26-iniciativa', 'iniEditarForm(mpSessaoIni(), null, [])');

/* configuracoes: cada secao e uma pagina com campos */
/* uma por vez, em ordem: a tela e uma so */
async function paginaDeAjuste(s) {
  await fechaTudo();
  await pg.evaluate(k => { S.view = 'ajustes'; S.aj = k; render(); }, s);
  await espera(900);
  const alto = await pg.evaluate(() => document.documentElement.scrollHeight);
  await pg.setViewportSize({ width: L, height: Math.min(5000, Math.max(A, alto)) });
  await espera(300);
  await pg.screenshot({ path: join(FOTOS, '30-config-' + s + '.png') });
  await pg.setViewportSize({ width: L, height: A });
  console.log('  30-config-' + s);
}
await ['campanha', 'mesa', 'vocab', 'busca', 'aparencia', 'privacidade', 'guias', 'conta', 'suporte', 'admin', 'textos', 'uso']
  .reduce((fila, s) => fila.then(() => paginaDeAjuste(s)), Promise.resolve());

/* a ficha aberta (fecha o que o guia da aba abriu) */
await pg.evaluate(() => { S.view = 'mesa'; S.msec = 'fichas'; render(); }); await espera(1200); await fechaTudo();
await pg.locator('#fxNova').click(); await espera(900);
await foto('40-ficha-nova');

if (erros.length) console.log('\nerros de pagina:\n' + erros.join('\n'));
await nav.close();
