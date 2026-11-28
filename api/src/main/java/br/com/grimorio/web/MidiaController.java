package br.com.grimorio.web;

import br.com.grimorio.model.Midia;
import br.com.grimorio.model.Papel;
import br.com.grimorio.service.CampanhaService;
import br.com.grimorio.service.MapaService;
import br.com.grimorio.service.MidiaService;
import br.com.grimorio.service.PacoteService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/c/{cid}")
public class MidiaController {

    private static final String K_REAPROVEITADO = "reaproveitado";

    private final CampanhaService camp;
    private final MidiaService midia;
    private final PacoteService pacote;
    private final MapaService mapas;
    private final Atual atual;

    public MidiaController(CampanhaService camp, MidiaService midia,
                           PacoteService pacote, MapaService mapas, Atual atual) {
        this.camp = camp;
        this.midia = midia;
        this.pacote = pacote;
        this.mapas = mapas;
        this.atual = atual;
    }

    /** A imagem de mapa do tabletop fica fora da lista do jogador: ele so a recebe em pedacos, cortados pela nevoa. */
    @GetMapping("/midia")
    public Map<String, Object> catalogo(@PathVariable Long cid) {
        boolean mestre = camp.exigeMembro(cid, atual.id()) == Papel.MESTRE;
        Map<String, Object> c = midia.catalogo(cid, mestre);
        if (!mestre && c.get("imagens") instanceof List<?> l) {
            Set<String> deMapa = mapas.imagensDeMapa(cid);
            c.put("imagens", l.stream().filter(i -> !(i instanceof Map<?, ?> m && deMapa.contains(String.valueOf(m.get("arquivo"))))).toList());
        }
        return c;
    }

    @PostMapping("/midia/pdf")
    public Map<String, Object> subirPdf(@PathVariable Long cid,
                                        @RequestParam String abrev,
                                        @RequestParam(required = false) String nome,
                                        @RequestParam(required = false, defaultValue = "false") boolean publico,
                                        @RequestParam MultipartFile arquivo) throws IOException {
        camp.exigeMestre(cid, atual.id());
        Midia m = midia.salvarPdf(cid, abrev, nome, publico, arquivo);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", m.getId());
        r.put("abrev", m.getChave());
        r.put("paginas", m.getPaginas());
        r.put("publico", m.isPublico());
        r.put(K_REAPROVEITADO, m.isReaproveitado());
        return r;
    }

    @PostMapping("/midia/audio")
    public Map<String, Object> subirAudio(@PathVariable Long cid,
                                          @RequestParam(required = false) String categoria,
                                          @RequestParam(required = false) String nome,
                                          @RequestParam MultipartFile arquivo) throws IOException {
        camp.exigeMestre(cid, atual.id());
        Midia m = midia.salvarAudio(cid, categoria, nome, arquivo);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", m.getId());
        r.put("nome", m.getNome());
        r.put("cat", m.getCategoria());
        r.put(K_REAPROVEITADO, m.isReaproveitado());
        return r;
    }

    @PostMapping("/midia/img")
    public Map<String, Object> subirImagem(@PathVariable Long cid,
                                           @RequestParam(required = false) String nome,
                                           @RequestParam MultipartFile arquivo) throws IOException {
        camp.exigeMestre(cid, atual.id());
        Midia m = midia.salvarImagem(cid, nome, arquivo);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", m.getId());
        r.put("nome", m.getNome());
        r.put("arquivo", m.getArquivo());
        r.put(K_REAPROVEITADO, m.isReaproveitado());
        return r;
    }

    /** Campos opcionais: so o que vier e alterado. */
    public static class CorpoVisibilidade {
        public Boolean publico;
        public String nome;
        public String categoria;
    }

    @PutMapping("/midia/{id}")
    public Map<String, Object> visibilidade(@PathVariable Long cid, @PathVariable Long id,
                                            @RequestBody CorpoVisibilidade c) {
        camp.exigeMestre(cid, atual.id());
        if (c.publico != null) midia.trocarVisibilidade(cid, id, c.publico);
        if (c.nome != null || c.categoria != null) midia.editar(cid, id, c.nome, c.categoria);
        return Map.of("ok", true);
    }

    @PostMapping("/midia/{id}/reindexar")
    public Map<String, Object> reindexar(@PathVariable Long cid, @PathVariable Long id) throws IOException {
        camp.exigeMestre(cid, atual.id());
        return midia.reindexar(cid, id);
    }

    @PostMapping("/midia/reescanear")
    public Map<String, Object> reescanear(@PathVariable Long cid) throws IOException {
        camp.exigeMestre(cid, atual.id());
        return midia.reescanear(cid);
    }

    @DeleteMapping("/midia/{id}")
    public ResponseEntity<Void> remover(@PathVariable Long cid, @PathVariable Long id) throws IOException {
        camp.exigeMestre(cid, atual.id());
        midia.remover(cid, id);
        return ResponseEntity.noContent().build();
    }

    // ---------- pacote de campanha ----------

    @GetMapping("/pacote")
    public ResponseEntity<StreamingResponseBody> exportar(
            @PathVariable Long cid,
            @RequestParam(required = false) Boolean arquivos,
            @RequestParam(required = false) Boolean imagens) throws IOException {
        camp.exigeMestre(cid, atual.id());
        String nome = "campanha-" + cid + ".zip";
        /* "imagens" e o nome antigo do parametro, de quando so as imagens iam no pacote */
        boolean comArquivos = !Boolean.FALSE.equals(arquivos != null ? arquivos : imagens);
        StreamingResponseBody corpo = out -> pacote.exportar(cid, comArquivos, out);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + nome + "\"")
                /* o zip sai em fluxo, sem Content-Length: a tela usa isto para a barra de progresso */
                .header("X-Tamanho-Estimado", String.valueOf(pacote.tamanhoEstimado(cid, comArquivos)))
                .body(corpo);
    }

    @PostMapping("/pacote")
    public Map<String, Object> importar(@PathVariable Long cid,
                                        @RequestParam MultipartFile arquivo,
                                        @RequestParam(required = false, defaultValue = "false") boolean substituir)
            throws IOException {
        camp.exigeMestre(cid, atual.id());
        return pacote.importar(cid, atual.id(), arquivo, substituir);
    }
}
