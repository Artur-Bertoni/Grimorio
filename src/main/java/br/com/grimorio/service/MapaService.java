package br.com.grimorio.service;

import br.com.grimorio.config.AppProps;
import br.com.grimorio.model.Ficha;
import br.com.grimorio.model.Mapa;
import br.com.grimorio.model.MapaElemento;
import br.com.grimorio.model.MapaHistorico;
import br.com.grimorio.model.Papel;
import br.com.grimorio.repo.FichaRepo;
import br.com.grimorio.repo.MapaElementoRepo;
import br.com.grimorio.repo.MapaHistoricoRepo;
import br.com.grimorio.repo.MapaRepo;
import br.com.grimorio.repo.UsuarioRepo;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * Tabletop: mapas, o que esta em cima deles e o log de operacoes.
 *
 * Toda mudanca passa por aqui, uma por vez por mapa (trava em memoria: a instancia e unica),
 * sobe o {@code seq} do mapa, entra no historico e sai para quem esta com o mapa aberto
 * (MapaEventos). O corte mestre/jogador e feito aqui e so aqui: mapa que nao esta ativo,
 * elemento oculto e o vinculo com o guia nunca saem para o jogador.
 */
@Service
public class MapaService {

    public static class NaoAchado extends RuntimeException {
        public NaoAchado() { super("não encontrado"); }
    }

    /** Bloqueio de movimento: o token passaria do deslocamento do turno e o mapa esta em modo "bloqueio". */
    public static class LimiteDeMovimento extends RuntimeException {
        public LimiteDeMovimento(String msg) { super(msg); }
    }

    /** O que a tela manda para criar ou mudar um mapa. Campo nulo nao muda. */
    public static class CorpoMapa {
        public String nome;
        public String imagem;
        public Map<String, Object> grid;
        public Map<String, Object> regras;
        public String cenaId;
        /** so valem num mapa sem imagem (com imagem, o tamanho e o dela) */
        public Integer largura;
        public Integer altura;
    }

    /** O turno da iniciativa como o navegador do mestre o informa; {@code ini} e o espelho publico da ordem, repassado aos jogadores. */
    public static class CorpoTurno {
        public Boolean ativo;
        public Integer rodada;
        public String vez;
        /** ids do elenco de quem esta na ordem e tem vinculo; {@code vez} e o id de quem tem a vez */
        public List<String> ids;
        public Map<String, Object> ini;
    }

    /** O que a tela manda para criar ou mudar um elemento. Campo nulo nao muda; {@code dados} mescla. */
    public static class CorpoElemento {
        public String tipo;
        public Long dono;
        public Boolean visivel;
        public Boolean bloqueado;
        public String camada;
        public Map<String, Object> dados;
        /** o caminho que o jogador andou (pontos [x, y]); vale quando o mapa mede pelo trajeto */
        public List<List<Double>> trajeto;
    }

    /** Um item de operacao em grupo: muda (como {@link CorpoElemento}) ou, com {@code remover}, tira o elemento. */
    public static class ItemLote extends CorpoElemento {
        public Long id;
        public Boolean remover;
        /** "frente" ou "tras": vai para cima ou para baixo de tudo o que esta no mapa (dentro da camada pesa a ordem) */
        public String ordem;
    }

    /** Varios elementos de uma vez (mover ou organizar a selecao): uma operacao so, um desfazer so. */
    public static class CorpoLote {
        public List<ItemLote> itens;
    }

    /** o elemento e o mapa como ficaram ao fim da operacao, ja fora da transacao, e se o
     *  jogador via o elemento antes dela (so quem via recebe o aviso de que ele sumiu) */
    private record Feito(MapaElemento e, Mapa m, boolean eraVisivel, boolean passou, boolean ordem) {
        Feito(MapaElemento e, Mapa m, boolean eraVisivel) { this(e, m, eraVisivel, false, false); }
    }

    /** o que o desfazer fez: o elemento como ficou e se ele saiu do mapa */
    private record Desfeito(Feito feito, boolean removido) { }

    private static final int MAX_MAPAS = 100;
    private static final int MAX_ELEMENTOS = 1000;
    private static final int MAX_LOTE = 300;
    private static final String MSG_TRANCADO = "Está trancado: destranque para mexer.";
    private static final int LADO_MIN = 200;
    private static final int LADO_MAX = 16000;
    private static final int LADO_PADRAO_L = 2100;
    private static final int LADO_PADRAO_A = 1400;
    private static final String K_TIPO = "tipo";
    private static final String K_ATIVO = "ativo";
    private static final String K_DADOS = "dados";
    private static final String K_LIVRE = "livre";
    private static final String K_FICHA = "fichaId";
    private static final String K_USADO = "usado";
    private static final String K_ID = "id";
    private static final String K_SEQ = "seq";
    private static final String K_OPERACAO = "operacao";
    private static final String K_CRIAR = "criar";
    private static final String K_MUDAR = "mudar";
    private static final String K_REMOVER = "remover";
    private static final List<String> DESFAZIVEIS = List.of(K_CRIAR, K_MUDAR, K_REMOVER);
    /** o que o jogador recebe de um token: o vinculo com ficha e com o elenco fica com o mestre */
    private static final Set<String> DADOS_DO_JOGADOR = Set.of("x", "y", "tam", "rot", "nome", "img", "marcas");
    /** de quem pode mover o token vai tambem o deslocamento do turno: o jogador precisa ver quanto resta */
    private static final Set<String> DADOS_DE_QUEM_MOVE = Set.of("x", "y", "tam", "rot", "nome", "img", "marcas", "desl", K_USADO);
    /** a barra de vida: o dono do token sempre ve; os outros so quando o mestre torna publica */
    private static final Set<String> DADOS_DA_VIDA = Set.of("vida", "vidaMax");

    private final MapaRepo mapas;
    private final MapaElementoRepo elementos;
    private final MapaHistoricoRepo historico;
    private final FichaRepo fichas;
    private final UsuarioRepo usuarios;
    private final MapaTurnos turnos;
    private final CampanhaService camp;
    private final MapaEventos eventos;
    private final TransactionTemplate tx;
    private final Path raizMidia;
    private final ObjectMapper om = JsonMapper.builder().build();
    private final Map<Long, Object> travas = new ConcurrentHashMap<>();
    private final Map<Long, Long> ultimoPing = new ConcurrentHashMap<>();

    public MapaService(MapaRepo mapas, MapaElementoRepo elementos, MapaHistoricoRepo historico, FichaRepo fichas,
                       UsuarioRepo usuarios, MapaTurnos turnos, CampanhaService camp, MapaEventos eventos, PlatformTransactionManager ptm, AppProps props) {
        this.mapas = mapas;
        this.elementos = elementos;
        this.historico = historico;
        this.fichas = fichas;
        this.usuarios = usuarios;
        this.turnos = turnos;
        this.camp = camp;
        this.eventos = eventos;
        this.tx = new TransactionTemplate(ptm);
        this.raizMidia = Paths.get(props.getMidiaDir()).toAbsolutePath().normalize();
    }

    // ---------- leitura ----------

    /** Mestre: todos os mapas. Jogador: so o ativo, se houver. */
    public List<Map<String, Object>> listar(long cid, long uid) {
        boolean mestre = camp.exigeMembro(cid, uid) == Papel.MESTRE;
        List<Map<String, Object>> out = new ArrayList<>();
        for (Mapa m : mapas.findByCampanhaIdOrderByOrdemAscIdAsc(cid)) {
            if (mestre || m.isAtivo()) out.add(mapaJson(m, mestre));
        }
        return out;
    }

    /**
     * Estado inteiro do mapa como aquela pessoa pode ver. Com {@code desde} igual ao seq atual
     * devolve so o seq: e o polling de quem ficou sem SSE.
     */
    public Map<String, Object> estado(long cid, long uid, long mid, Long desde) {
        boolean mestre = camp.exigeMembro(cid, uid) == Papel.MESTRE;
        Mapa m = visivelPara(cid, mid, mestre);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("seq", m.getSeq());
        if (desde != null && desde == m.getSeq()) {
            r.put("igual", true);
            return r;
        }
        r.put("mapa", mapaJson(m, mestre));
        List<Map<String, Object>> els = new ArrayList<>();
        for (MapaElemento e : elementos.findByMapaIdOrderByOrdemAscIdAsc(mid)) {
            if (mestre || e.isVisivel()) els.add(elJson(e, m, mestre, uid));
        }
        r.put("elementos", els);
        return r;
    }

    public SseEmitter inscrever(long cid, long uid) {
        camp.exigeMembro(cid, uid);
        Long ativo = mapas.findFirstByCampanhaIdAndAtivoTrue(cid).map(Mapa::getId).orElse(null);
        return eventos.inscrever(cid, uid, ativo);
    }

    // ---------- mapa (so mestre) ----------

    public Map<String, Object> criar(long cid, long uid, CorpoMapa c) {
        camp.exigeMestre(cid, uid);
        if (mapas.countByCampanhaId(cid) >= MAX_MAPAS) throw new IllegalArgumentException("mapas demais nesta campanha");
        Mapa m = new Mapa();
        m.setCampanhaId(cid);
        m.setNome("Mapa sem nome");
        m.setGrid(om.writeValueAsString(MapaRegras.grid(null)));
        m.setRegras(om.writeValueAsString(MapaRegras.regras(null)));
        m.setOrdem((int) mapas.countByCampanhaId(cid));
        aplicaMapa(m, c, cid);
        if (m.getLargura() <= 0) { m.setLargura(LADO_PADRAO_L); m.setAltura(LADO_PADRAO_A); }
        Mapa salvo = tx.execute(s -> mapas.save(m));
        eventos.publicar(cid, (p, u) -> p == Papel.MESTRE ? evento("lista", null) : null);
        return mapaJson(Objects.requireNonNull(salvo), true);
    }

    public Map<String, Object> editar(long cid, long uid, long mid, CorpoMapa c) {
        camp.exigeMestre(cid, uid);
        Mapa m = travado(mid, () -> tx.execute(s -> {
            Mapa x = doMestre(cid, mid);
            String antes = om.writeValueAsString(mapaJson(x, true));
            aplicaMapa(x, c, cid);
            x.setSeq(x.getSeq() + 1);
            x.setAtualizadoEm(Instant.now());
            mapas.save(x);
            registra(x, uid, "mapa", 0, om.writeValueAsString(mapaJson(x, true)), antes);
            return x;
        }));
        eventos.publicar(cid, (p, u) -> {
            boolean mestre = p == Papel.MESTRE;
            if (!mestre && !m.isAtivo()) return null;
            Map<String, Object> ev = evento("mapa", m.getSeq());
            ev.put("mapa", mapaJson(m, mestre));
            return ev;
        });
        return mapaJson(m, true);
    }

    /** Liga (ou desliga) o mapa que os jogadores veem. So um fica ativo por campanha. */
    public Map<String, Object> ativar(long cid, long uid, long mid, boolean ligar) {
        camp.exigeMestre(cid, uid);
        Long ativo = tx.execute(s -> {
            Mapa alvo = doMestre(cid, mid);
            for (Mapa m : mapas.findByCampanhaIdOrderByOrdemAscIdAsc(cid)) {
                boolean fica = ligar && Objects.equals(m.getId(), alvo.getId());
                if (m.isAtivo() != fica) { m.setAtivo(fica); mapas.save(m); }
            }
            return ligar ? alvo.getId() : null;
        });
        publicaAtivo(cid, ativo);
        return Collections.singletonMap(K_ATIVO, ativo);
    }

    public void apagar(long cid, long uid, long mid) {
        camp.exigeMestre(cid, uid);
        boolean eraAtivo = Boolean.TRUE.equals(travado(mid, () -> tx.execute(s -> {
            Mapa m = doMestre(cid, mid);
            elementos.deleteByMapaId(mid);
            historico.deleteByMapaId(mid);
            mapas.delete(m);
            return m.isAtivo();
        })));
        travas.remove(mid);
        eventos.publicar(cid, (p, u) -> p == Papel.MESTRE ? evento("lista", null) : null);
        if (eraAtivo) publicaAtivo(cid, null);
    }

    /** Campanha apagada: chamado dentro da transacao de CampanhaController. */
    public void apagarDaCampanha(long cid) {
        historico.deleteByCampanhaId(cid);
        elementos.deleteByCampanhaId(cid);
        mapas.deleteByCampanhaId(cid);
        turnos.apaga(cid);
    }

    // ---------- elementos ----------

    public Map<String, Object> criarElemento(long cid, long uid, long mid, CorpoElemento c) {
        camp.exigeMestre(cid, uid);
        Feito f = feito(travado(mid, () -> tx.execute(s -> {
            Mapa m = doMestre(cid, mid);
            if (elementos.countByMapaId(mid) >= MAX_ELEMENTOS) throw new IllegalArgumentException("elementos demais neste mapa");
            MapaElemento x = new MapaElemento();
            x.setMapaId(mid);
            x.setCampanhaId(cid);
            MapaElemento.Tipo t = tipo(c.tipo);
            x.setTipo(t);
            boolean desenho = t == MapaElemento.Tipo.DESENHO;
            ObjectNode d = desenho ? MapaRegras.dadosDesenho(om.createObjectNode(), c.dados, m)
                    : MapaRegras.dadosToken(om.createObjectNode(), c.dados, m);
            x.setCamada(MapaRegras.camada(c.camada, camadaPadrao(desenho, d)));
            x.setDono(desenho ? 0 : donoInicial(cid, c, d));
            if (c.bloqueado != null) x.setBloqueado(c.bloqueado);
            if (c.visivel != null) x.setVisivel(c.visivel);
            x.setOrdem((int) elementos.countByMapaId(mid));
            x.setDados(om.writeValueAsString(d));
            elementos.save(x);
            m.setSeq(m.getSeq() + 1);
            mapas.save(m);
            registra(m, uid, K_CRIAR, x.getId(), om.writeValueAsString(elCru(x)), "");
            return new Feito(x, m, false);
        })));
        publicaElemento(cid, f);
        return elJson(f.e(), f.m(), true, uid);
    }

    /**
     * Mestre muda tudo. Jogador so move (x e y), e so o token que pode mover: o dele, o liberado
     * pelo mestre, ou qualquer um quando o mapa libera para todos. Elemento oculto e mapa que nao
     * esta ativo respondem 404 para ele, como ficha de outra pessoa.
     */
    public Map<String, Object> mudarElemento(long cid, long uid, long mid, long eid, CorpoElemento c) {
        boolean mestre = camp.exigeMembro(cid, uid) == Papel.MESTRE;
        Feito f = feito(travado(mid, () -> tx.execute(s -> {
            Mapa m = visivelPara(cid, mid, mestre);
            return mudaUm(m, achaElemento(mid, eid, mestre), c, mestre, uid, true);
        })));
        publicaElemento(cid, f);
        if (f.ordem()) publicaOrdem(cid, f.m());
        Map<String, Object> r = elJson(f.e(), f.m(), mestre, uid);
        /* so na resposta de quem moveu: os outros nao precisam saber que alguem passou do limite */
        if (f.passou()) r.put("passou", true);
        return r;
    }

    private MapaElemento achaElemento(long mid, long eid, boolean mestre) {
        return elementos.findById(eid)
                .filter(e -> Objects.equals(e.getMapaId(), mid))
                .filter(e -> mestre || e.isVisivel())
                .orElseThrow(NaoAchado::new);
    }

    /**
     * Uma mudanca de elemento, dentro da transacao de quem chamou. {@code sobeSeq} falso e o item de um
     * grupo: o grupo sobe o seq uma vez e todas as linhas do historico levam o mesmo, que e o que faz o
     * desfazer tratar o grupo como uma acao so.
     */
    private Feito mudaUm(Mapa m, MapaElemento x, CorpoElemento c, boolean mestre, long uid, boolean sobeSeq) {
        if (mestre) exigeSolto(x, m, c); else exigeDoJogador(x, m, c, uid);
        String antes = om.writeValueAsString(elCru(x));
        boolean via = x.isVisivel();
        ObjectNode d0 = ler(x.getDados());
        double x0 = d0.path("x").asDouble(0);
        double y0 = d0.path("y").asDouble(0);
        int ordem0 = x.getOrdem();
        aplicaElemento(x, c, m, mestre, uid);
        boolean passou = !mestre && gastaDeslocamento(x, m, x0, y0, c);
        /* o jogador que so reenvia o que ja era nao deixa rastro no historico: nao haveria o que desfazer */
        if (!mestre && om.writeValueAsString(elCru(x)).equals(antes)) return new Feito(x, m, via, false, false);
        elementos.save(x);
        vidaParaFicha(m.getCampanhaId(), d0, ler(x.getDados()));
        if (sobeSeq) { m.setSeq(m.getSeq() + 1); mapas.save(m); }
        registra(m, uid, K_MUDAR, x.getId(), om.writeValueAsString(elCru(x)), antes);
        return new Feito(x, m, via, passou, ordem0 != x.getOrdem());
    }

    /**
     * O jogador mexe em duas coisas: na posicao (token que ele pode mover, na vez dele) e na vida atual
     * e nas marcas (so o dono do token, a qualquer hora). Nao se mistura permissao de uma com a da outra.
     */
    private void exigeDoJogador(MapaElemento x, Mapa m, CorpoElemento c, long uid) {
        Map<String, Object> d = c.dados == null ? Map.of() : c.dados;
        boolean marca = d.containsKey("vida") || d.containsKey("marcas");
        boolean mexe = d.containsKey("x") || d.containsKey("y");
        if (marca && !(x.getTipo() == MapaElemento.Tipo.TOKEN && x.getDono() == uid && x.isVisivel() && !trancado(x, m))) {
            throw new CampanhaService.SemAcessoException("só o dono do token muda a vida e as marcas dele");
        }
        if (mexe || !marca) {
            if (!podeMoverPelasRegras(x, m, uid)) throw new CampanhaService.SemAcessoException("este token não é seu para mover");
            if (esperaAVez(x, m)) throw new CampanhaService.SemAcessoException("Ainda não é a vez de " + nomeDe(x) + ".");
        }
    }

    private Feito removeUm(Mapa m, MapaElemento x, long uid, boolean sobeSeq) {
        if (trancado(x, m)) throw new IllegalStateException(MSG_TRANCADO);
        String antes = om.writeValueAsString(elCru(x));
        elementos.delete(x);
        if (sobeSeq) { m.setSeq(m.getSeq() + 1); mapas.save(m); }
        registra(m, uid, K_REMOVER, x.getId(), "", antes);
        return new Feito(x, m, x.isVisivel());
    }

    /**
     * Mover ou organizar a selecao: todos os itens numa transacao so (ou nenhum, se um estiver
     * trancado), com o mesmo seq no historico. So o mestre. A resposta traz o elemento de cada item,
     * ou {@code removido}.
     */
    public Map<String, Object> lote(long cid, long uid, long mid, CorpoLote c) {
        camp.exigeMestre(cid, uid);
        if (c == null || c.itens == null || c.itens.isEmpty()) throw new IllegalArgumentException("nada a fazer");
        if (c.itens.size() > MAX_LOTE) throw new IllegalArgumentException("itens demais de uma vez");
        List<Desfeito> feitos = travado(mid, () -> tx.execute(s -> {
            Mapa m = doMestre(cid, mid);
            m.setSeq(m.getSeq() + 1);
            mapas.save(m);
            List<Desfeito> out = new ArrayList<>();
            for (ItemLote it : c.itens) {
                if (it == null || it.id == null) throw new IllegalArgumentException("item sem id");
                MapaElemento x = achaElemento(mid, it.id, true);
                boolean remove = Boolean.TRUE.equals(it.remover);
                out.add(new Desfeito(remove ? removeUm(m, x, uid, false) : mudaUm(m, x, it, true, uid, false), remove));
            }
            return out;
        }));
        Objects.requireNonNull(feitos);
        List<Object> itens = new ArrayList<>();
        for (Desfeito d : feitos) {
            if (d.removido()) publicaRemocao(cid, d.feito()); else publicaElemento(cid, d.feito());
            if (d.feito().ordem()) publicaOrdem(cid, d.feito().m());
            itens.add(d.removido() ? Map.of(K_ID, d.feito().e().getId(), "removido", true)
                    : elJson(d.feito().e(), d.feito().m(), true, uid));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put(K_SEQ, feitos.getFirst().feito().m().getSeq());
        out.put("itens", itens);
        return out;
    }

    /** Devolve o seq da operacao: e com ele que a tela pede para desfazer a remocao. */
    public long removerElemento(long cid, long uid, long mid, long eid) {
        camp.exigeMestre(cid, uid);
        Feito f = feito(travado(mid, () -> tx.execute(s -> {
            Mapa m = doMestre(cid, mid);
            return removeUm(m, achaElemento(mid, eid, true), uid, true);
        })));
        publicaRemocao(cid, f);
        return f.m().getSeq();
    }

    private void publicaRemocao(long cid, Feito f) {
        eventos.publicar(cid, (p, u) -> {
            if (p == Papel.MESTRE) return some(f);
            return f.m().isAtivo() && f.eraVisivel() ? some(f) : null;
        });
    }

    // ---------- turno, desfazer e historico ----------

    /** Novo turno a mao (a iniciativa nao esta rodando, ou o mestre quer): zera o gasto de todos no mapa ativo. So o mestre. */
    public Map<String, Object> novoTurno(long cid, long uid) {
        camp.exigeMestre(cid, uid);
        Long mid = mapas.findFirstByCampanhaIdAndAtivoTrue(cid).map(Mapa::getId).orElse(null);
        if (mid == null) return Collections.singletonMap("zerados", 0);
        long[] r = viraTurnoDoMapa(cid, uid, mid, true, true);
        publicaTurno(cid, mid, r[0], turnos.de(cid).rodada(), true, null, false);
        return Collections.singletonMap("zerados", (int) r[1]);
    }

    /**
     * A iniciativa mudou no navegador do mestre. Comecou, ou chegou a um turno novo (a rodada
     * mudou): o deslocamento gasto de todos zera e todo mundo e avisado. Mudou so de quem e a vez: o
     * mapa passa a liberar o token de quem ficou com ela. Em qualquer caso o espelho publico da ordem
     * segue para os jogadores na hora, sem esperar o sorteio de versao da mesa.
     */
    public Map<String, Object> sincronizaTurno(long cid, long uid, CorpoTurno c) {
        camp.exigeMestre(cid, uid);
        Set<String> ids = new LinkedHashSet<>();
        if (c.ids != null) {
            for (String n : c.ids) {
                String x = MapaTurnos.id(n);
                if (!x.isEmpty() && ids.size() < 200) ids.add(x);
            }
        }
        boolean ativo = Boolean.TRUE.equals(c.ativo) && !ids.isEmpty();
        MapaTurnos.Turno novo = ativo
                ? new MapaTurnos.Turno(true, Math.clamp(c.rodada == null ? 1 : c.rodada, 1, 9999), MapaTurnos.id(c.vez), ids)
                : MapaTurnos.Turno.PARADO;
        MapaTurnos.Turno velho = turnos.de(cid);
        boolean comecou = novo.ativo() && (!velho.ativo() || novo.rodada() != velho.rodada());
        boolean mudou = !novo.equals(velho);
        turnos.grava(cid, novo);
        Long mid = mapas.findFirstByCampanhaIdAndAtivoTrue(cid).map(Mapa::getId).orElse(null);
        long seq = mid == null || !mudou ? 0 : viraTurnoDoMapa(cid, uid, mid, comecou, true)[0];
        publicaTurno(cid, mid, seq, novo.rodada(), comecou, c.ini, true);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("novo", comecou);
        out.put("rodada", novo.rodada());
        return out;
    }

    /** Sobe o seq do mapa (os clientes pedem o estado de novo) e, no turno novo, zera o gasto. Devolve {seq, quantos zerou}. */
    private long[] viraTurnoDoMapa(long cid, long uid, long mid, boolean zera, boolean sobe) {
        long[] r = travado(mid, () -> tx.execute(s -> {
            Mapa m = doMestre(cid, mid);
            long n = 0;
            if (zera) {
                for (MapaElemento e : elementos.findByMapaIdOrderByOrdemAscIdAsc(mid)) {
                    ObjectNode d = ler(e.getDados());
                    if (d.path(K_USADO).asDouble(0) <= 0) continue;
                    d.put(K_USADO, 0);
                    e.setDados(om.writeValueAsString(d));
                    elementos.save(e);
                    n++;
                }
            }
            if (sobe) {
                m.setSeq(m.getSeq() + 1);
                mapas.save(m);
                if (zera) registra(m, uid, "turno", 0, "", "");
            }
            return new long[]{m.getSeq(), n};
        }));
        return Objects.requireNonNull(r);
    }

    private void publicaTurno(long cid, Long mid, long seq, int rodada, boolean novo, Map<String, Object> ini, boolean comIni) {
        eventos.publicar(cid, (p, u) -> {
            Map<String, Object> ev = evento("turno", seq > 0 ? seq : null);
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

    /**
     * Desfaz a ultima operacao desta pessoa no mapa (ou a de {@code seqAlvo}). Cada um desfaz so as
     * proprias. O que nao da mais para desfazer e descartado e o desfazer passa para a anterior: token
     * que sumiu, que o mestre travou ou escondeu e, para o jogador, token que alguem moveu depois
     * (desfazer o movimento antigo puxaria o token de volta por cima do que o outro fez).
     */
    public Map<String, Object> desfazer(long cid, long uid, long mid, Long seqAlvo) {
        boolean mestre = camp.exigeMembro(cid, uid) == Papel.MESTRE;
        List<Desfeito> rs = travado(mid, () -> tx.execute(s -> {
            Mapa m = visivelPara(cid, mid, mestre);
            List<MapaHistorico> fila = seqAlvo != null
                    ? historico.findFirstByMapaIdAndSeqAndUsuarioId(mid, seqAlvo, uid)
                            .filter(h -> !h.isDesfeito() && DESFAZIVEIS.contains(h.getOperacao())).stream().toList()
                    : historico.findTop20ByMapaIdAndUsuarioIdAndDesfeitoFalseAndOperacaoInOrderByIdDesc(mid, uid, DESFAZIVEIS);
            for (MapaHistorico h : fila) {
                if (h.isDesfeito()) continue;
                List<Desfeito> ds = desfazGrupo(h, m, uid, mestre);
                if (!ds.isEmpty()) return ds;
            }
            return List.<Desfeito>of();
        }));
        if (rs == null || rs.isEmpty()) {
            if (seqAlvo != null) throw new NaoAchado();
            throw new IllegalStateException("não há nada seu para desfazer");
        }
        for (Desfeito r : rs) {
            if (r.removido()) publicaRemocao(cid, r.feito()); else publicaElemento(cid, r.feito());
            if (r.feito().ordem()) publicaOrdem(cid, r.feito().m());
        }
        Map<String, Object> out = new LinkedHashMap<>(desfeitoJson(rs.getFirst(), mestre, uid));
        out.put(K_SEQ, rs.getFirst().feito().m().getSeq());
        /* um grupo (mover a selecao) se desfaz inteiro: o primeiro vai nos campos de sempre, o resto em "outros" */
        if (rs.size() > 1) out.put("outros", rs.subList(1, rs.size()).stream().map(d -> desfeitoJson(d, mestre, uid)).toList());
        return out;
    }

    private Map<String, Object> desfeitoJson(Desfeito r, boolean mestre, long uid) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put(K_ID, r.feito().e().getId());
        out.put("el", r.removido() ? null : elJson(r.feito().e(), r.feito().m(), mestre, uid));
        return out;
    }

    /** As linhas do mesmo seq e da mesma pessoa sao uma acao so (a selecao movida de uma vez). */
    private List<Desfeito> desfazGrupo(MapaHistorico h, Mapa m, long uid, boolean mestre) {
        List<MapaHistorico> grupo = new ArrayList<>(historico.findByMapaIdAndSeqAndUsuarioId(m.getId(), h.getSeq(), uid).stream()
                .filter(x -> !x.isDesfeito() && DESFAZIVEIS.contains(x.getOperacao())).toList());
        if (grupo.stream().noneMatch(x -> Objects.equals(x.getId(), h.getId()))) grupo.add(h);
        List<Desfeito> out = new ArrayList<>();
        for (MapaHistorico g : grupo) {
            g.setDesfeito(true);
            historico.save(g);
            Desfeito d = desfazUma(g, m, uid, mestre);
            if (d != null) out.add(d);
        }
        return out;
    }

    /** Aplica a inversa de uma operacao; null quando ela ja nao se aplica. */
    private Desfeito desfazUma(MapaHistorico h, Mapa m, long uid, boolean mestre) {
        ObjectNode antes = ler(h.getAntes());
        MapaElemento x = elementos.findById(h.getElementoId())
                .filter(e -> Objects.equals(e.getMapaId(), m.getId())).orElse(null);
        return switch (h.getOperacao()) {
            case K_CRIAR -> x == null || !mestre ? null : desfazCriar(m, uid, x);
            case K_MUDAR -> x == null || (!mestre && (!x.isVisivel() || !podeMover(x, m, uid))) ? null
                    : desfazMudar(m, uid, x, h, mestre);
            default -> x != null || !mestre || !antes.has(K_DADOS) ? null : desfazRemover(h, m, uid, antes);
        };
    }

    private Desfeito desfazCriar(Mapa m, long uid, MapaElemento x) {
        String antes = om.writeValueAsString(elCru(x));
        elementos.delete(x);
        fechaDesfazer(m, uid, x.getId(), "", antes);
        return new Desfeito(new Feito(x, m, x.isVisivel()), true);
    }

    private Desfeito desfazMudar(Mapa m, long uid, MapaElemento x, MapaHistorico h, boolean mestre) {
        ObjectNode antes = ler(h.getAntes());
        JsonNode dAntes = antes.path(K_DADOS);
        ObjectNode atual = ler(x.getDados());
        if (!mestre && (atual.path("x").asDouble() != ler(h.getDepois()).path(K_DADOS).path("x").asDouble()
                || atual.path("y").asDouble() != ler(h.getDepois()).path(K_DADOS).path("y").asDouble())) {
            return null;
        }
        String agora = om.writeValueAsString(elCru(x));
        boolean via = x.isVisivel();
        int ordem0 = x.getOrdem();
        if (mestre) {
            /* o gasto do turno nao e do estado de antes: o que ja foi gasto continua gasto */
            ObjectNode d = dAntes instanceof ObjectNode o ? o.deepCopy() : om.createObjectNode();
            if (atual.has(K_USADO)) d.set(K_USADO, atual.get(K_USADO));
            x.setDados(om.writeValueAsString(d));
            x.setDono(Math.max(0, antes.path("dono").asLong(0)));
            x.setVisivel(antes.path("visivel").asBoolean(true));
            x.setCamada(antes.path("camada").asString(x.getCamada()));
            x.setBloqueado(antes.path("bloqueado").asBoolean(false));
            x.setOrdem(antes.path("ordem").asInt(x.getOrdem()));
        } else {
            /* o jogador devolve a posicao e o que aquele movimento custou, e a vida e as marcas se foram elas que mudou:
               o resto do token nao e dele */
            JsonNode dDepois = ler(h.getDepois()).path(K_DADOS);
            for (String k : List.of("x", "y", "vida")) {
                if (dAntes.has(k) && !dAntes.get(k).equals(dDepois.path(k))) atual.set(k, dAntes.get(k));
            }
            if (!dAntes.path("marcas").equals(dDepois.path("marcas"))) {
                if (dAntes.has("marcas")) atual.set("marcas", dAntes.get("marcas")); else atual.remove("marcas");
            }
            double custo = ler(h.getDepois()).path(K_DADOS).path(K_USADO).asDouble(0) - dAntes.path(K_USADO).asDouble(0);
            atual.put(K_USADO, Math.max(0, atual.path(K_USADO).asDouble(0) - Math.max(0, custo)));
            x.setDados(om.writeValueAsString(atual));
        }
        elementos.save(x);
        fechaDesfazer(m, uid, x.getId(), om.writeValueAsString(elCru(x)), agora);
        return new Desfeito(new Feito(x, m, via, false, ordem0 != x.getOrdem()), false);
    }

    /** Recria o token removido. O id e outro: o historico que apontava para o antigo passa a apontar para o novo. */
    private Desfeito desfazRemover(MapaHistorico h, Mapa m, long uid, ObjectNode antes) {
        MapaElemento n = new MapaElemento();
        n.setMapaId(m.getId());
        n.setCampanhaId(m.getCampanhaId());
        n.setTipo(tipoSalvo(antes.path(K_TIPO).asString("TOKEN")));
        n.setCamada(antes.path("camada").asString("personagens"));
        n.setBloqueado(antes.path("bloqueado").asBoolean(false));
        n.setDono(Math.max(0, antes.path("dono").asLong(0)));
        n.setVisivel(antes.path("visivel").asBoolean(true));
        n.setOrdem(antes.path("ordem").asInt(0));
        n.setDados(om.writeValueAsString(antes.path(K_DADOS)));
        elementos.save(n);
        historico.trocaElemento(m.getId(), h.getElementoId(), n.getId());
        fechaDesfazer(m, uid, n.getId(), om.writeValueAsString(elCru(n)), "");
        return new Desfeito(new Feito(n, m, false), false);
    }

    private void fechaDesfazer(Mapa m, long uid, long eid, String depois, String antes) {
        m.setSeq(m.getSeq() + 1);
        mapas.save(m);
        registra(m, uid, "desfazer", eid, depois, antes);
    }

    /**
     * O que a pessoa pode ver do historico: o mestre, tudo; o jogador, so o que ele mesmo fez. Cada
     * linha ja traz o token e a distancia andada em casas, da mais recente para a mais antiga.
     */
    public List<Map<String, Object>> historico(long cid, long uid, long mid, int limite) {
        boolean mestre = camp.exigeMembro(cid, uid) == Papel.MESTRE;
        Mapa m = visivelPara(cid, mid, mestre);
        PageRequest pg = PageRequest.of(0, Math.clamp(limite, 1, 200));
        List<MapaHistorico> hs = mestre ? historico.findByMapaIdOrderByIdDesc(mid, pg)
                : historico.findByMapaIdAndUsuarioIdOrderByIdDesc(mid, uid, pg);
        Map<Long, String> nomes = new HashMap<>();
        usuarios.findAllById(hs.stream().map(MapaHistorico::getUsuarioId).distinct().toList())
                .forEach(u -> nomes.put(u.getId(), u.getNome() == null || u.getNome().isBlank() ? u.getLogin() : u.getNome()));
        JsonNode grid = ler(m.getGrid());
        List<Map<String, Object>> out = new ArrayList<>();
        for (MapaHistorico h : hs) out.add(linhaDoHistorico(h, grid, nomes, uid));
        return out;
    }

    private Map<String, Object> linhaDoHistorico(MapaHistorico h, JsonNode grid, Map<Long, String> nomes, long uid) {
        ObjectNode antes = ler(h.getAntes());
        ObjectNode depois = ler(h.getDepois());
        Map<String, Object> r = new LinkedHashMap<>();
        r.put(K_SEQ, h.getSeq());
        r.put("em", h.getEm().toString());
        r.put("quem", nomes.getOrDefault(h.getUsuarioId(), "?"));
        r.put(K_OPERACAO, h.getOperacao());
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

    // ---------- regras internas ----------

    /**
     * Desconta do token o que o movimento custou (casas andadas x o valor de cada casa). Sem limite
     * no token, nada se conta. Passando do que resta: no modo "bloqueio" recusa, no "aviso" deixa e
     * diz que passou. O custo e em linha reta do ponto de partida ao de chegada: o caminho que o
     * jogador desenhou com o mouse nao e conhecido aqui (paredes e rotas sao da fase da visao).
     */
    private boolean gastaDeslocamento(MapaElemento x, Mapa m, double x0, double y0, CorpoElemento c) {
        ObjectNode d = ler(x.getDados());
        double desl = d.path("desl").asDouble(0);
        double x1 = d.path("x").asDouble(0);
        double y1 = d.path("y").asDouble(0);
        if (desl <= 0 || (x0 == x1 && y0 == y1)) return false;
        JsonNode g = ler(m.getGrid());
        double custo = custoDoMovimento(m, g, new double[]{x0, y0, x1, y1}, c);
        double usado = d.path(K_USADO).asDouble(0);
        boolean passa = custo > desl - usado + 1e-6;
        if (passa && "bloqueio".equals(ler(m.getRegras()).path("limite").asString("aviso"))) {
            String un = g.path("unidade").asString("");
            throw new LimiteDeMovimento("Esse movimento custa " + fmt(custo) + " " + un + " e restam " + fmt(Math.max(0, desl - usado))
                    + " " + un + " neste turno.");
        }
        d.put(K_USADO, Math.round((usado + custo) * 100) / 100.0);
        x.setDados(om.writeValueAsString(d));
        return passa;
    }

    /**
     * Pelo caminho que o jogador informou ao arrastar; sem ele, em linha reta da origem ao destino. O
     * caminho nunca sai mais barato que a reta: quem nao o manda paga a reta. Ate haver paredes (o
     * servidor nao conhece o terreno) o trajeto e o que o navegador conta.
     */
    private double custoDoMovimento(Mapa m, JsonNode g, double[] o, CorpoElemento c) {
        double escala = g.path("escala").asDouble(1.5);
        double reta = MapaMedida.casas(g, o[0], o[1], o[2], o[3]) * escala;
        List<double[]> t = MapaRegras.trajeto(c.trajeto, m);
        if (t.isEmpty()) return reta;
        double casas = 0;
        double px = o[0];
        double py = o[1];
        for (double[] p : t) {
            casas += MapaMedida.casas(g, px, py, p[0], p[1]);
            px = p[0];
            py = p[1];
        }
        casas += MapaMedida.casas(g, px, py, o[2], o[3]);
        return Math.max(reta, casas * escala);
    }

    private static String fmt(double v) {
        double r = Math.round(v * 100) / 100.0;
        return r == Math.rint(r) ? String.valueOf((long) r) : String.valueOf(r).replace('.', ',');
    }

    private void aplicaElemento(MapaElemento x, CorpoElemento c, Mapa m, boolean mestre, long uid) {
        ObjectNode d = ler(x.getDados());
        if (!mestre) {
            MapaRegras.posicao(d, c.dados, m);
            if (x.getDono() == uid && x.getTipo() == MapaElemento.Tipo.TOKEN) MapaRegras.vidaEMarcas(d, c.dados);
        } else {
            if (x.getTipo() == MapaElemento.Tipo.DESENHO) MapaRegras.dadosDesenho(d, c.dados, m);
            else MapaRegras.dadosToken(d, c.dados, m);
            if (c.dono != null && x.getTipo() == MapaElemento.Tipo.TOKEN) x.setDono(Math.max(0, c.dono));
            if (c.visivel != null) x.setVisivel(c.visivel);
            if (c.camada != null) x.setCamada(MapaRegras.camada(c.camada, x.getCamada()));
            if (c.bloqueado != null) x.setBloqueado(c.bloqueado);
            if (c instanceof ItemLote it && it.ordem != null) x.setOrdem(novaOrdem(m, it.ordem, x.getOrdem()));
        }
        x.setDados(om.writeValueAsString(d));
    }

    /** "frente": uma acima de todos; "tras": uma abaixo de todos. A lista do mapa e lida por esse numero. */
    private int novaOrdem(Mapa m, String quer, int atual) {
        List<MapaElemento> todos = elementos.findByMapaIdOrderByOrdemAscIdAsc(m.getId());
        if (todos.isEmpty()) return atual;
        if ("frente".equals(quer)) return todos.getLast().getOrdem() + 1;
        if ("tras".equals(quer)) return todos.getFirst().getOrdem() - 1;
        return atual;
    }

    // ---------- vida: token <-> ficha, e o ping ----------

    /** A vida do token (vinculado a uma ficha) mudou: a barra da ficha acompanha. */
    private void vidaParaFicha(long cid, ObjectNode antes, ObjectNode depois) {
        boolean mudou = antes.path("vida").asDouble(-1) != depois.path("vida").asDouble(-1)
                || antes.path("vidaMax").asDouble(-1) != depois.path("vidaMax").asDouble(-1);
        String campo = depois.path("vidaCampo").asString("");
        if (!mudou || campo.isEmpty() || !depois.path("vinculo").asBoolean(false) || !depois.hasNonNull(K_FICHA)) return;
        fichas.findById(depois.get(K_FICHA).asLong()).filter(f -> Objects.equals(f.getCampanhaId(), cid)).ifPresent(f -> {
            ObjectNode conteudo = ler(f.getConteudo());
            boolean achou = false;
            for (JsonNode n : conteudo.path("campos")) {
                if (n instanceof ObjectNode o && "barra".equals(o.path("tipo").asString("")) && campo.equals(o.path("rot").asString(""))) {
                    o.put("val", fmtInt(depois.path("vida").asDouble(0)));
                    o.put("max", fmtInt(depois.path("vidaMax").asDouble(0)));
                    achou = true;
                }
            }
            if (!achou) return;
            f.setConteudo(om.writeValueAsString(conteudo));
            f.setAtualizadoEm(Instant.now());
            fichas.save(f);
        });
    }

    private static String fmtInt(double v) {
        return String.valueOf(Math.round(v));
    }

    private static double numeroDaFicha(String s) {
        try {
            return Double.parseDouble(s == null ? "" : s.trim().replace(',', '.'));
        } catch (NumberFormatException _) {
            return 0;
        }
    }

    /**
     * A barra da ficha mudou: os tokens vinculados a ela (com o vinculo ligado) ficam com a mesma vida.
     * Chamado pelo controller depois de gravar a ficha; nao faz a volta (a escrita na ficha acima nao passa por ele).
     */
    public void vidaDaFicha(long cid, long fichaId, String conteudo) {
        ObjectNode c = ler(conteudo);
        for (MapaElemento e : elementos.findByCampanhaIdAndTipo(cid, MapaElemento.Tipo.TOKEN)) {
            ObjectNode d = ler(e.getDados());
            String campo = d.path("vidaCampo").asString("");
            if (campo.isEmpty() || !d.path("vinculo").asBoolean(false) || d.path(K_FICHA).asLong(-1) != fichaId) continue;
            for (JsonNode n : c.path("campos")) {
                if (n instanceof ObjectNode o && "barra".equals(o.path("tipo").asString("")) && campo.equals(o.path("rot").asString(""))) {
                    sincronizaVida(cid, e.getId(), e.getMapaId(), numeroDaFicha(o.path("val").asString("")), numeroDaFicha(o.path("max").asString("")));
                }
            }
        }
    }

    private void sincronizaVida(long cid, long eid, long mid, double vida, double max) {
        Feito f = travado(mid, () -> tx.execute(s -> {
            MapaElemento x = elementos.findById(eid).orElse(null);
            Mapa m = mapas.findById(mid).orElse(null);
            if (x == null || m == null || max <= 0) return null;
            ObjectNode d = ler(x.getDados());
            if (d.path("vida").asDouble(-1) == Math.round(vida) && d.path("vidaMax").asDouble(-1) == Math.round(max)) return null;
            d.put("vida", Math.round(Math.clamp(vida, 0, 99999)));
            d.put("vidaMax", Math.round(Math.clamp(max, 1, 99999)));
            x.setDados(om.writeValueAsString(d));
            elementos.save(x);
            m.setSeq(m.getSeq() + 1);
            mapas.save(m);
            return new Feito(x, m, x.isVisivel());
        }));
        if (f != null) publicaElemento(cid, f);
    }

    /** Aponta um ponto do mapa: todos que veem o mapa recebem na hora, e nada fica gravado. */
    public void ping(long cid, long uid, long mid, double x, double y) {
        boolean mestre = camp.exigeMembro(cid, uid) == Papel.MESTRE;
        Mapa m = visivelPara(cid, mid, mestre);
        long agora = System.currentTimeMillis();
        Long ult = ultimoPing.put(uid, agora);
        if (ult != null && agora - ult < 400) return;
        double w = Math.max(1, m.getLargura());
        double h = Math.max(1, m.getAltura());
        String quem = usuarios.findById(uid).map(u -> u.getNome() == null || u.getNome().isBlank() ? u.getLogin() : u.getNome()).orElse("?");
        eventos.publicar(cid, (p, u) -> {
            if (p != Papel.MESTRE && !m.isAtivo()) return null;
            Map<String, Object> ev = evento("ping", null);
            ev.put("mapa", mid);
            ev.put("x", Math.round(Math.clamp(x, 0, w) * 10) / 10.0);
            ev.put("y", Math.round(Math.clamp(y, 0, h) * 10) / 10.0);
            ev.put("quem", quem);
            ev.put("meu", u == uid);
            return ev;
        });
    }

    /** A ordem dos elementos mudou: quem esta com o mapa aberto le a lista de novo (so a ordem muda, nao ha o que remendar). */
    private void publicaOrdem(long cid, Mapa m) {
        eventos.publicar(cid, (p, u) -> {
            if (p != Papel.MESTRE && !m.isAtivo()) return null;
            Map<String, Object> ev = evento("ordem", m.getSeq());
            ev.put("mapa", m.getId());
            return ev;
        });
    }

    private static Feito feito(Feito f) {
        return Objects.requireNonNull(f, "operação sem resultado");
    }

    private <T> T travado(long mid, Supplier<T> f) {
        Object t = travas.computeIfAbsent(mid, k -> new Object());
        synchronized (t) {
            return f.get();
        }
    }

    private Mapa doMestre(long cid, long mid) {
        return mapas.findById(mid).filter(m -> Objects.equals(m.getCampanhaId(), cid)).orElseThrow(NaoAchado::new);
    }

    /** Jogador so enxerga o mapa ativo; os outros nao existem para ele. */
    private Mapa visivelPara(long cid, long mid, boolean mestre) {
        Mapa m = doMestre(cid, mid);
        if (!mestre && !m.isAtivo()) throw new NaoAchado();
        return m;
    }

    /** Pelas regras do mapa e do token, sem olhar de quem e a vez. */
    private boolean podeMoverPelasRegras(MapaElemento e, Mapa m, long uid) {
        if (e.getTipo() != MapaElemento.Tipo.TOKEN || !e.isVisivel() || trancado(e, m)) return false;
        if (e.getDono() == uid) return true;
        if (ler(e.getDados()).path(K_LIVRE).asBoolean(false)) return true;
        return "todos".equals(ler(m.getRegras()).path("quem").asString(""));
    }

    /** Trancado pelo proprio elemento ou pela camada dele: nem o mestre mexe ate destrancar. */
    private boolean trancado(MapaElemento e, Mapa m) {
        return e.isBloqueado() || camadaTrancada(e, m);
    }

    /** O mestre so mexe no que esta solto; o unico pedido aceito num elemento do proprio bloqueio e destranca-lo. */
    private void exigeSolto(MapaElemento x, Mapa m, CorpoElemento c) {
        boolean soDestranca = Boolean.FALSE.equals(c.bloqueado) && x.isBloqueado();
        if (trancado(x, m) && !(soDestranca && !camadaTrancada(x, m))) throw new IllegalStateException(MSG_TRANCADO);
    }

    private boolean camadaTrancada(MapaElemento e, Mapa m) {
        for (JsonNode c : ler(m.getRegras()).path("trancadas")) {
            if (e.getCamada().equals(c.asString(""))) return true;
        }
        return false;
    }

    private static String camadaPadrao(boolean desenho, ObjectNode d) {
        if (desenho) return "decoracao";
        return d.hasNonNull("npcId") ? "npcs" : "personagens";
    }

    private static MapaElemento.Tipo tipoSalvo(String t) {
        try {
            return MapaElemento.Tipo.valueOf(t);
        } catch (IllegalArgumentException _) {
            return MapaElemento.Tipo.TOKEN;
        }
    }

    private boolean podeMover(MapaElemento e, Mapa m, long uid) {
        return podeMoverPelasRegras(e, m, uid) && !esperaAVez(e, m);
    }

    private boolean esperaAVez(MapaElemento e, Mapa m) {
        return turnos.espera(m.getCampanhaId(), elencoDe(e));
    }

    private String elencoDe(MapaElemento e) {
        /* o elo da iniciativa e o id do proprio token (a entrada da ordem aponta para ele) */
        return String.valueOf(e.getId());
    }

    private String nomeDe(MapaElemento e) {
        return ler(e.getDados()).path("nome").asString("");
    }

    private static MapaElemento.Tipo tipo(String t) {
        if (t == null || t.isBlank()) return MapaElemento.Tipo.TOKEN;
        MapaElemento.Tipo x = MapaElemento.Tipo.valueOf(t.trim().toUpperCase(Locale.ROOT));
        /* parede e fog chegam na fase da visao, com as regras deles */
        if (x != MapaElemento.Tipo.TOKEN && x != MapaElemento.Tipo.DESENHO) throw new IllegalArgumentException("tipo de elemento ainda não suportado");
        return x;
    }

    /** Token que nasce de ficha e de quem e dono da ficha; a ficha precisa ser desta campanha. */
    private long donoInicial(long cid, CorpoElemento c, ObjectNode d) {
        if (d.hasNonNull(K_FICHA)) {
            Ficha f = fichas.findById(d.get(K_FICHA).asLong())
                    .filter(x -> Objects.equals(x.getCampanhaId(), cid))
                    .orElseThrow(() -> new IllegalArgumentException("ficha não encontrada nesta campanha"));
            if (c.dono == null) return f.getUsuarioId();
        }
        return c.dono == null ? 0 : Math.max(0, c.dono);
    }

    private void aplicaMapa(Mapa m, CorpoMapa c, long cid) {
        if (c == null) return;
        if (c.nome != null) {
            String n = c.nome.trim();
            m.setNome(n.isEmpty() ? "Mapa sem nome" : MapaRegras.corta(n, 120));
        }
        if (c.imagem != null && !c.imagem.equals(m.getImagem())) {
            String img = MapaRegras.caminhoImagem(c.imagem);
            m.setImagem(img);
            int[] wh = img.isEmpty() ? null : dimensoes(cid, img);
            if (wh != null) { m.setLargura(wh[0]); m.setAltura(wh[1]); }
        }
        if (m.getImagem().isEmpty() && c.largura != null && c.altura != null) {
            m.setLargura(Math.clamp(c.largura, LADO_MIN, LADO_MAX));
            m.setAltura(Math.clamp(c.altura, LADO_MIN, LADO_MAX));
        }
        if (c.grid != null) m.setGrid(om.writeValueAsString(MapaRegras.grid(c.grid)));
        if (c.regras != null) {
            Map<String, Object> in = new LinkedHashMap<>(c.regras);
            /* quem edita so o "quem move" e o limite nao destranca as camadas sem querer */
            if (!in.containsKey("encaixe")) in.put("encaixe", ler(m.getRegras()).path("encaixe").asBoolean(true));
            if (!in.containsKey("trancadas")) {
                List<String> t = new ArrayList<>();
                for (JsonNode n : ler(m.getRegras()).path("trancadas")) t.add(n.asString(""));
                in.put("trancadas", t);
            }
            m.setRegras(om.writeValueAsString(MapaRegras.regras(in)));
        }
        if (c.cenaId != null) m.setCenaId(MapaRegras.corta(c.cenaId.trim(), 80));
    }

    private int[] dimensoes(long cid, String img) {
        Path raiz = raizMidia.resolve("c" + cid);
        Path arq = raiz.resolve(img).normalize();
        if (!arq.startsWith(raiz.resolve("img"))) throw new IllegalArgumentException("imagem fora da campanha");
        return Miniaturas.dimensoes(arq).orElseThrow(() -> new IllegalArgumentException("não consegui ler essa imagem"));
    }

    private void registra(Mapa m, long uid, String op, long eid, String depois, String antes) {
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

    private void publicaAtivo(long cid, Long ativo) {
        eventos.publicar(cid, (p, u) -> {
            Map<String, Object> ev = evento(K_ATIVO, null);
            ev.put(K_ATIVO, ativo);
            return ev;
        });
    }

    /** Cada um recebe o elemento como pode ver: o jogador que perde a vista recebe "some". */
    private void publicaElemento(long cid, Feito f) {
        eventos.publicar(cid, (p, u) -> {
            boolean mestre = p == Papel.MESTRE;
            if (!mestre && !f.m().isAtivo()) return null;
            /* oculto: quem via fica sabendo que sumiu; quem nunca viu nao recebe nada, nem o id */
            if (!mestre && !f.e().isVisivel()) return f.eraVisivel() ? some(f) : null;
            Map<String, Object> ev = evento("elemento", f.m().getSeq());
            ev.put("mapa", f.m().getId());
            ev.put("el", elJson(f.e(), f.m(), mestre, u));
            return ev;
        });
    }

    private static Map<String, Object> some(Feito f) {
        Map<String, Object> ev = evento("some", f.m().getSeq());
        ev.put("mapa", f.m().getId());
        ev.put("id", f.e().getId());
        return ev;
    }

    private static Map<String, Object> evento(String tipo, Long seq) {
        Map<String, Object> ev = new LinkedHashMap<>();
        ev.put(K_TIPO, tipo);
        if (seq != null) ev.put("seq", seq);
        return ev;
    }

    private ObjectNode ler(String json) {
        try {
            JsonNode n = om.readTree(json == null || json.isBlank() ? "{}" : json);
            return n instanceof ObjectNode o ? o : om.createObjectNode();
        } catch (JacksonException _) {
            return om.createObjectNode();
        }
    }

    private Map<String, Object> mapaJson(Mapa m, boolean mestre) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", m.getId());
        r.put("nome", m.getNome());
        r.put("imagem", m.getImagem());
        r.put("largura", m.getLargura());
        r.put("altura", m.getAltura());
        r.put("grid", ler(m.getGrid()));
        r.put("regras", ler(m.getRegras()));
        r.put(K_ATIVO, m.isAtivo());
        r.put("ordem", m.getOrdem());
        r.put("seq", m.getSeq());
        if (mestre) r.put("cenaId", m.getCenaId());
        return r;
    }

    /** O elemento como esta no banco, para o historico. */
    private Map<String, Object> elCru(MapaElemento e) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", e.getId());
        r.put(K_TIPO, e.getTipo().name());
        r.put("camada", e.getCamada());
        r.put("dono", e.getDono());
        r.put("visivel", e.isVisivel());
        r.put("bloqueado", e.isBloqueado());
        r.put("ordem", e.getOrdem());
        r.put(K_DADOS, ler(e.getDados()));
        return r;
    }

    private Map<String, Object> elJson(MapaElemento e, Mapa m, boolean mestre, long uid) {
        Map<String, Object> r = elCru(e);
        boolean token = e.getTipo() == MapaElemento.Tipo.TOKEN;
        if (!mestre) {
            if (token) {
                ObjectNode d = ler(e.getDados());
                d.retain(dadosVisiveis(e, m, uid, d));
                r.put(K_DADOS, d);
            }
            r.remove("bloqueado");
            /* a ordem tem buraco onde ha elemento oculto: a lista ja vem na ordem, o numero nao vai */
            r.remove("ordem");
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
