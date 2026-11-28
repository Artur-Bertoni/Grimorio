// Gera os icones e a imagem de previa a partir de logoSvg(), a unica fonte do d20.
// Mudou o desenho da logo ou as cores do Sangue? Rode de novo (com o stub no ar):
//   node stub.mjs &   node icones.mjs
// Grava em web/site/icones/ e o favicon.ico na raiz de web/site/.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const STATIC = join(AQUI, '..', '..', 'web', 'site');
const DEST = join(STATIC, 'icones');
const B = process.env.BASE || 'http://127.0.0.1:8099';
mkdirSync(DEST, { recursive: true });

function navegador() {
  const pf = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean);
  for (const d of pf) for (const f of [join(d, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), join(d, 'Google', 'Chrome', 'Application', 'chrome.exe')]) if (existsSync(f)) return f;
  for (const d of pf) {
    const b = join(d, 'Microsoft', 'EdgeCore'); if (!existsSync(b)) continue;
    for (const v of readdirSync(b).sort().reverse()) { const f = join(b, v, 'msedge.exe'); if (existsSync(f)) return f; }
  }
  return undefined;
}

const br = await chromium.launch({ executablePath: navegador() });
const pg = await (await br.newContext({ deviceScaleFactor: 1 })).newPage();
await pg.goto(B + '/paginas/login.html');
await pg.evaluate(() => localStorage.setItem('grim_tour_mestre_1', '1'));
await pg.goto(B + '/');
await pg.waitForFunction(() => typeof logoSvg === 'function' && document.getElementById('templates'));
const { svg, cores } = await pg.evaluate(() => {
  const v = TEMAS.sangue.v;
  return { svg: logoSvg(k => v[k] || '#888'), cores: v };
});
writeFileSync(join(DEST, 'icone.svg'), svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));

async function png(arquivo, w, h, html) {
  await pg.setViewportSize({ width: w, height: h });
  await pg.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden">${html}</body>`);
  await pg.waitForTimeout(150);
  const buf = await pg.screenshot({ type: 'png', omitBackground: false, clip: { x: 0, y: 0, width: w, height: h } });
  if (arquivo) writeFileSync(join(DEST, arquivo), buf);
  return buf;
}
const quadrado = (lado, margem, fundo) => `<div style="width:${lado}px;height:${lado}px;display:grid;place-items:center;background:${fundo}">
  <div style="width:${lado - 2 * margem}px;height:${lado - 2 * margem}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></div>`;

// icones da tela inicial e da aba: fundo do tema, d20 com respiro (o Android corta em circulo)
await png('180.png', 180, 180, quadrado(180, 22, cores.bg));
await png('192.png', 192, 192, quadrado(192, 24, cores.bg));
await png('512.png', 512, 512, quadrado(512, 64, cores.bg));
await png('512-mascara.png', 512, 512, quadrado(512, 104, cores.bg));
const ico16 = await png(null, 16, 16, quadrado(16, 0, 'transparent'));
const ico32 = await png(null, 32, 32, quadrado(32, 1, 'transparent'));
const ico48 = await png(null, 48, 48, quadrado(48, 2, 'transparent'));

// favicon.ico com PNG dentro (aceito por todos os navegadores atuais)
function ico(imgs) {
  const cab = Buffer.alloc(6); cab.writeUInt16LE(0, 0); cab.writeUInt16LE(1, 2); cab.writeUInt16LE(imgs.length, 4);
  let deslocamento = 6 + 16 * imgs.length; const dir = [], dados = [];
  for (const { lado, buf } of imgs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(lado >= 256 ? 0 : lado, 0); e.writeUInt8(lado >= 256 ? 0 : lado, 1);
    e.writeUInt8(0, 2); e.writeUInt8(0, 3); e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buf.length, 8); e.writeUInt32LE(deslocamento, 12);
    deslocamento += buf.length; dir.push(e); dados.push(buf);
  }
  return Buffer.concat([cab, ...dir, ...dados]);
}
writeFileSync(join(STATIC, 'favicon.ico'), ico([{ lado: 16, buf: ico16 }, { lado: 32, buf: ico32 }, { lado: 48, buf: ico48 }]));

// imagem de previa do link (convite compartilhado): 1200x630
await png('previa.png', 1200, 630, `<div style="width:1200px;height:630px;box-sizing:border-box;padding:72px 88px;display:flex;align-items:center;gap:64px;
  background:radial-gradient(120% 90% at 30% 20%, ${cores['blood-dim']}, ${cores.bg} 70%);color:${cores.fg};font-family:Georgia,serif">
  <div style="width:300px;height:300px;flex:0 0 auto">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
  <div><div style="font:600 30px/1 'Arial Narrow',sans-serif;letter-spacing:.3em;text-transform:uppercase;color:${cores.blood2}">Mesa de RPG</div>
    <div style="font:800 104px/1.05 Georgia,serif;letter-spacing:.04em;color:${cores.gold};margin:18px 0 22px">Grimório</div>
    <div style="font:400 38px/1.35 Georgia,serif;color:${cores.fg2};max-width:640px">Você foi convidado para uma mesa. Entre e veja o que o mestre liberou.</div></div></div>`);

await br.close();
console.log('icones gravados em', DEST);
