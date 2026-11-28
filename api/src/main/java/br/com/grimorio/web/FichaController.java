package br.com.grimorio.web;

import br.com.grimorio.model.Ficha;
import br.com.grimorio.model.Papel;
import br.com.grimorio.model.Usuario;
import br.com.grimorio.repo.FichaRepo;
import br.com.grimorio.repo.UsuarioRepo;
import br.com.grimorio.service.CampanhaService;
import br.com.grimorio.service.IaService;
import br.com.grimorio.service.MapaFichas;
import br.com.grimorio.service.MapaService;
import br.com.grimorio.service.MidiaService;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.Instant;
import java.util.*;

/** Fichas de personagem. Jogador ve e mexe so nas suas; mestre, em todas da campanha. */
@RestController
@RequestMapping("/api/c/{cid}/fichas")
public class FichaController {

    private static final int MAX_POR_PESSOA = 30, MAX_JSON = 400_000;

    private final FichaRepo fichas;
    private final UsuarioRepo usuarios;
    private final CampanhaService camp;
    private final IaService ia;
    private final Atual atual;
    private final MapaService mapas;
    private final MapaFichas tokens;
    private final MidiaService midia;

    public FichaController(FichaRepo fichas, UsuarioRepo usuarios, CampanhaService camp, IaService ia, Atual atual, // NOSONAR: ficha, mapa e midia, de proposito
                           MapaService mapas, MapaFichas tokens, MidiaService midia) {
        this.mapas = mapas;
        this.tokens = tokens;
        this.midia = midia;
        this.fichas = fichas;
        this.usuarios = usuarios;
        this.camp = camp;
        this.ia = ia;
        this.atual = atual;
    }

    public static class Corpo { public String nome; public String json; }
    public static class CorpoTexto { public String texto; public List<String> imagens; }

    @GetMapping
    public List<Map<String, Object>> listar(@PathVariable Long cid) {
        Long uid = atual.id();
        boolean mestre = camp.exigeMembro(cid, uid) == Papel.MESTRE;
        List<Ficha> l = mestre ? fichas.findByCampanhaIdOrderByNomeAsc(cid)
                               : fichas.findByCampanhaIdAndUsuarioIdOrderByNomeAsc(cid, uid);
        Map<Long, String> nomes = new HashMap<>();
        Map<Long, Boolean> deJogador = new HashMap<>();
        /* ficha sem icone mostra na lista a imagem de um token dela */
        Map<Long, String> deToken = tokens.imagens(cid, uid);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Ficha f : l) {
            String dono = nomes.computeIfAbsent(f.getUsuarioId(),
                    k -> usuarios.findById(k).map(Usuario::getNome).orElse("?"));
            Map<String, Object> m = mapa(f, uid, dono);
            m.put("tokenImg", deToken.getOrDefault(f.getId(), ""));
            /* ficha de jogador e a de quem joga na campanha; a do mestre e de NPC. A lista separa as duas */
            m.put("jogador", deJogador.computeIfAbsent(f.getUsuarioId(), k -> camp.papelDe(cid, k).map(p -> p != Papel.MESTRE).orElse(false)));
            if (mestre) m.put("donoId", f.getUsuarioId());
            out.add(m);
        }
        return out;
    }

    /**
     * O icone da ficha enviado por quem pode mexer nela (o jogador nao envia imagem pela Biblioteca). O arquivo
     * ganha um nome proprio: com o nome que veio, a imagem de alguem que ja tivesse esse nome seria trocada.
     */
    @PostMapping("/{id}/imagem")
    public ResponseEntity<?> imagem(@PathVariable Long cid, @PathVariable Long id, @RequestParam MultipartFile arquivo) throws IOException {
        Ficha f = minhaOuDoMestre(cid, id);
        if (f == null) return ResponseEntity.notFound().build();
        String ext = extensaoDeImagem(arquivo);
        if (ext == null) return ResponseEntity.badRequest().body(Map.of("erro", "envie uma imagem PNG, JPG, WEBP ou GIF de até 10 MB"));
        var m = midia.gravarImagem(cid, "ficha-" + f.getId() + "-" + System.currentTimeMillis() + "." + ext, arquivo.getBytes());
        return ResponseEntity.ok(Map.of("arquivo", m.getArquivo()));
    }

    public static class CorpoDono { public Long usuario; }

    /**
     * O mestre entrega a ficha a uma pessoa da mesa: ela passa a ver e editar a ficha como se fosse dela, e os tokens
     * ligados a ficha passam a ser controlados por ela. Sem ninguem ({@code usuario} vazio ou 0), a ficha volta para
     * o mestre que pediu e vira ficha de NPC.
     */
    @PutMapping("/{id}/dono")
    public ResponseEntity<?> dono(@PathVariable Long cid, @PathVariable Long id, @RequestBody CorpoDono c) {
        Long uid = atual.id();
        camp.exigeMestre(cid, uid);
        Ficha f = fichas.findById(id).filter(x -> Objects.equals(x.getCampanhaId(), cid)).orElse(null);
        if (f == null) return ResponseEntity.notFound().build();
        Long novo = c == null || c.usuario == null || c.usuario <= 0 ? uid : c.usuario;
        if (camp.papelDe(cid, novo).isEmpty()) return ResponseEntity.badRequest().body(Map.of("erro", "essa pessoa não está nesta campanha"));
        if (!Objects.equals(novo, f.getUsuarioId())) {
            if (fichas.countByCampanhaIdAndUsuarioId(cid, novo) >= MAX_POR_PESSOA)
                return ResponseEntity.badRequest().body(Map.of("erro", "essa pessoa já tem fichas demais nesta campanha"));
            f.setUsuarioId(novo);
            f.setAtualizadoEm(Instant.now());
            fichas.save(f);
            mapas.donoDaFicha(cid, f.getId(), novo);
        }
        String nome = usuarios.findById(novo).map(Usuario::getNome).orElse("?");
        Map<String, Object> m = mapa(f, uid, nome);
        m.put("jogador", camp.papelDe(cid, novo).map(p -> p != Papel.MESTRE).orElse(false));
        m.put("donoId", novo);
        return ResponseEntity.ok(m);
    }

    // ---------- tokens da ficha no mapa (MapaFichas) ----------

    public static class CorpoToken {
        public Long mapa;
        public Long elemento;
    }

    @GetMapping("/{id}/tokens")
    public List<Map<String, Object>> tokens(@PathVariable long cid, @PathVariable long id) {
        return tokens.tokens(cid, atual.id(), id);
    }

    /** Pôr a ficha num mapa ({@code mapa}) ou ligar a ela um token que ja esta la ({@code mapa} e {@code elemento}). */
    @PostMapping("/{id}/tokens")
    public Map<String, Object> porToken(@PathVariable long cid, @PathVariable long id, @RequestBody CorpoToken c) {
        if (c == null || c.mapa == null) throw new IllegalArgumentException("qual mapa?");
        return c.elemento == null ? tokens.por(cid, atual.id(), id, c.mapa) : tokens.vincular(cid, atual.id(), id, c.mapa, c.elemento);
    }

    /** Desliga o token da ficha; ele continua no mapa. */
    @DeleteMapping("/{id}/tokens/{eid}")
    public ResponseEntity<Void> soltarToken(@PathVariable long cid, @PathVariable long id, @PathVariable long eid) {
        tokens.soltar(cid, atual.id(), id, eid);
        return ResponseEntity.noContent().build();
    }

    @PostMapping
    public ResponseEntity<?> criar(@PathVariable Long cid, @RequestBody Corpo c) {
        Usuario u = atual.usuario();
        camp.exigeMembro(cid, u.getId());
        if (fichas.countByCampanhaIdAndUsuarioId(cid, u.getId()) >= MAX_POR_PESSOA)
            return ResponseEntity.badRequest().body(Map.of("erro", "fichas demais nesta campanha"));
        Ficha f = new Ficha();
        f.setCampanhaId(cid);
        f.setUsuarioId(u.getId());
        aplica(f, c);
        fichas.save(f);
        return ResponseEntity.ok(mapa(f, u.getId(), u.getNome()));
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> gravar(@PathVariable Long cid, @PathVariable Long id, @RequestBody Corpo c) {
        Ficha f = minhaOuDoMestre(cid, id);
        if (f == null) return ResponseEntity.notFound().build();
        aplica(f, c);
        fichas.save(f);
        /* a vida do token vinculado a esta ficha acompanha a barra dela */
        mapas.vidaDaFicha(cid, f.getId(), f.getConteudo());
        /* e o alcance da visao dela, na nevoa do mapa */
        mapas.visaoDaFicha(cid, f.getId(), f.getConteudo());
        /* e as variacoes de token dela */
        mapas.imagemDaFicha(cid, f.getId(), f.getConteudo());
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> apagar(@PathVariable Long cid, @PathVariable Long id) {
        Ficha f = minhaOuDoMestre(cid, id);
        if (f == null) return ResponseEntity.notFound().build();
        fichas.delete(f);
        return ResponseEntity.noContent().build();
    }

    /** Texto tirado de um PDF de ficha vira campos. So quando o servidor tem a IA configurada;
     *  sem ela, o navegador monta a ficha sozinho com o que conseguir ler. */
    @PostMapping("/importar")
    public ResponseEntity<?> importar(@PathVariable Long cid, @RequestBody CorpoTexto c) {
        camp.exigeMembro(cid, atual.id());
        if (!ia.configurada())
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of("erro", "a IA nao esta configurada"));
        try {
            return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(ia.estruturarFicha(c.texto, c.imagens));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("erro", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("erro", e.getMessage()));
        }
    }

    /* ficha de outra pessoa nao existe para o jogador: 404, nao 403, para nem confirmar o id */
    private Ficha minhaOuDoMestre(Long cid, Long id) {
        Long uid = atual.id();
        boolean mestre = camp.exigeMembro(cid, uid) == Papel.MESTRE;
        return fichas.findById(id)
                .filter(f -> Objects.equals(f.getCampanhaId(), cid))
                .filter(f -> mestre || Objects.equals(f.getUsuarioId(), uid))
                .orElse(null);
    }

    private static final long MAX_IMAGEM = 10L * 1024 * 1024;
    private static final Set<String> EXT_IMAGEM = Set.of("png", "jpg", "jpeg", "webp", "gif");

    /** a extensao, se o arquivo for uma imagem que pode ir para a mesa (SVG nao: e documento, carrega script) */
    private static String extensaoDeImagem(MultipartFile a) {
        if (a == null || a.isEmpty() || a.getSize() > MAX_IMAGEM) return null;
        String n = a.getOriginalFilename() == null ? "" : a.getOriginalFilename();
        int p = n.lastIndexOf('.');
        String ext = p < 0 ? "" : n.substring(p + 1).toLowerCase(Locale.ROOT);
        String tipo = a.getContentType() == null ? "" : a.getContentType();
        return EXT_IMAGEM.contains(ext) && tipo.startsWith("image/") && !tipo.contains("svg") ? ext : null;
    }

    private static void aplica(Ficha f, Corpo c) {
        String nome = c.nome == null ? "" : c.nome.trim();
        if (nome.isEmpty()) nome = "Sem nome";
        f.setNome(nome.length() > 120 ? nome.substring(0, 120) : nome);
        String j = c.json == null || c.json.isBlank() ? "{}" : c.json;
        if (j.length() > MAX_JSON) throw new IllegalArgumentException("ficha grande demais");
        f.setConteudo(j);
        f.setAtualizadoEm(Instant.now());
    }

    private static Map<String, Object> mapa(Ficha f, Long uid, String dono) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", f.getId());
        m.put("nome", f.getNome());
        m.put("dono", dono);
        m.put("minha", Objects.equals(f.getUsuarioId(), uid));
        m.put("json", f.getConteudo());
        m.put("em", f.getAtualizadoEm().toEpochMilli());
        return m;
    }
}
