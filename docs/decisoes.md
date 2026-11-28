# Decisões e histórico

Por que o projeto é como é. O `CLAUDE.md` tem as regras operacionais, e `docs/auditoria.md` o
contexto da auditoria de interface; aqui está o raciocínio por trás das escolhas de
arquitetura e o que já foi tentado e descartado.

## De onde veio

Nasceu como painel de uma campanha só, de um sistema específico, hospedada num
artifact do Claude. O artifact dependia de APIs próprias do ambiente e da File System Access
API do navegador. Virar app de verdade significou trocar cada uma por um endpoint:

| antes | agora |
|---|---|
| `claude.use("db")` | `GET/PUT /api/c/{cid}/guia` e `/mesa`, com versão otimista |
| `onSnapshot` | sondagem de 6 s em `/api/c/{cid}/mesa/versao` |
| `claude.use("sample")` | `POST /api/c/{cid}/ia`, chave no servidor |
| File System Access API | upload pelo painel + volume do Railway |
| pdf.js via `{data: arrayBuffer}` | `{url}` com HTTP Range, não baixa o livro inteiro |
| CDN para pdf.js e fontes | `web/site/vendor/` |

A sondagem de 6 segundos é o motivo de a evidência liberada pelo mestre demorar até uns 10
segundos para aparecer na tela do jogador. É o esperado, não defeito. WebSocket foi
considerado e descartado: para cinco pessoas numa sala, não paga a complexidade nem o custo de
conexão aberta no Railway.

O commit `bd87157` é a última versão de campanha única, para quem precisar voltar a ela.

## A universalização

O app era preso a uma campanha e a um sistema: classes com o nome dela, textos e imagens da
campanha dentro do jar, índices de busca embutidos. Dois problemas: só um mestre específico
conseguiria usar, e conteúdo de terceiros não pode morar num repositório universal.

A saída foi separar **motor** de **conteúdo**. O repositório ficou sem texto de livro, sem arte
e sem lógica de sistema. A campanha virou um **pacote** (um zip, `PacoteService`) que leva tudo
para a campanha reabrir igual em outra conta: guia, mesa, fichas, catálogo de mídia, índices de
busca, imagens, PDFs e áudio. Quem tem conteúdo com direitos envolvidos guarda o pacote fora do
repositório. Junto vieram vocabulário configurável (`V()` / `Vm()`), temas, identidade da
campanha e estrutura de guia toda opcional (`normalizaCampanha()` preenche o que faltar).

### O corte de 600 e 923 páginas

A campanha original tinha uma curadoria manual: 600 páginas de regras visíveis ao jogador e
923 ao mestre, decididas arquivo por arquivo. Reindexar os PDFs do zero perderia isso. O índice
é marcado por `publico` e dividido em arquivos `-P` e `-M` (`AS01-P.json`, `AS01-M.json`).
`IndiceService.temLivro()` faz glob por `ABREV*.json`, então subir o PDF de um livro que já tem
índice **não** reindexa nem inverte o corte. É de propósito: a curadoria vence a extração
automática.

## Multi-campanha e contas

A versão de campanha única tinha login por variável de ambiente e um usuário criado no primeiro
boot. Isso não escala para um servidor que serve várias mesas, e obriga quem sobe o app a
mexer em painel de infraestrutura antes de conseguir entrar.

Virou self-service: nenhuma variável de login, nenhuma conta gerada no boot, tela de **Criar
uma conta** no próprio site, e a primeira conta criada vira a administradora do sistema.
Entrar numa campanha de outra pessoa é por link de convite com token, papel, número de usos e
validade. O login entende `?convite=` e preserva o token até depois do cadastro, para o link
funcionar para quem ainda não tem conta. Cadastro aberto é o padrão (`config.registroAberto`),
desligável na Administração; em um servidor exposto na internet a administração provavelmente quer desligar.

## Escolhas de infraestrutura

**Sem Flyway, `ddl-auto=update`.** Decisão deliberada e revisada depois de dois incidentes: uma
migração escrita sem ambiente para testar é mais arriscada que `ddl-auto` com duas regras
conhecidas (DEFAULT em coluna NOT NULL nova, e `AjusteEsquema` para os CHECK de enum). Se o
projeto ganhar um staging com dados de verdade, vale reavaliar.

**Railway em três serviços, declarados em código (28/11/2026).** Até aqui era um serviço só: o jar
servia a tela e a api, com um `railway.json` na raiz. Dois motivos para mudar. O `railway.json` deixa de
valer em 01/12/2026 (a CLI passou a pedir a Infrastructure as Code em `.railway/railway.ts`). E todo
ajuste de tela reiniciava a JVM, derrubando o SSE e as sessões em memória de quem estava jogando.
A divisão seguiu a do outro projeto do dono (Unidos pelo Vôlei): uma pasta por serviço, Dockerfile
próprio, `watchPatterns` na pasta e `railway config plan`/`apply` pela CLI.

- **`web` (Caddy) na frente, api privada.** O Caddy serve `web/site` e repassa `/api` e `/midia` pela
  rede privada. Mesma origem para o navegador, então cookie, CSRF double-submit e CSP não mudaram e o
  front não ganhou CORS nem URL de api. O que o Spring fazia pelo front (login com `{{BASE}}`, redirect de
  `/login.html`, `/privacidade`, 404 em HTML, charset, cabeçalhos de segurança, `no-cache`) foi para o
  `Caddyfile`. A casca deixou de exigir login no servidor: é só marcação. O Caddy manda ao login quem
  não tem o cookie de lembrar, e o 401 da api cobre o resto.
- **Três, não mais.** Mapa, SSE, rolagens e mídia autorizada pela sessão moram juntos, e um volume só se
  prende a um serviço. Separar PDF, IA ou e-mail em serviços próprios criaria rede e autenticação entre
  eles sem ganho para uma mesa de RPG. Candidato se um dia pesar: indexar PDF fora da api, lendo o
  volume por um bucket.
- **O serviço da api manteve o nome `Grimório`.** Renomear pela IaC é apagar e recriar o serviço, e o
  volume de mídia junto. O domínio `grimorio-rpg.up.railway.app` passou para o `web`, então convites já
  compartilhados continuam valendo.
- **O front continua sem build.** A imagem do web é o Caddy com os arquivos copiados.

**`-Xmx512m` fixo.** Sem isso a JVM enxerga o teto do plano, assume heap proporcional e nunca
devolve memória. No Railway isso é conta de verdade no fim do mês.

**Volume em `/data`, não banco.** PDF de 186 MB não entra em Postgres por um bom motivo. O
volume também permite `railway volume files upload` contornar o limite de 5 minutos de corpo de
requisição do proxy, com o botão **Reescanear o volume** registrando o que apareceu lá.

**Arquivos originais no bucket, não no volume (28/11/2026).** O volume do Railway tem tamanho fixo e
só se prende a um serviço; o plano Free permite um volume de 0,5 GB por projeto, e no Hobby criar mais
volumes não economiza nada (paga-se o GB usado). Foram descartados volumes extras em subserviços (o
hard link não atravessa volumes e cada um pediria um serviço servindo arquivo) e mover tudo, índice
inclusive, para o bucket (cada busca leria pela rede). Ficou:

- **Só os originais vão para o bucket** (PDF, áudio, imagem, zip de modelo); índice de busca e
  miniaturas ficam no volume, pequenos e refeitos a partir do original se sumirem.
- **A chave é o SHA-256 do conteúdo.** Substitui o hard link: o mesmo arquivo em duas campanhas é um
  objeto, e quem conta as referências é a tabela `midia` (`soltarSeOrfao`), não o sistema de arquivos.
- **`/midia` continua passando pela api**, que confere mestre/jogador e repassa o arquivo trecho a
  trecho. URL assinada direto para o bucket pouparia a api, mas exigiria CORS no bucket (o pdf.js lê
  por fetch) e deixaria o link valer para quem o recebesse até expirar.
- **Migração sem passo arriscado.** O boot copia, nunca apaga; tudo lê do volume enquanto o bucket não
  tem. Apagar do volume é um botão da Administração, que só tira o que o bucket já tem com o mesmo
  tamanho. Foi testado subindo dados com a versão anterior e trocando de jar na mesma pasta.
- **Na máquina e no CI o cofre é uma pasta** (`CofrePasta`), com o mesmo código de chave por hash: o
  teste de API exercita o caminho inteiro sem S3. O CI roda também contra um S3 de teste.

**pdf.js e fontes em `web/site/vendor/`.** O app sobe inteiro sem rede externa, e uma CDN fora do
ar não derruba a mesa no meio da sessão.

## Incidentes

**Tela branca depois do login (08/11/2026).** `index.html` tinha sido escrito para o runtime de
artifact, que fornecia o esqueleto da página. Fora dele, sem `<!doctype>` e sem `<meta
charset>`, o navegador adivinhou Windows-1252, corrompeu a regex de `norm()` e o SyntaxError
matou o script inteiro. O que mascarou o bug: o stub de teste mandava `charset=utf-8` no
cabeçalho. **Stub que diverge do servidor real em cabeçalho esconde bug de servidor real.**

**Login mudo (09/11/2026).** Colunas booleanas novas sem DEFAULT. Armadilha 1 do `CLAUDE.md`.

**Importar pacote quebrado (09/11/2026).** CHECK de enum desatualizado. Armadilha 2.

**Foto de hover sem carregar (11/11/2026).** Um caminho de imagem entrava no `src` sem passar
pelo `IMG()`, resolvia na raiz do site e dava 404 silencioso. Armadilha 4.

## A reestruturação de usabilidade (11/11/2026)

A universalização trocou rótulos, mas deixou três heranças do painel de página fixa: o formato
de dados da campanha original, um modo edição global em que tudo virava digitável na própria
página, e coisas que só existiam se viessem num JSON importado. Um mestre novo não conseguia
criar NPC, local nem evidência numa sessão, então não tinha o que liberar e a Mesa do jogador
ficava vazia para sempre. O que foi decidido:

**Formulário por item, sem modo edição.** A edição no lugar foi testada e reprovada: campo
vazio era uma caixa tracejada sem rótulo, a quebra de linha sumia, a tecla `E` ligava sem
querer, e cada adicionar chamava `render()` e rolava a tela para o topo. Cada item tem um botão
de editar que abre `formulario()`. Descartadas: consertar a edição no lugar e dividir o app em
modos Preparar e Jogar.

**Cadastros (elenco) e seções livres.** Personagens, NPCs, locais e evidências são cadastrados
uma vez em `D.elenco`, e a sessão guarda só os ids. As seções fixas viraram `campanha.secoes`,
que o mestre cria, nomeia e ordena (texto, lista ou cartões). O "mapa das sessões", que ligava
uma linha ao roteiro por número digitado à mão, acabou: a linha planejada é a própria sessão.

**O guia só existe no formato 3.** A migração v2→v3 no cliente foi removida. Guia gravado num
formato anterior abre a tela de erro e **nunca é regravado**, para não sobrescrever conteúdo que
o código atual não entende. O boot e o "Tentar de novo" passam pela mesma checagem
(`aceitaGuia()`); antes, o botão carimbava o guia antigo como versão 3 e a próxima gravação
destruía o conteúdo.

**Liberar para a mesa é por id.** A mesa guarda uma cópia do que foi liberado, porque o jogador
não lê o guia. Achar a cópia por nome fazia homônimos colidirem e deixava a versão velha na tela
do jogador após renomear. `sincLib()` atualiza a cópia quando o cadastro é editado; cópias
anteriores só têm nome e valem por nome até serem tocadas.

**Abas por área e página de Configurações.** Campanha, Sessões, Elenco, Biblioteca e Mesa. O
menu antigo misturava 14 coisas numa janela; virou a página de Configurações, em seções. A
Biblioteca ganhou a chave "jogadores veem" de cada PDF: o servidor sempre aceitou `publico`,
mas a tela nunca enviava, então todo livro subido pelo app ficava privado.

**Desfazer no lugar de confirmar.** `comDesfazer()` guarda guia e mesa inteiros e oferece
desfazer por alguns segundos. A confirmação de verdade (`confirmar()`, uma janela do app) ficou
só onde não há volta: arquivo no servidor, apagar a campanha, sair dela, remover conta.

**`save()` recusa gravar quando o guia não chegou.** Se a leitura do guia falhava, o app
montava uma campanha vazia e qualquer edição era gravada por cima do conteúdo real. `BOOTERR`
trava o `save()` e a tela de erro aparece no lugar da campanha.

### Nada preso a um sistema

Regra do dono: o app tem de servir a qualquer sistema de RPG, e **tudo que aparece na tela tem
de poder ser editado pela tela**. O que era tabela fixa no código virou dado da campanha:

| era no código | agora |
|---|---|
| `CATS`, filtros de assunto com regex de um sistema | `campanha.categoriasBusca`, em Configurações › Busca |
| sinônimos e "páginas certas", que só entravam por pacote | editores em Configurações › Busca |
| `ABREVS`, que reconhecia os livros pelo nome | a pessoa confere nome e abreviação de cada PDF antes de enviar |
| `NOMES_DOC` | o nome vem do catálogo; dá para renomear o livro na Biblioteca |
| `campanha.indiceAS` sem editor | "Índice dos livros" editável na aba Campanha (`Título \| página`, `-` item, `--` subitem) |
| categoria de trilha = nome da subpasta | editar categoria (nome e cor) e mudar a faixa de categoria, na Biblioteca › Trilha |

A abreviação do livro continua imutável depois do envio: é a chave do arquivo no volume e do
índice, por isso é conferida **antes**.

**Capítulos vêm do sumário do próprio PDF.** `MidiaService.secoesPorPagina()` lê os marcadores
(outline) e dá a cada página o título do capítulo em que ela cai. Adivinhar capítulo pelo texto
foi descartado: fonte e diagramação variam demais, e título errado atrapalha a busca mais do que
título nenhum. PDF sem marcadores fica sem capítulo, e o filtro de assunto olha o começo da
página. Livro enviado antes disso ganha capítulos pelo botão **reler capítulos**, que se recusa
a tocar em índice vindo de pacote. Um tropeço que vale lembrar: `PDDocument.getPages()` devolve
um `PDPage` novo a cada leitura, então comparar página por identidade nunca casa; só apareceu
rodando contra um PDF de verdade.

## A auditoria de interface (16 a 18/11/2026)

O contexto completo, as notas e o checklist estão em `docs/auditoria.md`. As escolhas técnicas
que ficam, e o porquê:

- **Endereço por hash**, não por caminho: o jar só serve arquivos e `/api`, e hash não exige
  rota nova no servidor nem mexe na segurança.
- **Escalas em tokens** (`css/tokens.css`) no lugar de dezenas de tamanhos, espaçamentos,
  sombras e camadas soltos. A migração foi por script (arredonda para o degrau mais perto), com
  a ordem das camadas locais do quadro mantida à mão.
- **Contraste corrigido nos temas** mexendo só na cor que falhava, e testado automaticamente
  para tema novo não regredir.
- **Miniatura gerada pelo servidor sob demanda** (`?mini=1`), e não no envio, para valer também
  para imagem que veio por pacote ou direto no volume. WebP lido pela TwelveMonkeys; saída em
  JPEG, ou PNG com transparência. Fica em `img/.mini/`, fora do reescanear e do pacote.
- **Recuperação de senha por e-mail, privacidade, termos e contagem de uso.** A contagem é
  própria e anônima (dia, evento, total), sem serviço externo e sem cookie novo, por isso não há
  banner de cookies: o único cookie continua sendo o de sessão.
- **Tour curto na primeira entrada** (7 passos) com convite para o completo, que continua em
  Configurações. "Visto" e "primeiros passos dispensados" ficam na conta, não só no navegador.

## O tabletop (mapa interativo, 18 e 19/11/2026)

Mapa com grade, tokens, régua, camadas, desenho, paredes e névoa, em tempo real (SSE com polling de reserva).
Decisões do dono: a névoa é segurança real (o servidor corta o mapa em pedaços e só serve o revelado);
vários mapas por campanha, um ativo; diagonal configurável; token de ficha, NPC ou avulso; jogador move só o
dele; desfazer por pessoa; o mapa vai no pacote e **não** nos modelos. Descartado: WebSocket (CSRF e Security),
mapa dentro do guia (regravaria o documento a cada arrasto), nome como elo da iniciativa (virou id do token).
No pacote o mapa entra desligado e sem o que depende de conta ou ficha, porque esses ids não existem na outro servidor. O que cada fase entregou e os avisos estão em `docs/plano-tabletop.md`.

## O que ficou de fora

- **Modo de jogo próprio na tela larga.** No celular a sessão tem barra de jogo e gaveta; no
  computador a tela de sessão continua a mesma do preparo. É o plano, não esquecimento.
- **Renomear faixa de trilha.** O roteiro cita a faixa pelo nome; renomear pede atualizar todas
  as cenas que a usam. Só a categoria é editável.
- **Efeitos de tema em composição pura.** Dois loops (maré do Abismo, LED do Neon) repintam no
  hover; convertê-los mudaria o desenho, que o dono quis manter.

## Pendências e ideias

- Renomear o repositório de `campanha` para `grimorio`, e marcar `bd87157` com uma tag.
- `scripts/teste-front/` não cobre o envio de PDF com conferência de abreviação, o arraste de
  cartão no quadro, o visor de PDF nem upload de verdade, e não roda em CI: falta um workflow
  que suba o stub e chame o `teste.mjs`.
- Não existe teste de backend além do `scripts/teste-api/`, que roda contra H2. As duas
  armadilhas de schema foram pegas contra um Postgres de verdade subido à mão, não por teste
  automatizado.
- O vocabulário é o que o editor em Configurações › Vocabulário oferece, e ele itera
  `Object.keys(VOCAB_PADRAO)`. Rótulo novo que o mestre possa querer trocar precisa entrar lá,
  senão `V()` devolve a própria chave e o campo não aparece no editor.
