package br.com.hexatombe.web;

import br.com.hexatombe.model.Doc;
import br.com.hexatombe.service.DocService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

/** Mesa: o que o mestre liberou. Todos leem, so o mestre escreve. */
@RestController
@RequestMapping("/api/mesa")
public class MesaController {

    private final DocService docs;
    private final Atual atual;

    public MesaController(DocService docs, Atual atual) {
        this.docs = docs;
        this.atual = atual;
    }

    @GetMapping
    public Map<String, Object> ler() {
        Doc d = docs.ler(DocService.MESA);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("versao", d.getVersao());
        m.put("json", d.getConteudo());
        return m;
    }

    /** Chamada curta para o app saber se precisa recarregar. */
    @GetMapping("/versao")
    public Map<String, Object> versao() {
        return Map.of("versao", docs.ler(DocService.MESA).getVersao());
    }

    @PutMapping
    public ResponseEntity<?> gravar(@RequestBody GuiaController.Corpo c) {
        if (!atual.mestre())
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("erro", "so o mestre altera a mesa"));
        try {
            long v = docs.gravar(DocService.MESA, c.json, c.versao == null ? -1 : c.versao);
            return ResponseEntity.ok(Map.of("versao", v));
        } catch (DocService.ConflitoException e) {
            Doc d = docs.ler(DocService.MESA);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("erro", "conflito");
            m.put("versao", d.getVersao());
            m.put("json", d.getConteudo());
            return ResponseEntity.status(HttpStatus.CONFLICT).body(m);
        }
    }
}
