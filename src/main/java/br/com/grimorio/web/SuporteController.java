package br.com.grimorio.web;

import br.com.grimorio.service.SuporteService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** /api/suporte e de qualquer conta logada; o que fica sob /api/admin exige ADMIN no SecurityConfig. */
@RestController
@RequestMapping("/api")
public class SuporteController {

    private final SuporteService suporte;
    private final Atual atual;

    public SuporteController(SuporteService suporte, Atual atual) {
        this.suporte = suporte;
        this.atual = atual;
    }

    public static class Corpo { public String assunto; public String mensagem; public String contato; public String contexto; }

    @PostMapping("/suporte")
    public Map<String, Object> abrir(@RequestBody Corpo c) {
        return suporte.abrir(atual.usuario(), c.assunto, c.mensagem, c.contato, c.contexto);
    }

    @GetMapping("/admin/suporte")
    public List<Map<String, Object>> recentes() {
        return suporte.recentes();
    }

    @PostMapping("/admin/suporte/teste")
    public ResponseEntity<?> testar() {
        try {
            suporte.testar();
            return ResponseEntity.ok(Map.of("ok", true, "para", suporte.destino()));
        } catch (Exception e) {
            return ResponseEntity.status(502).body(Map.of("erro", "o e-mail não saiu: " + suporte.explicar(e)));
        }
    }
}
