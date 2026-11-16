package br.com.grimorio.service;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Pattern;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import br.com.grimorio.model.Metrica;
import br.com.grimorio.repo.MetricaRepo;

/** Contagem de uso anonima (ver {@link Metrica}). */
@Service
public class MetricaService {

    /* so nomes curtos e previsiveis: nada de texto livre que pudesse carregar dado de alguem */
    private static final Pattern EVENTO = Pattern.compile("[a-z0-9:_-]{1,60}");
    private final MetricaRepo repo;

    public MetricaService(MetricaRepo repo) {
        this.repo = repo;
    }

    /* sem @Transactional de proposito: a corrida do insert e engolida abaixo, e dentro de uma
       transacao ela marcaria tudo para desfazer e estouraria no commit */
    public void contar(String evento) {
        String e = evento == null ? "" : evento.trim().toLowerCase();
        if (!EVENTO.matcher(e).matches()) throw new IllegalArgumentException("evento inválido");
        LocalDate hoje = LocalDate.now(ZoneOffset.UTC);
        Metrica m = repo.findByDiaAndEvento(hoje, e).orElseGet(() -> {
            Metrica n = new Metrica();
            n.setDia(hoje);
            n.setEvento(e);
            return n;
        });
        m.setTotal(m.getTotal() + 1);
        try {
            repo.saveAndFlush(m);
        } catch (DataIntegrityViolationException corrida) {
            /* duas contagens do mesmo evento no mesmo instante: a outra ja criou a linha; perder
               uma unidade de uma contagem aproximada nao vale um erro na tela de ninguem */
        }
    }

    /** Total por evento nos ultimos dias, e o total por dia, para a tela de Administracao. */
    public Map<String, Object> resumo(int dias) {
        int d = Math.max(1, Math.min(dias, 365));
        LocalDate desde = LocalDate.now(ZoneOffset.UTC).minusDays(d - 1L);
        Map<String, Long> porEvento = new TreeMap<>();
        Map<String, Long> porDia = new TreeMap<>();
        for (Metrica m : repo.findByDiaGreaterThanEqualOrderByDiaAsc(desde)) {
            porEvento.merge(m.getEvento(), m.getTotal(), Long::sum);
            porDia.merge(m.getDia().toString(), m.getTotal(), Long::sum);
        }
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("dias", d);
        r.put("porEvento", porEvento);
        r.put("porDia", porDia);
        return r;
    }
}
