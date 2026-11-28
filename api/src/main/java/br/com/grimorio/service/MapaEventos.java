package br.com.grimorio.service;

import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Quem esta com o mapa aberto, e o empurrao do servidor para essas pessoas (SSE). O corte
 * mestre/jogador de cada evento e feito por quem publica (MapaService); o canal confere o papel
 * no banco a cada envio e manda cada evento so para quem ainda e membro (CanalSse).
 */
@Service
public class MapaEventos extends CanalSse {

    public MapaEventos(CampanhaService camp) {
        super("mapa", camp);
    }

    /** O primeiro evento diz qual mapa esta ativo. */
    public SseEmitter inscrever(long cid, long uid, Long ativo) {
        Map<String, Object> ola = new LinkedHashMap<>();
        ola.put("tipo", "ola");
        ola.put("ativo", ativo);
        return inscrever(cid, uid, ola);
    }
}
