// Teste de fumaca da API de verdade (Spring + H2/Postgres), sem stub.
// Sobe o jar numa pasta vazia e aponte BASE para ele:
//   PORT=8123 java -jar target/grimorio.jar     (numa pasta sem ./dados)
//   BASE=http://127.0.0.1:8123 node scripts/teste-api/teste.mjs
// Precisa de uma instancia SEM contas: a primeira conta criada aqui vira a administradora.
// So usa o Node (fetch nativo); guarda o cookie de sessao e o token CSRF de cada "pessoa".
const B = process.env.BASE || "http://127.0.0.1:8123";
let falhas = 0, total = 0;

function ok(cond, msg, extra) {
  total++;
  if (cond) console.log("  ok  " + msg);
  else { falhas++; console.log("  FALHOU  " + msg + (extra !== undefined ? " -> " + JSON.stringify(extra).slice(0, 300) : "")); }
}

class Pessoa {
  constructor(nome) { this.nome = nome; this.cookies = {}; }
  guarda(res) {
    for (const c of res.headers.getSetCookie()) {
      const [par] = c.split(";"); const i = par.indexOf("=");
      const k = par.slice(0, i), v = par.slice(i + 1);
      if (/max-age=0/i.test(c) || v === "") delete this.cookies[k]; else this.cookies[k] = v;
    }
  }
  async req(metodo, caminho, corpo, opc = {}) {
    const h = { Cookie: Object.entries(this.cookies).map(([k, v]) => k + "=" + v).join("; ") };
    if (this.cookies["XSRF-TOKEN"] && !opc.semCsrf) h["X-XSRF-TOKEN"] = decodeURIComponent(this.cookies["XSRF-TOKEN"]);
    let body;
    if (opc.form) { body = opc.form; }
    else if (opc.urlenc) { body = new URLSearchParams(corpo).toString(); h["Content-Type"] = "application/x-www-form-urlencoded"; }
    else if (corpo !== undefined) { body = JSON.stringify(corpo); h["Content-Type"] = "application/json"; }
    const res = await fetch(B + caminho, { method: metodo, headers: h, body, redirect: "manual" });
    this.guarda(res);
    const tipo = res.headers.get("content-type") || "";
    const bruto = Buffer.from(await res.arrayBuffer());
    let dados = null;
    if (/json/.test(tipo)) { try { dados = JSON.parse(bruto.toString("utf8")); } catch { dados = null; } }
    return { s: res.status, d: dados, bruto, tipo, h: res.headers };
  }
  get(c, o) { return this.req("GET", c, undefined, o); }
  post(c, b, o) { return this.req("POST", c, b, o); }
  put(c, b, o) { return this.req("PUT", c, b, o); }
  del(c, o) { return this.req("DELETE", c, undefined, o); }
  async ping() { await this.get("/api/ping"); }
  async entrar(login, senha) {
    await this.ping();
    return this.req("POST", "/api/login", { login, senha }, { urlenc: true });
  }
}

// PDF minimo de uma pagina com texto, para exercitar o PDFBox sem arquivo externo.
function pdfMinimo(texto) {
  const objs = [];
  const fluxo = `BT /F1 14 Tf 20 100 Td (${texto}) Tj ET`;
  objs.push("<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${fluxo.length} >>\nstream\n${fluxo}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let s = "%PDF-1.4\n"; const pos = [];
  objs.forEach((o, i) => { pos.push(s.length); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = s.length;
  s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + pos.map(p => String(p).padStart(10, "0") + " 00000 n \n").join("");
  s += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(s, "latin1");
}
// PNG 1x1 valido.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
/* PNG de qualquer tamanho feito na mao (zlib do Node), para a miniatura e o mapa terem o que reduzir */
const { deflateSync } = await import("node:zlib");
const CRC_T = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) { c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; }
  return c >>> 0;
});
function crc32(b) {
  let c = 0xffffffff;
  for (const x of b) { c = CRC_T[(c ^ x) & 255] ^ (c >>> 8); }
  return (c ^ 0xffffffff) >>> 0;
}
function pngGrande(w, h) {
  const bloco = (tipo, dados) => { const t = Buffer.from(tipo); const len = Buffer.alloc(4); len.writeUInt32BE(dados.length);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, dados]))); return Buffer.concat([len, t, dados, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const linhas = [];
  for (let y = 0; y < h; y++) {
    const l = Buffer.alloc(1 + w * 3);
    for (let x = 0; x < w; x++) { l[1 + x * 3] = x % 256; l[2 + x * 3] = (y * 6) % 256; l[3 + x * 3] = 120; }
    linhas.push(l);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloco("IHDR", ihdr), bloco("IDAT", deflateSync(Buffer.concat(linhas))), bloco("IEND", Buffer.alloc(0))]);
}

/* nomes das entradas de um zip, lidos do diretorio central (o conteudo comprimido pode citar
   os mesmos caminhos, entao procurar o texto no arquivo inteiro engana) */
function entradasZip(buf) {
  const nomes = [];
  for (let i = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])), p = buf.readUInt32LE(i + 16); buf.readUInt32LE(p) === 0x02014b50;) {
    const n = buf.readUInt16LE(p + 28), x = buf.readUInt16LE(p + 30), c = buf.readUInt16LE(p + 32);
    nomes.push(buf.toString("utf8", p + 46, p + 46 + n));
    p += 46 + n + x + c;
  }
  return nomes;
}

/* o campanha.json de dentro do zip (a entrada vem comprimida) */
async function textoCampanhaJson(buf) {
  const zlib = await import("node:zlib");
  for (let i = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])), p = buf.readUInt32LE(i + 16); buf.readUInt32LE(p) === 0x02014b50;) {
    const n = buf.readUInt16LE(p + 28), x = buf.readUInt16LE(p + 30), c = buf.readUInt16LE(p + 32);
    if (buf.toString("utf8", p + 46, p + 46 + n) === "campanha.json") {
      const met = buf.readUInt16LE(p + 10), tam = buf.readUInt32LE(p + 20), loc = buf.readUInt32LE(p + 42);
      const ini = loc + 30 + buf.readUInt16LE(loc + 26) + buf.readUInt16LE(loc + 28);
      const dados = buf.subarray(ini, ini + tam);
      return (met === 0 ? dados : zlib.inflateRawSync(dados)).toString("utf8");
    }
    p += 46 + n + x + c;
  }
  return "";
}

function forma(campo, buf, nome, tipo, extras = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries(extras)) f.append(k, v);
  f.append(campo, new Blob([buf], { type: tipo }), nome);
  return f;
}

const SENHA = "Segredo#123";
const mestre = new Pessoa("mestre"), jogador = new Pessoa("jogador"), anonimo = new Pessoa("anonimo");

console.log("\n=== publico e CSRF ===");
{
  let r = await anonimo.get("/");
  ok(r.s === 401, "a casca (/) so abre logado", r.s);
  r = await anonimo.get("/login.html?convite=abc");
  ok(r.s >= 300 && r.s < 400 && /paginas\/login\.html/.test(r.h.get("location") || "") && /convite=abc/.test(r.h.get("location") || ""),
     "/login.html redireciona para paginas/login.html preservando ?convite=", r.h.get("location"));
  r = await anonimo.get("/paginas/login.html");
  ok(r.s === 200, "login.html e publico");
  r = await anonimo.get("/api/sessao");
  ok(r.s === 401 || r.s === 403 || (r.s >= 300 && r.s < 400), "API sem login nao responde 200", r.s);
  r = await anonimo.post("/api/registrar", { login: "x", senha: "y" }, { semCsrf: true });
  ok(r.s === 403 && r.d?.codigo === "csrf", "POST sem token CSRF -> 403 codigo csrf", r.d);
}

console.log("\n=== cadastro e login ===");
{
  await mestre.ping();
  ok(!!mestre.cookies["XSRF-TOKEN"], "/api/ping entrega o cookie XSRF-TOKEN");
  let r = await mestre.post("/api/registrar", { login: "mestre", nome: "Mestre", senha: "abc" });
  ok(r.s >= 400, "senha curta e recusada", r.d);
  r = await mestre.post("/api/registrar", { login: "mestre", nome: "Mestre", senha: "abcdef123" });
  ok(r.s >= 400 && /especial/.test(JSON.stringify(r.d)), "senha sem caractere especial e recusada", r.d);
  r = await mestre.post("/api/registrar", { login: "mestre", nome: "Mestre", senha: "abcdef#!" });
  ok(r.s >= 400 && /n[uú]mero/.test(JSON.stringify(r.d)), "senha sem numero e recusada", r.d);
  r = await mestre.post("/api/registrar", { login: "mestre", nome: "Mestre", senha: SENHA });
  ok(r.s === 200 && r.d?.admin === true, "primeira conta vira administradora", r.d);
  r = await mestre.post("/api/registrar", { login: "mestre", nome: "Outro", senha: SENHA });
  ok(r.s >= 400, "login repetido e recusado", r.s);
  r = await mestre.entrar("mestre", "senha-errada1!");
  ok(r.s === 401, "senha errada -> 401", r.s);
  r = await mestre.entrar("mestre", SENHA);
  ok(r.s === 200 && r.d?.ok === true, "login certo -> 200", r.d);
  r = await mestre.get("/api/sessao");
  ok(r.s === 200 && r.d?.admin === true, "sessao mostra admin", r.d);
  r = await mestre.get("/");
  ok(r.s === 200 && /<!doctype html>/i.test(r.bruto.toString()) && /utf-8/i.test(r.tipo), "logado, index.html abre com doctype e utf-8", r.tipo);
  r = await mestre.get("/js/nucleo.js");
  ok(r.s === 200 && /utf-8/i.test(r.tipo), "js sai com charset utf-8", r.tipo);
  r = await mestre.get("/vendor/pdf.min.mjs");
  ok(r.s === 200 && /javascript/.test(r.tipo), "pdf.js (modulo .mjs) sai com tipo de JavaScript", r.tipo);
  r = await mestre.get("/vendor/pdf.worker.min.mjs");
  ok(r.s === 200 && /javascript/.test(r.tipo), "worker do pdf.js sai com tipo de JavaScript", r.tipo);
  r = await mestre.get("/css/pele.css");
  ok(r.s === 200 && /utf-8/i.test(r.tipo), "css sai com charset utf-8", r.tipo);
}

let cid, tokenConvite;
console.log("\n=== campanha, convite, guia e mesa ===");
{
  let r = await mestre.post("/api/campanhas", { nome: "Teste de API", sistema: "generico" });
  ok(r.s === 200 && r.d?.id, "cria campanha", r.d);
  cid = r.d.id;
  r = await mestre.post(`/api/campanhas/${cid}/convites`, { papel: "JOGADOR", usos: 1, dias: 7, rotulo: "mesa" });
  tokenConvite = r.d?.token;
  ok(r.s === 200 && tokenConvite, "cria convite de jogador", r.d);

  r = await jogador.post("/api/registrar", { login: "jogador", nome: "Jogador", senha: SENHA });
  ok(r.s === 403, "cadastro fechado sem convite", r.d);
  r = await jogador.post("/api/registrar", { login: "jogador", nome: "Jogador", senha: SENHA, convite: tokenConvite });
  ok(r.s === 200 && r.d?.campanha === cid, "cadastro com convite entra na campanha", r.d);
  r = await jogador.entrar("jogador", SENHA);
  ok(r.s === 200, "jogador faz login");
  r = await jogador.get("/api/sessao");
  ok(r.d?.admin === false, "jogador nao e admin", r.d);

  const guia = JSON.stringify({ versao: 3, campanha: { titulo: "Teste", secoes: [] }, elenco: { personagens: [], npcs: [], locais: [], pistas: [] }, sessoes: [] });
  r = await mestre.get(`/api/c/${cid}/guia`);
  ok(r.s === 200 && typeof r.d?.versao === "number", "mestre le o guia", r.d);
  const v0 = r.d.versao;
  r = await mestre.put(`/api/c/${cid}/guia`, { json: guia, versao: v0 });
  ok(r.s === 200, "mestre grava o guia", r.d);
  r = await mestre.put(`/api/c/${cid}/guia`, { json: guia, versao: v0 });
  ok(r.s === 409, "gravar com versao velha -> 409", r.s);
  r = await mestre.get(`/api/c/${cid}/guia`);
  ok(JSON.parse(r.d.json).versao === 3, "guia volta como foi gravado (unicode ok)");

  const mesa = JSON.stringify({ resumos: [], nomeIa: "Escriba", tema: "sangue" });
  r = await mestre.get(`/api/c/${cid}/mesa`);
  const mv = r.d?.versao;
  r = await mestre.put(`/api/c/${cid}/mesa`, { json: mesa, versao: mv });
  ok(r.s === 200, "mestre grava a mesa", r.d);
  r = await jogador.get(`/api/c/${cid}/mesa`);
  ok(r.s === 200 && /Escriba/.test(r.d?.json || ""), "jogador le a mesa", r.d);
  r = await jogador.put(`/api/c/${cid}/mesa`, { json: mesa, versao: 99 });
  ok(r.s === 403, "jogador nao grava a mesa", r.s);
}

console.log("\n=== separacao mestre/jogador ===");
{
  let r = await jogador.get(`/api/c/${cid}/guia`);
  ok(r.s === 403 && r.d?.codigo === "proibido", "jogador nao le o guia (403 com codigo)", r.d);
  r = await jogador.put(`/api/c/${cid}/guia`, { json: "{}", versao: 1 });
  ok(r.s === 403, "jogador nao grava o guia", r.s);
  r = await jogador.get("/api/admin/usuarios");
  ok(r.s === 403 && r.d?.codigo === "proibido", "jogador nao entra em /api/admin", r.d);
  r = await mestre.get("/api/admin/usuarios");
  ok(r.s === 200 && Array.isArray(r.d) && r.d.length >= 2, "admin lista usuarios", r.d);
  r = await mestre.get("/api/admin/sistema");
  ok(r.s === 200 && !!r.d?.armazenamento, "admin ve armazenamento", Object.keys(r.d || {}));
  r = await jogador.get(`/api/c/9999/mesa`);
  ok(r.s === 403 || r.s === 404, "campanha alheia nao abre", r.s);
}

console.log("\n=== rolagens ===");
{
  let r = await mestre.post(`/api/c/${cid}/rolagens`, { formula: "2d6+3", publica: true, rotulo: "ataque" });
  ok(r.s === 200 && r.d.valor >= 5 && r.d.valor <= 15, "2d6+3 entre 5 e 15", r.d);
  r = await mestre.post(`/api/c/${cid}/rolagens`, { formula: "2d20kh1", publica: true });
  ok(r.s === 200 && r.d.valor >= 1 && r.d.valor <= 20, "2d20kh1 valido", r.d);
  r = await mestre.post(`/api/c/${cid}/rolagens`, { formula: "4d6dl1", publica: true });
  ok(r.s === 200 && r.d.valor >= 3 && r.d.valor <= 18, "4d6dl1 valido", r.d);
  r = await mestre.post(`/api/c/${cid}/rolagens`, { lados: 20, publica: false, rotulo: "segredo" });
  ok(r.s === 200 && r.d.publica === false, "rolagem fechada do mestre", r.d);
  const idFechada = r.d.id;
  r = await mestre.post(`/api/c/${cid}/rolagens`, { formula: "lixo" });
  ok(r.s >= 400, "formula invalida e recusada", r.s);
  r = await jogador.get(`/api/c/${cid}/rolagens`);
  ok(r.s === 200 && Array.isArray(r.d) && !r.d.some(x => x.id === idFechada), "jogador nao recebe rolagem fechada do mestre", r.d);
  ok(r.d.some(x => x.formula === "2d6+3"), "jogador recebe a rolagem publica");
  r = await mestre.post(`/api/c/${cid}/rolagens/pedido`, { formula: "1d20", rotulo: "Percepcao" });
  ok(r.s === 200 && r.d.pedido === true, "mestre pede um teste", r.d);
  const pedido = r.d.id;
  r = await jogador.post(`/api/c/${cid}/rolagens`, { formula: "1d20", rotulo: "Percepcao", pedidoId: pedido });
  ok(r.s === 200, "jogador responde ao pedido", r.d);
}

console.log("\n=== fichas ===");
{
  let r = await jogador.post(`/api/c/${cid}/fichas`, { nome: "Heroi", json: JSON.stringify({ campos: { forca: 3 } }) });
  ok(r.s === 200 && r.d?.id, "jogador cria ficha", r.d);
  const fid = r.d.id;
  r = await mestre.get(`/api/c/${cid}/fichas`);
  ok(r.d?.some(f => f.id === fid), "mestre ve a ficha do jogador");
  r = await mestre.post(`/api/c/${cid}/fichas`, { nome: "Do Mestre", json: "{}" });
  const fm = r.d.id;
  r = await jogador.get(`/api/c/${cid}/fichas`);
  ok(r.d?.length === 1 && r.d[0].id === fid, "jogador so ve a propria ficha", r.d);
  r = await jogador.put(`/api/c/${cid}/fichas/${fm}`, { nome: "Roubada", json: "{}" });
  ok(r.s === 404, "ficha alheia responde 404, nao 403", r.s);
  r = await jogador.put(`/api/c/${cid}/fichas/${fid}`, { nome: "Heroi 2", json: "{}" });
  ok(r.s === 200, "jogador edita a propria ficha");
}

console.log("\n=== mapa (tabletop) ===");
{
  let r = await mestre.post(`/api/c/${cid}/midia/img`, null, { form: forma("arquivo", pngGrande(5000, 40), "mapa.png", "image/png", { nome: "mapa-grande" }) });
  ok(r.s === 200 && r.d?.arquivo, "mestre envia a imagem do mapa", r.d);
  const img = r.d.arquivo, imgId = r.d.id;
  r = await mestre.post(`/api/c/${cid}/mapas`, { nome: "Masmorra", imagem: img });
  ok(r.s === 200 && r.d.largura === 5000 && r.d.altura === 40 && r.d.ativo === false, "cria o mapa com o tamanho lido da imagem, desligado", r.d);
  const mid = r.d.id;
  r = await mestre.get(`/midia/c${cid}/${img}?mapa=1`);
  ok(r.s === 200 && /jpeg/.test(r.tipo) && r.bruto.length > 0, "a versao de mapa (ate 4096px) e gerada", r.tipo);
  r = await jogador.post(`/api/c/${cid}/mapas`, { nome: "Do jogador" });
  ok(r.s === 403, "jogador nao cria mapa", r.s);
  r = await jogador.get(`/api/c/${cid}/mapas`);
  ok(r.s === 200 && Array.isArray(r.d) && r.d.length === 0, "mapa desligado nao aparece na lista do jogador", r.d);
  r = await jogador.get(`/api/c/${cid}/mapas/${mid}`);
  ok(r.s === 404, "mapa desligado responde 404 ao jogador", r.s);

  const eu = (await jogador.get("/api/sessao")).d;
  r = await jogador.post(`/api/c/${cid}/fichas`, { nome: "Batedora", json: "{}" });
  const fichaJ = r.d.id;
  r = await mestre.post(`/api/c/${cid}/mapas/${mid}/elementos`, { dados: { nome: "Batedora", fichaId: fichaJ, x: 35, y: 35 } });
  ok(r.s === 200 && r.d.dono === eu.id && r.d.dados.vinculo === true, "token de ficha fica com o dono da ficha e nasce vinculado", r.d);
  const tJog = r.d.id;
  r = await mestre.post(`/api/c/${cid}/mapas/${mid}/elementos`, { visivel: false, dados: { nome: "Emboscada", npcId: "n1", x: 105, y: 35 } });
  const tOculto = r.d.id;
  r = await mestre.post(`/api/c/${cid}/mapas/${mid}/elementos`, { dados: { nome: "Guarda", x: 175, y: 35 } });
  const tGuarda = r.d.id;
  r = await mestre.post(`/api/c/${cid}/mapas/${mid}/elementos`, { dados: { nome: "Fora", img: "https://exemplo.com/x.png" } });
  ok(r.s === 400, "imagem de fora da campanha e recusada", r.s);
  r = await mestre.post(`/api/c/${cid}/mapas/${mid}/elementos`, { dados: { nome: "Outra", fichaId: 999999 } });
  ok(r.s === 400, "ficha de outra campanha nao vira token", r.s);
  r = await jogador.post(`/api/c/${cid}/mapas/${mid}/elementos`, { dados: { nome: "Meu" } });
  ok(r.s === 403, "jogador nao cria token", r.s);

  /* SSE do jogador aberto antes de o mapa ligar: ve o "ola", o "ativo" e os tokens que pode ver */
  const sse = await fetch(B + `/api/c/${cid}/mapas/eventos`, { headers: { Cookie: Object.entries(jogador.cookies).map(([k, v]) => k + "=" + v).join("; "), Accept: "text/event-stream" } });
  ok(sse.status === 200 && /text\/event-stream/.test(sse.headers.get("content-type") || ""), "jogador abre o fluxo SSE do mapa", sse.status);
  const leitor = sse.body.getReader(), dec = new TextDecoder();
  /* a leitura que sobra quando o tempo acaba fica guardada para a proxima espera: descartar
     perderia o pedaco do fluxo que ela trouxer */
  let recebido = "", lendo = null;
  const espera = async (re, ms = 4000) => {
    const fim = Date.now() + ms;
    while (!re.test(recebido) && Date.now() < fim) {
      lendo ??= leitor.read();
      const t = new Promise(res => setTimeout(() => res({ timeout: true }), Math.max(1, fim - Date.now())));
      const p = await Promise.race([lendo, t]);
      if (p.timeout) break;
      lendo = null;
      if (p.done) break;
      recebido += dec.decode(p.value);
    }
    return re.test(recebido);
  };
  ok(await espera(/"tipo":"ola"/), "o primeiro evento e o ola", recebido);

  r = await mestre.post(`/api/c/${cid}/mapas/${mid}/ativo`, { ativo: true });
  ok(r.s === 200 && r.d.ativo === mid, "mestre mostra o mapa aos jogadores", r.d);
  ok(await espera(new RegExp(`"tipo":"ativo","ativo":${mid}`)), "o jogador fica sabendo pelo SSE", recebido.slice(-200));
  r = await jogador.get(`/api/c/${cid}/mapas`);
  ok(r.d?.length === 1 && r.d[0].id === mid && !("cenaId" in r.d[0]), "o jogador ve o mapa ativo, sem o vinculo com a cena", r.d);
  r = await jogador.get(`/api/c/${cid}/mapas/${mid}`);
  const ids = (r.d?.elementos || []).map(e => e.id);
  ok(r.s === 200 && ids.includes(tJog) && ids.includes(tGuarda) && !ids.includes(tOculto), "token oculto nao sai para o jogador", ids);
  const meu = r.d.elementos.find(e => e.id === tJog);
  ok(meu.meu === true && meu.podeMover === true && !("fichaId" in meu.dados) && !("ordem" in meu), "o jogador ve o proprio token, sem o vinculo com a ficha", meu);
  ok(r.d.elementos.find(e => e.id === tGuarda).podeMover === false, "e o do mestre vem marcado como fixo para ele");
  const seq = r.d.seq;
  r = await jogador.get(`/api/c/${cid}/mapas/${mid}?desde=${seq}`);
  ok(r.s === 200 && r.d.igual === true && !r.d.elementos, "polling com o seq atual devolve so o seq", r.d);
  /* a imagem do mapa: o jogador nao recebe o caminho, nem a baixa pela midia; so em pedacos */
  r = await jogador.get(`/api/c/${cid}/mapas/${mid}`);
  ok(!("imagem" in r.d.mapa) && r.d.vista?.modo === "nenhum" && r.d.vista.tiles?.cols === 8 && r.d.vista.tiles.lins === 1 && r.d.vista.tiles.v.every(v => v.endsWith("f")) && !r.d.vista.png,
    "o jogador recebe a vista (sem nevoa: todos os pedacos inteiros) e nao o caminho da imagem", { mapa: r.d.mapa, vista: r.d.vista });
  const v0 = r.d.vista.tiles.v[0];
  r = await jogador.get(`/api/c/${cid}/mapas/${mid}/tile/0/0?v=${encodeURIComponent(v0)}`);
  ok(r.s === 200 && /jpeg/.test(r.tipo) && r.bruto.length > 0 && /max-age/.test(r.h.get("cache-control") || ""), "o jogador baixa um pedaco da imagem, e o navegador pode guarda-lo", { s: r.s, t: r.tipo, c: r.h.get("cache-control") });
  r = await jogador.get(`/api/c/${cid}/mapas/${mid}/tile/0/0?v=velha`);
  ok(r.s === 200 && /no-store/.test(r.h.get("cache-control") || ""), "com a versao velha o pedaco vem, mas sem guardar", r.h.get("cache-control"));
  r = await jogador.get(`/api/c/${cid}/mapas/${mid}/tile/9/0`);
  ok(r.s === 404, "pedaco fora da imagem responde 404", r.s);
  for (const q of ["", "?mini=1", "?mapa=1"]) {
    r = await jogador.get(`/midia/c${cid}/${img}${q}`); // NOSONAR: o teste pede um de cada vez de proposito (a ordem e o estado do servidor importam)
    ok(r.s === 403, "a imagem do mapa nao sai pela midia para o jogador" + (q ? " (" + q + ")" : ""), r.s);
  }
  r = await jogador.get(`/midia/c${cid}/img/.mini/${img.slice(4)}.jpg`);
  ok(r.s === 403, "nem pelo caminho da miniatura", r.s);
  r = await mestre.get(`/midia/c${cid}/${img}?mapa=1`);
  ok(r.s === 200, "o mestre continua baixando a imagem do mapa", r.s);
  r = await jogador.get(`/api/c/${cid}/midia`);
  ok(r.s === 200 && !r.d.imagens.some(i => i.arquivo === img), "e a imagem do mapa nao aparece no catalogo do jogador", r.d.imagens);
  r = await mestre.get(`/api/c/${cid}/midia`);
  ok(r.d.imagens.some(i => i.arquivo === img), "no do mestre, aparece", r.d.imagens.length);

  recebido = "";
  r = await mestre.put(`/api/c/${cid}/mapas/${mid}/elementos/${tOculto}`, { dados: { x: 245 } });
  ok(r.s === 200 && r.d.dados.x === 245, "mestre move o token oculto");
  ok(!(await espera(new RegExp(`${tOculto}`), 1200)), "e o jogador nao recebe nada sobre ele, nem o id", recebido);
  r = await jogador.put(`/api/c/${cid}/mapas/${mid}/elementos/${tJog}`, { dados: { x: 105, y: 35, nome: "Trocado", tam: 4 }, visivel: false, dono: 0 });
  ok(r.s === 200 && r.d.dados.x === 105 && r.d.dados.nome === "Batedora" && r.d.dados.tam === 1 && r.d.visivel === true && r.d.dono === eu.id,
    "jogador move o proprio token e so a posicao muda", r.d);
  ok(await espera(new RegExp(`"tipo":"elemento".*"id":${tJog}`)), "o movimento sai pelo SSE", recebido.slice(-300));
  /* o caminho que quem moveu desenhou viaja junto, para o token dos outros andar por ele em vez de saltar */
  recebido = "";
  r = await mestre.put(`/api/c/${cid}/mapas/${mid}/elementos/${tGuarda}`, { dados: { x: 300, y: 300 }, trajeto: [[300, 40], [320, 40]] });
  ok(r.s === 200 && await espera(/"via":\[\[300(\.0)?,40(\.0)?\],\[320(\.0)?,40(\.0)?\]/), "o evento do movimento leva o caminho desenhado (via)", recebido.slice(-120));
  r = await mestre.put(`/api/c/${cid}/mapas/${mid}/elementos/${tGuarda}`, { dados: { x: 301, y: 300 } });
  ok(r.s === 200, "mestre ainda move o token sem caminho");
  r = await jogador.put(`/api/c/${cid}/mapas/${mid}/elementos/${tGuarda}`, { dados: { x: 0 } });
  ok(r.s === 403 && r.d?.codigo === "proibido", "jogador nao move o token dos outros", r.d);
  r = await jogador.put(`/api/c/${cid}/mapas/${mid}/elementos/${tOculto}`, { dados: { x: 0 } });
  ok(r.s === 404, "token oculto responde 404 ao jogador", r.s);
  await mestre.put(`/api/c/${cid}/mapas/${mid}/elementos/${tGuarda}`, { dados: { livre: true } });
  r = await jogador.put(`/api/c/${cid}/mapas/${mid}/elementos/${tGuarda}`, { dados: { x: 245 } });
  ok(r.s === 200 && r.d.dados.x === 245, "token liberado pelo mestre o jogador move", r.d);
  recebido = "";
  await mestre.put(`/api/c/${cid}/mapas/${mid}/elementos/${tGuarda}`, { visivel: false });
  ok(await espera(new RegExp(`"tipo":"some".*"id":${tGuarda}`)), "token que o mestre esconde some da tela do jogador", recebido.slice(-200));
  r = await jogador.put(`/api/c/${cid}/mapas/${mid}`, { nome: "Hackeado" });
  ok(r.s === 403, "jogador nao edita o mapa", r.s);
  r = await jogador.del(`/api/c/${cid}/mapas/${mid}/elementos/${tJog}`);
  ok(r.s === 403, "jogador nao remove token", r.s);
  r = await mestre.put(`/api/c/${cid}/mapas/${mid}`, { grid: { tipo: "hex", tam: 5, opac: 7, lixo: 1 }, regras: { quem: "todos" } });
  ok(r.s === 200 && r.d.grid.tipo === "hex" && r.d.grid.tam === 8 && r.d.grid.opac === 1 && !("lixo" in r.d.grid) && r.d.regras.quem === "todos",
    "grade e regras passam pela faixa do servidor", r.d);
  r = await jogador.put(`/api/c/${cid}/mapas/${mid}/elementos/${tJog}`, { dados: { x: 99999 } });
  ok(r.s === 200 && r.d.dados.x === 10000, "posicao fica presa perto do mapa", r.d?.dados);
  await leitor.cancel();

  const outro = new Pessoa("outro");
  await outro.post("/api/registrar", { login: "outro", nome: "Outro", senha: SENHA });
  r = await outro.get(`/api/c/${cid}/mapas/eventos`);
  ok(r.s === 403 || r.s === 401, "quem nao e da campanha nao abre o SSE", r.s);
  r = await outro.get(`/api/c/${cid}/mapas/${mid}/tile/0/0`);
  ok(r.s === 403 || r.s === 401, "nem baixa um pedaco do mapa", r.s);
  await mestre.post(`/api/c/${cid}/mapas/${mid}/ativo`, { ativo: false });
  r = await jogador.get(`/api/c/${cid}/mapas/${mid}`);
  ok(r.s === 404, "mapa desligado de novo some para o jogador", r.s);
  r = await jogador.get(`/api/c/${cid}/mapas/${mid}/tile/0/0`);
  ok(r.s === 404, "e os pedacos dele tambem", r.s);
  r = await jogador.get(`/midia/c${cid}/${img}`);
  ok(r.s === 403, "a imagem de mapa desligado tambem nao sai pela midia", r.s);
  r = await mestre.del(`/api/c/${cid}/mapas/${mid}`);
  ok(r.s === 204, "mestre apaga o mapa", r.s);
  r = await mestre.get(`/api/c/${cid}/mapas`);
  ok(r.d?.length === 0, "e ele sai da lista", r.d);
  r = await mestre.del(`/api/c/${cid}/midia/${imgId}`);
  ok(r.s === 204 || r.s === 200, "a imagem do mapa sai da biblioteca (as contagens adiante nao a esperam)", r.s);
}

console.log("\n=== mapa: molde (os elementos nascem com o mapa) ===");
{
  const els = [
    { tipo: "PAREDE", dados: { kind: "parede", pts: [[0, 0], [700, 0]] } },
    { tipo: "PAREDE", dados: { kind: "porta", pts: [[700, 0], [770, 0]] } },
    { tipo: "DESENHO", visivel: false, dados: { forma: "marca", pts: [[105, 105]], cor: "sangue", rotulo: "Armadilha" } },
    { tipo: "TOKEN", visivel: false, camada: "npcs", dados: { nome: "Goblin 1", x: 175, y: 175, tam: 1 } },
    { tipo: "TOKEN", camada: "personagens", dados: { nome: "Personagem 1", x: 35, y: 35, tam: 1 } }
  ];
  let r = await mestre.post(`/api/c/${cid}/mapas`, { nome: "Cripta", largura: 2100, altura: 1400, regras: { fog: "visao" }, elementos: els });
  ok(r.s === 200 && r.d.regras?.fog === "visao", "cria o mapa do molde com a nevoa pela visao", r.d);
  const mm = r.d.id;
  r = await mestre.get(`/api/c/${cid}/mapas/${mm}`);
  const es = r.d?.elementos || [];
  ok(es.length === 5 && es.filter(e => e.tipo === "PAREDE").length === 2 && es.some(e => e.tipo === "PAREDE" && e.dados.kind === "porta" && e.dados.aberta === false),
    "paredes e porta do molde nascem com o mapa", es);
  ok(es.some(e => e.tipo === "TOKEN" && e.dados.nome === "Goblin 1" && e.visivel === false && e.camada === "npcs") && es.some(e => e.tipo === "DESENHO" && e.visivel === false),
    "NPC e marcacao do molde nascem escondidos", es);
  r = await mestre.post(`/api/c/${cid}/mapas`, { nome: "Torto", elementos: [{ tipo: "PAREDE", dados: { kind: "parede", pts: [[0, 0], [70, 0]] } }, { tipo: "DESENHO", dados: { forma: "nada" } }] });
  ok(r.s === 400, "elemento torto no molde recusa o pedido", r.s);
  r = await mestre.get(`/api/c/${cid}/mapas`);
  ok(r.d?.length === 1 && !r.d.some(m => m.nome === "Torto"), "e nao sobra mapa pela metade", r.d);
  r = await jogador.post(`/api/c/${cid}/mapas`, { nome: "Do jogador", elementos: els });
  ok(r.s === 403, "jogador nao cria mapa com molde", r.s);
  r = await mestre.del(`/api/c/${cid}/mapas/${mm}`);
  ok(r.s === 204 || r.s === 200, "apaga o mapa do molde", r.s);
}

console.log("\n=== mapa: movimento (deslocamento, desfazer, historico) ===");
{
  const M = `/api/c/${cid}/mapas`;
  let r = await mestre.post(M, { nome: "Campo" });
  const mid = r.d.id;
  ok(r.d.regras.limite === "aviso" && r.d.grid.diagonal === "121" && r.d.grid.escala === 1.5, "mapa novo: diagonal 1-2-1, 1,5 por casa e limite so avisa", r.d);
  await mestre.post(`${M}/${mid}/ativo`, { ativo: true });
  const eu = (await jogador.get("/api/sessao")).d;
  r = await mestre.post(`${M}/${mid}/elementos`, { dono: eu.id, dados: { nome: "Corredora", x: 35, y: 35, desl: 6 } });
  const t = r.d.id;
  ok(r.d.dados.desl === 6 && !("usado" in r.d.dados), "token nasce com deslocamento por turno, sem nada gasto", r.d.dados);
  r = await mestre.post(`${M}/${mid}/elementos`, { dados: { nome: "Guarda", x: 700, y: 700, desl: 9 } });
  const tG = r.d.id;
  r = await mestre.post(`${M}/${mid}/elementos`, { dados: { nome: "Sentinela", x: 770, y: 700, desl: -5 } });
  ok(r.d.dados.desl === 0, "deslocamento negativo vira zero", r.d.dados);
  r = await jogador.get(`${M}/${mid}`);
  const vistos = Object.fromEntries(r.d.elementos.map(e => [e.id, e.dados]));
  ok(vistos[t].desl === 6 && !("desl" in vistos[tG]), "o jogador ve o deslocamento do proprio token, e nao o dos outros", vistos);
  r = await jogador.put(`${M}/${mid}/elementos/${t}`, { dados: { desl: 999, usado: -50 } });
  ok(r.s === 200 && r.d.dados.desl === 6 && !r.d.dados.usado, "o jogador nao muda o proprio deslocamento nem o gasto", r.d?.dados);

  r = await jogador.put(`${M}/${mid}/elementos/${t}`, { dados: { x: 245, y: 245 } });
  ok(r.s === 200 && r.d.dados.usado === 6 && !r.d.passou, "3 casas em diagonal custam 4 (1-2-1): 6 m, o limite exato", r.d?.dados);
  r = await jogador.put(`${M}/${mid}/elementos/${t}`, { dados: { x: 315, y: 245 } });
  ok(r.s === 200 && r.d.passou === true && r.d.dados.usado === 7.5, "no modo aviso passar do limite move e diz que passou", r.d);
  await mestre.put(`${M}/${mid}`, { regras: { quem: "dono", limite: "bloqueio" } });
  r = await jogador.put(`${M}/${mid}/elementos/${t}`, { dados: { x: 385, y: 245 } });
  ok(r.s === 409 && r.d?.codigo === "limite-de-movimento" && /custa 1,5/.test(r.d.erro), "no modo bloqueio o servidor recusa e diz o custo", r.d);
  r = await jogador.get(`${M}/${mid}`);
  ok(r.d.elementos.find(e => e.id === t).dados.x === 315, "e o token fica onde estava");
  r = await mestre.put(`${M}/${mid}/elementos/${t}`, { dados: { x: 35, y: 35 } });
  ok(r.s === 200 && r.d.dados.usado === 7.5, "o mestre move sem ser barrado e sem gastar nem devolver deslocamento", r.d?.dados);

  r = await jogador.post(`${M}/turno`, {});
  ok(r.s === 403, "jogador nao muda o turno do mapa", r.s);
  r = await mestre.post(`${M}/turno`, {});
  ok(r.s === 200 && r.d.zerados === 1, "novo turno zera o gasto de quem gastou", r.d);
  r = await jogador.get(`${M}/${mid}`);
  ok(r.d.elementos.find(e => e.id === t).dados.usado === 0, "e o jogador ve o gasto zerado");

  r = await jogador.put(`${M}/${mid}/elementos/${t}`, { dados: { x: 105, y: 35 } });
  ok(r.d.dados.usado === 1.5, "uma casa custa 1,5 m", r.d?.dados);
  r = await jogador.post(`${M}/${mid}/desfazer`, {});
  ok(r.s === 200 && r.d.el.dados.x === 35 && r.d.el.dados.usado === 0, "o jogador desfaz o proprio movimento e o deslocamento volta", r.d);
  r = await jogador.post(`${M}/${mid}/desfazer`, {});
  ok(r.s === 409, "os movimentos antigos ja nao se aplicam (o token foi movido depois): nada a desfazer", r);
  r = await jogador.get(`${M}/${mid}/historico`);
  ok(r.s === 200 && r.d.length >= 3 && r.d.every(l => l.meu === true) && r.d.some(l => l.casas === 4) && r.d.some(l => l.desfeito),
    "o historico do jogador e so o dele, com as casas andadas e o que foi desfeito", r.d);
  r = await mestre.get(`${M}/${mid}/historico`);
  ok(r.s === 200 && r.d.some(l => l.meu === false) && r.d.some(l => l.operacao === "turno") && r.d.some(l => l.operacao === "criar") && r.d.every(l => l.quem),
    "o historico do mestre tem tudo, de todos", r.d.map(l => l.operacao));
  const seqMestre = r.d.find(l => l.meu === true).seq;
  r = await jogador.post(`${M}/${mid}/desfazer`, { seq: seqMestre });
  ok(r.s === 404, "ninguem desfaz a acao de outra pessoa", r.s);

  r = await mestre.del(`${M}/${mid}/elementos/${tG}`);
  ok(r.s === 200 && r.d.seq > 0, "remover devolve o seq da operacao", r.d);
  r = await mestre.post(`${M}/${mid}/desfazer`, { seq: r.d.seq });
  const novo = r.d?.el;
  ok(r.s === 200 && novo && novo.id !== tG && novo.dados.nome === "Guarda" && novo.dados.desl === 9, "desfazer a remocao recria o token com outro id", r.d);
  r = await mestre.get(`${M}/${mid}/historico`);
  ok(r.d.some(l => l.elemento === novo.id && l.operacao === "criar") && !r.d.some(l => l.elemento === tG), "o historico passa a apontar para o token recriado", r.d.map(l => l.elemento));
  r = await mestre.post(`${M}/${mid}/elementos`, { dados: { nome: "Engano" } });
  const tE = r.d.id;
  r = await mestre.post(`${M}/${mid}/desfazer`, {});
  ok(r.s === 200 && r.d.el === null && r.d.id === tE, "desfazer a criacao tira o token", r.d);
  r = await mestre.get(`${M}/${mid}`);
  ok(!r.d.elementos.some(e => e.id === tE), "e ele nao esta mais no mapa");

  /* grade hexagonal: conta passos de hexagono, nao distancia em linha reta */
  await mestre.put(`${M}/${mid}`, { grid: { tipo: "hex", tam: 70, escala: 1, unidade: "m" }, regras: { quem: "dono", limite: "bloqueio" } });
  await mestre.put(`${M}/${mid}/elementos/${t}`, { dados: { x: 35, y: 40.4, desl: 2 } });
  await mestre.post(`${M}/turno`, {});
  r = await jogador.put(`${M}/${mid}/elementos/${t}`, { dados: { x: 35, y: 161.7 } });
  ok(r.s === 200 && r.d.dados.usado === 2, "no hexagono, duas linhas abaixo custam 2 passos", r.d?.dados);
  r = await jogador.put(`${M}/${mid}/elementos/${t}`, { dados: { x: 105, y: 161.7 } });
  ok(r.s === 409, "e mais um passo passa do limite de 2", r.s);
  /* euclidiana */
  await mestre.put(`${M}/${mid}`, { grid: { tipo: "quadrado", tam: 70, escala: 1, unidade: "m", diagonal: "eu" } });
  await mestre.put(`${M}/${mid}/elementos/${t}`, { dados: { x: 35, y: 35, desl: 10 } });
  await mestre.post(`${M}/turno`, {});
  r = await jogador.put(`${M}/${mid}/elementos/${t}`, { dados: { x: 245, y: 315 } });
  ok(r.s === 200 && r.d.dados.usado === 5, "euclidiana: 3 por 4 casas valem 5", r.d?.dados);
  r = await mestre.get(`${M}/${mid}/historico?limite=3`);
  ok(r.d.length === 3, "o historico respeita o limite pedido", r.d.length);

  /* iniciativa: o turno zera o deslocamento e a vez libera o token de cada um */
  await mestre.put(`${M}/${mid}`, { grid: { tipo: "quadrado", tam: 70, escala: 1, unidade: "m", diagonal: "1" }, regras: { quem: "dono", limite: "aviso" } });
  await mestre.put(`${M}/${mid}/elementos/${t}`, { dados: { x: 35, y: 35, desl: 10 } });
  await mestre.post(`${M}/turno`, {});
  /* o elo da iniciativa e o id do token: a entrada da ordem aponta para ele */
  const idGuarda = String((await mestre.get(`${M}/${mid}`)).d.elementos.find(e => e.dados.nome === "Guarda").id), idCorr = String(t);
  const ordem = (rodada, vez) => ({ ativo: true, rodada, vez: vez === "Guarda" ? idGuarda : idCorr, ids: [idCorr, idGuarda], ini: { rodada, vez: vez === "Guarda" ? 0 : 1, lista: [{ nome: "Guarda", v: 15 }, { nome: "Corredora", v: 10 }] } });
  r = await jogador.put(`${M}/turno`, ordem(1, "Guarda"));
  ok(r.s === 403, "jogador nao informa a iniciativa", r.s);
  r = await mestre.put(`${M}/turno`, ordem(1, "Guarda"));
  ok(r.s === 200 && r.d.novo === true && r.d.rodada === 1, "a iniciativa que comeca e um turno novo", r.d);
  r = await jogador.put(`${M}/${mid}/elementos/${t}`, { dados: { x: 105, y: 35 } });
  ok(r.s === 403 && /vez de Corredora/.test(r.d?.erro), "na vez de outro, o jogador nao move o proprio token e a tela diz de quem e a vez", r.d);
  r = await jogador.get(`${M}/${mid}`);
  const porNome = Object.fromEntries(r.d.elementos.map(e => [e.dados.nome, e]));
  ok(porNome.Corredora.esperaVez === true && porNome.Corredora.podeMover === false && porNome.Guarda.daVez === true, "o estado marca quem espera e de quem e a vez", { c: porNome.Corredora, g: porNome.Guarda?.daVez });
  r = await mestre.post(`${M}/${mid}/elementos`, { dono: eu.id, dados: { nome: "Estranho", x: 35, y: 105 } });
  const tEst = r.d.id;
  r = await jogador.put(`${M}/${mid}/elementos/${tEst}`, { dados: { x: 105, y: 105 } });
  ok(r.s === 200, "token sem vinculo com o elenco continua livre, tenha o nome que tiver", r.s);
  r = await mestre.put(`${M}/${mid}/elementos/${t}`, { dados: { x: 35, y: 35 } });
  ok(r.s === 200, "o mestre move qualquer um fora da vez");
  r = await mestre.put(`${M}/turno`, ordem(1, "Corredora"));
  ok(r.d.novo === false, "so passar a vez nao e turno novo", r.d);
  r = await jogador.put(`${M}/${mid}/elementos/${t}`, { dados: { x: 105, y: 35 } });
  ok(r.s === 200 && r.d.dados.usado === 1, "na vez dele o jogador move e gasta", r.d);
  r = await jogador.post(`${M}/${mid}/desfazer`, {});
  ok(r.s === 200 && r.d.el.dados.x === 35, "e desfaz na propria vez", r.d);
  await jogador.put(`${M}/${mid}/elementos/${t}`, { dados: { x: 105, y: 35 } });
  r = await mestre.put(`${M}/turno`, ordem(2, "Guarda"));
  ok(r.d.novo === true && r.d.rodada === 2, "a ordem que da a volta e um turno novo", r.d);
  r = await jogador.get(`${M}/${mid}`);
  ok(r.d.elementos.find(e => e.id === t).dados.usado === 0 && r.d.elementos.find(e => e.id === t).esperaVez === true, "o turno novo zera o gasto, mas libera so quem tem a vez");
  r = await mestre.get(`${M}/${mid}/historico?limite=5`);
  ok(r.d.some(l => l.operacao === "turno"), "o turno novo entra no historico");
  await mestre.put(`${M}/turno`, { ativo: false, ini: null });
  r = await jogador.put(`${M}/${mid}/elementos/${t}`, { dados: { x: 175, y: 35 } });
  ok(r.s === 200, "sem iniciativa em andamento o jogador volta a mover quando quiser", r.s);

  await mestre.post(`${M}/${mid}/ativo`, { ativo: false });
  r = await jogador.get(`${M}/${mid}/historico`);
  ok(r.s === 404, "historico de mapa desligado responde 404 ao jogador", r.s);
  r = await jogador.post(`${M}/${mid}/desfazer`, {});
  ok(r.s === 404, "e o desfazer tambem", r.s);
  r = await mestre.del(`${M}/${mid}`);
  ok(r.s === 204, "apagar o mapa leva o historico junto", r.s);
}

console.log("\n=== mapa: organizacao (camadas, desenho, grupo, trava, vida e marcas) ===");
{
  const M = `/api/c/${cid}/mapas`;
  let r = await mestre.post(M, { nome: "Organizado" });
  const mid = r.d.id;
  await mestre.post(`${M}/${mid}/ativo`, { ativo: true });
  const eu = (await jogador.get("/api/sessao")).d;
  r = await mestre.post(`${M}/${mid}/elementos`, { dono: eu.id, dados: { nome: "Heroina", x: 35, y: 35, vidaMax: 20, vida: 12, vidaPublica: false, marcas: [{ t: "Envenenado", c: "sangue" }, { t: "x", c: "invalida" }] } });
  const tH = r.d.id;
  ok(r.d.camada === "personagens" && r.d.dados.vidaMax === 20 && r.d.dados.vida === 12 && r.d.dados.marcas.length === 2 && r.d.dados.marcas[1].c === "aviso", "token nasce na camada Personagens, com vida e marcas (cor invalida cai para a padrao)", r.d);
  r = await mestre.post(`${M}/${mid}/elementos`, { visivel: false, camada: "npcs", dados: { nome: "Chefe", npcId: "n1", x: 105, y: 35, vidaMax: 50, vida: 50 } });
  const tC = r.d.id;
  ok(r.d.camada === "npcs", "token de NPC vai para a camada NPCs", r.d);
  r = await mestre.post(`${M}/${mid}/elementos`, { camada: "inventada", dados: { nome: "Aleatorio" } });
  ok(r.s === 200 && r.d.camada === "personagens", "camada desconhecida cai para a padrao", r.d);

  /* desenhos: so o mestre cria; forma, pontos e cor sao validados */
  const des = (forma, pts, extra) => ({ tipo: "DESENHO", dados: { forma, pts, cor: "sangue", esp: 4, ...extra } });
  r = await jogador.post(`${M}/${mid}/elementos`, des("linha", [[0, 0], [70, 70]]));
  ok(r.s === 403, "jogador nao desenha", r.s);
  r = await mestre.post(`${M}/${mid}/elementos`, des("estrela", [[0, 0], [70, 70]]));
  ok(r.s === 400, "forma desconhecida e recusada", r.s);
  r = await mestre.post(`${M}/${mid}/elementos`, des("poligono", [[0, 0], [70, 70]]));
  ok(r.s === 400, "poligono com menos de tres pontos e recusado", r.s);
  r = await mestre.post(`${M}/${mid}/elementos`, des("linha", [[0, 0], ["a", 70]]));
  ok(r.s === 400, "ponto invalido e recusado", r.s);
  r = await mestre.post(`${M}/${mid}/elementos`, des("linha", [[0, 0], [70.04, 70.06]], { cor: "rosa-choque", rotulo: "Muro" }));
  ok(r.s === 200 && r.d.tipo === "DESENHO" && r.d.camada === "decoracao" && r.d.dados.cor === "ouro" && r.d.dados.pts[1][0] === 70 && r.d.dados.rotulo === "Muro", "desenho: camada Decoracao, cor fora da paleta cai para ouro, pontos arredondados", r.d);
  const dL = r.d.id;
  r = await mestre.post(`${M}/${mid}/elementos`, { ...des("circulo", [[400, 400], [470, 400]]), visivel: false });
  const dOculto = r.d.id;
  r = await mestre.post(`${M}/${mid}/elementos`, des("retangulo", [[700, 700], [840, 770]], { preench: 0.5 }));
  const dR = r.d.id;
  r = await jogador.get(`${M}/${mid}`);
  const ids = r.d.elementos.map(e => e.id);
  ok(ids.includes(dL) && ids.includes(dR) && !ids.includes(dOculto) && !ids.includes(tC), "o jogador ve o desenho visivel e nunca o oculto nem o NPC escondido", ids);
  const meuT = r.d.elementos.find(e => e.id === tH), dJ = r.d.elementos.find(e => e.id === dL);
  ok(meuT.dados.vidaMax === 20 && meuT.dados.vida === 12 && meuT.dados.marcas.length === 2, "o dono do token ve a vida e as marcas", meuT.dados);
  ok(dJ.podeMover === false && !("bloqueado" in dJ), "desenho nunca e movivel para o jogador e o bloqueio nao sai", dJ);
  r = await jogador.put(`${M}/${mid}/elementos/${dL}`, { dados: { pts: [[1, 1], [2, 2]] } });
  ok(r.s === 403, "jogador nao mexe no desenho", r.s);

  /* vida de quem nao e dono: so aparece quando o mestre a torna publica */
  r = await mestre.post(`${M}/${mid}/elementos`, { dados: { nome: "Guarda", x: 175, y: 35, vidaMax: 10, vida: 10, marcas: [{ t: "Atordoado", c: "aviso" }] } });
  const tG = r.d.id;
  r = await jogador.get(`${M}/${mid}`);
  let g = r.d.elementos.find(e => e.id === tG).dados;
  ok(!("vida" in g) && !("vidaMax" in g) && g.marcas?.[0]?.t === "Atordoado", "vida de token alheio nao sai para o jogador, as marcas saem", g);
  await mestre.put(`${M}/${mid}/elementos/${tG}`, { dados: { vidaPublica: true } });
  r = await jogador.get(`${M}/${mid}`);
  g = r.d.elementos.find(e => e.id === tG).dados;
  ok(g.vida === 10 && g.vidaMax === 10 && !("vidaPublica" in g), "com a vida publica o jogador a ve", g);
  await mestre.put(`${M}/${mid}/elementos/${tG}`, { dados: { vidaMax: 0 } });
  r = await mestre.get(`${M}/${mid}`);
  ok(!("vidaMax" in r.d.elementos.find(e => e.id === tG).dados) && !("vida" in r.d.elementos.find(e => e.id === tG).dados), "vida maxima 0 tira a barra", r.d);

  /* grupo: uma operacao so, tudo ou nada, e um desfazer so */
  const pos = async id => (await mestre.get(`${M}/${mid}`)).d.elementos.find(e => e.id === id);
  r = await mestre.put(`${M}/${mid}/elementos`, { itens: [{ id: tG, dados: { x: 245, y: 105 } }, { id: dL, dados: { pts: [[70, 70], [140, 140]] } }, { id: dR, camada: "objetos" }] });
  ok(r.s === 200 && r.d.itens.length === 3 && r.d.seq > 0, "mover e organizar em grupo numa chamada", r.d);
  ok((await pos(tG)).dados.x === 245 && (await pos(dL)).dados.pts[0][0] === 70 && (await pos(dR)).camada === "objetos", "o grupo moveu o token, o desenho e trocou a camada");
  const hist = (await mestre.get(`${M}/${mid}/historico?limite=10`)).d.filter(h => h.seq === r.d.seq);
  ok(hist.length === 3, "as tres linhas do grupo levam o mesmo seq no historico", hist.length);
  r = await mestre.post(`${M}/${mid}/desfazer`, {});
  ok(r.s === 200 && Array.isArray(r.d.outros) && r.d.outros.length === 2, "um desfazer devolve o grupo inteiro", r.d);
  ok((await pos(tG)).dados.x === 175 && (await pos(dL)).dados.pts[0][0] === 0 && (await pos(dR)).camada === "decoracao", "o grupo voltou ao que era");
  r = await jogador.put(`${M}/${mid}/elementos`, { itens: [{ id: tH, dados: { x: 1, y: 1 } }] });
  ok(r.s === 403, "jogador nao usa a operacao em grupo", r.s);
  r = await mestre.put(`${M}/${mid}/elementos`, { itens: [] });
  ok(r.s === 400, "grupo vazio e recusado", r.s);
  r = await mestre.put(`${M}/${mid}/elementos`, { itens: [{ id: tG, dados: { x: 999, y: 999 } }, { id: 999999, dados: { x: 1, y: 1 } }] });
  ok(r.s === 404 && (await pos(tG)).dados.x === 175, "um item que nao existe derruba o grupo todo e nada muda", r.s);

  /* remover em grupo e desfazer recria desenho como desenho */
  r = await mestre.put(`${M}/${mid}/elementos`, { itens: [{ id: dL, remover: true }, { id: dR, remover: true }] });
  ok(r.s === 200 && r.d.itens.every(i => i.removido), "remover em grupo", r.d);
  r = await mestre.post(`${M}/${mid}/desfazer`, { seq: r.d.seq });
  ok(r.s === 200 && r.d.outros?.length === 1, "desfazer a remocao em grupo recria todos", r.d);
  r = await mestre.get(`${M}/${mid}`);
  ok(r.d.elementos.filter(e => e.tipo === "DESENHO").length === 3 && r.d.elementos.filter(e => e.tipo === "DESENHO").every(e => e.dados.pts?.length >= 2), "o que foi recriado e desenho, com os pontos de antes", r.d.elementos.map(e => e.tipo));

  /* trava: do elemento e da camada, valendo tambem para o mestre */
  const dL2 = r.d.elementos.find(e => e.tipo === "DESENHO" && e.dados.forma === "linha").id;
  r = await mestre.put(`${M}/${mid}/elementos/${dL2}`, { bloqueado: true });
  ok(r.s === 200 && r.d.bloqueado === true && r.d.trancado === true && r.d.podeMover === false, "o mestre tranca um elemento", r.d);
  r = await mestre.put(`${M}/${mid}/elementos/${dL2}`, { dados: { pts: [[5, 5], [9, 9]] } });
  ok(r.s === 409, "trancado, nem o mestre mexe", r.s);
  r = await mestre.del(`${M}/${mid}/elementos/${dL2}`);
  ok(r.s === 409, "trancado, nem o mestre remove", r.s);
  r = await mestre.put(`${M}/${mid}/elementos`, { itens: [{ id: tG, dados: { x: 300, y: 300 } }, { id: dL2, dados: { pts: [[5, 5], [9, 9]] } }] });
  ok(r.s === 409 && (await pos(tG)).dados.x === 175, "grupo com um item trancado nao muda nada", r.s);
  r = await mestre.put(`${M}/${mid}/elementos/${dL2}`, { bloqueado: false });
  ok(r.s === 200 && r.d.bloqueado === false, "destrancar e o unico pedido que passa", r.d);
  r = await mestre.put(`${M}/${mid}`, { regras: { trancadas: ["decoracao", "inventada", "decoracao"] } });
  ok(r.s === 200 && JSON.stringify(r.d.regras.trancadas) === '["decoracao"]' && r.d.regras.quem === "dono", "camada trancada fica no mapa, sem repetir nem aceitar nome inventado", r.d.regras);
  r = await mestre.put(`${M}/${mid}/elementos/${dL2}`, { dados: { pts: [[5, 5], [9, 9]] } });
  ok(r.s === 409, "elemento de camada trancada nao se mexe", r.s);
  r = await mestre.put(`${M}/${mid}/elementos/${dL2}`, { bloqueado: false, camada: "objetos" });
  ok(r.s === 409, "a camada trancada nao se destranca pelo elemento", r.s);
  r = await mestre.put(`${M}/${mid}`, { grid: { tipo: "quadrado", tam: 70 }, regras: { quem: "todos", limite: "aviso" } });
  ok(JSON.stringify(r.d.regras.trancadas) === '["decoracao"]' && r.d.regras.quem === "todos", "editar so quem move nao destranca as camadas", r.d.regras);
  r = await mestre.put(`${M}/${mid}`, { regras: { quem: "dono", trancadas: [] } });
  r = await mestre.put(`${M}/${mid}/elementos/${dL2}`, { dados: { pts: [[5, 5], [9, 9]] }, camada: "objetos" });
  ok(r.s === 200 && r.d.camada === "objetos" && r.d.dados.pts[0][0] === 5, "destrancada a camada, o elemento volta a mexer e trocar de camada", r.d);
  r = await mestre.put(`${M}/${mid}/elementos/${tH}`, { bloqueado: true });
  r = await jogador.put(`${M}/${mid}/elementos/${tH}`, { dados: { x: 70, y: 70 } });
  ok(r.s === 403, "token trancado nao anda nem para o dono", r.s);
  r = await jogador.get(`${M}/${mid}`);
  ok(r.d.elementos.find(e => e.id === tH).podeMover === false, "e a tela do jogador ja chega dizendo que nao pode mover", r.d);
  r = await mestre.put(`${M}/${mid}/elementos/${tH}`, { bloqueado: false });

  /* o dono muda a propria vida e marcas; o resto do token continua do mestre */
  r = await jogador.put(`${M}/${mid}/elementos/${tH}`, { dados: { vida: 5, marcas: [{ t: "Cansada", c: "aviso" }] } });
  ok(r.s === 200 && r.d.dados.vida === 5 && r.d.dados.marcas[0].t === "Cansada", "o dono muda a propria vida e as marcas", r.d);
  r = await jogador.put(`${M}/${mid}/elementos/${tH}`, { dados: { vida: 500 } });
  ok(r.s === 200 && r.d.dados.vida === 20, "a vida do jogador nunca passa do maximo", r.d);
  r = await jogador.put(`${M}/${mid}/elementos/${tH}`, { dados: { vidaMax: 999, nome: "Outra", vida: 4 } });
  ok(r.s === 200 && r.d.dados.vidaMax === 20 && r.d.dados.nome === "Heroina" && r.d.dados.vida === 4, "o jogador nao muda vida maxima nem o nome", r.d);
  r = await jogador.put(`${M}/${mid}/elementos/${tG}`, { dados: { vida: 1 } });
  ok(r.s === 403, "jogador nao mexe na vida de token que nao e dele", r.s);
  /* ping: qualquer um aponta, nada fica gravado */
  r = await jogador.post(`${M}/${mid}/ping`, { x: 100, y: 100 });
  ok(r.s === 204, "jogador aponta um ponto do mapa", r.s);
  /* ordem de empilhar */
  const ordemDe = async id => (await mestre.get(`${M}/${mid}`)).d.elementos.findIndex(e => e.id === id);
  await mestre.put(`${M}/${mid}/elementos`, { itens: [{ id: tH, ordem: "frente" }] });
  const total = (await mestre.get(`${M}/${mid}`)).d.elementos.length;
  ok(await ordemDe(tH) === total - 1, "para a frente poe o elemento por ultimo na lista");
  await mestre.put(`${M}/${mid}/elementos`, { itens: [{ id: tH, ordem: "tras" }] });
  ok(await ordemDe(tH) === 0, "para tras poe o elemento por primeiro");
  /* o deslocamento e cobrado pelo caminho que o jogador mandou, nunca menos que a reta */
  await mestre.put(`${M}/${mid}`, { regras: { quem: "dono", limite: "aviso" }, grid: { tipo: "quadrado", tam: 70, escala: 1, unidade: "m", diagonal: "1" } });
  await mestre.put(`${M}/${mid}/elementos/${tH}`, { dados: { x: 35, y: 35, desl: 20 } });
  r = await jogador.put(`${M}/${mid}/elementos/${tH}`, { dados: { x: 245, y: 35 }, trajeto: [[35, 245], [245, 245]] });
  ok(r.s === 200 && r.d.dados.usado === 9, "o desvio custa: 3 casas para baixo, 3 de lado e 3 de volta", r.d?.dados);
  await mestre.post(`${M}/turno`, {});
  r = await jogador.put(`${M}/${mid}/elementos/${tH}`, { dados: { x: 35, y: 35 }, trajeto: [[175, 35]] });
  ok(r.s === 200 && r.d.dados.usado === 3, "um caminho que nao desvia custa a reta", r.d?.dados);
  /* ficha <-> token: a barra da ficha e a vida do token andam juntas */
  const jsonFicha = (val, max) => JSON.stringify({ campos: [{ sec: "R", rot: "Vida", tipo: "barra", val, max }] });
  r = await jogador.post(`/api/c/${cid}/fichas`, { nome: "Vinculada", json: jsonFicha("8", "10") });
  const fV = r.d.id;
  r = await mestre.post(`${M}/${mid}/elementos`, { dados: { nome: "Ligada", fichaId: fV, vinculo: true, vidaMax: 10, vida: 8, vidaCampo: "Vida", x: 35, y: 245 } });
  const tV = r.d.id;
  await jogador.put(`/api/c/${cid}/fichas/${fV}`, { nome: "Vinculada", json: jsonFicha("3", "12") });
  r = await mestre.get(`${M}/${mid}`);
  const lig = r.d.elementos.find(e => e.id === tV).dados;
  ok(lig.vida === 3 && lig.vidaMax === 12, "mudar a barra na ficha muda a vida do token vinculado", lig);
  await mestre.put(`${M}/${mid}/elementos/${tV}`, { dados: { vida: 7 } });
  const fl = (await mestre.get(`/api/c/${cid}/fichas`)).d.find(f => f.id === fV);
  ok(JSON.parse(fl.json).campos[0].val === "7", "mudar a vida do token muda a barra da ficha", fl);
  /* o alcance da visao da ficha vai para o token ligado a ela */
  const jsonVisao = v => JSON.stringify({ campos: [{ sec: "R", rot: "Vida", tipo: "barra", val: "7", max: "12" }], ...(v === undefined ? {} : { visao: v }) });
  await jogador.put(`/api/c/${cid}/fichas/${fV}`, { nome: "Vinculada", json: jsonVisao(12) });
  r = await jogador.get(`${M}/${mid}`);
  ok(r.d.elementos.find(e => e.id === tV).dados.visaoFicha === 12, "o alcance escrito na ficha vai para o token ligado a ela (e o dono o recebe)", r.d.elementos.find(e => e.id === tV)?.dados);
  await jogador.put(`/api/c/${cid}/fichas/${fV}`, { nome: "Vinculada", json: jsonVisao("") });
  r = await mestre.get(`${M}/${mid}`);
  ok(!("visaoFicha" in r.d.elementos.find(e => e.id === tV).dados), "campo vazio na ficha tira o alcance do token", r.d.elementos.find(e => e.id === tV)?.dados);
  await jogador.put(`/api/c/${cid}/fichas/${fV}`, { nome: "Vinculada", json: jsonVisao(500) });
  r = await mestre.get(`${M}/${mid}`);
  ok(r.d.elementos.find(e => e.id === tV).dados.visaoFicha === 100, "o alcance da ficha tambem fica preso a 100 casas", r.d.elementos.find(e => e.id === tV)?.dados);
  await jogador.put(`${M}/${mid}/elementos/${tV}`, { dados: { visaoFicha: 1, visao: 1 } });
  r = await mestre.get(`${M}/${mid}`);
  ok(r.d.elementos.find(e => e.id === tV).dados.visaoFicha === 100 && !("visao" in r.d.elementos.find(e => e.id === tV).dados), "jogador nao escreve o alcance no token", r.d.elementos.find(e => e.id === tV)?.dados);
  await jogador.put(`/api/c/${cid}/fichas/${fV}`, { nome: "Vinculada", json: jsonFicha("7", "12") });
  await mestre.put(`${M}/${mid}/elementos/${tV}`, { dados: { vinculo: false } });
  await jogador.put(`/api/c/${cid}/fichas/${fV}`, { nome: "Vinculada", json: jsonFicha("1", "12") });
  ok((await mestre.get(`${M}/${mid}`)).d.elementos.find(e => e.id === tV).dados.vida === 7, "sem o vinculo, a ficha nao mexe mais no token");

  /* os tokens vistos da ficha (MapaFichas): pôr, ligar, desligar, a imagem do token e o que o jogador pode */
  const F = `/api/c/${cid}/fichas`, jid = (await jogador.get("/api/sessao")).d.id;
  const jsonImg = token => JSON.stringify({ campos: [], img: "img/icone.png", ...(token ? { token } : {}) });
  r = await jogador.post(F, { nome: "Com token", json: jsonImg("img/token-a.png") });
  const fT = r.d.id;
  r = await jogador.post(`${F}/${fT}/tokens`, { mapa: mid });
  ok(r.s === 200 && r.d.dados.img === "img/token-a.png" && r.d.meu === true, "o dono poe a propria ficha no mapa ativo, com a imagem do token (nao o icone)", r.d);
  const tT = r.d.id;
  r = await jogador.post(`${F}/${fT}/tokens`, { mapa: mid });
  ok(r.s === 409, "o jogador poe uma peca so por ficha em cada mapa", r.s);
  await jogador.put(`${F}/${fT}`, { nome: "Com token", json: jsonImg("img/token-b.png") });
  r = await mestre.get(`${M}/${mid}`);
  ok(r.d.elementos.find(e => e.id === tT).dados.img === "img/token-b.png", "trocar a imagem do token na ficha troca a do token ligado", r.d.elementos.find(e => e.id === tT)?.dados);
  await jogador.put(`${F}/${fT}`, { nome: "Com token", json: JSON.stringify({ campos: [] }) });
  r = await mestre.get(`${M}/${mid}`);
  ok(r.d.elementos.find(e => e.id === tT).dados.img === "img/token-b.png", "ficha sem imagem nenhuma nao apaga a do token");
  await jogador.put(`${F}/${fT}`, { nome: "Com token", json: jsonImg("img/token-b.png") });
  r = await jogador.get(`${F}/${fT}/tokens`);
  ok(r.s === 200 && r.d.length === 1 && r.d[0].id === tT && r.d[0].podeSoltar === true, "a ficha lista o token ligado a ela", r.d);
  ok((await jogador.get(F)).d.find(f => f.id === fT).tokenImg === "img/token-b.png", "a lista de fichas leva a imagem do token ligado (tokenImg)");
  r = await mestre.post(F, { nome: "Do mestre 2", json: "{}" });
  const fM2 = r.d.id;
  ok((await jogador.get(`${F}/${fM2}/tokens`)).s === 404 && (await jogador.post(`${F}/${fM2}/tokens`, { mapa: mid })).s === 404,
    "tokens da ficha de outra pessoa nao existem para o jogador (404)");
  r = await mestre.post(`${M}/${mid}/elementos`, { dados: { nome: "Do mestre", x: 70, y: 70 } });
  const tM = r.d.id;
  ok((await jogador.post(`${F}/${fT}/tokens`, { mapa: mid, elemento: tM })).s === 404, "o jogador nao liga a ficha a um token que nao controla");
  r = await mestre.post(`${F}/${fT}/tokens`, { mapa: mid, elemento: tM });
  ok(r.s === 200 && r.d.dados.fichaId === fT && r.d.dono === jid && r.d.dados.img === "img/token-b.png",
    "o mestre liga um token ja posto: ele passa a seguir a ficha e a ser do dono dela", r.d);
  r = await jogador.del(`${F}/${fT}/tokens/${tT}`);
  ok(r.s === 204, "o dono desliga o token da ficha", r.s);
  const solto = (await mestre.get(`${M}/${mid}`)).d.elementos.find(e => e.id === tT);
  ok(!!solto && !("fichaId" in solto.dados) && !("vinculo" in solto.dados), "desligado, o token fica no mapa sem o vinculo", solto?.dados);
  r = await jogador.post(`${F}/${fT}/imagem`, null, { form: forma("arquivo", PNG, "eu.png", "image/png") });
  ok(r.s === 200 && /^img\/ficha-\d+-\d+\.png$/.test(r.d.arquivo), "o jogador envia o icone pela ficha, com nome proprio", r.d);
  /* a imagem entra no catalogo da campanha; sai daqui para nao mudar a contagem dos testes da biblioteca */
  const enviada = ((await mestre.get(`/api/c/${cid}/midia`)).d.imagens || []).find(i => i.arquivo === r.d.arquivo);
  ok(!!enviada && (await mestre.del(`/api/c/${cid}/midia/${enviada.id}`)).s < 300, "o icone enviado pelo jogador aparece no catalogo do mestre");
  r = await jogador.post(`${F}/${fT}/imagem`, null, { form: forma("arquivo", Buffer.from("<svg/>"), "x.svg", "image/svg+xml") });
  ok(r.s === 400, "imagem SVG nao entra pela ficha", r.s);
  ok((await jogador.post(`${F}/${fM2}/imagem`, null, { form: forma("arquivo", PNG, "eu.png", "image/png") })).s === 404, "nem pela ficha de outra pessoa");

  await mestre.post(`${M}/${mid}/ativo`, { ativo: false });
  r = await mestre.del(`${M}/${mid}`);
  ok(r.s === 204, "apagar o mapa leva tudo junto", r.s);
}

console.log("\n=== mapa: paredes, rota, visao e nevoa ===");
{
  const M = `/api/c/${cid}/mapas`;
  let r = await mestre.post(M, { nome: "Paredes" });
  const mid = r.d.id;
  await mestre.post(`${M}/${mid}/ativo`, { ativo: true });
  await mestre.put(`${M}/${mid}`, { regras: { quem: "dono", limite: "aviso" }, grid: { tipo: "quadrado", tam: 70, escala: 1, unidade: "m", diagonal: "1" } });
  const eu = (await jogador.get("/api/sessao")).d;
  r = await mestre.post(`${M}/${mid}/elementos`, { dono: eu.id, dados: { nome: "Corredora", x: 105, y: 525, desl: 100 } });
  const tC = r.d.id;
  /* parede: so o mestre cria, sempre visivel (ate o corte da nevoa no servidor), ponto a ponto */
  r = await mestre.post(`${M}/${mid}/elementos`, { tipo: "PAREDE", visivel: false, dados: { kind: "lixo", pts: [[350, 210], [350, 840]] } });
  const wP = r.d.id;
  ok(r.s === 200 && r.d.tipo === "PAREDE" && r.d.camada === "cenario" && r.d.visivel === true && r.d.dados.kind === "parede" && r.d.dados.aberta === false, "parede nasce visivel (mesmo pedindo oculta), na camada Cenario, e tipo desconhecido cai para parede", r.d);
  r = await mestre.post(`${M}/${mid}/elementos`, { tipo: "PAREDE", dados: { pts: [[0, 0]] } });
  ok(r.s === 400, "parede com um ponto so e recusada", r.s);
  r = await mestre.post(`${M}/${mid}/elementos`, { tipo: "FOG", dados: { forma: "linha", pts: [[0, 0], [10, 10]] } });
  ok(r.s === 400, "area de nevoa so aceita retangulo, circulo ou poligono", r.s);
  r = await mestre.post(`${M}/${mid}/elementos`, { tipo: "FOG", dados: { forma: "traco", pts: [[100, 100], [300, 120], [500, 100]], larg: 2, ponta: "triangulo", suave: false, revela: true } });
  ok(r.s === 200 && r.d.dados.forma === "traco" && r.d.dados.larg === 4 && r.d.dados.ponta === "redondo" && r.d.dados.suave === false && r.d.dados.pts.length === 3, "o pincel pinta um traco de nevoa: largura presa a 4 px no minimo, ponta desconhecida vira redonda", r.d?.dados);
  const fT = r.d.id;
  r = await mestre.put(`${M}/${mid}/elementos/${fT}`, { dados: { larg: 5000, ponta: "losango" } });
  ok(r.s === 200 && r.d.dados.larg === 1000 && r.d.dados.ponta === "losango" && r.d.dados.suave === false && r.d.dados.pts.length === 3, "mudar so a largura e a ponta do traco mantem o resto", r.d?.dados);
  r = await mestre.post(`${M}/${mid}/elementos`, { tipo: "FOG", dados: { forma: "traco", pts: [[200, 200]], revela: false } });
  ok(r.s === 200 && r.d.dados.pts.length === 1 && r.d.dados.larg === 70 && r.d.dados.suave === true && r.d.dados.revela === false, "um clique do pincel e um traco de um ponto, com 70 px e borda macia de saida", r.d?.dados);
  await mestre.del(`${M}/${mid}/elementos/${r.d.id}`);
  r = await mestre.post(`${M}/${mid}/elementos`, { tipo: "FOG", dados: { forma: "traco", pts: Array.from({ length: 130 }, (_, i) => [i * 5, 50]) } });
  ok(r.s === 200 && r.d.dados.pts.length === 100, "o traco guarda no maximo 100 pontos", r.d?.dados?.pts?.length);
  await mestre.del(`${M}/${mid}/elementos/${r.d.id}`);
  r = await mestre.post(`${M}/${mid}/elementos`, { tipo: "FOG", dados: { forma: "retangulo", larg: 99, pts: [[0, 0], [700, 700]], revela: true } });
  ok(r.s === 200 && !("larg" in r.d.dados), "so o traco carrega largura, ponta e borda", r.d?.dados);
  const fA = r.d.id;
  await mestre.del(`${M}/${mid}/elementos/${fT}`);
  ok(r.s === 200 && r.d.tipo === "FOG" && r.d.dados.revela === true, "area de nevoa que revela", r.d);
  r = await jogador.post(`${M}/${mid}/elementos`, { tipo: "PAREDE", dados: { pts: [[0, 0], [10, 10]] } });
  ok(r.s === 403, "jogador nao cria parede", r.s);
  r = await jogador.put(`${M}/${mid}/elementos/${wP}`, { dados: { pts: [[0, 0], [10, 10]] } });
  ok(r.s === 403, "jogador nao mexe na parede", r.s);
  r = await jogador.del(`${M}/${mid}/elementos/${fA}`);
  ok(r.s === 403, "jogador nao remove area de nevoa", r.s);
  r = await jogador.get(`${M}/${mid}`);
  ok(!r.d.elementos.some(e => e.tipo === "PAREDE" || e.tipo === "FOG") && r.d.vista?.paredes === true, "parede e area de nevoa nunca saem para o jogador (a vista so diz que ha paredes)", r.d.elementos.map(e => e.tipo));
  /* nevoa e alcance da visao */
  r = await mestre.put(`${M}/${mid}`, { regras: { quem: "dono", limite: "aviso", fog: "visao" } });
  ok(r.s === 200 && r.d.regras.fog === "visao", "o mapa guarda o modo da nevoa", r.d?.regras);
  r = await mestre.put(`${M}/${mid}`, { regras: { quem: "todos", limite: "aviso" } });
  ok(r.d.regras.fog === "visao" && r.d.regras.quem === "todos", "editar so as outras regras nao desliga a nevoa", r.d?.regras);
  await mestre.put(`${M}/${mid}`, { regras: { quem: "dono", limite: "aviso", fog: "xyz" } });
  r = await mestre.get(`${M}/${mid}`);
  ok(r.d.mapa.regras.fog === "nenhum", "modo de nevoa desconhecido cai para nenhum", r.d.mapa.regras);
  await mestre.put(`${M}/${mid}`, { regras: { quem: "dono", limite: "aviso", fog: "visao" } });
  r = await mestre.put(`${M}/${mid}/elementos/${tC}`, { dados: { visao: 500 } });
  ok(r.d.dados.visao === 100, "alcance da visao fica preso a 100 casas", r.d?.dados);
  await mestre.put(`${M}/${mid}/elementos/${tC}`, { dados: { visao: 8 } });
  r = await jogador.get(`${M}/${mid}`);
  ok(r.d.elementos.find(e => e.id === tC).dados.visao === 8, "o dono do token recebe o alcance da visao dele", r.d.elementos.find(e => e.id === tC).dados);
  r = await mestre.put(`${M}/${mid}/elementos/${tC}`, { dados: { visao: null } });
  ok(r.s === 200 && !("visao" in r.d.dados), "alcance vazio tira o alcance do token: vale o da ficha ou o padrao do mapa", r.d?.dados);
  await mestre.put(`${M}/${mid}/elementos/${tC}`, { dados: { visao: 8 } });
  /* memoria do explorado e alcance padrao: regras do mapa, que as outras edicoes nao apagam */
  r = await mestre.get(`${M}/${mid}`);
  ok(r.d.mapa.regras.fogMemoria === false && r.d.mapa.regras.fogVer === 0 && r.d.mapa.regras.visaoPadrao === 6, "o mapa nasce sem memoria do explorado, na versao 0 e com alcance padrao de 6 casas", r.d.mapa.regras);
  r = await mestre.put(`${M}/${mid}`, { regras: { quem: "dono", limite: "aviso", fog: "visao", fogMemoria: true, fogVer: 2, visaoPadrao: 9 } });
  ok(r.d.regras.fogMemoria === true && r.d.regras.fogVer === 2 && r.d.regras.visaoPadrao === 9, "o mapa guarda a memoria, a versao dela e o alcance padrao", r.d?.regras);
  r = await mestre.put(`${M}/${mid}`, { regras: { quem: "todos", limite: "aviso" } });
  ok(r.d.regras.fogMemoria === true && r.d.regras.fogVer === 2 && r.d.regras.visaoPadrao === 9 && r.d.regras.fog === "visao", "editar so as outras regras nao apaga a memoria, a versao nem o alcance padrao", r.d?.regras);
  r = await mestre.put(`${M}/${mid}`, { regras: { quem: "dono", limite: "aviso", visaoPadrao: 999 } });
  ok(r.d.regras.visaoPadrao === 100, "o alcance padrao fica preso a 100 casas", r.d?.regras);
  r = await jogador.put(`${M}/${mid}`, { regras: { quem: "dono", limite: "aviso", fogMemoria: false } });
  ok(r.s === 403, "jogador nao muda as regras da nevoa", r.s);
  await mestre.put(`${M}/${mid}`, { regras: { quem: "dono", limite: "aviso", fog: "visao", fogMemoria: false, fogVer: 0, visaoPadrao: 6 } });
  /* fase 4b: o servidor corta a nevoa. A heroina (105, 525) ve 8 casas; a parede em x=350 tapa o lado de la */
  await mestre.del(`${M}/${mid}/elementos/${fA}`);
  r = await mestre.post(`/api/c/${cid}/midia/img`, null, { form: forma("arquivo", pngGrande(2100, 1400), "masmorra.png", "image/png", { nome: "masmorra" }) });
  const imgP = r.d.arquivo, imgPId = r.d.id;
  r = await mestre.put(`${M}/${mid}`, { imagem: imgP });
  ok(r.s === 200 && r.d.largura === 2100 && r.d.altura === 1400, "o mapa ganha a imagem (do mesmo tamanho)", r.d);
  const tPerto = (await mestre.post(`${M}/${mid}/elementos`, { dados: { nome: "Perto", x: 245, y: 525 } })).d.id;
  const tAtras = (await mestre.post(`${M}/${mid}/elementos`, { dados: { nome: "Atras", x: 455, y: 525 } })).d.id;
  const tLonge = (await mestre.post(`${M}/${mid}/elementos`, { dados: { nome: "Longe", x: 105, y: 1300 } })).d.id;
  const dPerto = (await mestre.post(`${M}/${mid}/elementos`, { tipo: "DESENHO", dados: { forma: "circulo", pts: [[200, 500], [230, 500]] } })).d.id;
  const dLonge = (await mestre.post(`${M}/${mid}/elementos`, { tipo: "DESENHO", dados: { forma: "circulo", pts: [[1900, 200], [1950, 200]] } })).d.id;
  r = await jogador.get(`${M}/${mid}`);
  let idsJ = r.d.elementos.map(e => e.id);
  ok(idsJ.includes(tC) && idsJ.includes(tPerto) && !idsJ.includes(tAtras) && !idsJ.includes(tLonge), "o jogador recebe o proprio token e o que ele ve; atras da parede e longe demais, nao", idsJ);
  ok(idsJ.includes(dPerto) && !idsJ.includes(dLonge), "desenho so chega onde o jogador ve", idsJ);
  ok(r.d.vista.modo === "visao" && r.d.vista.png?.startsWith("data:image/png;base64,") && r.d.vista.cel === 5 && r.d.vista.cols === 420, "a vista traz a mascara da nevoa (casas de 5 px)", { ...r.d.vista, png: r.d.vista.png?.slice(0, 30) });
  const tl = r.d.vista.tiles;
  ok(tl?.cols === 5 && tl.lins === 3 && tl.v[0] && !tl.v[4] && !tl.v[14], "so os pedacos perto do que ele ve tem versao", tl?.v);
  r = await jogador.get(`${M}/${mid}/tile/4/0`);
  ok(r.s === 404, "o pedaco que a nevoa cobre inteiro nao sai para o jogador", r.s);
  r = await mestre.get(`${M}/${mid}/tile/4/0`);
  ok(r.s === 200 && /image\//.test(r.tipo), "o mestre recebe qualquer pedaco", r.s);
  r = await jogador.get(`${M}/${mid}/tile/0/1?v=${encodeURIComponent(tl.v[5])}`);
  const recortado = r.bruto.length;
  ok(r.s === 200 && /jpeg/.test(r.tipo), "o pedaco meio visto sai recortado", r.s);
  r = await mestre.get(`${M}/${mid}/tile/0/1`);
  ok(r.bruto.length > recortado, "e com menos imagem do que o do mestre (o coberto vem preto)", { jogador: recortado, mestre: r.bruto.length });
  for (const q of ["", "?mini=1"]) {
    r = await jogador.get(`/midia/c${cid}/${imgP}${q}`); // NOSONAR: o teste pede um de cada vez de proposito (a ordem e o estado do servidor importam)
    ok(r.s === 403, "a imagem inteira nao sai pela midia" + (q ? " (miniatura)" : ""), r.s);
  }
  /* a rota que o servidor cobraria, para a tela do jogador desenhar sem receber as paredes */
  r = await jogador.post(`${M}/${mid}/rota`, { id: tC, x: 595, y: 525 });
  ok(r.s === 200 && r.d.pts?.length >= 3, "o jogador pergunta a rota ate o outro lado da parede e ela a contorna", r.d);
  r = await jogador.post(`${M}/${mid}/rota`, { id: tC, x: 245, y: 700 });
  ok(r.s === 200 && r.d.livre === true, "sem parede no meio, a rota e livre", r.d);
  r = await jogador.post(`${M}/${mid}/rota`, { id: tPerto, x: 245, y: 700 });
  ok(r.s === 403, "rota so de token que ele pode mover", r.s);
  r = await jogador.post(`${M}/${mid}/rota`, { id: tAtras, x: 245, y: 700 });
  ok(r.s === 403, "nem de um que ele nao ve", r.s);
  /* SSE: com a nevoa ligada o jogador recebe so o aviso "vista", nunca o elemento */
  const sse2 = await fetch(B + `${M}/eventos`, { headers: { Cookie: Object.entries(jogador.cookies).map(([k, v]) => k + "=" + v).join("; "), Accept: "text/event-stream" } });
  const leitor2 = sse2.body.getReader(), dec2 = new TextDecoder();
  let rec2 = "";
  const espera2 = async (re, ms = 2500) => {
    const fim = Date.now() + ms;
    while (!re.test(rec2) && Date.now() < fim) {
      const p = await Promise.race([leitor2.read(), new Promise(res => setTimeout(() => res({ timeout: true }), Math.max(1, fim - Date.now())))]);
      if (p.timeout || p.done) break;
      rec2 += dec2.decode(p.value);
    }
    return re.test(rec2);
  };
  await espera2(/"tipo":"ola"/);
  rec2 = "";
  await mestre.put(`${M}/${mid}/elementos/${tAtras}`, { dados: { x: 1800, y: 900 } });
  ok(await espera2(/"tipo":"vista"/) && !/Atras|"elemento"/.test(rec2), "o mestre move um token: o jogador recebe 'vista', sem o token", rec2);
  await leitor2.cancel();
  /* memoria do explorado no servidor: o que ja foi visto continua servido, sem os tokens */
  await mestre.put(`${M}/${mid}`, { regras: { quem: "dono", limite: "aviso", fog: "visao", fogMemoria: true } });
  await jogador.get(`${M}/${mid}`);
  await mestre.put(`${M}/${mid}/elementos/${tC}`, { dados: { x: 1100, y: 300 } });
  r = await jogador.get(`${M}/${mid}`);
  idsJ = r.d.elementos.map(e => e.id);
  ok(r.d.vista.tiles.v[5] && !idsJ.includes(tPerto) && idsJ.includes(tC), "com a memoria, o lugar de antes continua com imagem, mas o token de la some", { v: r.d.vista.tiles.v, idsJ });
  r = await jogador.get(`${M}/${mid}/tile/0/1`);
  ok(r.s === 200, "e o pedaco lembrado ainda sai", r.s);
  await mestre.put(`${M}/${mid}`, { regras: { quem: "dono", limite: "aviso", fog: "visao", fogMemoria: true, fogVer: 1 } });
  r = await jogador.get(`${M}/${mid}`);
  ok(!r.d.vista.tiles.v[5], "esquecer o explorado (versao nova) fecha o que nao se ve agora", r.d.vista.tiles.v);
  await mestre.put(`${M}/${mid}`, { regras: { quem: "dono", limite: "aviso", fog: "visao", fogMemoria: false } });
  await mestre.put(`${M}/${mid}`, { regras: { quem: "dono", limite: "aviso", fog: "manual" } });
  r = await jogador.get(`${M}/${mid}`);
  ok(r.d.elementos.every(e => e.id === tC) && r.d.vista.tiles.v.every(v => !v), "nevoa manual sem area: o jogador nao ve nada alem do proprio token", { els: r.d.elementos.map(e => e.id), v: r.d.vista.tiles.v });
  await mestre.post(`${M}/${mid}/elementos`, { tipo: "FOG", dados: { forma: "retangulo", pts: [[0, 0], [700, 700]], revela: true } });
  r = await jogador.get(`${M}/${mid}`);
  idsJ = r.d.elementos.map(e => e.id);
  ok(idsJ.includes(tPerto) && r.d.vista.tiles.v[0] && !r.d.vista.tiles.v[4], "a area revelada abre a imagem e mostra quem esta nela", { idsJ, v: r.d.vista.tiles.v });
  for (const id of [tPerto, tAtras, tLonge, dPerto, dLonge]) await mestre.del(`${M}/${mid}/elementos/${id}`); // NOSONAR: o teste pede um de cada vez de proposito (a ordem e o estado do servidor importam)
  await mestre.put(`${M}/${mid}`, { imagem: "", largura: 2100, altura: 1400, regras: { quem: "dono", limite: "aviso", fog: "visao", fogMemoria: false, fogVer: 0 } });
  await mestre.del(`/api/c/${cid}/midia/${imgPId}`);
  await mestre.put(`${M}/${mid}/elementos/${tC}`, { dados: { x: 105, y: 525 } });
  /* movimento: a reta cruza a parede, vale a rota que a contorna (por uma das pontas) */
  r = await jogador.put(`${M}/${mid}/elementos/${tC}`, { dados: { x: 595, y: 525 } });
  const usado = r.d?.dados?.usado;
  ok(r.s === 200 && r.d.dados.x === 595 && usado > 7 && usado < 20, "a parede no meio: o movimento custa a rota que a contorna, nao a reta (7)", r.d?.dados);
  await mestre.post(`${M}/turno`, {});
  await mestre.put(`${M}/${mid}/elementos/${tC}`, { dados: { x: 105, y: 525 } });
  r = await jogador.put(`${M}/${mid}/elementos/${tC}`, { dados: { x: 595, y: 525 }, trajeto: [[350, 525]] });
  ok(r.s === 200 && r.d.dados.usado === usado, "um ponto de passagem em cima da parede nao deixa atravessa-la: paga a mesma rota", r.d?.dados);
  await mestre.post(`${M}/turno`, {});
  await mestre.put(`${M}/${mid}/elementos/${tC}`, { dados: { x: 105, y: 525 } });
  r = await jogador.put(`${M}/${mid}/elementos/${tC}`, { dados: { x: 595, y: 525 }, trajeto: [[350, 105], [595, 105]] });
  ok(r.s === 200 && r.d.dados.usado >= 7, "o trajeto que passa pelo lado de fora da parede vale", r.d?.dados);
  /* caixa fechada por parede e porta: sem rota, o servidor recusa; o mestre nunca e barrado */
  await mestre.post(`${M}/turno`, {});
  await mestre.post(`${M}/${mid}/elementos`, { tipo: "PAREDE", dados: { kind: "parede", pts: [[1400, 1000], [1700, 1000], [1700, 1300], [1400, 1300]] } });
  r = await mestre.post(`${M}/${mid}/elementos`, { tipo: "PAREDE", dados: { kind: "porta", aberta: false, pts: [[1400, 1300], [1400, 1000]] } });
  const wPorta = r.d.id;
  await mestre.put(`${M}/${mid}/elementos/${tC}`, { dados: { x: 1550, y: 1150 } });
  r = await jogador.put(`${M}/${mid}/elementos/${tC}`, { dados: { x: 1100, y: 1150 } });
  ok(r.s === 409 && r.d?.codigo === "parede", "sem rota (caixa fechada, porta fechada), o movimento e recusado com o codigo parede", r.d);
  ok((await mestre.get(`${M}/${mid}`)).d.elementos.find(e => e.id === tC).dados.x === 1550, "e o token continua onde estava");
  r = await mestre.put(`${M}/${mid}/elementos/${wPorta}`, { dados: { aberta: true } });
  ok(r.d.dados.aberta === true, "o mestre abre a porta", r.d?.dados);
  r = await jogador.put(`${M}/${mid}/elementos/${tC}`, { dados: { x: 1100, y: 1150 } });
  ok(r.s === 200, "porta aberta nao barra", r.s);
  await mestre.put(`${M}/${mid}/elementos/${wPorta}`, { dados: { kind: "janela" } });
  r = await mestre.get(`${M}/${mid}`);
  ok(r.d.elementos.find(e => e.id === wPorta).dados.aberta === false && r.d.elementos.find(e => e.id === wPorta).dados.kind === "janela", "janela nao tem 'aberta': so porta abre e fecha");
  await mestre.put(`${M}/${mid}/elementos/${tC}`, { dados: { x: 1550, y: 1150 } });
  r = await jogador.put(`${M}/${mid}/elementos/${tC}`, { dados: { x: 1100, y: 1150 } });
  ok(r.s === 409, "janela barra o movimento, mesmo sem limite de deslocamento no token", r.s);
  r = await mestre.put(`${M}/${mid}/elementos/${tC}`, { dados: { x: 1100, y: 1150 } });
  ok(r.s === 200, "o mestre nunca e barrado pelas paredes", r.s);
  /* desfazer e historico entendem parede */
  await mestre.del(`${M}/${mid}/elementos/${wP}`);
  r = await mestre.post(`${M}/${mid}/desfazer`, {});
  ok(r.s === 200 && r.d.el?.tipo === "PAREDE" && r.d.el.dados.pts.length === 2, "desfazer a remocao recria a parede como parede", r.d);
  r = await mestre.get(`${M}/${mid}/historico?limite=200`);
  ok(r.d.some(h => h.tipo === "PAREDE" && h.operacao === "criar"), "o historico do mestre leva a criacao da parede", r.d.slice(0, 3));
  await mestre.post(`${M}/${mid}/ativo`, { ativo: false });
  r = await mestre.del(`${M}/${mid}`);
  ok(r.s === 204, "apagar o mapa leva paredes e nevoa junto", r.s);
}

console.log("\n=== notas e mural ===");
{
  let r = await jogador.get(`/api/c/${cid}/notas`);
  ok(r.s === 200, "le notas");
  const v = r.d?.versao ?? 0;
  r = await jogador.put(`/api/c/${cid}/notas`, { json: JSON.stringify({ t: "segredo do jogador" }), versao: v });
  ok(r.s === 200, "grava notas");
  r = await mestre.get(`/api/c/${cid}/notas`);
  ok(!/segredo do jogador/.test(JSON.stringify(r.d)), "notas sao privadas por pessoa", r.d);
  r = await mestre.post(`/api/c/${cid}/mural`, { texto: "Bem-vindos" });
  ok(r.s === 200, "mestre posta no mural", r.d);
  r = await jogador.get(`/api/c/${cid}/mural`);
  ok(r.s === 200 && /Bem-vindos/.test(JSON.stringify(r.d)), "jogador le o mural");
}

console.log("\n=== midia, PDF e indice ===");
{
  let r = await mestre.req("POST", `/api/c/${cid}/midia/img`, undefined, { form: forma("arquivo", PNG, "ponto.png", "image/png", { nome: "ponto" }) });
  ok(r.s === 200 && r.d?.arquivo, "mestre sobe imagem", r.d);
  const img = r.d?.arquivo;
  r = await mestre.req("POST", `/api/c/${cid}/midia/img`, undefined, { form: forma("arquivo", PNG, "ponto2.png", "image/png", { nome: "ponto2" }) });
  ok(r.s === 200 && r.d?.reaproveitado === true, "mesmo conteudo e reaproveitado (hard link)", r.d);
  r = await jogador.req("POST", `/api/c/${cid}/midia/img`, undefined, { form: forma("arquivo", PNG, "x.png", "image/png") });
  ok(r.s === 403, "jogador nao sobe imagem", r.s);
  r = await jogador.get(`/midia/c${cid}/${img}`);
  ok(r.s === 200 && /image/.test(r.tipo), "jogador baixa imagem de membro", { s: r.s, t: r.tipo, img });
  r = await anonimo.get(`/midia/c${cid}/${img}`);
  ok(r.s !== 200, "anonimo nao baixa midia", r.s);

  const pdf = pdfMinimo("O dragao vermelho dorme na caverna");
  r = await mestre.req("POST", `/api/c/${cid}/midia/pdf`, undefined, { form: forma("arquivo", pdf, "livro.pdf", "application/pdf", { abrev: "LV", nome: "Livro", publico: "false" }) });
  ok(r.s === 200 && r.d?.paginas === 1, "mestre sobe PDF e o PDFBox conta 1 pagina", r.d);
  const pdfId = r.d?.id;
  r = await mestre.get(`/api/c/${cid}/indice`);
  ok(r.s === 200 && /dragao/i.test(r.bruto.toString()), "indice do mestre achou o texto do PDF", r.bruto.toString().slice(0, 200));
  r = await jogador.get(`/api/c/${cid}/indice`);
  ok(r.s === 200 && !/dragao/i.test(r.bruto.toString()), "indice do jogador nao traz o PDF privado");
  r = await jogador.get(`/midia/c${cid}/pdf/LV.pdf`);
  ok(r.s === 403 || r.s === 404, "jogador nao baixa PDF privado", r.s);
  r = await mestre.get(`/midia/c${cid}/pdf/LV.pdf`);
  ok(r.s === 200 && /pdf/.test(r.tipo), "mestre baixa o PDF", { s: r.s, t: r.tipo });
  r = await mestre.req("PUT", `/api/c/${cid}/midia/${pdfId}`, { publico: true });
  ok(r.s === 200, "mestre torna o PDF publico");
  r = await jogador.get(`/midia/c${cid}/pdf/LV.pdf`);
  ok(r.s === 200, "agora o jogador baixa o PDF");
  r = await jogador.get(`/api/c/${cid}/indice`);
  ok(/dragao/i.test(r.bruto.toString()), "e o indice do jogador passa a trazer o texto");
  r = await mestre.get(`/api/c/${cid}/midia`);
  ok(r.s === 200 && r.d?.docs?.length === 1 && r.d?.imagens?.length === 2, "lista de midia (1 PDF, 2 imagens)", r.d);
  r = await mestre.post(`/api/c/${cid}/midia/reescanear`, {});
  ok(r.s === 200, "reescanear volume", r.d);
  r = await jogador.get(`/midia/c${cid}/audio/qualquer.mp3`);
  ok(r.s !== 200, "jogador nunca recebe audio", r.s);
}

console.log("\n=== pacote: exportar e importar ===");
{
  /* o mesmo PDF da secao de upload (o conteudo e deterministico) e uma faixa, para conferir
     que livro e trilha tambem viajam no pacote */
  const pdf = pdfMinimo("O dragao vermelho dorme na caverna");
  const som = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(2048, 7)]);
  let r = await mestre.req("POST", `/api/c/${cid}/midia/audio`, undefined, { form: forma("arquivo", som, "chuva.mp3", "audio/mpeg", { categoria: "Clima", nome: "Chuva fina" }) });
  ok(r.s === 200, "mestre sobe uma faixa", r.d);
  /* um mapa com token de ficha, parede e desenho, para viajar no pacote */
  const fich = (await mestre.get(`/api/c/${cid}/fichas`)).d;
  const mapaPac = (await mestre.post(`/api/c/${cid}/mapas`, { nome: "Do pacote", largura: 1400, altura: 1000 })).d.id;
  await mestre.post(`/api/c/${cid}/mapas/${mapaPac}/elementos`, { dados: { nome: "Heroi no mapa", fichaId: fich[0].id, desl: 9 } });
  await mestre.post(`/api/c/${cid}/mapas/${mapaPac}/elementos`, { tipo: "PAREDE", dados: { kind: "porta", pts: [[100, 100], [400, 100]] } });
  await mestre.post(`/api/c/${cid}/mapas/${mapaPac}/elementos`, { tipo: "DESENHO", dados: { forma: "linha", pts: [[10, 10], [200, 200]] } });
  r = await mestre.get(`/api/c/${cid}/pacote`);
  ok(r.s === 200 && r.bruto.length > 100 && r.bruto.slice(0, 2).toString() === "PK", "exporta zip", { s: r.s, n: r.bruto.length });
  const zip = r.bruto;
  const nomes = entradasZip(zip);
  ok(nomes.includes("pdf/LV.pdf") && nomes.includes("audio/clima/chuva-fina.mp3"), "o zip leva o PDF e a faixa", nomes);
  r = await mestre.get(`/api/c/${cid}/pacote?arquivos=false`);
  const soDados = r.s === 200 ? entradasZip(r.bruto) : [];
  ok(soDados.includes("campanha.json") && !soDados.some(n => /^(pdf|audio|img)\//.test(n)), "sem arquivos, o zip leva so os dados", soDados);
  r = await jogador.get(`/api/c/${cid}/pacote`);
  ok(r.s === 403, "jogador nao exporta", r.s);
  r = await mestre.post("/api/campanhas", { nome: "Destino", sistema: "generico" });
  const novo = r.d.id;
  r = await mestre.req("POST", `/api/c/${novo}/pacote`, undefined, { form: forma("arquivo", zip, "p.zip", "application/zip", { substituir: "true" }) });
  ok(r.s === 200, "importa o pacote em outra campanha", r.d);
  r = await mestre.get(`/api/c/${novo}/guia`);
  ok(r.s === 200 && JSON.parse(r.d.json).versao === 3, "guia chegou na campanha nova");
  r = await mestre.get(`/api/c/${novo}/midia`);
  const doc = r.d?.docs?.[0], fx = r.d?.faixas?.[0];
  ok(r.d?.docs?.length === 1 && doc.abrev === "LV" && doc.nome === "Livro" && doc.publico === true && doc.paginas === 1,
    "o PDF chega com nome, visibilidade e paginas", r.d?.docs);
  ok(r.d?.faixas?.length === 1 && fx.nome === "Chuva fina" && fx.cat === "Clima", "a faixa chega com nome e categoria", r.d?.faixas);
  r = await mestre.get(`/midia/c${novo}/pdf/LV.pdf`);
  ok(r.s === 200 && r.bruto.equals(pdf), "o PDF importado e o mesmo arquivo", r.s);
  r = await mestre.get(`/midia/c${novo}/audio/clima/chuva-fina.mp3`);
  ok(r.s === 200 && r.bruto.equals(som), "a faixa importada e o mesmo arquivo", r.s);
  r = await mestre.get(`/api/c/${novo}/indice`);
  ok(r.s === 200 && /dragao/i.test(r.bruto.toString()), "a busca da campanha nova acha o texto do PDF");
  r = await mestre.get(`/api/c/${novo}/fichas`);
  ok(r.s === 200 && r.d.some(f => /Heroi/.test(f.nome)), "fichas entram em nome de quem importou", r.d);
  /* mapas no pacote: chegam desligados, sem o elo com conta nem ficha, e o zip tem o campo "mapas" */
  const doMestre = (await mestre.get(`/api/c/${cid}/mapas`)).d;
  ok(doMestre.length >= 1 && /"mapas"/.test(await textoCampanhaJson(zip)), "o pacote leva os mapas da campanha", doMestre.length);
  r = await mestre.get(`/api/c/${novo}/mapas`);
  ok(r.s === 200 && r.d.length === doMestre.length && r.d.every(m => !m.ativo), "os mapas entram na campanha nova, todos desligados", r.d);
  const doNovo = r.d.find(m => m.nome === "Do pacote");
  const detNovo = doNovo ? (await mestre.get(`/api/c/${novo}/mapas/${doNovo.id}`)).d : {};
  const tipos = (detNovo.elementos || []).map(e => e.tipo).sort().join();
  ok(tipos === "DESENHO,PAREDE,TOKEN" && detNovo.elementos.find(e => e.tipo === "PAREDE").dados.kind === "porta" && doNovo.largura === 1400, "token, parede e desenho chegam, com o tamanho do mapa", { tipos, l: doNovo.largura });
  let tokensImportados = 0, ligacoes = 0;
  for (const m of r.d) {
    const det = (await mestre.get(`/api/c/${novo}/mapas/${m.id}`)).d; // NOSONAR: o teste pede um de cada vez de proposito (a ordem e o estado do servidor importam)
    for (const e of det.elementos || []) {
      if (e.tipo === "TOKEN") tokensImportados++;
      if (e.dono !== 0 || "fichaId" in (e.dados || {}) || "usado" in (e.dados || {})) ligacoes++;
    }
  }
  ok(tokensImportados >= 1 && ligacoes === 0, "os tokens vem sem dono, sem ficha e sem gasto de turno", { tokensImportados, ligacoes });
  r = await jogador.get(`/api/c/${novo}/mapas`);
  ok(r.s === 403 || (r.s === 200 && r.d.length === 0), "quem nao e da campanha nova nao ve os mapas", r.s);
  await mestre.req("POST", `/api/c/${novo}/pacote`, undefined, { form: forma("arquivo", zip, "p.zip", "application/zip", { substituir: "true" }) });
  r = await mestre.get(`/api/c/${novo}/mapas`);
  ok(r.d.length === doMestre.length, "importar o mesmo pacote de novo nao duplica os mapas", r.d.length);
  /* com um mapa e um token dentro: apagar a campanha leva as tabelas do tabletop junto */
  const mapaNovo = (await mestre.post(`/api/c/${novo}/mapas`, { nome: "Vai junto" })).d.id;
  await mestre.post(`/api/c/${novo}/mapas/${mapaNovo}/elementos`, { dados: { nome: "Token" } });
  r = await mestre.del(`/api/campanhas/${novo}`);
  ok(r.s === 204 || r.s === 200, "apaga a campanha importada, com mapa e token", r.s);
  r = await mestre.get(`/api/c/${novo}/mapas/${mapaNovo}`);
  ok(r.s === 403 || r.s === 404, "o mapa da campanha apagada nao abre mais", r.s);
}

console.log("\n=== modelos de campanha ===");
{
  let r = await mestre.post(`/api/admin/modelos/campanha/${cid}`, {});
  ok(r.s === 200 && r.d?.id && r.d?.nome, "admin salva como modelo uma campanha que mestra", r.d);
  const mid = r.d?.id;
  r = await jogador.post(`/api/admin/modelos/campanha/${cid}`, {});
  ok(r.s === 403, "quem nao e admin nao cria modelo", r.s);
  r = await mestre.req("POST", "/api/admin/modelos", undefined, { form: forma("arquivo", Buffer.from("nao sou zip"), "x.zip", "application/zip") });
  ok(r.s === 400, "arquivo que nao e pacote e recusado", r.d);
  r = await jogador.get("/api/modelos");
  ok(r.s === 200 && r.d.some(m => m.id === mid) && !JSON.stringify(r.d).includes("/data/"), "qualquer conta lista os modelos, sem caminho de disco", r.d);
  r = await anonimo.get("/api/modelos");
  ok(r.s === 401 || r.s === 403, "sem conta nao lista modelos", r.s);
  r = await mestre.put(`/api/admin/modelos/${mid}`, { nome: "Modelo do teste", descricao: "para experimentar" });
  ok(r.s === 200 && r.d?.nome === "Modelo do teste", "admin renomeia o modelo", r.d);
  r = await mestre.req("POST", `/api/admin/modelos/${mid}/capa`, undefined, { form: forma("arquivo", PNG, "capa.png", "image/png") });
  ok(r.s === 200 && r.d?.temCapa === true, "admin poe capa no modelo", r.d);
  r = await jogador.get(`/api/modelos/${mid}/capa`);
  ok(r.s === 200 && /image\/png/.test(r.tipo) && r.bruto.equals(PNG), "qualquer conta ve a capa do modelo", { s: r.s, t: r.tipo });
  r = await jogador.req("POST", `/api/admin/modelos/${mid}/capa`, undefined, { form: forma("arquivo", PNG, "capa.png", "image/png") });
  ok(r.s === 403, "quem nao e admin nao troca a capa", r.s);
  r = await mestre.req("POST", `/api/admin/modelos/${mid}/capa`, undefined, { form: forma("arquivo", Buffer.from("x"), "capa.exe", "application/octet-stream") });
  ok(r.s === 400, "capa que nao e imagem e recusada", r.d);
  r = await mestre.del(`/api/admin/modelos/${mid}/capa`);
  ok(r.s === 200 && r.d?.temCapa === false, "admin tira a capa", r.d);
  r = await mestre.get(`/api/modelos/${mid}/capa`);
  ok(r.s === 404, "sem capa, a rota responde 404", r.s);
  r = await mestre.get("/api/modelos/..%2f..%2fx/capa");
  ok(r.s === 404 || r.s === 400, "id de modelo invalido nao escapa da pasta", r.s);

  r = await mestre.post("/api/campanhas", { nome: "Do modelo", sistema: "" });
  const nova = r.d.id;
  r = await jogador.post(`/api/c/${nova}/modelo/${mid}`, {});
  ok(r.s === 403 || r.s === 404, "nao aplica modelo em campanha que nao mestra", r.s);
  r = await mestre.post(`/api/c/${nova}/modelo/${mid}`, {});
  ok(r.s === 200 && r.d?.guia === true && r.d?.pdfs === 1, "aplicar o modelo traz guia e livro", r.d);
  r = await mestre.get(`/api/c/${nova}/guia`);
  ok(r.s === 200 && JSON.parse(r.d.json).versao === 3, "a campanha nova abre com o guia do modelo");
  ok(JSON.parse(r.d.json).campanha?.titulo === "Do modelo", "o guia leva o nome dado a campanha, nao o do modelo", JSON.parse(r.d.json).campanha?.titulo);
  r = await mestre.get(`/api/c/${nova}/mesa`);
  ok(JSON.parse(r.d.json).titulo === "Do modelo", "a mesa tambem leva o nome da campanha");
  r = await mestre.get(`/api/c/${nova}/mapas`);
  ok(r.s === 200 && r.d.length === 0, "o modelo nao leva mapa (nem a arte dele)", r.d);
  r = await mestre.get(`/api/c/${nova}/midia`);
  ok(r.d?.docs?.[0]?.abrev === "LV" && r.d?.faixas?.length === 1, "a campanha nova tem o livro e a faixa do modelo", r.d);
  r = await mestre.post(`/api/c/${nova}/modelo/naoexiste12`, {});
  ok(r.s === 400, "modelo inexistente responde 400", r.s);
  await mestre.del(`/api/campanhas/${nova}`);

  r = await mestre.del(`/api/admin/modelos/${mid}`);
  ok(r.s === 204, "admin apaga o modelo", r.s);
  r = await mestre.get("/api/modelos");
  ok(r.s === 200 && !r.d.some(m => m.id === mid), "modelo apagado some da lista");
}

console.log("\n=== administracao e suporte ===");
{
  let r = await mestre.get("/api/admin/config");
  ok(r.s === 200, "admin le config");
  ok(!/sk-ant|"senha":"[^"]/.test(JSON.stringify(r.d)), "config nao devolve segredo");
  r = await mestre.post("/api/admin/usuarios", { login: "terceiro", nome: "Terceiro", senha: SENHA, admin: false });
  ok(r.s === 200 && r.d?.id, "admin cria usuario", r.d);
  const uid = r.d.id;
  r = await mestre.put(`/api/admin/usuarios/${uid}`, { ativo: false });
  ok(r.s === 200, "admin desativa usuario");
  const t = new Pessoa("terceiro");
  r = await t.entrar("terceiro", SENHA);
  ok(r.s === 401 || r.s === 403, "usuario desativado nao entra", r.s);
  r = await mestre.put(`/api/admin/usuarios/${uid}`, { ativo: true, senha: "Nova#Senha9" });
  ok(r.s === 200, "admin reativa e troca a senha");
  r = await t.entrar("terceiro", "Nova#Senha9");
  ok(r.s === 200, "entra com a senha nova");
  r = await t.get("/api/admin/usuarios");
  ok(r.s === 403, "terceiro nao e admin");
  await mestre.put(`/api/admin/usuarios/${uid}`, { admin: true });
  r = await t.get("/api/admin/usuarios");
  ok(r.s === 200, "promover vale na hora, sem novo login");
  await mestre.put(`/api/admin/usuarios/${uid}`, { admin: false });
  r = await t.get("/api/admin/usuarios");
  ok(r.s === 403, "rebaixar vale na hora");
  r = await mestre.del(`/api/admin/usuarios/${uid}`);
  ok(r.s === 204 || r.s === 200, "admin remove usuario", r.s);
  r = await jogador.post("/api/suporte", { assunto: "oi", mensagem: "teste de suporte" });
  ok(r.s === 200, "suporte grava o chamado mesmo sem SMTP", r.d);
  r = await mestre.get("/api/admin/suporte");
  ok(r.s === 200 && JSON.stringify(r.d).includes("teste de suporte"), "admin ve o chamado", r.d);
}

console.log("\n=== miniatura, textos publicos, 404, uso e recuperacao de senha ===");
{
  const camp = (await mestre.get("/api/sessao")).d.campanhas[0].id;
  let r = await mestre.req("POST", `/api/c/${camp}/midia/img`, undefined, { form: forma("arquivo", pngGrande(900, 40), "largo.png", "image/png", { nome: "largo" }) });
  ok(r.s === 200 && r.d?.arquivo, "mestre sobe imagem grande", r.d);
  const larg = r.d?.arquivo;
  r = await jogador.get(`/midia/c${camp}/${larg}`);
  ok(r.s === 200 && /image\/png/.test(r.tipo) && r.bruto.length > 0, "original continua servido sem ?mini", { s: r.s, t: r.tipo });
  const tamOrig = r.bruto.length;
  r = await jogador.get(`/midia/c${camp}/${larg}?mini=1`);
  ok(r.s === 200 && /image\//.test(r.tipo), "?mini=1 devolve uma imagem", { s: r.s, t: r.tipo });
  const larguraMini = r.bruto.length > 24 && /png/.test(r.tipo) ? r.bruto.readUInt32BE(16) : (r.bruto[0] === 0xff ? "jpeg" : "?");
  ok(larguraMini === "jpeg" || larguraMini <= 512, "a miniatura tem no maximo 512px de largura", { larguraMini, tamOrig, tamMini: r.bruto.length });
  r = await anonimo.get(`/midia/c${camp}/${larg}?mini=1`);
  ok(r.s !== 200, "anonimo nao baixa miniatura", r.s);
  r = await jogador.get(`/midia/c${camp}/img/../pdf/x.pdf?mini=1`);
  ok(r.s !== 200, "miniatura nao escapa da pasta img", r.s);

  r = await anonimo.get("/api/publico/texto/privacidade");
  ok(r.s === 200 && /cookie/i.test(r.d?.texto || "") && r.d?.padrao === true, "privacidade abre sem conta, com o texto padrao", r.d?.titulo);
  r = await anonimo.get("/privacidade");
  ok(r.s === 200 && /text\/html/.test(r.tipo), "/privacidade e uma pagina publica", r.s);
  r = await anonimo.get("/termos");
  ok(r.s === 200 && /text\/html/.test(r.tipo), "/termos e uma pagina publica", r.s);
  r = await jogador.put("/api/admin/textos/termos", { texto: "invadido" });
  ok(r.s === 403, "jogador nao muda os termos", r.s);
  r = await mestre.put("/api/admin/textos/termos", { texto: "Termos da mesa de teste." });
  ok(r.s === 200 && r.d?.padrao === false, "admin grava os termos", r.d);
  r = await anonimo.get("/api/publico/texto/termos");
  ok(r.d?.texto === "Termos da mesa de teste.", "termos gravados aparecem para todos");
  r = await anonimo.get("/api/publico/texto/segredo");
  ok(r.s === 400, "texto desconhecido e recusado", r.s);

  r = await jogador.req("GET", "/nao-existe-esta-pagina", undefined, {});
  const html404 = await fetch(B + "/nao-existe-esta-pagina", { headers: { Accept: "text/html", Cookie: Object.entries(jogador.cookies).map(([k, v]) => k + "=" + v).join("; ") }, redirect: "manual" });
  const corpo404 = await html404.text();
  ok(html404.status === 404 && /Esta página não existe/.test(corpo404), "endereco que nao existe mostra a pagina 404 para quem navega", html404.status);
  r = await jogador.get("/api/nao-existe");
  ok(r.s === 404 && r.d?.erro, "na API o 404 continua em JSON", r.s);

  r = await jogador.post("/api/metrica", { evento: "tela:mesa" });
  ok(r.s === 204, "contagem de uso aceita evento", r.s);
  r = await jogador.post("/api/metrica", { evento: "Nome de Alguém <b>" });
  ok(r.s === 400, "contagem recusa texto livre", r.s);
  r = await anonimo.post("/api/metrica", { evento: "tela:mesa" });
  ok(r.s === 401 || r.s === 403, "contagem exige conta", r.s);
  r = await mestre.get("/api/admin/metricas?dias=7");
  ok(r.s === 200 && r.d?.porEvento?.["tela:mesa"] >= 1, "admin ve a contagem somada", r.d);
  r = await jogador.get("/api/admin/metricas");
  ok(r.s === 403, "jogador nao ve a contagem", r.s);

  r = await jogador.put("/api/perfil", { email: "errado" });
  ok(r.s === 400, "e-mail mal escrito e recusado", r.s);
  r = await jogador.put("/api/perfil", { email: "jogador@exemplo.com" });
  ok(r.s === 200 && r.d?.email === "jogador@exemplo.com", "pessoa grava o e-mail de recuperacao", r.d);
  r = await mestre.put("/api/perfil", { email: "JOGADOR@exemplo.com" });
  ok(r.s === 400, "o mesmo e-mail nao vale em duas contas", r.s);
  await jogador.put("/api/perfil", { tourVisto: "guia-j-fichas" });
  await jogador.put("/api/perfil", { tourVisto: "qualquer-coisa" });
  r = await jogador.get("/api/sessao");
  ok((r.d?.toursVistos || []).includes("guia-j-fichas") && !(r.d?.toursVistos || []).includes("qualquer-coisa"), "guia visto fica na conta, e nome desconhecido nao entra", r.d?.toursVistos);
  await anonimo.ping();
  r = await anonimo.post("/api/publico/senha/esqueci", { conta: "jogador" });
  ok(r.s === 200 && r.d?.porEmail === false, "esqueci a senha responde igual e diz que nao ha e-mail configurado", r.d);
  r = await anonimo.post("/api/publico/senha/esqueci", { conta: "ninguem-existe" });
  ok(r.s === 200, "conta inexistente recebe a mesma resposta", r.s);
  r = await anonimo.post("/api/publico/senha/redefinir", { token: "abc", senha: "Nova#Senha9" });
  ok(r.s === 400 && /venceu|usado/.test(r.d?.erro || ""), "token invalido nao troca senha", r.d);
}

console.log("\n=== sair ===");
{
  const r = await jogador.post("/api/logout", {});
  ok(r.s === 200 || r.s === 204 || (r.s >= 300 && r.s < 400), "logout", r.s);
  const s = await jogador.get("/api/sessao");
  ok(s.s !== 200, "depois do logout a sessao nao vale", s.s);
}

console.log("\n================\ntestes: " + total + "  falhas: " + falhas);
process.exit(falhas ? 1 : 0);
