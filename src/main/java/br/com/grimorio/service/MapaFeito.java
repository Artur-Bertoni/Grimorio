package br.com.grimorio.service;

import br.com.grimorio.model.Mapa;
import br.com.grimorio.model.MapaElemento;

import java.util.List;

/**
 * O elemento e o mapa como ficaram ao fim de uma operacao, ja fora da transacao, e se o jogador via o
 * elemento antes dela (so quem via recebe o aviso de que ele sumiu). {@code trilha} sao os pontos por onde
 * o token passou entre a origem e o destino (vazia: em linha reta); so enfeita a animacao.
 */
record MapaFeito(MapaElemento e, Mapa m, boolean eraVisivel, boolean passou, boolean ordem, List<double[]> trilha) {

    MapaFeito(MapaElemento e, Mapa m, boolean eraVisivel, boolean passou, boolean ordem) {
        this(e, m, eraVisivel, passou, ordem, List.of());
    }

    MapaFeito(MapaElemento e, Mapa m, boolean eraVisivel) {
        this(e, m, eraVisivel, false, false, List.of());
    }

    /** o que um item de grupo ou o desfazer fez: o elemento como ficou e se ele saiu do mapa */
    record Desfeito(MapaFeito feito, boolean removido) { }
}
