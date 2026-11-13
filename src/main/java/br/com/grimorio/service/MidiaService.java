package br.com.grimorio.service;

import br.com.grimorio.config.AppProps;
import br.com.grimorio.model.Midia;
import br.com.grimorio.repo.MidiaRepo;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.apache.pdfbox.text.PDFTextStripper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.DigestInputStream;
import java.security.MessageDigest;
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
            i.put("arquivo", m.getArquivo());
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
        Gravado g = gravar(arquivo, destino);
        Midia m = registrarPdf(campanhaId, ab, nome, publico, destino, g.hash());
        m.setReaproveitado(g.reaproveitado());
        return m;
    }

    @Transactional
    public Midia registrarPdf(Long campanhaId, String abrev, String nome, boolean publico,
                              Path arquivo) throws IOException {
        return registrarPdf(campanhaId, abrev, nome, publico, arquivo, null);
    }

    @Transactional
    public Midia registrarPdf(Long campanhaId, String abrev, String nome, boolean publico,
                              Path arquivo, String hash) throws IOException {
        String ab = abrev.toUpperCase();
        /* veio do reescanear (arquivo posto direto no volume): junta com uma copia igual, se houver */
        String h = hash != null ? hash : desduplicar(arquivo);
        int paginas, copiadas;
        if (indice.temLivro(campanhaId, ab)) {
            paginas = contarPaginas(arquivo);
            log.info("PDF {} registrado sem reindexar: ja existe indice para ele.", ab);
        } else if ((copiadas = copiarIndiceDoGemeo(campanhaId, ab, nome, publico, h)) > 0) {
            paginas = copiadas;
        } else {
            paginas = 0;
            try {
                paginas = indexarPdf(campanhaId, ab, nome, arquivo, publico)[0];
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
        m.setHash(h);
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
        Gravado g = gravar(arquivo, destino);

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
        m.setHash(g.hash());
        repo.save(m);
        m.setReaproveitado(g.reaproveitado());
        return m;
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
        /* nunca Files.write no caminho: se ele for um link compartilhado, mudaria a imagem dos outros */
        Gravado g = gravarCompartilhado(new ByteArrayInputStream(bytes), destino);

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
        m.setHash(g.hash());
        repo.save(m);
        m.setReaproveitado(g.reaproveitado());
        return m;
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

    /**
     * Refaz o indice de busca de um livro a partir do PDF que ja esta no volume. Serve
     * para livro enviado antes de o servidor ler os capitulos. Indice que veio de pacote
     * (curado a mao, em arquivos ABREV-*.json) nao e tocado: a curadoria vence.
     */
    @Transactional
    public Map<String, Object> reindexar(Long campanhaId, Long id) throws IOException {
        Midia m = repo.findById(id)
                .filter(x -> Objects.equals(x.getCampanhaId(), campanhaId) && x.getTipo() == Midia.Tipo.PDF)
                .orElseThrow(() -> new IllegalArgumentException("livro nao encontrado"));
        String ab = m.getChave();
        boolean extraido = Files.exists(indice.pastaIndice(campanhaId).resolve(ab + ".json"));
        if (!extraido && indice.temLivro(campanhaId, ab))
            throw new IllegalArgumentException("este livro tem indice vindo de pacote; ele nao e refeito");
        Path arquivo = raiz(campanhaId).resolve(m.getArquivo()).normalize();
        if (!arquivo.startsWith(raiz(campanhaId)) || !Files.exists(arquivo))
            throw new IllegalArgumentException("o PDF nao esta no servidor");
        int[] r = indexarPdf(campanhaId, ab, m.getNome(), arquivo, m.isPublico());
        m.setPaginas(r[0]);
        repo.save(m);
        indice.invalidar(campanhaId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("paginas", r[0]);
        out.put("comCapitulo", r[1]);
        return out;
    }

    /**
     * Troca o nome de exibicao e, em faixa de audio, a categoria. A chave nao muda:
     * e ela que liga o PDF ao indice e a faixa ao roteiro que a cita.
     */
    @Transactional
    public void editar(Long campanhaId, Long id, String nome, String categoria) {
        Midia m = repo.findById(id)
                .filter(x -> Objects.equals(x.getCampanhaId(), campanhaId))
                .orElseThrow(() -> new IllegalArgumentException("midia nao encontrada"));
        if (nome != null && !nome.isBlank()) m.setNome(corta(nome.trim(), 200));
        if (categoria != null && !categoria.isBlank() && m.getTipo() == Midia.Tipo.AUDIO)
            m.setCategoria(corta(categoria.trim(), 60));
        repo.save(m);
    }

    private static String corta(String s, int max) { return s.length() > max ? s.substring(0, max) : s; }

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
            m.setHash(desduplicar(p));
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
            m.setHash(desduplicar(p));
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

    // ---------- armazenamento compartilhado ----------
    /* O mesmo conteudo, enviado por quem for e com o nome que for, ocupa o volume uma vez so:
       o segundo caminho vira um hard link do primeiro. Quem conta as referencias e o sistema de
       arquivos: apagar um caminho tira so aquela referencia, e o conteudo sai do disco quando o
       ultimo caminho for apagado. Por isso nenhum arquivo de midia pode ser reescrito no lugar
       (Files.write no caminho existente): com o link, a mudanca apareceria para todos. Troca de
       arquivo e sempre "grava ao lado e move por cima", que so mexe naquele caminho. */

    public record Gravado(String hash, boolean reaproveitado) { }

    /* folga que fica livre no volume: banco H2 local, indices e logs tambem precisam de espaco */
    private static final long FOLGA = 32L * 1024 * 1024;

    interface Fonte { InputStream abrir() throws IOException; }

    private Gravado gravar(MultipartFile arquivo, Path destino) throws IOException {
        return gravarCompartilhado(arquivo::getInputStream, arquivo.getSize(), destino);
    }

    private Gravado gravarCompartilhado(InputStream in, Path destino) throws IOException {
        byte[] b = in.readAllBytes();
        return gravarCompartilhado(() -> new ByteArrayInputStream(b), b.length, destino);
    }

    private Gravado gravarCompartilhado(Fonte fonte, long tamanho, Path destino) throws IOException {
        Files.createDirectories(destino.getParent());
        if (tamanho >= 0 && semEspaco(destino.getParent(), tamanho)) {
            /* Sem espaco para gravar, mas talvez nem precise: se o conteudo ja existe no volume,
               o link nao ocupa nada. So entao o envio e recusado como armazenamento cheio. */
            String h;
            try (InputStream in = fonte.abrir()) { h = hashDe(in); }
            Path igual = acharIgual(h, tamanho);
            if (igual != null && Files.exists(destino) && Files.isSameFile(igual, destino)) return new Gravado(h, true);
            if (igual != null && ligar(igual, destino)) return new Gravado(h, true);
            throw new ArmazenamentoCheioException();
        }
        Path tmp = destino.resolveSibling(destino.getFileName() + ".parcial");
        MessageDigest md = sha256();
        try (InputStream din = new DigestInputStream(fonte.abrir(), md)) {
            Files.copy(din, tmp, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            Files.deleteIfExists(tmp);
            if (discoCheio(e)) throw new ArmazenamentoCheioException();
            throw e;
        }
        String h = hex(md.digest());
        Path igual = acharIgual(h, Files.size(tmp));
        if (igual != null) {
            /* reenvio do mesmo arquivo para o mesmo lugar: ja esta la */
            if (Files.exists(destino) && Files.isSameFile(igual, destino)) {
                Files.deleteIfExists(tmp);
                return new Gravado(h, true);
            }
            if (ligar(igual, destino)) {
                Files.deleteIfExists(tmp);
                return new Gravado(h, true);
            }
        }
        Files.move(tmp, destino, StandardCopyOption.REPLACE_EXISTING);
        return new Gravado(h, false);
    }

    /* um arquivo de outra linha do catalogo com o mesmo hash e o mesmo tamanho, ainda no disco */
    private Path acharIgual(String hash, long tamanho) {
        for (Midia o : repo.findByHash(hash)) {
            Path p = raiz(o.getCampanhaId()).resolve(o.getArquivo()).normalize();
            try {
                if (Files.isRegularFile(p) && Files.size(p) == tamanho) return p;
            } catch (IOException ignore) { }
        }
        return null;
    }

    /* Troca destino por um link para origem sem nunca deixar destino sem conteudo: o link nasce
       ao lado e so entao toma o lugar. Volume que nao aceita hard link fica com a copia. */
    private boolean ligar(Path origem, Path destino) {
        Path lnk = destino.resolveSibling(destino.getFileName() + ".lnk");
        try {
            Files.deleteIfExists(lnk);
            Files.createLink(lnk, origem);
            Files.move(lnk, destino, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            return true;
        } catch (Exception e) {
            try { Files.deleteIfExists(lnk); } catch (IOException ignore) { }
            log.warn("Nao consegui compartilhar {} com {} ({}): fica como copia.", destino, origem, e.toString());
            return false;
        }
    }

    /* Arquivo que ja esta no volume: calcula o hash e, se outra linha tiver o mesmo conteudo,
       troca este por um link para aquele. Devolve o hash. */
    private String desduplicar(Path p) throws IOException {
        String h = hashArquivo(p);
        Path igual = acharIgual(h, Files.size(p));
        if (igual != null && !Files.isSameFile(igual, p)) ligar(igual, p);
        return h;
    }

    /** Roda no boot, em segundo plano: poe hash no que veio de antes desta versao e junta as
     *  copias iguais que ja estavam no volume. Devolve quantos bytes deixaram de ser duplicados. */
    /** O mesmo PDF ja indexado em outra campanha (ou com outra sigla): o indice de busca e o
     *  mesmo texto, entao copia em vez de extrair tudo de novo. Le o indice do gemeo, troca o que
     *  e desta campanha (sigla, nome, publico) e grava ao lado. Devolve as paginas, ou 0 se nao
     *  houver gemeo com indice. */
    private int copiarIndiceDoGemeo(Long campanhaId, String ab, String nome, boolean publico, String hash) {
        if (hash == null) return 0;
        for (Midia o : repo.findByHash(hash)) {
            if (o.getTipo() != Midia.Tipo.PDF) continue;
            if (Objects.equals(o.getCampanhaId(), campanhaId) && o.getChave().equalsIgnoreCase(ab)) continue;
            Path origem = indice.pastaIndice(o.getCampanhaId()).resolve(o.getChave() + ".json");
            if (!Files.isRegularFile(origem)) continue;
            try {
                ObjectNode raiz = (ObjectNode) om.readTree(Files.readString(origem, StandardCharsets.UTF_8));
                String id = ab.toLowerCase();
                raiz.put("publico", publico);
                int paginas = 0;
                for (var d : raiz.withArray("docs")) {
                    ObjectNode doc = (ObjectNode) d;
                    doc.put("id", id);
                    doc.put("abrev", ab);
                    doc.put("nome", nome == null || nome.isBlank() ? ab : nome.trim());
                    paginas = Math.max(paginas, doc.path("paginas").asInt(0));
                }
                for (var p : raiz.withArray("pages")) ((ObjectNode) p).put("d", id);
                if (paginas == 0) paginas = raiz.withArray("pages").size();
                Path destino = indice.pastaIndice(campanhaId).resolve(ab + ".json");
                Files.createDirectories(destino.getParent());
                Path tmp = destino.resolveSibling(destino.getFileName() + ".parcial");
                Files.writeString(tmp, om.writeValueAsString(raiz), StandardCharsets.UTF_8);
                Files.move(tmp, destino, StandardCopyOption.REPLACE_EXISTING);
                log.info("PDF {} da campanha {}: indice copiado de {} da campanha {}, sem reprocessar o arquivo.",
                        ab, campanhaId, o.getChave(), o.getCampanhaId());
                return Math.max(1, paginas);
            } catch (Exception e) {
                log.warn("Nao consegui copiar o indice de {}: {}", origem, e.getMessage());
            }
        }
        return 0;
    }

    // ---------- estado do armazenamento (so a Administracao ve) ----------

    private volatile Boolean linksOk;

    /** O volume aceita hard link? Testa uma vez com dois arquivos de rascunho na pasta de midia. */
    public boolean linksDisponiveis() {
        if (linksOk != null) return linksOk;
        Path a = raizGeral().resolve(".teste-link-a"), b = raizGeral().resolve(".teste-link-b");
        boolean ok = false;
        try {
            Files.createDirectories(raizGeral());
            Files.deleteIfExists(b);
            Files.writeString(a, "grimorio");
            Files.createLink(b, a);
            ok = Files.isSameFile(a, b);
        } catch (Exception e) {
            log.warn("O volume de midia NAO aceita hard link ({}): arquivo repetido vai ocupar espaco proprio.", e.toString());
        } finally {
            try { Files.deleteIfExists(b); Files.deleteIfExists(a); } catch (IOException ignore) { }
        }
        if (ok) log.info("Volume de midia aceita hard link: arquivos iguais ocupam espaco uma vez so.");
        linksOk = ok;
        return ok;
    }

    /** Para o painel do administrador: espaco do volume, o que a midia ocupa de verdade, a
     *  economia do compartilhamento e o uso de cada campanha. "Ocupa de verdade" conta cada
     *  conteudo uma vez; o uso por campanha conta tudo que ela referencia. */
    public Map<String, Object> estadoArmazenamento(Map<Long, String> nomes) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("links", linksDisponiveis());
        try {
            FileStore fs = Files.getFileStore(raizGeral());
            r.put("livre", fs.getUsableSpace());
            r.put("total", fs.getTotalSpace());
        } catch (IOException e) {
            r.put("livre", -1); r.put("total", -1);
        }
        long economia = 0, usado = 0; int compartilhados = 0;
        Map<String, Path> primeiro = new HashMap<>();
        Map<Long, long[]> porCamp = new TreeMap<>();
        for (Midia m : repo.findAll()) {
            Path p = raiz(m.getCampanhaId()).resolve(m.getArquivo()).normalize();
            try {
                if (!Files.isRegularFile(p)) continue;
                long tam = Files.size(p);
                long[] c = porCamp.computeIfAbsent(m.getCampanhaId(), k -> new long[3]);
                c[0]++; c[1] += tam;
                Path o = m.getHash() == null ? null : primeiro.putIfAbsent(m.getHash(), p);
                if (o != null && Files.isSameFile(o, p)) { economia += tam; compartilhados++; c[2]++; }
                else usado += tam;
            } catch (IOException ignore) { }
        }
        List<Map<String, Object>> lista = new ArrayList<>();
        porCamp.forEach((cid, c) -> {
            Map<String, Object> x = new LinkedHashMap<>();
            x.put("id", cid);
            x.put("nome", nomes.getOrDefault(cid, "campanha apagada (#" + cid + ")"));
            x.put("arquivos", c[0]);
            x.put("bytes", c[1]);
            x.put("compartilhados", c[2]);
            lista.add(x);
        });
        lista.sort((a, b) -> Long.compare((long) b.get("bytes"), (long) a.get("bytes")));
        r.put("usado", usado);
        r.put("economizado", economia);
        r.put("compartilhados", compartilhados);
        r.put("porCampanha", lista);
        return r;
    }

    public long desduplicarVolume() {
        linksDisponiveis();
        long liberado = 0;
        int calculados = 0, ligados = 0;
        for (Midia m : repo.findByHashIsNull()) {
            Path p = raiz(m.getCampanhaId()).resolve(m.getArquivo()).normalize();
            if (!Files.isRegularFile(p)) continue;
            try { m.setHash(hashArquivo(p)); repo.save(m); calculados++; }
            catch (Exception e) { log.warn("Sem hash para {}: {}", p, e.getMessage()); }
        }
        Map<String, Path> primeiro = new HashMap<>();
        for (Midia m : repo.findByHashIsNotNullOrderByIdAsc()) {
            Path p = raiz(m.getCampanhaId()).resolve(m.getArquivo()).normalize();
            try {
                if (!Files.isRegularFile(p)) continue;
                Path origem = primeiro.putIfAbsent(m.getHash(), p);
                if (origem == null || Files.isSameFile(origem, p) || Files.size(origem) != Files.size(p)) continue;
                long tam = Files.size(p);
                if (ligar(origem, p)) { liberado += tam; ligados++; }
            } catch (Exception e) {
                log.warn("Nao consegui juntar {}: {}", p, e.getMessage());
            }
        }
        if (calculados > 0 || ligados > 0)
            log.info("Midia: {} arquivos ganharam hash, {} copias viraram compartilhadas, {} MB liberados.",
                    calculados, ligados, liberado / (1024 * 1024));
        return liberado;
    }

    private static boolean semEspaco(Path pasta, long tamanho) {
        try { return Files.getFileStore(pasta).getUsableSpace() < tamanho + FOLGA; }
        catch (IOException e) { return false; }
    }

    /* o espaco pode acabar no meio da gravacao (outro envio ao mesmo tempo): a mensagem do
       sistema operacional e o unico sinal, e muda de Linux para Windows */
    private static boolean discoCheio(Throwable e) {
        for (Throwable x = e; x != null; x = x.getCause()) {
            String m = String.valueOf(x.getMessage()).toLowerCase();
            if (m.contains("no space left") || m.contains("not enough space") || m.contains("disk full")
                    || m.contains("espaço suficiente") || m.contains("espaco suficiente") || m.contains("quota")) return true;
        }
        return false;
    }

    private static String hashDe(InputStream in) throws IOException {
        MessageDigest md = sha256();
        try (InputStream din = new DigestInputStream(in, md)) {
            din.transferTo(java.io.OutputStream.nullOutputStream());
        }
        return hex(md.digest());
    }

    private static String hashArquivo(Path p) throws IOException {
        MessageDigest md = sha256();
        try (InputStream in = new DigestInputStream(Files.newInputStream(p), md)) {
            in.transferTo(java.io.OutputStream.nullOutputStream());
        }
        return hex(md.digest());
    }

    private static MessageDigest sha256() {
        try { return MessageDigest.getInstance("SHA-256"); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }

    private static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder(b.length * 2);
        for (byte x : b) sb.append(String.format("%02x", x));
        return sb.toString();
    }

    private int contarPaginas(Path arquivo) {
        try (PDDocument doc = Loader.loadPDF(arquivo.toFile())) {
            return doc.getNumberOfPages();
        } catch (Exception e) {
            log.warn("Nao consegui contar paginas de {}: {}", arquivo, e.getMessage());
            return 0;
        }
    }

    /** Devolve {total de paginas, paginas que ganharam titulo de capitulo}. */
    private int[] indexarPdf(Long campanhaId, String abrev, String nome, Path arquivo, boolean publico)
            throws IOException {
        ObjectNode raiz = om.createObjectNode();
        raiz.put("publico", publico);
        ArrayNode docs = raiz.putArray("docs");
        ArrayNode pages = raiz.putArray("pages");

        int total, comSecao = 0;
        try (PDDocument doc = Loader.loadPDF(arquivo.toFile())) {
            total = doc.getNumberOfPages();
            String[] secao = secoesPorPagina(doc, total);
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
                p.put("s", secao[i]);
                if (!secao[i].isEmpty()) comSecao++;
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
        return new int[]{total, comSecao};
    }

    /**
     * Titulo do capitulo de cada pagina (indice 1..total), tirado do sumario que o
     * proprio PDF carrega (os marcadores). Nao adivinha capitulo pelo texto: fonte
     * e diagramacao variam demais de livro para livro, e titulo errado atrapalha a
     * busca mais do que titulo nenhum. PDF sem marcadores fica com tudo vazio.
     */
    private String[] secoesPorPagina(PDDocument doc, int total) {
        String[] out = new String[total + 2];
        Arrays.fill(out, "");
        try {
            PDDocumentOutline raizSumario = doc.getDocumentCatalog().getDocumentOutline();
            if (raizSumario == null) return out;
            // em cada pagina vale a ultima entrada do sumario que aponta para ela
            String[] marca = new String[total + 2];
            coletarSumario(doc, raizSumario.getFirstChild(), "", 0, marca, new int[]{0});
            String atual = "";
            for (int i = 1; i <= total; i++) {
                if (marca[i] != null) atual = marca[i];
                out[i] = atual;
            }
        } catch (Exception e) {
            log.warn("Nao consegui ler o sumario do PDF: {}", e.getMessage());
        }
        return out;
    }

    private void coletarSumario(PDDocument doc, PDOutlineItem item, String capitulo, int nivel,
                                String[] marca, int[] visitados) {
        // sumario malformado pode ter ciclo; o teto evita laco infinito
        while (item != null && visitados[0]++ < 20000) {
            String titulo = item.getTitle() == null ? "" : item.getTitle().replaceAll("\\s+", " ").trim();
            String rotulo = nivel == 0 || capitulo.isEmpty() ? titulo : capitulo + " · " + titulo;
            try {
                PDPage pg = item.findDestinationPage(doc);
                // indexOf compara o objeto do PDF por baixo: cada leitura devolve um PDPage novo
                int n = pg == null ? 0 : doc.getPages().indexOf(pg) + 1;
                if (n >= 1 && n < marca.length && !titulo.isEmpty()) marca[n] = rotulo.length() > 160 ? rotulo.substring(0, 160) : rotulo;
            } catch (Exception ignore) { }
            if (nivel < 2) coletarSumario(doc, item.getFirstChild(), nivel == 0 ? titulo : capitulo, nivel + 1, marca, visitados);
            item = item.getNextSibling();
        }
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
