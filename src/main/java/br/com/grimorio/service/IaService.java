package br.com.grimorio.service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.regex.Pattern;

/** Encaminha a pergunta do app para a API da Anthropic com a chave do mestre. */
@Service
public class IaService {

    /* A linha Sonnet na geracao atual: mais barata que a 4.5 que estava aqui e mais capaz. Quem
       escolheu outro modelo em Administracao continua com o seu. */
    public static final String MODELO_PADRAO = "claude-sonnet-5-5";
    /* Modelos que aceitam output_config.effort; nos mais antigos o campo da 400. Nos atuais o
       raciocinio vem ligado e gasta do max_tokens, entao o esforco e o teto andam juntos. */
    private static final Pattern ACEITA_ESFORCO = Pattern.compile(
            "claude-(fable|mythos|opus|sonnet|haiku)-5.*|claude-opus-4-[5-8].*|claude-sonnet-4-6.*");
    /* Recusa por classificador de seguranca: nestes, o servidor tenta outro modelo sozinho
       ("fallbacks": "default") em vez de devolver a recusa crua. Pergunta de regra de jogo com
       violencia de ficcao e o caso tipico de falso positivo numa mesa de RPG. */
    private static final Pattern ACEITA_FALLBACK = Pattern.compile(
            "claude-(fable-5-[12]|mythos-5-[12]|opus-5(-5)?|sonnet-5-5)");
    private static final String BETA_FALLBACK = "server-side-fallback-2026-07-01";
    private static final String CONTENT = "content";
    private static final Pattern BASE64 = Pattern.compile("[A-Za-z0-9+/=]+");
    private static final String ENDPOINT = "https://api.anthropic.com/v1/messages";
    private static final Logger log = LoggerFactory.getLogger(IaService.class);

    private final ConfigService config;
    private final ObjectMapper om = JsonMapper.builder().build();
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(15))
            .build();

    public IaService(ConfigService config) {
        this.config = config;
    }

    public boolean configurada() {
        return !config.get(ConfigService.IA_CHAVE, "").isBlank();
    }

    public static class Pergunta {
        public String pergunta; // NOSONAR: o nome e o contrato do JSON que a tela manda
        public List<Trecho> trechos;
        public boolean mestre;
        /** Nome do sistema de regras da mesa, se a campanha declarar um. */
        public String sistema;
        /** Nome da campanha, se houver. */
        public String campanha;
    }

    public static class Trecho {
        public String livro;
        public int pagina;
        public String secao;
        public String texto;
    }

    public String responder(Pergunta p) {
        String chave = config.get(ConfigService.IA_CHAVE, "");
        if (chave.isBlank()) throw new IllegalStateException("a chave da API nao foi configurada");
        if (p == null || p.pergunta == null || p.pergunta.isBlank())
            throw new IllegalArgumentException("pergunta vazia");

        String modelo = config.get(ConfigService.IA_MODELO, MODELO_PADRAO);
        String sistema = instrucoes(p);
        String ctx = trechosDosLivros(p.trechos);
        if (!ctx.isEmpty()) sistema += "\n\n--- TRECHOS DOS LIVROS ---\n" + ctx;

        /* consulta de regra na mesa: resposta curta e rapida, esforco baixo; o teto cobre o raciocinio */
        return chamar(chave, modelo, sistema, p.pergunta, 6000, "low");
    }

    /* ate 12 trechos de ate 6 mil caracteres: a busca da tela ja mandou os melhores primeiro */
    private static String trechosDosLivros(List<Trecho> trechos) {
        StringBuilder ctx = new StringBuilder();
        if (trechos == null) return "";
        List<Trecho> uteis = trechos.stream()
                .filter(t -> t != null && t.texto != null && !t.texto.isBlank()).limit(12).toList();
        for (Trecho t : uteis) {
            ctx.append("\n### ").append(t.livro == null ? "?" : t.livro).append(" p.").append(t.pagina);
            if (t.secao != null && !t.secao.isBlank()) ctx.append(" - ").append(t.secao);
            ctx.append('\n');
            String txt = t.texto.length() > 6000 ? t.texto.substring(0, 6000) : t.texto;
            ctx.append(txt).append('\n');
        }
        return ctx.toString();
    }

    private static String instrucoes(Pergunta p) {
        String nomeSistema = p.sistema == null ? "" : p.sistema.trim();
        String nomeCampanha = p.campanha == null ? "" : p.campanha.trim();
        StringBuilder sb = new StringBuilder();
        sb.append("Voce ajuda um mestre e jogadores de RPG de mesa");
        if (!nomeSistema.isEmpty()) sb.append(", no sistema ").append(nomeSistema);
        if (!nomeCampanha.isEmpty()) sb.append(", na campanha ").append(nomeCampanha);
        sb.append(".\n")
          .append("Responda em portugues do Brasil, direto, sem enrolacao e sem repetir a pergunta.\n")
          .append("Use os trechos dos livros abaixo como fonte principal e cite o livro e a pagina\n")
          .append("entre parenteses quando afirmar uma regra, no formato (Nome do Livro p.123).\n")
          .append("Se os trechos nao cobrirem a pergunta, diga isso em uma linha e responda com o que sabe\n")
          .append("do sistema, deixando claro que e memoria e nao citacao.\n");
        if (!p.mestre) {
            sb.append("\nQuem pergunta e um JOGADOR: nunca revele segredos de mestre, fichas de NPC")
              .append(" ou monstro, nem o rumo da trama. Fique nas regras e no que o personagem saberia.");
        }
        return sb.toString();
    }

    private static final int MAX_IMAGENS = 4;
    private static final int MAX_IMAGEM = 5_000_000;
    private static final String SISTEMA_FICHA = """
            Voce recebe uma ficha de personagem de RPG de mesa, de qualquer sistema: o texto extraido \
            de um PDF (baguncado, com rotulos e valores em linhas separadas) e/ou as paginas da ficha em imagem.
            Nas imagens, leia os rotulos impressos e o que estiver escrito ou preenchido. Ficha em branco \
            e um modelo: crie todos os campos dela com val vazio. Atributos desenhados em diagrama ou \
            tabela de pericias contam como campos num, um por atributo ou pericia.
            Monte a ficha e responda SOMENTE com JSON valido, sem comentario e sem cerca de codigo, neste formato:
            {"nome":"nome do personagem","campos":[{"sec":"nome da secao","rot":"rotulo",\
            "tipo":"texto|num|barra|area|check","val":"valor","max":"so em barra"}]}
            Regras: mantenha os rotulos no idioma da ficha. Use num para atributo, pericia, bonus e qualquer \
            valor que se soma a um dado. Use barra para o que tem atual e maximo (vida, energia, sanidade). \
            Use area para texto longo (historia, equipamento, anotacoes). Use check para caixa marcada, \
            com val "1" ou "". Agrupe em secoes como a ficha agrupa. Nao invente valor: campo vazio \
            na ficha fica com val vazio, e rotulo sem sentido fica de fora. No maximo 150 campos.""";

    /** Ficha de personagem (de um PDF) vira campos. Chega como texto extraido, ou como as
     *  paginas desenhadas em imagem quando o PDF nao tem texto (ficha escaneada ou so arte).
     *  Devolve o JSON como texto, ja conferido: {"nome":"", "campos":[{sec,rot,tipo,val,max}]}. */
    public String estruturarFicha(String texto, List<String> imagens) {
        String chave = config.get(ConfigService.IA_CHAVE, "");
        if (chave.isBlank()) throw new IllegalStateException("a chave da API nao foi configurada");
        String t = texto == null ? "" : texto;
        if (t.length() > 40000) t = t.substring(0, 40000);
        ArrayNode conteudo = paginasDaFicha(imagens);
        if (t.isBlank() && conteudo.isEmpty()) throw new IllegalArgumentException("nao veio nada da ficha para ler");
        conteudo.addObject().put("type", "text").put("text", t.isBlank()
                ? "Estas sao as paginas da ficha. Leia e monte os campos." : t);
        /* ate 150 campos em JSON, lidos de texto baguncado ou de imagem: esforco medio, teto largo */
        String bruto = chamar(chave, config.get(ConfigService.IA_MODELO, MODELO_PADRAO), SISTEMA_FICHA, conteudo, 16000, "medium");
        return fichaConferida(bruto);
    }

    /* as paginas em imagem, ate MAX_IMAGENS; so base64 limpo (o navegador manda sem o prefixo data:) */
    private ArrayNode paginasDaFicha(List<String> imagens) {
        ArrayNode conteudo = om.createArrayNode();
        if (imagens == null) return conteudo;
        List<String> paginas = imagens.stream().filter(b -> b != null && !b.isBlank()).limit(MAX_IMAGENS).toList();
        for (String b64 : paginas) {
            if (b64.length() > MAX_IMAGEM) throw new IllegalArgumentException("pagina grande demais");
            if (!BASE64.matcher(b64).matches()) throw new IllegalArgumentException("imagem da pagina veio estragada");
            ObjectNode img = conteudo.addObject();
            img.put("type", "image");
            ObjectNode src = img.putObject("source");
            src.put("type", "base64");
            src.put("media_type", "image/jpeg");
            src.put("data", b64);
        }
        return conteudo;
    }

    /* a IA as vezes embrulha o JSON em texto: pega do primeiro { ao ultimo } e confere a forma */
    private String fichaConferida(String bruto) {
        int a = bruto.indexOf('{');
        int b = bruto.lastIndexOf('}');
        if (a < 0 || b <= a) throw new IllegalStateException("a IA nao devolveu uma ficha");
        JsonNode n;
        try {
            n = om.readTree(bruto.substring(a, b + 1));
        } catch (RuntimeException _) {
            throw new IllegalStateException("a ficha que a IA devolveu veio quebrada");
        }
        if (!n.path("campos").isArray()) throw new IllegalStateException("a IA nao devolveu os campos da ficha");
        return om.writeValueAsString(n);
    }

    /* usuario e texto puro, ou um ArrayNode de blocos (imagem + texto) */
    private String chamar(String chave, String modelo, String sistema, Object usuario, int maxTokens, String esforco) {
        boolean fallback = ACEITA_FALLBACK.matcher(modelo).matches();
        String corpo = om.writeValueAsString(corpo(modelo, sistema, usuario, maxTokens, esforco, fallback));
        HttpRequest.Builder rb = HttpRequest.newBuilder(URI.create(ENDPOINT))
                /* a ficha com teto de 16 mil tokens e raciocinio passa facil dos 2 minutos */
                .timeout(Duration.ofSeconds(300))
                .header("content-type", "application/json")
                .header("x-api-key", chave)
                .header("anthropic-version", "2023-06-01");
        if (fallback) rb.header("anthropic-beta", BETA_FALLBACK);
        HttpRequest req = rb.POST(HttpRequest.BodyPublishers.ofString(corpo, StandardCharsets.UTF_8)).build();

        HttpResponse<String> res;
        try {
            res = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("a chamada a API foi interrompida", e);
        } catch (IOException e) {
            log.warn("IA indisponivel", e);
            throw new IllegalStateException("nao consegui falar com a API: " + e.getMessage(), e);
        }
        if (res.statusCode() != 200) {
            if (log.isWarnEnabled()) log.warn("IA falhou: {} / {}", res.statusCode(), recorta(res.body()));
            throw new IllegalStateException(erroDaApi(res));
        }
        return textoDaResposta(om.readTree(res.body()));
    }

    private ObjectNode corpo(String modelo, String sistema, Object usuario, int maxTokens, String esforco, boolean fallback) {
        ObjectNode corpo = om.createObjectNode();
        corpo.put("model", modelo);
        corpo.put("max_tokens", maxTokens);
        corpo.put("system", sistema);
        if (ACEITA_ESFORCO.matcher(modelo).matches()) corpo.putObject("output_config").put("effort", esforco);
        if (fallback) corpo.put("fallbacks", "default");
        ObjectNode m = corpo.putArray("messages").addObject();
        m.put("role", "user");
        if (usuario instanceof ArrayNode blocos) m.set(CONTENT, blocos);
        else m.put(CONTENT, String.valueOf(usuario));
        return corpo;
    }

    /* a mensagem da API vai junto do status quando o corpo for o JSON de erro dela */
    private String erroDaApi(HttpResponse<String> res) {
        String msg = "a API respondeu " + res.statusCode();
        try {
            JsonNode err = om.readTree(res.body()).path("error").path("message");
            if (!err.isMissingNode()) msg += ": " + err.asString();
        } catch (RuntimeException _) {
            /* corpo que nao e JSON (proxy, pagina de erro): fica so o status */
        }
        return msg;
    }

    private static String textoDaResposta(JsonNode n) {
        /* recusa vem com 200: sem olhar o stop_reason, a tela recebia texto vazio ou pela metade */
        String parada = n.path("stop_reason").asString();
        if ("refusal".equals(parada))
            throw new IllegalStateException("a IA não quis responder a isso; tente reformular a pergunta");
        StringBuilder out = new StringBuilder();
        for (JsonNode bloco : n.path(CONTENT)) {
            if ("text".equals(bloco.path("type").asString())) out.append(bloco.path("text").asString());
        }
        String texto = out.toString().trim();
        if (texto.isEmpty() && "max_tokens".equals(parada))
            throw new IllegalStateException("a resposta da IA ficou grande demais; tente uma pergunta mais curta");
        return texto;
    }

    private String recorta(String s) {
        if (s == null) return "";
        return s.length() > 400 ? s.substring(0, 400) : s;
    }
}
