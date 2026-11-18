package br.com.grimorio.service;

import br.com.grimorio.model.Papel;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.ContextClosedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.BiFunction;

/**
 * Quem esta com o mapa aberto, e o empurrao do servidor para essas pessoas (SSE). Cada evento
 * e montado por destinatario, com o papel conferido no banco na hora do envio: quem deixou de
 * ser membro (ou virou jogador) nao recebe mais o que so o mestre recebia, mesmo com a conexao
 * aberta desde antes. O envio sai de uma thread propria, nunca da do pedido que mudou o mapa:
 * um cliente lento nao pode segurar o movimento de ninguem.
 *
 * Instancia unica (Railway), entao a lista de inscritos mora so na memoria.
 */
@Service
public class MapaEventos {

    private static final Logger log = LoggerFactory.getLogger(MapaEventos.class);
    /** o proxy do Railway derruba conexao parada; a batida vem antes disso */
    private static final long BATIDA_SEG = 25;
    /** a conexao se renova sozinha (o EventSource reconecta e a tela rele o estado) */
    private static final long VIDA_MS = 30L * 60 * 1000;
    private static final int MAX_POR_CAMPANHA = 200;

    private record Inscrito(long uid, SseEmitter em) { }

    private final CampanhaService camp;
    private final ObjectMapper om = JsonMapper.builder().build();
    private final Map<Long, List<Inscrito>> porCampanha = new ConcurrentHashMap<>();
    private final ScheduledExecutorService fila = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "mapa-eventos");
        t.setDaemon(true);
        return t;
    });

    public MapaEventos(CampanhaService camp) {
        this.camp = camp;
        /* uma excecao que escapasse cancelaria o agendamento para sempre: a batida pararia e o proxy
           derrubaria todas as conexoes */
        fila.scheduleAtFixedRate(() -> {
            try {
                bater();
            } catch (RuntimeException e) {
                log.warn("Batida do mapa falhou: {}", e.toString());
            }
        }, BATIDA_SEG, BATIDA_SEG, TimeUnit.SECONDS);
    }

    /**
     * O desligamento gracioso do Tomcat espera os pedidos ativos, e um fluxo SSE nunca termina
     * sozinho: sem isto o Ctrl+C esperava 30 s e acabava com erro. O evento de fechamento do
     * contexto vem antes dessa espera; as telas reconectam sozinhas quando o servidor volta.
     */
    @EventListener(ContextClosedEvent.class)
    void fechaConexoes() {
        porCampanha.values().forEach(l -> l.forEach(i -> encerrar(l, i)));
    }

    @PreDestroy
    void parar() {
        fila.shutdownNow();
    }

    /** Abre a conexao de quem ja passou pela conferencia de membro. O primeiro evento diz qual mapa esta ativo. */
    public SseEmitter inscrever(long cid, long uid, Long ativo) {
        List<Inscrito> l = porCampanha.computeIfAbsent(cid, k -> new CopyOnWriteArrayList<>());
        if (l.size() >= MAX_POR_CAMPANHA) throw new IllegalStateException("conexões demais nesta campanha");
        SseEmitter em = new SseEmitter(VIDA_MS);
        Inscrito i = new Inscrito(uid, em);
        Runnable sai = () -> l.remove(i);
        em.onCompletion(sai);
        em.onTimeout(sai);
        em.onError(_ -> sai.run());
        l.add(i);
        Map<String, Object> ola = new LinkedHashMap<>();
        ola.put("tipo", "ola");
        ola.put("ativo", ativo);
        fila.execute(() -> enviar(l, i, ola));
        return em;
    }

    /**
     * Manda um evento para todos os inscritos da campanha. {@code monta} recebe o papel e o id
     * de cada um e devolve o que aquela pessoa pode ver, ou nulo para nao mandar nada.
     */
    public void publicar(long cid, BiFunction<Papel, Long, Map<String, Object>> monta) {
        List<Inscrito> l = porCampanha.get(cid);
        if (l == null || l.isEmpty()) return;
        fila.execute(() -> {
            for (Inscrito i : l) {
                Optional<Papel> p = camp.papelDe(cid, i.uid());
                if (p.isEmpty()) { encerrar(l, i); continue; }
                Map<String, Object> ev = monta.apply(p.get(), i.uid());
                if (ev != null) enviar(l, i, ev);
            }
        });
    }

    private void enviar(List<Inscrito> l, Inscrito i, Map<String, Object> ev) {
        try {
            i.em().send(SseEmitter.event().name("mapa").data(om.writeValueAsString(ev)));
        } catch (IOException | IllegalStateException e) {
            log.debug("Conexao do mapa caiu: {}", e.getMessage());
            encerrar(l, i);
        }
    }

    private void bater() {
        porCampanha.forEach((_, l) -> {
            for (Inscrito i : l) {
                try {
                    i.em().send(SseEmitter.event().comment("b"));
                } catch (IOException | IllegalStateException _) {
                    encerrar(l, i);
                }
            }
        });
    }

    private static void encerrar(List<Inscrito> l, Inscrito i) {
        l.remove(i);
        try {
            i.em().complete();
        } catch (Exception e) { // NOSONAR: complete() numa conexao que o cliente ja fechou lanca (AsyncRequestNotUsableException); nao ha o que fazer
            log.trace("Conexao ja encerrada: {}", e.getMessage());
        }
    }
}
