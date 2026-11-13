package br.com.grimorio.web;

import br.com.grimorio.model.*;
import br.com.grimorio.repo.AnotacaoRepo;
import br.com.grimorio.repo.MuralRepo;
import br.com.grimorio.service.CampanhaService;
import br.com.grimorio.service.DocumentoService;
import br.com.grimorio.service.IndiceService;
import br.com.grimorio.service.RolagemService;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

/** Guia, mesa, indice, mural e anotacoes, sempre dentro de uma campanha. */
@RestController
@RequestMapping("/api/c/{cid}")
public class ConteudoController {

    private final CampanhaService camp;
    private final DocumentoService docs;
    private final IndiceService indice;
    private final MuralRepo mural;
    private final AnotacaoRepo anotacoes;
    private final Atual atual;
    private final RolagemService rolagens;

    public ConteudoController(CampanhaService camp, DocumentoService docs, IndiceService indice,
                              MuralRepo mural, AnotacaoRepo anotacoes, Atual atual,
                              RolagemService rolagens) {
        this.rolagens = rolagens;
        this.camp = camp;
        this.docs = docs;
        this.indice = indice;
        this.mural = mural;
        this.anotacoes = anotacoes;
        this.atual = atual;
    }

    public static class CorpoDoc {
        public String json;
        public Long versao;
    }

    // ---------- guia (so mestre) ----------

    @GetMapping("/guia")
    public Map<String, Object> lerGuia(@PathVariable Long cid) {
        camp.exigeMestre(cid, atual.id());
        Documento d = docs.ler(cid, DocumentoService.GUIA);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("versao", d.getVersao());
        m.put("json", d.getConteudo());
        return m;
    }

    @PutMapping("/guia")
    public ResponseEntity<?> gravarGuia(@PathVariable Long cid, @RequestBody CorpoDoc c) {
        camp.exigeMestre(cid, atual.id());
        return gravar(cid, DocumentoService.GUIA, c);
    }

    // ---------- mesa (todos leem, mestre escreve) ----------

    @GetMapping("/mesa")
    public Map<String, Object> lerMesa(@PathVariable Long cid) {
        camp.exigeMembro(cid, atual.id());
        Documento d = docs.ler(cid, DocumentoService.MESA);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("versao", d.getVersao());
        m.put("json", d.getConteudo());
        return m;
    }

    @GetMapping("/mesa/versao")
    public Map<String, Object> versaoMesa(@PathVariable Long cid) {
        camp.exigeMembro(cid, atual.id());
        return Map.of("versao", docs.ler(cid, DocumentoService.MESA).getVersao());
    }

    @PutMapping("/mesa")
    public ResponseEntity<?> gravarMesa(@PathVariable Long cid, @RequestBody CorpoDoc c) {
        camp.exigeMestre(cid, atual.id());
        return gravar(cid, DocumentoService.MESA, c);
    }

    private ResponseEntity<?> gravar(Long cid, String chave, CorpoDoc c) {
        try {
            long v = docs.gravar(cid, chave, c.json, c.versao == null ? -1 : c.versao);
            return ResponseEntity.ok(Map.of("versao", v));
        } catch (DocumentoService.ConflitoException e) {
            Documento d = docs.ler(cid, chave);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("erro", "conflito");
            m.put("versao", d.getVersao());
            m.put("json", d.getConteudo());
            return ResponseEntity.status(HttpStatus.CONFLICT).body(m);
        }
    }

    // ---------- indice ----------

    @GetMapping("/indice")
    public ResponseEntity<String> lerIndice(@PathVariable Long cid) {
        boolean mestre = camp.exigeMembro(cid, atual.id()) == Papel.MESTRE;
        return ResponseEntity.ok()
                .contentType(MediaType.valueOf("application/json;charset=UTF-8"))
                .header("Cache-Control", "no-store")
                .body(indice.json(cid, mestre));
    }

    // ---------- mural ----------

    public static class CorpoTexto { public String texto; }

    @GetMapping("/mural")
    public List<Map<String, Object>> lerMural(@PathVariable Long cid) {
        camp.exigeMembro(cid, atual.id());
        List<Map<String, Object>> out = new ArrayList<>();
        for (MuralPost p : mural.findTop200ByCampanhaIdOrderByCriadoEmDesc(cid)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", p.getId());
            m.put("autor", p.getAutorNome());
            m.put("usuarioId", p.getUsuarioId());
            m.put("texto", p.getTexto());
            m.put("em", p.getCriadoEm().toEpochMilli());
            out.add(m);
        }
        return out;
    }

    @PostMapping("/mural")
    public ResponseEntity<?> postar(@PathVariable Long cid, @RequestBody CorpoTexto c) {
        camp.exigeMembro(cid, atual.id());
        String t = c.texto == null ? "" : c.texto.trim();
        if (t.isEmpty()) return ResponseEntity.badRequest().body(Map.of("erro", "texto vazio"));
        if (t.length() > 2000) t = t.substring(0, 2000);
        Usuario u = atual.usuario();
        MuralPost p = new MuralPost();
        p.setCampanhaId(cid);
        p.setUsuarioId(u.getId());
        p.setAutorNome(u.getNome());
        p.setTexto(t);
        mural.save(p);
        return ResponseEntity.ok(Map.of("id", p.getId()));
    }

    @DeleteMapping("/mural/{id}")
    public ResponseEntity<?> apagarPost(@PathVariable Long cid, @PathVariable Long id) {
        Papel papel = camp.exigeMembro(cid, atual.id());
        MuralPost p = mural.findById(id).filter(x -> Objects.equals(x.getCampanhaId(), cid)).orElse(null);
        if (p == null) return ResponseEntity.notFound().build();
        boolean dono = Objects.equals(p.getUsuarioId(), atual.id());
        if (!dono && papel != Papel.MESTRE)
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("erro", "nao e seu"));
        mural.delete(p);
        return ResponseEntity.noContent().build();
    }

    // ---------- rolagens de dado ----------

    public static class CorpoRolagem {
        public String formula;
        public Integer lados;
        public Boolean publica;
        public String rotulo;
        public Long pedidoId;
    }

    @GetMapping("/rolagens")
    public List<Map<String, Object>> lerRolagens(@PathVariable Long cid,
                                                 @RequestParam(required = false) Long desde) {
        return rolagens.recentes(cid, atual.id(), desde);
    }

    @PostMapping("/rolagens")
    public Map<String, Object> rolar(@PathVariable Long cid, @RequestBody CorpoRolagem c) {
        /* o botao de dado manda so os lados; a caixa de formula manda o texto */
        String f = c.formula != null && !c.formula.isBlank() ? c.formula : "1d" + (c.lados == null ? 0 : c.lados);
        return rolagens.rolar(cid, atual.usuario(), f, c.publica, c.rotulo, c.pedidoId);
    }

    @PostMapping("/rolagens/pedido")
    public Map<String, Object> pedirTeste(@PathVariable Long cid, @RequestBody CorpoRolagem c) {
        return rolagens.pedir(cid, atual.usuario(), c.formula, c.rotulo);
    }

    // ---------- anotacoes privadas ----------

    @GetMapping("/notas")
    public Map<String, Object> lerNotas(@PathVariable Long cid) {
        camp.exigeMembro(cid, atual.id());
        String t = anotacoes.findByCampanhaIdAndUsuarioId(cid, atual.id())
                .map(Anotacao::getTexto).orElse("");
        return Map.of("texto", t);
    }

    @PutMapping("/notas")
    public Map<String, Object> gravarNotas(@PathVariable Long cid, @RequestBody CorpoTexto c) {
        camp.exigeMembro(cid, atual.id());
        Long uid = atual.id();
        Anotacao a = anotacoes.findByCampanhaIdAndUsuarioId(cid, uid).orElseGet(() -> {
            Anotacao x = new Anotacao();
            x.setCampanhaId(cid);
            x.setUsuarioId(uid);
            return x;
        });
        a.setTexto(c.texto == null ? "" : c.texto);
        a.setAtualizadoEm(Instant.now());
        anotacoes.save(a);
        return Map.of("ok", true);
    }
}
