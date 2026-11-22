package br.com.grimorio.service;

import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;

/**
 * Conta tentativas numa janela de tempo e diz quando alguem passou do limite. Serve ao login
 * (senha errada), ao cadastro e ao "esqueci a senha": sem isso, um script testava senhas sem
 * parar contra qualquer conta. A conta fica na memoria de proposito: a instancia e unica, e
 * perder a contagem num reinicio so devolve algumas tentativas a quem ja estava travado.
 *
 * Cada uso tem o seu nome ({@code "login:conta"}, {@code "login-ip:1.2.3.4"}...), entao uma
 * instancia so atende a todos sem misturar as contagens.
 */
@Component
public class Freio {

    private static final Duration VARREDURA = Duration.ofMinutes(15);

    private final Map<String, Deque<Instant>> marcas = new ConcurrentHashMap<>();
    private volatile Instant ultimaVarredura = Instant.now();

    /** Passou do limite? Nao conta nada; so pergunta. */
    public boolean travado(String chave, int limite, Duration janela) {
        Deque<Instant> fila = marcas.get(chave);
        if (fila == null) return false;
        limpa(fila, Instant.now().minus(janela));
        return fila.size() >= limite;
    }

    /** Registra uma tentativa (uma senha errada, um pedido de redefinicao, um cadastro). */
    public void conta(String chave) {
        Instant agora = Instant.now();
        marcas.computeIfAbsent(chave, k -> new ConcurrentLinkedDeque<>()).addLast(agora);
        Instant ult = ultimaVarredura;
        if (agora.isAfter(ult.plus(VARREDURA))) {
            ultimaVarredura = agora;
            varre(agora);
        }
    }

    /** Pergunta e conta de uma vez: devolve verdadeiro se ja estava no limite (e entao nao conta). */
    public boolean excedeu(String chave, int limite, Duration janela) {
        if (travado(chave, limite, janela)) return true;
        conta(chave);
        return false;
    }

    /** Quanto falta para a tentativa mais antiga sair da janela: vai no Retry-After. */
    public long segundosAteLiberar(String chave, Duration janela) {
        Deque<Instant> fila = marcas.get(chave);
        Instant primeira = fila == null ? null : fila.peekFirst();
        if (primeira == null) return 0;
        return Math.max(1, Duration.between(Instant.now(), primeira.plus(janela)).toSeconds());
    }

    /** Login que deu certo zera a contagem daquela conta. */
    public void esquece(String chave) {
        marcas.remove(chave);
    }

    /* Sem isto o mapa so crescia: cada login ou e-mail tentado uma vez ficava para sempre. Roda de
       carona numa contagem (o app nao liga o agendador do Spring); a janela mais longa em uso e de
       uma hora. */
    private void varre(Instant agora) {
        Instant corte = agora.minus(Duration.ofHours(1));
        marcas.forEach((k, fila) -> {
            limpa(fila, corte);
            if (fila.isEmpty()) marcas.remove(k, fila);
        });
    }

    private static void limpa(Deque<Instant> fila, Instant corte) {
        while (true) {
            Instant p = fila.peekFirst();
            if (p == null || !p.isBefore(corte)) return;
            fila.pollFirst();
        }
    }
}
