package br.com.grimorio.web;

import br.com.grimorio.model.Usuario;
import br.com.grimorio.repo.CampanhaRepo;
import br.com.grimorio.repo.MembroRepo;
import br.com.grimorio.service.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/** Painel do administrador da instancia. Rota inteira exige papel ADMIN. */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final UsuarioService usuarios;
    private final ConfigService config;
    private final IaService ia;
    private final CampanhaRepo campanhas;
    private final MembroRepo membros;

    public AdminController(UsuarioService usuarios, ConfigService config, IaService ia,
                           CampanhaRepo campanhas, MembroRepo membros) {
        this.usuarios = usuarios;
        this.config = config;
        this.ia = ia;
        this.campanhas = campanhas;
        this.membros = membros;
    }

    @GetMapping("/usuarios")
    public List<Map<String, Object>> listar() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Usuario u : usuarios.todos()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", u.getId());
            m.put("login", u.getLogin());
            m.put("nome", u.getNome());
            m.put("admin", u.isAdmin());
            m.put("ativo", u.isAtivo());
            m.put("campanhas", membros.findByUsuarioId(u.getId()).size());
            out.add(m);
        }
        return out;
    }

    public static class NovoUsuario {
        public String login;
        public String nome;
        public String senha;
        public Boolean admin;
        public Boolean ativo;
    }

    @PostMapping("/usuarios")
    public Map<String, Object> criar(@RequestBody NovoUsuario n) {
        Usuario u = usuarios.criar(n.login, n.nome, n.senha, Boolean.TRUE.equals(n.admin));
        return Map.of("id", u.getId());
    }

    @PutMapping("/usuarios/{id}")
    public Map<String, Object> editar(@PathVariable Long id, @RequestBody NovoUsuario n) {
        if (n.nome != null) usuarios.renomear(id, n.nome);
        if (n.senha != null && !n.senha.isBlank()) usuarios.trocarSenha(id, n.senha);
        if (n.ativo != null) usuarios.ativo(id, n.ativo);
        if (n.admin != null) usuarios.admin(id, n.admin);
        return Map.of("ok", true);
    }

    @DeleteMapping("/usuarios/{id}")
    public ResponseEntity<?> remover(@PathVariable Long id) {
        usuarios.remover(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/campanhas")
    public List<Map<String, Object>> todasCampanhas() {
        List<Map<String, Object>> out = new ArrayList<>();
        campanhas.findAllByOrderByNomeAsc().forEach(c -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", c.getId());
            m.put("nome", c.getNome());
            m.put("sistema", c.getSistema());
            m.put("donoId", c.getDonoId());
            m.put("membros", membros.countByCampanhaId(c.getId()));
            m.put("arquivada", c.isArquivada());
            out.add(m);
        });
        return out;
    }

    @GetMapping("/config")
    public Map<String, Object> lerConfig() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("iaConfigurada", ia.configurada());
        m.put("iaModelo", config.get(ConfigService.IA_MODELO, IaService.MODELO_PADRAO));
        m.put("registroAberto", config.registroAberto());
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
            config.set(ConfigService.IA_MODELO,
                    m == null || m.isBlank() ? IaService.MODELO_PADRAO : m.trim());
        }
        if (body.containsKey("registroAberto")) {
            config.set(ConfigService.REGISTRO_ABERTO,
                    "true".equalsIgnoreCase(body.get("registroAberto"))
                            || "1".equals(body.get("registroAberto")) ? "1" : "0");
        }
        return Map.of("ok", true);
    }
}
