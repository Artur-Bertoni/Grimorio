package br.com.grimorio.web;

import br.com.grimorio.model.Campanha;
import br.com.grimorio.model.Usuario;
import br.com.grimorio.service.CampanhaService;
import br.com.grimorio.service.ConfigService;
import br.com.grimorio.service.Freio;
import br.com.grimorio.service.MetricaService;
import br.com.grimorio.service.UsuarioService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.locks.ReentrantLock;

@RestController
@RequestMapping("/api")
public class SessaoController {

    private final Atual atual;
    private final ConfigService config;
    private final UsuarioService usuarios;
    private final CampanhaService campanhas;
    private final MetricaService metricas;

    private static final int CADASTROS_POR_HORA = 10;
    private static final String LOGIN = "login";

    private final Freio freio;
    /* Decidir se e a primeira conta e cria-la andam juntos: dois cadastros no mesmo instante numa
       instancia vazia viravam dois administradores (e o segundo passava pela porta do primeiro). A
       instancia e unica, entao uma trava na memoria basta; criar() faz o commit antes de soltar. */
    private final ReentrantLock primeiraConta = new ReentrantLock();

    public SessaoController(Atual atual, ConfigService config, UsuarioService usuarios,
                            CampanhaService campanhas, MetricaService metricas, Freio freio) {
        this.freio = freio;
        this.atual = atual;
        this.config = config;
        this.usuarios = usuarios;
        this.campanhas = campanhas;
        this.metricas = metricas;
    }

    public static class Uso {
        public String evento;
    }

    /** Contagem anonima de uso (ver Metrica): so o nome do evento entra, nunca quem mandou. */
    @PostMapping("/metrica")
    public ResponseEntity<Void> metrica(@RequestBody Uso u) {
        metricas.contar(u.evento);
        return ResponseEntity.noContent().build();
    }

    /** Aberto: a tela de login (paginas/login.html) usa para pegar o cookie de CSRF antes de postar. */
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
        m.put(LOGIN, u.getLogin());
        m.put("nome", u.getNome());
        m.put("email", u.getEmail());
        m.put("toursVistos", UsuarioService.toursVistos(u));
        m.put("admin", u.isAdmin());
        m.put("campanhas", campanhas.minhas(u.getId()));
        m.putAll(config.publico());
        return m;
    }

    public static class MeuPerfil {
        public String nome;
        public String senhaAtual;
        public String senhaNova;
        /* null deixa como esta; texto vazio tira o e-mail */
        public String email;
        /* "mestre" ou "jogador": tour guiado que a pessoa terminou ou pulou */
        public String tourVisto;
    }

    /**
     * A propria pessoa muda o nome e a senha. Trocar senha exige a atual, para
     * que uma sessao esquecida aberta num navegador alheio nao vire sequestro
     * de conta. O login nao muda: e a chave de tudo e dos convites.
     */
    @PutMapping("/perfil")
    public ResponseEntity<Object> perfil(@RequestBody MeuPerfil p) {
        Usuario u = atual.usuario();
        boolean querSenha = p.senhaNova != null && !p.senhaNova.isBlank();
        if (querSenha && !usuarios.conferirSenha(u.getId(), p.senhaAtual))
            return ResponseEntity.status(403).body(Map.of("erro", "a senha atual não confere"));
        if (p.nome != null && !p.nome.isBlank()) usuarios.renomear(u.getId(), p.nome);
        if (p.email != null) usuarios.definirEmail(u.getId(), p.email);
        if (p.tourVisto != null) usuarios.marcarTour(u.getId(), p.tourVisto);
        if (querSenha) usuarios.trocarSenha(u.getId(), p.senhaNova);
        Usuario d = usuarios.porId(u.getId());
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", d.getId());
        r.put(LOGIN, d.getLogin());
        r.put("nome", d.getNome());
        r.put("email", d.getEmail());
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
    public ResponseEntity<Object> registrar(@RequestBody NovoCadastro c, HttpServletRequest req) {
        /* conta nova e barata de criar: sem freio, um script enchia o banco de contas */
        if (freio.excedeu("cadastro:" + req.getRemoteAddr(), CADASTROS_POR_HORA, Duration.ofHours(1)))
            return ResponseEntity.status(429).body(Map.of("erro", "cadastros demais deste endereço; tente mais tarde",
                    "codigo", "muitas-tentativas"));
        boolean temConvite = c.convite != null && !c.convite.isBlank();
        Usuario u;
        primeiraConta.lock();
        try {
            boolean primeiro = usuarios.quantos() == 0;
        /* Com o cadastro fechado, o convite e a unica porta, entao ele e conferido ANTES de a conta
           existir. Antes so se olhava se o campo vinha preenchido: um convite inventado criava a
           conta e so falhava na hora de entrar na campanha. */
            if (!primeiro && !config.registroAberto() && !(temConvite && campanhas.conviteValido(c.convite)))
                return ResponseEntity.status(403).body(Map.of("erro", temConvite
                        ? "esse convite não existe mais ou já foi usado; peça outro a quem mestra"
                        : "esta instância não aceita cadastro aberto", "codigo", "proibido"));
            u = usuarios.criar(c.login, c.nome, c.senha, primeiro);
        } finally {
            primeiraConta.unlock();
        }
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", u.getId());
        r.put(LOGIN, u.getLogin());
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
