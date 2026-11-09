package br.com.grimorio.web;

import br.com.grimorio.model.Papel;
import br.com.grimorio.service.CampanhaService;
import br.com.grimorio.service.IaService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/c/{cid}/ia")
public class IaController {

    private final IaService ia;
    private final CampanhaService camp;
    private final Atual atual;

    public IaController(IaService ia, CampanhaService camp, Atual atual) {
        this.ia = ia;
        this.camp = camp;
        this.atual = atual;
    }

    @PostMapping
    public ResponseEntity<?> perguntar(@PathVariable Long cid, @RequestBody IaService.Pergunta p) {
        Papel papel = camp.exigeMembro(cid, atual.id());
        if (!ia.configurada())
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("erro", "a chave da API nao foi configurada nesta instancia"));
        try {
            p.mestre = (papel == Papel.MESTRE);
            return ResponseEntity.ok(Map.of("texto", ia.responder(p)));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("erro", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("erro", e.getMessage()));
        }
    }
}
