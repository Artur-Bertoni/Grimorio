# Teste do front

Sobe um servidor de mentira que responde os endpoints do app, e roda um Chromium
por cima exercitando a tela de verdade.

```bash
python3 stub.py &                       # http://127.0.0.1:8099
npm i -D playwright && npx playwright install chromium
node teste.mjs
```

O stub não toca no banco nem no Spring: guarda guia e mesa em memória e gera a
campanha de teste e as imagens na hora, então roda em qualquer máquina sem
conteúdo nenhum por perto. `GET /api/zerar` volta ao estado inicial.

Duas lições que custaram caro e estão embutidas aqui:

- **O stub precisa mandar os mesmos cabeçalhos do Spring.** Um stub que mandava
  `charset=utf-8` escondeu por completo o bug de charset que deixava a tela branca
  em produção.
- **`node --check` não é teste.** Ele pega sintaxe. Função que não existe, seletor
  que mudou de nome e imagem que não carrega só aparecem rodando o navegador, e é
  por isso que as checagens olham `naturalWidth` em vez de só conferir o `src`.
