# Grimório

Painel de mesa para RPG, agnóstico de sistema, com backend em Java.
Cada pessoa sobe a própria instância, cria campanhas e convida a mesa.

Java 25 · Spring Boot 4.1 · PostgreSQL (ou H2 local) · front em HTML/JS puro, sem framework.

## O que ele faz

**Mestre** de uma campanha: guia completo, sessões, quadro de cenas arrastáveis,
roteiro, método, trilha sonora, busca no texto dos livros que ele subir, visor de
PDF com Range (abre a página sem baixar o livro inteiro) e um botão de perguntar
à IA com os trechos dos livros como contexto.

**Jogador**: só a aba Mesa, com resumos, evidências, "quem é quem" e locais que o
mestre liberou, a consulta rápida de regras, anotações privadas e o mural. A busca
dele cobre só os livros marcados como públicos.

O corte é no servidor, não na tela: o índice dos livros privados e a rota do guia
exigem papel de mestre naquela campanha.

**Nada vem pronto.** O repositório não carrega campanha, livro nem arte. Cada
mestre traz o seu, pelo painel ou por um pacote de campanha.

## Subir no Railway

1. Suba este repositório no GitHub.
2. Railway → **New Project** → **Deploy from GitHub repo**. Ele acha o `Dockerfile`
   sozinho: a documentação diz que um Dockerfile na raiz sempre vence o builder padrão.
3. No mesmo projeto: **New** → **Database** → **Add PostgreSQL**. Deixe o serviço
   com o nome `Postgres`.
4. No serviço da aplicação, aba **Variables**, só duas:

   | variável | valor |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `PORT` | `8080` |

5. **Settings → Volumes**: crie um volume montado em **`/data`**. É onde ficam
   PDFs, áudio, imagens e os índices de busca, separados por campanha.
6. **Settings → Networking → Generate Domain**.

Não existe login de bootstrap nem variável de senha. Abra o site, clique em
**Criar uma conta** e pronto: a primeira conta da instância vira a
administradora.

## Primeiros passos dentro do app

1. Crie sua conta e, na tela inicial, crie a campanha (ou entre numa existente
   colando a chave de convite que quem mestra te passou). Se tiver um pacote
   `.zip` de campanha, escolha o arquivo antes de clicar em Criar: ele entra junto.
2. Aba **Campanha**: os primeiros passos mostram o que falta. Escreva a
   apresentação e crie as seções que quiser.
3. Aba **Elenco**: cadastre personagens, NPCs, locais e evidências. O que você
   liberar aparece na Mesa dos jogadores.
4. Aba **Biblioteca**: envie os PDFs dos livros (e ligue “jogadores veem” nos que
   a mesa pode consultar), a trilha sonora e as imagens.
5. **Configurações** (a engrenagem) → **Mesa e convites**: gere um link de convite por
   jogador. Quem abre o link entra na campanha, criando conta na hora se precisar.
6. **Configurações** → **Vocabulário** e **Consulta rápida**: ajuste os nomes e escreva o
   resumo de regras do seu sistema. Em **Aparência** ficam as seis paletas: cada um
   escolhe a sua, o mestre define a padrão da mesa.

### Pacote de campanha

**Configurações → Campanha → Exportar pacote** gera um zip com guia, mesa, índices de
busca e imagens. **Importar pacote** faz o caminho de volta, em qualquer instância.
PDFs e áudio ficam de fora porque são grandes e cada mestre tem os seus.

É assim que uma campanha pronta muda de servidor, e é por isso que o repositório
não precisa carregar conteúdo.

### Arquivos grandes

O proxy do Railway corta requisições cujo corpo leve mais de 5 minutos subindo.
Num PDF de 180 MB isso exige uns 5 Mbps de upload. Se não der, mande direto para
o volume pelo CLI e depois clique em **Reescanear o volume**, em Biblioteca › Livros › Avançado:

```bash
railway volume files upload "Livro.pdf" /c1/pdf/LB.pdf
```

O `c1` é o número da campanha e o nome do arquivo precisa ser a abreviação.

## Rodar na sua máquina

```bash
mvn spring-boot:run
```

Sem `DATABASE_URL` ele usa H2 em arquivo dentro de `./dados` e guarda mídia em
`./dados/midia`. Abre em http://localhost:8080.

Build do jar: `mvn -DskipTests package` → `target/grimorio.jar`.

## Variáveis

| variável | padrão | para quê |
|---|---|---|
| `DATABASE_URL` | — | Postgres. Ausente = H2 em arquivo |
| `JDBC_URL`, `JDBC_USER`, `JDBC_SENHA` | — | alternativa ao `DATABASE_URL` |
| `MIDIA_DIR` | `/data/midia` no Docker, `./dados/midia` fora | PDFs, áudio, imagens e índices |
| `PORT` | `8080` | o Railway injeta sozinho |
| `DB_POOL` | `5` | conexões do pool |

## Modelo

```
Usuario      conta na instância; admin = administra a instância inteira
Campanha     uma mesa; tem dono, sistema, tema
Membro       liga usuário e campanha com papel MESTRE ou JOGADOR
Convite      token de entrada numa campanha, com usos e validade
Documento    "guia" e "mesa" de cada campanha, JSON grande com versão
Anotacao     caderno privado de cada pessoa em cada campanha
MuralPost    recados da campanha
Midia        PDF, áudio ou imagem de uma campanha; PDF tem marca de público
Config       ajustes da instância (chave da IA, cadastro aberto)
```

Mídia no disco: `/data/midia/c{campanha}/{pdf,audio,img,indice}/`.
Quem pode baixar cada arquivo é decidido em `MidiaAutorizacao`: imagem para
qualquer membro, áudio só para o mestre, PDF conforme a marca de público.

## Endpoints

| rota | quem |
|---|---|
| `POST /api/login` · `/api/logout` · `/api/registrar` · `GET /api/ping` | aberto |
| `GET /api/sessao` | autenticado |
| `GET/POST /api/campanhas`, `PUT/DELETE /api/campanhas/{id}` | dono ou mestre |
| `/api/campanhas/{id}/membros` · `/convites` · `/sair` | mestre da campanha |
| `POST /api/convites/{token}` | autenticado |
| `GET/PUT /api/c/{id}/guia` | mestre |
| `/api/c/{id}/mesa` · `/indice` · `/mural` · `/notas` · `/ia` | membro (escrita da mesa: mestre) |
| `/api/c/{id}/midia/**` · `/pacote` | mestre |
| `/api/admin/**` | administrador da instância |
| `/midia/c{id}/**` | conforme `MidiaAutorizacao` |

## Migração de uma instalação antiga

Quem vinha da versão de campanha única não precisa fazer nada: no primeiro boot,
o app cria a campanha 1 com o guia, a mesa, as anotações e os recados que já
existiam, põe o administrador como mestre e os demais usuários como jogadores, e
move `/data/midia/{pdf,audio,indice}` para `/data/midia/c1/`. As tabelas antigas
(`doc`, `nota`) continuam no banco, intactas, como cópia de segurança.
