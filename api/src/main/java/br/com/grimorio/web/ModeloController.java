package br.com.grimorio.web;

import br.com.grimorio.service.CampanhaService;
import br.com.grimorio.service.ModeloService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/** Modelos de campanha do lado de quem cria uma campanha. Cadastrar e da administracao
 *  (AdminModelosController). O pacote em si nunca sai daqui: so a lista, a capa e o aplicar. */
@RestController
@RequestMapping("/api")
public class ModeloController {

    private final ModeloService modelos;
    private final CampanhaService camp;
    private final Atual atual;

    public ModeloController(ModeloService modelos, CampanhaService camp, Atual atual) {
        this.modelos = modelos;
        this.camp = camp;
        this.atual = atual;
    }

    /* qualquer conta pode criar campanha, entao qualquer conta ve os modelos */
    @GetMapping("/modelos")
    public List<Map<String, Object>> listar() throws IOException {
        return modelos.listar();
    }

    @GetMapping("/modelos/{id}/capa")
    public ResponseEntity<Resource> capa(@PathVariable String id) throws IOException {
        return modelos.capa(id)
                .map(c -> ResponseEntity.ok()
                        .contentType(MediaType.parseMediaType(c.getValue()))
                        /* a administracao pode trocar a capa a qualquer hora: o navegador confere sempre */
                        .cacheControl(CacheControl.noCache().cachePrivate())
                        .<Resource>body(new FileSystemResource(c.getKey())))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /* o modelo entra numa campanha que a pessoa mestra, substituindo guia e mesa */
    @PostMapping("/c/{cid}/modelo/{id}")
    public Map<String, Object> aplicar(@PathVariable Long cid, @PathVariable String id) throws IOException {
        camp.exigeMestre(cid, atual.id());
        return modelos.aplicar(cid, atual.id(), id);
    }
}
