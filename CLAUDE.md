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
              MuralPost, Midia, Config, Papel, + Doc e Nota (legado)
  repo/       um repositório Spring Data por entidade
  service/    CampanhaService, DocumentoService, MidiaService, IndiceService,
              PacoteService, UsuarioService, ConfigService, IaService,
              MigracaoService
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

- **guia** (`chave = "guia"`): tudo que é do mestre. `{campanha:{…}, sessoes:[…],
  trilhaCategorias:[], galeria:[]}`. A rota exige MESTRE.
- **mesa** (`chave = "mesa"`): o recorte que o jogador vê. Resumos, evidências
  liberadas, quem é quem, locais, vocabulário, referência, tema, nome da IA.

O front guarda o guia na variável `D` e a mesa em `MESA`. Mexeu em `D`, chame
`save()`; mexeu em `MESA`, chame `salvarMesa()`. Os dois fazem debounce e PUT com
versão; em 409 relêem a versão e repetem uma vez.

Arquivos ficam no volume, nunca no banco: `/data/midia/c{campanhaId}/{pdf,audio,img,indice}`.
A tabela `midia` só cataloga.

## Separação mestre/jogador

Isso é requisito, não detalhe. O corte é **no servidor**, nunca escondendo elemento na
tela:

- `/api/c/{cid}/guia` exige MESTRE naquela campanha.
- `MidiaAutorizacao` casa `/midia/c{id}/{pdf|audio|img}/…` contra o papel: mestre
  sempre; `img` para qualquer membro; `audio` nunca para jogador; `pdf` só se
  `Midia.publico`.
- O índice de busca é marcado por `publico` arquivo a arquivo. O jogador recebe só a
  parte pública.
- A chave da API da Anthropic fica na tabela `config` e só o servidor usa. O navegador
  nunca a recebe, nem o do mestre.

Ao mexer em qualquer rota nova que devolva conteúdo, pergunte primeiro: um jogador
pode pedir isso? Se não, exija MESTRE no controller.

## Armadilhas que já derrubaram produção

**1. `ddl-auto=update` não adiciona coluna NOT NULL em tabela que já tem linhas.**
O Postgres recusa o `alter table`, a coluna não passa a existir, e qualquer `select`
que a mencione quebra. Derrubou o login inteiro, sem mensagem na tela. Toda coluna
booleana nova precisa de DEFAULT explícito:

```java
@Column(nullable = false, columnDefinition = "boolean not null default false")
private boolean admin = false;
```

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
- **O repositório não carrega campanha, livro nem arte.** Conteúdo entra por pacote
  (`PacoteService`), um zip com `campanha.json`, `indice/*.json` e `img/*`.
- **Cores só por token CSS** (`var(--bg)`, `var(--gold)`, …). Hex fixo quebra os temas
  claros. Já aconteceu no gradiente do header.

## Como o front edita

Modo edição (`S.edit`, botão no topo ou tecla `E`) deixa os textos escrivíveis na
própria página:

- `E(objeto, chave)` devolve um `<span>` ligado àquele campo. Digitou, o `input`
  global grava em `objeto[chave]` e chama `save()`. Funciona com array: `E(lista, i)`.
- Controles de lista são `data-*` resolvidos em `hydrateHome()`:
  `data-add="corpos"`, `data-rm="corpos:3"`, `data-mv="corpos:3:-1"`,
  `data-img="3:pc"`, `data-fic="3"`, `data-epn="3"`. As listas editáveis estão no mapa
  `LISTAS`; item novo sai de `itemNovo()`.
- Ligar e desligar o modo edição chama `render()`, porque seção vazia e botão de
  adicionar são decididos na montagem da tela.
- `escolherImagem(atual)` abre o seletor e devolve o caminho relativo, `""` para tirar
  a imagem, ou `null` se fechou sem escolher.

Quem renderiza uma aba nova: devolva string de HTML numa `viewX()`, ligue os eventos
numa `hydrateX()`, e registre as duas no `render()`.

## Como testar

`scripts/teste-front/` tem o que existe: um stub em Python que responde os endpoints
e um roteiro de Playwright por cima, exercitando a tela de verdade num Chromium.

```bash
cd scripts/teste-front && python3 stub.py &
node teste.mjs
```

O stub gera a campanha de teste e as imagens na hora, então roda em qualquer máquina
sem conteúdo por perto. Mexeu no front, rode isso antes de dar por pronto: `node
--check` pega sintaxe, não pega `função is not defined`, seletor que mudou de nome,
nem imagem que não carrega.

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
/midia/c1/pdf/LB.pdf` e depois **Reescanear o volume** na tela de Arquivos.
