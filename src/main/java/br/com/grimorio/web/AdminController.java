package br.com.grimorio.web;

import br.com.grimorio.model.Usuario;
import br.com.grimorio.repo.CampanhaRepo;
import br.com.grimorio.repo.MembroRepo;
import br.com.grimorio.service.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/** Contas, campanhas e configuracao da instancia. A rota inteira passa por AdminAutorizacao;
 *  armazenamento e saude moram em AdminSistemaController. */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    /* nomes dos campos do formulario de configuracao, lidos e gravados pela tela */
    private static final String IA_MODELO = "iaModelo";
    private static final String EMAIL_PROVEDOR = "emailProvedor";
    private static final String EMAIL_CHAVE = "emailChave";
    private static final String SMTP_SENHA = "smtpSenha";
    private static final String REGISTRO_ABERTO = "registroAberto";
    private static final String MAPA_LIBERADO = "mapaLiberado";


    private final UsuarioService usuarios;
    private final ConfigService config;
    private final IaService ia;
    private final CampanhaRepo campanhas;
    private final MembroRepo membros;
    private final SuporteService suporte;

    public AdminController(UsuarioService usuarios, ConfigService config, IaService ia,
                           CampanhaRepo campanhas, MembroRepo membros, SuporteService suporte) {
        this.usuarios = usuarios;
        this.config = config;
        this.ia = ia;
        this.campanhas = campanhas;
        this.membros = membros;
        this.suporte = suporte;
    }

    @GetMapping("/usuarios")
    public List<Map<String, Object>> listar() {
        /* uma contagem agrupada em vez de uma consulta por conta (era N+1) */
        Map<Long, Long> porConta = new HashMap<>();
        for (Object[] l : membros.campanhasPorUsuario()) porConta.put((Long) l[0], (Long) l[1]);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Usuario u : usuarios.todos()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", u.getId());
            m.put("login", u.getLogin());
            m.put("nome", u.getNome());
            m.put("admin", u.isAdmin());
            m.put("ativo", u.isAtivo());
            m.put("campanhas", porConta.getOrDefault(u.getId(), 0L).intValue());
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
    public ResponseEntity<Void> remover(@PathVariable Long id) {
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
        /* SMTP: tudo volta menos a senha, como a chave da IA */
        m.put("suporteEmail", suporte.destino());
        m.put("smtpHost", config.get(SuporteService.SMTP_HOST, ""));
        m.put("smtpPorta", config.get(SuporteService.SMTP_PORTA, "587"));
        m.put("smtpUsuario", config.get(SuporteService.SMTP_USUARIO, ""));
        m.put("smtpRemetente", config.get(SuporteService.SMTP_REMETENTE, ""));
        m.put("smtpSenhaSalva", !config.get(SuporteService.SMTP_SENHA, "").isBlank());
        m.put(EMAIL_PROVEDOR, suporte.provedor());
        m.put("emailChaveSalva", !config.get(SuporteService.EMAIL_CHAVE, "").isBlank());
        m.put("emailConfigurado", suporte.envioConfigurado());
        m.put("iaConfigurada", ia.configurada());
        m.put(IA_MODELO, config.get(ConfigService.IA_MODELO, IaService.MODELO_PADRAO));
        m.put(REGISTRO_ABERTO, config.registroAberto());
        m.put(MAPA_LIBERADO, config.mapaLiberado());
        return m;
    }

    /** So o que veio no corpo muda: a tela manda uma secao por vez. */
    @PutMapping("/config")
    public Map<String, Object> gravarConfig(@RequestBody Map<String, String> body) {
        if (body.containsKey("iaApiKey")) config.set(ConfigService.IA_CHAVE, aparado(body.get("iaApiKey")));
        /* modelo vazio fica vazio: gravar o padrao por extenso congelava a instancia nele, e a troca
           do padrao numa versao nova nao chegava a quem so salvou o formulario */
        if (body.containsKey(IA_MODELO)) config.set(ConfigService.IA_MODELO, aparado(body.get(IA_MODELO)));
        gravarEmail(body);
        if (body.containsKey(REGISTRO_ABERTO)) config.set(ConfigService.REGISTRO_ABERTO, umOuZero(body.get(REGISTRO_ABERTO)));
        if (body.containsKey(MAPA_LIBERADO)) config.set(ConfigService.MAPA_LIBERADO, umOuZero(body.get(MAPA_LIBERADO)));
        return Map.of("ok", true);
    }

    private void gravarEmail(Map<String, String> body) {
        for (String[] k : new String[][]{{"suporteEmail", SuporteService.DESTINO}, {"smtpHost", SuporteService.SMTP_HOST},
                {"smtpPorta", SuporteService.SMTP_PORTA}, {"smtpUsuario", SuporteService.SMTP_USUARIO},
                {"smtpRemetente", SuporteService.SMTP_REMETENTE}}) {
            if (body.containsKey(k[0])) config.set(k[1], aparado(body.get(k[0])));
        }
        if (body.containsKey(EMAIL_PROVEDOR)) {
            String p = aparado(body.get(EMAIL_PROVEDOR)).toLowerCase(Locale.ROOT);
            if (!SuporteService.PROVEDORES.contains(p)) throw new IllegalArgumentException("provedor de e-mail desconhecido");
            config.set(SuporteService.EMAIL_PROVEDOR, p);
        }
        /* chave e senha vazias mantem a que esta salva: o campo nunca vem preenchido do servidor */
        String chave = body.get(EMAIL_CHAVE);
        if (chave != null && !chave.isBlank()) config.set(SuporteService.EMAIL_CHAVE, chave.trim());
        String senha = body.get(SMTP_SENHA);
        if (senha != null && !senha.isEmpty()) config.set(SuporteService.SMTP_SENHA, senha);
    }

    private static String aparado(String s) {
        return s == null ? "" : s.trim();
    }

    private static String umOuZero(String s) {
        return "true".equalsIgnoreCase(s) || "1".equals(s) ? "1" : "0";
    }
}
