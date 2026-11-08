package br.com.hexatombe.web;

import br.com.hexatombe.model.Midia;
import br.com.hexatombe.model.Papel;
import br.com.hexatombe.model.Usuario;
import br.com.hexatombe.service.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.*;

/** Painel do mestre. Toda a rota /api/admin exige papel MESTRE. */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final UsuarioService usuarios;
    private final MidiaService midia;
    private final ConfigService config;
    private final IaService ia;

    public AdminController(UsuarioService usuarios, MidiaService midia,
                           ConfigService config, IaService ia) {
        this.usuarios = usuarios;
        this.midia = midia;
        this.config = config;
        this.ia = ia;
    }

    // ---------- usuarios ----------

    @GetMapping("/usuarios")
    public List<Map<String, Object>> listarUsuarios() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Usuario u : usuarios.todos()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", u.getId());
            m.put("login", u.getLogin());
            m.put("nome", u.getNome());
            m.put("papel", u.getPapel().name());
            m.put("ativo", u.isAtivo());
            out.add(m);
        }
        return out;
    }

    @PostMapping("/usuarios")
    public Map<String, Object> criarUsuario(@RequestBody NovoUsuario n) {
        Papel p = "MESTRE".equalsIgnoreCase(n.papel) ? Papel.MESTRE : Papel.JOGADOR;
        Usuario u = usuarios.criar(n.login, n.nome, n.senha, p);
        return Map.of("id", u.getId());
    }

    @PutMapping("/usuarios/{id}")
    public Map<String, Object> editarUsuario(@PathVariable Long id, @RequestBody NovoUsuario n) {
        if (n.nome != null) usuarios.renomear(id, n.nome);
        if (n.senha != null && !n.senha.isBlank()) usuarios.trocarSenha(id, n.senha);
        if (n.ativo != null) usuarios.ativo(id, n.ativo);
        return Map.of("ok", true);
    }

    @DeleteMapping("/usuarios/{id}")
    public ResponseEntity<?> removerUsuario(@PathVariable Long id) {
        usuarios.remover(id);
        return ResponseEntity.noContent().build();
    }

    // ---------- midia ----------

    @GetMapping("/midia")
    public Map<String, Object> catalogo() {
        return midia.catalogo();
    }

    @PostMapping("/midia/pdf")
    public Map<String, Object> subirPdf(@RequestParam String abrev,
                                       @RequestParam(required = false) String nome,
                                       @RequestParam MultipartFile arquivo) throws Exception {
        Midia m = midia.salvarPdf(abrev, nome, arquivo);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", m.getId());
        r.put("abrev", m.getChave());
        r.put("paginas", m.getPaginas());
        r.put("tamanho", m.getTamanho());
        return r;
    }

    @PostMapping("/midia/audio")
    public Map<String, Object> subirAudio(@RequestParam(required = false) String categoria,
                                         @RequestParam(required = false) String nome,
                                         @RequestParam MultipartFile arquivo) throws Exception {
        Midia m = midia.salvarAudio(categoria, nome, arquivo);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", m.getId());
        r.put("chave", m.getChave());
        r.put("nome", m.getNome());
        r.put("cat", m.getCategoria());
        return r;
    }

    @DeleteMapping("/midia/{id}")
    public ResponseEntity<?> removerMidia(@PathVariable Long id) throws Exception {
        midia.remover(id);
        return ResponseEntity.noContent().build();
    }

    // ---------- config ----------

    @GetMapping("/config")
    public Map<String, Object> lerConfig() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("iaConfigurada", ia.configurada());
        m.put("iaModelo", config.get(ConfigService.IA_MODELO, IaService.MODELO_PADRAO));
        return m;
    }

    @PutMapping("/config")
    public Map<String, Object> gravarConfig(@RequestBody Map<String, String> body) {
        if (body.containsKey("iaApiKey")) {
            String k = body.get("iaApiKey");
            config.set(ConfigService.IA_CHAVE, k == null ? "" : k.trim());
        }
        if (body.containsKey("iaModelo")) {
            String m = body.get("iaModelo");
            config.set(ConfigService.IA_MODELO, m == null || m.isBlank()
                    ? IaService.MODELO_PADRAO : m.trim());
        }
        return Map.of("ok", true);
    }

    public static class NovoUsuario {
        public String login;
        public String nome;
        public String senha;
        public String papel;
        public Boolean ativo;
    }
}
