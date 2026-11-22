package br.com.grimorio.service;

import br.com.grimorio.model.Mapa;
import br.com.grimorio.model.MapaElemento;
import br.com.grimorio.repo.MapaElementoRepo;
import br.com.grimorio.repo.MapaRepo;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import static br.com.grimorio.service.MapaBase.K_USADO;

/**
 * A iniciativa vista pelo mapa: turno novo zera o deslocamento gasto de todos os tokens do mapa ativo, e a
 * vez de cada um libera o token dele (MapaTurnos guarda o estado). Quem confere que e o mestre e MapaService.
 */
@Component
class MapaIniciativa {

    private final MapaRepo mapas;
    private final MapaElementoRepo elementos;
    private final MapaTurnos turnos;
    private final MapaBase base;
    private final MapaAvisos avisos;
    private final TransactionTemplate tx;
    private final ObjectMapper om = JsonMapper.builder().build();

    MapaIniciativa(MapaRepo mapas, MapaElementoRepo elementos, MapaTurnos turnos, MapaBase base, MapaAvisos avisos,
                   PlatformTransactionManager ptm) {
        this.mapas = mapas;
        this.elementos = elementos;
        this.turnos = turnos;
        this.base = base;
        this.avisos = avisos;
        this.tx = new TransactionTemplate(ptm);
    }

    /** Novo turno a mao (a iniciativa nao esta rodando, ou o mestre quer): zera o gasto de todos no mapa ativo. */
    Map<String, Object> novoTurno(long cid, long uid) {
        Long mid = mapas.findFirstByCampanhaIdAndAtivoTrue(cid).map(Mapa::getId).orElse(null);
        if (mid == null) return Collections.singletonMap("zerados", 0);
        long[] r = viraTurnoDoMapa(cid, uid, mid, true);
        publicaTurno(cid, mid, r[0], turnos.de(cid).rodada(), true, null, false);
        return Collections.singletonMap("zerados", (int) r[1]);
    }

    /**
     * A iniciativa mudou no navegador do mestre. Comecou, ou chegou a um turno novo (a rodada mudou): o
     * deslocamento gasto de todos zera e todos sao avisados. Mudou so de quem e a vez: o mapa passa a liberar o
     * token de quem ficou com ela. Em qualquer caso o espelho publico da ordem segue para os jogadores na hora,
     * sem esperar o sorteio de versao da mesa.
     */
    Map<String, Object> sincronizaTurno(long cid, long uid, MapaService.CorpoTurno c) {
        MapaTurnos.Turno novo = turnoDe(c);
        MapaTurnos.Turno velho = turnos.de(cid);
        boolean comecou = novo.ativo() && (!velho.ativo() || novo.rodada() != velho.rodada());
        boolean mudou = !novo.equals(velho);
        turnos.grava(cid, novo);
        Long mid = mapas.findFirstByCampanhaIdAndAtivoTrue(cid).map(Mapa::getId).orElse(null);
        long seq = mid == null || !mudou ? 0 : viraTurnoDoMapa(cid, uid, mid, comecou)[0];
        publicaTurno(cid, mid, seq, novo.rodada(), comecou, c.ini, true);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("novo", comecou);
        out.put("rodada", novo.rodada());
        return out;
    }

    /** a iniciativa como o navegador do mestre a mandou: so vale com alguem na ordem */
    private static MapaTurnos.Turno turnoDe(MapaService.CorpoTurno c) {
        Set<String> ids = new LinkedHashSet<>();
        for (String n : c.ids == null ? List.<String>of() : c.ids) {
            String x = MapaTurnos.id(n);
            if (!x.isEmpty() && ids.size() < 200) ids.add(x);
        }
        if (!Boolean.TRUE.equals(c.ativo) || ids.isEmpty()) return MapaTurnos.Turno.PARADO;
        int rodada = c.rodada == null ? 1 : c.rodada;
        return new MapaTurnos.Turno(true, Math.clamp(rodada, 1, 9999), MapaTurnos.id(c.vez), ids);
    }

    /** Sobe o seq do mapa (os clientes pedem o estado de novo) e, no turno novo, zera o gasto. Devolve {seq, quantos zerou}. */
    private long[] viraTurnoDoMapa(long cid, long uid, long mid, boolean zera) {
        long[] r = base.travado(mid, () -> tx.execute(s -> {
            Mapa m = base.doMestre(cid, mid);
            long n = zera ? zeraGasto(mid) : 0;
            m.setSeq(m.getSeq() + 1);
            mapas.save(m);
            if (zera) base.registra(m, uid, "turno", 0, "", "");
            return new long[]{m.getSeq(), n};
        }));
        return Objects.requireNonNull(r);
    }

    /** zera o deslocamento gasto de todos os tokens do mapa; devolve quantos tinham gasto */
    private long zeraGasto(long mid) {
        long n = 0;
        for (MapaElemento e : elementos.findByMapaIdOrderByOrdemAscIdAsc(mid)) {
            ObjectNode d = base.ler(e.getDados());
            if (d.path(K_USADO).asDouble(0) > 0) {
                d.put(K_USADO, 0);
                e.setDados(om.writeValueAsString(d));
                elementos.save(e);
                n++;
            }
        }
        return n;
    }

    private void publicaTurno(long cid, Long mid, long seq, int rodada, boolean novo, Map<String, Object> ini, boolean comIni) {
        avisos.publicar(cid, (p, u) -> {
            Map<String, Object> ev = MapaAvisos.evento("turno", seq > 0 ? seq : null);
            ev.put("mapa", mid);
            ev.put("rodada", rodada);
            ev.put("novo", novo);
            if (comIni) {
                ev.put("comIni", true);
                ev.put("ini", ini == null ? Map.of() : ini);
            }
            return ev;
        });
    }
}
