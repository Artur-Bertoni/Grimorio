package br.com.grimorio.service;

import br.com.grimorio.config.AppProps;
import br.com.grimorio.repo.CampanhaRepo;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * Modelos de campanha: pacotes guardados no servidor que qualquer pessoa escolhe ao criar uma
 * campanha, para comecar com algo pronto em vez da folha em branco.
 *
 * O repositorio nao carrega campanha nenhuma: quem cadastra os modelos e a administracao da
 * servidor, enviando um pacote ou salvando como modelo uma campanha que ela mestra. Cada
 * modelo ocupa tres arquivos em {volume}/modelos, fora de /midia (nada aqui e servido direto):
 *
 *   {id}.zip     o pacote, no mesmo formato do Exportar pacote
 *   {id}.json    nome, sistema, descricao e a extensao da capa, para listar sem abrir o zip
 *   {id}.capa    a imagem do cartao: a do pacote, se ele tiver, ou a que a administracao puser
 */
@Service
public class ModeloService {

    private static final Logger log = LoggerFactory.getLogger(ModeloService.class);
    private static final String ID_VALIDO = "[a-z0-9]{12}";
    private static final long LIMITE_CAPA = 10L * 1024 * 1024;
    private static final String EXT_JSON = ".json";
    private static final String EXT_ZIP = ".zip";
    private static final String EXT_CAPA = ".capa";
    private static final String PARCIAL = ".parcial";
    private static final String NOME = "nome";
    private static final String SISTEMA = "sistema";
    private static final String DESCRICAO = "descricao";
    private static final String CAPA = "capa";
    private static final String CRIADO_EM = "criadoEm";
    private static final String CAMPANHA = "campanha";
    private static final String NAO_ENCONTRADO = "modelo nao encontrado";
    private static final Map<String, String> TIPOS_CAPA = Map.of(
            "webp", "image/webp", "png", "image/png", "jpg", "image/jpeg", "jpeg", "image/jpeg", "gif", "image/gif");

    private final AppProps props;
    private final PacoteService pacote;
    private final DocumentoService docs;
    private final CampanhaRepo campanhas;
    private final ObjectMapper om = JsonMapper.builder().build();
    private final SecureRandom sorteio = new SecureRandom();

    public ModeloService(AppProps props, PacoteService pacote, DocumentoService docs, CampanhaRepo campanhas) {
        this.props = props;
        this.pacote = pacote;
        this.docs = docs;
        this.campanhas = campanhas;
    }

    /* ao lado da pasta de midia, no mesmo volume */
    Path pasta() throws IOException {
        Path midia = Paths.get(props.getMidiaDir()).toAbsolutePath().normalize();
        Path p = (midia.getParent() == null ? midia : midia.getParent()).resolve("modelos");
        Files.createDirectories(p);
        return p;
    }

    public List<Map<String, Object>> listar() throws IOException {
        List<Map<String, Object>> out = new ArrayList<>();
        try (var st = Files.list(pasta())) {
            for (Path p : st.filter(x -> x.getFileName().toString().matches(ID_VALIDO + "\\.json")).toList()) {
                Map<String, Object> m = ler(p);
                if (!m.isEmpty()) out.add(m);
            }
        }
        out.sort(Comparator.comparing(m -> String.valueOf(m.get(NOME)), String.CASE_INSENSITIVE_ORDER));
        return out;
    }

    /* o resumo do modelo para a tela, ou vazio se os arquivos dele nao estiverem inteiros */
    private Map<String, Object> ler(Path json) {
        String id = json.getFileName().toString().replace(EXT_JSON, "");
        try {
            JsonNode n = om.readTree(Files.readString(json, StandardCharsets.UTF_8));
            Path zip = json.resolveSibling(id + EXT_ZIP);
            if (!Files.isRegularFile(zip)) return Map.of();
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", id);
            m.put(NOME, n.path(NOME).asString(""));
            m.put(SISTEMA, n.path(SISTEMA).asString(""));
            m.put(DESCRICAO, n.path(DESCRICAO).asString(""));
            m.put("temCapa", !n.path(CAPA).asString("").isEmpty() && Files.isRegularFile(json.resolveSibling(id + EXT_CAPA)));
            m.put("tamanho", Files.size(zip));
            m.put(CRIADO_EM, n.path(CRIADO_EM).asLong(0));
            return m;
        } catch (Exception e) {
            log.warn("Modelo {} ilegivel: {}", id, e.getMessage());
            return Map.of();
        }
    }

    private ObjectNode lerMeta(Path json) throws IOException {
        return (ObjectNode) om.readTree(Files.readString(json, StandardCharsets.UTF_8));
    }

    /** O administrador envia um pacote .zip, que vira modelo. */
    public Map<String, Object> salvarDoEnvio(MultipartFile zip) throws IOException {
        if (zip == null || zip.isEmpty()) throw new IllegalArgumentException("arquivo vazio");
        Path tmp = Files.createTempFile(pasta(), "envio", PARCIAL);
        try {
            try (InputStream in = zip.getInputStream()) {
                Files.copy(in, tmp, StandardCopyOption.REPLACE_EXISTING);
            }
            return registrar(tmp);
        } finally {
            Files.deleteIfExists(tmp);
        }
    }

    /** Uma campanha vira modelo: o pacote dela, com todos os arquivos, guardado como esta agora.
     *  Mexer na campanha depois nao muda o modelo. */
    public Map<String, Object> salvarDaCampanha(Long campanhaId) throws IOException {
        Path tmp = Files.createTempFile(pasta(), CAMPANHA, PARCIAL);
        try {
            try (OutputStream out = Files.newOutputStream(tmp)) {
                pacote.exportar(campanhaId, true, false, out);
            }
            return registrar(tmp);
        } finally {
            Files.deleteIfExists(tmp);
        }
    }

    /* le o campanha.json e a capa do pacote; so entao o zip toma o lugar definitivo */
    private Map<String, Object> registrar(Path zip) throws IOException {
        String id = novoId();
        Path dir = pasta();
        ObjectNode meta = om.createObjectNode();
        try (ZipFile z = new ZipFile(zip.toFile(), StandardCharsets.UTF_8)) {
            ZipEntry e = z.getEntry("campanha.json");
            if (e == null) throw new IllegalArgumentException("o arquivo nao e um pacote de campanha (falta o campanha.json)");
            JsonNode n;
            try (InputStream in = z.getInputStream(e)) { n = om.readTree(in); }
            if (!n.path("guia").isObject()) throw new IllegalArgumentException("o pacote nao tem guia");
            String nome = n.path(NOME).asString("").trim();
            if (nome.isEmpty()) nome = n.path("guia").path(CAMPANHA).path("titulo").asString("").trim();
            meta.put(NOME, corta(nome.isEmpty() ? "Modelo sem nome" : nome, 120));
            meta.put(SISTEMA, corta(n.path(SISTEMA).asString(""), 120));
            meta.put(DESCRICAO, corta(n.path(DESCRICAO).asString(""), 600));
            meta.put(CAPA, extrairCapa(z, n.path(CAPA).asString(""), dir.resolve(id + EXT_CAPA)));
            meta.put(CRIADO_EM, Instant.now().toEpochMilli());
        } catch (java.util.zip.ZipException _) {
            throw new IllegalArgumentException("o arquivo nao e um zip valido");
        }
        Files.move(zip, dir.resolve(id + EXT_ZIP), StandardCopyOption.REPLACE_EXISTING);
        gravarMeta(id, meta);
        if (log.isInfoEnabled()) log.info("Modelo {} criado: {}", id, meta.path(NOME).asString(""));
        return ler(dir.resolve(id + EXT_JSON));
    }

    /* devolve a extensao da capa gravada, ou vazio */
    private static String extrairCapa(ZipFile z, String capa, Path destino) throws IOException {
        String c = capa == null ? "" : capa.replace('\\', '/');
        if (!c.startsWith("img/") || c.contains("..")) return "";
        String ext = c.substring(c.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        ZipEntry e = z.getEntry(c);
        if (e == null || !TIPOS_CAPA.containsKey(ext)) return "";
        try (InputStream in = z.getInputStream(e)) {
            Files.copy(in, destino, StandardCopyOption.REPLACE_EXISTING);
        }
        return ext;
    }

    public Map<String, Object> editar(String id, String nome, String descricao) throws IOException {
        Path json = arquivo(id, EXT_JSON);
        ObjectNode meta = lerMeta(json);
        if (nome != null && !nome.isBlank()) meta.put(NOME, corta(nome.trim(), 120));
        if (descricao != null) meta.put(DESCRICAO, corta(descricao.trim(), 600));
        gravarMeta(id, meta);
        return ler(json);
    }

    /** A administracao troca a capa do cartao do modelo. So o cartao muda: a campanha criada a
     *  partir dele continua sem imagem, porque a capa nao entra no pacote. */
    public Map<String, Object> trocarCapa(String id, MultipartFile img) throws IOException {
        Path json = arquivo(id, EXT_JSON);
        if (img == null || img.isEmpty()) throw new IllegalArgumentException("imagem vazia");
        if (img.getSize() > LIMITE_CAPA) throw new IllegalArgumentException("a capa pode ter no maximo 10 MB");
        String original = Objects.requireNonNullElse(img.getOriginalFilename(), "");
        String ext = original.substring(original.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        if (!TIPOS_CAPA.containsKey(ext)) throw new IllegalArgumentException("a capa precisa ser webp, png, jpg ou gif");
        Path destino = pasta().resolve(id + EXT_CAPA);
        Path tmp = destino.resolveSibling(id + EXT_CAPA + PARCIAL);
        try (InputStream in = img.getInputStream()) {
            Files.copy(in, tmp, StandardCopyOption.REPLACE_EXISTING);
        }
        Files.move(tmp, destino, StandardCopyOption.REPLACE_EXISTING);
        ObjectNode meta = lerMeta(json);
        meta.put(CAPA, ext);
        gravarMeta(id, meta);
        return ler(json);
    }

    public Map<String, Object> tirarCapa(String id) throws IOException {
        Path json = arquivo(id, EXT_JSON);
        Files.deleteIfExists(pasta().resolve(id + EXT_CAPA));
        ObjectNode meta = lerMeta(json);
        meta.put(CAPA, "");
        gravarMeta(id, meta);
        return ler(json);
    }

    public void remover(String id) throws IOException {
        arquivo(id, EXT_JSON);
        for (String ext : List.of(EXT_ZIP, EXT_CAPA, EXT_JSON)) Files.deleteIfExists(pasta().resolve(id + ext));
        log.info("Modelo {} removido", id);
    }

    /** A capa do modelo e o tipo dela, para a tela de criar campanha mostrar. */
    public Optional<Map.Entry<Path, String>> capa(String id) throws IOException {
        if (id == null || !id.matches(ID_VALIDO)) return Optional.empty();
        Path json = pasta().resolve(id + EXT_JSON);
        Path img = pasta().resolve(id + EXT_CAPA);
        if (!Files.isRegularFile(json) || !Files.isRegularFile(img)) return Optional.empty();
        String tipo = TIPOS_CAPA.get(lerMeta(json).path(CAPA).asString(""));
        return tipo == null ? Optional.empty() : Optional.of(Map.entry(img, tipo));
    }

    /** Poe o conteudo do modelo numa campanha, como a importacao de pacote com "substituir". */
    public Map<String, Object> aplicar(Long campanhaId, Long usuarioId, String id) throws IOException {
        Path zip = arquivo(id, EXT_ZIP);
        Map<String, Object> r;
        try (InputStream in = Files.newInputStream(zip)) {
            r = pacote.importar(campanhaId, usuarioId, in, true);
        }
        campanhas.findById(campanhaId).ifPresent(c -> retitular(campanhaId, c.getNome()));
        return r;
    }

    /* O titulo do guia e da mesa e o que aparece no topo da tela. Vindo do modelo seria o nome
       do modelo ("Estrutura completa"); a campanha e de quem criou, com o nome que essa pessoa deu. */
    private void retitular(Long campanhaId, String nome) {
        if (nome == null || nome.isBlank()) return;
        for (String chave : List.of(DocumentoService.GUIA, DocumentoService.MESA)) {
            JsonNode n = om.readTree(docs.ler(campanhaId, chave).getConteudo());
            if (!n.isObject()) continue;
            ObjectNode alvo = DocumentoService.GUIA.equals(chave) && n.path(CAMPANHA).isObject()
                    ? (ObjectNode) n.get(CAMPANHA) : (ObjectNode) n;
            alvo.put("titulo", nome);
            docs.gravar(campanhaId, chave, om.writeValueAsString(n), -1);
        }
    }

    private Path arquivo(String id, String ext) throws IOException {
        if (id == null || !id.matches(ID_VALIDO)) throw new IllegalArgumentException(NAO_ENCONTRADO);
        Path p = pasta().resolve(id + ext);
        if (!Files.isRegularFile(p)) throw new IllegalArgumentException(NAO_ENCONTRADO);
        return p;
    }

    private void gravarMeta(String id, ObjectNode meta) throws IOException {
        Path json = pasta().resolve(id + EXT_JSON);
        Path tmp = json.resolveSibling(id + EXT_JSON + PARCIAL);
        Files.writeString(tmp, om.writeValueAsString(meta), StandardCharsets.UTF_8);
        Files.move(tmp, json, StandardCopyOption.REPLACE_EXISTING);
    }

    private String novoId() {
        String letras = "abcdefghijklmnopqrstuvwxyz0123456789";
        StringBuilder sb = new StringBuilder(12);
        for (int i = 0; i < 12; i++) sb.append(letras.charAt(sorteio.nextInt(letras.length())));
        return sb.toString();
    }

    private static String corta(String s, int max) {
        return s.length() > max ? s.substring(0, max) : s;
    }
}
