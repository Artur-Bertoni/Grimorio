package br.com.grimorio.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
    private final ObjectMapper om = new ObjectMapper();
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

        ObjectNode corpo = om.createObjectNode();
        corpo.put("model", modelo);
        corpo.put("max_tokens", 1500);
        corpo.put("system", sistema);
        ArrayNode msgs = corpo.putArray("messages");
        ObjectNode m = msgs.addObject();
        m.put("role", "user");
        m.put("content", p.pergunta);

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
                    if (!err.isMissingNode()) msg += ": " + err.asText();
                } catch (Exception ignore) { }
                log.warn("IA falhou: {} / {}", res.statusCode(), recorta(res.body()));
                throw new IllegalStateException(msg);
            }

            JsonNode n = om.readTree(res.body());
            StringBuilder out = new StringBuilder();
            for (JsonNode bloco : n.path("content")) {
                if ("text".equals(bloco.path("type").asText())) out.append(bloco.path("text").asText());
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
