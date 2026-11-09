package br.com.grimorio.web;

import br.com.grimorio.model.Campanha;
import br.com.grimorio.model.Usuario;
import br.com.grimorio.service.CampanhaService;
import br.com.grimorio.service.ConfigService;
import br.com.grimorio.service.UsuarioService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class SessaoController {

    private final Atual atual;
    private final ConfigService config;
    private final UsuarioService usuarios;
    private final CampanhaService campanhas;

    public SessaoController(Atual atual, ConfigService config,
                            UsuarioService usuarios, CampanhaService campanhas) {
        this.atual = atual;
        this.config = config;
        this.usuarios = usuarios;
        this.campanhas = campanhas;
    }

    /** Aberto: o login.html usa para pegar o cookie de CSRF antes de postar. */
    @GetMapping("/ping")
    public Map<String, Object> ping(CsrfToken csrf) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ok", true);
        m.put("csrf", csrf == null ? null : csrf.getToken());
        m.put("registroAberto", config.registroAberto());
        return m;
    }

    @GetMapping("/sessao")
    public Map<String, Object> sessao() {
        Usuario u = atual.usuario();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", u.getId());
        m.put("login", u.getLogin());
        m.put("nome", u.getNome());
        m.put("admin", u.isAdmin());
        m.put("campanhas", campanhas.minhas(u.getId()));
        m.putAll(config.publico());
        return m;
    }

    public static class NovoCadastro {
        public String login;
        public String nome;
        public String senha;
        public String convite;
    }

    /**
     * Cria conta. So funciona com registro aberto, ou com um convite valido
     * em maos, ou quando a instancia ainda nao tem nenhum usuario.
     */
    @PostMapping("/registrar")
    public ResponseEntity<?> registrar(@RequestBody NovoCadastro c) {
        boolean primeiro = usuarios.quantos() == 0;
        boolean temConvite = c.convite != null && !c.convite.isBlank();
        if (!primeiro && !config.registroAberto() && !temConvite)
            return ResponseEntity.status(403).body(Map.of("erro", "esta instancia nao aceita cadastro aberto"));

        Usuario u = usuarios.criar(c.login, c.nome, c.senha, primeiro);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", u.getId());
        r.put("login", u.getLogin());
        r.put("admin", u.isAdmin());
        if (temConvite) {
            try {
                Campanha camp = campanhas.aceitarConvite(c.convite, u.getId());
                r.put("campanha", camp.getId());
            } catch (Exception e) {
                r.put("avisoConvite", e.getMessage());
            }
        }
        return ResponseEntity.ok(r);
    }
}
