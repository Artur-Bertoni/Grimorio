/* Captura as telas principais em cada tema, para olhar o visual. Nao testa nada.
 *   node stub.mjs &      FOTOS=pasta node fotos-temas.mjs [tema tema ...]
 * Sem lista de temas, passa por um de cada estilo. */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const B = process.env.BASE || 'http://127.0.0.1:8099';
const FOTOS = process.env.FOTOS || 'fotos-temas';
mkdirSync(FOTOS, { recursive: true });
function acharNavegador() {
  if (process.env.NAVEGADOR) return process.env.NAVEGADOR;
  const pf = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean);
  const fixos = [];
  for (const d of pf) fixos.push(join(d, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    join(d, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  fixos.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser');
  for (const f of fixos) if (existsSync(f)) return f;
  for (const d of pf) {
    const base = join(d, 'Microsoft', 'EdgeCore');
    if (!existsSync(base)) continue;
    for (const v of readdirSync(base).sort().reverse()) {
      const f = join(base, v, 'msedge.exe'); if (existsSync(f)) return f;
    }
  }
  return null;
}
const temas = process.argv.slice(2).length ? process.argv.slice(2) : ['sangue', 'taverna', 'pergaminho', 'veu', 'noir', 'dossie', 'neon'];
const nav = await chromium.launch({ executablePath: acharNavegador() });
const ctx = await nav.newContext({ viewport: { width: +process.env.LARGURA || 1366, height: +process.env.ALTURA || 900 } });
const pg = await ctx.newPage();
pg.on('pageerror', e => console.log('ERRO DE PAGINA: ' + e.message));
const foto = n => pg.screenshot({ path: join(FOTOS, n + '.png') });
for (const t of temas) {
  await pg.goto(B + '/login.html');
  await pg.evaluate(x => { localStorage.setItem('grim_tema', x); localStorage.setItem('grim_cid', '1');
    localStorage.setItem('grim_tour_mestre_1', '1'); localStorage.setItem('grim_tour_jogador_1', '1'); }, t);
  await pg.goto(B + '/');
  await pg.waitForTimeout(1500);
  await foto(t + '-1-campanha');
  await pg.locator('#tabs .tab', { hasText: 'Elenco' }).first().click();
  await pg.waitForTimeout(900);
  await foto(t + '-2-elenco');
  const ed = pg.locator('.pc .edb, .cad').first();
  if (await ed.count()) { await ed.click(); await pg.waitForTimeout(700); await foto(t + '-3-janela'); await pg.keyboard.press('Escape'); }
  await pg.click('#brandHome');
  await pg.waitForTimeout(900);
  await foto(t + '-4-home');
  await pg.goto(B + '/login.html');
  await pg.waitForTimeout(700);
  await foto(t + '-5-login');
  console.log('ok ' + t);
}
await nav.close();
