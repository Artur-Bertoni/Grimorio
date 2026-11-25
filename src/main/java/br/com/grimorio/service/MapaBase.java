package br.com.grimorio.service;

import br.com.grimorio.model.Mapa;
import br.com.grimorio.model.MapaElemento;
import br.com.grimorio.model.MapaHistorico;
import br.com.grimorio.repo.MapaHistoricoRepo;
import br.com.grimorio.repo.MapaRepo;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * O que todas as partes do mapa dividem: a trava de cada mapa, a leitura dos dados guardados em JSON,
 * quem pode mexer em que, o historico e como um mapa ou um elemento sai para cada pessoa.
 *
 * <p>A trava fica aqui, numa instancia so, porque as operacoes de um mapa moram em classes diferentes
 * (MapaService, MapaDesfazer, MapaVida, MapaIniciativa) e todas precisam esperar a mesma vez.
 */
@Component
class MapaBase {

    static final String MSG_TRANCADO = "Está trancado: destranque para mexer.";
    static final String K_TIPO = "tipo";
    static final String K_ATIVO = "ativo";
    static final String K_DADOS = "dados";
    static final String K_LIVRE = "livre";
    static final String K_FICHA = "fichaId";
    static final String K_VISAO = "visao";
    static final String K_USADO = "usado";
    static final String K_ID = "id";
    static final String K_SEQ = "seq";
    static final String K_CRIAR = "criar";
    static final String K_MUDAR = "mudar";
    static final String K_REMOVER = "remover";
    static final String K_MARCAS = "marcas";
    static final String K_VIDA_MAX = "vidaMax";
    static final String K_VISIVEL = "visivel";
    static final String K_CAMADA = "camada";
    static final String K_BLOQUEADO = "bloqueado";
    static final String K_ORDEM = "ordem";
    static final String K_VINCULO = "vinculo";
    static final String K_TRANCADAS = "trancadas";

    /** o que o jogador recebe de um token: o vinculo com ficha e com o elenco fica com o mestre */
    private static final Set<String> DADOS_DO_JOGADOR = Set.of("x", "y", "tam", "rot", "nome", "img", K_MARCAS);
    /** de quem pode mover o token vai tambem o deslocamento do turno: o jogador precisa ver quanto resta */
    private static final Set<String> DADOS_DE_QUEM_MOVE = Set.of("x", "y", "tam", "rot", "nome", "img", K_MARCAS, "desl", K_VISAO, MapaRegras.K_VISAO_FICHA, K_USADO);
    /** a barra de vida: o dono do token sempre ve; os outros so quando o mestre torna publica */
    private static final Set<String> DADOS_DA_VIDA = Set.of("vida", K_VIDA_MAX);

    private final MapaRepo mapas;
    private final MapaHistoricoRepo historico;
    private final MapaTurnos turnos;
    private final ObjectMapper om = JsonMapper.builder().build();
    private final Map<Long, Object> travas = new ConcurrentHashMap<>();

    MapaBase(MapaRepo mapas, MapaHistoricoRepo historico, MapaTurnos turnos) {
        this.mapas = mapas;
        this.historico = historico;
        this.turnos = turnos;
    }

    // ---------- trava e leitura ----------

    /** Uma operacao por vez em cada mapa (o servidor e unico, entao a trava pode ficar na memoria). */
    <T> T travado(long mid, Supplier<T> f) {
        Object t = travas.computeIfAbsent(mid, k -> new Object());
        synchronized (t) {
            return f.get();
        }
    }

    /** mapa apagado: a trava dele nao serve mais */
    void esqueceTrava(long mid) {
        travas.remove(mid);
    }

    ObjectNode ler(String json) {
        try {
            JsonNode n = om.readTree(json == null || json.isBlank() ? "{}" : json);
            return n instanceof ObjectNode o ? o : om.createObjectNode();
        } catch (JacksonException _) {
            return om.createObjectNode();
        }
    }

    Mapa doMestre(long cid, long mid) {
        return mapas.findById(mid).filter(m -> Objects.equals(m.getCampanhaId(), cid)).orElseThrow(MapaService.NaoAchado::new);
    }

    /** Jogador so enxerga o mapa ativo; os outros nao existem para ele. */
    Mapa visivelPara(long cid, long mid, boolean mestre) {
        Mapa m = doMestre(cid, mid);
        if (!mestre && !m.isAtivo()) throw new MapaService.NaoAchado();
        return m;
    }

    void registra(Mapa m, long uid, String op, long eid, String depois, String antes) {
        MapaHistorico h = new MapaHistorico();
        h.setMapaId(m.getId());
        h.setCampanhaId(m.getCampanhaId());
        h.setSeq(m.getSeq());
        h.setUsuarioId(uid);
        h.setOperacao(op);
        h.setElementoId(eid);
        h.setDepois(MapaRegras.corta(depois, 8000));
        h.setAntes(MapaRegras.corta(antes, 8000));
        historico.save(h);
    }

    // ---------- quem mexe em que ----------

    /** Pelas regras do mapa e do token, sem olhar de quem e a vez. */
    boolean podeMoverPelasRegras(MapaElemento e, Mapa m, long uid) {
        if (e.getTipo() != MapaElemento.Tipo.TOKEN || !e.isVisivel() || trancado(e, m)) return false;
        if (e.getDono() == uid) return true;
        if (ler(e.getDados()).path(K_LIVRE).asBoolean(false)) return true;
        return "todos".equals(ler(m.getRegras()).path("quem").asString(""));
    }

    boolean podeMover(MapaElemento e, Mapa m, long uid) {
        return podeMoverPelasRegras(e, m, uid) && !esperaAVez(e, m);
    }

    boolean esperaAVez(MapaElemento e, Mapa m) {
        return turnos.espera(m.getCampanhaId(), elencoDe(e));
    }

    /** Trancado pelo proprio elemento ou pela camada dele: nem o mestre mexe ate destrancar. */
    boolean trancado(MapaElemento e, Mapa m) {
        return e.isBloqueado() || camadaTrancada(e, m);
    }

    boolean camadaTrancada(MapaElemento e, Mapa m) {
        for (JsonNode c : ler(m.getRegras()).path(K_TRANCADAS)) {
            if (e.getCamada().equals(c.asString(""))) return true;
        }
        return false;
    }

    /**
     * Parede e area de nevoa ficam sempre "visiveis" (nao ha parede escondida: ela vale para o movimento e a
     * visao de todos), mas nunca saem para o jogador: quem calcula o que ele ve e o servidor (MapaVisao).
     */
    static boolean sempreVisivel(MapaElemento.Tipo t) {
        return t == MapaElemento.Tipo.PAREDE || t == MapaElemento.Tipo.FOG;
    }

    String nomeDe(MapaElemento e) {
        return ler(e.getDados()).path("nome").asString("");
    }

    private static String elencoDe(MapaElemento e) {
        /* o elo da iniciativa e o id do proprio token (a entrada da ordem aponta para ele) */
        return String.valueOf(e.getId());
    }

    // ---------- como sai para cada um ----------

    Map<String, Object> mapaJson(Mapa m, boolean mestre) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", m.getId());
        r.put("nome", m.getNome());
        /* o jogador recebe a imagem so em pedacos, cortados pela nevoa (MapaVisao): o caminho dela nao sai para ele */
        if (mestre) r.put("imagem", m.getImagem());
        r.put("largura", m.getLargura());
        r.put("altura", m.getAltura());
        r.put("grid", ler(m.getGrid()));
        r.put("regras", ler(m.getRegras()));
        r.put(K_ATIVO, m.isAtivo());
        r.put(K_ORDEM, m.getOrdem());
        r.put("seq", m.getSeq());
        if (mestre) r.put("cenaId", m.getCenaId());
        return r;
    }

    /** O elemento como esta no banco, para o historico. */
    Map<String, Object> elCru(MapaElemento e) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", e.getId());
        r.put(K_TIPO, e.getTipo().name());
        r.put(K_CAMADA, e.getCamada());
        r.put("dono", e.getDono());
        r.put(K_VISIVEL, e.isVisivel());
        r.put(K_BLOQUEADO, e.isBloqueado());
        r.put(K_ORDEM, e.getOrdem());
        r.put(K_DADOS, ler(e.getDados()));
        return r;
    }

    /** o elemento cru, em texto: e o que o historico guarda e o que se compara para saber se algo mudou */
    String elCruTexto(MapaElemento e) {
        return om.writeValueAsString(elCru(e));
    }

    Map<String, Object> elJson(MapaElemento e, Mapa m, boolean mestre, long uid) {
        Map<String, Object> r = elCru(e);
        boolean token = e.getTipo() == MapaElemento.Tipo.TOKEN;
        if (!mestre) {
            if (token) {
                ObjectNode d = ler(e.getDados());
                d.retain(dadosVisiveis(e, m, uid, d));
                r.put(K_DADOS, d);
            }
            r.remove(K_BLOQUEADO);
            /* a ordem tem buraco onde ha elemento oculto: a lista ja vem na ordem, o numero nao vai */
            r.remove(K_ORDEM);
        }
        r.put("meu", e.getDono() == uid);
        boolean trancado = trancado(e, m);
        r.put("podeMover", mestre ? !trancado : token && podeMover(e, m, uid));
        if (mestre) r.put("trancado", trancado);
        if (!token) return r;
        /* iniciativa em andamento: de quem e a vez e quem so espera por ela (o nome da ordem nao sai daqui) */
        if (turnos.daVez(m.getCampanhaId(), elencoDe(e))) r.put("daVez", true);
        if (!mestre && podeMoverPelasRegras(e, m, uid) && esperaAVez(e, m)) r.put("esperaVez", true);
        return r;
    }

    /** Do token o jogador recebe o que a tela dele desenha; a vida so do dono ou quando o mestre a abre. */
    private Set<String> dadosVisiveis(MapaElemento e, Mapa m, long uid, ObjectNode d) {
        Set<String> ok = new HashSet<>(e.getDono() == uid || podeMoverPelasRegras(e, m, uid) ? DADOS_DE_QUEM_MOVE : DADOS_DO_JOGADOR);
        if (e.getDono() == uid || d.path("vidaPublica").asBoolean(false)) ok.addAll(DADOS_DA_VIDA);
        return ok;
    }
}
