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

## Regra de trabalho: decisões são do dono

**Desvio do plano, interpretação de item ambíguo ou escolha que muda o comportamento: pergunte ao
Artur e registre a resposta aqui. Não decida sozinho** (nem "a opção mais simples"). Só o que é
detalhe de implementação sem efeito visível pode ser decidido na hora.

## Decisões do dono tomadas depois da Fase 3 (18/11/2026), aplicadas

Estas respostas revisaram os desvios das Fases 1 a 3. Estão aplicadas (ver "Aplicadas" abaixo), menos o trajeto com paredes, que é da Fase 4.

9. **Jogador edita a própria vida e marcas, e faz marcação (ping).** Revoga o desvio da Fase 3 ("só o mestre").
   Exige: o jogador alterar `vida` e `marcas` só do token dele no servidor (e no desfazer), e uma marcação
   simples visível a todos. Revisar o corte mestre/jogador (nada de desenho livre para jogador).
10. **Cena ligada ao mapa: só um atalho na cena** (botão "Abrir mapa" na cena da sessão). Não ativa o mapa
    sozinha.
11. **Vida ↔ ficha nos dois sentidos** enquanto o vínculo estiver ligado (hoje só token → ficha).
12. **Mapa no celular do mestre: continua no menu "Mais"** do topo (desvio da Fase 1 confirmado).
13. **Custo do movimento: oferecer as duas medidas, "reta" e "trajeto"**, escolhidas por mapa (hoje só a reta).
    O trajeto contorna paredes e entra na Fase 4 (servidor calcula a rota).
14. **Novo turno disparado pelo navegador do mestre: aceito como está** (o botão "Novo turno" cobre).
15. **Iniciativa ↔ token por id do combatente**, em vez do nome. A ficha da iniciativa passa a apontar para o
    token (mexe na iniciativa e no `MapaTurnos`; migrar o vínculo por nome que existe hoje).
16. **Trazer para frente / enviar para trás** dentro da camada (hoje vale a ordem da lista).
17. O passo de tour do mapa **continua na Fase 5** (não foi pedido adiantar).

### Aplicadas (18/11/2026) e como ficaram

API 284/0. A tela só foi checada com `node --check` (o dono testa); o teste de tela não foi rodado depois destas mudanças.

- **9.** Dono do token muda a própria `vida` (até o máximo) e as `marcas` (`exigeDoJogador`: vale a qualquer hora, não depende da vez; a posição continua dependendo de regra e vez). Não muda `vidaMax`, nome nem o resto; desfazer do jogador também devolve vida e marcas. Tela: duplo clique no próprio token ou lápis na lista abre `mpEditaMeuToken`. **Marcação (ping)**: ferramenta "Apontar" (tecla I, todos), `POST /mapas/{id}/ping`, evento SSE `ping`, anel de 3,5 s com o nome de quem apontou, nada gravado, no máximo 1 a cada 0,4 s por pessoa; com movimento reduzido o anel não anima.
- **10.** Botão (ícone de mapa) nas ferramentas da cena: abre o mapa cujo `cenaId` é a cena, sem ativá-lo; avisa se nenhum mapa está ligado.
- **11.** Token → ficha e ficha → token no **servidor** (`MapaService.vidaParaFicha` / `vidaDaFicha`, chamada pelo `FichaController` ao gravar). Só com `vinculo` ligado e `vidaCampo` guardado. O caminho antigo do navegador foi removido.
- **13.** (revisada em 18/11/2026) Não há configuração de medida no mapa. **A régua tem as duas opções na hora de medir**: "Reta" (arrasta de um ponto a outro) e "Trajeto" (um clique por ponto, Enter ou duplo clique termina), botões ao lado da régua. O deslocamento do turno é cobrado pelo caminho que o jogador arrastou (o navegador manda os pontos em `trajeto`, até 60), **nunca menos que a reta**; sem os pontos, a reta. **Aviso:** até as paredes (Fase 4) isso é honesto-por-navegador (um cliente adulterado paga a reta); a rota que contorna paredes, calculada no servidor, segue na Fase 4 e deve trocar este cálculo.
- **15.** A entrada da iniciativa guarda `tokenId` e o servidor usa o **id do token** (`MapaService.elencoDe` devolve o id; `MapaTurnos` compara ids de token). Formulário da iniciativa ganhou "Token no mapa"; o "Ligado ao elenco" saiu dos formulários do token; "Puxar do mapa" entra todo token. Migração: entrada antiga só com `elencoId` acha o token do mapa com o mesmo `elencoId` (na sincronização e ao puxar do mapa, onde ela ganha o `tokenId`). **Limite:** desfazer a remoção de um token recria com id novo, e a entrada fica sem token até ser religada.
- **16.** "Para a frente" / "Para trás" no painel da seleção e teclas `]` / `[`: `ItemLote.ordem`, o servidor põe o elemento acima/abaixo de tudo (`ordem`), publica o evento `ordem` e os clientes releem a lista; o desfazer devolve a ordem.
- **Encaixar na grade é do mestre e vale para todos**: `regras.encaixe` do mapa (padrão ligado, preservado quando só outras regras são editadas); o botão muda para todo mundo e o Alt, só do mestre, inverte naquele arraste. Antes era preferência por navegador (`grim_mapa_encaixe`, removida).
- **Medição de explosão removida** (o círculo faz o mesmo).
- **12, 14, 17:** nada a mudar.

Ainda sem pergunta (perguntar quando surgir): o desfazer do jogador descartar o movimento se outro token foi
movido depois; "mapa" e "ativar" não serem desfazíveis; o aviso "fog só visual" aparecer só com o fog.

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
marcação) e medição de área (cone, círculo, linha).

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
- **Fase 3: pronta (18/11/2026).** Teste de API 271/0 e teste de tela verde (seções novas "mapa: organizacao…" em cada um). `MAPA_WIP` continua ligado.

  *Pronto.*
  - **Camadas** (`MapaRegras.CAMADAS`, de baixo para cima: cenario, objetos, personagens, npcs, decoracao). Coluna `camada` já existia; token nasce em personagens (NPC em npcs, desenho em decoracao), id desconhecido cai para o padrão. O canvas desenha camada por camada (`mpOrdenados`). Esconder camada é só da tela de quem esconde (`MP.ocultas`); **trancar camada** é do mapa (`regras.trancadas`, editar só "quem move" não destranca) e vale para todos.
  - **Trava**: `bloqueado` do elemento ou camada trancada = nem o mestre mexe (409 "Está trancado", inclusive remover); o único pedido que passa num elemento trancado é `bloqueado:false`. Jogador não move token trancado (`podeMoverPelasRegras`). Cadeado desenhado só para o mestre.
  - **Seleção múltipla (só mestre)**: Shift/Ctrl soma, caixa de seleção (ferramenta Selecionar, tecla S, ou Shift+arrastar no vazio), Ctrl+A, Esc limpa. Arrastar um item da selecionada leva todos juntos; setas movem o grupo. Painel "Seleção": trancar/destrancar, mostrar/esconder, mudar de camada, remover.
  - **Operação em grupo**: `PUT /mapas/{id}/elementos` com `{itens:[{id, dados?, visivel?, bloqueado?, camada?, remover?}]}` (só mestre, até 300, tudo ou nada). Todas as linhas do histórico levam **o mesmo `seq`**: o desfazer (`desfazGrupo`) desfaz o grupo inteiro de uma vez e devolve `{…primeiro, outros:[{id, el}]}`. Sem coluna nova.
  - **Desenhos** (`tipo DESENHO`, só mestre cria/edita): linha, círculo, retângulo, polígono (clique por vértice; Enter, duplo clique ou clicar no primeiro fecha; Backspace tira o último) e marcação com texto. Dados: `forma`, `pts [[x,y]]` (até 100), `cor` (nome da paleta ouro/sangue/neutro/ok/aviso, o canvas traduz para token), `esp`, `preench` (0–0,8), `rotulo`. Encaixam nos **cantos** da grade (`mpEncaixaPonto`), Alt inverte como no token. Painel "Desenho" guarda cor/espessura/preencher/visível dos próximos; lista "Desenhos" no painel (caminho sem mouse); duplo clique ou lápis edita.
  - **Medição de área** (para todos, só na tela de quem mede, como a régua): cone, círculo, linha (1 casa de largura), explosão (raio em casas inteiras). Tecla A (menu no botão) e Enter, ou o botão do painel, **fixa o molde no mapa** como desenho (círculo, ou polígono).
  - **Marcadores no token**: `vida`/`vidaMax` (barra + número no rótulo e chip no painel), `vidaPublica`, `vidaCampo`, `marcas [{t,c}]` (até 12; condição/efeito/status com texto e faixa de cor). Jogador recebe as marcas sempre; a vida só o dono ou com `vidaPublica`. Token nascido de ficha pega a primeira barra com máximo (de preferência "vida/pv/hp") como vida inicial; com o vínculo ligado, o que o mestre muda na vida do token volta para a ficha (cliente, `mpVidaParaFicha`).
  - Atalhos novos (só mestre, exceto A): S, L, O (círculo), B (retângulo), P, M, Ctrl+A, Delete, Enter, Backspace, Esc em camadas (régua/área/rascunho primeiro, depois seleção).
  - Arquivos: novo `js/mapa-formas.js` (camadas, seleção, geometria, desenho, áreas); motor reescrito nas partes de pintura e ponteiro.

  *Desvios.*
  - Jogador **não desenha nem seleciona em grupo** e não edita a própria vida (a "marcação" de jogador ficou de fora: exigiria revisar o corte do servidor). Vida e marcas só o mestre altera.
  - A vida não sincroniza da ficha para o token depois de criado (só o caminho token → ficha, e só ao salvar o formulário do token).
  - Mover grupo de tokens não cobra deslocamento (mestre nunca é cobrado). Ordem (z) dentro da camada é a da lista; sem "trazer para frente".
  - Sem passo de tour (fica para a Fase 5, como no plano).

  *Avisos para a próxima fase.*
  - Toda mudança em lote passa por `mudaUm`/`removeUm` (têm `sobeSeq` falso nos itens do grupo). Parede e fog (`tipo()` ainda recusa) devem passar pelos mesmos pontos, e `trancado()`/`exigeSolto()` já valem para qualquer tipo.
  - `elJson` só filtra `dados` para TOKEN; desenho vai inteiro ao jogador (se um dia houver desenho secreto, usar `visivel=false`). Parede/fog precisam do próprio filtro lá.
  - `desfazRemover` recria com o `tipo` salvo; incluir o tipo novo em `tipoSalvo`.
  - A tela calcula "trancado" localmente a partir de `MP.mapa.regras.trancadas` + `bloqueado` (o servidor tem a palavra final).
  - Painel do mapa cresceu (camadas, seleção, desenho, desenhos, tokens): olhar no celular com o mestre. Não testado: Postgres (colunas não mudaram, só JSON), aparelho real, leitor de tela. `MapaService` passou de 900 linhas: se o Sonar reclamar, mover lote/desfazer para `MapaDesfazer`.

- **Fase 4a: pronta (18/11/2026).** Teste de API 309/0 e teste de tela verde (seções novas "mapa: paredes, visão e névoa" nos dois). `MAPA_WIP` continua ligado. A sessão pediu para seguir a opção mais simples sem interromper; **as escolhas marcadas com ⚠ mudam comportamento e esperam confirmação do Artur** (o plano manda perguntar).

  *Pronto.*
  - **Parede** (`tipo PAREDE`, só mestre cria/edita): `dados {kind: parede|janela|porta, aberta, pts [[x,y]…]}` (polilinha de 2 a 100 pontos, um trecho por par). Parede barra movimento e visão; janela só o movimento; porta fechada barra os dois, aberta nenhum (só porta tem `aberta`; trocar o tipo fecha). Ferramenta Parede (tecla W, um clique por ponto, Enter ou duplo clique termina, encaixa nos cantos), lista "Paredes" no painel com botão Abrir/Fechar, formulário no lápis e no duplo clique.
  - **Névoa** (`tipo FOG` = áreas, e `regras.fog` = modo): modo `nenhum` (padrão) | `manual` (só as áreas) | `visao` (áreas + visão dos tokens). Área: retângulo, círculo ou polígono, `revela` (true revela, false cobre de novo); valem na ordem da lista, a mais nova manda. Ferramenta Névoa (tecla N), painel "Paredes e névoa" (modo, "Ver como os jogadores veem", Revelar tudo / Cobrir tudo, ação e forma das próximas áreas), lista "Áreas de névoa". O mestre vê a névoa translúcida; o jogador (ou o mestre em "ver como") a vê fechada, sem os tokens que ela cobre (na tela e na lista do painel). O modo da névoa é preservado quando outras regras do mapa são editadas.
  - **Visão**: `dados.visao` do token = alcance em casas (padrão 6 quando o campo não existe, 0 é cego; campo "Alcance da visão" no formulário do token). Enxerga quem tem dono: o jogador, os tokens dele (`meu`); o mestre ("ver como"), todos os que têm dono. Polígono de visibilidade por raio (`mpPoligonoVisao`), com cache por assinatura (fontes + paredes).
  - **Colisão e rota no servidor** (`MapaParedes.java`, gêmea em `mapa-visao.js`: `mpRota`): jogador que cruza parede/janela/porta fechada paga a **rota mais curta que a contorna** (grafo de visibilidade pelos cantos, com folga de 2 px); sem rota, 409 `codigo: "parede"`. Vale com ou sem `desl` no token; o mestre nunca é barrado. O trajeto que o jogador mandou só vale se cada trecho passa livre; senão o servidor ignora e calcula a dele. **Fecha o que o plano pedia na decisão 13 ("trajeto contorna paredes")**: o custo do turno agora usa a rota. A tela mostra a rota no medidor ao arrastar ("sem caminho: há parede" quando não há) e manda os pontos dela.
  - **Linha de visão entre tokens/pontos**: a régua (reta) do mestre diz "visão livre" ou "visão bloqueada" quando o mapa tem paredes de visão.
  - Histórico, desfazer, trava e lote (mover/trancar/remover em grupo) funcionam para parede e área como para desenho; elas não contam nas camadas do painel e "Esconder" na seleção as ignora.

  *Escolhas ⚠ (confirmar).*
  - ⚠ **Parede e área de névoa chegam inteiras ao jogador** e são sempre `visivel` (o servidor ignora `visivel:false` nelas): na 4a o navegador dele calcula a visão. Isso é o "fog só visual" da decisão 1, e o aviso aparece no painel do mestre quando a névoa está ligada. **A 4b precisa tirar paredes e áreas do que vai ao jogador** (e do `elJson`/SSE), calcular visão e tiles no servidor.
  - ⚠ Três tipos de parede (parede, janela, porta) e alcance de visão padrão de 6 casas por token. Sem "luz", sem escuridão por cena.
  - ⚠ ~~Só vê o que está no alcance agora~~ → resolvido no complemento abaixo (memória do explorado, opcional por mapa).
  - ⚠ A linha de visão da régua é só do mestre (o jogador ainda não a vê).
  - ⚠ Jogador vê a lista de tokens sem os cobertos pela névoa, mas as setas do teclado e o servidor não conferem visão.

  *Avisos para a próxima fase.*
  - O servidor não sabe o que é visível: `elJson` devolve PAREDE/FOG sem filtro (`sempreVisivel`, `MapaService`). A 4b substitui isso. O corte também precisa cobrir `tokens` fora de visão se isso for requisito, e a imagem do mapa (`/midia/c{id}/img`) segue aberta a qualquer membro (aviso da fase 1).
  - `MapaParedes.rota` limita a 150 cantos (os mais perto do meio do trecho); a tela limita a 80. Mapa com muita parede pode dar rota diferente entre tela e servidor; o servidor manda.
  - Passo de tour (Parede, Névoa, visão) fica para a Fase 5. Não testado: Postgres (nenhuma coluna nova), leitor de tela, aparelho real; as capturas (`FOTOS=`) não foram olhadas.
  - O teste de tela estava defasado em dois pontos pré-existentes (seção "Seleção" e abrir a seção Camadas do painel) e foi ajustado (`abreSecao`).
  - Sonar: `getDiagnostics` só analisa arquivos abertos; `MapaRegras` foi zerado (constantes e `umaMarca`); `MapaService` (agora ~1190 linhas) e `MapaParedes` não foram abertos no editor, então não têm varredura.
- **Complemento da 4a: memória do explorado e alcance da visão na ficha (18/11/2026, a pedido do dono).** API 319/0 e tela verde.
  - **Memória** (`regras.fogMemoria`, padrão desligada; só vale com a névoa pela visão): ligada, o que um personagem já viu fica esmaecido (60% de abertura) e o resto fecha; o token em área só lembrada continua escondido, porque só aparece o que está a vista agora. Painel do mestre › Paredes e névoa: "Lembrar o que já foi explorado" e "Esquecer o explorado" (confirma, soma um em `regras.fogVer`).
  - **Alcance padrão do mapa** (`regras.visaoPadrao`, 6): campo no mesmo painel. As três regras novas o servidor preserva quando outra edição de regras não as manda (`aplicaMapa`).
  - **Alcance da visão na ficha**: campo "Alcance da visão (casas)" no formulário da ficha (`conteudo.visao`, vazio = sem alcance próprio). O servidor copia para os tokens ligados à ficha (`dados.visaoFicha`, `MapaService.visaoDaFicha`, chamado em `FichaController.gravar`, mesmo desenho da vida); o token criado a partir da ficha já nasce com ela. **Ordem do alcance** (`mpAlcanceDe`): `dados.visao` do token (campo agora pode ficar vazio; `null` tira) → `dados.visaoFicha` → `regras.visaoPadrao`. 0 é cego em qualquer um dos três.
  - ⚠ **A memória fica no navegador de cada pessoa** (`localStorage`, `grim_exp_c{campanha}_m{mapa}_{larg}x{alt}_v{fogVer}_{m|j}`, imagem de até 1024 px, grava 1,5 s depois de mudar a vista). Não acompanha a pessoa entre aparelhos e o mestre não a vê nem a apaga um a um: "Esquecer" vale para todos pela versão. Foi a opção mais simples; a 4b, que calcula a visão no servidor, deve passar a memória para lá (por mapa e jogador) junto com o corte da névoa.
  - ⚠ Cada jogador lembra só o que **o navegador dele** viu; o mestre guarda a soma dos personagens com dono (o que ele vê no "ver como").
  - ⚠ A cópia `visaoFicha` só acompanha a ficha enquanto o token está com "Ligado à ficha de origem"; ficha editada pelo PDF/IA não muda o alcance (o campo não existe lá).
  - Não verificado: capturas (`FOTOS=`) do painel com os campos novos, Postgres (sem coluna nova), aparelho real. Sonar: `getDiagnostics` sem pendências nos arquivos analisados.
- **Complemento 2 da 4a: bordas macias, fumaça e pincel de névoa (18/11/2026, a pedido do dono).** API 324/0 e tela verde (com capturas olhadas).
  - **Borda da visão macia**: o polígono de visão agora para no alcance (raios a cada 5°, sem o recorte em círculo) e o que a visão abre é pintado numa máscara e **borrado** (`ctx.filter = blur`, ~0,2 casa na tela, `mpAbertura`), com cache por vista/paredes/tokens/explorado. Navegador sem `ctx.filter` cai na borda dura, sem quebrar.
  - **Fumaça**: duas camadas de manchas macias (textura de 512 px gerada uma vez, cor do tema `--fg2`, `source-atop` só onde há névoa) deslizam devagar; intensidade baixa de propósito (0,13 e 0,09). Redesenha a 15 quadros por segundo só enquanto há névoa ligada, a aba está visível e as animações estão ligadas: some junto com Configurações › Aparência › Movimento e com o "reduzir movimento" do sistema (`mpMovimentoReduzido`).
  - **Pincel de névoa** (ferramenta, tecla **F**, só o mestre): arrastar pinta, um clique pinta um ponto; "Área de névoa nova" (revela/cobre) decide o que pinta. Painel › Paredes e névoa: diâmetro em casas, formato (redondo, quadrado, losango) e borda (macia, firme). A pincelada **não fica desenhada**: enquanto o mouse está apertado o que vai liberar fica verde (vermelho se for cobrir) e a névoa só muda ao soltar; depois só o efeito fica. **Ela não é selecionável por área, clique nem Ctrl+A** (`mpPincelada`): só pela lista "Áreas de névoa" do painel, e então o caminho tracejado aparece. Cada pincelada é um elemento FOG `forma:"traco"` (`pts` até 100, `larg` em px do mapa 4..1000, `ponta`, `suave`), que entra na ordem das áreas (a mais nova manda), no histórico, no desfazer e no "Cobrir tudo". Editar pelo formulário muda diâmetro, formato e borda. Quadrado/losango são o casco convexo da ponta em cada trecho (desenho e teste de "está a vista" usam o mesmo polígono).
  - ⚠ Escolhas: atalho F (B já era retângulo); pincelada selecionável só pelo caminho do meio, para a largura inteira não roubar o clique de quem está embaixo; a preferência do pincel não é guardada entre sessões; o traço é afinado para 100 pontos (pincelada muito longa perde detalhe, não o começo nem o fim).
  - Não verificado: aparelho de toque, mapa enorme com muitas pinceladas macias (cada uma é um borrão por quadro; se pesar, cachear a névoa estática), Safari (sem `ctx.filter` a borda fica dura).
- **Fase 4b: pronta (18/11/2026).** Teste de API 359/0 (casos novos nas seções "mapa (tabletop)" e "mapa: paredes, rota, visao e nevoa") e teste de tela verde. A aba Mapa continua sob WIP. A sessão pediu para seguir a opção mais simples sem interromper; **as escolhas marcadas com ⚠ mudam comportamento e esperam a confirmação do Artur**.

  *Pronto.*
  - **Névoa calculada no servidor, por jogador** (`MapaNevoa.java`, cálculo puro; `MapaVisao.java`, serviço). O mapa vira uma grade de casas pequenas (no máximo 512 por lado, mínimo 4 px; 2100 px dá casas de 5 px) e cada casa fica coberta, lembrada ou à vista, com as mesmas regras da tela do mestre: áreas na ordem da lista (a mais nova manda; o traço do pincel com a mesma ponta), visão dos tokens **do próprio jogador** (visíveis, alcance token → ficha → padrão do mapa, polígono com o raio a cada 5° e três por ponta de parede; parede e porta fechada barram, janela não). A vista é guardada por jogador e pelo `seq` do mapa: estado, máscara e pedaços pedidos em seguida usam a mesma conta.
  - **O que sai para o jogador** (`MapaService.estado` → `chegaAoJogador`): **parede e área de névoa nunca**; token, só o dele ou o que tem o centro numa casa à vista agora (o só lembrado não); desenho, só o que toca uma casa vista ou lembrada. Vale também com a névoa desligada (parede nunca sai). O estado do jogador ganha `vista: {modo, cel, cols, lins, png, paredes, tiles:{lado, w, h, cols, lins, v[]}}`: `png` é a máscara (data URL, branca, opaca onde vê, 60% onde lembra) e `paredes` só diz se há parede (para a tela pedir a rota).
  - **Imagem em pedaços** (`MapaTiles.java`, `GET /mapas/{id}/tile/{tx}/{ty}?v=`): pedaços de 512 px da versão de até 4096 px, cortados uma vez (lidos em faixas, sem decodificar a imagem inteira) e guardados na memória (os 4 últimos mapas). O jogador recebe o pedaço com as casas cobertas pintadas de preto (transparentes se a imagem tem transparência), alargadas em uma casa para a borda borrada; pedaço sem nada visto responde 404. `v` é a versão (vazia = nada visto, `…f` = inteiro, senão um CRC das casas vistas): igual à de agora, `Cache-Control` privado de 1 dia; diferente, `no-store`. O mestre recebe qualquer pedaço inteiro (a tela dele continua usando a imagem de 4096 px).
  - **A imagem do mapa não sai mais pela mídia para o jogador**: `mapaJson` não leva `imagem` para ele, `MidiaAutorizacao` recusa (403) o original, a miniatura e a versão de 4096 px de qualquer imagem usada por um mapa da campanha, e o catálogo (`GET /midia`) do jogador a esconde. Fecha o aviso da fase 1 (mapa não ativo lido pelo caminho).
  - **Memória do explorado no servidor** (tabela nova `mapa_explorado`: mapa, campanha, usuário, `ver`, colunas, linhas, `bits` em base64 num `varchar(60000)` com default). É a soma do que o jogador viu cada vez que o estado foi calculado para ele; "Esquecer o explorado" (`fogVer`) e mudar o tamanho do mapa recomeçam. Sai junto com o mapa e com a campanha.
  - **Tempo real**: com a névoa ligada (ou quando muda uma parede ou área), o jogador não recebe o elemento que mudou: recebe `vista {seq, mapa}` e pede o estado de novo (a tela junta vários avisos em 150 ms e espera soltar o token que está segurando). O evento `mapa` também faz o jogador reler o estado. Sem névoa, segue o evento `elemento` de antes.
  - **Rota para a tela do jogador** (`POST /mapas/{id}/rota {id, x, y, trajeto}`): o jogador não recebe as paredes, então a tela pergunta a rota que o servidor cobraria (só de token que ele pode mover; uma pergunta por vez, só quando `vista.paredes`). Resposta `{livre}`, `{semCaminho}` ou `{pts}`. A conta de rota do navegador (`mpRota`) saiu: o mestre nunca precisou dela.
  - **Tela**: o jogador desenha os pedaços (`mpPintaTiles`/`mpTile`, mostrando o pedaço antigo até o novo chegar) e a névoa a partir da máscara (`mpAberturaServidor`: esticada, borrada como a do mestre, fumaça por cima). `mpOculto` não esconde nada do jogador (o que chegou ele vê). A memória no `localStorage` ficou só para o "ver como os jogadores veem" do mestre. O aviso "a névoa é só visual" do painel virou "os jogadores recebem só o que a névoa deixa ver".
  - **Sonar**: o `MapaService` foi aberto e varrido pela primeira vez (as fases 2 a 4a não tinham conseguido): literais viraram constantes e os métodos longos foram divididos (`aplicaLote`, `publicaDesfeitos`, `turnoDe`, `zeraGasto`, `desfazPrimeiro`, `voltaDoMestre`/`voltaDoJogador`, `aplicaDoMestre`, `barraDaFicha`, `alcanceDaFicha`, `aplicaImagem`, `regrasMescladas`); `rotaPelasParedes` devolve lista vazia em vez de nulo. Também zerados os avisos antigos de `MidiaController` (`throws IOException`), `MidiaAutorizacao` e `mapa.html` (os dois grupos de botões viraram `fieldset`; `todosTrancados`/`todosVisiveis` viraram `tudoTrancado`/`tudoVisivel`, porque o Sonar lia "todo" como TODO). Problems do VS Code vazio no fim.

  *Escolhas ⚠ (confirmar).*
  - ⚠ A imagem de **qualquer** mapa da campanha (ativo ou não, com ou sem névoa) fica bloqueada ao jogador pela mídia e some do catálogo dele. Se o mestre usar o mesmo arquivo como evidência ou retrato, o jogador não o vê: precisa enviar uma cópia com outro nome (a cópia não ocupa espaço, vira hard link).
  - ⚠ Recorte por **casas de até 1/512 do lado** do mapa, não por pixel: na borda do que se vê o jogador recebe até uma casa a mais de imagem (é o que deixa a borda macia). Token aparece pelo **centro** (meio token na luz com o centro no escuro não aparece). Desenho que toca o visto chega inteiro.
  - ⚠ A memória do explorado **só grava quando o estado é calculado para o jogador** (ele com o mapa aberto): o que o token dele "viu" com a tela fechada (o mestre movendo o token) não entra.
  - ⚠ A rota pedida pela tela permite a um jogador curioso sondar onde há parede (cada pergunta diz se há caminho), o mesmo que tentar mover e ver a recusa. O ping do mestre num lugar coberto continua chegando a todos (é o mestre quem aponta).
  - ⚠ O "ver como os jogadores veem" do mestre segue calculado no navegador dele, com a memória dele no `localStorage`; ele não vê a memória que cada jogador tem no servidor.

  *Avisos para a próxima fase.*
  - **Pacote (fase 5)**: `mapa_explorado` não precisa ir no pacote (é estado de jogo de cada conta, e as contas não existem na outra instância). Imagem de mapa importada passa pelo mesmo bloqueio, porque ele olha a coluna `mapa.imagem`.
  - **Desempenho**: o corte de um mapa de 4096 px leva ~1 s na primeira vez e guarda ~5 MB na memória; a vista é refeita por jogador a cada `seq` (um token arrastado pelo mestre faz cada jogador refazer a conta e reler o estado). Com muitos jogadores e mapa enorme, medir antes de mudar; se pesar, a pirâmide de tiles da fase 5 entra em `MapaTiles` sem mexer no corte.
  - **Passo de tour** (fase 5): a névoa do jogador não tem controle novo; o do mestre continua o painel "Paredes e névoa".
  - No stub do teste de tela a máscara é toda aberta e a visão é uma conta por alto (círculo e cruzamento de parede); quem confere o corte de verdade é o teste de API. **Não verificado**: a névoa do jogador com o servidor de verdade num navegador (só no stub), Postgres (a tabela nova só rodou em H2), Safari, aparelho real, mapa com transparência.
- **Decisão do dono depois da 4b (19/11/2026), aplicada.** A parede **continua cobrando o contorno** (passa se há caminho em volta; só a sala fechada recusa) e **o mestre continua atravessando**. Mas o jogador precisa ver o contorno enquanto arrasta. Corrigido: a rota do servidor quase nunca aparecia no pontilhado (o cache dela mudava a cada meia casa arrastada e o desenho só se refazia no próximo movimento do mouse). Agora há uma pergunta por destino, e a resposta redesenha na hora o pontilhado, que segue o contorno, com o rótulo "· contornando a parede" e o custo da volta (`mpChaveRota`, `mpAplicaRota`). Teste de tela verde, com um caso novo para isso.
- **Fase 5: pronta (19/11/2026), com itens deixados de fora (abaixo).** API 366/0 e tela verde. `MAPA_WIP` continua ligado (o dono é quem libera).

  *Pronto.*
  - **Mapa no pacote** (`MapaPacote`, chamado por `PacoteService`): `campanha.json` ganha o campo "mapas" (nome, imagem, tamanho, grade, regras, cena e os elementos: token, desenho, parede e névoa). As imagens já viajavam em `img/`. Na importação o mapa entra **sempre desligado**, o token **sem dono, sem ficha e sem gasto de turno** (`fichaId`, `vinculo`, `vidaCampo`, `visaoFicha`, `usado` saem), tudo passa pelo saneamento de `MapaRegras` (grade, regras, camada, imagem só em `img/`), com tetos (50 mapas, 3000 elementos por mapa, 4000 caracteres de dados). Reimportar o mesmo pacote não duplica (mesmo nome e imagem). Histórico e `mapa_explorado` não vão.
  - **Fora dos modelos** (decisão 8): `exportar(..., comMapas=false)` ao salvar modelo (e a imagem dos mapas sai de `img/` nele) e a importação por `InputStream` (a do modelo) ignora o campo "mapas".
  - **Tour**: cinco passos do mestre (aba, novo token, mostrar aos jogadores, régua e moldes, painel) e dois do jogador (aba, régua e apontar), no fim do tour completo, só quando o mapa não está bloqueado e a campanha tem mapa a mostrar. `iniciarTour` agora lê a lista de mapas antes de montar os passos (`iniciaTour` é o que monta). Os passos do jogador não entram no tour curto.
  - Testes: API (mapas no pacote, sem dono/ficha, desligados, não duplica, fora do modelo) e tela (tour do mestre com mapa: 29 passos achando o elemento).
  - Documentação: CLAUDE.md e `docs/decisoes.md` atualizados.

  *Deixado de fora (não feito nesta sessão).*
  - **Pirâmide de tiles / medição de desempenho em mapa enorme**: não medi nem mudei (o plano só manda subir o esforço se o desempenho exigir). Segue o aviso da 4b: o corte de 4096 px leva ~1 s na primeira vez e a vista é refeita por jogador a cada `seq`.
  - **Revisão de celular e capturas `FOTOS=`**: não olhei as telas do mapa em 390/1366/2000 px (o painel cresceu nas fases 3 e 4). Fazer antes de liberar o WIP.
  - Não testado: Postgres, aparelho real, leitor de tela, Safari.
- **Revisão de usabilidade e imersão do mapa (19/11/2026, a pedido do dono).** Tela verde (teste de API não rodado: nada no servidor mudou).
  - **Cena ligada**: link discreto ao lado do nome do mapa (só mestre, só com cena ligada) abre a janela da cena por cima do mapa. ⚠ Enquanto a janela está aberta a sessão atual (`S.sessao`) passa a ser a da cena, porque a janela da cena trabalha sobre ela; volta à de antes quando a última janela de cena fecha (`mpAbreCenaLigada`).
  - **Barra do topo**: Desfazer saiu (fica nas ferramentas do canvas e no Ctrl+Z); Histórico, Novo turno, "Seguir a vez" e "Atalhos e gestos" foram para o menu ⋯ (`#mpMais`, `mpMenuMais`).
  - **Atalhos**: o rodapé de dicas saiu; botão de teclado nas ferramentas (`#mpAtalhos`) e a tecla **?** abrem a janela `t-mapa-atalhos` (só o que vale para quem olha). Os títulos dos botões trazem a tecla.
  - **Painel**: "Paredes e névoa" virou três seções (Névoa, Pincel de névoa, Paredes, esta já com a lista); textos e opções encurtados ("Desligada", "Manual", "Pela visão", com a explicação do modo embaixo). O jogador não tem mais a seção Camadas. "+ Mapa" virou `.btn.sec.m` "Novo mapa".
  - **Token oculto**: olho cortado no canto (só o mestre), além do 50% de transparência.
  - **Enquadrar**: o padrão agora **preenche** a área (corta o que sobra de um lado); o 0 e o botão ⤢ alternam com "ver o mapa inteiro" (`mpVista().modo`, `mpAlternaEnquadre`).
  - **Imersão**: token movido por outra pessoa **desliza** (260 ms; só o desenho anda, `MPD`/`mpPosNaTela`); **halo** dourado que respira no token da vez (15 quadros/s, parado com movimento reduzido); **seguir a vez** (preferência por navegador, `grim_mapa_segue`: a tela vai até o token da vez quando ela passa); **sons** sintetizados `solta`, `ping` e `porta` (`sons.js` virou a tabela `RECEITAS`); **tema no canvas**: nome e iniciais na letra de título do estilo (`--disp`), marcador sem imagem com o canto do estilo (`--rb`) e degradê `--bg4`→`--bg3`, etiqueta com canto e borda, vinheta na cor de fundo do tema por cima do mapa.
  - Testes de tela novos: barra sem Desfazer/Histórico/Novo turno, atalhos pelo botão e pela tecla ?, enquadre preenche e alterna, jogador sem Camadas e sem Novo turno no menu. O teste de seleção em caixa passou a enquadrar o mapa inteiro antes (ele mede em coordenadas do mapa).
  - Não verificado: aparelho de toque, mapa com arte de verdade (o stub gera imagem chapada), som nos navegadores, Sonar nos arquivos que não estavam abertos no editor.
- **Ajustes (19/11/2026, a pedido do dono).** API 366/0 e tela verde. "Encaixar na grade" foi para o menu ⋯ (só mestre, `mpTrocaEncaixe`); ⋯ e o ícone de ajustes do mapa ficam no fim da barra. **Defeito corrigido**: no H2 local, depois de ~30 min de servidor de pé, criar parede ou mover token dava 500 (`MAPA_ELEMENTO_TIPO_CHECK`, "database has been closed"): o check recriado pelo `AjusteEsquema` no boot fica preso à conexão que o criou, e o pool a aposenta. Reproduzido direto no H2 2.4.240; agora, no H2, o check só é removido (ver CLAUDE.md, armadilha 2). Postgres não muda.
- **Token anda pelo caminho desenhado (19/11/2026, a pedido do dono).** API 368/0 e tela verde (sem teste de tela novo: o deslize é visual). O evento SSE `elemento` ganhou `via` (pontos intermediários): o que quem moveu desenhou ao arrastar (`trajeto`) ou, para jogador, a volta pela parede que o servidor calculou (`MapaService.caminhoAndado`, só enfeite: custo e parede seguem como antes). Na tela dos outros o token desliza por esses pontos (`mpDesliza(…, via)`; duração de 260 ms a 1,8 s conforme o comprimento, entra e sai devagar). Quem moveu não precisa: o token já seguiu o mouse. O polling (sem SSE) e o desfazer não levam o caminho: ali o token vai em linha reta.
