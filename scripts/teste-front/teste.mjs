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
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

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
const ctx = await nav.newContext({ viewport: { width: 1366, height: 900 } });
const pg = await ctx.newPage();
pg.on('pageerror', e => erros.push('pageerror: ' + e.message));
pg.on('console', m => {
  // o 403 do teste de senha errada e esperado
  if (m.type() === 'error' && !/403/.test(m.text())) erros.push('console: ' + m.text());
});
pg.on('dialog', d => d.accept());
const espera = ms => pg.waitForTimeout(ms);
const foto = async n => { if (FOTOS) await pg.screenshot({ path: join(FOTOS, n + '.png'), fullPage: false }); };
const aba = async rot => { await pg.locator('#tabs .tab', { hasText: rot }).first().click(); await espera(450); };
const guia = async cid => JSON.parse((await (await ctx.request.get(B + '/api/c/' + cid + '/guia')).json()).json);
const mesa = async cid => JSON.parse((await (await ctx.request.get(B + '/api/c/' + cid + '/mesa')).json()).json);
const salvar = async () => { await pg.locator('.ov [data-ok]').last().click(); await espera(500); };

await ctx.request.get(B + '/api/zerar');
await pg.addInitScript(() => { try { if (!localStorage.getItem('grim_cid')) localStorage.setItem('grim_cid', '1'); } catch (e) {} });

titulo('campanha antiga abre e e migrada');
await pg.goto(B + '/', { waitUntil: 'networkidle' });
await espera(1300);
ok(await pg.locator('h1.page').first().isVisible(), 'titulo aparece');
const abas = await pg.locator('#tabs .tab').allInnerTexts();
ok(abas.length === 5 && /elenco/i.test(abas.join(' ')) && /biblioteca/i.test(abas.join(' ')), 'cinco abas: ' + abas.join(' | '));
ok((await pg.locator('#btnEdit, #btnMenu, #editbanner').count()) === 0, 'modo edicao e menu ··· sairam');
ok((await pg.locator('[contenteditable="true"]').count()) === 0, 'nada editavel digitando na pagina');
const txtHome = await pg.locator('#view').innerText();
ok(/Parágrafo de abertura/.test(txtHome), 'apresentacao veio do campo antigo');
ok(/REGRAS DE OURO/i.test(txtHome) && /Regra um\./.test(txtHome), 'regras de ouro viraram secao');
ok(/Cartão um/.test(txtHome), 'metodo virou secao de cartoes');
await foto('01-campanha');
let g = await guia(1);
ok(g.versao === 3, 'guia regravado como v3');
ok(Array.isArray(g.campanha.corpos) && g.campanha.corpos.length === 3, 'campos antigos continuam no JSON');
ok(g.elenco.personagens.length === 3 && g.elenco.npcs.length === 1 && g.elenco.pistas.length === 1 && g.elenco.locais.length === 1,
  'elenco: 3 personagens, 1 npc, 1 local, 1 pista');
ok(g.sessoes.length === 2 && g.sessoes[0].npcIds.length === 1, 'episodio sem roteiro virou sessao; sessao aponta para o elenco');
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
await espera(900);
ok(/salvo/i.test(await pg.locator('#saveSt').innerText()), 'indicador mostra salvo');

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
await pg.locator('.toast.act button').click();
await espera(400);
ok((await pg.locator('[data-sec]').count()) === nSec, 'desfazer trouxe de volta');

titulo('cancelar com mudanca pede confirmacao e nao grava');
await pg.locator('[data-cp="cp-ed"]').click();
await espera(300);
await pg.locator('.ov [data-f="titulo"]').fill('NOME ERRADO');
await pg.locator('.ov [data-no]').click();
await espera(300);
ok(!/NOME ERRADO/.test(await pg.locator('#view').innerText()), 'cancelado nao muda nada');

titulo('elenco: personagens migrados e fotos');
await aba('Elenco');
ok((await pg.locator('article.pc').count()) === 3, 'tres personagens');
const fotos = await pg.evaluate(() => [...document.querySelectorAll('article.pc .por img')]
  .map(i => ({ mk: i.classList.contains('mk'), src: i.getAttribute('src'), w: i.naturalWidth })));
ok(fotos.length === 6 && fotos.every(f => f.w > 0), 'seis imagens carregaram (3 + 3 de hover)');
ok(fotos.every(f => /^\/midia\/c1\/img\//.test(f.src)), 'todas passam pelo IMG()');
await foto('02-elenco-personagens');

titulo('elenco: criar NPC com imagem, liberar, editar');
await pg.locator('[data-el="npcs"]').click();
await espera(350);
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
await salvar();
ok(/Furtividade/i.test(await pg.locator('.cenasheet').innerText()), 'bloco com linhas repetidas (testes) gravou');
await foto('05-cena');
await pg.locator('.cenasheet .x').click();
await espera(300);
await foto('06-quadro');

titulo('roteiro: a cena continua aberta depois de editar');
await pg.locator('[data-vm="roteiro"]').click();
await espera(400);
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

titulo('sessao migrada: blocos antigos aparecem');
await pg.locator('#sesVolta').click();
await espera(350);
await pg.locator('[data-ses]').first().click();
await espera(500);
await pg.locator('[data-vm="roteiro"]').click();
await espera(300);
await pg.locator('details.scn summary').first().click();
await espera(250);
const cenaAntiga = await pg.locator('details.scn[open]').innerText();
ok(/A chuva não para/.test(cenaAntiga) && /Percepção/i.test(cenaAntiga) && /vê o papel/.test(cenaAntiga), 'leitura e testes da cena antiga');
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
await pg.locator('[data-ren]').click();
await espera(300);
await pg.locator('.ov [data-f="nome"]').fill('Manual do jogador');
await salvar();
await espera(500);
ok(/Manual do jogador/.test(await pg.locator('#bbList').innerText()), 'da para renomear o livro');
await pg.locator('[data-bib="trilha"]').click();
await espera(500);
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
ok((await pg.locator('#bbList img').count()) >= 8, 'imagens listadas');
ok(await pg.locator('#bbList img').first().evaluate(i => i.naturalWidth > 0), 'miniatura carregou');

titulo('ajustes');
await pg.click('#btnAjustes');
await espera(450);
const secs = await pg.locator('[data-aj]').allInnerTexts();
ok(secs.length === 8, 'oito secoes para mestre admin: ' + secs.join(' | '));
await foto('09-ajustes');
await pg.locator('[data-aj="mesa"]').click();
await espera(500);
ok(/Jogadora/.test(await pg.locator('#ajBody').innerText()), 'lista quem esta na mesa');
await pg.click('#cvGo');
await espera(500);
ok(/convite=tok/.test(await pg.locator('#ajBody').innerText()), 'gera link de convite');
await pg.locator('[data-aj="vocab"]').click();
await espera(400);
await pg.locator('[data-voc="sessoes"]').fill('Capítulos');
await pg.click('#vcGo');
await espera(500);
ok(/CAP[ÍI]TULOS/i.test((await pg.locator('#tabs .tab').allInnerTexts()).join(' ')), 'vocabulario muda o nome da aba');
await pg.locator('[data-aj="conta"]').click();
await espera(400);
await pg.fill('#cnNome', 'Outro nome');
await pg.click('#cnNomeOk');
await espera(400);
await pg.fill('#cnAtual', 'errada');
await pg.fill('#cnNova', 'novasenha1');
await pg.fill('#cnNova2', 'novasenha1');
await pg.click('#cnSenhaOk');
await espera(400);
ok((await pg.locator('#cnAtual').inputValue()) === 'errada', 'senha errada nao limpa os campos');
await pg.fill('#cnAtual', 'segredo123');
await pg.click('#cnSenhaOk');
await espera(400);
ok((await pg.locator('#cnAtual').inputValue()) === '', 'senha certa limpa os campos');
await pg.locator('[data-aj="aparencia"]').click();
await espera(300);
ok((await pg.locator('[data-tema]').count()) === 6, 'seis temas');

titulo('busca configuravel');
await pg.locator('[data-aj="busca"]').click();
await espera(300);
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
await pg.locator('[data-msec="quem"]').click();
await espera(400);
ok(await pg.locator('.qcard img').first().evaluate(i => i.naturalWidth > 0), 'foto do NPC liberado carrega na mesa');
await pg.click('#mLib');
await espera(350);
ok((await pg.locator('.ov [data-lib]').count()) === 4, 'liberar lista o elenco inteiro (2 NPCs, 1 local, 1 pista)');
await pg.locator('.ov .x').click();
await espera(300);

titulo('home de campanhas');
await pg.click('#brandHome');
await espera(700);
ok((await pg.locator('[data-entrar]').count()) === 3, 'lista as tres campanhas');
const txt = await pg.locator('#view').innerText();
ok(/você mestra/.test(txt) && /você joga/.test(txt), 'mostra os dois papeis');
ok(await pg.locator('#btnAjustes').isVisible() && !(await pg.locator('#btnBusca').isVisible()), 'fora da campanha: ajustes sim, busca nao');

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
ok((await pg.locator('.passo.ok').count()) === feitos + 1, 'o passo dos personagens ficou marcado');
await aba('Sess');
ok(/Nenhuma/.test(await pg.locator('#view').innerText()), 'lista de sessoes vazia tem explicacao');

titulo('jogador');
await pg.click('#brandHome');
await espera(600);
await pg.locator('[data-entrar="3"]').click();
await espera(1100);
ok((await pg.locator('#tabs .tab').count()) === 1, 'jogador so tem a aba Mesa');
ok(!(await pg.locator('#btnTrilha').isVisible()), 'sem trilha para o jogador');
ok(/Aconteceu muita coisa/.test(await pg.locator('#view').innerText()), 've o resumo');
await pg.locator('[data-msec="quem"]').click();
await espera(400);
const qimg = await pg.locator('.qcard img').first().evaluate(i => ({ src: i.getAttribute('src'), w: i.naturalWidth }));
ok(/^\/midia\/c3\/img\//.test(qimg.src) && qimg.w > 0, 'foto do NPC passa pelo IMG() e carrega: ' + qimg.src);
await pg.click('#btnAjustes');
await espera(400);
ok((await pg.locator('[data-aj]').count()) === 3 && (await pg.locator('#mSaiCamp').count()) === 0, 'ajustes do jogador: aparencia, conta, admin');

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
await foto('11-celular-campanha');
await pg.locator('[data-cp="cp-ed"]').click();
await espera(350);
await foto('12-celular-formulario');
await pg.locator('.ov [data-no]').click();

await nav.close();
console.log('\n================');
console.log('falhas: ' + falhas.length + (falhas.length ? '\n - ' + falhas.join('\n - ') : ''));
console.log('erros de pagina: ' + erros.length + (erros.length ? '\n - ' + erros.join('\n - ') : ''));
process.exit(falhas.length || erros.length ? 1 : 0);
