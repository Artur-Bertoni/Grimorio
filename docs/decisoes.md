# Decisões e histórico

Por que o projeto é como é. O `CLAUDE.md` tem as regras operacionais; aqui está o
raciocínio por trás delas e o que já foi tentado.

## De onde veio

Nasceu como painel de uma campanha só, a Hexatombe, de Ordem Paranormal, hospedada
num artifact do Claude. O artifact dependia de APIs próprias do ambiente
(`claude.use("db")`, `onSnapshot`, `claude.use("sample")`) e da File System Access API
do navegador. Virar app de verdade significou trocar cada uma dessas por um endpoint:

| antes | agora |
|---|---|
| `claude.use("db")` | `GET/PUT /api/c/{cid}/guia` e `/mesa`, com versão otimista |
| `onSnapshot` | sondagem de 6 s em `/api/c/{cid}/mesa/versao` |
| `claude.use("sample")` | `POST /api/c/{cid}/ia`, chave no servidor |
| File System Access API | upload pelo painel + volume do Railway |
| pdf.js via `{data: arrayBuffer}` | `{url}` com HTTP Range, não baixa o livro inteiro |
| CDN para pdf.js e fontes | `static/vendor/` |

A sondagem de 6 segundos é o motivo de a evidência liberada pelo mestre demorar até
uns 10 segundos para aparecer na tela do jogador. É o esperado, não defeito.
WebSocket foi considerado e descartado: para cinco pessoas numa sala, não paga a
complexidade nem o custo de conexão aberta no Railway.

## A universalização (09/11/2026)

O app era todo Ordem Paranormal: nomes de classe `br.com.hexatombe`, texto de livro
transcrito dentro do jar, 59 imagens de campanha em `static/img/`, índices de busca
embutidos em `src/main/resources/indice/`.

Dois problemas. O óbvio: ninguém além de um mestre específico conseguiria usar. O
outro, que motivou a mudança mais do que o primeiro: o repositório carregava 2,3 MB de
texto transcrito de livro publicado e 17 MB de arte de campanha. Publicar isso num
repositório universal é problema jurídico, não questão de organização.

A saída foi separar **motor** de **conteúdo**:

- O repositório virou o motor limpo. Zero texto de livro, zero arte, zero lógica de
  sistema. 793 KB.
- A campanha virou um **pacote**: um zip com `campanha.json` (guia + mesa),
  `indice/*.json` e `img/*`. `PacoteService` importa e exporta. Quem tem conteúdo com
  direitos envolvidos guarda o pacote fora do repositório.

Junto vieram as peças que tornam isso utilizável por outra pessoa: vocabulário
configurável (`V()` / `Vm()`), temas de cor, identidade da campanha, e estrutura de
guia toda opcional com `normalizaCampanha()` preenchendo o que faltar.

### O corte de 600 e 923 páginas

A campanha original tinha uma curadoria manual: 600 páginas de regras visíveis ao
jogador e 923 ao mestre, decididas arquivo por arquivo. Reindexar os PDFs do zero
perderia isso.

A solução foi marcar o índice por `publico` e dividir os arquivos em `-P` e `-M`
(`AS01-P.json`, `AS01-M.json`). `IndiceService.temLivro()` faz glob por `ABREV*.json`,
então subir o PDF de um livro que já tem índice **não** reindexa nem inverte o corte.
Isso é de propósito: a curadoria vence a extração automática.

## Multi-campanha e contas

A versão de campanha única tinha login por variável de ambiente (`MESTRE_LOGIN`,
`MESTRE_SENHA`) e um usuário criado no primeiro boot. Isso não escala para uma
instância que serve várias mesas, e obriga quem sobe o app a mexer em painel de
infraestrutura antes de conseguir entrar.

Virou self-service: nenhuma variável de login, nenhuma conta gerada no boot, tela de
**Criar uma conta** no próprio site, e a primeira conta criada vira a administradora
da instância. Entrar numa campanha de outra pessoa é por link de convite com token,
papel, número de usos e validade. `login.html` entende `?convite=` e preserva o token
até depois do cadastro, para o link funcionar para quem ainda não tem conta.

Cadastro aberto é o padrão (`config.registroAberto`), desligável na Administração.
Instância pessoal exposta na internet provavelmente quer desligar.

`MigracaoService` cobre quem já rodava a versão antiga: na primeira conta criada, o
conteúdo antigo vira a campanha 1, as outras contas entram como jogadores, `doc` vira
`documento`, `nota` vira `anotacao`, e `/data/midia/*` é movido para
`/data/midia/c1/`. Nada é apagado: as tabelas `doc` e `nota` continuam lá.

## Escolhas de infraestrutura

**Sem Flyway, `ddl-auto=update`.** Decisão deliberada e revisada depois de dois
incidentes. O raciocínio: migração escrita sem ambiente para testar é mais arriscada
que `ddl-auto` com duas regras conhecidas (DEFAULT em coluna NOT NULL nova, e
`AjusteEsquema` para os CHECK de enum). Se o projeto ganhar um ambiente de staging
com dados de verdade, vale reavaliar.

**Railway, Dockerfile.** Um Dockerfile na raiz vence o builder padrão sozinho, sem
configurar nada no painel. O `railway.json` que também declara `DOCKERFILE` é cinto e
suspensório, e o formato está marcado como depreciado: quando parar de valer, a
detecção automática continua.

**`-Xmx512m` fixo.** Sem isso a JVM enxerga o teto do plano, que é de dezenas de
gigas, assume heap proporcional e nunca devolve memória. No Railway isso é conta de
verdade no fim do mês.

**Volume em `/data`, não banco.** PDF de 186 MB não entra em Postgres por um bom
motivo. O volume também é o que permite `railway volume files upload` contornar o
limite de 5 minutos de corpo de requisição do proxy, com o botão **Reescanear o
volume** registrando o que apareceu lá.

**pdf.js e fontes em `static/vendor/`.** O app sobe inteiro sem rede externa. Também
evita que uma CDN fora do ar derrube a mesa no meio da sessão.

## Incidentes

**Tela branca depois do login (08/11/2026).** `index.html` tinha sido escrito para o
runtime de artifact, que fornecia o esqueleto da página na publicação. Fora dele, sem
`<!doctype>` e sem `<meta charset>`, o navegador adivinhou Windows-1252, corrompeu a
regex `[̀-ͯ]` da função `norm()` e o SyntaxError matou o script inteiro.
Corrigido com documento completo, escapes `\u`, e um filtro de servlet forçando
`charset=utf-8`.

Vale registrar o que mascarou o bug: o servidor de stub usado nos testes mandava
`charset=utf-8` no cabeçalho, então o problema não aparecia nos testes. Stub que
diverge do servidor real em cabeçalho esconde bug de servidor real.

**Login mudo (09/11/2026).** Colunas booleanas novas sem DEFAULT. Ver armadilha 1 no
`CLAUDE.md`.

**Importar pacote quebrado (09/11/2026).** CHECK de enum desatualizado. Ver armadilha
2 no `CLAUDE.md`.

**Foto de hover sem carregar (11/11/2026).** `p.mask` entrava no `src` sem passar pelo
`IMG()`. Resolvia na raiz do site, 404 silencioso, e o hover simplesmente não trocava
a imagem. Ver armadilha 4.

## A reestruturação de usabilidade (11/11/2026)

A universalização trocou rótulos, mas deixou três heranças do painel de página fixa:
o formato de dados da campanha original, um modo edição global em que tudo virava
digitável na própria página, e várias coisas que só existiam se viessem num JSON
importado. Um mestre novo não conseguia criar NPC, local nem evidência numa sessão,
então não tinha o que liberar e a Mesa do jogador ficava vazia para sempre.

O que foi decidido, com o dono do projeto:

**Formulário por item, sem modo edição.** A edição no lugar foi testada e reprovada:
campo vazio era uma caixa tracejada sem rótulo, a quebra de linha sumia (`textContent`),
a tecla `E` ligava sem querer, e cada adicionar/remover chamava `render()`, que
rolava a tela para o topo. Agora cada item tem um botão **editar** que abre
`formulario()`, com rótulo, dica, Salvar e Cancelar. As alternativas descartadas
foram consertar a edição no lugar e dividir o app em modos Preparar e Jogar.

**Cadastros (elenco) e seções livres.** Personagens, NPCs, locais e evidências são
cadastrados uma vez em `D.elenco` e a sessão guarda só os ids (`npcIds`, `localIds`,
`pistaIds`). As seções fixas ("Antes da primeira sessão", "Adaptações", "O conceito",
"Regras de ouro", a aba Método) viraram `campanha.secoes`, que o mestre cria, nomeia e
ordena, em três formas: texto, lista e cartões. O "mapa das sessões", que ligava uma
linha ao roteiro por número digitado à mão, acabou: a linha planejada é a própria
sessão.

**Migração v2 → v3 no cliente, não destrutiva.** `migrarV3()` roda em
`normalizaCampanha()` quando `D.versao < 3` e regrava o guia. Os campos antigos
(`corpos`, `preSessao`, `episodios`, `s.npcs`, `s.handouts`…) **ficam no JSON**,
parados. É de propósito: dá para voltar ao commit anterior sem perder nada, e o que a
migração entendeu errado continua recuperável. Quando o formato novo estiver
assentado, vale um passo que limpe esses campos.

**Liberar para a mesa é por id.** A mesa guarda uma cópia do que foi liberado, porque
o jogador não lê o guia. Antes a cópia era achada por nome: dois NPCs homônimos
colidiam, e renomear deixava a versão velha na tela do jogador. Agora `sincLib()`
atualiza a cópia quando o cadastro é editado. As cópias liberadas antes da v3 só têm
nome e continuam valendo por nome até serem tocadas.

**Abas por área e página de Ajustes.** Campanha, Sessões, Elenco, Biblioteca e Mesa.
O menu "···" misturava 14 coisas numa janela; virou a página de Ajustes, em seções.
Arquivos saiu de lá e virou a aba Biblioteca, que ganhou a chave "jogadores veem" de
cada PDF: o servidor sempre aceitou `publico`, mas a tela nunca enviava, então todo
livro subido pelo app ficava privado.

**Desfazer no lugar de confirmar.** `comDesfazer()` guarda guia e mesa inteiros e
oferece desfazer por 7 segundos. `confirm()` ficou só onde não há volta: arquivo no
servidor, resumo publicado, apagar a campanha.

**`save()` recusa gravar quando o guia não chegou.** Se a leitura do guia falhava, o
app montava uma campanha vazia e qualquer edição era gravada por cima do conteúdo
real (o 409 de versão era resolvido relendo a versão e repetindo). Agora `BOOTERR`
trava o `save()` e a tela de erro aparece no lugar da campanha.

### Nada preso a um sistema (11/11/2026, segunda leva)

Regra dada pelo dono: o app tem de servir a qualquer sistema de RPG, e **tudo que
aparece na tela tem de poder ser editado pela tela**. O que ainda era tabela fixa no
código virou dado da campanha:

| era no código | agora |
|---|---|
| `CATS`, filtros de assunto com regex de Ordem Paranormal | `campanha.categoriasBusca`, em Ajustes › Busca |
| sinônimos e "páginas certas", que só entravam por pacote | editores em Ajustes › Busca |
| `ABREVS`, que reconhecia os livros de um sistema pelo nome | a pessoa confere nome e abreviação de cada PDF antes de enviar |
| `NOMES_DOC` | o nome vem do catálogo; dá para renomear o livro na Biblioteca |
| `campanha.indiceAS` sem editor | "Índice dos livros" editável na aba Campanha, escrito em linhas (`Título \| página`, `-` item, `--` subitem) |
| categoria de trilha = nome da subpasta, cor só por JSON | editar categoria (nome e cor) e mudar a faixa de categoria, na Biblioteca › Trilha |

O filtro de assunto casava só com o título da seção da página. Índice extraído pelo
servidor não tem título de seção (`s` vem vazio), então o filtro passou a olhar
também o começo do texto da página.

A abreviação do livro continua imutável depois do envio: é a chave do arquivo no
volume e do índice. Por isso ela é conferida **antes**. O backend ganhou
`PUT /api/c/{cid}/midia/{id}` com `nome` e `categoria` opcionais (antes só `publico`).

**Para a campanha original não perder os filtros**: quem usava os assuntos fixos
precisa recriá-los uma vez em Ajustes › Busca. Eram Regras e mecânicas, Rituais e
poderes, Criaturas, Personagens e fichas, e Itens.

**Capítulos vêm do sumário do próprio PDF.** `MidiaService.secoesPorPagina()` lê os
marcadores (outline) e dá a cada página o título do capítulo em que ela cai, como
`Capítulo · Subitem`. Adivinhar capítulo pelo texto foi descartado: fonte e
diagramação variam demais, e título errado atrapalha a busca mais do que título
nenhum. PDF sem marcadores fica sem capítulo, e aí o filtro de assunto olha o começo
da página. Livro enviado antes disso ganha capítulos pelo botão **reler capítulos**
(`POST /midia/{id}/reindexar`), que se recusa a tocar em índice vindo de pacote.

Um tropeço que vale lembrar: `PDDocument.getPages()` devolve um `PDPage` novo a cada
leitura, então comparar página por identidade nunca casa. Só apareceu rodando contra
um PDF de verdade; compilar não pegou.

### O que ficou de fora

- **Sessão ao vivo.** A tela de sessão ficou mais segura (nada edita por acidente),
  mas não ganhou um modo de jogo próprio. É o plano, não esquecimento.
- **Renomear faixa de trilha.** O roteiro cita a faixa pelo nome; renomear pede
  atualizar todas as cenas que a usam. Só a categoria é editável.

## Pendências e ideias

- Renomear o repositório de `campanha` para `grimorio`.
- Marcar `v1-hexatombe` (commit `bd87157`) como ponto de rollback para a versão de
  campanha única.
- `scripts/teste-front/` cobre a migração, as cinco abas, formulários, desfazer, Ajustes,
  a visão do jogador a largura no celular, a busca configurável, o índice dos livros e as
  categorias de trilha. Não cobre o envio de PDF com conferência de abreviação, arrastar card no quadro, o
  encerramento de sessão, o visor de PDF nem upload de verdade. Também não roda em CI:
  falta um workflow que suba o stub e chame o `teste.mjs`.
- Não existe teste de backend. As duas armadilhas de schema foram pegas contra um
  Postgres de verdade subido à mão, não por teste automatizado.
- O vocabulário é o que o editor em **···** › **Vocabulário** oferece, e ele itera
  `Object.keys(VOCAB_PADRAO)`. Rótulo novo que o mestre possa querer trocar precisa
  entrar lá, senão `V()` devolve a própria chave e o campo não aparece no editor.
