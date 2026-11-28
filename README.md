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
  termos e privacidade editáveis, administração do sistema.

O repositório não carrega livro nem arte. Em `modelos-de-campanha/` estão quatro modelos de
estrutura (aventura de uma sessão, estrutura completa, exploração e investigação), sem conteúdo
de nenhum sistema; o restante entra pelo painel ou por pacote.

## Separação mestre/jogador

O corte é feito no servidor, não na tela. O guia, o índice dos livros privados, o áudio, PDFs
não públicos e as rolagens fechadas só saem para quem tem o papel de mestre naquela campanha.
Fichas de outras pessoas respondem 404 para o jogador. Detalhes de segurança (CSRF, CSP, freio
de tentativas, sessão persistente) estão em [CLAUDE.md](CLAUDE.md).

## Como roda

São três serviços no Railway, um projeto `Grimório`, só com o ambiente `production`:

| Serviço | Pasta | O que é | Domínio público |
|---|---|---|---|
| `web` | [`web/`](web/) | O front (HTML, JS e CSS sem build) servido por Caddy, que repassa `/api` e `/midia` para a api | `grimorio-rpg.up.railway.app` |
| `Grimório` | [`api/`](api/) | A api Spring Boot. Volume em `/data` só para índice de busca, miniaturas e cache | não (só rede privada) |
| `Postgres` | — | Banco, template oficial do Railway | não |
| `midia` (bucket) | — | Os arquivos originais: PDFs, trilha, imagens e modelos de campanha (S3 do Railway) | não |

```
navegador ──https──▶ web (Caddy) ──┬── /api, /midia ──▶ Grimório (Spring) ──▶ Postgres
                                   │   rede privada        ├── bucket midia (arquivos)
                                   │                       └── volume /data (índice, miniaturas)
                                   └── o resto: arquivos de web/site
```

Para o navegador tudo continua numa origem só, então cookie de sessão, CSRF e CSP funcionam como
antes. O serviço da api manteve o nome `Grimório` porque é o que já existia: renomear pela IaC
apagaria e recriaria o serviço, e o volume junto.

**Todo push na `main` é deploy em produção.** Cada serviço só redeploya quando a pasta dele muda:
mexer na tela não reinicia a api (nem derruba o SSE de quem está jogando), e mexer na api não
reconstrói o site.

## Deploy no Railway

[`.railway/railway.ts`](.railway/railway.ts) declara os serviços, a origem no GitHub, o Dockerfile de
cada um, healthcheck, política de restart, o volume e as variáveis. Ele é aplicado pela CLI, não pelo
push:

```bash
cd .railway && npm install && cd ..
railway login
railway link            # projeto Grimório, ambiente production
railway config plan     # mostra o que vai mudar, sem mudar
railway config apply
```

Mudou o arquivo, repita o `plan` e o `apply`. Leia o `plan` antes: ele avisa quando uma mudança
destrói algo (volume, serviço, variável) e o `apply` pede confirmação.

> **No Windows**, o pacote `railway/iac` confere a versão da CLI chamando `railway` sem shell, e o
> `railway.cmd` que o npm instala não roda assim (o `plan` diz que a CLI é velha demais). Aponte para
> o executável real antes do `plan` e do `apply`, uma vez por terminal:
>
> ```powershell
> $env:_ = "$env:APPDATA\npm\node_modules\@railway\cli\bin\railway.exe"
> ```

Fica fora do arquivo, no painel: o **domínio** `*.up.railway.app` (a IaC do Railway não registra
domínio; ele fica no serviço `web`, porta 8080) e os valores de `DATABASE_URL`, `DB_HOST` e `DB_PORT`,
que já existiam e o arquivo preserva.

### Subindo do zero

1. Railway → **New Project → Empty Project**, com o nome `Grimório`, e a conta do GitHub conectada.
2. **New → Database → Add PostgreSQL**, mantendo o nome `Postgres`.
3. `railway link` e `railway config apply`: o volume, a api e o web aparecem e fazem o primeiro deploy.
   Na api, `DATABASE_URL` vale `${{Postgres.DATABASE_URL}}`.
4. No serviço `web`: **Settings → Networking → Generate Domain**, porta **8080**. Se o domínio for
   outro, troque `DOMINIO` em `railway.ts` e aplique de novo.

Não há login de bootstrap: abra o site, clique em **Criar uma conta**, e a primeira conta criada
vira a administradora.

## Rodar na máquina

```bash
cd api && mvn spring-boot:run      # a api, em http://localhost:8080
docker compose up web              # o site, em http://localhost:8000 (na raiz do repositório)
```

Sem `DATABASE_URL`, a api usa H2 em arquivo em `api/dados` e mídia em `api/dados/midia`. O
`docker-compose.yaml` monta `web/site` dentro do Caddy, então HTML, JS e CSS valem no F5, sem
rebuild. Postgres local: `docker compose --profile postgres up -d postgres` e
`DATABASE_URL=postgresql://postgres:pg@localhost:55432/grim`. Para gerar o jar:
`mvn -f api/pom.xml -DskipTests package` → `api/target/grimorio.jar`.

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
  trilha, imagens e índices de busca. Importa em qualquer servidor sem reenviar arquivos.
- **Administração → Modelos de campanha**: a administração cadastra estruturas prontas (pacote
  enviado ou campanha existente). Quem cria uma campanha escolhe um em "Como começar" e recebe uma
  cópia. O pacote de cada modelo fica no bucket; nome e capa, em `/data/modelos`.

### Armazenamento

Os arquivos originais (PDF, áudio, imagem, pacote de modelo) ficam no **bucket `midia`** do Railway;
o banco só cataloga, e o volume guarda só o derivado (índice de busca e miniaturas) e um cache dos
originais lidos por último. Conteúdo idêntico é guardado uma vez só: a chave no bucket é o SHA-256 do
arquivo, então o mesmo livro em duas campanhas é um objeto. Sem as variáveis `S3_*` (na máquina, no
CI), o "bucket" é a pasta `api/dados/objetos`.

Arquivos de antes do bucket são copiados para ele sozinhos, a cada boot, e continuam abrindo do volume
enquanto isso. Em **Administração › Armazenamento** aparece o que falta copiar; **Liberar o volume**
apaga do volume as cópias que o bucket já tem (só elas, e pede confirmação).

### Arquivos grandes

O proxy do Railway corta requisições com mais de 5 minutos de upload (cerca de 5 Mbps para um PDF
de 180 MB). Alternativa: enviar ao volume pelo CLI e usar **Reescanear o volume**, em
Biblioteca › Livros › Avançado.

```bash
railway volume --service "Grimório" files upload "Livro.pdf" /c1/pdf/LB.pdf
```

`c1` é o número da campanha e o nome do arquivo precisa ser a abreviação do livro.

## Variáveis

Da api (`Grimório`):

| variável | padrão | para quê |
|---|---|---|
| `DATABASE_URL` | — | Postgres. Ausente = H2 em arquivo |
| `JDBC_URL`, `JDBC_USER`, `JDBC_SENHA` | — | alternativa ao `DATABASE_URL` |
| `MIDIA_DIR` | `/data/midia` no Docker, `./dados/midia` fora | PDFs, áudio, imagens e índices |
| `PORT` | `8080` | injetada pelo Railway |
| `DB_POOL` | `5` | conexões do pool |
| `URL_PUBLICA` | `https://` + `RAILWAY_PUBLIC_DOMAIN` | endereço usado nos links enviados por e-mail (redefinir senha). No Railway é o domínio do `web`, definido em `railway.ts`: a api não tem domínio público |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_KEY`, `S3_SECRET` | — | o bucket dos arquivos. No Railway são referências ao bucket `midia` (`railway.ts`). Ausentes = pasta `dados/objetos` |
| `S3_REGIAO`, `S3_PATH_STYLE` | `auto`, `false` | só para outro S3 (um de teste local pede `us-east-1` e `true`) |
| `CACHE_ARQUIVOS_MB` | `1024` | quanto do volume os originais lidos por último podem ocupar |

Do `web`:

| variável | para quê |
|---|---|
| `PORT` | porta do Caddy (`8080`) |
| `API_URL` | onde está a api (`grimorio.railway.internal:8080` no Railway, `host.docker.internal:8080` no compose) |
| `URL_PUBLICA` | endereço absoluto da imagem de prévia do link de convite (`og:image` do login) |

SMTP, chave da IA, cadastro aberto, textos legais e liberação do mapa são configurados pela tela de
Administração e ficam na tabela `config`.

## Modelo de dados

```
Usuario      conta no servidor; admin administra o servidor inteiro
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
Config       ajustes do servidor
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
| `/api/admin/**` | administrador do sistema |
| `/midia/c{id}/**` | conforme `MidiaAutorizacao` |

## Testes

Não há suíte JUnit. Existem dois testes de ponta a ponta, ambos rodados no CI a cada push na `main`:

- **API** (`scripts/teste-api/teste.mjs`): contra o jar real com a imagem do `web` na frente, em H2 e
  em Postgres. Cobre cadastro, login e CSRF, guia com versão, separação mestre/jogador, upload, PDF,
  pacote e suporte, e o que é do Caddy (CSP, charset, redirects, 404, SSE pelo proxy).
- **Tela** (`scripts/teste-front/`): navegador real sobre um servidor de mentira. Ver
  [scripts/teste-front/README.md](scripts/teste-front/README.md).

## Estrutura

```
.railway/railway.ts                       serviços, volume e variáveis do Railway
api/                                      serviço "Grimório": pom.xml, Dockerfile
api/src/main/java/br/com/grimorio/        config · model · repo · service · web
web/                                      serviço "web": Caddyfile, Dockerfile
web/site/                                 index.html, paginas/, componentes/ (templates), css/, js/, vendor/
docker-compose.yaml                       o web (e um Postgres opcional) para rodar na máquina
scripts/                                  teste-api, teste-front
docs/                                     auditorias, decisões e plano do mapa
```

Guia para quem mexe no código: [CLAUDE.md](CLAUDE.md).

## Licença

Código-fonte disponível sob a [PolyForm Noncommercial 1.0.0](LICENSE): pode ser lido, estudado,
modificado e usado para fins não comerciais, como a sua mesa de jogo. Uso comercial, incluindo
oferecer o app como serviço, não está incluído. Para isso, entre em contato: artur_b_santos@hotmail.com.

Não se trata de open source no sentido da OSI. As bibliotecas e fontes em `web/site/vendor/`
(pdf.js, petite-vue, Almendra, Barlow Condensed, Cinzel, Cormorant Garamond, Oxanium, Special Elite
e Spectral) seguem as licenças originais de cada uma, incluídas ao lado dos arquivos.
