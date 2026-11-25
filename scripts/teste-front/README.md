# Teste do front

Sobe um servidor de mentira que responde os endpoints do app e roda um navegador por cima,
exercitando a tela de verdade. Só precisa de Node.

```bash
npm install                 # uma vez: instala o playwright-core
node stub.mjs &             # http://127.0.0.1:8099
node teste.mjs
```

O `playwright-core` não baixa navegador: o teste usa o Edge ou o Chrome da máquina. Se não achar,
aponte um com `NAVEGADOR=caminho/do/executavel`.

## Scripts

| script | o que faz |
|---|---|
| `stub.mjs` | servidor de mentira em `127.0.0.1:8099`; `GET /api/zerar` volta ao estado inicial |
| `teste.mjs` | roteiro completo no navegador |
| `fotos-temas.mjs` | captura as telas principais em um tema de cada estilo (`FOTOS=pasta`) |
| `icones.mjs` | refaz favicon, ícones e prévia do convite a partir de `logoSvg()` |

`FOTOS=pasta node teste.mjs` grava uma captura de cada tela, no computador e no celular. Use ao
mexer em layout: o roteiro confere que funciona, não que ficou bom de usar.

## O que o roteiro confere

- Todas as telas e fluxos do mestre e do jogador, incluindo guias, fichas, mapa e rolagens.
- Guias: anda por todos e falha se um seletor sem `opc` não achar o elemento.
- Responsivo: barra de baixo e menu "Mais" no celular; abas visíveis e sem rolagem lateral em
  600, 768, 1024, 1180 e 1440px.
- Janela como diálogo: foco preso, fundo inerte, foco devolvido.
- Endereço por tela: Voltar do navegador e F5.
- Contraste (4,5:1 para texto, 3:1 para borda de campo) nos 11 temas, e cor só por token nas folhas
  de estilo (falha com `rgba(` ou hex fora de definição de token).
- Migração do guia em formato antigo: abre com aviso e não é regravado.

## Stub

O stub não toca no banco nem no Spring. Guarda guia e mesa em memória, lê a campanha de teste de
`campanha-teste.json` (no formato do guia de verdade) e gera as imagens na hora, então roda em
qualquer máquina sem conteúdo por perto. O próprio teste chama `/api/zerar` ao começar.

A campanha 1 nasce no formato antigo (v2: `corpos`, `episodios`, NPCs dentro da sessão) de propósito,
para provar o tratamento de guia antigo.

## Armadilhas

- **O stub precisa mandar os mesmos cabeçalhos do Spring.** Um `charset=utf-8` a mais no stub escondeu
  o bug de charset que deixava a tela branca em produção.
- **`node --check` só pega sintaxe.** Função inexistente, seletor renomeado e imagem que não carrega
  só aparecem no navegador; por isso as checagens olham `naturalWidth`, não só o `src`.
- **`innerText` devolve o texto com o `text-transform` do CSS.** Rótulo em caixa alta só casa com regex `/i`.
- **Regra CSS antiga vence a nova se vier depois.** Um `.blktools{display:none}` esquecido num `<style>`
  mais abaixo escondeu os botões de editar; só o clique de verdade pegou.
