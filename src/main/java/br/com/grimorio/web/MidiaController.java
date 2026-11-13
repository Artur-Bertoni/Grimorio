package br.com.grimorio.web;

import br.com.grimorio.model.Midia;
import br.com.grimorio.model.Papel;
import br.com.grimorio.service.CampanhaService;
import br.com.grimorio.service.MidiaService;
import br.com.grimorio.service.PacoteService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/c/{cid}")
public class MidiaController {

    private final CampanhaService camp;
    private final MidiaService midia;
    private final PacoteService pacote;
    private final Atual atual;

    public MidiaController(CampanhaService camp, MidiaService midia,
                           PacoteService pacote, Atual atual) {
        this.camp = camp;
        this.midia = midia;
        this.pacote = pacote;
        this.atual = atual;
    }

    @GetMapping("/midia")
    public Map<String, Object> catalogo(@PathVariable Long cid) {
        boolean mestre = camp.exigeMembro(cid, atual.id()) == Papel.MESTRE;
        return midia.catalogo(cid, mestre);
    }

    @PostMapping("/midia/pdf")
    public Map<String, Object> subirPdf(@PathVariable Long cid,
                                        @RequestParam String abrev,
                                        @RequestParam(required = false) String nome,
                                        @RequestParam(required = false, defaultValue = "false") boolean publico,
                                        @RequestParam MultipartFile arquivo) throws Exception {
        camp.exigeMestre(cid, atual.id());
        Midia m = midia.salvarPdf(cid, abrev, nome, publico, arquivo);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", m.getId());
        r.put("abrev", m.getChave());
        r.put("paginas", m.getPaginas());
        r.put("publico", m.isPublico());
        return r;
    }

    @PostMapping("/midia/audio")
    public Map<String, Object> subirAudio(@PathVariable Long cid,
                                          @RequestParam(required = false) String categoria,
                                          @RequestParam(required = false) String nome,
                                          @RequestParam MultipartFile arquivo) throws Exception {
        camp.exigeMestre(cid, atual.id());
        Midia m = midia.salvarAudio(cid, categoria, nome, arquivo);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", m.getId());
        r.put("nome", m.getNome());
        r.put("cat", m.getCategoria());
        return r;
    }

    @PostMapping("/midia/img")
    public Map<String, Object> subirImagem(@PathVariable Long cid,
                                           @RequestParam(required = false) String nome,
                                           @RequestParam MultipartFile arquivo) throws Exception {
        camp.exigeMestre(cid, atual.id());
        Midia m = midia.salvarImagem(cid, nome, arquivo);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", m.getId());
        r.put("nome", m.getNome());
        r.put("arquivo", m.getArquivo());
        return r;
    }

    /** Campos opcionais: so o que vier e alterado. */
    public static class CorpoVisibilidade { public Boolean publico; public String nome; public String categoria; }

    @PutMapping("/midia/{id}")
    public Map<String, Object> visibilidade(@PathVariable Long cid, @PathVariable Long id,
                                            @RequestBody CorpoVisibilidade c) {
        camp.exigeMestre(cid, atual.id());
        if (c.publico != null) midia.trocarVisibilidade(cid, id, c.publico);
        if (c.nome != null || c.categoria != null) midia.editar(cid, id, c.nome, c.categoria);
        return Map.of("ok", true);
    }

    @PostMapping("/midia/{id}/reindexar")
    public Map<String, Object> reindexar(@PathVariable Long cid, @PathVariable Long id) throws Exception {
        camp.exigeMestre(cid, atual.id());
        return midia.reindexar(cid, id);
    }

    @PostMapping("/midia/reescanear")
    public Map<String, Object> reescanear(@PathVariable Long cid) throws Exception {
        camp.exigeMestre(cid, atual.id());
        return midia.reescanear(cid);
    }

    @DeleteMapping("/midia/{id}")
    public ResponseEntity<?> remover(@PathVariable Long cid, @PathVariable Long id) throws Exception {
        camp.exigeMestre(cid, atual.id());
        midia.remover(cid, id);
        return ResponseEntity.noContent().build();
    }

    // ---------- pacote de campanha ----------

    @GetMapping("/pacote")
    public ResponseEntity<StreamingResponseBody> exportar(
            @PathVariable Long cid,
            @RequestParam(required = false, defaultValue = "true") boolean imagens) {
        camp.exigeMestre(cid, atual.id());
        String nome = "campanha-" + cid + ".zip";
        StreamingResponseBody corpo = out -> pacote.exportar(cid, imagens, out);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + nome + "\"")
                .body(corpo);
    }

    @PostMapping("/pacote")
    public Map<String, Object> importar(@PathVariable Long cid,
                                        @RequestParam MultipartFile arquivo,
                                        @RequestParam(required = false, defaultValue = "false") boolean substituir)
            throws Exception {
        camp.exigeMestre(cid, atual.id());
        return pacote.importar(cid, atual.id(), arquivo, substituir);
    }
}
