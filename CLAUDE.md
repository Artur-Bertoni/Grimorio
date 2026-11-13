# Grimório

Painel de mesa de RPG, agnóstico de sistema. Uma instância serve várias campanhas e
vários mestres. Spring Boot 3.3.5 / Java 21 no backend, HTML + JS puro no front,
PostgreSQL em produção e H2 em arquivo no local, deploy no Railway por Dockerfile.

O `README.md` é para quem vai subir uma instância. Este arquivo é para quem mexe no
código: é o que não dá para descobrir lendo os arquivos, e principalmente o que já
quebrou em produção. `docs/decisoes.md` guarda o histórico: de onde o projeto veio,
o que foi decidido e por quê, e o que já foi tentado e descartado. Leia quando
precisar entender uma escolha, não a cada tarefa.

## Rodar

```bash
mvn -DskipTests package     # gera target/grimorio.jar
mvn spring-boot:run         # sobe em http://localhost:8080
```

Sem `DATABASE_URL` ele cai para H2 em arquivo dentro de `./dados`. Nenhuma conta é
criada no boot: abra o site e clique em **Criar uma conta**, e a primeira vira a
administradora da instância.

Não existe suíte de testes automatizados. O que existe é descrito em "Como testar".

## Mapa do código

```
src/main/java/br/com/grimorio/
  GrimorioApplication.java
  config/     SecurityConfig, BancoConfig, MidiaAutorizacao, AjusteEsquema,
              Inicializacao, WebConfig, AppProps
  model/      Usuario, Campanha, Membro, Convite, Documento, Anotacao,
              MuralPost, Midia, Config, Papel, Rolagem, Ficha, Chamado,
              + Doc e Nota (legado)
  repo/       um repositório Spring Data por entidade
  service/    CampanhaService, DocumentoService, MidiaService, IndiceService,
              PacoteService, UsuarioService, ConfigService, IaService,
              RolagemService, SuporteService, MigracaoService
  web/        um controller por área, todos sob /api
src/main/resources/
  static/index.html   O APP INTEIRO: ~200 KB de HTML, CSS e JS num arquivo só
  static/login.html   login e cadastro
  static/vendor/      pdf.js e as fontes, para não depender de CDN
  application.yml
```

`static/index.html` não é um esqueleto com scripts separados: é o app. Um `<style>`
grande, um `<script>` grande, tudo em JS de navegador antigo (`var`, `function`, sem
módulos, sem build). Não introduza bundler, framework nem TypeScript sem combinar: o
ponto do arquivo único é que o jar sobe sem passo de build de front.

## Modelo de dados

Uma pessoa (`usuario`) é `membro` de uma ou mais `campanha`, com `papel` MESTRE ou
JOGADOR por campanha. Entra numa campanha nova por `convite` (token com papel, número
de usos e validade).

O conteúdo da campanha não é tabela: são dois documentos JSON grandes em `documento`,
com versão otimista.

- **guia** (`chave = "guia"`): tudo que é do mestre, na versão 3:
  `{versao:3, campanha:{titulo, sistema, apresentacao, secoes:[…], vocab, referencia},
  elenco:{personagens:[], npcs:[], locais:[], pistas:[]}, sessoes:[…]}`. Cada sessão
  guarda `cenas`, `territorios` e os **ids** do elenco que usa (`npcIds`, `localIds`,
  `pistaIds`). A rota exige MESTRE. Guia v2 é convertido por `migrarV3()` ao abrir, e
  os campos antigos ficam no JSON de propósito.
- **mesa** (`chave = "mesa"`): o recorte que o jogador vê. Resumos, evidências
  liberadas, quem é quem, locais, vocabulário, referência, tema, nome da IA.

O front guarda o guia na variável `D` e a mesa em `MESA`. Mexeu em `D`, chame
`save()`; mexeu em `MESA`, chame `salvarMesa()`. Os dois fazem debounce e PUT com
versão; em 409 relêem a versão e repetem uma vez.

A mesa também carrega o que o jogador precisa para as partes de jogo: `tema` (o tema
sugerido pelo mestre), `ini` (o espelho público da iniciativa, com NPC oculto virando
"???") e `fichaModelo`/`fichaFormula` (os campos e a rolagem das fichas). `aplicaMesa()`
monta `MESA` campo a campo: **chave nova na mesa precisa entrar lá**, senão some na
primeira leitura.

Arquivos ficam no volume, nunca no banco: `/data/midia/c{campanhaId}/{pdf,audio,img,indice}`.
A tabela `midia` só cataloga, e guarda o SHA-256 de cada arquivo (`hash`).

**O mesmo conteúdo ocupa o volume uma vez só.** Envio, importação de pacote e reescanear
comparam o hash; se o conteúdo já existe em qualquer campanha, o caminho novo vira um *hard
link* do antigo. Cada linha da `midia` mantém o próprio nome e caminho, então cada um vê o
nome que deu. Quem conta as referências é o sistema de arquivos: apagar um caminho tira só
aquela referência, e o conteúdo sai do disco junto com o último caminho. O boot junta, em
segundo plano, as cópias iguais que ficaram de antes. Duas regras seguram isso:

- **Nunca reescreva um arquivo de mídia no lugar** (`Files.write` num caminho existente):
  se ele for um link, a mudança aparece em todas as campanhas que o compartilham. Trocar
  arquivo é sempre gravar ao lado e mover por cima, como faz `gravarCompartilhado()`.
- Volume que não aceita hard link cai para cópia comum, com aviso no log; nada quebra, só
  não economiza.
  O boot testa o volume e escreve no log se ele aceita hard link. Isso só aparece para o
  administrador da instância (Administração › Armazenamento, via `/api/admin/sistema`); nada
  sobre compartilhamento ou espaço economizado aparece para mestre ou jogador.
- PDF repetido não é reprocessado: `copiarIndiceDoGemeo()` copia o índice de busca da cópia
  já indexada, trocando sigla, nome e `publico` para a campanha que recebe.

Antes de gravar, o servidor confere o espaço livre. Sem espaço, ainda aceita conteúdo que já
existe (o link não ocupa nada); senão responde **507** com `codigo: "armazenamento-cheio"`,
e a tela mostra `avisoArmazenamento()` com o caminho para o suporte.

**Suporte** (`/api/suporte`, Ajustes › Suporte): a mensagem é gravada na tabela `chamado`
sempre e enviada por SMTP quando ele está configurado em Administração (`smtp.*` na tabela
`config`; a senha nunca volta para o navegador). O destino padrão é `grimorio.suporte-email`.
A biblioteca de e-mail entra direto (`jakarta.mail` + `angus-mail`), sem o starter, com
versão fixa no `pom.xml`.

## Separação mestre/jogador

Isso é requisito, não detalhe. O corte é **no servidor**, nunca escondendo elemento na
tela:

- `/api/c/{cid}/guia` exige MESTRE naquela campanha.
- `MidiaAutorizacao` casa `/midia/c{id}/{pdf|audio|img}/…` contra o papel: mestre
  sempre; `img` para qualquer membro; `audio` nunca para jogador; `pdf` só se
  `Midia.publico`.
- O índice de busca é marcado por `publico` arquivo a arquivo. O jogador recebe só a
  parte pública.
- Rolagem de dado (`/api/c/{cid}/rolagens`): o servidor lê a fórmula (`2d6+3`, `2d20kh1`,
  `4d6dl1`), sorteia e decide quem vê. A de jogador segue `campanha.rolagensAbertas`; a do
  mestre, o que ele marcou na hora. Rolagem fechada de outra pessoa não sai do servidor para
  o jogador. Rolagem não vai para o mural, de propósito: ela tem o painel próprio
  (`painelRolagens()`). Pedido de teste do mestre é uma linha da mesma tabela com
  `pedido = true`.
- Ficha (`/api/c/{cid}/fichas`): o jogador só enxerga as suas; ficha de outra pessoa
  responde 404, não 403. O mestre vê e edita todas.
  O pacote leva as fichas; na importação elas entram em nome de quem importou, com o dono
  antigo entre parênteses no nome, porque as contas de outra instância não existem aqui.
- `/api/admin/**` passa por `AdminAutorizacao`, que lê `admin` e `ativo` no banco a cada pedido.
  Não use `hasRole("ADMIN")`: o papel da sessão é montado no login e a sessão dura 30 dias, então
  promover ou rebaixar alguém (pela tela ou direto no banco) só valia depois de um novo login.
- 403 sempre tem corpo com `codigo`: `csrf` (a tela pede token novo em `/api/ping` e repete o
  pedido uma vez, em `api()` e `upload()`) ou `proibido`.
- A chave da API da Anthropic fica na tabela `config` e só o servidor usa. O navegador
  nunca a recebe, nem o do mestre.

Ao mexer em qualquer rota nova que devolva conteúdo, pergunte primeiro: um jogador
pode pedir isso? Se não, exija MESTRE no controller.

## Armadilhas que já derrubaram produção

**1. `ddl-auto=update` não adiciona coluna NOT NULL em tabela que já tem linhas.**
O Postgres recusa o `alter table`, a coluna não passa a existir, e qualquer `select`
que a mencione quebra. Derrubou o login inteiro, sem mensagem na tela. Toda coluna
nova que seja NOT NULL, de qualquer tipo (boolean, texto, número), precisa de DEFAULT
explícito. Vale também para coluna nova numa entidade que o seu banco local já tem: a
tabela existe com linhas de uma versão anterior, e o aviso só aparece no log de boot:

```java
@Column(nullable = false, columnDefinition = "boolean not null default false")
private boolean admin = false;

@Column(nullable = false, length = 60, columnDefinition = "varchar(60) not null default ''")
private String formula = "";
```

Em coluna de texto, o `length` tem de repetir o tamanho do `columnDefinition`. Sem ele o
Hibernate supõe 255, vê a coluna menor no banco e tenta aumentá-la a cada boot com um
`alter column ... set data type varchar(60) not null default ''`, que é SQL inválido. O
app sobe mesmo assim, mas o log enche de erro a cada inicialização.

**2. `ddl-auto=update` não atualiza CHECK constraint existente.** O Hibernate cria
`check (tipo in ('PDF','AUDIO'))` quando a tabela nasce e nunca mais volta lá. Valor
novo no enum passa pela validação do Java e morre no banco com SQLState 23514.
`config/AjusteEsquema.java` resolve isso no boot: dropa e recria o check de cada
coluna enum a partir de `Enum.values()`. **Ao adicionar uma coluna enum nova, registre
ela lá.** Não há Flyway de propósito: migração não testada é mais arriscada que
`ddl-auto` com estas duas regras.

**3. `index.html` precisa de `<!doctype html>` e `<meta charset="utf-8">`.** Sem isso
o navegador adivinha Windows-1252, corrompe a regex de normalização de acento
(`[̀-ͯ]` em `norm()`) e o SyntaxError mata o script inteiro: tela branca
depois do login. Existe também o filtro `charsetDeTexto` em `WebConfig`.

**4. Caminho de imagem sempre passa por `IMG()`.** O guia guarda caminho relativo
(`img/foo.webp`), nunca URL. `IMG()` prefixa com `MIDIABASE` (`/midia/c{cid}/`).
Um `src` cru resolve na raiz do site e dá 404 silencioso. Foi exatamente isso que
quebrou a foto de hover dos personagens.

**5. Maven Central pode estar bloqueado em ambiente de agente.** Se `mvn` não resolver
dependência, é egress, não o `pom.xml`.

## Convenções

- **Código e comentários em português**, sem acento em identificador Java. Comentário
  explica *por que*, não *o que*: o que o código faz já está no código.
- **Nada de texto fixo de Ordem Paranormal, nem de qualquer sistema.** O app é
  universal. Rótulo que o mestre possa querer trocar passa por `V("chave")` /
  `Vm("chave")`, o vocabulário configurável. Estrutura de campanha é toda opcional:
  `normalizaCampanha()` preenche o que faltar, e uma campanha em branco abre numa tela
  de primeiros passos em vez de quebrar.
- **Tudo que aparece na tela é editável pela tela, e nada é tabela fixa no código.**
  Assuntos da busca, sinônimos, páginas certas, índice dos livros, abreviação de livro
  e categorias de trilha são dado da campanha. Precisou de uma lista de termos de um
  sistema? Ela vai para o guia, com editor, nunca para uma constante.
- **O repositório não carrega campanha, livro nem arte.** Conteúdo entra por pacote
  (`PacoteService`), um zip com `campanha.json`, `indice/*.json` e `img/*`.
- **Cores só por token CSS** (`var(--bg)`, `var(--gold)`, …). Hex fixo quebra os temas
  claros. Já aconteceu no gradiente do header. Precisa de transparência ou de um tom
  intermediário? `color-mix(in srgb, var(--blood) 20%, transparent)`, nunca `rgba()` com
  número.

## Tema, estilo e movimento

Um **tema** (`TEMAS`) é só a paleta. Cada tema aponta para um **estilo** (`ESTILOS`:
fantasia, terror, mistério, investigação, ficção científica), e é o estilo que decide a
letra dos títulos, o arredondamento, o ornamento e o fundo. `aplicarTema()` grava os
tokens e põe `data-estilo` e `data-esquema` no `<html>`.

Tudo isso mora na última folha de estilo do `index.html`, marcada `PELE`. Ela vem por
último de propósito: veste o que as folhas de cima desenharam. Regra nova de forma,
sombra, transição ou animação vai para lá; diferença entre estilos vai em
`html[data-estilo="…"]`, com os tokens `--rc` (canto de bloco), `--rb` (canto de
botão), `--gli` (glifo do ornamento, usado como máscara) e `--faixa` (a faixa do topo
dos blocos). `--rc` e `--rb` podem ter quatro valores: só servem em `border-radius`
inteiro. Tema novo é uma entrada em `TEMAS`; estilo novo é uma entrada em `ESTILOS`, um
bloco na PELE e, se a fonte for nova, os `.woff2` em `vendor/fonts` com a regra em
`vendor/fontes.css`.

Além do estilo, **cada tema tem um efeito próprio** (bloco "IMERSAO" da PELE, por
`html[data-tema="…"]`): o que acontece no bloco quando o mouse passa (sangue escorre,
vinha cresce, LED corre na borda), o desenho da barra da música (tokens `--sk-*`) e, por
estilo, a virada de página do PDF e o jeito de o dado rolar. Três convenções seguram isso:

- **O `::before` de todo bloco é do tema, o `::after` é do estilo.** "Bloco" aqui é
  `.ccard`, `.cad`, `.pc`, `.seccols>.sec-wrap`, `.caixa` e `.sbody>.blk`. Não use
  esses pseudo-elementos para outra coisa.
- **Efeito que depende do mouse** (a lanterna do Noir) é ligado por `segue:true` no tema;
  o JS só grava `--mx`/`--my` no bloco e o CSS faz o resto.

- **Nada que o efeito desenha pode vazar para cima de um bloco que mora em coluna**
  (`.seccols`, `.sbody`). O Chrome pinta errado o que sobe acima do topo de uma coluna que
  não é a primeira: o carimbo do Dossiê aparecia cortado e sem máscara só nesses blocos.
  Nos cartões (que são grade) pode vazar.

Movimento tem três regras que já evitaram defeito:

- **A entrada da página só toca quando a tela muda.** `render()` põe a classe `entra`
  no `<main>` quando a chave da tela é outra e tira no redesenho da mesma tela. Sem isso
  cada "adicionar" faria a página inteira surgir de novo.
- **Janela que fecha sai do DOM na hora.** O `Voltar` e os testes contam com isso. Quem
  desaparece devagar é uma cópia inerte (`fantasma()`, classe `ovg`, dentro de
  `#fantasmas`), sem id e sem clique.
- **Tudo desliga.** `prefers-reduced-motion` e Ajustes › Aparência › Movimento
  (`grim_fx`, `html[data-fx="off"]`) zeram animação e transição. Animação nova não pode
  terminar num estado escondido, senão quem desligou fica sem ver o elemento.

Som (`som("dado")`) é sintetizado com WebAudio, sem arquivo, e nasce ligado (`grim_som=0` desliga). Efeito de
momento (cartão de capítulo, carta de revelação, crítico na tela toda, pedido de teste) é
um elemento solto no `<body>` que se remove sozinho e, quando cobre a tela, tem
`pointer-events:none` ou fecha no clique: nunca pode travar a mesa.

O tema ativo se resolve em `temaAtivo()`: "nesta campanha sigo o mestre"
(`grim_tema_c{id}`), depois o tema pessoal (`grim_tema`), depois `MESA.tema`.

**Tour guiado** (`iniciarTour(p)`, `passosTour(p)`): um roteiro para mestre e outro para
jogador, disparado na primeira entrada com aquele papel (`grim_tour_{papel}_{id}`) e revisto em
Ajustes › Tour guiado. Cada passo é `{a: seletor, ir: troca de tela, t, x}`. Funcionalidade
nova que aparece na tela ganha um passo, e o teste anda pelos dois tours e falha se algum
seletor não achar o elemento. Atalho de teclado novo precisa respeitar `TOUR` aberto.

**Logo**: `logoSvg(c)` é a única fonte do d20. O mesmo desenho sai na marca do topo, no
login, na tela de carregamento e no favicon, que `aplicarTema()` refaz com as cores do tema.
A marca estática do HTML e o favicon padrão foram gerados por essa função: mudou o
desenho, gere de novo.

A tela de login não conhece os temas: ela lê `grim_pele` do `localStorage`, que o app
grava a cada `aplicarTema()`, e veste o último tema usado naquele aparelho.

## Como o front edita

**Tudo passa por formulário.** Não existe mais modo edição, tecla `E` nem
`contentEditable`: digitar direto na página não tinha rótulo, perdia quebra de linha
e ligava sem querer (ver `docs/decisoes.md`). Cada item tem um botão **editar** que
abre `formulario()`:

```js
formulario("Editar · npc", [
  {k:"nome", rot:"Nome", obrig:true},
  {k:"img",  rot:"Retrato", tipo:"img"},
  {k:"desc", rot:"O que a mesa pode saber", tipo:"area", dica:"…"}
], objeto, {
  salvar:  function(copia){ /* grava, save(), render() */ },
  remover: function(){ comDesfazer("Removido", function(){ /* tira da lista */ }); }
});
```

- Tipos de campo: texto (padrão), `area`, `linhas` (textarea, um item por linha, vira
  array), `num`, `sel` (`ops:[[valor,rótulo]]`), `check`, `faixa`, `img`, `imgs` e
  `grupo` (linhas repetíveis com `campos` próprios e `novo()`).
- O formulário trabalha numa **cópia**. O original só muda dentro de `salvar(copia)`.
  Fechar com mudança pendente pede confirmação.
- **Remoção não pergunta "tem certeza?": faz e oferece desfazer** (`comDesfazer`), que
  guarda o guia e a mesa inteiros por 7 segundos. A exceção é arquivo no servidor
  (Biblioteca) e apagar a campanha: aí não tem volta, então a confirmação é de verdade.
- `E(obj, chave)` continua existindo, mas é só um `esc()`.
- `escolherImagem(atual)` é o único seletor de imagem: devolve o caminho relativo,
  `""` para tirar, ou `null` se fechou sem escolher.

`render()` **não rola a tela para o topo quando redesenha a mesma tela**. Era isso que
fazia cada "adicionar" jogar a pessoa para o começo da página. Cena aberta
(`S.aberta`) e caixa aberta do painel (`S.rbox`) também sobrevivem ao redesenho.

As abas do mestre são Campanha (`home`), Sessões (`sessoes` é a lista, `sessao` é uma
aberta), Elenco, Biblioteca e Mesa; a engrenagem abre `ajustes`. Quem renderiza uma
aba nova: devolva string de HTML numa `viewX()`, ligue os eventos numa `hydrateX(v)`,
e registre as duas no `render()` e em `renderTabs()`.

As seções de Ajustes reaproveitam as funções `abrirMembros`, `abrirCampanha`,
`abrirVocabulario`, `abrirReferencia`, `abrirAdmin` e `abrirConta`: o segundo
parâmetro (`mk`) troca o overlay por `emPagina(alvo)`, que monta o mesmo HTML dentro
da página.

## Como testar

`scripts/teste-front/` tem o que existe: um stub em Node que responde os endpoints e
um roteiro de Playwright por cima, exercitando a tela de verdade num navegador. Só
precisa de Node; usa o Edge ou o Chrome que já estiver na máquina.

```bash
cd scripts/teste-front && npm install      # uma vez
node stub.mjs &
node teste.mjs                             # FOTOS=pasta grava capturas das telas
FOTOS=pasta node fotos-temas.mjs           # as telas principais em um tema de cada estilo
```

O stub gera a campanha de teste e as imagens na hora, então roda em qualquer máquina
sem conteúdo por perto. **A campanha 1 do stub nasce no formato antigo (v2) de
propósito**: é ela que prova que a migração para a v3 funciona. Mexeu no front, rode
isso antes de dar por pronto: `node --check` pega sintaxe, não pega `função is not
defined`, seletor que mudou de nome, nem imagem que não carrega. Mexeu em layout,
rode com `FOTOS=` e olhe as capturas: teste nenhum avalia se ficou bom de usar.

Cuidado ao conferir texto com `innerText`: ele devolve o texto já com o
`text-transform` do CSS aplicado, então rótulo em caixa alta só casa com regex `/i`.

SQL de schema vale testar contra um Postgres de verdade, não por leitura. As duas
armadilhas do `ddl-auto` acima foram confirmadas assim.

## Deploy

Railway, Dockerfile na raiz (ele vence o builder padrão sozinho). Duas variáveis:
`DATABASE_URL` apontando para o serviço `Postgres` e `PORT=8080`. Volume em `/data`.
`git push` na `main` reconstrói e troca sozinho; volume e banco não são tocados.

O `-Xmx512m` no Dockerfile é de propósito: sem ele a JVM enxerga o teto do plano,
assume dezenas de gigas de heap e nunca devolve memória.

Upload pelo app morre em arquivo que leve mais de 5 minutos subindo, limite do proxy
do Railway. Para livro grande: `railway volume files upload "livro.pdf"
/midia/c1/pdf/LB.pdf` e depois **Reescanear o volume** em Biblioteca › Livros › Avançado.
