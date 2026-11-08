package br.com.hexatombe.web;

import br.com.hexatombe.model.Nota;
import br.com.hexatombe.model.Usuario;
import br.com.hexatombe.repo.NotaRepo;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Map;

/** Caderno privado: cada um le e grava so o seu. */
@RestController
@RequestMapping("/api/notas")
public class NotaController {

    private final NotaRepo repo;
    private final Atual atual;

    public NotaController(NotaRepo repo, Atual atual) {
        this.repo = repo;
        this.atual = atual;
    }

    @GetMapping
    public Map<String, Object> ler() {
        Usuario u = atual.usuario();
        String t = repo.findById(u.getId()).map(Nota::getTexto).orElse("");
        return Map.of("texto", t);
    }

    @PutMapping
    public Map<String, Object> gravar(@RequestBody Corpo c) {
        Usuario u = atual.usuario();
        Nota n = repo.findById(u.getId()).orElseGet(() -> {
            Nota x = new Nota();
            x.setUsuarioId(u.getId());
            return x;
        });
        n.setTexto(c.texto == null ? "" : c.texto);
        n.setAtualizadoEm(Instant.now());
        repo.save(n);
        return Map.of("ok", true);
    }

    public static class Corpo {
        public String texto;
    }
}
