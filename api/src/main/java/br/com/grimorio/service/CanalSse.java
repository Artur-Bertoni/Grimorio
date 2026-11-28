package br.com.grimorio.service;

import br.com.grimorio.model.Papel;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.ContextClosedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BiFunction;

/**
 * Um canal de empurrao do servidor (SSE) por campanha: quem esta inscrito, a batida que segura a
 * conexao no proxy e o envio. Cada evento e montado por destinatario, com o papel conferido no banco
 * na hora: quem deixou de ser membro (ou virou jogador) nao recebe mais o que so o mestre recebia,
 * mesmo com a conexao aberta desde antes.
 *
 * Cada inscrito tem a propria fila de envio, numa thread virtual: escrever no socket bloqueia, e com
 * uma thread so para todos um cliente com a conexao travada segurava o evento dos outros ate o tempo
 * limite de escrita. A ordem dos eventos de cada pessoa continua garantida. Quem acumula eventos
 * demais sem conseguir receber e desligado (a tela reconecta e rele o estado).
 *
 * Servidor unica (Railway), entao a lista de inscritos mora so na memoria.
 */
public abstract class CanalSse {

    private static final Logger log = LoggerFactory.getLogger(CanalSse.class);
    /** o proxy do Railway derruba conexao parada; a batida vem antes disso */
    private static final long BATIDA_SEG = 25;
    /** a conexao se renova sozinha (o EventSource reconecta e a tela rele o estado) */
    private static final long VIDA_MS = 30L * 60 * 1000;
    private static final int MAX_POR_CAMPANHA = 200;
    /** eventos esperando para sair para uma pessoa so; acima disso a conexao dela esta presa */
    private static final int MAX_PENDENTES = 100;

    private record Inscrito(long uid, SseEmitter em, ExecutorService envio, AtomicInteger pendentes) { }

    private final String nome;
    private final CampanhaService camp;
    private final ObjectMapper om = JsonMapper.builder().build();
    private final Map<Long, List<Inscrito>> porCampanha = new ConcurrentHashMap<>();
    /* so monta os eventos e agenda a batida; quem escreve no socket e a fila de cada inscrito */
    private final ScheduledExecutorService fila;

    protected CanalSse(String nome, CampanhaService camp) {
        this.nome = nome;
        this.camp = camp;
        this.fila = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, nome + "-eventos");
            t.setDaemon(true);
            return t;
        });
        /* uma excecao que escapasse cancelaria o agendamento para sempre: a batida pararia e o proxy
           derrubaria todas as conexoes */
        fila.scheduleAtFixedRate(() -> {
            try {
                bater();
            } catch (RuntimeException e) {
                log.warn("Batida do canal {} falhou: {}", nome, e.toString());
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

    /** Abre a conexao de quem ja passou pela conferencia de membro; {@code ola} e o primeiro evento. */
    protected SseEmitter inscrever(long cid, long uid, Map<String, Object> ola) {
        List<Inscrito> l = porCampanha.computeIfAbsent(cid, k -> new CopyOnWriteArrayList<>());
        if (l.size() >= MAX_POR_CAMPANHA) throw new IllegalStateException("conexões demais nesta campanha");
        SseEmitter em = new SseEmitter(VIDA_MS);
        ExecutorService envio = Executors.newSingleThreadExecutor(Thread.ofVirtual().name(nome + "-envio-", 0).factory());
        Inscrito i = new Inscrito(uid, em, envio, new AtomicInteger());
        Runnable sai = () -> {
            l.remove(i);
            envio.shutdown();
        };
        em.onCompletion(sai);
        em.onTimeout(sai);
        em.onError(_ -> sai.run());
        l.add(i);
        String dados = om.writeValueAsString(ola);
        entregar(l, i, () -> i.em().send(SseEmitter.event().name(nome).data(dados)));
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
                if (ev == null) continue;
                String dados = om.writeValueAsString(ev);
                entregar(l, i, () -> i.em().send(SseEmitter.event().name(nome).data(dados)));
            }
        });
    }

    private interface Envio { void run() throws IOException; }

    /** Poe o envio na fila daquela pessoa; quem nao esvazia a fila e desligado. */
    private void entregar(List<Inscrito> l, Inscrito i, Envio e) {
        if (i.pendentes().incrementAndGet() > MAX_PENDENTES) {
            log.debug("Canal {}: conexao presa, desligando", nome);
            encerrar(l, i);
            return;
        }
        try {
            i.envio().execute(() -> {
                try {
                    e.run();
                } catch (IOException | IllegalStateException x) {
                    log.debug("Conexao do canal {} caiu: {}", nome, x.getMessage());
                    encerrar(l, i);
                } finally {
                    i.pendentes().decrementAndGet();
                }
            });
        } catch (RejectedExecutionException _) {
            /* a fila ja foi fechada: a conexao saiu entre a leitura da lista e o envio */
            l.remove(i);
        }
    }

    private void bater() {
        porCampanha.forEach((_, l) -> {
            for (Inscrito i : l) entregar(l, i, () -> i.em().send(SseEmitter.event().comment("b")));
        });
    }

    /* fechar tambem passa pela fila da pessoa: complete() espera um envio preso terminar, e isso
       nao pode acontecer na thread que atende os outros */
    private static void encerrar(List<Inscrito> l, Inscrito i) {
        l.remove(i);
        try {
            i.envio().execute(() -> {
                try {
                    i.em().complete();
                } catch (Exception e) { // NOSONAR: complete() numa conexao que o cliente ja fechou lanca (AsyncRequestNotUsableException); nao ha o que fazer
                    log.trace("Conexao ja encerrada: {}", e.getMessage());
                }
            });
            i.envio().shutdown();
        } catch (RejectedExecutionException _) {
            /* ja estava fechada */
        }
    }
}
