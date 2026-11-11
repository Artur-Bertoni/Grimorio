package br.com.grimorio.web;

import br.com.grimorio.model.Campanha;
import br.com.grimorio.model.Usuario;
import br.com.grimorio.service.CampanhaService;
import br.com.grimorio.service.ConfigService;
import br.com.grimorio.service.MigracaoService;
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
    private final MigracaoService migracao;

    public SessaoController(Atual atual, ConfigService config, UsuarioService usuarios,
                            CampanhaService campanhas, MigracaoService migracao) {
        this.atual = atual;
        this.config = config;
        this.usuarios = usuarios;
        this.campanhas = campanhas;
        this.migracao = migracao;
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

    public static class MeuPerfil {
        public String nome;
        public String senhaAtual;
        public String senhaNova;
    }

    /**
     * A propria pessoa muda o nome e a senha. Trocar senha exige a atual, para
     * que uma sessao esquecida aberta num navegador alheio nao vire sequestro
     * de conta. O login nao muda: e a chave de tudo e dos convites.
     */
    @PutMapping("/perfil")
    public ResponseEntity<?> perfil(@RequestBody MeuPerfil p) {
        Usuario u = atual.usuario();
        boolean querSenha = p.senhaNova != null && !p.senhaNova.isBlank();
        if (querSenha && !usuarios.conferirSenha(u.getId(), p.senhaAtual))
            return ResponseEntity.status(403).body(Map.of("erro", "a senha atual nao confere"));
        if (p.nome != null && !p.nome.isBlank()) usuarios.renomear(u.getId(), p.nome);
        if (querSenha) usuarios.trocarSenha(u.getId(), p.senhaNova);
        Usuario d = usuarios.porId(u.getId());
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", d.getId());
        r.put("login", d.getLogin());
        r.put("nome", d.getNome());
        r.put("senhaTrocada", querSenha);
        return ResponseEntity.ok(r);
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
        if (primeiro) {
            // instalacao que vinha da versao de campanha unica: agora ha dono
            Long cid = migracao.migrar();
            if (cid != null) return ResponseEntity.ok(Map.of(
                    "id", u.getId(), "login", u.getLogin(), "admin", true, "campanha", cid));
        }
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
