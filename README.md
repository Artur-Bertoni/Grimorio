# Hexatombe · Mesa

Painel de mesa da campanha **Hexatombe** (Ordem Paranormal RPG), com backend em Java.
Substitui o artifact do Claude: roda em qualquer lugar, sem conectar pasta nenhuma.

Java 21 · Spring Boot 3.3 · PostgreSQL (ou H2 local) · front em HTML/JS puro.

## O que ele faz

**Mestre** vê tudo: campanha, sessões, quadro de cenas, roteiro, método, trilha sonora,
busca nos 923 páginas dos livros (incluindo Arquivos Secretos) e o visor de PDF.

**Jogador** entra com login próprio, pelo celular inclusive, e vê só a aba **Mesa**:
resumos, evidências, "quem é quem" e locais que o mestre liberou, a consulta rápida
de regras, as anotações privadas dele e o mural. A busca dele cobre o Livro Básico,
Sobrevivendo ao Horror e as regras públicas dos Arquivos Secretos. Nunca fichas de
NPC, monstro ou segredo de mestre.

A separação é no servidor, não na tela. O índice de Arquivos Secretos e o documento
`guia` só saem para quem tem papel MESTRE; os PDFs também.

## Subir no Railway

1. Suba este repositório no GitHub.
2. No Railway: **New Project → Deploy from GitHub repo**. Ele acha o `Dockerfile` sozinho.
3. No mesmo projeto: **New → Database → PostgreSQL**.
4. No serviço da aplicação, aba **Variables**, adicione:

   | variável | valor |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (variável de referência) |
   | `MESTRE_LOGIN` | o login que você quer (padrão `mestre`) |
   | `MESTRE_SENHA` | a sua senha |

   Sem `MESTRE_SENHA` o app gera uma aleatória e escreve no log do primeiro boot.

5. Aba **Settings → Volumes**: crie um volume montado em **`/data`**.
   É onde ficam PDFs e trilha sonora. No plano Hobby são 5 GB; os dois livros
   grandes somam ~300 MB, a trilha ~60 MB, então sobra espaço.
6. **Settings → Networking → Generate Domain**.
7. Abra o domínio, entre com o login do mestre.

### Primeira vez dentro do app

No menu **"···"** do topo:

* **Arquivos (PDFs e trilha)** → *Enviar a pasta Sistema* (escolhe a pasta, ele filtra
  os PDFs) e *Enviar a pasta Trilha Sonora* (a subpasta de cada mp3 vira a categoria).
  Os dois livros grandes levam alguns minutos cada; deixe a janela aberta.
* **Jogadores** → cria login e senha de cada um.
* **Chave da IA** → cola a chave da Anthropic (console.anthropic.com) se quiser o
  botão "Perguntar ao ...". A chave fica no banco, nunca chega ao navegador de ninguém.

A busca dos dois livros públicos já vem pronta no jar, então o PDF serve só para
abrir a página. Qualquer PDF novo que você subir é lido página por página pelo
servidor e entra na sua busca (só na sua).

Se o upload pelo navegador travar nos dois livros grandes, tem um plano B em
`scripts/enviar-midia.sh` (roda no Git Bash, WSL, Linux ou Mac):

```bash
./scripts/enviar-midia.sh https://seu-app.up.railway.app mestre SUA_SENHA \
  "/c/Users/artur/.../Sistema" "/c/Users/artur/.../Trilha Sonora"
```

## Rodar na sua máquina

```bash
mvn spring-boot:run
```

Sem `DATABASE_URL` ele usa H2 em arquivo, em `./dados/banco`, e guarda mídia em
`./dados/midia`. Abre em http://localhost:8080 com `mestre` e a senha que aparecer no log.

Para apontar para um Postgres local:

```bash
DATABASE_URL=postgresql://postgres:senha@localhost:5432/hexatombe mvn spring-boot:run
```

Build do jar: `mvn -DskipTests package` → `target/mesa.jar`.

## Variáveis

| variável | padrão | para quê |
|---|---|---|
| `DATABASE_URL` | — | Postgres. Ausente = H2 em arquivo |
| `JDBC_URL`, `JDBC_USER`, `JDBC_SENHA` | — | alternativa ao `DATABASE_URL` |
| `MIDIA_DIR` | `/data/midia` no Docker, `./dados/midia` fora | onde ficam PDFs e áudios |
| `MESTRE_LOGIN` | `mestre` | login criado no primeiro boot |
| `MESTRE_SENHA` | aleatória | senha do primeiro boot |
| `PORT` | `8080` | o Railway injeta sozinho |
| `DB_POOL` | `5` | conexões do pool |

## Mapa do código

```
src/main/java/br/com/hexatombe
  config/    BancoConfig (descobre o banco), SecurityConfig (login e papéis),
             WebConfig (serve /midia com Range), Inicializacao (semeia mestre e docs)
  model/     Usuario, Doc, MuralPost, Nota, Config, Midia
  repo/      repositórios Spring Data
  service/   UsuarioService, DocService, IndiceService (filtra por papel),
             MidiaService (upload + indexação com PDFBox), IaService, ConfigService
  web/       controllers REST + TratadorDeErros
src/main/resources
  indice/    indice-publico.json (600 pág.) e indice-as.json (323 pág., só mestre)
  seed/      guia.json e mesa.json, conteúdo inicial
  static/    index.html (o app inteiro), login.html, publico.js, img/, vendor/
```

### Endpoints

| rota | quem | o quê |
|---|---|---|
| `POST /api/login` · `POST /api/logout` | todos | sessão por cookie |
| `GET /api/sessao` | autenticado | quem sou eu, papel, se a IA está ligada |
| `GET/PUT /api/guia` | **mestre** | o guia inteiro, com versão otimista |
| `GET /api/mesa` · `GET /api/mesa/versao` | autenticado | o que foi liberado |
| `PUT /api/mesa` | **mestre** | publica para a mesa |
| `GET /api/indice` | autenticado | índice filtrado pelo papel |
| `GET /api/mural` · `POST` · `DELETE /{id}` | autenticado | mural |
| `GET/PUT /api/notas` | autenticado | caderno privado de cada um |
| `POST /api/ia` | autenticado | pergunta à API da Anthropic |
| `GET /api/midia` · `/midia/**` | **mestre** | catálogo e arquivos |
| `/api/admin/**` | **mestre** | usuários, upload, chave da IA |

## O que mudou em relação ao artifact

* `claude.use("db")` virou `/api/guia` e `/api/mesa` com Postgres por trás.
* `claude.use("sample")` virou `POST /api/ia` com a chave do mestre no servidor.
* A pasta local (File System Access API) virou upload no painel + volume do Railway.
* A sincronização em tempo real do artifact virou uma sondagem de 6 s em `/api/mesa/versao`.
* pdf.js e as fontes estão em `static/vendor/`, então o app não depende de CDN.
* O visor de PDF carrega por URL com Range: não baixa o livro inteiro para ver uma página.
