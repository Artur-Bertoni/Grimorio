package br.com.grimorio.service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;

/** Encaminha a pergunta do app para a API da Anthropic com a chave do mestre. */
@Service
public class IaService {

    public static final String MODELO_PADRAO = "claude-sonnet-4-5";
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
        public String pergunta;
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

        StringBuilder ctx = new StringBuilder();
        if (p.trechos != null) {
            int n = 0;
            for (Trecho t : p.trechos) {
                if (t == null || t.texto == null || t.texto.isBlank()) continue;
                if (++n > 12) break;
                ctx.append("\n### ").append(t.livro == null ? "?" : t.livro)
                   .append(" p.").append(t.pagina);
                if (t.secao != null && !t.secao.isBlank()) ctx.append(" - ").append(t.secao);
                ctx.append('\n');
                String txt = t.texto;
                if (txt.length() > 6000) txt = txt.substring(0, 6000);
                ctx.append(txt).append('\n');
            }
        }

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
        String sistema = sb.toString();
        if (!p.mestre) {
            sistema += "\nQuem pergunta e um JOGADOR: nunca revele segredos de mestre, fichas de NPC"
                    + " ou monstro, nem o rumo da trama. Fique nas regras e no que o personagem saberia.";
        }
        if (ctx.length() > 0) {
            sistema += "\n\n--- TRECHOS DOS LIVROS ---\n" + ctx;
        }

        return chamar(chave, modelo, sistema, p.pergunta, 1500);
    }

    private static final int MAX_IMAGENS = 4, MAX_IMAGEM = 5_000_000;

    /** Ficha de personagem (de um PDF) vira campos. Chega como texto extraido, ou como as
     *  paginas desenhadas em imagem quando o PDF nao tem texto (ficha escaneada ou so arte).
     *  Devolve o JSON como texto, ja conferido: {"nome":"", "campos":[{sec,rot,tipo,val,max}]}. */
    public String estruturarFicha(String texto, List<String> imagens) {
        String chave = config.get(ConfigService.IA_CHAVE, "");
        if (chave.isBlank()) throw new IllegalStateException("a chave da API nao foi configurada");
        if (texto == null) texto = "";
        if (texto.length() > 40000) texto = texto.substring(0, 40000);
        ArrayNode conteudo = om.createArrayNode();
        int nImg = 0;
        if (imagens != null) for (String b64 : imagens) {
            if (b64 == null || b64.isBlank()) continue;
            if (++nImg > MAX_IMAGENS) break;
            if (b64.length() > MAX_IMAGEM) throw new IllegalArgumentException("pagina grande demais");
            /* so base64 limpo: o navegador manda sem o prefixo data: */
            if (!b64.matches("[A-Za-z0-9+/=]+")) throw new IllegalArgumentException("imagem da pagina veio estragada");
            ObjectNode img = conteudo.addObject();
            img.put("type", "image");
            ObjectNode src = img.putObject("source");
            src.put("type", "base64");
            src.put("media_type", "image/jpeg");
            src.put("data", b64);
        }
        if (texto.isBlank() && nImg == 0) throw new IllegalArgumentException("nao veio nada da ficha para ler");
        conteudo.addObject().put("type", "text").put("text", texto.isBlank()
                ? "Estas sao as paginas da ficha. Leia e monte os campos." : texto);
        String sistema = "Voce recebe uma ficha de personagem de RPG de mesa, de qualquer sistema: o texto extraido"
                + " de um PDF (baguncado, com rotulos e valores em linhas separadas) e/ou as paginas da ficha em imagem.\n"
                + "Nas imagens, leia os rotulos impressos e o que estiver escrito ou preenchido. Ficha em branco"
                + " e um modelo: crie todos os campos dela com val vazio. Atributos desenhados em diagrama ou"
                + " tabela de pericias contam como campos num, um por atributo ou pericia.\n"
                + "Monte a ficha e responda SOMENTE com JSON valido, sem comentario e sem cerca de codigo, neste formato:\n"
                + "{\"nome\":\"nome do personagem\",\"campos\":[{\"sec\":\"nome da secao\",\"rot\":\"rotulo\","
                + "\"tipo\":\"texto|num|barra|area|check\",\"val\":\"valor\",\"max\":\"so em barra\"}]}\n"
                + "Regras: mantenha os rotulos no idioma da ficha. Use num para atributo, pericia, bonus e qualquer"
                + " valor que se soma a um dado. Use barra para o que tem atual e maximo (vida, energia, sanidade)."
                + " Use area para texto longo (historia, equipamento, anotacoes). Use check para caixa marcada,"
                + " com val \"1\" ou \"\". Agrupe em secoes como a ficha agrupa. Nao invente valor: campo vazio"
                + " na ficha fica com val vazio, e rotulo sem sentido fica de fora. No maximo 150 campos.";
        String bruto = chamar(chave, config.get(ConfigService.IA_MODELO, MODELO_PADRAO), sistema, conteudo, 8000);
        int a = bruto.indexOf('{'), b = bruto.lastIndexOf('}');
        if (a < 0 || b <= a) throw new IllegalStateException("a IA nao devolveu uma ficha");
        try {
            JsonNode n = om.readTree(bruto.substring(a, b + 1));
            if (!n.path("campos").isArray()) throw new IllegalStateException("a IA nao devolveu os campos da ficha");
            return om.writeValueAsString(n);
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("a ficha que a IA devolveu veio quebrada");
        }
    }

    /* usuario e texto puro, ou um ArrayNode de blocos (imagem + texto) */
    private String chamar(String chave, String modelo, String sistema, Object usuario, int maxTokens) {
        ObjectNode corpo = om.createObjectNode();
        corpo.put("model", modelo);
        corpo.put("max_tokens", maxTokens);
        corpo.put("system", sistema);
        ArrayNode msgs = corpo.putArray("messages");
        ObjectNode m = msgs.addObject();
        m.put("role", "user");
        if (usuario instanceof ArrayNode blocos) m.set("content", blocos);
        else m.put("content", String.valueOf(usuario));

        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(ENDPOINT))
                    .timeout(Duration.ofSeconds(120))
                    .header("content-type", "application/json")
                    .header("x-api-key", chave)
                    .header("anthropic-version", "2023-06-01")
                    .POST(HttpRequest.BodyPublishers.ofString(
                            om.writeValueAsString(corpo), StandardCharsets.UTF_8))
                    .build();

            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (res.statusCode() != 200) {
                String msg = "a API respondeu " + res.statusCode();
                try {
                    JsonNode err = om.readTree(res.body()).path("error").path("message");
                    if (!err.isMissingNode()) msg += ": " + err.asString();
                } catch (Exception ignore) { }
                log.warn("IA falhou: {} / {}", res.statusCode(), recorta(res.body()));
                throw new IllegalStateException(msg);
            }

            JsonNode n = om.readTree(res.body());
            StringBuilder out = new StringBuilder();
            for (JsonNode bloco : n.path("content")) {
                if ("text".equals(bloco.path("type").asString())) out.append(bloco.path("text").asString());
            }
            return out.toString().trim();

        } catch (IllegalStateException | IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            log.warn("IA indisponivel", e);
            throw new IllegalStateException("nao consegui falar com a API: " + e.getMessage());
        }
    }

    private String recorta(String s) {
        if (s == null) return "";
        return s.length() > 400 ? s.substring(0, 400) : s;
    }
}
