package br.com.grimorio.service;

import br.com.grimorio.config.AppProps;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Stream;

/**
 * Indices de texto dos livros, por campanha, lidos do volume.
 * Cada arquivo de indice traz "publico": true|false. O jogador so recebe os
 * publicos; o mestre recebe tudo. O corte e aqui, nao na tela.
 */
@Service
public class IndiceService {

    private static final Logger log = LoggerFactory.getLogger(IndiceService.class);
    private static final String VAZIO = "{\"docs\":[],\"pages\":[]}";

    private final AppProps props;
    private final ObjectMapper om = JsonMapper.builder().build();

    private final Map<String, String> cache = new ConcurrentHashMap<>();

    public IndiceService(AppProps props) {
        this.props = props;
    }

    public void invalidar(Long campanhaId) {
        cache.remove(chave(campanhaId, true));
        cache.remove(chave(campanhaId, false));
    }

    public void invalidarTudo() {
        cache.clear();
    }

    private String chave(Long campanhaId, boolean mestre) {
        return campanhaId + (mestre ? ":m" : ":p");
    }

    public Path pastaIndice(Long campanhaId) {
        return Paths.get(props.getMidiaDir()).toAbsolutePath().normalize()
                .resolve("c" + campanhaId).resolve("indice");
    }

    public String json(Long campanhaId, boolean mestre) {
        return cache.computeIfAbsent(chave(campanhaId, mestre), k -> montar(campanhaId, mestre));
    }

    private String montar(Long campanhaId, boolean mestre) {
        try {
            ObjectNode alvo = om.createObjectNode();
            ArrayNode docs = alvo.putArray("docs");
            ArrayNode pages = alvo.putArray("pages");
            Set<String> idsDoc = new HashSet<>();
            Set<String> idsPag = new HashSet<>();

            for (String bruto : arquivos(campanhaId)) {
                JsonNode n;
                try { n = om.readTree(bruto); } catch (Exception e) { continue; }
                boolean publico = n.path("publico").asBoolean(false);
                if (!mestre && !publico) continue;
                juntar(n, docs, pages, idsDoc, idsPag);
            }

            String s = om.writeValueAsString(alvo);
            log.info("Indice da campanha {} ({}): {} livros, {} paginas",
                    campanhaId, mestre ? "mestre" : "jogador", docs.size(), pages.size());
            return s;
        } catch (Exception e) {
            log.error("Falhei ao montar o indice da campanha {}", campanhaId, e);
            return VAZIO;
        }
    }

    private void juntar(JsonNode n, ArrayNode docs, ArrayNode pages,
                        Set<String> idsDoc, Set<String> idsPag) {
        JsonNode d = n.get("docs");
        if (d != null && d.isArray()) {
            for (JsonNode x : d) {
                String id = texto(x, "id");
                if (id.isEmpty() || !idsDoc.add(id)) continue;
                docs.add(x);
            }
        }
        JsonNode p = n.get("pages");
        if (p != null && p.isArray()) {
            for (JsonNode x : p) {
                if (!idsPag.add(texto(x, "d") + "#" + texto(x, "p"))) continue;
                pages.add(x);
            }
        }
    }

    private String texto(JsonNode n, String campo) {
        JsonNode v = n.get(campo);
        return v == null || v.isNull() ? "" : v.asString();
    }

    private List<String> arquivos(Long campanhaId) {
        Path dir = pastaIndice(campanhaId);
        if (!Files.isDirectory(dir)) return List.of();
        List<String> out = new ArrayList<>();
        try (Stream<Path> s = Files.list(dir)) {
            s.filter(p -> p.getFileName().toString().toLowerCase().endsWith(".json"))
             .sorted()
             .forEach(p -> {
                 try { out.add(Files.readString(p, StandardCharsets.UTF_8)); }
                 catch (Exception e) { log.warn("Indice ilegivel {}: {}", p, e.getMessage()); }
             });
        } catch (Exception e) {
            log.warn("Nao consegui listar {}: {}", dir, e.getMessage());
        }
        return out;
    }

    /**
     * Diz se ja existe indice para esse livro. Aceita o arquivo simples
     * (LB.json) e os partidos (AS02-P.json publico, AS02-M.json do mestre),
     * que e como um livro pode ter parte das paginas liberada e parte nao.
     */
    public boolean temLivro(Long campanhaId, String abrev) {
        if (abrev == null || abrev.isBlank()) return false;
        String alvo = abrev.toUpperCase();
        Path dir = pastaIndice(campanhaId);
        if (Files.isRegularFile(dir.resolve(alvo + ".json"))) return true;
        if (!Files.isDirectory(dir)) return false;
        try (Stream<Path> st = Files.list(dir)) {
            return st.anyMatch(p -> {
                String n = p.getFileName().toString().toUpperCase();
                return n.startsWith(alvo + "-") && n.endsWith(".JSON");
            });
        } catch (Exception e) {
            return false;
        }
    }

    /** Marca um indice ja gravado como publico ou nao, e limpa o cache. */
    public void marcarPublico(Long campanhaId, String abrev, boolean publico) {
        Path f = pastaIndice(campanhaId).resolve(abrev.toUpperCase() + ".json");
        if (!Files.isRegularFile(f)) return;
        try {
            ObjectNode n = (ObjectNode) om.readTree(Files.readString(f, StandardCharsets.UTF_8));
            n.put("publico", publico);
            Files.writeString(f, om.writeValueAsString(n), StandardCharsets.UTF_8);
            invalidar(campanhaId);
        } catch (Exception e) {
            log.warn("Nao consegui marcar {} como publico={}: {}", abrev, publico, e.getMessage());
        }
    }
}
