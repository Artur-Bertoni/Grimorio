# Auditoria de product design: contexto para quem mexer na interface

Leia este arquivo antes de alterar HTML, CSS ou JS do front. O `CLAUDE.md` da raiz tem as
**regras** (escalas, controles, camadas, rotas); este aqui tem o **porquê**, o que a auditoria
achou, o que já foi resolvido, o que ficou de fora de propósito e como não repetir os erros que
apareceram no caminho. O histórico geral do projeto está em `docs/decisoes.md`.

## O que foi feito

Entre 16 e 18/11/2026 a interface passou por três rodadas de auditoria e correção, no papel de
um Staff Product Designer (UX, UI, design system, motion, WCAG 2.2, front-end), com Linear,
Stripe, Notion, Vercel, Figma e parecidos como **régua de acabamento, não de identidade**: a
identidade visual do Grimório (os 11 temas, os 5 estilos, os efeitos, o ornamento) fica.

1. **Rodada 1**: 60 problemas (6 P0). Navegação sumindo no tablet, janelas que não eram
   diálogos, contraste, tela sem endereço, guia antigo regravado pelo "Tentar de novo".
2. **Rodada 2** (depois das correções da 1): 26 problemas, nenhum P0. Uma regressão minha, o
   primário fraco, 320px, Configurações no celular, escalas fora das folhas de momento.
3. **Rodada 3**: 23 dos 26 corrigidos e conferidos no navegador. Mais cinco ajustes de layout
   pedidos pelo dono olhando a tela larga (convite, caixas de marcar, Conta, botões da
   Administração, "Testes possíveis").

Os relatórios completos (cada problema com ID, página, rota, componente, impacto, severidade,
recomendação) foram publicados como artifact privado do Artur; não dependa dele: o que importa
está aqui e no `CLAUDE.md`.

### Notas ao fim da rodada 3 (0 a 10; entre parênteses, a rodada 1)

| Categoria | Nota | | Categoria | Nota |
|---|---|---|---|---|
| UX | 9,0 (5,0) | | Motion | 8,5 (5,5) |
| UI | 8,5 (6,0) | | Responsividade | 9,0 (3,0) |
| Design System | 8,5 (3,5) | | Acessibilidade | 8,5 (2,5) |
| Consistência | 8,5 (4,5) | | Performance visual | 8,0 (5,0) |
| | | | Qualidade enterprise | 8,5 (4,0) |

O que separa isso de 10 **não é código**: leitor de tela real (NVDA, VoiceOver, TalkBack),
aparelhos reais, perfil de GPU num celular fraco, teste contra Postgres, CI rodando os dois
testes e teste de usabilidade com mestres e jogadores. Não afirme "10" ou "totalmente acessível"
sem isso.

## Decisões do dono que não se refazem

- **Efeitos de tema ficam**, inclusive nos blocos de leitura (sangue escorrendo, vinha, LED). Só
  se otimiza o que não muda o desenho. Não restrinja a cartões clicáveis, não tire ornamento.
- **Caixa alta só em rótulo curto** (eyebrow, chip de estado, rótulo de campo). Botão, aba,
  aviso e título de seção em caixa normal.
- **Abaixo de 900px, abas na barra de baixo** e o resto no menu "Mais"; no celular a sessão tem
  barra de jogo e Configurações é uma lista de seções.
- **Endereço por hash** (`#/c/1/elenco`), não por caminho: o jar só serve arquivos e `/api`.
- **Entraram a pedido**: recuperação de senha por e-mail, privacidade e termos editáveis,
  contagem de uso anônima e própria (sem serviço externo, sem cookie novo, por isso sem banner),
  404 com tema, ícones e prévia de convite. **Não** há sitemap (app de acesso restrito, `noindex`).
- Dourado é do **primário**. Alternância ligada, filtro ativo e afins usam fundo `--bg4` e um
  segundo sinal (traço, visto, `aria-pressed`), nunca dourado.

## Checklist antes de dar por pronta qualquer mudança de interface

1. `node --check` em todo JS tocado, e rodar `scripts/teste-front` (stub + `teste.mjs`). Ele
   falha em contraste, cor solta, abas cortadas, rolagem lateral, diálogo e endereço.
2. Mexeu em controller, segurança, entidade ou dependência: rode também o teste de API contra o
   jar de verdade (servidor **sem contas**, `$JAVA_HOME/bin/java`).
3. **Olhe a tela** em pelo menos três larguras: celular (390), notebook (1366) e tela larga
   (2000 ou mais). O teste automático não avalia se ficou bom, e já deixou passar defeito visível.
4. Estado **em repouso** e estado **vazio** também: o ponto de gravação aparecia parado sem
   gravar nada, e o botão de voltar do celular aparecia na tela larga.
5. Teclado: Tab chega, o foco aparece, Esc fecha a camada de cima e devolve o foco.
6. Toque: nada fixo cobre a barra de abas (`--barra-h`); alvo visível com no mínimo 24px e
   área de toque até uns 44px.
7. Cor nova só por token; valor novo de letra, espaço, canto, sombra, camada e tempo só pela
   escala. Texto novo passa pelo vocabulário (`V()`, `Vm()`, `vmin()`) quando é termo de jogo.
8. Avisos do Sonar e Problems do VS Code dos arquivos tocados em zero (regra do dono).
9. Atualize o `CLAUDE.md` se criou regra, e este arquivo se fechou ou abriu pendência.

## Erros que aconteceram no caminho (não repita)

- **Seletor largo demais.** Escondi o rótulo de `.ibtn` abaixo de 1280px para os botões do topo
  e quebrei "Painel" e "Iniciativa" na barra da sessão, que não têm ícone. Escope por contêiner
  (`.acts .ibtn`).
- **Substituição global em massa.** Um `sed` trocando sombras por `var(--e1)` trocou também a
  própria definição de `--e1` (`--e1:var(--e1)`, circular). Depois de qualquer substituição em
  lote em CSS, releia as definições de token e procure `--x:var(--x)`.
- **Regra genérica vence regra específica por engano.** Uma regra de `.form` empilhou a grade de
  convite em coluna; `.form label.ck` quebrava texto e explicação lado a lado. Confira o
  resultado do cascade, não só a regra que você escreveu.
- **Camada fixa sobre a barra de baixo** (a sugestão de tema tampava as abas do jogador): todo
  elemento `position:fixed` no celular parte de `bottom: calc(var(--barra-h) + …)`.
- **Teste que mede errado.** `scrollWidth` conta o `::after` de área de toque e acusa vazamento
  que não existe; meça o texto com `Range`. Teste que clica por texto de aba quebra quando o
  rótulo muda: use `data-aba`.
- **Elemento de interface em tela larga vira lixo se for pensado só para o celular.** Tudo que
  existe só para o celular (`#ajVolta`, `.sessbarra`, `#btnMais`) precisa estar `display:none`
  por padrão e ligado só dentro da media query.
- **Fim de linha.** Os arquivos do repositório têm LF no disco e o Git avisa de CRLF; scripts
  de troca de texto precisam normalizar `\r\n` antes de comparar.

## Pendências conhecidas (o que um próximo passo pode atacar)

**Rodada 4 (21/11/2026)**: front e backend auditados e, no mesmo dia, tudo aplicado (Parte 3 de
`docs/auditoria-rodada-4.md`). Escalas novas: breakpoints 360/600/900/1280, `--lh-*`, `--tr-*`,
`--fw-*`. Depois, as decisões do dono também
entraram (barras da sessão escondem ao rolar, última sessão no cartão, `MapaService` e `MidiaService`
divididos, Spring Boot 4.2). O `unsafe-eval` fica, por decisão do dono: sai só trocando o motor de template.

- **N-27, efeitos que repintam**: a maré do Abismo (`mask-position`) e o LED do Neon (`--ang`
  num gradiente cônico) só rodam no hover, numa área pequena. Converter para composição pura
  (`transform`/`opacity` em camada própria) mudaria o desenho; só faça se o dono autorizar.
- **N-19, Sonar**: a varredura mecânica nos JS antigos foi feita (`dataset`, `Number.parseInt`,
  `catch` comentado); sobram avisos de complexidade cognitiva e os arquivos Java antigos
  (`MidiaService`, etc.). Zerar arquivo por arquivo, com os dois testes entre cada passo.
- **U-07, glossário**: verbos padronizados só nos textos reescritos (Remover tira da lista,
  Apagar destrói). Falta a varredura nos demais templates.
- **Valores de exibição e de efeito fora da escala, de propósito**: títulos de página e de
  capítulo (`clamp`), o quadro da sessão (em px, tem zoom próprio), tempos de efeito longo e as
  ~12 sombras decorativas de efeito de tema. Não migre sem perguntar.
- **Não testado e dito como não testado**: Postgres com as colunas novas de `usuario` (`email`,
  `reset_hash`, `reset_ate`, `tours`) e a tabela `metrica`; leitor de tela real; aparelhos
  reais; GPU. Rode o teste de API contra Postgres (`docker run postgres`) antes de apostar.
- Imagem `previa.png` do convite tem ~200 KB e cabe em metade; o original enviado continua sem
  compressão (só as miniaturas de 512px são geradas).

## Como reauditar

Faça nesta ordem, e **meça**, não opine:

1. **Inventário do CSS**: contar `font-size`, espaçamentos, sombras, raios e tempos fora de
   token por folha, `backdrop-filter`, animações `infinite` e estilos inline nos templates.
2. **Contraste dos 11 temas** (o teste de tela já faz): 4,5:1 no texto, 3:1 na borda de campo,
   texto sobre `--blood` e `--gold`.
3. **Sonda no navegador** em 320, 360, 390, 430, 768, 820, 1024, 1280, 1366, 1440 e 1920 px,
   passando por login, privacidade, campanha, sessões, sessão (quadro e roteiro), elenco,
   biblioteca, mesa, configurações, formulário, busca, dados, lista de campanhas e a mesa do
   jogador. Em cada tela: rolagem lateral, alvos com menos de 24 e de 44px, controles sem nome
   acessível, campos sem rótulo, imagens sem `alt`, um `h1` por tela e títulos sem pulo, e
   contraste do texto como renderizado. Esses scripts foram descartáveis e não estão no
   repositório; se for reauditar com frequência, vale guardar a sonda em `scripts/teste-front/`.
4. **Olhar as capturas** de pelo menos quatro temas (Sangue, Pergaminho, Dossiê, Neon) e das
   larguras extremas.
5. Comparar com a tabela de notas acima e registrar a rodada em `docs/decisoes.md`.
