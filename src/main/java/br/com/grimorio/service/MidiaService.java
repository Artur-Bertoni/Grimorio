package br.com.grimorio.service;

import br.com.grimorio.config.AppProps;
import br.com.grimorio.model.Midia;
import br.com.grimorio.repo.MidiaRepo;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.text.Normalizer;
import java.time.Instant;
import java.util.*;

/** PDFs, audio e imagens de uma campanha, guardados em /midia/c{id}/. */
@Service
public class MidiaService {

    private static final Logger log = LoggerFactory.getLogger(MidiaService.class);

    private final AppProps props;
    private final MidiaRepo repo;
    private final IndiceService indice;
    private final ObjectMapper om = new ObjectMapper();

    public MidiaService(AppProps props, MidiaRepo repo, IndiceService indice) {
        this.props = props;
        this.repo = repo;
        this.indice = indice;
    }

    public Path raizGeral() {
        return Paths.get(props.getMidiaDir()).toAbsolutePath().normalize();
    }

    public Path raiz(Long campanhaId) {
        return raizGeral().resolve("c" + campanhaId);
    }

    public void prepararPastas(Long campanhaId) throws IOException {
        Path r = raiz(campanhaId);
        Files.createDirectories(r.resolve("pdf"));
        Files.createDirectories(r.resolve("audio"));
        Files.createDirectories(r.resolve("img"));
        Files.createDirectories(r.resolve("indice"));
    }

    // ---------- catalogo ----------

    @Transactional(readOnly = true)
    public Map<String, Object> catalogo(Long campanhaId, boolean mestre) {
        Map<String, Object> out = new LinkedHashMap<>();

        List<Map<String, Object>> docs = new ArrayList<>();
        for (Midia m : repo.findByCampanhaIdAndTipoOrderByCategoriaAscNomeAsc(campanhaId, Midia.Tipo.PDF)) {
            if (!mestre && !m.isPublico()) continue;
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("id", m.getId());
            d.put("abrev", m.getChave());
            d.put("nome", m.getNome());
            d.put("paginas", m.getPaginas());
            d.put("tamanho", m.getTamanho());
            d.put("publico", m.isPublico());
            d.put("url", url(campanhaId, m.getArquivo()));
            docs.add(d);
        }
        out.put("docs", docs);

        List<Map<String, Object>> faixas = new ArrayList<>();
        if (mestre) {
            for (Midia m : repo.findByCampanhaIdAndTipoOrderByCategoriaAscNomeAsc(campanhaId, Midia.Tipo.AUDIO)) {
                Map<String, Object> f = new LinkedHashMap<>();
                f.put("id", m.getId());
                f.put("chave", m.getChave());
                f.put("nome", m.getNome());
                f.put("cat", m.getCategoria() == null ? "" : m.getCategoria());
                f.put("tamanho", m.getTamanho());
                f.put("url", url(campanhaId, m.getArquivo()));
                faixas.add(f);
            }
        }
        out.put("faixas", faixas);

        List<Map<String, Object>> imgs = new ArrayList<>();
        for (Midia m : repo.findByCampanhaIdAndTipoOrderByCategoriaAscNomeAsc(campanhaId, Midia.Tipo.IMG)) {
            Map<String, Object> i = new LinkedHashMap<>();
            i.put("id", m.getId());
            i.put("nome", m.getNome());
            i.put("chave", m.getChave());
            i.put("tamanho", m.getTamanho());
            i.put("url", url(campanhaId, m.getArquivo()));
            imgs.add(i);
        }
        out.put("imagens", imgs);
        out.put("base", "/midia/c" + campanhaId + "/");
        return out;
    }

    private String url(Long campanhaId, String relativo) {
        StringBuilder sb = new StringBuilder("/midia/c").append(campanhaId);
        for (String parte : relativo.split("/")) {
            if (parte.isEmpty()) continue;
            sb.append('/').append(URLEncoder.encode(parte, StandardCharsets.UTF_8).replace("+", "%20"));
        }
        return sb.toString();
    }

    // ---------- envio ----------

    @Transactional
    public Midia salvarPdf(Long campanhaId, String abrev, String nome, boolean publico,
                           MultipartFile arquivo) throws IOException {
        String ab = (abrev == null ? "" : abrev.trim().toUpperCase());
        if (!ab.matches("[A-Z0-9]{2,10}"))
            throw new IllegalArgumentException("a abreviacao deve ter de 2 a 10 letras ou numeros");
        if (arquivo == null || arquivo.isEmpty()) throw new IllegalArgumentException("arquivo vazio");
        prepararPastas(campanhaId);
        Path destino = raiz(campanhaId).resolve("pdf").resolve(ab + ".pdf");
        gravar(arquivo, destino);
        return registrarPdf(campanhaId, ab, nome, publico, destino);
    }

    @Transactional
    public Midia registrarPdf(Long campanhaId, String abrev, String nome, boolean publico,
                              Path arquivo) throws IOException {
        String ab = abrev.toUpperCase();
        int paginas;
        if (indice.temLivro(campanhaId, ab)) {
            paginas = contarPaginas(arquivo);
            log.info("PDF {} registrado sem reindexar: ja existe indice para ele.", ab);
        } else {
            paginas = 0;
            try {
                paginas = indexarPdf(campanhaId, ab, nome, arquivo, publico);
            } catch (Exception e) {
                log.warn("PDF {} salvo, mas a indexacao falhou: {}", ab, e.getMessage());
            }
        }
        indice.marcarPublico(campanhaId, ab, publico);

        Midia m = repo.findByCampanhaIdAndTipoAndChaveIgnoreCase(campanhaId, Midia.Tipo.PDF, ab)
                .orElseGet(Midia::new);
        m.setCampanhaId(campanhaId);
        m.setTipo(Midia.Tipo.PDF);
        m.setChave(ab);
        m.setNome(nome == null || nome.isBlank() ? ab : nome.trim());
        m.setCategoria("livro");
        m.setArquivo("pdf/" + ab + ".pdf");
        m.setTamanho(Files.size(arquivo));
        m.setPaginas(paginas);
        m.setPublico(publico);
        m.setEnviadoEm(Instant.now());
        repo.save(m);
        indice.invalidar(campanhaId);
        return m;
    }

    @Transactional
    public Midia salvarAudio(Long campanhaId, String categoria, String nome,
                             MultipartFile arquivo) throws IOException {
        if (arquivo == null || arquivo.isEmpty()) throw new IllegalArgumentException("arquivo vazio");
        prepararPastas(campanhaId);
        String cat = categoria == null || categoria.isBlank() ? "Geral" : categoria.trim();
        String original = arquivo.getOriginalFilename() == null ? "faixa.mp3" : arquivo.getOriginalFilename();
        String nomeFinal = nome == null || nome.isBlank() ? semExtensao(original) : nome.trim();
        String ext = extensao(original).isEmpty() ? "mp3" : extensao(original);

        String rel = "audio/" + slug(cat) + "/" + slug(nomeFinal) + "." + ext;
        Path destino = raiz(campanhaId).resolve(rel);
        Files.createDirectories(destino.getParent());
        gravar(arquivo, destino);

        String chave = slug(cat) + "/" + slug(nomeFinal);
        Midia m = repo.findByCampanhaIdAndTipoAndChaveIgnoreCase(campanhaId, Midia.Tipo.AUDIO, chave)
                .orElseGet(Midia::new);
        m.setCampanhaId(campanhaId);
        m.setTipo(Midia.Tipo.AUDIO);
        m.setChave(chave);
        m.setNome(nomeFinal);
        m.setCategoria(cat);
        m.setArquivo(rel);
        m.setTamanho(Files.size(destino));
        m.setPaginas(0);
        m.setPublico(false);
        m.setEnviadoEm(Instant.now());
        return repo.save(m);
    }

    @Transactional
    public Midia salvarImagem(Long campanhaId, String nome, MultipartFile arquivo) throws IOException {
        if (arquivo == null || arquivo.isEmpty()) throw new IllegalArgumentException("arquivo vazio");
        prepararPastas(campanhaId);
        String original = arquivo.getOriginalFilename() == null ? "img.webp" : arquivo.getOriginalFilename();
        String base = nome == null || nome.isBlank() ? semExtensao(original) : nome.trim();
        String ext = extensao(original).isEmpty() ? "webp" : extensao(original);
        String arq = slug(base) + "." + ext;
        return gravarImagem(campanhaId, arq, arquivo.getInputStream().readAllBytes());
    }

    /** Usada tambem pela importacao de pacote, que ja tem os bytes. */
    @Transactional
    public Midia gravarImagem(Long campanhaId, String nomeArquivo, byte[] bytes) throws IOException {
        prepararPastas(campanhaId);
        String rel = "img/" + nomeArquivo;
        Path destino = raiz(campanhaId).resolve(rel);
        Files.createDirectories(destino.getParent());
        Files.write(destino, bytes);

        Midia m = repo.findByCampanhaIdAndTipoAndChaveIgnoreCase(campanhaId, Midia.Tipo.IMG, nomeArquivo)
                .orElseGet(Midia::new);
        m.setCampanhaId(campanhaId);
        m.setTipo(Midia.Tipo.IMG);
        m.setChave(nomeArquivo);
        m.setNome(nomeArquivo);
        m.setCategoria("imagem");
        m.setArquivo(rel);
        m.setTamanho(bytes.length);
        m.setPaginas(0);
        m.setPublico(true);
        m.setEnviadoEm(Instant.now());
        return repo.save(m);
    }

    @Transactional
    public void trocarVisibilidade(Long campanhaId, Long id, boolean publico) {
        Midia m = repo.findById(id)
                .filter(x -> Objects.equals(x.getCampanhaId(), campanhaId))
                .orElseThrow(() -> new IllegalArgumentException("midia nao encontrada"));
        m.setPublico(publico);
        repo.save(m);
        if (m.getTipo() == Midia.Tipo.PDF) indice.marcarPublico(campanhaId, m.getChave(), publico);
        indice.invalidar(campanhaId);
    }

    @Transactional
    public void remover(Long campanhaId, Long id) throws IOException {
        Midia m = repo.findById(id)
                .filter(x -> Objects.equals(x.getCampanhaId(), campanhaId))
                .orElseThrow(() -> new IllegalArgumentException("midia nao encontrada"));
        Path p = raiz(campanhaId).resolve(m.getArquivo()).normalize();
        if (p.startsWith(raiz(campanhaId))) Files.deleteIfExists(p);
        if (m.getTipo() == Midia.Tipo.PDF) {
            Files.deleteIfExists(indice.pastaIndice(campanhaId).resolve(m.getChave() + ".json"));
            indice.invalidar(campanhaId);
        }
        repo.delete(m);
    }

    /** Registra o que ja esta no volume mas nao passou pelo envio da tela. */
    @Transactional
    public Map<String, Object> reescanear(Long campanhaId) throws IOException {
        prepararPastas(campanhaId);
        int pdfs = 0, audios = 0, imagens = 0;

        Path dirPdf = raiz(campanhaId).resolve("pdf");
        List<Path> arquivos;
        try (var st = Files.list(dirPdf)) {
            arquivos = st.filter(p -> p.getFileName().toString().toLowerCase().endsWith(".pdf")).sorted().toList();
        }
        for (Path p : arquivos) {
            String ab = semExtensao(p.getFileName().toString()).toUpperCase();
            if (!ab.matches("[A-Z0-9]{2,10}")) {
                log.warn("Ignorei {}: o nome precisa ser a abreviacao, tipo LB.pdf", p.getFileName());
                continue;
            }
            if (repo.findByCampanhaIdAndTipoAndChaveIgnoreCase(campanhaId, Midia.Tipo.PDF, ab).isPresent()) continue;
            registrarPdf(campanhaId, ab, ab, false, p);
            pdfs++;
        }

        Path dirAudio = raiz(campanhaId).resolve("audio");
        List<Path> faixas;
        try (var st = Files.walk(dirAudio, 3)) {
            faixas = st.filter(Files::isRegularFile)
                       .filter(p -> p.getFileName().toString().toLowerCase().matches(".*\\.(mp3|m4a|ogg|wav)$"))
                       .sorted().toList();
        }
        for (Path p : faixas) {
            String nome = semExtensao(p.getFileName().toString());
            Path pai = p.getParent();
            String cat = (pai == null || pai.equals(dirAudio)) ? "Sem categoria" : pai.getFileName().toString();
            String chave = slug(cat) + "/" + slug(nome);
            if (repo.findByCampanhaIdAndTipoAndChaveIgnoreCase(campanhaId, Midia.Tipo.AUDIO, chave).isPresent()) continue;
            Midia m = new Midia();
            m.setCampanhaId(campanhaId);
            m.setTipo(Midia.Tipo.AUDIO);
            m.setChave(chave);
            m.setNome(nome);
            m.setCategoria(cat);
            m.setArquivo(raiz(campanhaId).relativize(p).toString().replace('\\', '/'));
            m.setTamanho(Files.size(p));
            m.setPaginas(0);
            m.setPublico(false);
            m.setEnviadoEm(Instant.now());
            repo.save(m);
            audios++;
        }

        Path dirImg = raiz(campanhaId).resolve("img");
        List<Path> figuras;
        try (var st = Files.list(dirImg)) {
            figuras = st.filter(Files::isRegularFile).sorted().toList();
        }
        for (Path p : figuras) {
            String nome = p.getFileName().toString();
            if (repo.findByCampanhaIdAndTipoAndChaveIgnoreCase(campanhaId, Midia.Tipo.IMG, nome).isPresent()) continue;
            Midia m = new Midia();
            m.setCampanhaId(campanhaId);
            m.setTipo(Midia.Tipo.IMG);
            m.setChave(nome);
            m.setNome(nome);
            m.setCategoria("imagem");
            m.setArquivo("img/" + nome);
            m.setTamanho(Files.size(p));
            m.setPaginas(0);
            m.setPublico(true);
            m.setEnviadoEm(Instant.now());
            repo.save(m);
            imagens++;
        }

        indice.invalidar(campanhaId);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("pdfs", pdfs);
        r.put("audios", audios);
        r.put("imagens", imagens);
        log.info("Campanha {}: reescaneou {} PDFs, {} faixas, {} imagens.", campanhaId, pdfs, audios, imagens);
        return r;
    }

    @Transactional
    public void apagarTudoDaCampanha(Long campanhaId) throws IOException {
        repo.deleteByCampanhaId(campanhaId);
        Path r = raiz(campanhaId);
        if (!Files.isDirectory(r)) return;
        try (var st = Files.walk(r)) {
            st.sorted(Comparator.reverseOrder()).forEach(p -> {
                try { Files.deleteIfExists(p); } catch (Exception ignore) { }
            });
        }
        indice.invalidar(campanhaId);
    }

    // ---------- utilidades ----------

    private void gravar(MultipartFile arquivo, Path destino) throws IOException {
        Files.createDirectories(destino.getParent());
        Path tmp = destino.resolveSibling(destino.getFileName() + ".parcial");
        try (var in = arquivo.getInputStream()) {
            Files.copy(in, tmp, StandardCopyOption.REPLACE_EXISTING);
        }
        Files.move(tmp, destino, StandardCopyOption.REPLACE_EXISTING);
    }

    private int contarPaginas(Path arquivo) {
        try (PDDocument doc = Loader.loadPDF(arquivo.toFile())) {
            return doc.getNumberOfPages();
        } catch (Exception e) {
            log.warn("Nao consegui contar paginas de {}: {}", arquivo, e.getMessage());
            return 0;
        }
    }

    private int indexarPdf(Long campanhaId, String abrev, String nome, Path arquivo, boolean publico)
            throws IOException {
        ObjectNode raiz = om.createObjectNode();
        raiz.put("publico", publico);
        ArrayNode docs = raiz.putArray("docs");
        ArrayNode pages = raiz.putArray("pages");

        int total;
        try (PDDocument doc = Loader.loadPDF(arquivo.toFile())) {
            total = doc.getNumberOfPages();
            PDFTextStripper s = new PDFTextStripper();
            s.setSortByPosition(true);
            for (int i = 1; i <= total; i++) {
                s.setStartPage(i);
                s.setEndPage(i);
                String t = limpar(s.getText(doc));
                if (t.isBlank()) continue;
                ObjectNode p = pages.addObject();
                p.put("d", abrev.toLowerCase());
                p.put("p", i);
                p.put("s", "");
                p.put("t", t);
            }
        }

        ObjectNode d = docs.addObject();
        d.put("id", abrev.toLowerCase());
        d.put("nome", nome == null || nome.isBlank() ? abrev : nome);
        d.put("abrev", abrev);
        d.put("paginas", total);

        Path saida = indice.pastaIndice(campanhaId).resolve(abrev + ".json");
        Files.createDirectories(saida.getParent());
        Files.writeString(saida, om.writeValueAsString(raiz), StandardCharsets.UTF_8);
        return total;
    }

    private String limpar(String s) {
        if (s == null) return "";
        return s.replace('\u0000', ' ').replace("�", "")
                .replaceAll("[ \\t]+\\n", "\n").replaceAll("\\n{3,}", "\n\n").trim();
    }

    private String semExtensao(String s) {
        int i = s.lastIndexOf('.');
        return i > 0 ? s.substring(0, i) : s;
    }

    private String extensao(String s) {
        int i = s.lastIndexOf('.');
        return i > 0 && i < s.length() - 1 ? s.substring(i + 1).toLowerCase() : "";
    }

    public static String slug(String s) {
        String n = Normalizer.normalize(s == null ? "" : s, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "").toLowerCase()
                .replaceAll("[^a-z0-9]+", "-").replaceAll("(^-+)|(-+$)", "");
        return n.isEmpty() ? "x" : n;
    }
}
