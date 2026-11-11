/**
 * Exercita a tela de verdade contra o stub, num Chromium.
 *
 *   python3 stub.py &          # ou --porta 9000
 *   node teste.mjs             # BASE=http://127.0.0.1:9000 node teste.mjs
 *
 * Falha com codigo 1 se alguma checagem nao passar ou se o navegador
 * registrar erro de pagina. "O JS parseia" nao e teste: so rodando pega
 * funcao que nao existe, seletor que mudou, e imagem que nao carrega.
 */
import { chromium } from 'playwright';

const B = process.env.BASE || 'http://127.0.0.1:8099';
const erros = [], falhas = [];
const ok = (c, msg) => { if (!c) falhas.push(msg); console.log((c ? '  ok  ' : '  XX  ') + msg); };
const titulo = t => console.log('\n=== ' + t + ' ===');

const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 1366, height: 900 } });
const pg = await ctx.newPage();
pg.on('pageerror', e => erros.push('pageerror: ' + e.message));
pg.on('console', m => {
  // o 403 do teste de senha errada e esperado
  if (m.type() === 'error' && !/403/.test(m.text())) erros.push('console: ' + m.text());
});
pg.on('dialog', d => d.accept());
await pg.addInitScript(() => { try { localStorage.setItem('grim_cid', '1'); } catch (e) {} });

titulo('campanha carrega como mestre');
await pg.goto(B + '/', { waitUntil: 'networkidle' });
await pg.waitForTimeout(900);
ok(await pg.locator('h1.page').first().isVisible(), 'titulo aparece');
ok((await pg.locator('article.pc').count()) === 3, 'tres personagens');

titulo('foto e foto de hover carregam de verdade');
const fotos = await pg.evaluate(() => [...document.querySelectorAll('article.pc .por img')]
  .map(i => ({ mk: i.classList.contains('mk'), src: i.getAttribute('src'), w: i.naturalWidth })));
ok(fotos.length === 6, 'seis imagens (3 normais + 3 de hover): ' + fotos.length);
ok(fotos.every(f => f.w > 0), 'todas carregaram');
ok(fotos.filter(f => f.mk).every(f => /^\/midia\/c1\/img\//.test(f.src)), 'hover passa pelo IMG()');

titulo('modo edicao mostra os controles');
await pg.click('#btnEdit');
await pg.waitForTimeout(500);
for (const [sel, rot] of [
  ['[data-add="corpos"]', 'adicionar personagem'],
  ['[data-add="episodios"]', 'adicionar sessao'],
  ['[data-add="perguntas"]', 'adicionar pergunta'],
  ['[data-add="metodo"]', 'adicionar item do metodo'],
  ['[data-add="adaptacao"]', 'adicionar adaptacao'],
  ['[data-add="regras"]', 'adicionar regra'],
  ['[data-img]', 'trocar foto'], ['[data-fic]', 'fichas'],
  ['[data-rm]', 'remover'], ['[data-mv]', 'mover'], ['[data-epn]', 'numero do episodio'],
]) ok((await pg.locator(sel).count()) > 0, rot);

titulo('adicionar e remover');
const antes = await pg.locator('article.pc').count();
await pg.click('[data-add="corpos"]');
await pg.waitForTimeout(400);
ok((await pg.locator('article.pc').count()) === antes + 1, 'personagem adicionado');
ok((await pg.locator('article.pc .semfoto').count()) > 0, 'cartao novo sem foto');
await pg.locator('[data-rm^="corpos:"]').last().click();
await pg.waitForTimeout(400);
ok((await pg.locator('article.pc').count()) === antes, 'personagem removido');
const perg = await pg.locator('[data-rm^="perguntas:"]').count();
await pg.locator('[data-rm^="perguntas:"]').first().click();
await pg.waitForTimeout(400);
ok((await pg.locator('[data-rm^="perguntas:"]').count()) === perg - 1, 'pergunta removida');

titulo('seletor de imagem');
const srcAntes = await pg.locator('article.pc').first().locator('.por img').first().getAttribute('src');
await pg.locator('[data-img="0:pc"]').click();
await pg.waitForTimeout(600);
ok((await pg.locator('.eigrid button[data-pick]').count()) > 0, 'lista imagens');
ok((await pg.locator('.eigrid button.on').count()) === 1, 'marca a atual');
await pg.locator('.eigrid button[data-pick]').nth(2).click();
await pg.waitForTimeout(500);
const srcDepois = await pg.locator('article.pc').first().locator('.por img').first().getAttribute('src');
ok(srcDepois !== srcAntes, 'foto trocou');
ok(await pg.locator('article.pc').first().locator('.por img').first()
  .evaluate(i => i.naturalWidth > 0), 'foto nova carregou');

titulo('fichas');
await pg.locator('[data-fic]').first().click();
await pg.waitForTimeout(400);
const fAntes = await pg.locator('[data-frm]').count();
await pg.click('#feAdd');
await pg.waitForTimeout(600);
await pg.locator('.eigrid button[data-pick]').first().click();
await pg.waitForTimeout(400);
ok((await pg.locator('[data-frm]').count()) === fAntes + 1, 'ficha adicionada');
await pg.locator('.ov .x').last().click();
await pg.waitForTimeout(300);

titulo('minha conta');
await pg.click('#btnMenu');
await pg.waitForTimeout(300);
ok(await pg.locator('#mTroca').isVisible(), 'botao de campanhas');
ok(await pg.locator('#mConta').isVisible(), 'botao de conta');
await pg.click('#mConta');
await pg.waitForTimeout(300);
await pg.fill('#cnNome', 'Outro nome');
await pg.click('#cnNomeOk');
await pg.waitForTimeout(400);
await pg.fill('#cnAtual', 'errada');
await pg.fill('#cnNova', 'novasenha1');
await pg.fill('#cnNova2', 'novasenha1');
await pg.click('#cnSenhaOk');
await pg.waitForTimeout(400);
ok((await pg.locator('#cnAtual').inputValue()) === 'errada', 'senha errada nao limpa os campos');
await pg.fill('#cnAtual', 'segredo123');
await pg.click('#cnSenhaOk');
await pg.waitForTimeout(400);
ok((await pg.locator('#cnAtual').inputValue()) === '', 'senha certa limpa os campos');
await pg.locator('.ov .x').last().click();
await pg.waitForTimeout(300);

titulo('home de campanhas');
await pg.click('#brandHome');
await pg.waitForTimeout(700);
ok((await pg.locator('[data-entrar]').count()) === 3, 'lista as tres campanhas');
const txt = await pg.locator('#view').innerText();
ok(/você mestra/.test(txt) && /você joga/.test(txt), 'mostra os dois papeis');

titulo('campanha em branco');
await pg.locator('[data-entrar="2"]').click();
await pg.waitForTimeout(1100);
await pg.click('#btnEdit');
await pg.waitForTimeout(500);
for (const r of ['corpos', 'episodios', 'perguntas', 'metodo', 'adaptacao', 'regras'])
  ok((await pg.locator('[data-add="' + r + '"]').count()) > 0, 'tem + de ' + r);
await pg.click('[data-add="episodios"]');
await pg.waitForTimeout(400);
ok((await pg.locator('.epwrap').count()) === 1, 'episodio criado do zero');
ok((await pg.locator('[data-epn]').first().inputValue()) === '1', 'numerado como 1');

await nav.close();
console.log('\n================');
console.log('falhas: ' + falhas.length + (falhas.length ? '\n - ' + falhas.join('\n - ') : ''));
console.log('erros de pagina: ' + erros.length + (erros.length ? '\n - ' + erros.join('\n - ') : ''));
process.exit(falhas.length || erros.length ? 1 : 0);
