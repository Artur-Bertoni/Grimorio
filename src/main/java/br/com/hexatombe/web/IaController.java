package br.com.hexatombe.web;

import br.com.hexatombe.service.IaService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/ia")
public class IaController {

    private final IaService ia;
    private final Atual atual;

    public IaController(IaService ia, Atual atual) {
        this.ia = ia;
        this.atual = atual;
    }

    @PostMapping
    public ResponseEntity<?> perguntar(@RequestBody IaService.Pergunta p) {
        if (!ia.configurada())
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("erro", "a chave da API nao foi configurada no painel"));
        try {
            p.mestre = atual.mestre();
            return ResponseEntity.ok(Map.of("texto", ia.responder(p)));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("erro", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("erro", e.getMessage()));
        }
    }
}
