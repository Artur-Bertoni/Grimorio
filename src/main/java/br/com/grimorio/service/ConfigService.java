package br.com.grimorio.service;

import br.com.grimorio.model.Config;
import br.com.grimorio.repo.ConfigRepo;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class ConfigService {

    public static final String IA_CHAVE = "ia.apiKey";
    public static final String IA_MODELO = "ia.modelo";
    public static final String REGISTRO_ABERTO = "registro.aberto";
    public static final String MAPA_LIBERADO = "mapa.liberado";

    private final ConfigRepo repo;

    public ConfigService(ConfigRepo repo) {
        this.repo = repo;
    }

    @Transactional(readOnly = true)
    public String get(String chave, String padrao) {
        return repo.findById(chave).map(Config::getValor)
                .filter(v -> v != null && !v.isBlank())
                .orElse(padrao);
    }

    @Transactional
    public void set(String chave, String valor) {
        repo.save(new Config(chave, valor));
    }

    @Transactional
    public void apaga(String chave) {
        repo.deleteById(chave);
    }

    @Transactional(readOnly = true)
    /** Aberto por padrao: o servidor nasce sem conta e sem variavel de ambiente. */
    public boolean registroAberto() {
        return !"0".equals(get(REGISTRO_ABERTO, "1"));
    }

    /** Fechado por padrao: enquanto o tabletop esta em obra, so a administracao abre a aba Mapa. */
    @Transactional(readOnly = true)
    public boolean mapaLiberado() {
        return "1".equals(get(MAPA_LIBERADO, "0"));
    }

    @Transactional(readOnly = true)
    public Map<String, Object> publico() {
        Map<String, Object> m = new LinkedHashMap<>();
        String k = get(IA_CHAVE, "");
        m.put("iaConfigurada", !k.isBlank());
        m.put("iaModelo", get(IA_MODELO, IaService.MODELO_PADRAO));
        m.put("registroAberto", registroAberto());
        m.put("mapaLiberado", mapaLiberado());
        return m;
    }
}
