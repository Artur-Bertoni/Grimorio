# Plano: Tabletop (mapa interativo)

Nova área do Grimório: mapa interativo com grid, tokens, medição, fog e visão, em tempo real.
Layout e jeito de usar parecidos com o quadro do mestre (`quadro.js`), mas o motor é outro:
o quadro atual é um canvas de territórios e cartões, não um mapa.

Este arquivo é o contrato entre as sessões. **Ao terminar uma fase, atualize a seção "Andamento"
no fim**: o que ficou pronto, o que mudou em relação ao plano e o que a próxima fase precisa saber.

## ⚠️ WIP: a aba Mapa está bloqueada (não tire sem ordem do dono)

Enquanto o tabletop não estiver **inteiro pronto** (todas as fases abaixo), a aba "Mapa" mostra um
grande aviso "WIP" no lugar do mapa para **todo mundo, menos quem é administrador da instância**
(o admin usa a aba livremente, para testar). O dono commita o trabalho parcial com isso ligado.

- O interruptor agora é uma opção da administração (Administração › Mapa (tabletop) › "Liberar a aba
  Mapa para todos"), gravada em `mapa.liberado` na tabela `config` (padrão: fechado) e entregue a todos
  em `/api/sessao` como `mapaLiberado`. No front, `MAPA_LIBERADO` em `static/js/mapa-dados.js`
  (`mapaBloqueado()` devolve `!MAPA_LIBERADO && !ADMIN`). O aviso é o template `t-mapa-wip` em `static/paginas/mapa.html`
  e o estilo `.mpwip` em `css/mapa.css`.
- **Nenhuma sessão de fase liga o interruptor por conta própria, nem remove o aviso.** Isso só acontece
  quando o dono disser que o tabletop está pronto (depois da Fase 5).
- O bloqueio é só de tela: a API `/api/c/{cid}/mapas` continua respondendo a qualquer membro,
  porque o corte mestre/jogador já é do servidor. Não é segurança; é para ninguém ver obra pela metade.
- Para testar a tela como jogador/mestre comum (o teste de tela usa um perfil admin no stub), o
  teste precisa de um perfil sem `admin`; ao mexer nele, mantenha o caminho do admin coberto.

## Decisões do dono (fechadas, não se refazem)

1. **Fog é segurança real.** O servidor corta o mapa em tiles e só serve as partes reveladas ao
   jogador. Até a fase 4 chegar, o fog é só visual, e isso fica dito na tela.
2. **Aba nova "Mapa"** para mestre e jogador. No celular o jogador a encontra em "Mais" (a barra
   de baixo dele já está cheia).
3. **Vários mapas por campanha**, um deles "ativo" (é o que os jogadores veem). O mestre prepara os
   outros sem eles verem. Cada mapa pode ser ligado a uma cena da sessão (opcional).
4. **Distância na diagonal configurável por mapa:** 1 por casa, alternada 1-2-1, ou euclidiana.
   Padrão 1-2-1.
5. **Token pode nascer de ficha, NPC do elenco ou avulso.** A vida é valor próprio do token, e a
   **opção de vincular à ficha vem ligada por padrão** quando o token nasce de uma ficha.
6. **Movimento configurável por mapa.** Padrão: o jogador move só o próprio token; o mestre pode
   liberar por token ou para todos. Passar do limite: aviso (padrão) ou bloqueio, por mapa.
7. **Desfazer é por pessoa.** Cada um desfaz as próprias ações; o mestre vê o histórico completo.
8. **O mapa vai no pacote exportado**, e **fica de fora dos modelos de campanha**
   (o repositório e os modelos não carregam arte).

## Arquitetura

**Dados.** Fora do guia e da mesa. Tabelas novas (toda coluna NOT NULL com DEFAULT explícito,
colunas enum registradas em `AjusteEsquema`; ver armadilhas 1 e 2 do CLAUDE.md):
- `mapa`: campanha, nome, imagem (caminho em `img/`), largura, altura, `grid` (JSON: tipo, tamanho,
  offset, opacidade, escala, unidade, regra de diagonal), `seq`, ordem, `ativo`, `cena_id` opcional,
  regras de movimento (JSON).
- `mapa_elemento`: tipo (token, desenho, parede, área de fog), camada, dono, `visivel`,
  `bloqueado`, JSON do resto.
- `mapa_historico`: log de operações (quem, quando, operação e inversa).

**Tempo real.** SSE (`SseEmitter`) para o servidor empurrar, POST de operações pequenas
(`mover token 12 → x,y`) para o cliente enviar. Cada operação ganha um `seq`. Se o SSE cair, o
cliente cai para polling por `?desde=seq`. Sem WebSocket (complica CSRF e Spring Security; a
instância é única no Railway). Heartbeat para o proxy não derrubar a conexão.

**Separação mestre/jogador.** O corte é no servidor: token oculto, parede, NPC escondido, fog e
tiles não revelados nunca saem para o jogador. Rota nova que devolve conteúdo: pergunte "um jogador
pode pedir isso?". Ficha de outra pessoa continua respondendo 404.

**Front.** Canvas 2D próprio, sem build, no padrão do projeto (`var`, `function`, scripts clássicos,
ordem das tags em `index.html`). Arquivos novos: `js/mapa-*.js`, `css/mapa.css`,
`paginas/mapa.html`, `componentes/mapa.html` (entra na lista `TEMPLATES` de `componentes.js`).
Textos pelo vocabulário `V()`. Tela nova entra em `NOME_TELA`, `TELA_DO_NOME`, `TITULO_DA_TELA`
(`rotas.js`), em `render()` e `renderTabs()`. Cores só por token CSS, escalas de `tokens.css`,
botões só as variantes de `controles.css`, tudo que abre por cima via `camadas.js`, atalhos via
`atalho()`. Alça de arrastar e lápis de editar seguem a convenção do CLAUDE.md. Funcionalidade nova
ganha passo no tour. Respeitar `prefers-reduced-motion` e `grim_fx`.

**Mapa grande.** Fase 1: o servidor gera uma versão de até 4096px (como `Miniaturas`). Fase 4/5:
pirâmide de tiles. O desenho redesenha só o que está visível. Nunca reescrever arquivo de mídia no
lugar (hard links): gravar ao lado e mover por cima.

**Integrações.** Iniciativa (`MESA.ini`, vez e rodada) zera o orçamento de movimento a cada turno.
Fichas e NPCs do elenco dão nome, retrato e vida inicial. Upload do mapa usa o pipeline de mídia
(hash, hard link, 507 sem espaço). Pacote: `PacoteService` leva mapas, elementos e imagens.

## Fases

Cada fase entrega algo que funciona sozinho e termina com os testes verdes.

**Fase 1: Fundação.** Entidades e repositórios, upload do mapa, lista de mapas e mapa ativo, tela
com pan, zoom e pinça, grid quadrado e hexagonal (tamanho, escala, opacidade, alinhamento),
tokens (arrastar, soltar, imagem própria, tamanho, rotação, nome), salvamento automático, SSE com
fallback, permissões mestre/jogador, regra "jogador move só o dele". Aba "Mapa" e rota.

**Fase 2: Movimento.** Escala e unidade (1 quadrado = 1,5 m ou 5 pés), régua entre dois pontos ou
tokens, medidor do trajeto, deslocamento máximo por token e por turno ligado à iniciativa, aviso
ou bloqueio ao passar do limite, histórico de movimentações, desfazer por pessoa, atalhos de
teclado das ferramentas e do movimento.

**Fase 3: Organização.** Camadas (cenário, objetos, personagens, NPCs, decoração), seleção
múltipla (mover e organizar em grupo), bloqueio de elemento e de camada, marcadores (vida,
condições, efeitos, status), ferramentas de desenho (linha, círculo, retângulo, polígono,
marcação) e medição de área (cone, círculo, linha, explosão).

**Fase 4: Visão.** Paredes e obstáculos (colisão e cálculo de movimento), linha de visão entre
tokens, fog of war manual e por visão, visão por jogador, tiles servidos só nas partes reveladas.

**Fase 5: Acabamento.** Desempenho em mapas muito grandes, mapa no pacote, passos no tour, teste de
API e de tela completos, revisão de celular, capturas com `FOTOS=`, atualização do CLAUDE.md
(mapa do código e modelo de dados) e do `docs/decisoes.md`.

## Sessões em paralelo?

Não recomendado. A fase 1 define o modelo de dados, o SSE e a tela que todas as outras usam: ela
roda sozinha, primeiro. Depois dela, 2, 3 e 4 mexem nos mesmos arquivos (`mapa-*.js`, o controller,
`render()`, os testes), e todas as sessões compartilham a mesma árvore de trabalho, o mesmo `target/`
e a mesma porta 8123 do teste de API: uma edição pela metade numa quebra o build da outra. Fica
sequencial: 1 → 2 → 3 → 4 → 5.

## Modelo e esforço por fase

O custo vem de duas coisas: o modelo e quanto ele relê. O critério aqui é pôr o modelo mais caro só
onde um erro custa caro: o modelo de dados, a segurança e a geometria da visão. As fases que são
mais volume do que decisão ficam no Sonnet.

| Fase | Modelo | Esforço | Plan mode | Por quê |
|---|---|---|---|---|
| 1. Fundação | Opus | `high` | sim | Define as tabelas, o SSE com Spring Security, o corte mestre/jogador e o motor do canvas que todas as outras usam. Errar aqui sai caro em todas as fases seguintes. |
| 2. Movimento | Sonnet | `high` | não | Regra de diagonal, orçamento por turno e régua são diretos. O desfazer por pessoa (operação e inversa num log compartilhado) é o único ponto delicado, e o `high` cobre. |
| 3. Organização | Sonnet | `medium` | não | É muita interface e pouca decisão: camadas, seleção, desenho e moldes de área em cima do motor que já existe. |
| 4a. Paredes e visão | Sonnet | `high` | não | Paredes, colisão, linha de visão e fog visual, tudo no cliente. É geometria conhecida (polígono de visibilidade por raio). |
| 4b. Fog seguro | Opus | `high` | sim | Tiles cortados no servidor e servidos só nas partes reveladas, visão por jogador calculada no servidor. É segurança: um vazamento aqui desmente a decisão 1. |
| 5. Acabamento | Sonnet | `medium` | não | Pacote, tour, testes, celular, capturas e documentação. Só suba para `high` se o desempenho em mapa grande exigir a pirâmide de tiles do zero. |

A fase 4 vai em duas sessões (4a e depois 4b) para o Opus entrar só na parte de segurança.
Fable e `xhigh`/`max` não são necessários em nenhuma fase.

**Para gastar menos em qualquer fase:**
- Uma sessão por fase, começando do zero (`/clear`). A seção "Andamento" é o que passa de uma para
  a outra; quanto melhor ela estiver, menos a sessão seguinte precisa explorar.
- Sem subagentes: cada um começa do zero e relê o que a sessão já sabe.
- Ler só os arquivos que a fase toca. O mapa do código no CLAUDE.md e este plano dizem onde estão.
- Plan mode (Shift+Tab) nas fases 1 e 4b: aprovar o plano antes do código evita reescrita, que é o
  que mais gasta.
- Rodar o teste de API e o de tela uma vez no fim de cada bloco de trabalho, não a cada edição.

**Para começar cada sessão** (troque N e ajuste modelo/esforço pela tabela):

```
/clear
/model opus          (ou sonnet)
/effort high         (ou medium)
Leia docs/plano-tabletop.md e execute a Fase N. Ao terminar, rode os testes e atualize a seção
"Andamento" com o que ficou pronto, os desvios do plano e os avisos para a próxima fase.
```

Para a 4a, peça "a parte do cliente da Fase 4: paredes, colisão, linha de visão e fog visual".
Para a 4b, "a parte do servidor da Fase 4: tiles só nas partes reveladas e visão por jogador".

## Andamento

(Cada fase acrescenta aqui, ao terminar: pronto, desvios do plano, avisos para a próxima.)

- **Fase 1: pronta (18/11/2026).** Teste de API 188/0 e teste de tela verde (incluem os passos novos).

  *Pronto.*
  - Tabelas `mapa`, `mapa_elemento` (`tipo` enum TOKEN/DESENHO/PAREDE/FOG, registrado em
    `AjusteEsquema`), `mapa_historico`. Toda coluna NOT NULL nova tem DEFAULT, menos os `Instant`
    (`atualizado_em`, `em`), como em `Ficha`: tabelas novas, sem linha antiga para quebrar.
  - Backend: `MapaService` (regras, transacao, trava por mapa em memoria, `seq` por mapa, historico),
    `MapaRegras` (saneamento de grid, regras e dados do token: chave desconhecida cai, numero preso
    em faixa, imagem so `img/...`), `MapaEventos` (SSE, batida de 25 s, conexao de 30 min que o
    EventSource renova, envio numa thread propria, papel conferido no banco a cada envio),
    `MapaController` em `/api/c/{cid}/mapas`. `MiniaturaController` serve `?mapa=1` (versao de ate
    4096px em `img/.mapa/`); `Miniaturas` agora le com subamostragem (nao decodifica o original
    inteiro, o que estouraria os 512 MB com mapa grande; vale tambem para a miniatura de 512).
  - Rotas: `GET /mapas` (jogador: so o ativo), `POST /mapas`, `GET|PUT|DELETE /mapas/{id}`
    (`?desde=seq` devolve `{seq, igual:true}` quando nada mudou), `POST /mapas/{id}/ativo
    {ativo}`, `POST /mapas/{id}/elementos`, `PUT|DELETE /mapas/{id}/elementos/{eid}`,
    `GET /mapas/eventos` (SSE). Eventos (`event: mapa`, JSON com `tipo`): `ola {ativo}`,
    `ativo {ativo}`, `lista` (so mestre), `mapa {seq, mapa}`, `elemento {seq, mapa, el}`,
    `some {seq, mapa, id}`.
  - Corte mestre/jogador no servidor: mapa nao ativo e 404; elemento oculto nunca sai (nem por SSE:
    mexer num token ja oculto nao manda nada ao jogador, e esconder um visivel manda so `some`);
    para o jogador saem so `x, y, tam, rot, nome, img` dos dados (sem `fichaId`, `npcId`,
    `ordem`, `bloqueado`) e o mapa sem `cenaId`. Jogador so move (so `x`/`y` sao aplicados) o
    token que e dele, o liberado (`dados.livre`) ou qualquer um com `regras.quem = "todos"`;
    o resto responde 403 (`codigo: proibido`) ou 404 (oculto).
  - Token nasce avulso, de ficha (dono = dono da ficha, `vinculo: true` por padrao; ficha de outra
    campanha e recusada) ou de NPC do elenco (nasce oculto). Nome, imagem, tamanho (meia casa a
    4x4), rotacao, quem controla, visivel e "qualquer jogador pode mover" no formulario do token.
    Remover oferece desfazer (recria o token, com outro id).
  - Front: aba "Mapa" (`#/c/{id}/mapa/{idDoMapa}`, F5 reabre o mesmo mapa), canvas 2D proprio com
    pan, zoom na roda e nos botoes, pinca, grade quadrada e hexagonal (ponta para cima) desenhada so
    na parte visivel, encaixe na casa ao soltar (Alt solta livre), tokens com imagem recortada em
    circulo, iniciais quando nao ha imagem, ponta indicando a rotacao, nome com 12px fixos. Painel
    (lista de mapas para o mestre, lista de tokens com centralizar e lapis) e o caminho sem mouse.
    Formulario do mapa: nome, imagem, grade (tipo, tamanho da casa, deslocamento x/y, opacidade),
    escala e unidade, quem move, cena ligada; apagar o mapa pede confirmacao.
  - Tempo real: SSE primeiro; sem o primeiro evento em 8 s, com 404/403 ou com 4 erros seguidos a
    tela cai para polling a cada 3 s (`?desde=seq`) e avisa no painel. Ligado so com a tela do mapa
    aberta (`render()` chama `mpDesliga()` fora dela). Reconectar ("ola") rele tudo.
  - Testes: secao "mapa (tabletop)" no teste de API (corte, SSE, faixas, 4096px, campanha apagada
    leva o mapa) e "mapa do mestre"/"mapa do jogador" no de tela. O stub tem SSE de verdade e
    `/__sse/0` para forcar o polling; `/__mapa-move-outro/3` simula outra pessoa movendo.

  *Depois da fase (pedidos do dono, mesma sessão).* Aba Mapa sob **WIP** para quem não é admin (ver
  a seção "WIP" no alto: não remover). Tokens sem círculo nem borda: imagem original inteira,
  ajustada ao quadrado do tamanho; selecionado ganha só um contorno. Mapa sem imagem tem tamanho
  editável por casas (colunas × linhas), aplicado no servidor só sem imagem (200 a 16000 px).
  Botão "Encaixar na grade" (preferência por pessoa em `grim_mapa_encaixe`, `MP.encaixa`; Alt inverte
  no arraste): desenhos e objetos futuros devem respeitá-lo. O desligamento do servidor agora fecha
  os SSE (`MapaEventos.fechaConexoes`), senão o Ctrl+C esperava 30 s.

  *Desvios do plano.*
  - No celular o **mestre** acha o Mapa no menu "Mais" do topo (`#btnMais`), nao numa aba "Mais"
    da barra: com seis abas, a regra de "4 + Mais" tiraria a Mesa da barra dele. O jogador acha na
    aba "Mais", como decidido (e a aba atual sempre entra na barra).
  - A remocao de campanha saiu do `CampanhaController` para `ApagaCampanhaService` (o controller
    tinha 12 dependencias e avisos do Sonar). Tabela nova com `campanha_id` entra la.
  - "Escala" da fase 1 foi lida como escala/unidade da casa (so guardada e editavel; a regua e da
    fase 2). A regra de diagonal ja existe no JSON da grade (`diagonal`: `1`, `121` ou `eu`,
    padrao `121`), sem campo na tela.
  - A cena ligada (decisao 3) ja tem campo no formulario e coluna, mas ainda nao faz nada alem de
    guardar.
  - Fog: nao existe ainda, entao o aviso "fog so visual" (decisao 1) nao aparece; entra com ele.

  *Avisos para a proxima fase.*
  - O historico ja grava `antes` e `depois` (JSON do elemento inteiro, ou do mapa em `mapa`) com
    `seq`, `usuario_id` e `operacao` (`criar`, `mudar`, `remover`, `mapa`). O desfazer por pessoa
    pode aplicar `antes` direto; criar desfaz removendo, remover desfaz recriando (id novo: o
    historico referencia `elemento_id` antigo, trate isso). Nao ha rota de leitura do historico.
  - Toda mudanca de elemento deve passar por `travado(mid, () -> tx.execute(...))`, subir `seq`,
    chamar `registra()` e publicar com o `Feito(e, m, eraVisivel)`. O mover do jogador e
    `MapaRegras.posicao`; o orcamento de movimento da fase 2 entra ai, no servidor.
  - O motor desenha em `mpPinta()` na ordem mapa, grade, tokens; ferramentas (regua, desenho,
    area) entram como nova camada ali e novo modo em `mpComecaArraste`. `MP.arrastando` impede que
    o eco do SSE puxe o token que a pessoa segura. Atalhos de teclado ainda nao existem (fase 2),
    nem passos no tour (fase 5).
  - `MapaElemento.tipo` aceita so TOKEN por enquanto (`MapaService.tipo()` recusa o resto);
    desenho, parede e fog precisam liberar ali. `camada` e `bloqueado` existem e nao tem tela.
  - **Para a 4b:** a imagem do mapa ainda e servida por `/midia/c{id}/img/...`, que qualquer membro
    le (inclusive um mapa nao ativo, se souber o caminho). O fog seguro precisa de rota propria de
    tiles e de tirar o caminho da imagem do JSON que vai ao jogador. O `seq` sobe tambem em
    operacao oculta; o jogador ve que algo mudou (nunca o que).
  - Nao testado: Postgres (as tabelas novas so rodaram em H2), leitor de tela, aparelho real.
  - CLAUDE.md (mapa do codigo, modelo de dados) e `docs/decisoes.md` ficam para a fase 5, como o
    plano manda. `nucleo.js` continua com os ~57 avisos antigos do Sonar (pendencia N-19 da
    auditoria; so a linha mexida foi corrigida); os arquivos novos e os demais tocados estao em zero.
- **Fase 2: pronta (18/11/2026).** Teste de API 219/0 e teste de tela verde (passos novos nas seções "mapa: movimento…" de cada um). `MAPA_WIP` continua `true`.

  *Pronto.*
  - **Distância** (`MapaMedida.java` no servidor, `mpDistCasas` em `mapa-motor.js`: a mesma conta nos dois, a do servidor é a que vale): quadrada 1 por casa (`1`), alternada 1-2-1 (`121`, padrão) ou euclidiana (`eu`); hexagonal conta passos de hexágono (`eu` em hex é linha reta). A diagonal agora tem campo no formulário do mapa. Escala e unidade (já gravadas na fase 1) passam a valer: 1 casa = `escala` `unidade`.
  - **Régua**: botão no canto do mapa (aria-pressed, fundo `--bg4`), tecla R, V volta para mover, Esc apaga. Mede de ponto a ponto ou de token a token (a ponta vai para o centro do token; fora dele, para o centro da casa se "Encaixar" está ligado, Alt inverte). Só existe na tela de quem mede: nada vai ao servidor. Clique sem arrastar apaga; botão do meio ainda arrasta o fundo.
  - **Medidor do trajeto**: ao arrastar um token aparece a linha do ponto de partida ao ponto onde ele vai cair (já com o encaixe), com "6 m · 4 casas" e, para o jogador, "restam X" ou "passa X" (vermelho + texto).
  - **Deslocamento por turno**: `dados.desl` (na unidade do mapa, 0 = sem limite; campo no formulário do token) e `dados.usado` (só o servidor escreve). O servidor desconta em `MapaService.gastaDeslocamento` a cada movimento de jogador; **o mestre nunca é barrado e não gasta**. `regras.limite`: `aviso` (padrão: move e a resposta traz `passou: true`, a tela avisa) ou `bloqueio` (409, `codigo: limite-de-movimento`, token volta). O jogador só recebe `desl`/`usado` dos tokens que pode mover (`DADOS_DE_QUEM_MOVE`). A lista do painel mostra "resta/total" como chip.
  - **Iniciativa**: `POST /mapas/turno` (só mestre, age no mapa ativo) zera o `usado` de todos. O front chama `mpNovoTurno()` no "Próximo" e no "Rolar iniciativa" (`momentos.js`); também há "Novo turno" no painel do mapa (para quando não há iniciativa rodando).
  - **Desfazer por pessoa**: `POST /mapas/{id}/desfazer {seq?}`. Sem `seq`, desfaz a última ação própria ainda não desfeita (fila de 20: criar, mudar, remover); com `seq`, aquela. Nova coluna `mapa_historico.desfeito` (boolean com default). Criar desfaz removendo; remover desfaz recriando (**id novo**, e as linhas antigas do histórico passam a apontar para ele, `trocaElemento`); mudar do mestre devolve o estado de antes (mantendo o `usado` de agora); mudar do jogador devolve só x/y e **reembolsa o custo daquele movimento**. O desfazer grava uma linha `desfazer` no histórico (que não entra na fila). O toast "Desfazer" da remoção agora usa o seq da remoção (`DELETE` devolve `{seq}` em vez de 204). Ctrl+Z na tela do mapa e botões (cantinho do mapa e painel).
  - **Histórico**: `GET /mapas/{id}/historico?limite=60` (máx. 200): o mestre vê tudo e o jogador só o que ele fez; cada linha traz quem, operação, token, `casas` andadas e se foi desfeita. Janela "Histórico" no painel, com "Desfazer" nas linhas próprias que ainda valem.
  - **Atalhos** (`atalho()`, só com a tela do mapa à vista): R régua, V mover, Esc apaga a medida, 0 enquadra, +/- zoom, setas movem o token selecionado uma casa (no hex, ↑/↓ vão para a vizinha da direita, Shift para a da esquerda), Ctrl+Z desfaz.

  - *Depois da fase (pedido do dono).* A **iniciativa aparece na tela do mapa**: o mestre ganha o botão "Iniciativa" e a barra completa (a mesma da sessão, `iniHtml`/`iniLigar`, sobre a sessão aberta ou, sem ela, a mais recente); o jogador ve o espelho da mesa em `#mIni`, que `refreshMesa()` atualiza também nessa tela. Passar a vez por ali ja zera o deslocamento.

  - *Iniciativa ↔ turno (pedido do dono, depois da fase).* **Turno = a rodada da iniciativa** (o texto "Rodada" virou "Turno", pelo vocabulário `turno`/`turnos`; **vez** continua sendo a de cada um). `MapaTurnos` guarda por campanha (tabela `config`, chave `mapa.turno.c{id}`, mais cache) se há iniciativa, o turno, de quem é a vez e os nomes na ordem; o navegador do mestre manda isso em `PUT /mapas/turno` a cada mudança da ordem (`iniMudou` → `mpSincronizaTurno`). Regras: (1) iniciativa que começa ou **volta ao topo (rodada nova)** zera o gasto de todos e é turno novo; só passar a vez não zera; (2) com iniciativa em andamento o jogador só move o token **na vez dele** (403 "Ainda não é a vez de X."); token cujo nome não está na ordem fica livre; o elo é o **nome** do token = nome na ordem (sem maiúscula nem acento); (3) o mestre nunca é barrado; (4) o servidor publica o evento SSE `turno` (`novo`, `rodada`, e o espelho público da ordem em `ini`): a tela mostra o aviso "Turno N começou" (toast + som, deduplicado por 4 s entre evento, resposta do mestre e sondagem da mesa), troca a ordem do jogador na hora e pede o estado do mapa de novo (podeMover/daVez/esperaVez). O elemento ganhou `daVez` (contorno tracejado e chip "Na vez") e `esperaVez` (aviso ao tentar arrastar). `POST /mapas/turno` continua sendo o "Novo turno" a mão (agora também avisa todo mundo). O reset deixou de acontecer a cada passada de vez: é por turno.
  - *A tela do jogador não atualizava a iniciativa sem F5:* a sondagem da mesa (6 s) já atualizava `#mIni`, mas não consegui reproduzir a falha sem navegador real; agora a ordem chega pelo SSE do mapa na hora (evento `turno` com `ini`), e a sondagem fica de reserva (e avisa o turno novo a quem está em outra aba).

  *Desvios e decisões.*
  - O trajeto cobrado é a **linha reta** do ponto de partida ao de chegada (o servidor só vê origem e destino). Dá para ficar sem custo extra contornando em vários arrastos? Não: o gasto acumula no turno. Rota com paredes é da fase 4.
  - Quem dispara o novo turno é o **navegador do mestre** (o servidor não lê a iniciativa, que mora no guia/mesa). Se o mestre avança a iniciativa com o navegador fechado ou sem rede, o gasto não zera: o botão "Novo turno" cobre.
  - O zero vale para **todos** os tokens a cada virada de vez, não só o de quem começa o turno (a ficha da iniciativa não aponta para token).
  - Desfazer de jogador é **descartado** se o token foi movido por outra pessoa depois (senão puxaria o token de volta por cima do que o outro fez); a ação descartada sai da fila e o desfazer vai para a anterior. Reenviar a mesma posição não grava histórico.
  - Operações "mapa" (editar o mapa) e "ativar" não são desfazíveis.

  *Avisos para a próxima fase.*
  - Desenho, camadas, seleção múltipla: ao criar `MapaService.tipo()` ainda só aceita TOKEN. Elemento novo que o jogador pode mover precisa passar pelo mesmo `gastaDeslocamento`/histórico; `desfazUma` só conhece criar/mudar/remover de token (um `desfazRemover` recria sempre como TOKEN).
  - Mover vários tokens de uma vez (seleção múltipla) gera uma linha de histórico por token: o Ctrl+Z desfaria um por vez; se quiser em grupo, precisa de um id de lote no histórico.
  - A régua e o medidor desenham em `mpPintaMedidas()` (depois dos tokens); as medidas de área (cone, círculo) da fase 3 podem entrar ali e reaproveitar `mpPintaTraco`/`mpDistTexto`.
  - `MP.ferramenta` ("mover"|"regua") e `mpFerramenta(f)` são o ponto de entrada para as ferramentas de desenho; `mpComecaArraste` já ramifica por ferramenta (`arr.m`: `t` token, `p` fundo, `r` régua).
  - Passo de tour (régua, deslocamento, histórico) ainda não existe (fase 5). Não testado: Postgres (coluna `mapa_historico.desfeito` tem default, mas só rodou em H2), leitor de tela, aparelho real.
  - Sonar: `getDiagnostics` do VS Code está limpo nos arquivos tocados; avisos de regra do Sonar só aparecem em arquivo aberto, então não pude varrer o `MapaService` (cresceu ~200 linhas; se o Sonar reclamar de tamanho, o desfazer/histórico pode ir para um `MapaDesfazer`).
- Fase 3: pendente
- Fase 4a (cliente): pendente
- Fase 4b (servidor): pendente
- Fase 5: pendente
