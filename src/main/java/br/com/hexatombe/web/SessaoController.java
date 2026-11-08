package br.com.hexatombe.web;

import br.com.hexatombe.model.Usuario;
import br.com.hexatombe.service.ConfigService;
import br.com.hexatombe.service.DocService;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class SessaoController {

    private final Atual atual;
    private final DocService docs;
    private final ConfigService config;

    public SessaoController(Atual atual, DocService docs, ConfigService config) {
        this.atual = atual;
        this.docs = docs;
        this.config = config;
    }

    /** Aberto. Serve para o login.html pegar o cookie de CSRF antes de postar. */
    @GetMapping("/ping")
    public Map<String, Object> ping(CsrfToken csrf) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ok", true);
        m.put("csrf", csrf == null ? null : csrf.getToken());
        return m;
    }

    @GetMapping("/sessao")
    public Map<String, Object> sessao() {
        Usuario u = atual.usuario();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", u.getId());
        m.put("login", u.getLogin());
        m.put("nome", u.getNome());
        m.put("papel", u.getPapel().name());
        m.put("mestre", atual.mestre());
        m.put("versaoMesa", docs.ler(DocService.MESA).getVersao());
        m.putAll(config.publico());
        return m;
    }
}
