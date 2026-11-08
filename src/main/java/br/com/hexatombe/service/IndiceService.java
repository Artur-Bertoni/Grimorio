package br.com.hexatombe.service;

import br.com.hexatombe.config.AppProps;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Stream;

/**
 * Guarda os indices de texto dos livros. O indice publico vai para todo mundo.
 * O indice de Arquivos Secretos (e qualquer PDF que o mestre suba depois) so
 * sai para quem tem o papel MESTRE.
 */
@Service
public class IndiceService {

    private static final Logger log = LoggerFactory.getLogger(IndiceService.class);
    private static final String VAZIO = "{\"docs\":[],\"pages\":[]}";

    private final AppProps props;
    private final ObjectMapper om = new ObjectMapper();

    private volatile String cachePublico;
    private volatile String cacheMestre;

    public IndiceService(AppProps props) {
        this.props = props;
    }

    public synchronized void invalidar() {
        cachePublico = null;
        cacheMestre = null;
    }

    public String json(boolean mestre) {
        return mestre ? mestre() : publico();
    }

    private String publico() {
        String c = cachePublico;
        if (c != null) return c;
        synchronized (this) {
            if (cachePublico == null) {
                String s = lerClasspath("indice/indice-publico.json");
                cachePublico = s == null ? VAZIO : s;
            }
            return cachePublico;
        }
    }

    private String mestre() {
        String c = cacheMestre;
        if (c != null) return c;
        synchronized (this) {
            if (cacheMestre == null) {
                try {
                    ObjectNode alvo = om.createObjectNode();
                    ArrayNode docs = alvo.putArray("docs");
                    ArrayNode pages = alvo.putArray("pages");
                    Set<String> idsDoc = new HashSet<>();
                    Set<String> idsPag = new HashSet<>();

                    juntar(publico(), docs, pages, idsDoc, idsPag);
                    String as = lerClasspath("indice/indice-as.json");
                    if (as != null) juntar(as, docs, pages, idsDoc, idsPag);

                    for (String extra : extras()) juntar(extra, docs, pages, idsDoc, idsPag);

                    cacheMestre = om.writeValueAsString(alvo);
                    log.info("Indice do mestre montado: {} livros, {} paginas",
                            docs.size(), pages.size());
                } catch (Exception e) {
                    log.error("Falhei ao montar o indice do mestre", e);
                    cacheMestre = publico();
                }
            }
            return cacheMestre;
        }
    }

    private void juntar(String json, ArrayNode docs, ArrayNode pages,
                        Set<String> idsDoc, Set<String> idsPag) {
        try {
            JsonNode n = om.readTree(json);
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
                    String k = texto(x, "d") + "#" + texto(x, "p");
                    if (!idsPag.add(k)) continue;
                    pages.add(x);
                }
            }
        } catch (Exception e) {
            log.warn("Indice ignorado por erro de leitura: {}", e.getMessage());
        }
    }

    private String texto(JsonNode n, String campo) {
        JsonNode v = n.get(campo);
        return v == null || v.isNull() ? "" : v.asText();
    }

    /** Indices gerados a partir de PDFs enviados pelo mestre. */
    private List<String> extras() {
        Path dir = Paths.get(props.getMidiaDir()).resolve("indice");
        if (!Files.isDirectory(dir)) return List.of();
        List<String> out = new ArrayList<>();
        try (Stream<Path> s = Files.list(dir)) {
            s.filter(p -> p.getFileName().toString().endsWith(".json")).sorted().forEach(p -> {
                try {
                    out.add(Files.readString(p, StandardCharsets.UTF_8));
                } catch (Exception e) {
                    log.warn("Nao consegui ler {}: {}", p, e.getMessage());
                }
            });
        } catch (Exception e) {
            log.warn("Nao consegui listar {}: {}", dir, e.getMessage());
        }
        return out;
    }

    private String lerClasspath(String caminho) {
        try {
            ClassPathResource r = new ClassPathResource(caminho);
            if (!r.exists()) {
                log.warn("Indice ausente no classpath: {}", caminho);
                return null;
            }
            try (InputStream in = r.getInputStream()) {
                return new String(in.readAllBytes(), StandardCharsets.UTF_8);
            }
        } catch (Exception e) {
            log.warn("Falha lendo {}: {}", caminho, e.getMessage());
            return null;
        }
    }
}
