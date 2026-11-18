package br.com.grimorio.web;

import br.com.grimorio.service.CampanhaService;
import br.com.grimorio.service.ModeloService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;

/** Cadastro dos modelos de campanha. Fica sob /api/admin, que o AdminAutorizacao fecha. */
@RestController
@RequestMapping("/api/admin/modelos")
public class AdminModelosController {

    private final ModeloService modelos;
    private final CampanhaService camp;
    private final Atual atual;

    public AdminModelosController(ModeloService modelos, CampanhaService camp, Atual atual) {
        this.modelos = modelos;
        this.camp = camp;
        this.atual = atual;
    }

    @PostMapping
    public Map<String, Object> enviar(@RequestParam MultipartFile arquivo) throws IOException {
        return modelos.salvarDoEnvio(arquivo);
    }

    /* Mesmo sendo admin, so vira modelo campanha que a pessoa mestra: administrar a instancia
       nao da direito de copiar o conteudo da mesa dos outros. */
    @PostMapping("/campanha/{cid}")
    public Map<String, Object> daCampanha(@PathVariable Long cid) throws IOException {
        camp.exigeMestre(cid, atual.id());
        return modelos.salvarDaCampanha(cid);
    }

    public record Edicao(String nome, String descricao) { }

    @PutMapping("/{id}")
    public Map<String, Object> editar(@PathVariable String id, @RequestBody Edicao e) throws IOException {
        return modelos.editar(id, e.nome(), e.descricao());
    }

    @PostMapping("/{id}/capa")
    public Map<String, Object> trocarCapa(@PathVariable String id, @RequestParam MultipartFile arquivo) throws IOException {
        return modelos.trocarCapa(id, arquivo);
    }

    @DeleteMapping("/{id}/capa")
    public Map<String, Object> tirarCapa(@PathVariable String id) throws IOException {
        return modelos.tirarCapa(id);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> remover(@PathVariable String id) throws IOException {
        modelos.remover(id);
        return ResponseEntity.noContent().build();
    }
}
