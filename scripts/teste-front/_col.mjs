import { chromium } from 'playwright-core';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
let exe=null; for (const d of [process.env['ProgramFiles(x86)'],process.env.ProgramFiles]) { const b=join(d,'Microsoft','EdgeCore'); const f=join(d,'Microsoft','Edge','Application','msedge.exe'); if(existsSync(f)){exe=f;break;} if(existsSync(b)) for(const v of readdirSync(b).sort().reverse()){const g=join(b,v,'msedge.exe'); if(existsSync(g)){exe=g;break;}} if(exe)break; }
const html = readFileSync('../../src/main/resources/static/index.html','utf8').replace(/\r\n/g,'\n');
const a = html.indexOf('<script>\n(function(){'), b = html.lastIndexOf('})();\n</script>');
const js = html.slice(a, b);
// nomes declarados na coluna 0 (function X, var X=..., var A,B) e os indentados de topo conhecidos
const nomes = new Set();
for (const m of js.matchAll(/^function\s+([A-Za-z_$][\w$]*)/gm)) nomes.add(m[1]);
for (const m of js.matchAll(/^var\s+([^\n]*)/gm)) {
  let s = m[1], prof = 0, atual = '', pegando = true, str = null;
  for (let i = 0; i < s.length; i++) { const c = s[i];
    if (str) { if (c === '\') i++; else if (c === str) str = null; continue; }
    if (c === '"' || c === "'") { str = c; continue; }
    if ('([{'.includes(c)) prof++; else if (')]}'.includes(c)) prof--;
    if (prof === 0 && pegando && /[\w$]/.test(c)) atual += c;
    else if (prof === 0 && c === '=') { if (atual) nomes.add(atual); atual = ''; pegando = false; }
    else if (prof === 0 && (c === ',' || c === ';')) { if (pegando && atual) nomes.add(atual); atual = ''; pegando = true; }
  }
  if (pegando && atual) nomes.add(atual);
}
const nav = await chromium.launch({ executablePath: exe }); const pg = await nav.newPage();
await pg.goto('about:blank');
const doNavegador = await pg.evaluate(() => { const s = new Set(); for (let o = window; o; o = Object.getPrototypeOf(o)) for (const k of Object.getOwnPropertyNames(o)) s.add(k); return [...s]; });
await nav.close();
const colide = [...nomes].filter(n => doNavegador.includes(n));
console.log('declarados no topo:', nomes.size, '| nomes do navegador:', doNavegador.length);
console.log('COLISOES:', colide.join(', ') || 'nenhuma');
