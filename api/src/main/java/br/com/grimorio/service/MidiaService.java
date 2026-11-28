package br.com.grimorio.service;

import br.com.grimorio.model.Midia;
import br.com.grimorio.repo.MidiaRepo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.text.Normalizer;
import java.time.Instant;
import java.util.*;

/**
 * PDFs, audio e imagens de uma campanha, guardados em /midia/c{id}/: o catalogo (tabela midia), o envio,
 * a importacao de pacote e o reescanear do volume. Gravar no disco (com o compartilhamento por hard link)
 * e de ArmazenamentoMidia; ler o PDF para a busca e de IndexadorPdf.
 */
@Service
public class MidiaService {

    private static final Logger log = LoggerFactory.getLogger(MidiaService.class);
    private static final String PASTA_AUDIO = "audio";
    private static final String K_TAMANHO = "tamanho";
    private static final String NAO_ACHADA = "midia nao encontrada";
    private static final String SEM_CATEGORIA = "Sem categoria";

    private final MidiaRepo repo;
    private final IndiceService indice;
    private final ArmazenamentoMidia volume;
    private final IndexadorPdf leitorPdf;

    public MidiaService(MidiaRepo repo, IndiceService indice, ArmazenamentoMidia volume, IndexadorPdf leitorPdf) {
        this.repo = repo;
        this.indice = indice;
        this.volume = volume;
        this.leitorPdf = leitorPdf;
    }

    public Path raizGeral() {
        return volume.raizGeral();
    }

    public Path raiz(Long campanhaId) {
        return volume.raiz(campanhaId);
    }

    /** O original inteiro (do cofre, ou do volume enquanto nao migrou), para o pacote. */
    public InputStream abrir(Midia m) throws IOException {
        return volume.abrir(m);
    }

    /** O original existe em algum lugar (cofre ou volume)? */
    public boolean disponivel(Midia m) {
        return volume.disponivel(m);
    }

    public void prepararPastas(Long campanhaId) throws IOException {
        Path r = raiz(campanhaId);
        Files.createDirectories(r.resolve("pdf"));
        Files.createDirectories(r.resolve(PASTA_AUDIO));
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
            d.put(K_TAMANHO, m.getTamanho());
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
                f.put(K_TAMANHO, m.getTamanho());
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
            i.put(K_TAMANHO, m.getTamanho());
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

    @Transactional(rollbackFor = IOException.class)
    public Midia salvarPdf(Long campanhaId, String abrev, String nome, boolean publico,
                           MultipartFile arquivo) throws IOException {
        String ab = (abrev == null ? "" : abrev.trim().toUpperCase());
        if (!ab.matches("[A-Z0-9]{2,10}"))
            throw new IllegalArgumentException("a abreviacao deve ter de 2 a 10 letras ou numeros");
        if (arquivo == null || arquivo.isEmpty()) throw new IllegalArgumentException("arquivo vazio");
        prepararPastas(campanhaId);
        ArmazenamentoMidia.Gravado g = volume.gravar(arquivo);
        volume.apagarLegado(campanhaId, "pdf/" + ab + ".pdf");
        Midia m = registraPdf(campanhaId, ab, nome, publico, g.hash(), g.tamanho());
        m.setReaproveitado(g.reaproveitado());
        return m;
    }

    /** Cataloga um PDF que ja esta no cofre (a importacao de pacote grava antes e registra no fim). */
    @Transactional(rollbackFor = IOException.class)
    public Midia registrarPdf(Long campanhaId, String abrev, String nome, boolean publico,
                              String hash, long tamanho) throws IOException {
        return registraPdf(campanhaId, abrev, nome, publico, hash, tamanho);
    }

    /* o corpo fica fora dos metodos @Transactional: chamado pelo this, a anotacao nao valeria nada */
    private Midia registraPdf(Long campanhaId, String abrev, String nome, boolean publico,
                              String hash, long tamanho) throws IOException {
        String ab = abrev.toUpperCase();
        String rel = "pdf/" + ab + ".pdf";
        ArmazenamentoMidia.ComOriginal original = () -> volume.local(campanhaId, rel, hash);
        int paginas;
        if (indice.temLivro(campanhaId, ab)) {
            paginas = contaPaginas(original);
            log.info("PDF {} registrado sem reindexar: ja existe indice para ele.", ab);
        } else {
            paginas = leitorPdf.copiarIndiceDoGemeo(campanhaId, ab, nome, publico, hash);
            if (paginas == 0) paginas = indexaOuZero(campanhaId, ab, nome, original, publico);
        }
        indice.marcarPublico(campanhaId, ab, publico);

        Midia m = repo.findByCampanhaIdAndTipoAndChaveIgnoreCase(campanhaId, Midia.Tipo.PDF, ab)
                .orElseGet(Midia::new);
        String antigo = m.getHash();
        m.setCampanhaId(campanhaId);
        m.setTipo(Midia.Tipo.PDF);
        m.setChave(ab);
        m.setNome(nome == null || nome.isBlank() ? ab : nome.trim());
        m.setCategoria("livro");
        m.setArquivo(rel);
        m.setTamanho(tamanho);
        m.setHash(hash);
        m.setPaginas(paginas);
        m.setPublico(publico);
        m.setEnviadoEm(Instant.now());
        repo.save(m);
        soltaAntigo(antigo, hash);
        indice.invalidar(campanhaId);
        return m;
    }

    /* o conteudo que a linha deixou de usar sai do cofre se ninguem mais aponta para ele */
    private void soltaAntigo(String antigo, String novo) {
        if (antigo != null && !antigo.equals(novo)) volume.soltarSeOrfao(antigo);
    }

    private int contaPaginas(ArmazenamentoMidia.ComOriginal original) {
        try {
            return leitorPdf.contarPaginas(original.obter());
        } catch (IOException e) {
            log.warn("Nao consegui contar as paginas: {}", e.getMessage());
            return 0;
        }
    }

    /* PDF que nao se le continua guardado e no catalogo, so sem busca: a indexacao nao derruba o envio */
    private int indexaOuZero(Long campanhaId, String ab, String nome, ArmazenamentoMidia.ComOriginal original,
                             boolean publico) {
        try {
            return leitorPdf.indexar(campanhaId, ab, nome, original.obter(), publico)[0];
        } catch (Exception e) {
            log.warn("PDF {} salvo, mas a indexacao falhou: {}", ab, e.getMessage());
            return 0;
        }
    }

    @Transactional(rollbackFor = IOException.class)
    public Midia salvarAudio(Long campanhaId, String categoria, String nome,
                             MultipartFile arquivo) throws IOException {
        if (arquivo == null || arquivo.isEmpty()) throw new IllegalArgumentException("arquivo vazio");
        prepararPastas(campanhaId);
        String cat = categoria == null || categoria.isBlank() ? "Geral" : categoria.trim();
        String original = arquivo.getOriginalFilename() == null ? "faixa.mp3" : arquivo.getOriginalFilename();
        String nomeFinal = nome == null || nome.isBlank() ? semExtensao(original) : nome.trim();
        String ext = extensao(original).isEmpty() ? "mp3" : extensao(original);

        String rel = "audio/" + slug(cat) + "/" + slug(nomeFinal) + "." + ext;
        ArmazenamentoMidia.Gravado g = volume.gravar(arquivo);
        volume.apagarLegado(campanhaId, rel);

        String chave = slug(cat) + "/" + slug(nomeFinal);
        Midia m = repo.findByCampanhaIdAndTipoAndChaveIgnoreCase(campanhaId, Midia.Tipo.AUDIO, chave)
                .orElseGet(Midia::new);
        String antigo = m.getHash();
        m.setCampanhaId(campanhaId);
        m.setTipo(Midia.Tipo.AUDIO);
        m.setChave(chave);
        m.setNome(nomeFinal);
        m.setCategoria(cat);
        m.setArquivo(rel);
        m.setTamanho(g.tamanho());
        m.setPaginas(0);
        m.setPublico(false);
        m.setEnviadoEm(Instant.now());
        m.setHash(g.hash());
        repo.save(m);
        soltaAntigo(antigo, g.hash());
        m.setReaproveitado(g.reaproveitado());
        return m;
    }

    @Transactional(rollbackFor = IOException.class)
    public Midia salvarImagem(Long campanhaId, String nome, MultipartFile arquivo) throws IOException {
        if (arquivo == null || arquivo.isEmpty()) throw new IllegalArgumentException("arquivo vazio");
        prepararPastas(campanhaId);
        String original = arquivo.getOriginalFilename() == null ? "img.webp" : arquivo.getOriginalFilename();
        String base = nome == null || nome.isBlank() ? semExtensao(original) : nome.trim();
        String ext = extensao(original).isEmpty() ? "webp" : extensao(original);
        String arq = slug(base) + "." + ext;
        return gravaImagem(campanhaId, arq, arquivo.getInputStream().readAllBytes());
    }

    /** Usada tambem pela importacao de pacote, que ja tem os bytes. */
    @Transactional(rollbackFor = IOException.class)
    public Midia gravarImagem(Long campanhaId, String nomeArquivo, byte[] bytes) throws IOException {
        return gravaImagem(campanhaId, nomeArquivo, bytes);
    }

    private Midia gravaImagem(Long campanhaId, String nomeArquivo, byte[] bytes) throws IOException {
        prepararPastas(campanhaId);
        String rel = "img/" + nomeArquivo;
        ArmazenamentoMidia.Gravado g = volume.gravar(bytes);
        volume.apagarLegado(campanhaId, rel);
        /* mesmo nome, conteudo novo: as versoes reduzidas da imagem antiga saem */
        Miniaturas.apagar(raiz(campanhaId), nomeArquivo);

        Midia m = repo.findByCampanhaIdAndTipoAndChaveIgnoreCase(campanhaId, Midia.Tipo.IMG, nomeArquivo)
                .orElseGet(Midia::new);
        String antigo = m.getHash();
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
        soltaAntigo(antigo, g.hash());
        m.setReaproveitado(g.reaproveitado());
        return m;
    }

    /** Importacao de pacote: grava no cofre um PDF ou uma faixa que veio no zip (quem chama ja
     *  validou o formato). O fluxo e lido uma vez so, direto do zip; por isso o tamanho vai como
     *  desconhecido, e disco cheio aparece como ArmazenamentoCheioException. */
    public ArmazenamentoMidia.Gravado gravarDoPacote(Long campanhaId, String rel, InputStream in) throws IOException {
        if (volume.legado(campanhaId, rel) == null) throw new IllegalArgumentException("caminho invalido no pacote");
        ArmazenamentoMidia.Gravado g = volume.gravar(() -> in, -1);
        volume.apagarLegado(campanhaId, rel);
        return g;
    }

    /** Importacao de pacote: cataloga a faixa com o nome e a categoria que ela tinha na origem.
     *  A chave e o caminho tambem sao os de la, porque e pela chave que o roteiro cita a faixa. */
    @Transactional(rollbackFor = IOException.class)
    public Midia registrarFaixa(Long campanhaId, String rel, String chave, String nome,
                                String categoria, String hash, long tamanho) throws IOException {
        Path arquivo = Paths.get(rel).normalize();
        Path pai = arquivo.getParent();
        String nomeArq = semExtensao(arquivo.getFileName().toString());
        String cat;
        if (categoria != null && !categoria.isBlank()) cat = corta(categoria.trim(), 60);
        else if (pai == null || pai.toString().replace('\\', '/').equals(PASTA_AUDIO)) cat = SEM_CATEGORIA;
        else cat = pai.getFileName().toString();
        String ch = chave == null || chave.isBlank() ? slug(cat) + "/" + slug(nomeArq) : corta(chave.trim(), 120);
        Midia m = repo.findByCampanhaIdAndTipoAndChaveIgnoreCase(campanhaId, Midia.Tipo.AUDIO, ch)
                .orElseGet(Midia::new);
        String antigo = m.getHash();
        m.setCampanhaId(campanhaId);
        m.setTipo(Midia.Tipo.AUDIO);
        m.setChave(ch);
        m.setNome(nome == null || nome.isBlank() ? nomeArq : corta(nome.trim(), 200));
        m.setCategoria(cat);
        m.setArquivo(rel);
        m.setTamanho(tamanho);
        m.setPaginas(0);
        m.setPublico(false);
        m.setEnviadoEm(Instant.now());
        m.setHash(hash);
        repo.save(m);
        soltaAntigo(antigo, hash);
        return m;
    }

    @Transactional(rollbackFor = IOException.class)
    public void trocarVisibilidade(Long campanhaId, Long id, boolean publico) {
        Midia m = repo.findById(id)
                .filter(x -> Objects.equals(x.getCampanhaId(), campanhaId))
                .orElseThrow(() -> new IllegalArgumentException(NAO_ACHADA));
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
    @Transactional(rollbackFor = IOException.class)
    public Map<String, Object> reindexar(Long campanhaId, Long id) throws IOException {
        Midia m = repo.findById(id)
                .filter(x -> Objects.equals(x.getCampanhaId(), campanhaId) && x.getTipo() == Midia.Tipo.PDF)
                .orElseThrow(() -> new IllegalArgumentException("livro nao encontrado"));
        String ab = m.getChave();
        boolean extraido = Files.exists(indice.pastaIndice(campanhaId).resolve(ab + ".json"));
        if (!extraido && indice.temLivro(campanhaId, ab))
            throw new IllegalArgumentException("este livro tem indice vindo de pacote; ele nao e refeito");
        if (!volume.disponivel(m)) throw new IllegalArgumentException("o PDF nao esta no servidor");
        int[] r = leitorPdf.indexar(campanhaId, ab, m.getNome(), volume.local(m), m.isPublico());
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
    @Transactional(rollbackFor = IOException.class)
    public void editar(Long campanhaId, Long id, String nome, String categoria) {
        Midia m = repo.findById(id)
                .filter(x -> Objects.equals(x.getCampanhaId(), campanhaId))
                .orElseThrow(() -> new IllegalArgumentException(NAO_ACHADA));
        if (nome != null && !nome.isBlank()) m.setNome(corta(nome.trim(), 200));
        if (categoria != null && !categoria.isBlank() && m.getTipo() == Midia.Tipo.AUDIO)
            m.setCategoria(corta(categoria.trim(), 60));
        repo.save(m);
    }

    private static String corta(String s, int max) { return s.length() > max ? s.substring(0, max) : s; }

    @Transactional(rollbackFor = IOException.class)
    public void remover(Long campanhaId, Long id) throws IOException {
        Midia m = repo.findById(id)
                .filter(x -> Objects.equals(x.getCampanhaId(), campanhaId))
                .orElseThrow(() -> new IllegalArgumentException(NAO_ACHADA));
        volume.apagarLegado(campanhaId, m.getArquivo());
        if (m.getTipo() == Midia.Tipo.IMG) Miniaturas.apagar(raiz(campanhaId), m.getChave());
        if (m.getTipo() == Midia.Tipo.PDF) {
            Files.deleteIfExists(indice.pastaIndice(campanhaId).resolve(m.getChave() + ".json"));
            indice.invalidar(campanhaId);
        }
        repo.delete(m);
        volume.soltarSeOrfao(m.getHash());
    }

    /** Registra o que foi posto direto no volume (railway volume files upload) e nao passou pelo envio
     *  da tela. O conteudo vai para o cofre; o arquivo fica no volume ate a Administracao liberar. */
    @Transactional(rollbackFor = IOException.class)
    public Map<String, Object> reescanear(Long campanhaId) throws IOException {
        prepararPastas(campanhaId);
        int pdfs = reescanearPdfs(campanhaId);
        int audios = reescanearFaixas(campanhaId);
        int imagens = reescanearImagens(campanhaId);
        indice.invalidar(campanhaId);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("pdfs", pdfs);
        r.put("audios", audios);
        r.put("imagens", imagens);
        log.info("Campanha {}: reescaneou {} PDFs, {} faixas, {} imagens.", campanhaId, pdfs, audios, imagens);
        return r;
    }

    /* o nome do arquivo e a sigla do livro (LB.pdf): o que nao segue isso fica de fora, com aviso no log */
    private int reescanearPdfs(Long campanhaId) throws IOException {
        int pdfs = 0;
        List<Path> arquivos;
        try (var st = Files.list(raiz(campanhaId).resolve("pdf"))) {
            arquivos = st.filter(p -> p.getFileName().toString().toLowerCase().endsWith(".pdf")).sorted().toList();
        }
        for (Path p : arquivos) {
            String ab = semExtensao(p.getFileName().toString()).toUpperCase();
            if (!ab.matches("[A-Z0-9]{2,10}")) {
                log.warn("Ignorei {}: o nome precisa ser a abreviacao, tipo LB.pdf", p.getFileName());
            } else if (repo.findByCampanhaIdAndTipoAndChaveIgnoreCase(campanhaId, Midia.Tipo.PDF, ab).isEmpty()) {
                registraPdf(campanhaId, ab, ab, false, volume.ingerir(p), Files.size(p));
                pdfs++;
            }
        }
        return pdfs;
    }

    private int reescanearFaixas(Long campanhaId) throws IOException {
        int audios = 0;
        Path dirAudio = raiz(campanhaId).resolve(PASTA_AUDIO);
        List<Path> faixas;
        try (var st = Files.walk(dirAudio, 3)) {
            faixas = st.filter(Files::isRegularFile)
                       .filter(p -> p.getFileName().toString().toLowerCase().matches(".*\\.(mp3|m4a|ogg|wav)$"))
                       .sorted().toList();
        }
        for (Path p : faixas) {
            String nome = semExtensao(p.getFileName().toString());
            Path pai = p.getParent();
            String cat = (pai == null || pai.equals(dirAudio)) ? SEM_CATEGORIA : pai.getFileName().toString();
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
            m.setHash(volume.ingerir(p));
            repo.save(m);
            audios++;
        }
        return audios;
    }

    private int reescanearImagens(Long campanhaId) throws IOException {
        int imagens = 0;
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
            m.setHash(volume.ingerir(p));
            repo.save(m);
            imagens++;
        }
        return imagens;
    }

    @Transactional(rollbackFor = IOException.class)
    public void apagarTudoDaCampanha(Long campanhaId) throws IOException {
        List<String> hashes = repo.findByCampanhaId(campanhaId).stream()
                .map(Midia::getHash).filter(Objects::nonNull).distinct().toList();
        repo.deleteByCampanhaId(campanhaId);
        /* o que so esta campanha usava sai do cofre; o que outra campanha tambem usa fica */
        for (String h : hashes) volume.soltarSeOrfao(h);
        Path r = raiz(campanhaId);
        if (!Files.isDirectory(r)) return;
        try (var st = Files.walk(r)) {
            st.sorted(Comparator.reverseOrder()).forEach(p -> {
                try { Files.deleteIfExists(p); }
                catch (IOException _) { /* o que nao saiu agora (arquivo em uso) fica no volume, ja sem catalogo */ }
            });
        }
        indice.invalidar(campanhaId);
    }

    // ---------- utilidades ----------

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
                .replaceAll("[^a-z0-9]+", "-");
        /* a troca acima junta cada sequencia num hifen so: sobra no maximo um em cada ponta */
        if (n.startsWith("-")) n = n.substring(1);
        if (n.endsWith("-")) n = n.substring(0, n.length() - 1);
        return n.isEmpty() ? "x" : n;
    }
}
