package br.com.grimorio.web;

import br.com.grimorio.service.MapaService;
import br.com.grimorio.service.MapaService.CorpoElemento;
import br.com.grimorio.service.MapaService.CorpoMapa;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

/**
 * Tabletop. Quem decide o que cada um ve e o MapaService: aqui so entra quem pediu e sai a
 * resposta. Mapa e elemento novo, remocao e troca do mapa ativo sao do mestre; o jogador le o
 * mapa ativo e move o que ele pode mover.
 */
@RestController
@RequestMapping("/api/c/{cid}/mapas")
public class MapaController {

    private final MapaService mapas;
    private final Atual atual;

    public MapaController(MapaService mapas, Atual atual) {
        this.mapas = mapas;
        this.atual = atual;
    }

    public static class CorpoAtivo { public boolean ativo = true; }

    @GetMapping
    public List<Map<String, Object>> listar(@PathVariable long cid) {
        return mapas.listar(cid, atual.id());
    }

    /**
     * Empurrao do servidor (SSE). A conferencia de membro vem antes de abrir o fluxo: quem nao
     * participa recebe o 403 de sempre, em JSON, e nao um fluxo vazio. O proxy nao pode guardar
     * nem comprimir o fluxo, senao o evento chega atrasado.
     */
    @GetMapping("/eventos")
    public ResponseEntity<SseEmitter> eventos(@PathVariable long cid) {
        SseEmitter em = mapas.inscrever(cid, atual.id());
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .header("X-Accel-Buffering", "no")
                .contentType(MediaType.TEXT_EVENT_STREAM)
                .body(em);
    }

    @PostMapping
    public Map<String, Object> criar(@PathVariable long cid, @RequestBody(required = false) CorpoMapa c) {
        return mapas.criar(cid, atual.id(), c);
    }

    /** {@code desde}: o seq que a tela ja tem. Igual ao atual, a resposta e so o seq (polling). */
    @GetMapping("/{mid}")
    public Map<String, Object> estado(@PathVariable long cid, @PathVariable long mid, @RequestParam(required = false) Long desde) {
        return mapas.estado(cid, atual.id(), mid, desde);
    }

    @PutMapping("/{mid}")
    public Map<String, Object> editar(@PathVariable long cid, @PathVariable long mid, @RequestBody CorpoMapa c) {
        return mapas.editar(cid, atual.id(), mid, c);
    }

    @PostMapping("/{mid}/ativo")
    public Map<String, Object> ativar(@PathVariable long cid, @PathVariable long mid, @RequestBody(required = false) CorpoAtivo c) {
        return mapas.ativar(cid, atual.id(), mid, c == null || c.ativo);
    }

    @DeleteMapping("/{mid}")
    public ResponseEntity<Void> apagar(@PathVariable long cid, @PathVariable long mid) {
        mapas.apagar(cid, atual.id(), mid);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{mid}/elementos")
    public Map<String, Object> criarElemento(@PathVariable long cid, @PathVariable long mid, @RequestBody CorpoElemento c) {
        return mapas.criarElemento(cid, atual.id(), mid, c);
    }

    @PutMapping("/{mid}/elementos/{eid}")
    public Map<String, Object> mudarElemento(@PathVariable long cid, @PathVariable long mid, @PathVariable long eid,
                                             @RequestBody CorpoElemento c) {
        return mapas.mudarElemento(cid, atual.id(), mid, eid, c);
    }

    @DeleteMapping("/{mid}/elementos/{eid}")
    public ResponseEntity<Void> removerElemento(@PathVariable long cid, @PathVariable long mid, @PathVariable long eid) {
        mapas.removerElemento(cid, atual.id(), mid, eid);
        return ResponseEntity.noContent().build();
    }
}
