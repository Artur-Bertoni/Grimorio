# Teste do front

Sobe um servidor de mentira que responde os endpoints do app, e roda um navegador
por cima exercitando a tela de verdade. Só precisa de Node.

```bash
npm install                 # uma vez: instala o playwright-core
node stub.mjs &             # http://127.0.0.1:8099
node teste.mjs
```

O `playwright-core` não baixa navegador: o teste usa o Edge ou o Chrome que já está
na máquina. Se não achar, aponte um com `NAVEGADOR=caminho/do/executavel`.

`FOTOS=pasta node teste.mjs` grava uma captura de cada tela, no computador e no
celular. Use quando mexer em layout: o roteiro confere que funciona, não que ficou
bom de usar.

O stub não toca no banco nem no Spring: guarda guia e mesa em memória e gera a
campanha de teste e as imagens na hora, então roda em qualquer máquina sem
conteúdo nenhum por perto. `GET /api/zerar` volta ao estado inicial, e o próprio
teste chama isso ao começar.

A campanha 1 nasce no **formato antigo** (v2: `corpos`, `episodios`, NPCs dentro da
sessão) de propósito. É ela que prova que a migração para a v3 funciona e que os
campos antigos continuam no JSON depois.

Lições que custaram caro e estão embutidas aqui:

- **O stub precisa mandar os mesmos cabeçalhos do Spring.** Um stub que mandava
  `charset=utf-8` escondeu por completo o bug de charset que deixava a tela branca
  em produção.
- **`node --check` não é teste.** Ele pega sintaxe. Função que não existe, seletor
  que mudou de nome e imagem que não carrega só aparecem rodando o navegador, e é
  por isso que as checagens olham `naturalWidth` em vez de só conferir o `src`.
- **`innerText` devolve o texto com o `text-transform` do CSS.** Rótulo em caixa
  alta só casa com regex `/i`.
- **Regra CSS velha vence regra nova se vier depois.** Os botões de editar ficaram
  invisíveis porque um `.blktools{display:none}` antigo estava num `<style>` mais
  abaixo. Só o clique de verdade pegou.
