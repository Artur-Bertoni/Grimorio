# Grimório

Painel de mesa de RPG para mestres e jogadores: guia da campanha, sessões, elenco,
fichas, biblioteca de livros com busca, mapa tabletop, rolagem de dados e mural.

Java 25 · Spring Boot 4.2 · PostgreSQL (H2 em arquivo no local) · front em HTML/JS puro, sem build.

## Funcionalidades

**Mestre**
- **Campanha**: apresentação, seções livres, vocabulário e consulta rápida de regras configuráveis.
- **Sessões**: roteiro, cenas em quadro arrastável, territórios, iniciativa e liberação de conteúdo para a mesa.
- **Elenco**: personagens, NPCs, locais e evidências, com controle do que cada jogador vê.
- **Biblioteca**: PDFs, trilha sonora e imagens. Busca no texto dos livros e visor de PDF com
  Range (abre a página sem baixar o arquivo inteiro). Miniaturas de imagem geradas sob demanda.
- **Fichas**: modelo de campos e fórmula de rolagem editáveis, e esboço de ficha montado a partir
  do índice dos livros, sem IA.
- **Mapa tabletop**: mapas com tokens, desenhos, paredes e névoa de guerra com visão por jogador,
  iniciativa, medição, desfazer e galeria de moldes gerados (masmorra, taverna, nave…).
- **IA**: perguntas com trechos dos livros como contexto (chave da Anthropic guardada no servidor).
- **Pacote de campanha**: exporta e importa a campanha inteira em um `.zip`.

**Jogador**
- Aba Mesa com resumos, evidências, "quem é quem" e locais liberados pelo mestre.
- Busca restrita aos livros marcados como públicos, consulta rápida de regras, anotações privadas e mural.
- Fichas próprias, com rolagem a partir da ficha, e tokens no mapa.

**Geral**
- Rolagem de dados com fórmulas (`2d6+3`, `2d20kh1`, `4d6dl1`) sorteadas no servidor, abertas ou fechadas.
- Aviso em tempo real (SSE) de mudanças na mesa, rolagens e mapa.
- 11 temas em 5 estilos (fantasia, terror, mistério, investigação, ficção científica), com efeitos
  próprios e opção de reduzir movimento.
- Guias interativos por aba, atalhos de teclado, endereço por tela (hash) e layout responsivo
  com barra de abas no celular.
- Contas com recuperação de senha por e-mail (SMTP opcional), suporte pela própria tela,
  termos e privacidade editáveis, administração da instância.

O repositório não carrega campanha, livro nem arte: o conteúdo entra pelo painel ou por pacote.

## Separação mestre/jogador

O corte é feito no servidor, não na tela. O guia, o índice dos livros privados, o áudio, PDFs
não públicos e as rolagens fechadas só saem para quem tem o papel de mestre naquela campanha.
Fichas de outras pessoas respondem 404 para o jogador. Detalhes de segurança (CSRF, CSP, freio
de tentativas, sessão persistente) estão em [CLAUDE.md](CLAUDE.md).

## Subir no Railway

1. Suba este repositório no GitHub.
2. Railway → **New Project** → **Deploy from GitHub repo**. O `Dockerfile` da raiz é usado automaticamente.
3. No mesmo projeto: **New** → **Database** → **Add PostgreSQL**, mantendo o nome `Postgres`.
4. No serviço da aplicação, aba **Variables**:

   | variável | valor |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `PORT` | `8080` |

5. **Settings → Volumes**: volume montado em **`/data`** (PDFs, áudio, imagens, índices e modelos).
6. **Settings → Networking → Generate Domain**.

Não há login de bootstrap: abra o site, clique em **Criar uma conta**, e a primeira conta da
instância vira a administradora.

## Rodar na máquina

```bash
mvn spring-boot:run
```

Sem `DATABASE_URL`, usa H2 em arquivo em `./dados` e mídia em `./dados/midia`.
Abre em http://localhost:8080. Para gerar o jar: `mvn -DskipTests package` → `target/grimorio.jar`.

## Primeiros passos

1. Crie sua conta e, na tela inicial, crie a campanha ou entre numa existente com a chave de
   convite. Um pacote `.zip` ou um modelo de campanha pode ser escolhido na criação.
2. **Campanha**: escreva a apresentação e crie as seções.
3. **Elenco**: cadastre personagens, NPCs, locais e evidências.
4. **Biblioteca**: envie PDFs (marque "jogadores veem" nos consultáveis), trilha e imagens.
5. **Configurações → Mesa e convites**: gere um link de convite por jogador.
6. **Configurações → Vocabulário / Consulta rápida / Aparência**: ajuste nomes, regras e tema.

### Pacote e modelos de campanha

- **Configurações → Campanha → Exportar/Importar pacote**: zip com guia, mesa, fichas, mapas, livros,
  trilha, imagens e índices de busca. Importa em qualquer instância sem reenviar arquivos.
- **Administração → Modelos de campanha**: a administração cadastra estruturas prontas (pacote
  enviado ou campanha existente). Quem cria uma campanha escolhe um em "Como começar" e recebe uma
  cópia. Ficam em `/data/modelos`.

### Armazenamento

Arquivos ficam no volume, em `/data/midia/c{campanha}/{pdf,audio,img,indice}/`; o banco só cataloga.
Conteúdo idêntico é guardado uma vez só (hash SHA-256 e hard link entre campanhas), e o servidor
confere o espaço livre antes de gravar (507 `armazenamento-cheio` quando acaba).

### Arquivos grandes

O proxy do Railway corta requisições com mais de 5 minutos de upload (cerca de 5 Mbps para um PDF
de 180 MB). Alternativa: enviar ao volume pelo CLI e usar **Reescanear o volume**, em
Biblioteca › Livros › Avançado.

```bash
railway volume files upload "Livro.pdf" /c1/pdf/LB.pdf
```

`c1` é o número da campanha e o nome do arquivo precisa ser a abreviação do livro.

## Variáveis

| variável | padrão | para quê |
|---|---|---|
| `DATABASE_URL` | — | Postgres. Ausente = H2 em arquivo |
| `JDBC_URL`, `JDBC_USER`, `JDBC_SENHA` | — | alternativa ao `DATABASE_URL` |
| `MIDIA_DIR` | `/data/midia` no Docker, `./dados/midia` fora | PDFs, áudio, imagens e índices |
| `PORT` | `8080` | injetada pelo Railway |
| `DB_POOL` | `5` | conexões do pool |
| `URL_PUBLICA` | `https://` + `RAILWAY_PUBLIC_DOMAIN` | endereço usado nos links enviados por e-mail (redefinir senha). Fora do Railway, defina |

SMTP, chave da IA, cadastro aberto, textos legais e liberação do mapa são configurados pela tela de
Administração e ficam na tabela `config`.

## Modelo de dados

```
Usuario      conta na instância; admin administra a instância inteira
Campanha     uma mesa; dono, sistema, tema
Membro       liga usuário e campanha com papel MESTRE ou JOGADOR
Convite      token de entrada, com papel, usos e validade
Documento    "guia" e "mesa" de cada campanha: JSON versionado
Anotacao     caderno privado por pessoa e campanha
MuralPost    recados da campanha
Midia        catálogo de PDF, áudio e imagem; PDF tem marca de público
Rolagem      dados rolados no servidor; pedidos de teste do mestre
Ficha        ficha de personagem (JSON) com dono
Mapa         mapa, elementos (token, desenho, parede, névoa) e histórico
Chamado      mensagens de suporte
Config       ajustes da instância
```

## Endpoints

| rota | quem |
|---|---|
| `POST /api/login` · `/api/logout` · `/api/registrar` · `GET /api/ping` · `/api/publico/**` | aberto |
| `GET /api/sessao` · `POST /api/convites/{token}` · `/api/suporte` | autenticado |
| `GET/POST /api/campanhas`, `PUT/DELETE /api/campanhas/{id}` | dono ou mestre |
| `/api/campanhas/{id}/membros` · `/convites` · `/sair` | mestre da campanha |
| `GET/PUT /api/c/{id}/guia` | mestre |
| `/api/c/{id}/mesa` · `/indice` · `/mural` · `/notas` · `/ia` · `/rolagens` · `/fichas` · `/mapas` · `/eventos` | membro (escrita da mesa: mestre) |
| `/api/c/{id}/midia/**` · `/pacote` · `/modelo/{modelo}` | mestre |
| `/api/modelos` · `/api/modelos/{id}/capa` | qualquer conta (lista e capa) |
| `/api/admin/**` | administrador da instância |
| `/midia/c{id}/**` | conforme `MidiaAutorizacao` |

## Testes

Não há suíte JUnit. Existem dois testes de ponta a ponta, ambos rodados no CI a cada push na `main`:

- **API** (`scripts/teste-api/teste.mjs`): contra o jar real, em H2 e em Postgres. Cobre cadastro, login e
  CSRF, guia com versão, separação mestre/jogador, upload, PDF, pacote e suporte.
- **Tela** (`scripts/teste-front/`): navegador real sobre um servidor de mentira. Ver
  [scripts/teste-front/README.md](scripts/teste-front/README.md).

## Estrutura

```
src/main/java/br/com/grimorio/   config · model · repo · service · web
src/main/resources/static/       index.html, paginas/, componentes/ (templates), css/, js/, vendor/
scripts/                         teste-api, teste-front
docs/                            auditorias, decisões e plano do mapa
```

Guia para quem mexe no código: [CLAUDE.md](CLAUDE.md).
