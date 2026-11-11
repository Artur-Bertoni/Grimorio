#!/usr/bin/env python3
"""
Servidor de mentira para testar o front sem subir o Spring.

Responde os endpoints que o index.html usa, guarda o guia e a mesa em memoria,
e serve as imagens de uma campanha de teste gerada na hora. Nao e teste de
backend: e o que permite exercitar a tela de verdade num navegador.

    python3 stub.py            # http://127.0.0.1:8099
    python3 stub.py --porta 9000
"""
import argparse, base64, json, os, re, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, "..", "..", "src", "main", "resources", "static"))

# PNG 1x1 de uma cor so, por personagem. Evita depender de arte de verdade.
def png(r, g, b):
    import struct, zlib
    linha = b"\x00" + bytes([r, g, b]) * 8
    bruto = linha * 8
    def bloco(tipo, dados):
        c = tipo + dados
        return struct.pack(">I", len(dados)) + c + struct.pack(">I", zlib.crc32(c))
    return (b"\x89PNG\r\n\x1a\n"
            + bloco(b"IHDR", struct.pack(">IIBBBBB", 8, 8, 8, 2, 0, 0, 0))
            + bloco(b"IDAT", zlib.compress(bruto))
            + bloco(b"IEND", b""))

IMGS = {
    "pc-1.png": png(180, 40, 40), "pc-1-hover.png": png(90, 20, 20),
    "pc-2.png": png(40, 120, 180), "pc-2-hover.png": png(20, 60, 90),
    "pc-3.png": png(200, 170, 60), "pc-3-hover.png": png(100, 85, 30),
    "ficha-1.png": png(60, 60, 60), "ficha-2.png": png(90, 90, 90),
}

def campanha_de_teste():
    def corpo(n, nome):
        return {"pc": "img/pc-%d.png" % n, "mask": "img/pc-%d-hover.png" % n,
                "assassino": nome, "alcunha": "ALCUNHA %d" % n, "agente": "",
                "agenteNota": "a definir", "termos": "um, dois, tres",
                "dificuldade": "média", "as": "", "fichas": ["img/ficha-1.png"]}
    return {
        "titulo": "Campanha de teste", "sistema": "Sistema de teste",
        "verdadeIntro": "Parágrafo de abertura.",
        "corposTitulo": "Personagens dos jogadores",
        "corpos": [corpo(1, "Primeiro"), corpo(2, "Segundo"), corpo(3, "Terceiro")],
        "sacrificio": "Nota de rodapé dos personagens.",
        "preSessao": {"titulo": "Antes da primeira sessão", "intro": "Intro.",
                      "textoAbertura": "Leia em voz alta.",
                      "perguntasTitulo": "Perguntas para a mesa",
                      "metodoTitulo": "Como usar as respostas",
                      "perguntas": ["Pergunta um?", "Pergunta dois?"],
                      "metodo": ["Passo um.", "Passo dois."]},
        "adaptacao": {"titulo": "O que é cânone", "itens": ["Item um.", "Item dois."]},
        "episodiosTitulo": "Mapa das sessões",
        "episodios": [{"n": 1, "nome": "Começo", "resumo": "A primeira."},
                      {"n": 2, "nome": "Meio", "resumo": "A segunda."}],
        "conceitoTitulo": "O conceito", "conceitoTexto": "Do que a campanha trata.",
        "regrasDeOuroTitulo": "Regras de ouro", "regrasDeOuro": ["Regra um.", "Regra dois."],
        "indiceTitulo": "Índice dos livros", "indiceAS": [],
        "vocab": {}, "referencia": [], "sinonimos": {}, "canonicas": {},
    }

ST = {}
CAMPS = [
    {"id": 1, "nome": "Campanha de teste", "sistema": "Sistema de teste", "papel": "MESTRE", "arquivada": False},
    {"id": 2, "nome": "Mesa em branco", "sistema": "", "papel": "MESTRE", "arquivada": False},
    {"id": 3, "nome": "Onde eu jogo", "sistema": "Outro sistema", "papel": "JOGADOR", "arquivada": False},
]
TIPOS = {".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
         ".css": "text/css; charset=utf-8", ".png": "image/png", ".webp": "image/webp",
         ".woff2": "font/woff2", ".json": "application/json; charset=utf-8", ".map": "application/json"}

def zera():
    ST.clear()
    ST.update({
        "guia": {"json": json.dumps({"campanha": campanha_de_teste(), "sessoes": [],
                                     "trilhaCategorias": [], "galeria": []}, ensure_ascii=False), "versao": 1},
        "guia2": {"json": json.dumps({"campanha": {"titulo": "", "sistema": ""}, "sessoes": []},
                                     ensure_ascii=False), "versao": 1},
        "mesa": {"json": json.dumps({"resumos": [], "ev": [], "npcs": [], "locais": [], "at": 0},
                                    ensure_ascii=False), "versao": 1},
        "perfil": {"id": 1, "login": "mestre", "nome": "Mestre de teste", "admin": True},
        "imgs": sorted(IMGS.keys()),
        "senha": "segredo123",
    })

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def envia(self, code, corpo, ct="application/json; charset=utf-8"):
        if isinstance(corpo, (dict, list)): corpo = json.dumps(corpo, ensure_ascii=False).encode()
        elif isinstance(corpo, str): corpo = corpo.encode()
        self.send_response(code)
        self.send_header("Content-Type", ct)
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Set-Cookie", "XSRF-TOKEN=t0; Path=/")
        self.end_headers()
        self.wfile.write(corpo)

    def corpo(self):
        n = int(self.headers.get("Content-Length") or 0)
        try: return json.loads(self.rfile.read(n) or b"{}")
        except Exception: return {}

    def chave_doc(self, cid, qual):
        return qual if not (qual == "guia" and cid != "1") else "guia2"

    def do_GET(self):
        p = self.path.split("?")[0]
        if p == "/api/ping": return self.envia(200, {"ok": True, "csrf": "t0", "registroAberto": True})
        if p == "/api/sessao":
            d = dict(ST["perfil"]); d["campanhas"] = CAMPS; return self.envia(200, d)
        if p == "/api/campanhas": return self.envia(200, CAMPS)
        if p == "/api/zerar": zera(); return self.envia(200, {"ok": True})
        m = re.match(r"^/api/c/(\d+)/(guia|mesa)$", p)
        if m: return self.envia(200, ST[self.chave_doc(m.group(1), m.group(2))])
        if re.match(r"^/api/c/(\d+)/mesa/versao$", p):
            return self.envia(200, {"versao": ST["mesa"]["versao"]})
        m = re.match(r"^/api/c/(\d+)/midia$", p)
        if m:
            cid = m.group(1)
            imgs = [{"id": i + 1, "nome": n, "chave": n, "arquivo": "img/" + n, "tamanho": 64,
                     "url": "/midia/c%s/img/%s" % (cid, n)} for i, n in enumerate(ST["imgs"])]
            return self.envia(200, {"docs": [], "faixas": [], "imagens": imgs, "base": "/midia/c%s/" % cid})
        if p.startswith("/api/"): return self.envia(200, {})
        m = re.match(r"^/midia/c\d+/img/(.+)$", p)
        if m:
            d = IMGS.get(m.group(1))
            return self.envia(200, d, "image/png") if d else self.envia(404, b"", "text/plain")
        f = os.path.join(RAIZ, "index.html" if p in ("/", "") else p.lstrip("/"))
        if os.path.isfile(f):
            return self.envia(200, open(f, "rb").read(),
                              TIPOS.get(os.path.splitext(f)[1], "application/octet-stream"))
        return self.envia(404, b"nao achei", "text/plain")

    def do_PUT(self):
        p, b = self.path.split("?")[0], self.corpo()
        m = re.match(r"^/api/c/(\d+)/(guia|mesa)$", p)
        if m:
            k = self.chave_doc(m.group(1), m.group(2))
            ST[k]["json"] = b.get("json") or "{}"; ST[k]["versao"] += 1
            return self.envia(200, {"versao": ST[k]["versao"]})
        if p == "/api/perfil":
            if b.get("senhaNova") and b.get("senhaAtual") != ST["senha"]:
                return self.envia(403, {"erro": "a senha atual nao confere"})
            if b.get("nome"): ST["perfil"]["nome"] = b["nome"]
            if b.get("senhaNova"): ST["senha"] = b["senhaNova"]
            d = dict(ST["perfil"]); d["senhaTrocada"] = bool(b.get("senhaNova"))
            return self.envia(200, d)
        return self.envia(200, {})

    def do_POST(self):
        p = self.path.split("?")[0]
        if re.match(r"^/api/c/(\d+)/midia/img$", p):
            self.rfile.read(int(self.headers.get("Content-Length") or 0))
            nome = "enviada-no-teste.png"
            IMGS.setdefault(nome, png(20, 160, 90))
            if nome not in ST["imgs"]: ST["imgs"].append(nome)
            return self.envia(200, {"id": 999, "nome": nome, "arquivo": "img/" + nome})
        self.corpo()
        return self.envia(200, {})

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--porta", type=int, default=8099)
    a = ap.parse_args()
    zera()
    if not os.path.isdir(RAIZ):
        print("nao achei o static em " + RAIZ, file=sys.stderr); sys.exit(1)
    print("stub em http://127.0.0.1:%d  (static de %s)" % (a.porta, RAIZ))
    ThreadingHTTPServer(("127.0.0.1", a.porta), H).serve_forever()
