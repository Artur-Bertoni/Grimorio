package br.com.hexatombe.web;

import br.com.hexatombe.service.IndiceService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * O jogador recebe o indice publico. O mestre recebe publico + Arquivos
 * Secretos + o que ele subiu. O filtro e aqui no servidor, nao na tela.
 */
@RestController
@RequestMapping("/api/indice")
public class IndiceController {

    private final IndiceService indice;
    private final Atual atual;

    public IndiceController(IndiceService indice, Atual atual) {
        this.indice = indice;
        this.atual = atual;
    }

    @GetMapping
    public ResponseEntity<String> ler() {
        String json = indice.json(atual.mestre());
        return ResponseEntity.ok()
                .contentType(MediaType.valueOf("application/json;charset=UTF-8"))
                .header("Cache-Control", "no-store")
                .body(json);
    }
}
