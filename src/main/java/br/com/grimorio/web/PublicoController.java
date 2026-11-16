package br.com.grimorio.web;

import java.time.Duration;
import java.time.Instant;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import br.com.grimorio.service.SuporteService;
import br.com.grimorio.service.TextosService;
import br.com.grimorio.service.UsuarioService;

/**
 * O que a tela de login, a de privacidade e a de termos pedem antes de haver sessao. Nada aqui
 * devolve dado de conta: o pedido de redefinicao responde igual exista a conta ou nao.
 */
@RestController
@RequestMapping("/api/publico")
public class PublicoController {

    private static final Logger log = LoggerFactory.getLogger(PublicoController.class);
    private static final int PEDIDOS_POR_HORA = 5;

    private final TextosService textos;
    private final UsuarioService usuarios;
    private final SuporteService email;
    /* freio contra quem usa o "esqueci a senha" para encher a caixa de alguem */
    private final Map<String, Deque<Instant>> pedidos = new ConcurrentHashMap<>();

    public PublicoController(TextosService textos, UsuarioService usuarios, SuporteService email) {
        this.textos = textos;
        this.usuarios = usuarios;
        this.email = email;
    }

    @GetMapping("/texto/{chave}")
    public Map<String, Object> texto(@PathVariable String chave) {
        return textos.ler(chave);
    }

    /** A tela de login pergunta se ha como mandar e-mail, para explicar o caminho certo. */
    @GetMapping("/recuperacao")
    public Map<String, Object> recuperacao() {
        return Map.of("porEmail", email.envioConfigurado());
    }

    public static class Esqueci {
        public String conta;
    }

    @PostMapping("/senha/esqueci")
    public Map<String, Object> esqueci(@RequestBody Esqueci p) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("porEmail", email.envioConfigurado());
        String chave = p.conta == null ? "" : p.conta.trim().toLowerCase();
        if (!email.envioConfigurado() || chave.isEmpty() || excedeu(chave)) return r;
        usuarios.pedirRedefinicao(chave).ifPresent(par -> {
            String link = ServletUriComponentsBuilder.fromCurrentContextPath()
                    .path("/paginas/login.html").queryParam("redefinir", par.getValue()).toUriString();
            try {
                email.enviarPara(par.getKey().getEmail(), "[Grimório] Redefinir a senha",
                        "Olá, " + par.getKey().getNome() + ".\n\n"
                        + "Alguém pediu para redefinir a senha da conta \"" + par.getKey().getLogin() + "\" neste Grimório.\n"
                        + "Para escolher uma senha nova, abra o link abaixo. Ele vale por uma hora e só funciona uma vez.\n\n"
                        + link + "\n\n"
                        + "Se não foi você, ignore este e-mail: a senha atual continua valendo.\n");
            } catch (Exception e) {
                log.warn("E-mail de redefinicao nao saiu para a conta {}: {}", par.getKey().getId(), e.toString());
            }
        });
        return r;
    }

    private boolean excedeu(String chave) {
        Instant agora = Instant.now(), corte = agora.minus(Duration.ofHours(1));
        Deque<Instant> fila = pedidos.computeIfAbsent(chave, k -> new ConcurrentLinkedDeque<>());
        while (!fila.isEmpty() && fila.peekFirst().isBefore(corte)) fila.pollFirst();
        if (fila.size() >= PEDIDOS_POR_HORA) return true;
        fila.addLast(agora);
        return false;
    }

    public static class Redefinir {
        public String token;
        public String senha;
    }

    @PostMapping("/senha/redefinir")
    public Map<String, Object> redefinir(@RequestBody Redefinir p) {
        String login = usuarios.redefinir(p.token, p.senha).getLogin();
        return Map.of("ok", true, "login", login);
    }
}
