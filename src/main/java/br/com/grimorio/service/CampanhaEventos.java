package br.com.grimorio.service;

import br.com.grimorio.model.Papel;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;
import java.util.Objects;

/**
 * O aviso de "mudou" para quem esta dentro de uma campanha: a mesa ganhou versao nova, saiu uma
 * rolagem. O evento nao leva conteudo, so o que mudou: a tela pede o resto pelas rotas de sempre, que
 * fazem o corte mestre/jogador. Antes cada pessoa perguntava a cada 6 segundos; a pergunta continua,
 * mais espacada, como reserva para quando o fluxo nao abre.
 */
@Service
public class CampanhaEventos extends CanalSse {

    private static final String TIPO = "tipo";

    public CampanhaEventos(CampanhaService camp) {
        super("campanha", camp);
    }

    public SseEmitter inscrever(long cid, long uid) {
        return inscrever(cid, uid, Map.of(TIPO, "ola"));
    }

    /** A mesa (o que o jogador ve) foi gravada: todo membro rele a versao. */
    public void mesaMudou(long cid, long versao) {
        publicar(cid, (p, u) -> Map.of(TIPO, "mesa", "versao", versao));
    }

    /**
     * Saiu uma rolagem ou um pedido de teste. Rolagem fechada de outra pessoa nao gera aviso para
     * o jogador: nem o "alguma coisa foi rolada" sai do servidor, como na leitura da lista.
     */
    public void rolagemNova(long cid, long autor, boolean publica) {
        publicar(cid, (p, u) -> p == Papel.MESTRE || publica || Objects.equals(u, autor)
                ? Map.of(TIPO, "rolagem") : null);
    }
}
