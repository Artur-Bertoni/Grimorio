package br.com.hexatombe.web;

import br.com.hexatombe.model.Doc;
import br.com.hexatombe.service.DocService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

/** Guia do mestre: tudo o que os jogadores nao podem ver. Rota so para MESTRE. */
@RestController
@RequestMapping("/api/guia")
public class GuiaController {

    private final DocService docs;

    public GuiaController(DocService docs) {
        this.docs = docs;
    }

    @GetMapping
    public Map<String, Object> ler() {
        Doc d = docs.ler(DocService.GUIA);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("versao", d.getVersao());
        m.put("json", d.getConteudo());
        return m;
    }

    @PutMapping
    public ResponseEntity<?> gravar(@RequestBody Corpo c) {
        try {
            long v = docs.gravar(DocService.GUIA, c.json, c.versao == null ? -1 : c.versao);
            return ResponseEntity.ok(Map.of("versao", v));
        } catch (DocService.ConflitoException e) {
            Doc d = docs.ler(DocService.GUIA);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("erro", "conflito");
            m.put("versao", d.getVersao());
            m.put("json", d.getConteudo());
            return ResponseEntity.status(HttpStatus.CONFLICT).body(m);
        }
    }

    public static class Corpo {
        public String json;
        public Long versao;
    }
}
