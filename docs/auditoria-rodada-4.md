# Auditoria, rodada 4 (21/11/2026): front e backend auditados, depois tudo aplicado

Escopo: a plataforma inteira depois das fases 1 a 5 do mapa e dos guias novos. Primeiro o front
foi **só auditado** (pedido do dono) e o backend **auditado, corrigido e testado**. Depois o dono
liberou aplicar o que tinha ficado como recomendação: isso está na **Parte 3**, no fim, com o que
mudou em cada achado e o que ficou de fora e por quê. A régua de acabamento é a mesma das
rodadas anteriores (Linear, Stripe, Notion, Vercel, Figma, Raycast), sem tocar na identidade
visual. As decisões já tomadas em `docs/auditoria.md` ("Decisões do dono que não se refazem") não
foram reabertas.

## Como foi medido

- **Sonda no navegador** (Edge, Playwright, contra o stub) em 18 telas × 11 larguras (320, 360, 390,
  430, 768, 820, 1024, 1280, 1366, 1440, 1920) = 198 combinações: rolagem lateral, elemento vazando
  da tela, alvo menor que 24px, controle sem nome acessível, campo sem rótulo, imagem sem `alt`,
  imagem quebrada, `h1` por tela, pulo de nível de título, texto abaixo de 12px, `title` e
  `description` da página. Telas: lista de campanhas, Campanha, Sessões, Sessão (quadro e roteiro),
  Elenco (personagens e NPCs), Biblioteca, Mesa, Mapa, Configurações (lista e Aparência), mesa do
  jogador (Resumos e Fichas), mapa do jogador, login, privacidade e 404.
- **Capturas** em 390, 1366 e 1920 de cada tela, olhadas uma a uma.
- **Inventário do CSS** (13 folhas): valores fora de token por propriedade, media queries,
  animações infinitas, filtros.
- **Teclado**: Tab desde a abertura da Campanha, foco visível a cada parada.
- **Backend**: leitura de config, segurança, controllers e serviços quentes; cada suspeita
  confirmada **no jar de verdade** com `curl` antes de entrar na lista.

Falsos positivos descartados: controles "sem nome" e "alvo pequeno" dentro de `<details>` fechado
(o Chrome esconde o conteúdo por `content-visibility`, mas a caixa continua medindo); a caixa de
marcar cena (15px visível) tem área de toque de 25px no mouse e 35px no toque (`.ckbox::after`); o
`<span>` de rodapé do login tem 18px de altura, mas é link dentro de frase (exceção do WCAG 2.5.8).

### O que a sonda mediu (resumo)

| Verificação | Resultado |
|---|---|
| Rolagem lateral / elemento vazando | **0** em 198 combinações |
| `h1` por tela | 1 em todas as telas do app; privacidade e 404 também (medidas direto no HTML) |
| Imagem sem `alt` / quebrada | 0 / 0 |
| Campo sem rótulo | 0 |
| Texto < 12px fora do quadro | 0 |
| Texto < 12px no quadro (zoom 100%) | 10px, 10,5px, 10,88px, 11,2px, 11,84px |
| Alvo < 24px (reais) | chips-botão de 23px (Liberar, Jogadores não veem, Cena 1), "Avançado" com 22px |
| Foco visível no Tab | presente em todas as paradas; "Pular para o conteúdo" existe |
| `lang`, `title` por tela | `pt-BR`; título por tela no formato "Tela · Campanha · Grimório" |
| `description` | a mesma em todas as telas (app de acesso restrito, `noindex`) |

### Inventário do CSS

| Medida | Valor | Observação |
|---|---|---|
| Media queries | 33, com **13 cortes diferentes** | 1280, 1100, 1000/999, 900/899, 860, 760, 600, 561/560, 520, 360, mais `pointer:coarse` e `hover` |
| `letter-spacing` | 111 declarações, ~25 valores | só 7 usam `--tr-caixa`/`--tr-caixa-larga` |
| `line-height` | 50 declarações, ~16 valores crus | os tokens `--lh-titulo/ui/texto` aparecem em 9 |
| `font-weight` | 43 declarações, 5 pesos (400 a 800) | sem token |
| `text-transform: uppercase` | 44 | dentro da regra (rótulo curto), salvo os casos abaixo |
| `box-shadow` fora de `--e1/2/3` | 35 | ~12 são decorativos de tema (exceção aceita); 9 estão em `controles.css` |
| `z-index` cru | 11 | todos em contexto local (quadro, sessão, efeitos) |
| Animações infinitas | 19 | as de fundo (`.atmo`) pausam após 20 s parado (`html.quieto`) |
| `filter: blur` | 13 | todos em efeito de hover de tema; `backdrop-filter`: 0 |
| Tamanho de letra fora da escala | 6, todos no quadro (`sessao.css`, `quadro.css`) | |

---

# Parte 1: front-end (auditoria, nada implementado)

Severidade: **P0** crítico, **P1** alto, **P2** médio, **P3** baixo.

### F-01 · Arquivos estáticos sem cache (já corrigido no backend)
- **Página / rota:** todas, incluindo `/paginas/login.html`
- **Componente:** entrega dos JS, CSS, templates, fontes e `vendor/pdf.min.mjs`
- **Categoria:** performance
- **Descrição:** medido no jar: todo estático saía com `Cache-Control: no-cache, no-store, max-age=0`
  (o padrão do Spring Security quando o recurso não define cache). Cada abertura do app baixava de
  novo cerca de 50 JS e CSS, 17 arquivos de template, as fontes e o pdf.js (474 KB).
- **Impacto:** o app inteiro descia de novo a cada F5, a cada link de convite aberto e a cada troca
  de aba do navegador que recarrega, o que pesa principalmente no celular, em 4G, na mesa.
- **Severidade:** P1
- **Recomendação:** feito (ver B-05): `no-cache` com `Last-Modified`, resposta 304 sem corpo.
- **Justificativa:** o tempo até a primeira interação é a métrica de percepção de velocidade mais
  sensível, e cache de recurso estático é a otimização de maior retorno disponível.

### F-02 · O pdf.js carrega na abertura para todo mundo
- **Página / rota:** todas (`index.html`, `<script type="module">` inline)
- **Componente:** `import * as pdfjs from "./vendor/pdf.min.mjs"`
- **Categoria:** performance
- **Descrição:** o import é estático, então 474 KB de JavaScript são baixados, analisados e
  compilados antes de qualquer pessoa abrir um PDF. O jogador que só usa a mesa e o mapa paga
  esse custo em toda abertura.
- **Impacto:** tempo de abertura e memória no celular; o módulo é o maior arquivo do front.
- **Severidade:** P1
- **Recomendação:** `import()` dinâmico na primeira abertura de PDF (o `CLAUDE.md` já manda usar
  `pdfjsLib` só dentro de função, então o resto do código não muda); `<link rel="modulepreload">`
  só depois do login do mestre, se fizer diferença.
- **Justificativa:** carregar sob demanda o que não é caminho crítico é a base do orçamento de
  performance; o código mais rápido é o que não roda.

### F-03 · Mapa do jogador no celular: a barra de ferramentas cobre o próprio token
- **Página / rota:** Mapa do jogador, `#/c/{id}/mapa/{mapa}` em 390px
- **Componente:** coluna de ferramentas flutuante sobre o canvas
- **Categoria:** layout / UX
- **Descrição:** na abertura, a coluna de 7 botões fica por cima do canto superior esquerdo do
  mapa. O token "Minha heroína" aparece cortado embaixo dela, com o rótulo legível pela metade
  ("Mi…eroina").
- **Impacto:** a primeira coisa que o jogador procura (o próprio personagem) está escondida pela
  interface, na superfície principal de jogo no celular.
- **Severidade:** P1
- **Recomendação:** na abertura, enquadrar o mapa descontando a área das ferramentas (padding
  igual à largura da coluna) ou centralizar no token do jogador. No celular, recolher a coluna num
  botão até o primeiro toque.
- **Justificativa:** o conteúdo vem antes do cromo da interface (princípio de "deference" da Apple
  HIG); ferramenta flutuante não pode ocupar o lugar do objeto que ela manipula.

### F-04 · Treze pontos de quebra diferentes
- **Página / rota:** sistêmico (todas as folhas)
- **Componente:** media queries
- **Categoria:** responsividade / design system
- **Descrição:** 33 media queries usando 1280, 1100, 1000, 999, 900, 899, 860, 760, 600, 561, 560,
  520 e 360 px. Há pares que dizem a mesma coisa de dois jeitos (900/899, 1000/999, 561/560) e
  cortes vizinhos sem motivo de conteúdo (860 e 900, 520 e 560).
- **Impacto:** entre 860 e 900 e entre 520 e 600 o layout muda em degraus que ninguém desenhou;
  cada tela nova escolhe um corte por conta própria.
- **Severidade:** P1
- **Recomendação:** 4 ou 5 cortes nomeados (por exemplo 360, 600, 900, 1280) documentados em
  `tokens.css` (como comentário, já que custom property não entra em `@media`) e convergir os
  outros neles, tela por tela, com captura antes e depois.
- **Justificativa:** escala de breakpoints é token como espaço e letra; sem ela a responsividade
  vira um conjunto de remendos.

### F-05 · Configurações mistura três escopos numa lista só
- **Página / rota:** Configurações, `#/c/{id}/configuracoes`
- **Componente:** navegação lateral de seções
- **Categoria:** arquitetura da informação
- **Descrição:** a mesma lista plana tem o que é **da campanha** (Campanha, Mesa e convites,
  Vocabulário, Consulta rápida, Busca), o que é **da pessoa** (Aparência, Privacidade e
  acessibilidade, Guias, Conta, Suporte) e o que é **do sistema** (Administração, Textos legais,
  Uso), sem cabeçalho de grupo.
- **Impacto:** o mestre não sabe se mudar algo afeta só ele, a mesa ou o servidor inteiro; o
  administrador acha a Administração no meio das preferências pessoais.
- **Severidade:** P1
- **Recomendação:** três grupos com rótulo curto ("Esta campanha", "Você", "Sistema") na mesma
  lista, inclusive na versão de celular (lista de seções). Sem mudar rotas.
- **Justificativa:** o modelo mental de escopo (Linear: Workspace / My account; Notion: Workspace /
  My settings) evita alteração no lugar errado, que é o erro mais caro de uma tela de ajustes.

### F-06 · Sessão: o cabeçalho muda de forma entre Quadro e Roteiro
- **Página / rota:** Sessão, `#/c/{id}/sessao/{s}` e `…/roteiro`
- **Componente:** cabeçalho da sessão
- **Categoria:** consistência / layout
- **Descrição:** no Quadro o cabeçalho é uma linha só ("‹ Sessões", título, chip, barra de ações).
  No Roteiro vira o cabeçalho grande de página (eyebrow, título de exibição, ornamento,
  descrição) e a barra de ações desce para outra posição.
- **Impacto:** alternar o modo, que é uma troca de visualização da mesma coisa, desloca todos os
  controles; quem clicou em "Roteiro" precisa reencontrar "Liberar para a mesa".
- **Severidade:** P2
- **Recomendação:** um cabeçalho só nos dois modos (o compacto, que já funciona no Quadro); a
  descrição da sessão vai para o painel ou para o topo do roteiro.
- **Justificativa:** trocar de visualização não pode trocar de layout (consistência interna,
  heurística 4 de Nielsen).

### F-07 · Sessão (Roteiro): progresso e ações soltos no grid
- **Página / rota:** `#/c/{id}/sessao/{s}/roteiro`
- **Componente:** "0/2 cenas" com barra de progresso, barra de ações
- **Categoria:** grid / hierarquia
- **Descrição:** o progresso fica alinhado à direita, acima da barra de ações e longe do título que
  ele descreve; a barra de ações flutua no meio da altura do cabeçalho, sem alinhar com a linha de
  base do título nem com a coluna das cenas.
- **Impacto:** leitura em zigue-zague; o progresso, que é a informação de estado mais útil durante
  a sessão, parece rodapé.
- **Severidade:** P2
- **Recomendação:** progresso junto do título (como o chip "Sessão 1" do Quadro), ações alinhadas
  à borda direita da coluna das cenas.
- **Justificativa:** proximidade (Gestalt): informação sobre X fica ao lado de X.

### F-08 · "+ cena" é o elemento mais fraco da tela que existe para criar cenas
- **Página / rota:** Sessão (Quadro e Roteiro)
- **Componente:** `.addbtn` tracejado
- **Categoria:** hierarquia visual
- **Descrição:** a ação central de preparo da sessão é um botão tracejado de 24px de altura, letra
  de 12px, sem preenchimento, menor que os chips ao lado.
- **Impacto:** em sessão vazia, quem abre não acha o caminho; em sessão cheia, adicionar exige
  caçar o botão no fim da lista.
- **Severidade:** P2
- **Recomendação:** sessão sem cenas mostra estado vazio com o primário "Criar a primeira cena";
  com cenas, o botão vira `.btn.sec.m` (variante existente) no fim da lista.
- **Justificativa:** peso visual proporcional à importância da ação; o tracejado comunica
  "opcional".

### F-09 · Quadro: territórios empilhados se sobrepõem
- **Página / rota:** Sessão (Quadro), 1366px
- **Componente:** `.terr` e o rótulo `.tl`
- **Categoria:** layout
- **Descrição:** na disposição padrão, o rótulo do território seguinte ("Cidade") encosta e cobre a
  borda inferior do anterior ("Abertura"); o quadro ocupa uma coluna estreita no centro com áreas
  mortas dos dois lados.
- **Impacto:** parece defeito na primeira vez que o mestre abre o quadro; a área larga da tela não
  é usada.
- **Severidade:** P2
- **Recomendação:** espaçamento mínimo entre territórios na disposição automática (altura do
  rótulo + `--s-4`) e disposição em grade horizontal quando a largura permitir.
- **Justificativa:** sobreposição sem intenção é ruído; o canvas deveria aproveitar a largura que o
  mestre tem justamente no notebook.

### F-10 · Quadro: letra abaixo do piso no zoom padrão
- **Página / rota:** Sessão (Quadro)
- **Componente:** `.cv .tbtn` (10,5px), `.cv .mini` (10px), `.card .cn` (10,88px), `.cv .addbtn`
  (11,2px), `.terr>.tl` (11,84px)
- **Categoria:** tipografia / acessibilidade
- **Descrição:** o quadro tem zoom próprio (exceção registrada), mas a letra fica abaixo dos 12px
  já no zoom de 100%, que é como ele abre.
- **Impacto:** botões e rótulos do quadro ilegíveis em notebook comum; a exceção vira regra.
- **Severidade:** P2
- **Recomendação:** no zoom 100%, nenhum texto abaixo de `--fs-1`; o zoom escala a partir daí.
- **Justificativa:** o piso de 12px é a regra do próprio projeto; a exceção era para o zoom, não
  para o estado inicial.

### F-11 · Chips que são botões ficam 1px abaixo do alvo mínimo
- **Página / rota:** Elenco › NPCs ("Liberar"), Biblioteca ("Jogadores não veem"), Sessão ("Cena 1"),
  Biblioteca ("Avançado", 22px)
- **Componente:** `.chip.btn`, `summary.sm.muted`
- **Categoria:** acessibilidade (WCAG 2.5.8)
- **Descrição:** 23px de altura, sem a área de toque invisível que `.btn.p` ganha.
- **Impacto:** no toque, erra-se o chip e acerta-se o cartão ao lado.
- **Severidade:** P2
- **Recomendação:** dar ao chip clicável o mesmo `::after` de área de toque do botão pequeno.
- **Justificativa:** WCAG 2.2, critério 2.5.8 (24×24 CSS px ou espaçamento equivalente).

### F-12 · Duas linguagens de "ligado" lado a lado na barra da sessão
- **Página / rota:** Sessão (Quadro), barra de ações
- **Componente:** "Painel" (alternância) e "Quadro | Roteiro" (segmentado)
- **Categoria:** design system / consistência
- **Descrição:** o "Painel" ligado usa caixa com borda e sublinhado dourado; o modo ativo do
  segmentado usa só sublinhado. Os dois ficam colados, e o olho lê o "Painel" como mais uma opção
  do segmentado.
- **Impacto:** não fica claro que "Painel" é independente do modo.
- **Severidade:** P2
- **Recomendação:** "Painel" como `.ibtn` com `aria-pressed` e fundo `--bg4` (a regra já escrita para
  alternância) e um separador entre ele e o segmentado.
- **Justificativa:** um estado, uma aparência; alternância e seleção exclusiva são controles
  diferentes e precisam parecer diferentes.

### F-13 · Lista de campanhas: o cartão sem capa é 60% decoração
- **Página / rota:** `#/campanhas`, 1920px
- **Componente:** cartão de campanha
- **Categoria:** densidade / hierarquia
- **Descrição:** sem capa, o cartão mostra a inicial gigante sobre um gradiente de ~280px de
  altura; a informação (nome, sistema, papel) fica espremida embaixo, e "abrir ›" em 12px repete
  o que o cartão inteiro já faz.
- **Impacto:** com 6 ou mais campanhas, a lista vira rolagem de gradientes; a coisa que diferencia
  uma campanha da outra (nome, papel, última sessão) é a menor.
- **Severidade:** P2
- **Recomendação:** sem capa, reduzir a área da imagem à metade e usar o espaço para a última
  sessão ou o próximo passo; tirar "abrir ›".
- **Justificativa:** densidade de informação adequada (Stripe, Linear): decoração tem que custar
  menos espaço que o dado.

### F-14 · Login: primário vermelho e texto que contradiz o botão ao lado
- **Página / rota:** `/paginas/login.html`
- **Componente:** botão "Entrar", frase de rodapé do cartão
- **Categoria:** consistência / UX writing
- **Descrição:** (a) o primário do login é preenchido em `--blood`, enquanto a regra do sistema é
  primário dourado; (b) "Se você é jogador, quem mestra te passa o acesso" aparece logo abaixo de
  "Criar uma conta", e o fluxo real é o jogador criar a conta pelo convite. A frase também está no
  masculino.
- **Impacto:** primeira impressão inconsistente com o app; o jogador novo fica sem saber se cria
  conta ou espera.
- **Severidade:** P2
- **Recomendação:** primário com `--gold`/`--sobre-gold` (o login já lê `grim_pele`); trocar a frase
  por "Recebeu um convite? Abra o link dele para criar sua conta já na mesa."
- **Justificativa:** o primário é a âncora do sistema visual; texto de ajuda não pode contradizer a
  ação que está do lado.

### F-15 · Escalas de entrelinha e espaçamento de letra ignoradas
- **Página / rota:** sistêmico
- **Componente:** `line-height`, `letter-spacing`
- **Categoria:** tipografia / design system
- **Descrição:** existem tokens (`--lh-titulo/ui/texto`, `--tr-caixa/-larga`), mas 41 das 50
  entrelinhas e 104 dos 111 espaçamentos de letra são valores crus (1.05, 1.2, 1.25, 1.3, 1.35,
  1.45, 1.5, 1.55, 1.6, 1.62, 1.68, 1.7…; .01em a .5em).
- **Impacto:** ritmo vertical irregular entre blocos parecidos; caixa alta com aberturas diferentes
  em cada tela.
- **Severidade:** P2
- **Recomendação:** a mesma migração já feita para letra e espaço: 3 entrelinhas, 3 espaçamentos
  (adicionar um `--tr-fino` para título), substituição folha por folha com captura.
- **Justificativa:** token que existe e não é usado é pior que nenhum: dá falsa sensação de sistema.

### F-16 · Pesos de fonte sem escala
- **Página / rota:** sistêmico · **Componente:** `font-weight` · **Categoria:** tipografia
- **Descrição:** 5 pesos (400, 500, 600, 700, 800) usados sem token; 500 aparece duas vezes.
- **Impacto:** hierarquia por peso imprevisível entre telas.
- **Severidade:** P3
- **Recomendação:** três pesos nomeados (texto, ênfase, título) por família.
- **Justificativa:** menos pesos, contraste mais legível entre eles.

### F-17 · Ícones e botões ao lado do título com tamanhos diferentes
- **Página / rota:** Campanha, Sessões, Elenco (cabeçalhos)
- **Componente:** lápis de editar (24px) e "?" do guia (32px, com caixa)
- **Categoria:** consistência
- **Descrição:** dois botões auxiliares do mesmo cabeçalho com alturas e molduras diferentes.
- **Impacto:** ruído visual no ponto de maior atenção da tela.
- **Severidade:** P3
- **Recomendação:** os dois como `.ibtn` do mesmo tamanho.
- **Justificativa:** elementos com o mesmo papel recebem o mesmo tratamento.

### F-18 · Rodapé de site comercial dentro de app de acesso restrito
- **Página / rota:** lista de campanhas, roteiro da sessão, login
- **Componente:** rodapé "© 2026 Grimório · Todos os direitos reservados"
- **Categoria:** UX writing
- **Descrição:** uma app de acesso restrito de mesa com um aviso de direitos reservados no rodapé de
  telas de trabalho.
- **Impacto:** ruído; ocupa a área inferior do roteiro.
- **Severidade:** P3
- **Recomendação:** rodapé só no login e na lista de campanhas, com Privacidade, Termos e Suporte.
- **Justificativa:** cada elemento na tela de trabalho precisa servir a tarefa.

### F-19 · Aparência: os temas mostram a mesma frase e não mostram o estilo
- **Página / rota:** Configurações › Aparência
- **Componente:** cartão de tema
- **Categoria:** UX
- **Descrição:** os 11 cartões repetem "A porta range e a sala fica em silêncio." e quatro pontos de
  cor; não se vê o canto, o ornamento nem a letra de título, que são o que o estilo muda.
- **Impacto:** escolher tema exige clicar um a um (a prévia existe, mas troca a tela inteira).
- **Severidade:** P3
- **Recomendação:** cada cartão com um mini bloco no estilo dele (faixa, canto, título na fonte).
- **Justificativa:** reconhecimento em vez de recordação (heurística 6).

### F-20 · Marcador de resumo aberto parece "fechar"
- **Página / rota:** Mesa do jogador › Resumos
- **Componente:** marcador do `<details>` aberto ("+" girado em "×")
- **Categoria:** microinteração
- **Descrição:** o "×" no canto do resumo aberto lê como "apagar" ou "dispensar".
- **Impacto:** o jogador hesita em tocar.
- **Severidade:** P3
- **Recomendação:** chevron que gira (o mesmo das seções do painel).
- **Justificativa:** ícone com significado consagrado não deve ser reaproveitado para outra ação.

### F-21 · A mesa pergunta ao servidor a cada 6 segundos
- **Página / rota:** todas dentro de campanha
- **Componente:** `sondaMesa()` (6 s) e `puxaRolagens` (6 s, 2,5 s com o painel aberto)
- **Categoria:** performance / arquitetura
- **Descrição:** cada pessoa conectada faz dois a três pedidos a cada 6 segundos, mesmo sem nada
  mudar; o mapa já tem SSE (`MapaEventos`).
- **Impacto:** com 6 jogadores, ~2 pedidos por segundo constantes; latência de até 6 s para o
  jogador ver uma evidência liberada ou o turno mudar.
- **Severidade:** P2
- **Recomendação:** um canal SSE por campanha (estender `MapaEventos`) avisando "mesa mudou" e
  "rolagem nova"; a sondagem fica como reserva, como o mapa já faz. O lado do servidor já ficou
  mais barato nesta rodada (B-08).
- **Justificativa:** a mesa é tempo real por natureza; empurrar é mais rápido e mais barato que
  perguntar.

### F-22 · Duas barras fixas embaixo na sessão do celular (decisão do dono, sem mudança)
- **Página / rota:** Sessão, 390px · **Componente:** `.sessbarra` + abas · **Categoria:** responsividade
- **Descrição:** ~110px de 780px (14%) ficam com barras fixas.
- **Severidade:** P3 · **Recomendação:** nenhuma agora; registrar o custo para quando houver teste
  com mestres no celular.
- **Justificativa:** decisão consciente; fica medido para revisitar com dado.

### Pontos fortes do front (medidos, não opinião)

- Zero rolagem lateral e zero vazamento em 198 combinações de tela e largura, inclusive no mapa e
  no quadro.
- Estrutura semântica correta em todas as telas: um `h1`, títulos sem pulo, `lang`, título por
  tela, "Pular para o conteúdo", foco visível, campos todos rotulados, imagens com `alt`.
- Design system real em controles: 4 variantes de botão em 3 alturas, uma camada de diálogos
  (`camadas.js`) e um único seletor de imagem; nenhum botão novo fora do sistema nas fases do mapa.
- Movimento disciplinado: animações de ambiente pausam com a tela parada, tudo desliga com
  `prefers-reduced-motion` ou com a preferência, nada de `backdrop-filter`.
- Contraste testado automaticamente nos 11 temas (o teste de tela falha se cair).

### Pontos fracos do front

- A escala parou na letra e no espaço: breakpoints, entrelinha, espaçamento de letra e peso
  continuam soltos (F-04, F-15, F-16).
- As telas novas de canvas (Quadro, Mapa) têm a pior qualidade de layout do app: sobreposição,
  letra abaixo do piso e ferramenta sobre conteúdo (F-03, F-09, F-10).
- Performance de carregamento era o maior problema e não aparecia em nenhum teste (F-01, F-02).

### Extra: checklist pedido

| Item | Situação |
|---|---|
| Página 404 própria | ✅ com tema e caminho de volta (`paginas/404.html`, servida pelo `TratadorDeErros`) |
| CTA acima da dobra | ✅ em todas as telas medidas; ⚠️ "+ cena" fraco (F-08) |
| Meta title por página | ✅ por tela, no formato "Tela · Campanha · Grimório" |
| Meta description por página | ⚠️ uma só para o app inteiro; sem impacto (app de acesso restrito, `noindex`) |
| Imagem Open Graph | ✅ só no login, que é o que vai em link de convite (`previa.png`); ⚠️ 199 KB, cabe em metade |
| Conjunto de favicon | ✅ ico 48, svg, 180, 192, 512 e 512 com máscara, manifest |
| robots.txt | ✅ |
| sitemap.xml | ⛔ de propósito (app de acesso restrito, `noindex`; decisão registrada) |
| `alt` em toda imagem | ✅ 0 sem `alt` nas 198 medições |
| Breakpoints de celular | ✅ funcionam; ⚠️ 13 cortes (F-04) |
| CTA fixo no celular | ✅ barra de jogo da sessão (Liberar), barra de abas |
| Estados de carregando | ✅ componente de carregando/vazio compartilhado |
| Erro de formulário | ✅ por campo (`erroCampo`) e aviso; login mostra o erro do servidor, inclusive o 429 novo |
| Página de agradecimento | ⛔ não se aplica (não há conversão; o pós-cadastro leva direto à campanha) |
| Privacidade e termos | ✅ editáveis pela administração, sem login |
| Banner de cookies | ⛔ desnecessário: só cookies estritamente necessários (sessão, CSRF e, agora, o de lembrar o login) e contagem anônima própria, sem terceiros |
| Analytics | ✅ contagem anônima própria (`metrica`), desligável pela pessoa |
| Endereço de contato real | ✅ Configurações › Suporte, com destino configurável pela administração |
| Imagens comprimidas | ✅ miniaturas de 512px geradas no servidor; ⚠️ original enviado não é recomprimido |

---

# Parte 2: backend (auditado, corrigido e testado)

A proposta do Grimório pesa em cada decisão: **o app serve várias mesas e vários
mestres**, então uma conta mal protegida expõe campanhas de outras pessoas; a mesa é **tempo real**
(rolagem, turno, mapa), então custo por pedido importa; e o **jogador está no celular**, então cada
byte da abertura importa.

## Referências consultadas

- OWASP WSTG, [Testing for Host Header Injection](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/07-Input_Validation_Testing/17-Testing_for_Host_Header_Injection),
  e PortSwigger, [Password reset poisoning](https://portswigger.net/web-security/host-header/exploiting/password-reset-poisoning):
  link de redefinição nunca a partir do cabeçalho Host; usar endereço configurado.
- OWASP, [Blocking Brute Force Attacks](https://owasp.org/www-community/controls/Blocking_Brute_Force_Attacks),
  [Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
  e WSTG, [Testing for Weak Lock Out Mechanism](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/04-Authentication_Testing/03-Testing_for_Weak_Lock_Out_Mechanism):
  limite de 5 a 10 tentativas, bloqueio de 5 a 30 minutos, combinado com outras medidas.
- Spring Security 7, [Remember-Me Authentication](https://docs.spring.io/spring-security/reference/7.0/servlet/authentication/rememberme.html):
  token assinado com SHA-256 por padrão, inválido quando a senha ou a chave mudam.
- Spring Security, [Security HTTP Response Headers](https://docs.spring.io/spring-security/site/docs/5.0.x/reference/html/headers.html):
  o `no-store` padrão vale para resposta que não define o próprio cache.
- Referência da API da Anthropic (skill `claude-api`): modelos atuais, `output_config.effort`,
  raciocínio ligado por padrão nos modelos 5.x, `stop_reason: "refusal"` e `fallbacks`.

## Achados do backend

### B-01 · Cadastro fechado aceitava qualquer convite inventado (P0, segurança) ✅
- **Onde:** `POST /api/registrar` (`SessaoController`)
- **Descrição:** com o cadastro aberto desligado, o controller só olhava se o campo `convite` vinha
  preenchido. **Confirmado no jar:** sem convite, 403; com `"convite":"inventado"`, a conta
  `intruso3` foi criada e só a entrada na campanha falhou.
- **Impacto:** a administração fecha o cadastro para manter a app de acesso restrito, e qualquer um
  criava conta mesmo assim, com acesso a tudo que é de conta logada (modelos de campanha, IA,
  suporte, armazenamento ao criar campanha).
- **Correção:** `CampanhaService.conviteValido()` é conferido **antes** de criar a conta; a recusa
  explica se o convite venceu.

### B-02 · Senha sem limite de tentativas (P1, segurança) ✅
- **Onde:** `POST /api/login`
- **Descrição:** **medido:** 12 senhas erradas seguidas, 12 respostas 401, nenhum freio.
- **Impacto:** adivinhação de senha sem custo contra qualquer conta, inclusive a da administração.
- **Correção:** `FreioDeLogin` + `service/Freio`: 5 erros por conta+IP, 30 por IP e 20 por conta (de
  qualquer IP), em 15 minutos; responde 429 `muitas-tentativas` com `Retry-After`. A contagem só
  por conta existe porque o IP vem do `X-Forwarded-For`, que o cliente pode forjar (isso foi
  confirmado no teste: um pedido com `X-Forwarded-For` próprio foi aceito). Login certo zera a conta.
  A tela de login já mostra o `erro` do servidor, então a frase aparece sem mudar o front.

### B-03 · Link de redefinição de senha montado pelo cabeçalho Host (P1, segurança) ✅
- **Onde:** `POST /api/publico/senha/esqueci`
- **Descrição:** o link do e-mail saía de `ServletUriComponentsBuilder.fromCurrentContextPath()`, e
  com `forward-headers-strategy: framework` isso também segue o `X-Forwarded-Host`.
- **Impacto:** "password reset poisoning": pedir a redefinição da conta de alguém com Host apontando
  para um site próprio faz o e-mail legítimo levar o token para lá no clique da vítima.
- **Correção:** `AppProps.urlPublicaResolvida()`: `URL_PUBLICA` ou `https://` + `RAILWAY_PUBLIC_DOMAIN`
  (que o Railway define sozinho). Só sem nenhum dos dois cai para o pedido, com aviso no log.

### B-04 · Conta desativada continuava usando a sessão por até 30 dias (P1, segurança) ✅
- **Onde:** toda a API e a mídia
- **Descrição:** só a Administração (`AdminAutorizacao`) conferia `ativo` no banco. A sessão dura 30
  dias e nada mais olhava a conta.
- **Impacto:** desativar alguém (jogador problemático, conta comprometida) não tirava o acesso a
  guia, mesa, fichas e mídia das campanhas.
- **Correção:** filtro `ContaDoPedido` na cadeia de segurança: carrega a conta uma vez por pedido,
  responde 401 `conta-desativada` e derruba a sessão se ela foi desativada ou apagada. Como bônus,
  guarda a conta no pedido e o `Atual` deixa de buscá-la no banco duas ou três vezes por pedido
  (B-09).

### B-05 · Estático com `no-store` (P1, performance) ✅
- Ver F-01. **Correção:** `spring.web.resources.cache.cachecontrol.no-cache=true` e
  `use-last-modified=true`. **Medido depois:** `Cache-Control: no-cache`, 304 com
  `If-Modified-Since`, e a API continua `no-store`. A mídia (`/midia/**`) passou de `max-age` puro
  para `max-age` + `private`, para nenhum proxy compartilhado guardar PDF ou áudio restrito.

### B-06 · Login caía a cada deploy (P1, UX e operação) ✅
- **Descrição:** a sessão mora na memória do Tomcat; cada `git push` reinicia o container e desloga
  todo mundo, apesar do "30 dias" do cookie. Numa plataforma usada em sessões semanais, isso
  significa que o mestre que publica uma correção derruba a mesa inteira no meio do jogo.
- **Correção:** remember-me do Spring Security (`GRIMORIO_LEMBRAR`), assinado com uma chave gerada
  no primeiro boot e guardada na tabela `config`. **Medido:** login, queda brusca do processo
  (`Stop-Process -Force`), novo boot, pedido só com o cookie de lembrar: 200 com a sessão do
  admin. Sem cookie: 401. Conta desativada: o cookie não reabre (401). Trocar a senha invalida os
  cookies daquela conta. Escolhido em vez de sessão persistida em disco porque sobrevive também a
  queda (sem depender de desligamento gracioso) e não precisa de tabela nova.

### B-07 · Erro de quem pediu virava 500 com stack trace (P2, robustez) ✅
- **Descrição:** o `@ExceptionHandler(Exception.class)` engolia os erros do próprio Spring MVC.
  **Medido:** JSON quebrado deu 500, `DELETE /api/ping` deu 500, cada um com "Erro nao tratado" e
  stack trace no log.
- **Impacto:** o log de produção enchia de falso defeito, e o cliente não sabia que o erro era dele.
- **Correção:** tratadores para `ErrorResponseException` e as exceções padrão (corpo ilegível, tipo
  de parâmetro, parâmetro faltando, método, tipo de conteúdo). **Medido depois:** 400, 405, 400.

### B-08 · A sondagem da mesa carregava o documento inteiro (P2, performance) ✅
- **Onde:** `GET /api/c/{cid}/mesa/versao`, chamado por cada jogador a cada 6 s
- **Descrição:** `docs.ler(...).getVersao()` trazia a coluna de conteúdo (até 10 MB por definição) só
  para ler um número.
- **Correção:** consulta só da versão (`DocumentoRepo.versaoDe`). O próximo passo é F-21 (SSE).

### B-09 · Consultas repetidas e N+1 (P2, performance) ✅
- `Atual.usuario()` buscava a conta por `lower(login)` a cada chamada (2 a 3 vezes por pedido): agora
  uma vez, no filtro.
- Administração › Contas fazia uma consulta de membros por conta: agora uma contagem agrupada.
- Membros da campanha buscavam cada conta por id: agora `findAllById`.
- O painel do sistema carregava todas as contas só para contar: agora `count`.

### B-10 · Índices que faltavam (P2, performance) ✅
- `membro(usuario_id)` (a lista "minhas campanhas" consulta por conta, e o índice único começa por
  campanha), `mural_post(campanha_id, criado_em)` (os 200 mais novos), `midia(campanha_id, tipo)`
  (a Biblioteca), `convite(campanha_id)`. O `ddl-auto=update` cria índice novo sem risco: não é
  coluna NOT NULL nem CHECK.

### B-11 · Cabeçalhos de segurança incompletos (P2, segurança) ✅
- Havia `nosniff`, `X-Frame-Options` e HSTS (atrás do proxy). Entraram `Referrer-Policy: same-origin`,
  `Permissions-Policy` (câmera, microfone, localização, pagamento, USB desligados) e uma CSP
  mínima que não muda o que a tela carrega (`object-src 'none'; base-uri 'self';
  frame-ancestors 'none'; form-action 'self'`).
- **Não feito, de propósito:** CSP com `script-src`. O petite-vue avalia expressão com `new
  Function` (exige `'unsafe-eval'`) e os templates usam `style=` inline; uma CSP de script hoje ou
  quebraria a tela ou não protegeria nada. Ver o roteiro.

### B-12 · Cadastro e "esqueci a senha" sem freio comum (P2, abuso) ✅
- Cadastro: 10 por IP por hora. "Esqueci a senha": o freio que já existia (5 por conta por hora)
  passou para o `Freio` comum, que também limpa a memória (o mapa antigo nunca esquecia uma
  conta tentada).

### B-13 · Anotações pessoais sem teto (P3, abuso) ✅
- Qualquer membro gravava megabytes por pedido em `PUT /notas`. Teto de 200 mil caracteres (~60
  páginas).

### B-14 · IA: modelo antigo e respostas cortadas em silêncio (P2) ✅
- **Descrição:** padrão `claude-sonnet-4-5`; recusa (`stop_reason: "refusal"`, que vem com 200)
  devolvia texto vazio à tela; resposta cortada no teto também.
- **Correção:** padrão `claude-sonnet-5-5` (mesma linha Sonnet, mais capaz, e mais barata: $2/$10
  contra $3/$15 por milhão de tokens). Nos modelos atuais o raciocínio vem ligado e gasta do
  `max_tokens`, então foram juntos: esforço explícito (`low` na consulta de regra, `medium` na
  leitura de ficha), teto de 6 mil e 16 mil tokens, tempo limite de 5 minutos para a ficha. A
  recusa e o corte viram frase para a pessoa. **Fallback do servidor ligado** (`fallbacks:
  "default"`, beta `server-side-fallback-2026-07-01`) nos modelos que aceitam: pergunta de regra com
  violência de ficção é o falso positivo típico de uma mesa de RPG, e assim o servidor tenta outro
  modelo em vez de recusar. Para desligar, basta escolher em Administração um modelo fora dessa
  lista. O campo de modelo vazio na Administração agora grava vazio (antes gravava o padrão por
  extenso e congelava o servidor nele).
- **Não testado contra a API de verdade** (não há chave nesta máquina). A forma do pedido segue a
  referência da API; vale uma pergunta de teste pela tela depois do deploy.

### B-15 · Dependência e manutenção ✅
- Spring Boot 4.1.2 → **4.1.3** (patch). A 4.2.0 existe; ficou para uma rodada própria, com os
  dois testes.
- Processador de configuração do Spring Boot na compilação: as propriedades `grimorio.*` passam a
  ter metadado (o aviso "Unknown property 'grimorio'" do editor some).
- `AdminController` (construtor de 10 dependências) dividido: armazenamento e saúde foram para
  `AdminSistemaController`, nas mesmas rotas.

### Achados do backend que ficam como recomendação

| ID | Achado | Sev. | Por que não agora |
|---|---|---|---|
| B-16 | Mesa e rolagens por sondagem (F-21): estender o SSE do mapa para a campanha | P2 | precisa do front, que nesta rodada não se toca |
| B-17 | CSP completa (`script-src 'self'`) | P2 | exige trocar o `new Function` do petite-vue e os `style=` inline |
| B-18 | Envio do SSE do mapa numa thread só: um cliente com a conexão travada segura os outros até o tempo limite de escrita | P2 | trocar por fila por inscrito muda o desenho de `MapaEventos`; medir antes com mesa cheia |
| B-19 | `MapaService` com 1.426 linhas e `MidiaService` com 868 | P3 | refatoração grande; cada passo com os dois testes |
| B-20 | Nenhum teste automático rodando em CI | P2 | os dois roteiros existem; falta o GitHub Actions rodar a cada push |
| B-21 | Primeira conta vira administradora sem trava contra dois cadastros simultâneos num servidor vazio | P3 | janela de segundos no primeiro boot |
| B-22 | `aceitarConvite` sem trava: dois aceites simultâneos podem passar do limite de usos | P3 | efeito: um uso a mais |
| B-23 | Mídia com `max-age` de 30 dias: imagem trocada no mesmo caminho fica velha no navegador | P3 | trocar o nome na troca, ou ETag |
| B-24 | Testar as colunas e índices novos contra Postgres | P1 | o Docker precisa ser aberto à mão nesta máquina |

## O que foi testado

- **Teste de API** (`scripts/teste-api/teste.mjs`) contra o jar novo, servidor sem contas:
  **368 de 368**.
- **Roteiro próprio de provas** contra o jar, servidor limpo: 24 de 24. Cobre: cache com 304,
  cabeçalhos, convite inventado recusado e convite real aceito, 400/405/400, versão da mesa, teto
  das anotações, freio (a sexta senha errada é barrada, `Retry-After`, outra conta segue
  entrando), conta desativada derrubada no pedido seguinte, cookie de lembrar gravado.
- **Sobrevivência a reinício**: queda brusca do processo, novo boot, sessão reaberta pelo cookie;
  sem cookie, 401; conta desativada, 401.
- **Não testado:** Postgres (B-24), a chamada real à API da Anthropic (B-14) e o teste de tela, que
  roda contra o stub e não passa pela segurança do Spring. Nenhum arquivo do front mudou.

## Arquivos do backend tocados

Novos: `config/ContaDoPedido.java`, `config/FreioDeLogin.java`, `service/Freio.java`,
`web/AdminSistemaController.java`. Alterados: `config/SecurityConfig.java`, `config/WebConfig.java`,
`config/AppProps.java`, `web/Atual.java`, `web/SessaoController.java`, `web/PublicoController.java`,
`web/TratadorDeErros.java`, `web/ConteudoController.java`, `web/AdminController.java`,
`web/CampanhaController.java`, `service/CampanhaService.java`, `service/DocumentoService.java`,
`service/IaService.java`, `repo/DocumentoRepo.java`, `repo/MembroRepo.java`, `model/Membro.java`,
`model/MuralPost.java`, `model/Midia.java`, `model/Convite.java`, `application.yml`, `pom.xml`,
`README.md` (variável `URL_PUBLICA`), `CLAUDE.md` (regras novas).

---

# Relatório final

## 1. Resumo executivo

O front está estruturalmente sólido: nenhuma quebra de layout em 198 medições, semântica e foco
corretos, um sistema de controles respeitado até nas fases novas. O que o separa do padrão
enterprise está em três frentes: **escala incompleta** (13 breakpoints, entrelinha e
espaçamento de letra fora dos tokens), **telas de canvas** (Quadro e Mapa) com o pior acabamento do
app, e **carregamento** (app inteiro sem cache e pdf.js para todos). O backend tinha um **furo
crítico** (cadastro fechado contornável) e quatro altos (senha sem freio, link de redefinição
envenenável, conta desativada que não perdia acesso, login derrubado a cada deploy), todos
**corrigidos e provados contra o jar** nesta rodada, junto com cache, erros, consultas, índices e a
integração com a IA.

## 2. Principais problemas

1. B-01 cadastro fechado contornável (P0, corrigido)
2. B-02, B-03, B-04 conta e senha (P1, corrigidos)
3. F-01/B-05 estático sem cache (P1, corrigido) e F-02 pdf.js eager (P1, aberto)
4. B-06 login que cai a cada deploy (P1, corrigido)
5. F-03 ferramentas do mapa sobre o token no celular (P1, aberto)
6. F-04 treze breakpoints (P1, aberto)
7. F-05 escopos misturados em Configurações (P1, aberto)

## 3. Pontos fortes

- Responsividade sem quebra em qualquer largura medida, de 320 a 1920.
- Acessibilidade estrutural (títulos, rótulos, foco, contraste testado nos 11 temas).
- Separação mestre/jogador feita no servidor, com teste de API cobrindo cada corte (368 checagens).
- Backend enxuto e coerente: um documento JSON versionado por papel, mídia deduplicada por hash,
  importação de pacote protegida contra zip slip e bomba de imagem, SSE com conferência de papel a
  cada envio.

## 4. Pontos fracos

- Escalas tipográficas e de breakpoint só parcialmente adotadas.
- Canvas (Quadro, Mapa) abaixo do resto do app em layout e legibilidade.
- Tempo real por sondagem fora do mapa.
- Nenhum teste rodando em CI; Postgres testado à mão.

## 5. Ranking de prioridades (o que falta)

1. F-02 pdf.js sob demanda
2. F-03 enquadramento do mapa no celular
3. F-05 grupos em Configurações
4. B-24 rodar o teste de API contra Postgres
5. F-04 convergir breakpoints
6. F-21/B-16 SSE da campanha
7. B-20 CI com os dois testes
8. F-06 a F-12 acabamento da Sessão e dos chips
9. F-15/F-16 entrelinha, espaçamento de letra, pesos
10. F-13, F-14, F-17 a F-20

## 6. Quick wins (menos de uma hora cada)

- F-02: `import()` dinâmico do pdf.js.
- F-11: área de toque do chip clicável (uma regra em `controles.css`).
- F-14: primário dourado e frase nova no login.
- F-17: lápis e "?" do cabeçalho no mesmo tamanho.
- F-20: chevron no resumo.
- F-05: três rótulos de grupo na lista de Configurações.

## 7. Problemas estruturais

- Tempo real por sondagem (F-21/B-16).
- CSP completa bloqueada pelo motor de template (B-17).
- SSE com envio sequencial (B-18).
- Serviços grandes demais (B-19).

## 8. Problemas sistêmicos

- Escala de breakpoints inexistente (F-04).
- Tokens de entrelinha e espaçamento de letra existentes e não usados (F-15).
- Exceção do quadro aplicada ao estado inicial (F-10).

## 9. Roteiro de correção

| Etapa | Conteúdo | Teste |
|---|---|---|
| 1 (feito) | Backend: B-01 a B-15 | API 368/368, provas 24/24, reinício |
| 2 | Postgres: teste de API contra `docker run postgres` (B-24); deploy | API contra Postgres |
| 3 | Quick wins do front (F-02, F-05, F-11, F-14, F-17, F-20) | teste de tela + capturas 390/1366/1920 |
| 4 | Canvas: F-03, F-09, F-10 | capturas do mapa e do quadro em 390 e 1366 |
| 5 | Sessão: F-06, F-07, F-08, F-12 | teste de tela + capturas |
| 6 | Escalas: F-04, F-15, F-16, folha por folha | capturas antes e depois em 4 temas |
| 7 | Tempo real: SSE da campanha (F-21/B-16), depois B-18 | teste de tela + teste de API |
| 8 | CI (B-20), CSP completa (B-17), refatorações (B-19) | os dois testes no Actions |

## 10. Notas (0 a 10)

As notas do front comparam com o fim da rodada 3 (entre parênteses). Elas caíram porque esta
rodada mediu coisas que as anteriores não mediam (cache, carregamento, escalas além de letra e
espaço) e porque as telas de canvas entraram depois.

| Categoria | Nota | Justificativa técnica |
|---|---|---|
| UX | **7,5** (9,0) | fluxos claros e endereço por tela; perde pelo mapa no celular (F-03), pela mistura de escopos em Configurações (F-05) e pelo cabeçalho que muda na Sessão (F-06) |
| UI | **7,5** (8,5) | identidade forte e aplicada com cuidado nas telas de leitura; Quadro e Mapa com sobreposição, letra abaixo do piso e dead space (F-09, F-10), primário inconsistente no login (F-14) |
| Design System | **7,5** (8,5) | controles, camadas e escalas de letra e espaço exemplares; breakpoints, entrelinha, espaçamento de letra e peso fora do sistema (F-04, F-15, F-16) |
| Consistência | **7,5** (8,5) | duas linguagens de estado na mesma barra (F-12), cabeçalhos diferentes para a mesma tela (F-06), botões auxiliares desiguais (F-17) |
| Motion | **8,5** (8,5) | tempo e curva em token, pausa com a tela parada, tudo desligável; sem regressão |
| Responsividade | **8,0** (9,0) | zero quebra em 198 medições; perde pelos 13 cortes e pelo canvas no celular |
| Acessibilidade | **8,0** (8,5) | semântica, foco, rótulos e contraste corretos; chips de 23px e letra de 10px no quadro. Sem leitor de tela real nem aparelho real, 10 não se afirma |
| Performance visual | **7,0** (8,0) | antes da correção do cache seria 5; pdf.js eager e sondagem a cada 6 s seguram a nota. Efeitos de tema baratos (sem `backdrop-filter`, ambiente pausado) |
| Qualidade enterprise (front) | **7,5** (8,5) | acabamento de produto sério nas telas de leitura; canvas, escalas e carregamento ainda abaixo da régua |

Backend (primeira rodada medida; antes → depois desta rodada):

| Categoria | Antes | Depois | Justificativa técnica |
|---|---|---|---|
| Segurança | 5,0 | **8,5** | P0 e três P1 fechados e provados; falta CSP completa (B-17) e Postgres testado |
| Performance | 6,0 | **8,0** | cache, consultas, N+1 e índices resolvidos; falta trocar a sondagem por SSE (B-16) |
| Robustez e operação | 6,5 | **8,5** | erros com o status certo, login que sobrevive a deploy e queda; falta CI (B-20) |
| Manutenibilidade | 7,0 | **7,5** | serviços menores onde se tocou, Sonar zerado nos arquivos tocados que o editor analisou; `MapaService` e `MidiaService` seguem grandes |
| Qualidade enterprise (backend) | 6,0 | **8,0** | o que falta não é código desta rodada: Postgres, CI e o SSE da campanha |

---

# Parte 3: o que ficou como recomendação, aplicado (21/11/2026, mesmo dia)

O dono pediu para aplicar tudo o que tinha ficado só no papel. Cada item abaixo diz o que mudou;
a tabela do fim diz o que **não** foi feito.

## Front

| ID | O que mudou |
|---|---|
| F-02 | O pdf.js sai do `index.html` e só desce na primeira abertura de PDF: `carregaPdfjs()` em `js/pdf.js` (`import()` dinâmico, worker apontado). Leitor de PDF e importação de ficha esperam por ele. |
| F-03 | Enquadrar o mapa desconta a coluna de ferramentas (`mpLarguraDasFerramentas`); na abertura, o jogador com token é centralizado nele (`mpCentralizaNoMeu`). Conferido em 390 e 1366. |
| F-04 | 13 cortes viram 4: 360, 600, 900, 1280, sempre `max-width`, com a escala comentada em `tokens.css`. O JS segue o mesmo (`innerWidth<=900`). Configurações vira lista até 900 (era 1000) e a barra de jogo da sessão aparece até 900 (era 860), junto da barra de abas. |
| F-05 | Configurações em três grupos com rótulo: Esta campanha, Você, Sistema (`menuAjustes`), também na lista do celular. Rotas iguais. |
| F-06, F-07 | Roteiro usa o mesmo cabeçalho compacto do Quadro (voltar, título, ?, chip da sessão, progresso, ações à direita). O resumo da sessão desce para o topo da coluna de cenas. |
| F-08 | Sessão sem cena: estado vazio com o primário "Criar a primeira cena". Com cenas: `.btn.sec.m` "+ Cena" no fim da lista. |
| F-09 | Território que ninguém arrastou é automático: depois de medido desce até ficar 24px abaixo do de cima (`desempilha`, não gravado, acompanha o crescimento). Guias antigos com a posição padrão gravada contam como automáticos. |
| F-10 | No quadro, nada abaixo de 12px no zoom 100% (chips, botões, rótulo do território, número da cena). |
| F-11 | Chip que é botão com 24px de desenho e área de toque invisível; `summary.sm` com 24px. |
| F-12 | Separador entre "Painel", o segmentado Quadro/Roteiro e as ações. |
| F-13 | Sem capa, a área da inicial cai à metade (32:9) e "abrir ›" saiu. |
| F-14 | Login com primário dourado (`--gold`/`--sobre-gold`, inclusive na pele guardada) e a frase "Recebeu um convite? Abra o link dele para criar sua conta já na mesa." |
| F-15, F-16 | 173 valores crus viram token: `--lh-titulo/ui/texto/solida`, `--tr-fino/caixa/caixa-larga`, `--fw-texto/enfase/titulo`. Os pesos rendem igual porque as fontes carregadas só têm alguns pesos. De fora, de propósito: `h1.page`, o quadro (`.cv`, `.terr`, `.card`) e o cartão de capítulo. |
| F-17 | Lápis e "?" ao lado do título com o mesmo tamanho e alinhamento. |
| F-18 | Sem "Todos os direitos reservados" em lugar nenhum; o rodapé (privacidade, termos, suporte) só aparece fora de uma campanha. Os guias apontam o Suporte em Configurações. |
| F-19 | Cada cartão de tema mostra um mini bloco no estilo dele (canto e faixa do topo) com o nome do estilo, no lugar da frase repetida. |
| F-20 | O "+" girado em "×" do resumo virou um chevron que vira para cima. |
| F-21 | Ver B-16. |

## Backend

| ID | O que mudou |
|---|---|
| B-16 | `/api/c/{cid}/eventos` (`CampanhaEventos`): SSE que avisa "mesa mudou" (com a versão) e "saiu rolagem", sem conteúdo. Rolagem fechada de outra pessoa não avisa o jogador. No navegador, com o fluxo aberto, a pergunta de 6 s vira reserva de 1 por minuto e os painéis de rolagem deixam de perguntar a cada 2,5 s; sem fluxo, tudo volta como era e tenta de novo em 5 min. |
| B-17 | CSP com `script-src 'self' 'unsafe-eval'`: os cinco scripts inline das páginas públicas foram para `static/publico/` e o único `onclick=` virou ligação no JS. Navegado no jar com zero violações. |
| B-18 | `CanalSse`, base do mapa e da campanha: cada inscrito tem a própria fila de envio numa thread virtual (ordem garantida por pessoa); quem acumula 100 eventos sem receber é desligado; fechar também passa pela fila da pessoa. |
| B-20 | `.github/workflows/testes.yml`: teste de API (H2 e Postgres) e teste de tela a cada push e PR na `main`, sem segredo. |
| B-21 | Decidir "primeira conta" e criá-la ficam sob uma trava (`ReentrantLock` em `SessaoController`): dois cadastros simultâneos geram um administrador só. |
| B-22 | `aceitarConvite` lê o convite com `PESSIMISTIC_WRITE` (`ConviteRepo.travarPorToken`): dois aceites simultâneos de um convite de um uso, só um entra. |
| B-23 | Imagem (`MiniaturaController`) com `max-age` de 5 min e `Last-Modified` (304 sem corpo); PDF e áudio com 1 dia. Antes: 30 dias e, na imagem, sem `Last-Modified`, então a troca de imagem pelo mesmo nome não aparecia por um mês. |
| B-24 | Entrou no CI (Postgres 17 como serviço, e o passo falha se o boot deixar "Error executing DDL" no log). Não rodado nesta máquina: o Docker não estava aberto. |

## Testado

- **Teste de API** contra o jar novo, servidor vazio: **368 de 368**, e o boot sem erro de DDL.
- **Provas novas** contra o jar (servidor vazio): **17 de 17**. Dois cadastros simultâneos geram um
  administrador; não membro recebe 403 no fluxo; membro recebe `ola`; rolagem fechada do mestre não
  avisa o jogador; aberta e pedido de teste avisam sem o resultado; rolagem do jogador avisa o mestre;
  gravar a mesa avisa com a versão nova; gravar o guia não avisa; dois aceites de um convite de um
  uso, só um entra; imagem com `max-age=300`, `private`, `Last-Modified` e 304, inclusive a miniatura.
- **CSP** no navegador contra o jar: cadastro, todas as abas do mestre, pdf.js sob demanda,
  privacidade e 404, **zero violações**.
- **Teste de tela**: **0 falhas, 0 erros de página**, com as conferências novas (grupos de
  Configurações, rodapé fora da campanha, rolagem de outra pessoa chegando pelo SSE em menos de 2 s,
  queda para a pergunta de 6 s sem SSE). O stub ganhou o `/eventos` da campanha.
- **Capturas** conferidas: roteiro e quadro (1366 e 390), mapa do jogador (1366 e 390), Configurações,
  Aparência, lista de campanhas, Elenco, Campanha (1366 e 390), resumos e login.

## O que ficou para o dono decidir, e o que ele decidiu (21/11/2026)

| ID | Decisão | O que foi feito |
|---|---|---|
| F-22 | Esconder ao rolar | Na sessão do celular, rolando para baixo a barra de jogo e a barra de abas descem para fora da tela; voltam ao rolar para cima, perto do topo e do fim da página, com o painel aberto e quando o foco do teclado entra numa delas (`barrasAoRolar`, em `render.js`; classe `barras-fora`). |
| F-13, resto | Última sessão no cartão | O cartão mostra "Última: Sessão 3 · Título" ou, para quem mestra e ainda não encerrou nenhuma, "Próxima: …", com a palavra que a campanha usa para "sessão". Quem mestra vê a do guia; quem joga, o resumo publicado de número mais alto na mesa. O servidor resume a cada gravação do guia ou da mesa em duas colunas novas de `campanha` (`UltimaSessao`), sem abrir documento na lista; campanha de antes calcula uma vez. |
| B-17, resto | Manter o petite-vue | `unsafe-eval` fica: tirá-lo pede trocar o motor de template. Script injetado e `onclick=` já estão barrados. |
| B-19 | Dividir os dois | `MapaService` (1.426 linhas) virou porta de entrada (690) mais `MapaBase` (trava, permissões, JSON de saída), `MapaAvisos`, `MapaMovimento`, `MapaDesfazer`, `MapaIniciativa` e `MapaVida`, sem mudar rota nem resposta. `MidiaService` (868) ficou com o catálogo (479) e passou o volume para `ArmazenamentoMidia` e a leitura de PDF para `IndexadorPdf`; de quebra, os avisos do Sonar que ele já tinha (transação chamada pelo `this`, `rollbackFor`, regex com retrocesso, catch vazio). |
| — | Spring Boot 4.2.0 | Subiu de 4.1.3 (junto: Framework 7.1, Security 7.2, Hibernate 7.4, Tomcat 11.0.27, H2 2.5). Das mudanças das notas de versão (RestTemplate, `pathmatch`, SSL bundle, starters AMQP, Pulsar) o projeto não usa nenhuma. O H2 2.5 abre um banco gravado pelo 2.4 sem migração. |
| B-24, local | — | Continua no CI (Postgres 17). Vale olhar o primeiro run do Actions. |

Testado depois disso: teste de API contra o jar na 4.2.0, servidor vazio, **368 de 368** e boot sem erro; prova
da sessão no cartão contra o jar, **11 de 11** (guia sem sessão, próxima, última, jogador só com a mesa,
mestre e jogador vendo cada um a sua); teste de tela **0 falhas, 0 erros de página**, com as conferências
novas (cartão com a sessão e a palavra da campanha; barras saindo ao rolar para baixo e voltando ao rolar
para cima); capturas do cartão em 1366 e 390.
