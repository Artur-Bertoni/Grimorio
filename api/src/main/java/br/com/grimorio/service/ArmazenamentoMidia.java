package br.com.grimorio.service;

import br.com.grimorio.config.AppProps;
import br.com.grimorio.model.Midia;
import br.com.grimorio.repo.MidiaRepo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.FileStore;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.FileTime;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * Os arquivos originais da midia: gravar, ler e apagar, sempre pelo {@link Cofre} (o bucket em producao).
 *
 * <p>Cada conteudo vai para o cofre uma vez so, na chave {@code midia/{sha256}}: o mesmo PDF em duas
 * campanhas, ou reenviado com outro nome, e um objeto. A tabela midia guarda o nome e o caminho
 * logico ({@code pdf/LB.pdf}) de cada campanha e o hash que aponta para o objeto. Apagar uma linha so
 * tira o objeto quando nenhuma outra linha usa o mesmo hash.
 *
 * <p>O volume ({@code /data/midia}) fica com o que e derivado e pequeno: indice de busca, miniaturas e
 * pedacos do mapa. Tambem guarda, ate a Administracao liberar, os originais de antes do bucket: o que
 * ainda nao esta no cofre continua sendo lido dali ({@link #legado}). Ao lado dele, {@code
 * cache-arquivos/} guarda os originais lidos ou recebidos por ultimo (para indexar PDF, reduzir imagem e
 * cortar mapa sem baixar de novo), limitado a CACHE_ARQUIVOS_MB.
 */
@Component
public class ArmazenamentoMidia {

    private static final Logger log = LoggerFactory.getLogger(ArmazenamentoMidia.class);
    private static final String PARCIAL = ".parcial";

    /** O hash do conteudo gravado, se ele ja estava no cofre (nao ocupou nada) e o tamanho. */
    public record Gravado(String hash, boolean reaproveitado, long tamanho) { }

    /** Um arquivo pronto para servir: tamanho, quando mudou (-1 se nao se sabe) e como abrir um trecho. */
    public record Conteudo(long tamanho, long modificado, Abertura abertura) { }

    public interface Abertura { InputStream abrir(long inicio, long fim) throws IOException; }

    /** Quem so precisa do original se for refazer algo (a miniatura, o corte do mapa). */
    public interface ComOriginal { Path obter() throws IOException; }

    /* folga que fica livre no disco: banco H2 local, indices e logs tambem precisam de espaco */
    private static final long FOLGA = 32L * 1024 * 1024;

    interface Fonte { InputStream abrir() throws IOException; }

    private final AppProps props;
    private final MidiaRepo repo;
    private final Cofre cofre;
    private final long cacheMax;

    ArmazenamentoMidia(AppProps props, MidiaRepo repo, Cofre cofre,
                       @Value("${CACHE_ARQUIVOS_MB:1024}") long cacheMb) {
        this.props = props;
        this.repo = repo;
        this.cofre = cofre;
        this.cacheMax = Math.max(64, cacheMb) * 1024 * 1024;
    }

    public Path raizGeral() {
        return Paths.get(props.getMidiaDir()).toAbsolutePath().normalize();
    }

    public Path raiz(Long campanhaId) {
        return raizGeral().resolve("c" + campanhaId);
    }

    public Cofre cofre() {
        return cofre;
    }

    static String chave(String hash) {
        return "midia/" + hash;
    }

    private Path cache() throws IOException {
        Path g = raizGeral();
        Path c = (g.getParent() == null ? g : g.getParent()).resolve("cache-arquivos");
        Files.createDirectories(c);
        return c;
    }

    /** O original antigo no volume, no caminho logico; nulo se o caminho sai da pasta da campanha. */
    Path legado(Long campanhaId, String rel) {
        Path base = raiz(campanhaId);
        Path p = base.resolve(rel).normalize();
        return p.startsWith(base) ? p : null;
    }

    // ---------- gravar ----------

    Gravado gravar(MultipartFile arquivo) throws IOException {
        return gravar(arquivo::getInputStream, arquivo.getSize());
    }

    Gravado gravar(byte[] bytes) throws IOException {
        return gravar(() -> new ByteArrayInputStream(bytes), bytes.length);
    }

    /** {@code tamanho} negativo: desconhecido (fluxo lido uma vez so, direto do zip). */
    Gravado gravar(Fonte fonte, long tamanho) throws IOException {
        Path pasta = cache();
        if (tamanho >= 0 && semEspaco(pasta, tamanho)) throw new ArmazenamentoCheioException();
        Path tmp = Files.createTempFile(pasta, "envio", PARCIAL);
        String h;
        long tam;
        try {
            MessageDigest md = sha256();
            try (InputStream din = new DigestInputStream(fonte.abrir(), md)) {
                Files.copy(din, tmp, StandardCopyOption.REPLACE_EXISTING);
            }
            h = hex(md.digest());
            tam = Files.size(tmp);
        } catch (IOException e) {
            Files.deleteIfExists(tmp);
            if (discoCheio(e)) throw new ArmazenamentoCheioException();
            throw e;
        }
        try {
            boolean ja = cofre.existe(chave(h));
            if (!ja) cofre.guardar(chave(h), tmp, true);
            guardaNoCache(tmp, h);
            return new Gravado(h, ja, tam);
        } finally {
            Files.deleteIfExists(tmp);
        }
    }

    /* o que acabou de chegar e o que mais provavelmente vai ser lido agora (indexar o PDF, reduzir a imagem) */
    private void guardaNoCache(Path tmp, String hash) throws IOException {
        if (!Files.exists(tmp)) return;
        if (!cofre.remoto()) { Files.deleteIfExists(tmp); return; }
        Files.move(tmp, cache().resolve(hash), StandardCopyOption.REPLACE_EXISTING);
        aparaCache();
    }

    /** Um original posto direto no volume (reescanear, migracao): calcula o hash e manda uma copia para o
     *  cofre, se ainda nao estiver la. O arquivo fica no volume ate a Administracao liberar. */
    String ingerir(Path arquivo) throws IOException {
        String h = hashArquivo(arquivo);
        if (!cofre.existe(chave(h))) cofre.guardar(chave(h), arquivo, false);
        return h;
    }

    /** Tira o original antigo do volume naquele caminho (o envio novo vai para o cofre). */
    void apagarLegado(Long campanhaId, String rel) {
        Path p = legado(campanhaId, rel);
        if (p != null) apagaQuieto(p);
    }

    // ---------- ler ----------

    /** O original num arquivo local, para quem precisa ler o arquivo inteiro (PDFBox, ImageIO). */
    public Path local(Midia m) throws IOException {
        return local(m.getCampanhaId(), m.getArquivo(), m.getHash());
    }

    public Path local(Long campanhaId, String rel, String hash) throws IOException {
        if (hash != null) {
            var direto = cofre.arquivoLocal(chave(hash));
            if (direto.isPresent()) return direto.get();
            Path c = cache().resolve(hash);
            if (Files.isRegularFile(c)) {
                Files.setLastModifiedTime(c, FileTime.fromMillis(System.currentTimeMillis()));
                return c;
            }
        }
        Path leg = legado(campanhaId, rel);
        if (leg != null && Files.isRegularFile(leg)) return leg;
        if (hash != null && cofre.existe(chave(hash))) return baixar(hash);
        throw new NoSuchFileException(rel);
    }

    private Path baixar(String hash) throws IOException {
        Path destino = cache().resolve(hash);
        Path tmp = Files.createTempFile(cache(), "baixa", PARCIAL);
        try (InputStream in = cofre.abrir(chave(hash))) {
            Files.copy(in, tmp, StandardCopyOption.REPLACE_EXISTING);
            Files.move(tmp, destino, StandardCopyOption.REPLACE_EXISTING);
        } finally {
            Files.deleteIfExists(tmp);
        }
        aparaCache();
        return destino;
    }

    /** Para servir: do cache ou do volume, se o arquivo estiver no disco; senao, trecho a trecho do cofre.
     *  Nulo se o conteudo nao existe em lugar nenhum. */
    public Conteudo conteudo(Long campanhaId, String rel, String hash) throws IOException {
        if (hash != null) {
            var direto = cofre.arquivoLocal(chave(hash));
            if (direto.isPresent()) return doDisco(direto.get());
            Path c = cache().resolve(hash);
            if (Files.isRegularFile(c)) return doDisco(c);
        }
        Path leg = legado(campanhaId, rel);
        if (leg != null && Files.isRegularFile(leg)) return doDisco(leg);
        if (hash == null) return null;
        String k = chave(hash);
        long t = cofre.tamanho(k);
        if (t < 0) return null;
        return new Conteudo(t, -1, (i, f) -> cofre.abrir(k, i, f));
    }

    private static Conteudo doDisco(Path p) throws IOException {
        return new Conteudo(Files.size(p), Files.getLastModifiedTime(p).toMillis(),
                (i, f) -> faixa(Files.newInputStream(p), i, f));
    }

    /** O arquivo inteiro, para o pacote. */
    InputStream abrir(Midia m) throws IOException {
        Conteudo c = conteudo(m.getCampanhaId(), m.getArquivo(), m.getHash());
        if (c == null) throw new NoSuchFileException(m.getArquivo());
        return c.tamanho() == 0 ? InputStream.nullInputStream() : c.abertura().abrir(0, c.tamanho() - 1);
    }

    boolean disponivel(Midia m) {
        try {
            return conteudo(m.getCampanhaId(), m.getArquivo(), m.getHash()) != null;
        } catch (IOException _) {
            return false;
        }
    }

    // ---------- apagar ----------

    /** Depois que a linha saiu do catalogo: tira o objeto do cofre se mais nenhuma linha usa o conteudo. */
    void soltarSeOrfao(String hash) {
        if (hash == null || repo.countByHash(hash) > 0) return;
        try {
            cofre.apagar(chave(hash));
            Files.deleteIfExists(cache().resolve(hash));
        } catch (IOException e) {
            log.warn("Conteudo {} ficou no cofre sem uso: {}", hash, e.getMessage());
        }
    }

    // ---------- migracao do volume para o cofre ----------

    /**
     * Copia para o cofre os originais que ainda so estao no volume (de antes do bucket). So copia, nunca
     * apaga: o volume e liberado depois, por {@link #liberarVolume()}. Roda no boot, em segundo plano, e
     * pelo botao da Administracao.
     */
    public synchronized Map<String, Object> migrarParaCofre() {
        int hashes = 0;
        for (Midia m : repo.findByHashIsNull()) {
            Path p = legado(m.getCampanhaId(), m.getArquivo());
            if (p == null || !Files.isRegularFile(p)) continue;
            try { m.setHash(hashArquivo(p)); repo.save(m); hashes++; }
            catch (Exception e) { log.warn("Sem hash para {}: {}", p, e.getMessage()); }
        }
        Set<String> prontos = new HashSet<>();
        Set<String> todos = new HashSet<>();
        int copiados = 0;
        long bytes = 0;
        for (Midia m : repo.findByHashIsNotNullOrderByIdAsc()) {
            String h = m.getHash();
            todos.add(h);
            if (prontos.contains(h)) continue;
            try {
                if (cofre.existe(chave(h))) { prontos.add(h); continue; }
                Path p = legado(m.getCampanhaId(), m.getArquivo());
                if (p == null || !Files.isRegularFile(p)) continue;
                cofre.guardar(chave(h), p, false);
                prontos.add(h);
                copiados++;
                bytes += Files.size(p);
            } catch (Exception e) {
                log.warn("Nao consegui copiar {} para o cofre: {}", m.getArquivo(), e.getMessage());
            }
        }
        int faltando = todos.size() - prontos.size();
        if (copiados > 0 || hashes > 0 || faltando > 0)
            log.info("Midia: {} arquivos ganharam hash, {} copiados para o {} ({} MB), {} sem original em lugar nenhum.",
                    hashes, copiados, cofre.descricao(), bytes / (1024 * 1024), faltando);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("copiados", copiados);
        r.put("bytes", bytes);
        r.put("faltando", faltando);
        return r;
    }

    /**
     * Apaga do volume os originais que ja estao no cofre com o mesmo tamanho. E o que libera o espaco
     * de verdade; o que nao esta no cofre fica. Devolve os bytes liberados (cada conteudo uma vez).
     */
    public synchronized long liberarVolume() {
        Map<String, Long> noCofre = new HashMap<>();
        Set<String> contados = new HashSet<>();
        long liberado = 0;
        for (Midia m : repo.findByHashIsNotNullOrderByIdAsc()) {
            Path p = legado(m.getCampanhaId(), m.getArquivo());
            if (p == null || !Files.isRegularFile(p)) continue;
            try {
                long t = noCofre.computeIfAbsent(m.getHash(), h -> {
                    try { return cofre.tamanho(chave(h)); } catch (IOException _) { return -1L; }
                });
                long tam = Files.size(p);
                if (t != tam) continue;
                Files.delete(p);
                if (contados.add(m.getHash())) liberado += tam;
            } catch (IOException e) {
                log.warn("Nao consegui liberar {}: {}", p, e.getMessage());
            }
        }
        log.info("Volume: {} MB de originais liberados (ja estavam no {}).", liberado / (1024 * 1024), cofre.descricao());
        return liberado;
    }

    // ---------- estado do armazenamento (so a Administracao ve) ----------

    /** Para o painel do administrador: onde moram os originais, o espaco do volume, o que a midia ocupa
     *  (cada conteudo uma vez), a economia de guardar repetido uma vez so, o uso de cada campanha e o que
     *  ainda espera ir para o cofre ou sair do volume. */
    public Map<String, Object> estadoArmazenamento(Map<Long, String> nomes) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("cofre", cofre.descricao());
        r.put("remoto", cofre.remoto());
        r.put("links", true);
        try {
            FileStore fs = Files.getFileStore(raizGeral());
            r.put("livre", fs.getUsableSpace());
            r.put("total", fs.getTotalSpace());
        } catch (IOException _) {
            r.put("livre", -1);
            r.put("total", -1);
        }
        List<Midia> todas = repo.findAll();
        Map<String, Integer> usos = new HashMap<>();
        for (Midia m : todas) if (m.getHash() != null) usos.merge(m.getHash(), 1, Integer::sum);
        long economia = 0;
        long usado = 0;
        int compartilhados = 0;
        int pendentes = 0;
        long noVolume = 0;
        Set<String> vistos = new HashSet<>();
        Map<Long, long[]> porCamp = new TreeMap<>();
        for (Midia m : todas) {
            long[] c = porCamp.computeIfAbsent(m.getCampanhaId(), k -> new long[3]);
            c[0]++;
            c[1] += m.getTamanho();
            String h = m.getHash();
            if (h != null && usos.get(h) > 1) c[2]++;
            if (h != null && !vistos.add(h)) { economia += m.getTamanho(); compartilhados++; continue; }
            usado += m.getTamanho();
            Path p = legado(m.getCampanhaId(), m.getArquivo());
            if (p != null && Files.isRegularFile(p)) noVolume += m.getTamanho();
            try { if (h == null || !cofre.existe(chave(h))) pendentes++; }
            catch (IOException _) { pendentes++; }
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
        r.put("pendentes", pendentes);
        r.put("noVolume", noVolume);
        r.put("porCampanha", lista);
        return r;
    }

    // ---------- utilidades ----------

    /** Os bytes de {@code inicio} a {@code fim} (inclusive) de um fluxo que comeca no byte zero. */
    static InputStream faixa(InputStream in, long inicio, long fim) throws IOException {
        try {
            in.skipNBytes(inicio);
        } catch (IOException e) {
            in.close();
            throw e;
        }
        return new Recorte(in, fim - inicio + 1);
    }

    private static final class Recorte extends FilterInputStream {
        private long resta;

        Recorte(InputStream in, long resta) {
            super(in);
            this.resta = resta;
        }

        @Override
        public int read() throws IOException {
            if (resta <= 0) return -1;
            int b = super.read();
            if (b >= 0) resta--;
            return b;
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            if (resta <= 0) return -1;
            int n = super.read(b, off, (int) Math.min(len, resta));
            if (n > 0) resta -= n;
            return n;
        }
    }

    /* o cache e so atalho: passou do limite, saem os lidos ha mais tempo */
    private synchronized void aparaCache() {
        try (var st = Files.list(cache())) {
            List<Path> arquivos = st.filter(Files::isRegularFile)
                    .filter(p -> !p.getFileName().toString().endsWith(PARCIAL))
                    .sorted(Comparator.comparingLong(ArmazenamentoMidia::modificado))
                    .toList();
            long total = 0;
            for (Path p : arquivos) total += Files.size(p);
            for (Path p : arquivos) {
                if (total <= cacheMax) break;
                long t = Files.size(p);
                if (Files.deleteIfExists(p)) total -= t;
            }
        } catch (IOException e) {
            log.debug("Cache de arquivos nao aparado: {}", e.getMessage());
        }
    }

    private static long modificado(Path p) {
        try { return Files.getLastModifiedTime(p).toMillis(); }
        catch (IOException _) { return 0; }
    }

    private static void apagaQuieto(Path p) {
        try {
            Files.deleteIfExists(p);
        } catch (IOException _) {
            // o que nao saiu agora sai na proxima vez
        }
    }

    private static boolean semEspaco(Path pasta, long tamanho) {
        try { return Files.getFileStore(pasta).getUsableSpace() < tamanho + FOLGA; }
        catch (IOException _) { return false; }
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
            din.transferTo(OutputStream.nullOutputStream());
        }
        return hex(md.digest());
    }

    private static String hashArquivo(Path p) throws IOException {
        try (InputStream in = Files.newInputStream(p)) {
            return hashDe(in);
        }
    }

    private static MessageDigest sha256() {
        try { return MessageDigest.getInstance("SHA-256"); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    private static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder(b.length * 2);
        for (byte x : b) sb.append(String.format("%02x", x));
        return sb.toString();
    }
}
