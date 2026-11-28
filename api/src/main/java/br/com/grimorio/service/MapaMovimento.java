package br.com.grimorio.service;

import br.com.grimorio.model.Mapa;
import br.com.grimorio.model.MapaElemento;
import br.com.grimorio.repo.MapaElementoRepo;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static br.com.grimorio.service.MapaBase.K_LIVRE;
import static br.com.grimorio.service.MapaBase.K_USADO;

/**
 * Por onde o token do jogador pode andar e quanto isso custa: paredes (e portas fechadas) barram, a rota
 * mais curta contorna, e o deslocamento do turno e descontado. O mestre nunca e barrado.
 */
@Component
class MapaMovimento {

    private final MapaElementoRepo elementos;
    private final MapaBase base;
    private final ObjectMapper om = JsonMapper.builder().build();

    MapaMovimento(MapaElementoRepo elementos, MapaBase base) {
        this.elementos = elementos;
        this.base = base;
    }

    /**
     * A rota que o servidor cobraria se o token {@code e} fosse arrastado ate (x, y): a tela do jogador nao
     * recebe as paredes, entao pergunta aqui para desenhar o trajeto antes de soltar. {@code livre}: nada no
     * meio (vale o caminho arrastado); {@code semCaminho}: parede fecha tudo.
     */
    Map<String, Object> rota(Mapa m, MapaElemento e, MapaService.CorpoRota c, boolean mestre) {
        ObjectNode d = base.ler(e.getDados());
        double[] o = {d.path("x").asDouble(0), d.path("y").asDouble(0)};
        double[] dest = {Math.clamp(c.x, -m.getLargura(), m.getLargura() * 2.0), Math.clamp(c.y, -m.getAltura(), m.getAltura() * 2.0)};
        List<double[]> paredes = mestre ? List.of() : paredesQueBarram(m.getId());
        Map<String, Object> r = new LinkedHashMap<>();
        List<double[]> pts = new ArrayList<>();
        pts.add(o);
        pts.addAll(MapaRegras.trajeto(c.trajeto, m));
        pts.add(dest);
        if (paredes.isEmpty() || MapaParedes.livre(paredes, pts)) {
            r.put(K_LIVRE, true);
            return r;
        }
        List<double[]> rota = MapaParedes.rota(paredes, o, dest);
        if (rota == null) r.put("semCaminho", true);
        else r.put("pts", rota.stream().map(p -> List.of(Math.round(p[0] * 10) / 10.0, Math.round(p[1] * 10) / 10.0)).toList());
        return r;
    }

    /**
     * Paredes primeiro, depois o deslocamento. Parede barra o jogador sempre, com ou sem limite no token: se o caminho
     * em linha reta (ou o que ele desenhou) cruza uma, vale a rota mais curta que a contorna, e sem rota o movimento e
     * recusado. O mestre nunca e barrado. Depois, o que o movimento custou e descontado do token: sem limite nada se
     * conta; passando do que resta, no modo "bloqueio" recusa e no "aviso" deixa e diz que passou.
     */
    boolean gastaDeslocamento(MapaElemento x, Mapa m, double x0, double y0, MapaService.CorpoElemento c) {
        ObjectNode d = base.ler(x.getDados());
        double x1 = d.path("x").asDouble(0);
        double y1 = d.path("y").asDouble(0);
        if (x0 == x1 && y0 == y1) return false;
        double[] o = {x0, y0, x1, y1};
        List<double[]> rota = rotaPelasParedes(m, o, c);
        double desl = d.path("desl").asDouble(0);
        if (desl <= 0) return false;
        JsonNode g = base.ler(m.getGrid());
        double custo = custoDoMovimento(m, g, o, c, rota);
        double usado = d.path(K_USADO).asDouble(0);
        boolean passa = custo > desl - usado + 1e-6;
        if (passa && "bloqueio".equals(base.ler(m.getRegras()).path("limite").asString("aviso"))) {
            String un = g.path("unidade").asString("");
            throw new MapaService.LimiteDeMovimento("Esse movimento custa " + fmt(custo) + " " + un + " e restam "
                    + fmt(Math.max(0, desl - usado)) + " " + un + " neste turno.");
        }
        d.put(K_USADO, Math.round((usado + custo) * 100) / 100.0);
        x.setDados(om.writeValueAsString(d));
        return passa;
    }

    /**
     * Os pontos entre a origem e o destino por onde o token anda na tela dos outros: a rota que contorna as paredes,
     * se houve, ou o caminho que quem moveu desenhou ao arrastar. So enfeite: o que vale (custo, parede) ja foi decidido.
     */
    List<double[]> caminhoAndado(Mapa m, MapaService.CorpoElemento c, double x0, double y0, MapaElemento x, boolean mestre) {
        if (c == null || x.getTipo() != MapaElemento.Tipo.TOKEN) return List.of();
        ObjectNode d = base.ler(x.getDados());
        double[] o = {x0, y0, d.path("x").asDouble(0), d.path("y").asDouble(0)};
        if (o[0] == o[2] && o[1] == o[3]) return List.of();
        List<double[]> rota = mestre ? List.of() : rotaPelasParedes(m, o, c);
        return rota.isEmpty() ? MapaRegras.trajeto(c.trajeto, m) : rota.subList(1, rota.size() - 1);
    }

    /** Os trechos de parede que barram quem anda: parede, janela e porta fechada. */
    private List<double[]> paredesQueBarram(long mid) {
        List<double[]> out = new ArrayList<>();
        for (MapaElemento e : elementos.findByMapaIdAndTipo(mid, MapaElemento.Tipo.PAREDE)) {
            ObjectNode d = base.ler(e.getDados());
            if ("porta".equals(d.path("kind").asString("")) && d.path("aberta").asBoolean(false)) continue;
            JsonNode pts = d.path("pts");
            for (int i = 1; i < pts.size(); i++) {
                out.add(new double[]{pts.get(i - 1).get(0).asDouble(), pts.get(i - 1).get(1).asDouble(), pts.get(i).get(0).asDouble(), pts.get(i).get(1).asDouble()});
            }
        }
        return out;
    }

    /**
     * Vazia quando nenhuma parede esta no meio (vale o caminho de sempre); senao, os pontos da rota que a contorna.
     * Sem rota, o movimento e recusado.
     */
    private List<double[]> rotaPelasParedes(Mapa m, double[] o, MapaService.CorpoElemento c) {
        List<double[]> paredes = paredesQueBarram(m.getId());
        if (paredes.isEmpty()) return List.of();
        List<double[]> pts = new ArrayList<>();
        pts.add(new double[]{o[0], o[1]});
        pts.addAll(MapaRegras.trajeto(c.trajeto, m));
        pts.add(new double[]{o[2], o[3]});
        if (MapaParedes.livre(paredes, pts)) return List.of();
        List<double[]> rota = MapaParedes.rota(paredes, new double[]{o[0], o[1]}, new double[]{o[2], o[3]});
        if (rota == null) throw new MapaService.ParedeNoCaminho("Há uma parede no caminho: não há por onde passar até lá.");
        return rota;
    }

    /**
     * Pela rota que contorna as paredes, se houver; senao pelo caminho que o jogador informou ao arrastar; sem ele,
     * em linha reta da origem ao destino. O caminho nunca sai mais barato que a reta: quem nao o manda paga a reta.
     */
    private static double custoDoMovimento(Mapa m, JsonNode g, double[] o, MapaService.CorpoElemento c, List<double[]> rota) {
        double escala = g.path("escala").asDouble(1.5);
        double reta = MapaMedida.casas(g, o[0], o[1], o[2], o[3]) * escala;
        List<double[]> t = rota.isEmpty() ? MapaRegras.trajeto(c.trajeto, m) : rota.subList(1, rota.size() - 1);
        if (t.isEmpty()) return reta;
        double casas = 0;
        double px = o[0];
        double py = o[1];
        for (double[] p : t) {
            casas += MapaMedida.casas(g, px, py, p[0], p[1]);
            px = p[0];
            py = p[1];
        }
        casas += MapaMedida.casas(g, px, py, o[2], o[3]);
        return Math.max(reta, casas * escala);
    }

    private static String fmt(double v) {
        double r = Math.round(v * 100) / 100.0;
        return r == Math.rint(r) ? String.valueOf((long) r) : String.valueOf(r).replace('.', ',');
    }
}
