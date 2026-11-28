package br.com.grimorio.service;

import br.com.grimorio.config.AppProps;
import br.com.grimorio.model.Midia;
import br.com.grimorio.repo.MidiaRepo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.FileStore;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * O volume de midia: onde cada campanha guarda os arquivos e como o mesmo conteudo ocupa o disco uma vez so.
 *
 * <p>O mesmo conteudo, enviado por quem for e com o nome que for, vira um hard link do primeiro caminho.
 * Quem conta as referencias e o sistema de arquivos: apagar um caminho tira so aquela referencia, e o
 * conteudo sai do disco quando o ultimo caminho for apagado. Por isso nenhum arquivo de midia pode ser
 * reescrito no lugar (Files.write no caminho existente): com o link, a mudanca apareceria para todos. Troca
 * de arquivo e sempre "grava ao lado e move por cima", que so mexe naquele caminho.
 */
@Component
public class ArmazenamentoMidia {

    private static final Logger log = LoggerFactory.getLogger(ArmazenamentoMidia.class);

    /** O hash do conteudo gravado e se ele ja existia no volume (virou link, nao ocupou nada). */
    public record Gravado(String hash, boolean reaproveitado) { }

    /* folga que fica livre no volume: banco H2 local, indices e logs tambem precisam de espaco */
    private static final long FOLGA = 32L * 1024 * 1024;

    interface Fonte { InputStream abrir() throws IOException; }

    private final AppProps props;
    private final MidiaRepo repo;
    private volatile Boolean linksOk;

    ArmazenamentoMidia(AppProps props, MidiaRepo repo) {
        this.props = props;
        this.repo = repo;
    }

    public Path raizGeral() {
        return Paths.get(props.getMidiaDir()).toAbsolutePath().normalize();
    }

    public Path raiz(Long campanhaId) {
        return raizGeral().resolve("c" + campanhaId);
    }

    // ---------- gravar ----------

    Gravado gravar(MultipartFile arquivo, Path destino) throws IOException {
        return gravar(arquivo::getInputStream, arquivo.getSize(), destino);
    }

    Gravado gravar(byte[] bytes, Path destino) throws IOException {
        return gravar(() -> new ByteArrayInputStream(bytes), bytes.length, destino);
    }

    /** {@code tamanho} negativo: desconhecido (fluxo lido uma vez so, direto do zip). */
    Gravado gravar(Fonte fonte, long tamanho, Path destino) throws IOException {
        Files.createDirectories(destino.getParent());
        if (tamanho >= 0 && semEspaco(destino.getParent(), tamanho)) return gravarSemEspaco(fonte, tamanho, destino);
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
        /* reenvio do mesmo arquivo para o mesmo lugar (ja esta la), ou conteudo que ja existe: vira link */
        if (igual != null && ((Files.exists(destino) && Files.isSameFile(igual, destino)) || ligar(igual, destino))) {
            Files.deleteIfExists(tmp);
            return new Gravado(h, true);
        }
        Files.move(tmp, destino, StandardCopyOption.REPLACE_EXISTING);
        return new Gravado(h, false);
    }

    /* Sem espaco para gravar, mas talvez nem precise: se o conteudo ja existe no volume, o link nao
       ocupa nada. So entao o envio e recusado como armazenamento cheio. */
    private Gravado gravarSemEspaco(Fonte fonte, long tamanho, Path destino) throws IOException {
        String h;
        try (InputStream in = fonte.abrir()) { h = hashDe(in); }
        Path igual = acharIgual(h, tamanho);
        if (igual != null && Files.exists(destino) && Files.isSameFile(igual, destino)) return new Gravado(h, true);
        if (igual != null && ligar(igual, destino)) return new Gravado(h, true);
        throw new ArmazenamentoCheioException();
    }

    /* um arquivo de outra linha do catalogo com o mesmo hash e o mesmo tamanho, ainda no disco */
    private Path acharIgual(String hash, long tamanho) {
        for (Midia o : repo.findByHash(hash)) {
            Path p = raiz(o.getCampanhaId()).resolve(o.getArquivo()).normalize();
            try {
                if (Files.isRegularFile(p) && Files.size(p) == tamanho) return p;
            } catch (IOException _) {
                // arquivo que sumiu ou nao se le: procura o proximo
            }
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
            apagaQuieto(lnk);
            log.warn("Nao consegui compartilhar {} com {} ({}): fica como copia.", destino, origem, e.toString());
            return false;
        }
    }

    /** Arquivo que ja esta no volume: calcula o hash e, se outra linha tiver o mesmo conteudo,
     *  troca este por um link para aquele. Devolve o hash. */
    String desduplicar(Path p) throws IOException {
        String h = hashArquivo(p);
        Path igual = acharIgual(h, Files.size(p));
        if (igual != null && !Files.isSameFile(igual, p)) ligar(igual, p);
        return h;
    }

    // ---------- estado do armazenamento (so a Administracao ve) ----------

    /** O volume aceita hard link? Testa uma vez com dois arquivos de rascunho na pasta de midia. */
    public boolean linksDisponiveis() {
        if (linksOk != null) return linksOk;
        Path a = raizGeral().resolve(".teste-link-a");
        Path b = raizGeral().resolve(".teste-link-b");
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
            apagaQuieto(b);
            apagaQuieto(a);
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
        } catch (IOException _) {
            r.put("livre", -1);
            r.put("total", -1);
        }
        long economia = 0;
        long usado = 0;
        int compartilhados = 0;
        Map<String, Path> primeiro = new HashMap<>();
        Map<Long, long[]> porCamp = new TreeMap<>();
        for (Midia m : repo.findAll()) {
            Path p = raiz(m.getCampanhaId()).resolve(m.getArquivo()).normalize();
            try {
                if (!Files.isRegularFile(p)) continue;
                long tam = Files.size(p);
                long[] c = porCamp.computeIfAbsent(m.getCampanhaId(), k -> new long[3]);
                c[0]++;
                c[1] += tam;
                Path o = m.getHash() == null ? null : primeiro.putIfAbsent(m.getHash(), p);
                if (o != null && Files.isSameFile(o, p)) { economia += tam; compartilhados++; c[2]++; }
                else usado += tam;
            } catch (IOException _) {
                // arquivo que nao se le fica fora da conta
            }
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

    /** Roda no boot, em segundo plano: poe hash no que veio de antes desta versao e junta as
     *  copias iguais que ja estavam no volume. Devolve quantos bytes deixaram de ser duplicados. */
    public long desduplicarVolume() {
        linksDisponiveis();
        int calculados = 0;
        for (Midia m : repo.findByHashIsNull()) {
            Path p = raiz(m.getCampanhaId()).resolve(m.getArquivo()).normalize();
            if (!Files.isRegularFile(p)) continue;
            try { m.setHash(hashArquivo(p)); repo.save(m); calculados++; }
            catch (Exception e) { log.warn("Sem hash para {}: {}", p, e.getMessage()); }
        }
        long liberado = 0;
        int ligados = 0;
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

    // ---------- utilidades ----------

    private static void apagaQuieto(Path p) {
        try {
            Files.deleteIfExists(p);
        } catch (IOException _) {
            // rascunho que nao saiu agora sai na proxima vez
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
