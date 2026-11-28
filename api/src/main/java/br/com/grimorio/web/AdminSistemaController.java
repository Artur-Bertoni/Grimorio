package br.com.grimorio.web;

import br.com.grimorio.config.AppProps;
import br.com.grimorio.repo.CampanhaRepo;
import br.com.grimorio.repo.ChamadoRepo;
import br.com.grimorio.service.ArmazenamentoMidia;
import br.com.grimorio.service.ModeloService;
import br.com.grimorio.service.UsuarioService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.sql.DataSource;
import java.lang.management.ManagementFactory;
import java.nio.file.Paths;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

/** Armazenamento e saude do servidor, na Administracao. A rota /api/admin/** passa por AdminAutorizacao. */
@RestController
@RequestMapping("/api/admin")
public class AdminSistemaController {

    private final UsuarioService usuarios;
    private final CampanhaRepo campanhas;
    private final ArmazenamentoMidia midia;
    private final ChamadoRepo chamados;
    private final DataSource banco;
    private final AppProps props;
    private final ModeloService modelos;

    public AdminSistemaController(UsuarioService usuarios, CampanhaRepo campanhas, ArmazenamentoMidia midia,
                                  ChamadoRepo chamados, DataSource banco, AppProps props, ModeloService modelos) {
        this.modelos = modelos;
        this.usuarios = usuarios;
        this.campanhas = campanhas;
        this.midia = midia;
        this.chamados = chamados;
        this.banco = banco;
        this.props = props;
    }

    @GetMapping("/sistema")
    public Map<String, Object> sistema() {
        Map<Long, String> nomes = new HashMap<>();
        campanhas.findAll().forEach(c -> nomes.put(c.getId(), c.getNome()));
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("armazenamento", midia.estadoArmazenamento(nomes));
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("banco", nomeDoBanco());
        s.put("midiaDir", Paths.get(props.getMidiaDir()).toAbsolutePath().normalize().toString());
        s.put("java", System.getProperty("java.version"));
        Runtime rt = Runtime.getRuntime();
        s.put("memoriaUsada", rt.totalMemory() - rt.freeMemory());
        s.put("memoriaMax", rt.maxMemory());
        s.put("noArDesde", ManagementFactory.getRuntimeMXBean().getStartTime());
        /* conta no banco: antes carregava todas as contas so para saber quantas eram */
        s.put("contas", usuarios.quantos());
        s.put("campanhas", nomes.size());
        s.put("suporteNaoEnviado", chamados.countByEnviadoFalse());
        m.put("sistema", s);
        return m;
    }

    private String nomeDoBanco() {
        try (var c = banco.getConnection()) {
            var md = c.getMetaData();
            return md.getDatabaseProductName() + " " + md.getDatabaseProductVersion().split(" ")[0];
        } catch (SQLException e) {
            return "indisponível (" + e.getMessage() + ")";
        }
    }

    /** Copia para o cofre (o bucket) os originais que ainda so estao no volume. O boot ja faz isso em
     *  segundo plano; o botao serve para conferir e para depois de subir arquivos direto no volume. */
    @PostMapping("/armazenamento/migrar")
    public Map<String, Object> migrar() throws java.io.IOException {
        Map<String, Object> r = new LinkedHashMap<>(midia.migrarParaCofre());
        r.put("modelos", modelos.migrarParaCofre());
        return r;
    }

    /** Apaga do volume os originais que ja estao no cofre com o mesmo tamanho (o que nao esta fica).
     *  E o que libera o espaco do volume; nao tem volta, por isso a tela confirma antes. */
    @PostMapping("/armazenamento/liberar")
    public Map<String, Object> liberar() throws java.io.IOException {
        return Map.of("liberado", midia.liberarVolume() + modelos.liberarVolume());
    }
}
