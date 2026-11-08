package br.com.hexatombe.web;

import br.com.hexatombe.model.MuralPost;
import br.com.hexatombe.model.Usuario;
import br.com.hexatombe.repo.MuralRepo;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/mural")
public class MuralController {

    private final MuralRepo repo;
    private final Atual atual;

    public MuralController(MuralRepo repo, Atual atual) {
        this.repo = repo;
        this.atual = atual;
    }

    @GetMapping
    public List<Map<String, Object>> listar() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (MuralPost p : repo.findTop200ByOrderByCriadoEmDesc()) {
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

    @PostMapping
    public ResponseEntity<?> postar(@RequestBody Corpo c) {
        String t = c.texto == null ? "" : c.texto.trim();
        if (t.isEmpty()) return ResponseEntity.badRequest().body(Map.of("erro", "texto vazio"));
        if (t.length() > 2000) t = t.substring(0, 2000);
        Usuario u = atual.usuario();
        MuralPost p = new MuralPost();
        p.setUsuarioId(u.getId());
        p.setAutorNome(u.getNome());
        p.setTexto(t);
        repo.save(p);
        return ResponseEntity.ok(Map.of("id", p.getId()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> apagar(@PathVariable Long id) {
        MuralPost p = repo.findById(id).orElse(null);
        if (p == null) return ResponseEntity.notFound().build();
        Usuario u = atual.usuario();
        boolean dono = Objects.equals(p.getUsuarioId(), u.getId());
        if (!dono && !atual.mestre())
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("erro", "nao e seu"));
        repo.delete(p);
        return ResponseEntity.noContent().build();
    }

    public static class Corpo {
        public String texto;
    }
}
