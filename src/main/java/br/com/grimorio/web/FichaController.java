package br.com.grimorio.web;

import br.com.grimorio.model.Ficha;
import br.com.grimorio.model.Papel;
import br.com.grimorio.model.Usuario;
import br.com.grimorio.repo.FichaRepo;
import br.com.grimorio.repo.UsuarioRepo;
import br.com.grimorio.service.CampanhaService;
import br.com.grimorio.service.IaService;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

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

    public FichaController(FichaRepo fichas, UsuarioRepo usuarios, CampanhaService camp, IaService ia, Atual atual) {
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
        List<Map<String, Object>> out = new ArrayList<>();
        for (Ficha f : l) {
            String dono = nomes.computeIfAbsent(f.getUsuarioId(),
                    k -> usuarios.findById(k).map(Usuario::getNome).orElse("?"));
            out.add(mapa(f, uid, dono));
        }
        return out;
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
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> apagar(@PathVariable Long cid, @PathVariable Long id) {
        Ficha f = minhaOuDoMestre(cid, id);
        if (f == null) return ResponseEntity.notFound().build();
        fichas.delete(f);
        return ResponseEntity.noContent().build();
    }

    /** Texto tirado de um PDF de ficha vira campos. So quando a instancia tem a IA configurada;
     *  sem ela, o navegador monta a ficha sozinho com o que conseguir ler. */
    @PostMapping("/importar")
    public ResponseEntity<?> importar(@PathVariable Long cid, @RequestBody CorpoTexto c) {
        camp.exigeMembro(cid, atual.id());
        if (!ia.configurada())
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of("erro", "sem IA nesta instancia"));
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
