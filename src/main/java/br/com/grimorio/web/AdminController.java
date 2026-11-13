package br.com.grimorio.web;

import br.com.grimorio.model.Usuario;
import br.com.grimorio.repo.CampanhaRepo;
import br.com.grimorio.repo.ChamadoRepo;
import br.com.grimorio.repo.MembroRepo;
import br.com.grimorio.service.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.sql.DataSource;
import java.lang.management.ManagementFactory;
import java.nio.file.Paths;
import java.time.Instant;
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
    private final SuporteService suporte;
    private final MidiaService midia;
    private final ChamadoRepo chamados;
    private final DataSource banco;
    private final br.com.grimorio.config.AppProps props;

    public AdminController(UsuarioService usuarios, ConfigService config, IaService ia,
                           CampanhaRepo campanhas, MembroRepo membros, SuporteService suporte,
                           MidiaService midia, ChamadoRepo chamados, DataSource banco,
                           br.com.grimorio.config.AppProps props) {
        this.suporte = suporte;
        this.midia = midia;
        this.chamados = chamados;
        this.banco = banco;
        this.props = props;
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

    /** Armazenamento e saude do servidor, para o painel de Administracao. */
    @GetMapping("/sistema")
    public Map<String, Object> sistema() {
        Map<Long, String> nomes = new HashMap<>();
        campanhas.findAll().forEach(c -> nomes.put(c.getId(), c.getNome()));
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("armazenamento", midia.estadoArmazenamento(nomes));
        Map<String, Object> s = new LinkedHashMap<>();
        String nomeBanco;
        try (var c = banco.getConnection()) {
            var md = c.getMetaData();
            nomeBanco = md.getDatabaseProductName() + " " + md.getDatabaseProductVersion().split(" ")[0];
        } catch (Exception e) {
            nomeBanco = "indisponível (" + e.getMessage() + ")";
        }
        s.put("banco", nomeBanco);
        s.put("midiaDir", Paths.get(props.getMidiaDir()).toAbsolutePath().normalize().toString());
        s.put("java", System.getProperty("java.version"));
        Runtime rt = Runtime.getRuntime();
        s.put("memoriaUsada", rt.totalMemory() - rt.freeMemory());
        s.put("memoriaMax", rt.maxMemory());
        s.put("noArDesde", Instant.ofEpochMilli(ManagementFactory.getRuntimeMXBean().getStartTime()).toEpochMilli());
        s.put("contas", usuarios.todos().size());
        s.put("campanhas", nomes.size());
        s.put("suporteNaoEnviado", chamados.countByEnviadoFalse());
        m.put("sistema", s);
        return m;
    }

    /** Junta agora as copias iguais do volume (o boot ja faz isso; serve para depois de subir
     *  arquivos direto no volume). */
    @PostMapping("/armazenamento/juntar")
    public Map<String, Object> juntar() {
        return Map.of("liberado", midia.desduplicarVolume());
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
        /* SMTP: tudo volta menos a senha, como a chave da IA */
        m.put("suporteEmail", suporte.destino());
        m.put("smtpHost", config.get(SuporteService.SMTP_HOST, ""));
        m.put("smtpPorta", config.get(SuporteService.SMTP_PORTA, "587"));
        m.put("smtpUsuario", config.get(SuporteService.SMTP_USUARIO, ""));
        m.put("smtpRemetente", config.get(SuporteService.SMTP_REMETENTE, ""));
        m.put("smtpSenhaSalva", !config.get(SuporteService.SMTP_SENHA, "").isBlank());
        m.put("emailProvedor", suporte.provedor());
        m.put("emailChaveSalva", !config.get(SuporteService.EMAIL_CHAVE, "").isBlank());
        m.put("emailConfigurado", suporte.envioConfigurado());
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
        for (String[] k : new String[][]{{"suporteEmail", SuporteService.DESTINO}, {"smtpHost", SuporteService.SMTP_HOST},
                {"smtpPorta", SuporteService.SMTP_PORTA}, {"smtpUsuario", SuporteService.SMTP_USUARIO},
                {"smtpRemetente", SuporteService.SMTP_REMETENTE}}) {
            if (body.containsKey(k[0])) config.set(k[1], body.get(k[0]) == null ? "" : body.get(k[0]).trim());
        }
        if (body.containsKey("emailProvedor")) {
            String p = body.get("emailProvedor") == null ? "" : body.get("emailProvedor").trim().toLowerCase();
            if (!SuporteService.PROVEDORES.contains(p)) throw new IllegalArgumentException("provedor de e-mail desconhecido");
            config.set(SuporteService.EMAIL_PROVEDOR, p);
        }
        /* chave e senha vazias mantem a que esta salva: o campo nunca vem preenchido do servidor */
        if (body.containsKey("emailChave") && body.get("emailChave") != null && !body.get("emailChave").isBlank())
            config.set(SuporteService.EMAIL_CHAVE, body.get("emailChave").trim());
        if (body.containsKey("smtpSenha") && body.get("smtpSenha") != null && !body.get("smtpSenha").isEmpty())
            config.set(SuporteService.SMTP_SENHA, body.get("smtpSenha"));
        if (body.containsKey("registroAberto")) {
            config.set(ConfigService.REGISTRO_ABERTO,
                    "true".equalsIgnoreCase(body.get("registroAberto"))
                            || "1".equals(body.get("registroAberto")) ? "1" : "0");
        }
        return Map.of("ok", true);
    }
}
