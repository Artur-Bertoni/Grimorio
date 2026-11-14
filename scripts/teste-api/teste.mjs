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
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  objs.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objs.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>");
  const fluxo = `BT /F1 14 Tf 20 100 Td (${texto}) Tj ET`;
  objs.push(`<< /Length ${fluxo.length} >>\nstream\n${fluxo}\nendstream`);
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let s = "%PDF-1.4\n"; const pos = [];
  objs.forEach((o, i) => { pos.push(s.length); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = s.length;
  s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + pos.map(p => String(p).padStart(10, "0") + " 00000 n \n").join("");
  s += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(s, "latin1");
}
// PNG 1x1 valido.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");

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
  let r = await mestre.get(`/api/c/${cid}/pacote?imagens=true`);
  ok(r.s === 200 && r.bruto.length > 100 && r.bruto.slice(0, 2).toString() === "PK", "exporta zip", { s: r.s, n: r.bruto.length });
  const zip = r.bruto;
  r = await jogador.get(`/api/c/${cid}/pacote`);
  ok(r.s === 403, "jogador nao exporta", r.s);
  r = await mestre.post("/api/campanhas", { nome: "Destino", sistema: "generico" });
  const novo = r.d.id;
  r = await mestre.req("POST", `/api/c/${novo}/pacote`, undefined, { form: forma("arquivo", zip, "p.zip", "application/zip", { substituir: "true" }) });
  ok(r.s === 200, "importa o pacote em outra campanha", r.d);
  r = await mestre.get(`/api/c/${novo}/guia`);
  ok(r.s === 200 && JSON.parse(r.d.json).versao === 3, "guia chegou na campanha nova");
  r = await mestre.get(`/api/c/${novo}/fichas`);
  ok(r.s === 200 && r.d.some(f => /Heroi/.test(f.nome)), "fichas entram em nome de quem importou", r.d);
  r = await mestre.del(`/api/campanhas/${novo}`);
  ok(r.s === 204 || r.s === 200, "apaga a campanha importada", r.s);
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
  r = await mestre.put(`/api/admin/usuarios/${uid}`, { admin: true });
  r = await t.get("/api/admin/usuarios");
  ok(r.s === 200, "promover vale na hora, sem novo login");
  r = await mestre.put(`/api/admin/usuarios/${uid}`, { admin: false });
  r = await t.get("/api/admin/usuarios");
  ok(r.s === 403, "rebaixar vale na hora");
  r = await mestre.del(`/api/admin/usuarios/${uid}`);
  ok(r.s === 204 || r.s === 200, "admin remove usuario", r.s);
  r = await jogador.post("/api/suporte", { assunto: "oi", mensagem: "teste de suporte" });
  ok(r.s === 200, "suporte grava o chamado mesmo sem SMTP", r.d);
  r = await mestre.get("/api/admin/suporte");
  ok(r.s === 200 && JSON.stringify(r.d).includes("teste de suporte"), "admin ve o chamado", r.d);
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
