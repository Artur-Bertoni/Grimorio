package br.com.grimorio.service;

import br.com.grimorio.model.Mapa;
import br.com.grimorio.model.MapaElemento;
import br.com.grimorio.repo.FichaRepo;
import br.com.grimorio.repo.MapaElementoRepo;
import br.com.grimorio.repo.MapaRepo;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.time.Instant;
import java.util.Objects;
import java.util.function.Predicate;

import static br.com.grimorio.service.MapaBase.K_FICHA;
import static br.com.grimorio.service.MapaBase.K_VIDA_MAX;
import static br.com.grimorio.service.MapaBase.K_VINCULO;
import static br.com.grimorio.service.MapaBase.K_VISAO;

/**
 * O token vinculado a uma ficha anda junto com ela, nos dois sentidos: a vida mexida no mapa vai para a
 * barra da ficha, e a barra ou o alcance da visao mexidos na ficha vao para os tokens dela.
 */
@Component
class MapaVida {

    private final MapaRepo mapas;
    private final MapaElementoRepo elementos;
    private final FichaRepo fichas;
    private final MapaBase base;
    private final MapaAvisos avisos;
    private final TransactionTemplate tx;
    private final ObjectMapper om = JsonMapper.builder().build();

    MapaVida(MapaRepo mapas, MapaElementoRepo elementos, FichaRepo fichas, MapaBase base, MapaAvisos avisos,
             PlatformTransactionManager ptm) {
        this.mapas = mapas;
        this.elementos = elementos;
        this.fichas = fichas;
        this.base = base;
        this.avisos = avisos;
        this.tx = new TransactionTemplate(ptm);
    }

    /** A vida do token (vinculado a uma ficha) mudou: a barra da ficha acompanha. Dentro da transacao de quem mudou. */
    void vidaParaFicha(long cid, ObjectNode antes, ObjectNode depois) {
        boolean mudou = antes.path("vida").asDouble(-1) != depois.path("vida").asDouble(-1)
                || antes.path(K_VIDA_MAX).asDouble(-1) != depois.path(K_VIDA_MAX).asDouble(-1);
        String campo = depois.path("vidaCampo").asString("");
        if (!mudou || campo.isEmpty() || !depois.path(K_VINCULO).asBoolean(false) || !depois.hasNonNull(K_FICHA)) return;
        fichas.findById(depois.get(K_FICHA).asLong()).filter(f -> Objects.equals(f.getCampanhaId(), cid)).ifPresent(f -> {
            ObjectNode conteudo = base.ler(f.getConteudo());
            boolean achou = false;
            for (JsonNode n : conteudo.path("campos")) {
                if (n instanceof ObjectNode o && "barra".equals(o.path("tipo").asString("")) && campo.equals(o.path("rot").asString(""))) {
                    o.put("val", fmtInt(depois.path("vida").asDouble(0)));
                    o.put("max", fmtInt(depois.path(K_VIDA_MAX).asDouble(0)));
                    achou = true;
                }
            }
            if (!achou) return;
            f.setConteudo(om.writeValueAsString(conteudo));
            f.setAtualizadoEm(Instant.now());
            fichas.save(f);
        });
    }

    /**
     * A barra da ficha mudou: os tokens vinculados a ela (com o vinculo ligado) ficam com a mesma vida.
     * Chamado pelo controller depois de gravar a ficha; nao faz a volta (a escrita na ficha acima nao passa por ele).
     */
    void vidaDaFicha(long cid, long fichaId, String conteudo) {
        ObjectNode c = base.ler(conteudo);
        for (MapaElemento e : elementos.findByCampanhaIdAndTipo(cid, MapaElemento.Tipo.TOKEN)) {
            ObjectNode d = base.ler(e.getDados());
            String campo = d.path("vidaCampo").asString("");
            boolean ligado = !campo.isEmpty() && d.path(K_VINCULO).asBoolean(false) && d.path(K_FICHA).asLong(-1) == fichaId;
            JsonNode b = ligado ? barraDaFicha(c, campo) : null;
            if (b != null) sincronizaVida(cid, e.getId(), e.getMapaId(), numeroDaFicha(b.path("val").asString("")), numeroDaFicha(b.path("max").asString("")));
        }
    }

    /**
     * O alcance da visao da ficha mudou: os tokens vinculados a ela guardam a copia (visaoFicha), que vale quando o
     * token nao tem alcance proprio. Vazio na ficha tira a copia. Chamado pelo controller depois de gravar a ficha.
     */
    void visaoDaFicha(long cid, long fichaId, String conteudo) {
        final Double alvo = alcanceDaFicha(base.ler(conteudo).path(K_VISAO));
        for (MapaElemento e : elementos.findByCampanhaIdAndTipo(cid, MapaElemento.Tipo.TOKEN)) {
            ObjectNode d = base.ler(e.getDados());
            boolean ligado = d.path(K_VINCULO).asBoolean(false) && d.path(K_FICHA).asLong(-1) == fichaId;
            Double atual = d.has(MapaRegras.K_VISAO_FICHA) ? d.get(MapaRegras.K_VISAO_FICHA).asDouble() : null;
            if (ligado && !Objects.equals(atual, alvo)) {
                sincronizaDados(cid, e.getId(), e.getMapaId(), x -> {
                    if (alvo == null) x.remove(MapaRegras.K_VISAO_FICHA); else x.put(MapaRegras.K_VISAO_FICHA, alvo.doubleValue());
                    return true;
                });
            }
        }
    }

    private void sincronizaVida(long cid, long eid, long mid, double vida, double max) {
        if (max <= 0) return;
        sincronizaDados(cid, eid, mid, d -> {
            if (d.path("vida").asDouble(-1) == Math.round(vida) && d.path(K_VIDA_MAX).asDouble(-1) == Math.round(max)) return false;
            d.put("vida", Math.round(Math.clamp(vida, 0, 99999)));
            d.put(K_VIDA_MAX, Math.round(Math.clamp(max, 1, 99999)));
            return true;
        });
    }

    /**
     * Muda os dados de um token por dentro da trava do mapa e avisa quem esta olhando (sem historico: nao e acao
     * de ninguem). {@code muda} devolve falso quando nao havia nada a mudar: ai nada e gravado nem avisado.
     */
    private void sincronizaDados(long cid, long eid, long mid, Predicate<ObjectNode> muda) {
        MapaFeito f = base.travado(mid, () -> tx.execute(s -> {
            MapaElemento x = elementos.findById(eid).orElse(null);
            Mapa m = mapas.findById(mid).orElse(null);
            if (x == null || m == null) return null;
            ObjectNode d = base.ler(x.getDados());
            if (!muda.test(d)) return null;
            x.setDados(om.writeValueAsString(d));
            elementos.save(x);
            m.setSeq(m.getSeq() + 1);
            mapas.save(m);
            return new MapaFeito(x, m, x.isVisivel());
        }));
        if (f != null) avisos.publicaElemento(cid, f);
    }

    /** a barra da ficha com aquele rotulo, ou nula */
    private static JsonNode barraDaFicha(ObjectNode conteudo, String campo) {
        for (JsonNode n : conteudo.path("campos")) {
            if ("barra".equals(n.path("tipo").asString("")) && campo.equals(n.path("rot").asString(""))) return n;
        }
        return null;
    }

    /** o alcance escrito na ficha (numero ou texto), preso a 0..100 casas; nulo quando esta vazio */
    private static Double alcanceDaFicha(JsonNode v) {
        if (!v.isNumber() && !(v.isString() && !v.asString("").isBlank())) return null;
        double casas = v.isNumber() ? v.asDouble() : numeroDaFicha(v.asString(""));
        return Math.round(Math.clamp(casas, 0, 100) * 10) / 10.0;
    }

    private static String fmtInt(double v) {
        return String.valueOf(Math.round(v));
    }

    private static double numeroDaFicha(String s) {
        try {
            return Double.parseDouble(s == null ? "" : s.trim().replace(',', '.'));
        } catch (NumberFormatException _) {
            return 0;
        }
    }
}
