package br.com.hexatombe.service;

import br.com.hexatombe.config.AppProps;
import br.com.hexatombe.model.Midia;
import br.com.hexatombe.repo.MidiaRepo;
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
import java.util.*;

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

    private Path raiz() {
        return Paths.get(props.getMidiaDir()).toAbsolutePath().normalize();
    }

    /** Monta o catalogo que o front usa no lugar da pasta local. */
    @Transactional(readOnly = true)
    public Map<String, Object> catalogo() {
        Map<String, Object> out = new LinkedHashMap<>();

        List<Map<String, Object>> docs = new ArrayList<>();
        for (Midia m : repo.findByTipoOrderByCategoriaAscNomeAsc(Midia.Tipo.PDF)) {
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("id", m.getId());
            d.put("abrev", m.getChave());
            d.put("nome", m.getNome());
            d.put("paginas", m.getPaginas());
            d.put("tamanho", m.getTamanho());
            d.put("url", url(m.getArquivo()));
            docs.add(d);
        }
        out.put("docs", docs);

        List<Map<String, Object>> faixas = new ArrayList<>();
        for (Midia m : repo.findByTipoOrderByCategoriaAscNomeAsc(Midia.Tipo.AUDIO)) {
            Map<String, Object> f = new LinkedHashMap<>();
            f.put("id", m.getId());
            f.put("chave", m.getChave());
            f.put("nome", m.getNome());
            f.put("cat", m.getCategoria() == null ? "" : m.getCategoria());
            f.put("tamanho", m.getTamanho());
            f.put("url", url(m.getArquivo()));
            faixas.add(f);
        }
        out.put("faixas", faixas);
        return out;
    }

    private String url(String relativo) {
        StringBuilder sb = new StringBuilder("/midia");
        for (String parte : relativo.split("/")) {
            if (parte.isEmpty()) continue;
            sb.append('/').append(URLEncoder.encode(parte, StandardCharsets.UTF_8).replace("+", "%20"));
        }
        return sb.toString();
    }

    @Transactional
    public Midia salvarPdf(String abrev, String nome, MultipartFile arquivo) throws IOException {
        String ab = (abrev == null ? "" : abrev.trim().toUpperCase());
        if (ab.isEmpty()) throw new IllegalArgumentException("informe a abreviacao (LB, SH, AS01...)");
        if (!ab.matches("[A-Z0-9]{2,10}")) throw new IllegalArgumentException("abreviacao deve ter 2 a 10 letras ou numeros");
        if (arquivo == null || arquivo.isEmpty()) throw new IllegalArgumentException("arquivo vazio");

        Path destino = raiz().resolve("pdf").resolve(ab + ".pdf");
        Files.createDirectories(destino.getParent());
        gravar(arquivo, destino);

        int paginas = 0;
        try {
            paginas = indexarPdf(ab, nome, destino);
        } catch (Exception e) {
            log.warn("PDF {} salvo, mas a indexacao falhou: {}", ab, e.getMessage());
        }

        Midia m = repo.findByTipoAndChaveIgnoreCase(Midia.Tipo.PDF, ab).orElseGet(Midia::new);
        m.setTipo(Midia.Tipo.PDF);
        m.setChave(ab);
        m.setNome(nome == null || nome.isBlank() ? ab : nome.trim());
        m.setCategoria("livro");
        m.setArquivo("pdf/" + ab + ".pdf");
        m.setTamanho(Files.size(destino));
        m.setPaginas(paginas);
        m.setEnviadoEm(java.time.Instant.now());
        repo.save(m);
        indice.invalidar();
        return m;
    }

    @Transactional
    public Midia salvarAudio(String categoria, String nome, MultipartFile arquivo) throws IOException {
        if (arquivo == null || arquivo.isEmpty()) throw new IllegalArgumentException("arquivo vazio");
        String cat = categoria == null || categoria.isBlank() ? "Geral" : categoria.trim();
        String original = arquivo.getOriginalFilename() == null ? "faixa.mp3" : arquivo.getOriginalFilename();
        String nomeFinal = nome == null || nome.isBlank() ? semExtensao(original) : nome.trim();
        String ext = extensao(original);
        if (ext.isEmpty()) ext = "mp3";

        String arqRel = "audio/" + slug(cat) + "/" + slug(nomeFinal) + "." + ext;
        Path destino = raiz().resolve(arqRel);
        Files.createDirectories(destino.getParent());
        gravar(arquivo, destino);

        String chave = slug(cat) + "/" + slug(nomeFinal);
        Midia m = repo.findByTipoAndChaveIgnoreCase(Midia.Tipo.AUDIO, chave).orElseGet(Midia::new);
        m.setTipo(Midia.Tipo.AUDIO);
        m.setChave(chave);
        m.setNome(nomeFinal);
        m.setCategoria(cat);
        m.setArquivo(arqRel);
        m.setTamanho(Files.size(destino));
        m.setPaginas(0);
        m.setEnviadoEm(java.time.Instant.now());
        return repo.save(m);
    }

    @Transactional
    public void remover(Long id) throws IOException {
        Midia m = repo.findById(id).orElseThrow(() -> new IllegalArgumentException("midia nao encontrada"));
        Path p = raiz().resolve(m.getArquivo()).normalize();
        if (p.startsWith(raiz())) Files.deleteIfExists(p);
        if (m.getTipo() == Midia.Tipo.PDF) {
            Files.deleteIfExists(raiz().resolve("indice").resolve(m.getChave() + ".json"));
            indice.invalidar();
        }
        repo.delete(m);
    }

    private void gravar(MultipartFile arquivo, Path destino) throws IOException {
        Path tmp = destino.resolveSibling(destino.getFileName() + ".parcial");
        try (var in = arquivo.getInputStream()) {
            Files.copy(in, tmp, StandardCopyOption.REPLACE_EXISTING);
        }
        Files.move(tmp, destino, StandardCopyOption.REPLACE_EXISTING);
    }

    /**
     * Extrai o texto pagina por pagina e grava um indice no mesmo formato dos
     * que vem embutidos no jar. Fica guardado na pasta de midia, entao sobrevive
     * a um redeploy.
     */
    private int indexarPdf(String abrev, String nome, Path arquivo) throws IOException {
        ObjectNode raiz = om.createObjectNode();
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

        Path saida = raiz().resolve("indice").resolve(abrev + ".json");
        Files.createDirectories(saida.getParent());
        Files.writeString(saida, om.writeValueAsString(raiz), StandardCharsets.UTF_8);
        return total;
    }

    private String limpar(String s) {
        if (s == null) return "";
        return s.replace('\u0000', ' ')
                .replace("�", "")
                .replaceAll("[ \\t]+\\n", "\n")
                .replaceAll("\\n{3,}", "\n\n")
                .trim();
    }

    private String semExtensao(String s) {
        int i = s.lastIndexOf('.');
        return i > 0 ? s.substring(0, i) : s;
    }

    private String extensao(String s) {
        int i = s.lastIndexOf('.');
        return i > 0 && i < s.length() - 1 ? s.substring(i + 1).toLowerCase() : "";
    }

    /** Nome de arquivo sem acento nem espaco, para a URL nao virar um problema. */
    public static String slug(String s) {
        String n = Normalizer.normalize(s == null ? "" : s, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase()
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-+)|(-+$)", "");
        return n.isEmpty() ? "x" : n;
    }
}
