package br.com.grimorio.web;

import br.com.grimorio.model.Campanha;
import br.com.grimorio.model.Convite;
import br.com.grimorio.model.Papel;
import br.com.grimorio.service.CampanhaService;
import br.com.grimorio.service.MidiaService;
import br.com.grimorio.repo.*;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api")
public class CampanhaController {

    private final CampanhaService svc;
    private final Atual atual;
    private final MidiaService midia;
    private final CampanhaRepo campanhas;
    private final DocumentoRepo documentos;
    private final AnotacaoRepo anotacoes;
    private final MuralRepo mural;
    private final MembroRepo membros;
    private final ConviteRepo convites;
    private final RolagemRepo rolagens;
    private final FichaRepo fichas;

    public CampanhaController(CampanhaService svc, Atual atual, MidiaService midia,
                              CampanhaRepo campanhas, DocumentoRepo documentos,
                              AnotacaoRepo anotacoes, MuralRepo mural,
                              MembroRepo membros, ConviteRepo convites, RolagemRepo rolagens,
                              FichaRepo fichas) {
        this.fichas = fichas;
        this.svc = svc;
        this.atual = atual;
        this.midia = midia;
        this.campanhas = campanhas;
        this.documentos = documentos;
        this.anotacoes = anotacoes;
        this.mural = mural;
        this.membros = membros;
        this.convites = convites;
        this.rolagens = rolagens;
    }

    public static class CorpoCampanha {
        public String nome;
        public String sistema;
        public String descricao;
        public String tema;
        public Boolean arquivada;
        public String capa;
        public Boolean rolagensAbertas;
    }

    @GetMapping("/campanhas")
    public List<Map<String, Object>> minhas() {
        return svc.minhas(atual.id());
    }

    @PostMapping("/campanhas")
    public Map<String, Object> criar(@RequestBody CorpoCampanha c) throws Exception {
        Campanha nova = svc.criar(atual.id(), c.nome, c.sistema);
        midia.prepararPastas(nova.getId());
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", nova.getId());
        m.put("nome", nova.getNome());
        return m;
    }

    @PutMapping("/campanhas/{cid}")
    public Map<String, Object> editar(@PathVariable Long cid, @RequestBody CorpoCampanha c) {
        svc.editar(cid, atual.id(), c.nome, c.sistema, c.descricao, c.tema, c.arquivada, c.capa, c.rolagensAbertas);
        return Map.of("ok", true);
    }

    @DeleteMapping("/campanhas/{cid}")
    @Transactional
    public ResponseEntity<?> apagar(@PathVariable Long cid) throws Exception {
        svc.exigeDono(cid, atual.id());
        documentos.deleteByCampanhaId(cid);
        anotacoes.deleteByCampanhaId(cid);
        mural.deleteByCampanhaId(cid);
        rolagens.deleteByCampanhaId(cid);
        fichas.deleteByCampanhaId(cid);
        convites.deleteByCampanhaId(cid);
        membros.deleteByCampanhaId(cid);
        midia.apagarTudoDaCampanha(cid);
        campanhas.deleteById(cid);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/campanhas/{cid}/sair")
    public Map<String, Object> sair(@PathVariable Long cid) {
        svc.sair(cid, atual.id());
        return Map.of("ok", true);
    }

    // ---------- membros ----------

    @GetMapping("/campanhas/{cid}/membros")
    public List<Map<String, Object>> membros(@PathVariable Long cid) {
        return svc.membrosDe(cid, atual.id());
    }

    public static class CorpoPapel { public String papel; }

    @PutMapping("/campanhas/{cid}/membros/{uid}")
    public Map<String, Object> trocarPapel(@PathVariable Long cid, @PathVariable Long uid,
                                           @RequestBody CorpoPapel c) {
        Papel p = "MESTRE".equalsIgnoreCase(c.papel) ? Papel.MESTRE : Papel.JOGADOR;
        svc.trocarPapel(cid, atual.id(), uid, p);
        return Map.of("ok", true);
    }

    @DeleteMapping("/campanhas/{cid}/membros/{uid}")
    public ResponseEntity<?> removerMembro(@PathVariable Long cid, @PathVariable Long uid) {
        svc.remover(cid, atual.id(), uid);
        return ResponseEntity.noContent().build();
    }

    // ---------- convites ----------

    public static class CorpoConvite {
        public String papel;
        public String rotulo;
        public Integer usos;
        public Integer dias;
    }

    @GetMapping("/campanhas/{cid}/convites")
    public List<Map<String, Object>> convites(@PathVariable Long cid) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Convite c : svc.convitesDe(cid, atual.id())) out.add(mapa(c));
        return out;
    }

    @PostMapping("/campanhas/{cid}/convites")
    public Map<String, Object> criarConvite(@PathVariable Long cid, @RequestBody CorpoConvite c) {
        Papel p = "MESTRE".equalsIgnoreCase(c.papel) ? Papel.MESTRE : Papel.JOGADOR;
        Convite cv = svc.criarConvite(cid, atual.id(), p, c.rotulo,
                c.usos == null ? 1 : c.usos, c.dias);
        return mapa(cv);
    }

    @DeleteMapping("/campanhas/{cid}/convites/{id}")
    public ResponseEntity<?> apagarConvite(@PathVariable Long cid, @PathVariable Long id) {
        svc.apagarConvite(cid, atual.id(), id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/convites/{token}")
    public Map<String, Object> aceitar(@PathVariable String token) {
        Campanha c = svc.aceitarConvite(token, atual.id());
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.getId());
        m.put("nome", c.getNome());
        return m;
    }

    private Map<String, Object> mapa(Convite c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.getId());
        m.put("token", c.getToken());
        m.put("papel", c.getPapel().name());
        m.put("rotulo", c.getRotulo());
        m.put("usos", c.getUsos());
        m.put("usosMax", c.getUsosMax());
        m.put("expiraEm", c.getExpiraEm() == null ? null : c.getExpiraEm().toEpochMilli());
        m.put("valido", c.valido());
        return m;
    }
}
