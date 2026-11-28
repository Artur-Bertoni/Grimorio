package br.com.grimorio.service;

import br.com.grimorio.model.Mapa;
import br.com.grimorio.model.Papel;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiFunction;

import static br.com.grimorio.service.MapaBase.K_ATIVO;
import static br.com.grimorio.service.MapaBase.K_ORDEM;
import static br.com.grimorio.service.MapaBase.K_TIPO;

/**
 * O que sai pelo canal do mapa (MapaEventos) depois de cada operacao, e para quem. O corte mestre/jogador
 * dos avisos mora aqui: mapa que nao esta ativo e elemento oculto nunca chegam ao jogador, e com a nevoa
 * ligada ele recebe so "vista" e pede o estado de novo.
 */
@Component
class MapaAvisos {

    private final MapaEventos eventos;
    private final MapaBase base;

    MapaAvisos(MapaEventos eventos, MapaBase base) {
        this.eventos = eventos;
        this.base = base;
    }

    void publicar(long cid, BiFunction<Papel, Long, Map<String, Object>> paraCada) {
        eventos.publicar(cid, paraCada);
    }

    /** a lista de mapas mudou: so o mestre ve a lista */
    void publicaLista(long cid) {
        eventos.publicar(cid, (p, u) -> p == Papel.MESTRE ? evento("lista", null) : null);
    }

    void publicaAtivo(long cid, Long ativo) {
        eventos.publicar(cid, (p, u) -> {
            Map<String, Object> ev = evento(K_ATIVO, null);
            ev.put(K_ATIVO, ativo);
            return ev;
        });
    }

    /**
     * Cada um recebe o elemento como pode ver: o jogador que perde a vista recebe "some". Com a nevoa ligada
     * (ou quando muda uma parede ou area), o jogador nao recebe o elemento: recebe "vista" e pede o estado de
     * novo, porque o que ele enxerga depende de tudo o que esta no mapa e quem corta e o servidor.
     */
    void publicaElemento(long cid, MapaFeito f) {
        boolean pelaVista = pelaVista(f);
        eventos.publicar(cid, (p, u) -> {
            boolean mestre = p == Papel.MESTRE;
            if (!mestre && !f.m().isAtivo()) return null;
            /* oculto: quem via fica sabendo que sumiu; quem nunca viu nao recebe nada, nem o id */
            if (!mestre && !f.e().isVisivel()) return f.eraVisivel() ? some(f) : null;
            if (!mestre && pelaVista) return vista(f);
            Map<String, Object> ev = evento("elemento", f.m().getSeq());
            ev.put("mapa", f.m().getId());
            ev.put("el", base.elJson(f.e(), f.m(), mestre, u));
            if (!f.trilha().isEmpty()) ev.put("via", f.trilha().stream().map(q -> List.of(q[0], q[1])).toList());
            return ev;
        });
    }

    void publicaRemocao(long cid, MapaFeito f) {
        boolean pelaVista = pelaVista(f);
        eventos.publicar(cid, (p, u) -> {
            if (p == Papel.MESTRE) return some(f);
            if (!f.m().isAtivo() || !f.eraVisivel()) return null;
            return pelaVista ? vista(f) : some(f);
        });
    }

    /** cada elemento mexido (ou que saiu) vai para quem esta olhando, e a ordem nova se ela mudou */
    void publicaDesfeitos(long cid, List<MapaFeito.Desfeito> ds) {
        for (MapaFeito.Desfeito d : ds) {
            if (d.removido()) publicaRemocao(cid, d.feito()); else publicaElemento(cid, d.feito());
            if (d.feito().ordem()) publicaOrdem(cid, d.feito().m());
        }
    }

    /** A ordem dos elementos mudou: quem esta com o mapa aberto le a lista de novo (so a ordem muda, nao ha o que remendar). */
    void publicaOrdem(long cid, Mapa m) {
        eventos.publicar(cid, (p, u) -> {
            if (p != Papel.MESTRE && !m.isAtivo()) return null;
            Map<String, Object> ev = evento(K_ORDEM, m.getSeq());
            ev.put("mapa", m.getId());
            return ev;
        });
    }

    /** a mudanca so chega ao jogador pela vista: nevoa ligada, ou parede e area (que nunca saem para ele) */
    private boolean pelaVista(MapaFeito f) {
        return MapaBase.sempreVisivel(f.e().getTipo())
                || !MapaNevoa.NENHUM.equals(base.ler(f.m().getRegras()).path("fog").asString(MapaNevoa.NENHUM));
    }

    private static Map<String, Object> vista(MapaFeito f) {
        Map<String, Object> ev = evento("vista", f.m().getSeq());
        ev.put("mapa", f.m().getId());
        return ev;
    }

    private static Map<String, Object> some(MapaFeito f) {
        Map<String, Object> ev = evento("some", f.m().getSeq());
        ev.put("mapa", f.m().getId());
        ev.put("id", f.e().getId());
        return ev;
    }

    static Map<String, Object> evento(String tipo, Long seq) {
        Map<String, Object> ev = new LinkedHashMap<>();
        ev.put(K_TIPO, tipo);
        if (seq != null) ev.put("seq", seq);
        return ev;
    }
}
