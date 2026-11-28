package br.com.grimorio.web;

import br.com.grimorio.model.*;
import br.com.grimorio.repo.AnotacaoRepo;
import br.com.grimorio.repo.MuralRepo;
import br.com.grimorio.service.CampanhaEventos;
import br.com.grimorio.service.CampanhaService;
import br.com.grimorio.service.DocumentoService;
import br.com.grimorio.service.IndiceService;
import br.com.grimorio.service.RolagemService;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Instant;
import java.util.*;

/** Guia, mesa, indice, mural e anotacoes, sempre dentro de uma campanha. */
@RestController
@RequestMapping("/api/c/{cid}")
public class ConteudoController {

    private static final int MAX_NOTAS = 200_000;
    private static final String VERSAO = "versao";

    private final CampanhaService camp;
    private final DocumentoService docs;
    private final IndiceService indice;
    private final MuralRepo mural;
    private final AnotacaoRepo anotacoes;
    private final Atual atual;
    private final RolagemService rolagens;
    private final CampanhaEventos eventos;

    public ConteudoController(CampanhaService camp, DocumentoService docs, IndiceService indice,
                              MuralRepo mural, AnotacaoRepo anotacoes, Atual atual,
                              RolagemService rolagens, CampanhaEventos eventos) {
        this.rolagens = rolagens;
        this.eventos = eventos;
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

    // ---------- aviso de mudanca (SSE) ----------

    /**
     * O empurrao da campanha: "a mesa mudou", "saiu rolagem". A conferencia de membro vem antes de
     * abrir o fluxo, como no mapa; o proxy nao pode guardar nem comprimir o fluxo.
     */
    @GetMapping("/eventos")
    public ResponseEntity<SseEmitter> eventos(@PathVariable Long cid) {
        long uid = atual.id();
        camp.exigeMembro(cid, uid);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .header("X-Accel-Buffering", "no")
                .contentType(MediaType.TEXT_EVENT_STREAM)
                .body(eventos.inscrever(cid, uid));
    }

    // ---------- guia (so mestre) ----------

    @GetMapping("/guia")
    public Map<String, Object> lerGuia(@PathVariable Long cid) {
        camp.exigeMestre(cid, atual.id());
        Documento d = docs.ler(cid, DocumentoService.GUIA);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put(VERSAO, d.getVersao());
        m.put("json", d.getConteudo());
        return m;
    }

    @PutMapping("/guia")
    public ResponseEntity<Object> gravarGuia(@PathVariable Long cid, @RequestBody CorpoDoc c) {
        camp.exigeMestre(cid, atual.id());
        return gravar(cid, DocumentoService.GUIA, c);
    }

    // ---------- mesa (todos leem, mestre escreve) ----------

    @GetMapping("/mesa")
    public Map<String, Object> lerMesa(@PathVariable Long cid) {
        camp.exigeMembro(cid, atual.id());
        Documento d = docs.ler(cid, DocumentoService.MESA);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put(VERSAO, d.getVersao());
        m.put("json", d.getConteudo());
        return m;
    }

    @GetMapping("/mesa/versao")
    public Map<String, Object> versaoMesa(@PathVariable Long cid) {
        camp.exigeMembro(cid, atual.id());
        return Map.of(VERSAO, docs.versao(cid, DocumentoService.MESA));
    }

    @PutMapping("/mesa")
    public ResponseEntity<Object> gravarMesa(@PathVariable Long cid, @RequestBody CorpoDoc c) {
        camp.exigeMestre(cid, atual.id());
        return gravar(cid, DocumentoService.MESA, c);
    }

    private ResponseEntity<Object> gravar(Long cid, String chave, CorpoDoc c) {
        try {
            long v = docs.gravar(cid, chave, c.json, c.versao == null ? -1 : c.versao);
            if (DocumentoService.MESA.equals(chave)) eventos.mesaMudou(cid, v);
            return ResponseEntity.ok(Map.of(VERSAO, v));
        } catch (DocumentoService.ConflitoException _) {
            Documento d = docs.ler(cid, chave);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("erro", "conflito");
            m.put(VERSAO, d.getVersao());
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
    public ResponseEntity<Object> postar(@PathVariable Long cid, @RequestBody CorpoTexto c) {
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
    public ResponseEntity<Object> apagarPost(@PathVariable Long cid, @PathVariable Long id) {
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
        int lados = c.lados == null ? 0 : c.lados;
        String f = c.formula != null && !c.formula.isBlank() ? c.formula : "1d" + lados;
        Map<String, Object> r = rolagens.rolar(cid, atual.usuario(), f, c.publica, c.rotulo, c.pedidoId);
        /* depois do commit (rolar e transacional e ja voltou): quem recebe o aviso le a rolagem gravada */
        eventos.rolagemNova(cid, atual.id(), Boolean.TRUE.equals(r.get("publica")));
        return r;
    }

    @PostMapping("/rolagens/pedido")
    public Map<String, Object> pedirTeste(@PathVariable Long cid, @RequestBody CorpoRolagem c) {
        Map<String, Object> r = rolagens.pedir(cid, atual.usuario(), c.formula, c.rotulo);
        eventos.rolagemNova(cid, atual.id(), true);
        return r;
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
        String texto = c.texto == null ? "" : c.texto;
        /* sem teto, qualquer membro gravava megas por pedido; 200 mil caracteres sao umas 60 paginas */
        if (texto.length() > MAX_NOTAS) throw new IllegalArgumentException("as anotações passaram de 200 mil caracteres");
        a.setTexto(texto);
        a.setAtualizadoEm(Instant.now());
        anotacoes.save(a);
        return Map.of("ok", true);
    }
}
