package br.com.grimorio.service;

import br.com.grimorio.model.Mapa;
import br.com.grimorio.model.MapaElemento;
import br.com.grimorio.model.MapaHistorico;
import br.com.grimorio.repo.MapaElementoRepo;
import br.com.grimorio.repo.MapaHistoricoRepo;
import br.com.grimorio.repo.MapaRepo;
import br.com.grimorio.repo.UsuarioRepo;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import static br.com.grimorio.service.MapaBase.K_BLOQUEADO;
import static br.com.grimorio.service.MapaBase.K_CAMADA;
import static br.com.grimorio.service.MapaBase.K_CRIAR;
import static br.com.grimorio.service.MapaBase.K_DADOS;
import static br.com.grimorio.service.MapaBase.K_ID;
import static br.com.grimorio.service.MapaBase.K_MARCAS;
import static br.com.grimorio.service.MapaBase.K_MUDAR;
import static br.com.grimorio.service.MapaBase.K_ORDEM;
import static br.com.grimorio.service.MapaBase.K_REMOVER;
import static br.com.grimorio.service.MapaBase.K_SEQ;
import static br.com.grimorio.service.MapaBase.K_TIPO;
import static br.com.grimorio.service.MapaBase.K_USADO;
import static br.com.grimorio.service.MapaBase.K_VISIVEL;

/**
 * O desfazer do mapa e o historico que ele le. Cada pessoa desfaz so as proprias acoes; as linhas do mesmo
 * seq e da mesma pessoa sao uma acao so (a selecao movida de uma vez). Quem decide se e mestre ou jogador e
 * MapaService, antes de chamar.
 */
@Component
class MapaDesfazer {

    private static final List<String> DESFAZIVEIS = List.of(K_CRIAR, K_MUDAR, K_REMOVER);

    private final MapaRepo mapas;
    private final MapaElementoRepo elementos;
    private final MapaHistoricoRepo historico;
    private final UsuarioRepo usuarios;
    private final MapaBase base;
    private final MapaAvisos avisos;
    private final TransactionTemplate tx;
    private final ObjectMapper om = JsonMapper.builder().build();

    MapaDesfazer(MapaRepo mapas, MapaElementoRepo elementos, MapaHistoricoRepo historico, UsuarioRepo usuarios, // NOSONAR: uma dependencia por tabela do mapa, de proposito
                 MapaBase base, MapaAvisos avisos, PlatformTransactionManager ptm) {
        this.mapas = mapas;
        this.elementos = elementos;
        this.historico = historico;
        this.usuarios = usuarios;
        this.base = base;
        this.avisos = avisos;
        this.tx = new TransactionTemplate(ptm);
    }

    /**
     * Desfaz a ultima operacao desta pessoa no mapa (ou a de {@code seqAlvo}). O que nao da mais para desfazer
     * e descartado e o desfazer passa para a anterior: token que sumiu, que o mestre travou ou escondeu e, para
     * o jogador, token que alguem moveu depois (desfazer o movimento antigo puxaria o token de volta por cima do
     * que o outro fez).
     */
    Map<String, Object> desfazer(long cid, long uid, long mid, Long seqAlvo, boolean mestre) {
        List<MapaFeito.Desfeito> rs = base.travado(mid, () -> tx.execute(s -> desfazPrimeiro(base.visivelPara(cid, mid, mestre), uid, mestre, seqAlvo)));
        if (rs == null || rs.isEmpty()) {
            if (seqAlvo != null) throw new MapaService.NaoAchado();
            throw new IllegalStateException("não há nada seu para desfazer");
        }
        avisos.publicaDesfeitos(cid, rs);
        Map<String, Object> out = new LinkedHashMap<>(desfeitoJson(rs.getFirst(), mestre, uid));
        out.put(K_SEQ, rs.getFirst().feito().m().getSeq());
        /* um grupo (mover a selecao) se desfaz inteiro: o primeiro vai nos campos de sempre, o resto em "outros" */
        if (rs.size() > 1) out.put("outros", rs.subList(1, rs.size()).stream().map(d -> desfeitoJson(d, mestre, uid)).toList());
        return out;
    }

    /**
     * O que a pessoa pode ver do historico: o mestre, tudo; o jogador, so o que ele mesmo fez. Cada linha ja traz
     * o token e a distancia andada em casas, da mais recente para a mais antiga.
     */
    List<Map<String, Object>> historico(long cid, long uid, long mid, int limite, boolean mestre) {
        Mapa m = base.visivelPara(cid, mid, mestre);
        PageRequest pg = PageRequest.of(0, Math.clamp(limite, 1, 200));
        List<MapaHistorico> hs = mestre ? historico.findByMapaIdOrderByIdDesc(mid, pg)
                : historico.findByMapaIdAndUsuarioIdOrderByIdDesc(mid, uid, pg);
        Map<Long, String> nomes = new HashMap<>();
        usuarios.findAllById(hs.stream().map(MapaHistorico::getUsuarioId).distinct().toList())
                .forEach(u -> nomes.put(u.getId(), u.getNome() == null || u.getNome().isBlank() ? u.getLogin() : u.getNome()));
        JsonNode grid = base.ler(m.getGrid());
        List<Map<String, Object>> out = new ArrayList<>();
        for (MapaHistorico h : hs) out.add(linhaDoHistorico(h, grid, nomes, uid));
        return out;
    }

    private Map<String, Object> linhaDoHistorico(MapaHistorico h, JsonNode grid, Map<Long, String> nomes, long uid) {
        ObjectNode antes = base.ler(h.getAntes());
        ObjectNode depois = base.ler(h.getDepois());
        Map<String, Object> r = new LinkedHashMap<>();
        r.put(K_SEQ, h.getSeq());
        r.put("em", h.getEm().toString());
        r.put("quem", nomes.getOrDefault(h.getUsuarioId(), "?"));
        r.put("operacao", h.getOperacao());
        r.put("elemento", h.getElementoId());
        JsonNode a = antes.path(K_DADOS);
        JsonNode b = depois.path(K_DADOS);
        String nome = b.path("nome").asString(a.path("nome").asString(""));
        r.put("nome", nome.isEmpty() ? b.path("rotulo").asString(a.path("rotulo").asString("")) : nome);
        r.put(K_TIPO, depois.path(K_TIPO).asString(antes.path(K_TIPO).asString("TOKEN")));
        r.put("desfeito", h.isDesfeito());
        r.put("meu", h.getUsuarioId() == uid);
        if (a.has("x") && b.has("x") && (a.path("x").asDouble() != b.path("x").asDouble() || a.path("y").asDouble() != b.path("y").asDouble())) {
            double casas = MapaMedida.casas(grid, a.path("x").asDouble(), a.path("y").asDouble(), b.path("x").asDouble(), b.path("y").asDouble());
            r.put("casas", Math.round(casas * 100) / 100.0);
        }
        return r;
    }

    /** a primeira acao da fila desta pessoa que ainda da para desfazer (dentro da transacao) */
    private List<MapaFeito.Desfeito> desfazPrimeiro(Mapa m, long uid, boolean mestre, Long seqAlvo) {
        long mid = m.getId();
        List<MapaHistorico> fila = seqAlvo != null
                ? historico.findFirstByMapaIdAndSeqAndUsuarioId(mid, seqAlvo, uid)
                        .filter(h -> !h.isDesfeito() && DESFAZIVEIS.contains(h.getOperacao())).stream().toList()
                : historico.findTop20ByMapaIdAndUsuarioIdAndDesfeitoFalseAndOperacaoInOrderByIdDesc(mid, uid, DESFAZIVEIS);
        for (MapaHistorico h : fila) {
            List<MapaFeito.Desfeito> ds = h.isDesfeito() ? List.of() : desfazGrupo(h, m, uid, mestre);
            if (!ds.isEmpty()) return ds;
        }
        return List.of();
    }

    private Map<String, Object> desfeitoJson(MapaFeito.Desfeito r, boolean mestre, long uid) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put(K_ID, r.feito().e().getId());
        out.put("el", r.removido() ? null : base.elJson(r.feito().e(), r.feito().m(), mestre, uid));
        return out;
    }

    /** As linhas do mesmo seq e da mesma pessoa sao uma acao so (a selecao movida de uma vez). */
    private List<MapaFeito.Desfeito> desfazGrupo(MapaHistorico h, Mapa m, long uid, boolean mestre) {
        List<MapaHistorico> grupo = new ArrayList<>(historico.findByMapaIdAndSeqAndUsuarioId(m.getId(), h.getSeq(), uid).stream()
                .filter(x -> !x.isDesfeito() && DESFAZIVEIS.contains(x.getOperacao())).toList());
        if (grupo.stream().noneMatch(x -> Objects.equals(x.getId(), h.getId()))) grupo.add(h);
        List<MapaFeito.Desfeito> out = new ArrayList<>();
        for (MapaHistorico g : grupo) {
            g.setDesfeito(true);
            historico.save(g);
            MapaFeito.Desfeito d = desfazUma(g, m, uid, mestre);
            if (d != null) out.add(d);
        }
        return out;
    }

    /** Aplica a inversa de uma operacao; null quando ela ja nao se aplica. */
    private MapaFeito.Desfeito desfazUma(MapaHistorico h, Mapa m, long uid, boolean mestre) {
        ObjectNode antes = base.ler(h.getAntes());
        MapaElemento x = elementos.findById(h.getElementoId())
                .filter(e -> Objects.equals(e.getMapaId(), m.getId())).orElse(null);
        return switch (h.getOperacao()) {
            case K_CRIAR -> x == null || !mestre ? null : desfazCriar(m, uid, x);
            case K_MUDAR -> x == null || (!mestre && (!x.isVisivel() || !base.podeMover(x, m, uid))) ? null
                    : desfazMudar(m, uid, x, h, mestre);
            default -> x != null || !mestre || !antes.has(K_DADOS) ? null : desfazRemover(h, m, uid, antes);
        };
    }

    private MapaFeito.Desfeito desfazCriar(Mapa m, long uid, MapaElemento x) {
        String antes = base.elCruTexto(x);
        elementos.delete(x);
        fechaDesfazer(m, uid, x.getId(), "", antes);
        return new MapaFeito.Desfeito(new MapaFeito(x, m, x.isVisivel()), true);
    }

    private MapaFeito.Desfeito desfazMudar(Mapa m, long uid, MapaElemento x, MapaHistorico h, boolean mestre) {
        ObjectNode antes = base.ler(h.getAntes());
        ObjectNode atual = base.ler(x.getDados());
        JsonNode dDepois = base.ler(h.getDepois()).path(K_DADOS);
        if (!mestre && (atual.path("x").asDouble() != dDepois.path("x").asDouble() || atual.path("y").asDouble() != dDepois.path("y").asDouble())) {
            return null;
        }
        String agora = base.elCruTexto(x);
        boolean via = x.isVisivel();
        int ordem0 = x.getOrdem();
        if (mestre) voltaDoMestre(x, antes, atual); else voltaDoJogador(x, antes.path(K_DADOS), dDepois, atual);
        elementos.save(x);
        fechaDesfazer(m, uid, x.getId(), base.elCruTexto(x), agora);
        return new MapaFeito.Desfeito(new MapaFeito(x, m, via, false, ordem0 != x.getOrdem()), false);
    }

    /** o mestre volta o elemento inteiro ao estado de antes, menos o gasto do turno: o que ja foi gasto continua gasto */
    private void voltaDoMestre(MapaElemento x, ObjectNode antes, ObjectNode atual) {
        JsonNode dAntes = antes.path(K_DADOS);
        ObjectNode d = dAntes instanceof ObjectNode o ? o.deepCopy() : om.createObjectNode();
        if (atual.has(K_USADO)) d.set(K_USADO, atual.get(K_USADO));
        x.setDados(om.writeValueAsString(d));
        x.setDono(Math.max(0, antes.path("dono").asLong(0)));
        x.setVisivel(antes.path(K_VISIVEL).asBoolean(true));
        x.setCamada(antes.path(K_CAMADA).asString(x.getCamada()));
        x.setBloqueado(antes.path(K_BLOQUEADO).asBoolean(false));
        x.setOrdem(antes.path(K_ORDEM).asInt(x.getOrdem()));
    }

    /**
     * O jogador devolve a posicao e o que aquele movimento custou, e a vida e as marcas se foram elas que mudou:
     * o resto do token nao e dele.
     */
    private void voltaDoJogador(MapaElemento x, JsonNode dAntes, JsonNode dDepois, ObjectNode atual) {
        for (String k : List.of("x", "y", "vida")) {
            if (dAntes.has(k) && !dAntes.get(k).equals(dDepois.path(k))) atual.set(k, dAntes.get(k));
        }
        if (!dAntes.path(K_MARCAS).equals(dDepois.path(K_MARCAS))) {
            if (dAntes.has(K_MARCAS)) atual.set(K_MARCAS, dAntes.get(K_MARCAS)); else atual.remove(K_MARCAS);
        }
        double custo = dDepois.path(K_USADO).asDouble(0) - dAntes.path(K_USADO).asDouble(0);
        atual.put(K_USADO, Math.max(0, atual.path(K_USADO).asDouble(0) - Math.max(0, custo)));
        x.setDados(om.writeValueAsString(atual));
    }

    /** Recria o token removido. O id e outro: o historico que apontava para o antigo passa a apontar para o novo. */
    private MapaFeito.Desfeito desfazRemover(MapaHistorico h, Mapa m, long uid, ObjectNode antes) {
        MapaElemento n = new MapaElemento();
        n.setMapaId(m.getId());
        n.setCampanhaId(m.getCampanhaId());
        n.setTipo(tipoSalvo(antes.path(K_TIPO).asString("TOKEN")));
        n.setCamada(antes.path(K_CAMADA).asString("personagens"));
        n.setBloqueado(antes.path(K_BLOQUEADO).asBoolean(false));
        n.setDono(Math.max(0, antes.path("dono").asLong(0)));
        n.setVisivel(antes.path(K_VISIVEL).asBoolean(true));
        n.setOrdem(antes.path(K_ORDEM).asInt(0));
        n.setDados(om.writeValueAsString(antes.path(K_DADOS)));
        elementos.save(n);
        historico.trocaElemento(m.getId(), h.getElementoId(), n.getId());
        fechaDesfazer(m, uid, n.getId(), base.elCruTexto(n), "");
        return new MapaFeito.Desfeito(new MapaFeito(n, m, false), false);
    }

    private void fechaDesfazer(Mapa m, long uid, long eid, String depois, String antes) {
        m.setSeq(m.getSeq() + 1);
        mapas.save(m);
        base.registra(m, uid, "desfazer", eid, depois, antes);
    }

    private static MapaElemento.Tipo tipoSalvo(String t) {
        try {
            return MapaElemento.Tipo.valueOf(t);
        } catch (IllegalArgumentException _) {
            return MapaElemento.Tipo.TOKEN;
        }
    }
}
