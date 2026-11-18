package br.com.grimorio.service;

import br.com.grimorio.model.Campanha;
import br.com.grimorio.model.Ficha;
import br.com.grimorio.model.Midia;
import br.com.grimorio.model.Usuario;
import br.com.grimorio.repo.CampanhaRepo;
import br.com.grimorio.repo.FichaRepo;
import br.com.grimorio.repo.MidiaRepo;
import br.com.grimorio.repo.UsuarioRepo;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.regex.Pattern;
import java.util.zip.*;

/**
 * Pacote de campanha: um zip com tudo que a campanha tem, para ela sair de uma instancia (ou
 * de uma conta) e entrar em outra igual, sem ninguem precisar enviar arquivo de novo.
 *
 *   campanha.json            dados da campanha, guia, mesa, fichas e o catalogo de midia
 *   indice/ABREV.json        indices de busca ja prontos
 *   img/arquivo.webp         imagens
 *   pdf/ABREV.pdf            livros
 *   audio/categoria/x.mp3    faixas da trilha
 *
 * O catalogo ("midia" no campanha.json) leva o que o arquivo sozinho nao diz: o nome de
 * exibicao, a categoria da faixa e se o livro e publico. Pacote sem ele (formato 1) ainda
 * entra: PDF e faixa sao catalogados como o reescanear faria.
 */
@Service
public class PacoteService {

    private static final Logger log = LoggerFactory.getLogger(PacoteService.class);
    /* o que vai para a memoria (json e imagem) tem teto baixo; PDF e audio vao direto ao disco */
    private static final long LIMITE_ENTRADA = 80L * 1024 * 1024;
    private static final long LIMITE_ARQUIVO = 2L * 1024 * 1024 * 1024;
    private static final int MAX_ENTRADAS = 5000;
    private static final int MAX_FICHAS = 200;
    private static final Pattern PDF = Pattern.compile("pdf/[A-Za-z0-9]{2,10}\\.(?i)pdf");
    private static final Pattern AUDIO = Pattern.compile("audio/(?:[^/]{1,80}/){0,2}[^/]{1,120}\\.(?i)(?:mp3|m4a|ogg|wav)");
    private static final String CAMPANHA_JSON = "campanha.json";
    private static final String DIR_INDICE = "indice/";
    private static final String DIR_IMG = "img/";
    private static final String CAMPO_FICHAS = "fichas";
    private static final String CAMPO_NOME = "nome";

    private final CampanhaRepo campanhas;
    private final DocumentoService docs;
    private final MidiaService midia;
    private final MidiaRepo catalogo;
    private final IndiceService indice;
    private final FichaRepo fichas;
    private final UsuarioRepo usuarios;
    private final ObjectMapper om = JsonMapper.builder().build();

    public PacoteService(CampanhaRepo campanhas, DocumentoService docs,
                         MidiaService midia, MidiaRepo catalogo, IndiceService indice,
                         FichaRepo fichas, UsuarioRepo usuarios) {
        this.campanhas = campanhas;
        this.docs = docs;
        this.midia = midia;
        this.catalogo = catalogo;
        this.indice = indice;
        this.fichas = fichas;
        this.usuarios = usuarios;
    }

    // ---------- exportar ----------

    public void exportar(Long campanhaId, boolean comArquivos, OutputStream saida) throws IOException {
        Campanha c = campanhas.findById(campanhaId)
                .orElseThrow(() -> new IllegalArgumentException("campanha nao encontrada"));
        Path raiz = midia.raiz(campanhaId);
        List<Midia> arquivos = comArquivos ? arquivosDoCatalogo(campanhaId, raiz) : List.of();

        try (ZipOutputStream z = new ZipOutputStream(saida, StandardCharsets.UTF_8)) {
            z.putNextEntry(new ZipEntry(CAMPANHA_JSON));
            z.write(om.writerWithDefaultPrettyPrinter().writeValueAsBytes(dadosDaCampanha(c, arquivos)));
            z.closeEntry();
            copiarPasta(z, indice.pastaIndice(campanhaId), DIR_INDICE, p -> p.toString().endsWith(".json"));
            if (comArquivos) {
                /* imagem, PDF e audio ja vem comprimidos: comprimir de novo so gasta processador */
                z.setLevel(Deflater.BEST_SPEED);
                copiarPasta(z, raiz.resolve("img"), DIR_IMG, p -> !p.getFileName().toString().endsWith(".parcial"));
                for (Midia m : arquivos) copiar(z, m.getArquivo(), raiz.resolve(m.getArquivo()));
            }
            z.finish();
        }
    }

    /* PDF e faixa saem pelo catalogo, que sabe nome e categoria; so vai o que esta no disco */
    private List<Midia> arquivosDoCatalogo(Long campanhaId, Path raiz) {
        return catalogo.findByCampanhaId(campanhaId).stream()
                .filter(m -> m.getTipo() != Midia.Tipo.IMG && caminhoAceito(m))
                .filter(m -> {
                    Path p = raiz.resolve(m.getArquivo()).normalize();
                    return p.startsWith(raiz) && Files.isRegularFile(p);
                })
                .sorted(Comparator.comparing(Midia::getArquivo))
                .toList();
    }

    private static void copiarPasta(ZipOutputStream z, Path dir, String prefixo,
                                    java.util.function.Predicate<Path> aceita) throws IOException {
        if (!Files.isDirectory(dir)) return;
        List<Path> lista;
        try (var st = Files.list(dir)) {
            lista = st.filter(Files::isRegularFile).filter(aceita).sorted().toList();
        }
        for (Path p : lista) copiar(z, prefixo + p.getFileName(), p);
    }

    private ObjectNode dadosDaCampanha(Campanha c, List<Midia> arquivos) {
        Long campanhaId = c.getId();
        ObjectNode raiz = om.createObjectNode();
        raiz.put("formato", 2);
        raiz.put(CAMPO_NOME, c.getNome());
        raiz.put("sistema", c.getSistema());
        raiz.put("descricao", c.getDescricao());
        raiz.put("tema", c.getTema());
        raiz.put("capa", c.getCapa() == null ? "" : c.getCapa());
        raiz.set("guia", leJson(docs.ler(campanhaId, DocumentoService.GUIA).getConteudo()));
        raiz.set("mesa", leJson(docs.ler(campanhaId, DocumentoService.MESA).getConteudo()));
        ArrayNode fs = raiz.putArray(CAMPO_FICHAS);
        Map<Long, String> nomes = new HashMap<>();
        for (Ficha f : fichas.findByCampanhaIdOrderByNomeAsc(campanhaId)) {
            ObjectNode o = fs.addObject();
            o.put(CAMPO_NOME, f.getNome());
            o.put("dono", nomes.computeIfAbsent(f.getUsuarioId(),
                    k -> usuarios.findById(k).map(Usuario::getNome).orElse("")));
            o.set("conteudo", leJson(f.getConteudo()));
        }
        ArrayNode cat = raiz.putArray("midia");
        for (Midia m : arquivos) {
            ObjectNode o = cat.addObject();
            o.put("tipo", m.getTipo().name());
            o.put("arquivo", m.getArquivo());
            o.put("chave", m.getChave());
            o.put(CAMPO_NOME, m.getNome());
            o.put("categoria", m.getCategoria() == null ? "" : m.getCategoria());
            o.put("publico", m.isPublico());
        }
        return raiz;
    }

    private static void copiar(ZipOutputStream z, String nome, Path p) throws IOException {
        z.putNextEntry(new ZipEntry(nome));
        Files.copy(p, z);
        z.closeEntry();
    }

    /* so sai o que a importacao aceita de volta, senao o arquivo se perderia do outro lado */
    private static boolean caminhoAceito(Midia m) {
        String a = m.getArquivo() == null ? "" : m.getArquivo();
        return m.getTipo() == Midia.Tipo.PDF ? PDF.matcher(a).matches() : AUDIO.matcher(a).matches();
    }

    // ---------- importar ----------

    @Transactional(rollbackFor = IOException.class)
    public Map<String, Object> importar(Long campanhaId, Long usuarioId, MultipartFile zip,
                                        boolean substituirGuia) throws IOException {
        if (zip == null || zip.isEmpty()) throw new IllegalArgumentException("arquivo vazio");
        try (InputStream in = zip.getInputStream()) {
            return importarDoFluxo(campanhaId, usuarioId, in, substituirGuia);
        }
    }

    /** O mesmo, lendo de qualquer fluxo: e assim que um modelo de campanha (um pacote guardado
     *  no servidor) entra numa campanha nova. */
    @Transactional(rollbackFor = IOException.class)
    public Map<String, Object> importar(Long campanhaId, Long usuarioId, InputStream zip,
                                        boolean substituirGuia) throws IOException {
        return importarDoFluxo(campanhaId, usuarioId, zip, substituirGuia);
    }

    private Map<String, Object> importarDoFluxo(Long campanhaId, Long usuarioId, InputStream zip,
                                                boolean substituirGuia) throws IOException {
        midia.prepararPastas(campanhaId);
        Importacao imp = new Importacao(campanhaId, usuarioId, substituirGuia);
        try (ZipInputStream z = new ZipInputStream(zip, StandardCharsets.UTF_8)) {
            ZipEntry e;
            int entradas = 0;
            while ((e = z.getNextEntry()) != null) {
                if (++entradas > MAX_ENTRADAS) throw new IllegalArgumentException("pacote com entradas demais");
                String nome = e.getName().replace('\\', '/');
                if (!e.isDirectory() && !nome.contains("..") && !nome.startsWith("/")) imp.entrada(nome, z);
                z.closeEntry();
            }
        }
        imp.registrarArquivos();
        indice.invalidar(campanhaId);
        log.info("Campanha {}: importou {} indices, {} imagens, {} PDFs e {} faixas (guia={}).",
                campanhaId, imp.indices, imp.imagens, imp.pdfs, imp.faixas, imp.trocouGuia);
        return imp.resultado();
    }

    /* O estado de uma importacao: o que ja entrou e o que espera o fim do zip. */
    private final class Importacao {
        private final Long campanhaId;
        private final Long usuarioId;
        private final boolean substituirGuia;
        /* caminho do PDF ou da faixa gravada -> hash. O registro espera o fim do zip, quando o
           catalogo e os indices (que poupam o PDF de ser reprocessado) ja foram lidos. */
        private final Map<String, String> gravados = new LinkedHashMap<>();
        private final Map<String, JsonNode> meta = new HashMap<>();
        private String nomeCampanha;
        private int indices;
        private int imagens;
        private int nFichas;
        private int pdfs;
        private int faixas;
        private boolean trocouGuia;
        private boolean trocouMesa;

        Importacao(Long campanhaId, Long usuarioId, boolean substituirGuia) {
            this.campanhaId = campanhaId;
            this.usuarioId = usuarioId;
            this.substituirGuia = substituirGuia;
        }

        void entrada(String nome, InputStream z) throws IOException {
            if (PDF.matcher(nome).matches() || AUDIO.matcher(nome).matches()) {
                String rel = relDoArquivo(nome);
                gravados.put(rel, midia.gravarDoPacote(campanhaId, rel, new Limitado(z, LIMITE_ARQUIVO)).hash());
            } else if (nome.equals(CAMPANHA_JSON)) {
                campanhaJson(om.readTree(lerLimitado(z)));
            } else if (nome.startsWith(DIR_INDICE) && nome.endsWith(".json")) {
                String arq = nome.substring(DIR_INDICE.length());
                if (arq.contains("/")) return;
                Files.write(indice.pastaIndice(campanhaId).resolve(arq), lerLimitado(z));
                indices++;
            } else if (nome.startsWith(DIR_IMG)) {
                String arq = nome.substring(DIR_IMG.length());
                if (arq.isEmpty() || arq.contains("/")) return;
                midia.gravarImagem(campanhaId, arq, lerLimitado(z));
                imagens++;
            }
        }

        private void campanhaJson(JsonNode n) {
            nomeCampanha = n.path(CAMPO_NOME).asString("");
            aplicarCampanha(campanhaId, n);
            nFichas = importarFichas(campanhaId, usuarioId, n.path(CAMPO_FICHAS));
            for (JsonNode m : n.path("midia")) meta.put(relDoArquivo(m.path("arquivo").asString("")), m);
            if (!substituirGuia) return;
            trocouGuia = gravarDocumento(DocumentoService.GUIA, n.get("guia"));
            trocouMesa = gravarDocumento(DocumentoService.MESA, n.get("mesa"));
        }

        private boolean gravarDocumento(String chave, JsonNode conteudo) {
            if (conteudo == null || conteudo.isNull()) return false;
            docs.gravar(campanhaId, chave, om.writeValueAsString(conteudo), -1);
            return true;
        }

        void registrarArquivos() throws IOException {
            Path raiz = midia.raiz(campanhaId);
            for (var g : gravados.entrySet()) {
                String rel = g.getKey();
                JsonNode m = meta.getOrDefault(rel, om.createObjectNode());
                if (rel.startsWith("pdf/")) {
                    String ab = rel.substring(4, rel.length() - 4);
                    midia.registrarPdf(campanhaId, ab, m.path(CAMPO_NOME).asString(ab),
                            m.path("publico").asBoolean(false), raiz.resolve(rel), g.getValue());
                    pdfs++;
                } else {
                    midia.registrarFaixa(campanhaId, rel, m.path("chave").asString(""), m.path(CAMPO_NOME).asString(""),
                            m.path("categoria").asString(""), g.getValue());
                    faixas++;
                }
            }
        }

        /* Os donos das fichas sao contas de outra instancia: aqui ninguem e "o mesmo jogador".
           Elas entram em nome de quem importou (o mestre), com o dono antigo anotado no nome,
           e o mestre repassa como quiser. Reimportar o mesmo pacote nao duplica: ficha com o
           mesmo nome ja existente fica como esta. */
        private int importarFichas(Long campanhaId, Long usuarioId, JsonNode lista) {
            if (usuarioId == null || !lista.isArray()) return 0;
            Set<String> tem = new HashSet<>();
            for (Ficha f : fichas.findByCampanhaIdOrderByNomeAsc(campanhaId)) tem.add(f.getNome());
            int n = 0;
            for (JsonNode o : lista) {
                if (n >= MAX_FICHAS) break;
                Ficha f = fichaDoPacote(o);
                if (f != null && tem.add(f.getNome())) {
                    f.setCampanhaId(campanhaId);
                    f.setUsuarioId(usuarioId);
                    fichas.save(f);
                    n++;
                }
            }
            return n;
        }

        /* a ficha como entra aqui, ou null se o conteudo nao servir */
        private Ficha fichaDoPacote(JsonNode o) {
            JsonNode c = o.path("conteudo");
            if (!c.isObject()) return null;
            String json = om.writeValueAsString(c);
            if (json.length() > 400_000) return null;
            String nome = o.path(CAMPO_NOME).asString("").trim();
            if (nome.isEmpty()) nome = "Sem nome";
            String dono = o.path("dono").asString("").trim();
            if (!dono.isEmpty()) nome += " (" + dono + ")";
            if (nome.length() > 120) nome = nome.substring(0, 120);
            Ficha f = new Ficha();
            f.setNome(nome);
            f.setConteudo(json);
            return f;
        }

        private void aplicarCampanha(Long campanhaId, JsonNode n) {
            campanhas.findById(campanhaId).ifPresent(c -> {
                if (c.getSistema() == null || c.getSistema().isBlank())
                    c.setSistema(n.path("sistema").asString(""));
                if (c.getDescricao() == null || c.getDescricao().isBlank())
                    c.setDescricao(n.path("descricao").asString(""));
                /* a capa e uma imagem do pacote, que entra junto em img/ */
                if (c.getCapa() == null || c.getCapa().isBlank()) {
                    try { c.setCapa(CampanhaService.capaValida(n.path("capa").asString(""))); }
                    catch (IllegalArgumentException _) { /* pacote com capa estranha: fica sem capa */ }
                }
                String tema = n.path("tema").asString("");
                if (!tema.isBlank()) c.setTema(tema);
                campanhas.save(c);
            });
        }

        private byte[] lerLimitado(InputStream in) throws IOException {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            long total = 0;
            int n;
            while ((n = in.read(buf)) > 0) {
                total += n;
                if (total > LIMITE_ENTRADA) throw new IllegalArgumentException("arquivo grande demais dentro do pacote");
                bos.write(buf, 0, n);
            }
            return bos.toByteArray();
        }

        Map<String, Object> resultado() {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put(CAMPO_NOME, nomeCampanha);
            r.put("indices", indices);
            r.put("imagens", imagens);
            r.put("pdfs", pdfs);
            r.put("faixas", faixas);
            r.put("guia", trocouGuia);
            r.put("mesa", trocouMesa);
            r.put(CAMPO_FICHAS, nFichas);
            return r;
        }
    }

    /* o PDF e achado pela sigla em maiuscula (pdf/LB.pdf), venha o nome como vier no zip */
    private static String relDoArquivo(String nome) {
        String n = nome.replace('\\', '/');
        if (!PDF.matcher(n).matches()) return n;
        return "pdf/" + n.substring(4, n.length() - 4).toUpperCase(Locale.ROOT) + ".pdf";
    }

    /* Le a entrada atual do zip sem deixar quem le fechar o zip inteiro, e corta no limite: o
       tamanho declarado no zip nao e confiavel, entao conta o que passa de verdade. */
    private static final class Limitado extends FilterInputStream {
        private final long limite;
        private long lidos;

        Limitado(InputStream in, long limite) {
            super(in);
            this.limite = limite;
        }

        private void conta(long n) {
            if (n > 0) lidos += n;
            if (lidos > limite) throw new IllegalArgumentException("arquivo grande demais dentro do pacote");
        }

        @Override
        public int read() throws IOException {
            int b = super.read();
            if (b >= 0) conta(1);
            return b;
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            int n = super.read(b, off, len);
            conta(n);
            return n;
        }

        @Override
        public void close() {
            /* o zip continua aberto para a proxima entrada */
        }
    }

    private JsonNode leJson(String s) {
        try { return om.readTree(s == null || s.isBlank() ? "{}" : s); }
        catch (Exception _) { return om.createObjectNode(); }
    }
}
