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

    /** O jogador nao tem por onde ir: ha parede (ou porta fechada) fechando todos os caminhos ate o ponto escolhido. */
    public static class ParedeNoCaminho extends RuntimeException {
        public ParedeNoCaminho(String msg) { super(msg); }
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

    /** Para onde o jogador esta arrastando o token, e o caminho que ele fez ate ali. */
    public static class CorpoRota {
        public Long id;
        public double x;
        public double y;
        public List<List<Double>> trajeto;
    }

    /** Varios elementos de uma vez (mover ou organizar a selecao): uma operacao so, um desfazer so. */
    public static class CorpoLote {
        public List<ItemLote> itens;
    }

    /** o elemento e o mapa como ficaram ao fim da operacao, ja fora da transacao, e se o
     *  jogador via o elemento antes dela (so quem via recebe o aviso de que ele sumiu). {@code trilha} sao os
     *  pontos por onde o token passou entre a origem e o destino (vazia: em linha reta); so enfeita a animacao. */
    private record Feito(MapaElemento e, Mapa m, boolean eraVisivel, boolean passou, boolean ordem, List<double[]> trilha) {
        Feito(MapaElemento e, Mapa m, boolean eraVisivel, boolean passou, boolean ordem) { this(e, m, eraVisivel, passou, ordem, List.of()); }
        Feito(MapaElemento e, Mapa m, boolean eraVisivel) { this(e, m, eraVisivel, false, false, List.of()); }
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
    private static final String K_VISAO = "visao";
    private static final String K_USADO = "usado";
    private static final String K_ID = "id";
    private static final String K_SEQ = "seq";
    private static final String K_OPERACAO = "operacao";
    private static final String K_CRIAR = "criar";
    private static final String K_MUDAR = "mudar";
    private static final String K_REMOVER = "remover";
    private static final String K_MARCAS = "marcas";
    private static final String K_VIDA_MAX = "vidaMax";
    private static final String K_VISIVEL = "visivel";
    private static final String K_CAMADA = "camada";
    private static final String K_BLOQUEADO = "bloqueado";
    private static final String K_ORDEM = "ordem";
    private static final String K_VINCULO = "vinculo";
    private static final String K_TRANCADAS = "trancadas";
    private static final String K_ENCAIXE = "encaixe";
    private static final List<String> DESFAZIVEIS = List.of(K_CRIAR, K_MUDAR, K_REMOVER);
    /** o que o jogador recebe de um token: o vinculo com ficha e com o elenco fica com o mestre */
    private static final Set<String> DADOS_DO_JOGADOR = Set.of("x", "y", "tam", "rot", "nome", "img", K_MARCAS);
    /** de quem pode mover o token vai tambem o deslocamento do turno: o jogador precisa ver quanto resta */
    private static final Set<String> DADOS_DE_QUEM_MOVE = Set.of("x", "y", "tam", "rot", "nome", "img", K_MARCAS, "desl", K_VISAO, MapaRegras.K_VISAO_FICHA, K_USADO);
    /** a barra de vida: o dono do token sempre ve; os outros so quando o mestre torna publica */
    private static final Set<String> DADOS_DA_VIDA = Set.of("vida", K_VIDA_MAX);

    private final MapaRepo mapas;
    private final MapaElementoRepo elementos;
    private final MapaHistoricoRepo historico;
    private final FichaRepo fichas;
    private final UsuarioRepo usuarios;
    private final MapaTurnos turnos;
    private final CampanhaService camp;
    private final MapaEventos eventos;
    private final MapaVisao visao;
    private final TransactionTemplate tx;
    private final Path raizMidia;
    private final ObjectMapper om = JsonMapper.builder().build();
    private final Map<Long, Object> travas = new ConcurrentHashMap<>();
    private final Map<Long, Long> ultimoPing = new ConcurrentHashMap<>();

    public MapaService(MapaRepo mapas, MapaElementoRepo elementos, MapaHistoricoRepo historico, FichaRepo fichas, // NOSONAR: uma dependencia por tabela e servico do mapa, de proposito
                       UsuarioRepo usuarios, MapaTurnos turnos, CampanhaService camp, MapaEventos eventos, MapaVisao visao,
                       PlatformTransactionManager ptm, AppProps props) {
        this.mapas = mapas;
        this.elementos = elementos;
        this.historico = historico;
        this.fichas = fichas;
        this.usuarios = usuarios;
        this.turnos = turnos;
        this.camp = camp;
        this.eventos = eventos;
        this.visao = visao;
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
        List<MapaElemento> todos = elementos.findByMapaIdOrderByOrdemAscIdAsc(mid);
        MapaVisao.Vista vi = mestre ? null : visao.de(m, () -> todos, uid);
        List<Map<String, Object>> els = new ArrayList<>();
        for (MapaElemento e : todos) {
            if (mestre || chegaAoJogador(e, vi, uid)) els.add(elJson(e, m, mestre, uid));
        }
        r.put("elementos", els);
        if (vi != null) r.put("vista", vi.json());
        return r;
    }

    /**
     * O corte da nevoa: parede e area de nevoa nunca saem para o jogador (a mascara da vista ja diz o que ele
     * ve); token, so o dele ou o que esta a vista agora; desenho, so o que toca o que ele ve ou lembra.
     */
    private boolean chegaAoJogador(MapaElemento e, MapaVisao.Vista vi, long uid) {
        if (!e.isVisivel() || sempreVisivel(e.getTipo())) return false;
        ObjectNode d = ler(e.getDados());
        if (e.getTipo() == MapaElemento.Tipo.TOKEN) return e.getDono() == uid || vi.ve(d.path("x").asDouble(0), d.path("y").asDouble(0));
        double[] c = caixa(d);
        return vi.toca(c[0], c[1], c[2], c[3]);
    }

    /** a caixa dos pontos de um desenho, com uma casa de folga para o rotulo da marcacao */
    private static double[] caixa(ObjectNode d) {
        double[] c = {Double.MAX_VALUE, Double.MAX_VALUE, -Double.MAX_VALUE, -Double.MAX_VALUE};
        for (double[] p : MapaNevoa.pontos(d.path("pts"))) {
            c[0] = Math.min(c[0], p[0]);
            c[1] = Math.min(c[1], p[1]);
            c[2] = Math.max(c[2], p[0]);
            c[3] = Math.max(c[3], p[1]);
        }
        if (c[0] > c[2]) return new double[]{0, 0, 0, 0};
        return c;
    }

    /** As imagens usadas por mapas da campanha (o catalogo do jogador as esconde). */
    public Set<String> imagensDeMapa(long cid) {
        Set<String> out = new HashSet<>();
        for (Mapa m : mapas.findByCampanhaIdOrderByOrdemAscIdAsc(cid)) {
            if (!m.getImagem().isEmpty()) out.add(m.getImagem());
        }
        return out;
    }

    /** Um pedaco da imagem do mapa: e so assim que o jogador recebe a imagem (o caminho dela nao sai para ele). */
    public MapaVisao.Pedaco pedaco(long cid, long uid, long mid, int tx, int ty, String versao) {
        boolean mestre = camp.exigeMembro(cid, uid) == Papel.MESTRE;
        Mapa m = visivelPara(cid, mid, mestre);
        return visao.pedaco(m, () -> elementos.findByMapaIdOrderByOrdemAscIdAsc(mid), uid, mestre, tx, ty, versao);
    }

    /**
     * A rota que o servidor cobraria se o token fosse arrastado ate (x, y): a tela do jogador nao recebe as
     * paredes, entao pergunta aqui para desenhar o trajeto antes de soltar. So para quem pode mover o token.
     * {@code livre}: nada no meio (vale o caminho arrastado); {@code semCaminho}: parede fecha tudo.
     */
    public Map<String, Object> rota(long cid, long uid, long mid, CorpoRota c) {
        boolean mestre = camp.exigeMembro(cid, uid) == Papel.MESTRE;
        Mapa m = visivelPara(cid, mid, mestre);
        if (c == null || c.id == null) throw new IllegalArgumentException("qual token?");
        MapaElemento e = achaElemento(mid, c.id, mestre);
        if (!mestre && !podeMoverPelasRegras(e, m, uid)) throw new CampanhaService.SemAcessoException("este token não é seu para mover");
        ObjectNode d = ler(e.getDados());
        double[] o = {d.path("x").asDouble(0), d.path("y").asDouble(0)};
        double[] dest = {Math.clamp(c.x, -m.getLargura(), m.getLargura() * 2.0), Math.clamp(c.y, -m.getAltura(), m.getAltura() * 2.0)};
        List<double[]> paredes = mestre ? List.of() : paredesQueBarram(mid);
        Map<String, Object> r = new LinkedHashMap<>();
        List<double[]> pts = new ArrayList<>();
        pts.add(o);
        pts.addAll(MapaRegras.trajeto(c.trajeto, m));
        pts.add(dest);
        if (paredes.isEmpty() || MapaParedes.livre(paredes, pts)) {
            r.put(K_LIVRE, true);
            return r;
        }
        List<double[]> rota = MapaParedes.rota(paredes, o, dest);
        if (rota == null) r.put("semCaminho", true);
        else r.put("pts", rota.stream().map(p -> List.of(Math.round(p[0] * 10) / 10.0, Math.round(p[1] * 10) / 10.0)).toList());
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
            visao.apagaMapa(mid);
            mapas.delete(m);
            return m.isAtivo();
        })));
        travas.remove(mid);
        visao.esquece(mid);
        eventos.publicar(cid, (p, u) -> p == Papel.MESTRE ? evento("lista", null) : null);
        if (eraAtivo) publicaAtivo(cid, null);
    }

    /** Campanha apagada: chamado dentro da transacao de CampanhaController. */
    public void apagarDaCampanha(long cid) {
        historico.deleteByCampanhaId(cid);
        visao.apagaCampanha(cid);
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
            ObjectNode d = dadosDoTipo(t, om.createObjectNode(), c.dados, m);
            x.setCamada(MapaRegras.camada(c.camada, camadaPadrao(t, d)));
            x.setDono(t == MapaElemento.Tipo.TOKEN ? donoInicial(cid, c, d) : 0);
            if (c.bloqueado != null) x.setBloqueado(c.bloqueado);
            if (c.visivel != null && !sempreVisivel(t)) x.setVisivel(c.visivel);
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
        return new Feito(x, m, via, passou, ordem0 != x.getOrdem(), caminhoAndado(m, c, x0, y0, x, mestre));
    }

    /**
     * Os pontos entre a origem e o destino por onde o token anda na tela dos outros: a rota que contorna as paredes,
     * se houve, ou o caminho que quem moveu desenhou ao arrastar. So enfeite: o que vale (custo, parede) ja foi decidido.
     */
    private List<double[]> caminhoAndado(Mapa m, CorpoElemento c, double x0, double y0, MapaElemento x, boolean mestre) {
        if (c == null || x.getTipo() != MapaElemento.Tipo.TOKEN) return List.of();
        ObjectNode d = ler(x.getDados());
        double[] o = {x0, y0, d.path("x").asDouble(0), d.path("y").asDouble(0)};
        if (o[0] == o[2] && o[1] == o[3]) return List.of();
        List<double[]> rota = mestre ? List.of() : rotaPelasParedes(m, o, c);
        return rota.isEmpty() ? MapaRegras.trajeto(c.trajeto, m) : rota.subList(1, rota.size() - 1);
    }

    /**
     * O jogador mexe em duas coisas: na posicao (token que ele pode mover, na vez dele) e na vida atual
     * e nas marcas (so o dono do token, a qualquer hora). Nao se mistura permissao de uma com a da outra.
     */
    private void exigeDoJogador(MapaElemento x, Mapa m, CorpoElemento c, long uid) {
        Map<String, Object> d = c.dados == null ? Map.of() : c.dados;
        boolean marca = d.containsKey("vida") || d.containsKey(K_MARCAS);
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
        List<Desfeito> feitos = Objects.requireNonNull(travado(mid, () -> tx.execute(s -> aplicaLote(cid, uid, mid, c.itens))));
        publicaDesfeitos(cid, feitos);
        List<Object> itens = new ArrayList<>();
        for (Desfeito d : feitos) {
            itens.add(d.removido() ? Map.of(K_ID, d.feito().e().getId(), "removido", true)
                    : elJson(d.feito().e(), d.feito().m(), true, uid));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put(K_SEQ, feitos.getFirst().feito().m().getSeq());
        out.put("itens", itens);
        return out;
    }

    /** os itens do grupo, dentro da transacao: um seq so para todos */
    private List<Desfeito> aplicaLote(long cid, long uid, long mid, List<ItemLote> itens) {
        Mapa m = doMestre(cid, mid);
        m.setSeq(m.getSeq() + 1);
        mapas.save(m);
        List<Desfeito> out = new ArrayList<>();
        for (ItemLote it : itens) {
            if (it == null || it.id == null) throw new IllegalArgumentException("item sem id");
            MapaElemento x = achaElemento(mid, it.id, true);
            boolean remove = Boolean.TRUE.equals(it.remover);
            out.add(new Desfeito(remove ? removeUm(m, x, uid, false) : mudaUm(m, x, it, true, uid, false), remove));
        }
        return out;
    }

    /** cada elemento mexido (ou que saiu) vai para quem esta olhando, e a ordem nova se ela mudou */
    private void publicaDesfeitos(long cid, List<Desfeito> ds) {
        for (Desfeito d : ds) {
            if (d.removido()) publicaRemocao(cid, d.feito()); else publicaElemento(cid, d.feito());
            if (d.feito().ordem()) publicaOrdem(cid, d.feito().m());
        }
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
        boolean pelaVista = pelaVista(f);
        eventos.publicar(cid, (p, u) -> {
            if (p == Papel.MESTRE) return some(f);
            if (!f.m().isAtivo() || !f.eraVisivel()) return null;
            return pelaVista ? vista(f) : some(f);
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
     * mudou): o deslocamento gasto de todos zera e todos sao avisados. Mudou so de quem e a vez: o
     * mapa passa a liberar o token de quem ficou com ela. Em qualquer caso o espelho publico da ordem
     * segue para os jogadores na hora, sem esperar o sorteio de versao da mesa.
     */
    public Map<String, Object> sincronizaTurno(long cid, long uid, CorpoTurno c) {
        camp.exigeMestre(cid, uid);
        MapaTurnos.Turno novo = turnoDe(c);
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

    /** a iniciativa como o navegador do mestre a mandou: so vale com alguem na ordem */
    private static MapaTurnos.Turno turnoDe(CorpoTurno c) {
        Set<String> ids = new LinkedHashSet<>();
        for (String n : c.ids == null ? List.<String>of() : c.ids) {
            String x = MapaTurnos.id(n);
            if (!x.isEmpty() && ids.size() < 200) ids.add(x);
        }
        if (!Boolean.TRUE.equals(c.ativo) || ids.isEmpty()) return MapaTurnos.Turno.PARADO;
        int rodada = c.rodada == null ? 1 : c.rodada;
        return new MapaTurnos.Turno(true, Math.clamp(rodada, 1, 9999), MapaTurnos.id(c.vez), ids);
    }

    /** Sobe o seq do mapa (os clientes pedem o estado de novo) e, no turno novo, zera o gasto. Devolve {seq, quantos zerou}. */
    private long[] viraTurnoDoMapa(long cid, long uid, long mid, boolean zera, boolean sobe) {
        long[] r = travado(mid, () -> tx.execute(s -> {
            Mapa m = doMestre(cid, mid);
            long n = zera ? zeraGasto(mid) : 0;
            if (sobe) {
                m.setSeq(m.getSeq() + 1);
                mapas.save(m);
                if (zera) registra(m, uid, "turno", 0, "", "");
            }
            return new long[]{m.getSeq(), n};
        }));
        return Objects.requireNonNull(r);
    }

    /** zera o deslocamento gasto de todos os tokens do mapa; devolve quantos tinham gasto */
    private long zeraGasto(long mid) {
        long n = 0;
        for (MapaElemento e : elementos.findByMapaIdOrderByOrdemAscIdAsc(mid)) {
            ObjectNode d = ler(e.getDados());
            if (d.path(K_USADO).asDouble(0) > 0) {
                d.put(K_USADO, 0);
                e.setDados(om.writeValueAsString(d));
                elementos.save(e);
                n++;
            }
        }
        return n;
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
        List<Desfeito> rs = travado(mid, () -> tx.execute(s -> desfazPrimeiro(visivelPara(cid, mid, mestre), uid, mestre, seqAlvo)));
        if (rs == null || rs.isEmpty()) {
            if (seqAlvo != null) throw new NaoAchado();
            throw new IllegalStateException("não há nada seu para desfazer");
        }
        publicaDesfeitos(cid, rs);
        Map<String, Object> out = new LinkedHashMap<>(desfeitoJson(rs.getFirst(), mestre, uid));
        out.put(K_SEQ, rs.getFirst().feito().m().getSeq());
        /* um grupo (mover a selecao) se desfaz inteiro: o primeiro vai nos campos de sempre, o resto em "outros" */
        if (rs.size() > 1) out.put("outros", rs.subList(1, rs.size()).stream().map(d -> desfeitoJson(d, mestre, uid)).toList());
        return out;
    }

    /** a primeira acao da fila desta pessoa que ainda da para desfazer (dentro da transacao) */
    private List<Desfeito> desfazPrimeiro(Mapa m, long uid, boolean mestre, Long seqAlvo) {
        long mid = m.getId();
        List<MapaHistorico> fila = seqAlvo != null
                ? historico.findFirstByMapaIdAndSeqAndUsuarioId(mid, seqAlvo, uid)
                        .filter(h -> !h.isDesfeito() && DESFAZIVEIS.contains(h.getOperacao())).stream().toList()
                : historico.findTop20ByMapaIdAndUsuarioIdAndDesfeitoFalseAndOperacaoInOrderByIdDesc(mid, uid, DESFAZIVEIS);
        for (MapaHistorico h : fila) {
            List<Desfeito> ds = h.isDesfeito() ? List.of() : desfazGrupo(h, m, uid, mestre);
            if (!ds.isEmpty()) return ds;
        }
        return List.of();
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
        ObjectNode atual = ler(x.getDados());
        JsonNode dDepois = ler(h.getDepois()).path(K_DADOS);
        if (!mestre && (atual.path("x").asDouble() != dDepois.path("x").asDouble() || atual.path("y").asDouble() != dDepois.path("y").asDouble())) {
            return null;
        }
        String agora = om.writeValueAsString(elCru(x));
        boolean via = x.isVisivel();
        int ordem0 = x.getOrdem();
        if (mestre) voltaDoMestre(x, antes, atual); else voltaDoJogador(x, antes.path(K_DADOS), dDepois, atual);
        elementos.save(x);
        fechaDesfazer(m, uid, x.getId(), om.writeValueAsString(elCru(x)), agora);
        return new Desfeito(new Feito(x, m, via, false, ordem0 != x.getOrdem()), false);
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
    private Desfeito desfazRemover(MapaHistorico h, Mapa m, long uid, ObjectNode antes) {
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
     * Paredes primeiro, depois o deslocamento. Parede barra o jogador sempre, com ou sem limite no token: se o caminho
     * em linha reta (ou o que ele desenhou) cruza uma, vale a rota mais curta que a contorna, e sem rota o movimento e
     * recusado. O mestre nunca e barrado. Depois, o que o movimento custou e descontado do token: sem limite nada se
     * conta; passando do que resta, no modo "bloqueio" recusa e no "aviso" deixa e diz que passou.
     */
    private boolean gastaDeslocamento(MapaElemento x, Mapa m, double x0, double y0, CorpoElemento c) {
        ObjectNode d = ler(x.getDados());
        double x1 = d.path("x").asDouble(0);
        double y1 = d.path("y").asDouble(0);
        if (x0 == x1 && y0 == y1) return false;
        double[] o = {x0, y0, x1, y1};
        List<double[]> rota = rotaPelasParedes(m, o, c);
        double desl = d.path("desl").asDouble(0);
        if (desl <= 0) return false;
        JsonNode g = ler(m.getGrid());
        double custo = custoDoMovimento(m, g, o, c, rota);
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

    /** Os trechos de parede que barram quem anda: parede, janela e porta fechada. */
    private List<double[]> paredesQueBarram(long mid) {
        List<double[]> out = new ArrayList<>();
        for (MapaElemento e : elementos.findByMapaIdAndTipo(mid, MapaElemento.Tipo.PAREDE)) {
            ObjectNode d = ler(e.getDados());
            if ("porta".equals(d.path("kind").asString("")) && d.path("aberta").asBoolean(false)) continue;
            JsonNode pts = d.path("pts");
            for (int i = 1; i < pts.size(); i++) {
                out.add(new double[]{pts.get(i - 1).get(0).asDouble(), pts.get(i - 1).get(1).asDouble(), pts.get(i).get(0).asDouble(), pts.get(i).get(1).asDouble()});
            }
        }
        return out;
    }

    /**
     * Vazia quando nenhuma parede esta no meio (vale o caminho de sempre); senao, os pontos da rota que a contorna.
     * Sem rota, o movimento e recusado.
     */
    private List<double[]> rotaPelasParedes(Mapa m, double[] o, CorpoElemento c) {
        List<double[]> paredes = paredesQueBarram(m.getId());
        if (paredes.isEmpty()) return List.of();
        List<double[]> pts = new ArrayList<>();
        pts.add(new double[]{o[0], o[1]});
        pts.addAll(MapaRegras.trajeto(c.trajeto, m));
        pts.add(new double[]{o[2], o[3]});
        if (MapaParedes.livre(paredes, pts)) return List.of();
        List<double[]> rota = MapaParedes.rota(paredes, new double[]{o[0], o[1]}, new double[]{o[2], o[3]});
        if (rota == null) throw new ParedeNoCaminho("Há uma parede no caminho: não há por onde passar até lá.");
        return rota;
    }

    /**
     * Pela rota que contorna as paredes, se houver; senao pelo caminho que o jogador informou ao arrastar; sem ele,
     * em linha reta da origem ao destino. O caminho nunca sai mais barato que a reta: quem nao o manda paga a reta.
     */
    private double custoDoMovimento(Mapa m, JsonNode g, double[] o, CorpoElemento c, List<double[]> rota) {
        double escala = g.path("escala").asDouble(1.5);
        double reta = MapaMedida.casas(g, o[0], o[1], o[2], o[3]) * escala;
        List<double[]> t = rota.isEmpty() ? MapaRegras.trajeto(c.trajeto, m) : rota.subList(1, rota.size() - 1);
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
            dadosDoTipo(x.getTipo(), d, c.dados, m);
            aplicaDoMestre(x, c, m);
        }
        x.setDados(om.writeValueAsString(d));
    }

    /** o que so o mestre muda fora dos dados: dono, visibilidade, camada, trava e ordem */
    private void aplicaDoMestre(MapaElemento x, CorpoElemento c, Mapa m) {
        if (c.dono != null && x.getTipo() == MapaElemento.Tipo.TOKEN) x.setDono(Math.max(0, c.dono));
        if (c.visivel != null && !sempreVisivel(x.getTipo())) x.setVisivel(c.visivel);
        if (c.camada != null) x.setCamada(MapaRegras.camada(c.camada, x.getCamada()));
        if (c.bloqueado != null) x.setBloqueado(c.bloqueado);
        if (c instanceof ItemLote it && it.ordem != null) x.setOrdem(novaOrdem(m, it.ordem, x.getOrdem()));
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
                || antes.path(K_VIDA_MAX).asDouble(-1) != depois.path(K_VIDA_MAX).asDouble(-1);
        String campo = depois.path("vidaCampo").asString("");
        if (!mudou || campo.isEmpty() || !depois.path(K_VINCULO).asBoolean(false) || !depois.hasNonNull(K_FICHA)) return;
        fichas.findById(depois.get(K_FICHA).asLong()).filter(f -> Objects.equals(f.getCampanhaId(), cid)).ifPresent(f -> {
            ObjectNode conteudo = ler(f.getConteudo());
            boolean achou = false;
            for (JsonNode n : conteudo.path("campos")) {
                if (n instanceof ObjectNode o && "barra".equals(o.path("tipo").asString("")) && campo.equals(o.path("rot").asString(""))) {
                    o.put("val", fmtInt(depois.path("vida").asDouble(0)));
                    o.put("max", fmtInt(depois.path(K_VIDA_MAX).asDouble(0)));
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
            boolean ligado = !campo.isEmpty() && d.path(K_VINCULO).asBoolean(false) && d.path(K_FICHA).asLong(-1) == fichaId;
            JsonNode b = ligado ? barraDaFicha(c, campo) : null;
            if (b != null) sincronizaVida(cid, e.getId(), e.getMapaId(), numeroDaFicha(b.path("val").asString("")), numeroDaFicha(b.path("max").asString("")));
        }
    }

    /** a barra da ficha com aquele rotulo, ou nula */
    private static JsonNode barraDaFicha(ObjectNode conteudo, String campo) {
        for (JsonNode n : conteudo.path("campos")) {
            if ("barra".equals(n.path("tipo").asString("")) && campo.equals(n.path("rot").asString(""))) return n;
        }
        return null;
    }

    private void sincronizaVida(long cid, long eid, long mid, double vida, double max) {
        Feito f = travado(mid, () -> tx.execute(s -> {
            MapaElemento x = elementos.findById(eid).orElse(null);
            Mapa m = mapas.findById(mid).orElse(null);
            if (x == null || m == null || max <= 0) return null;
            ObjectNode d = ler(x.getDados());
            if (d.path("vida").asDouble(-1) == Math.round(vida) && d.path(K_VIDA_MAX).asDouble(-1) == Math.round(max)) return null;
            d.put("vida", Math.round(Math.clamp(vida, 0, 99999)));
            d.put(K_VIDA_MAX, Math.round(Math.clamp(max, 1, 99999)));
            x.setDados(om.writeValueAsString(d));
            elementos.save(x);
            m.setSeq(m.getSeq() + 1);
            mapas.save(m);
            return new Feito(x, m, x.isVisivel());
        }));
        if (f != null) publicaElemento(cid, f);
    }

    /**
     * O alcance da visao da ficha mudou: os tokens vinculados a ela guardam a copia (visaoFicha), que vale quando o
     * token nao tem alcance proprio. Vazio na ficha tira a copia. Chamado pelo controller depois de gravar a ficha.
     */
    public void visaoDaFicha(long cid, long fichaId, String conteudo) {
        final Double alvo = alcanceDaFicha(ler(conteudo).path(K_VISAO));
        for (MapaElemento e : elementos.findByCampanhaIdAndTipo(cid, MapaElemento.Tipo.TOKEN)) {
            ObjectNode d = ler(e.getDados());
            boolean ligado = d.path(K_VINCULO).asBoolean(false) && d.path(K_FICHA).asLong(-1) == fichaId;
            Double atual = d.has(MapaRegras.K_VISAO_FICHA) ? d.get(MapaRegras.K_VISAO_FICHA).asDouble() : null;
            if (ligado && !Objects.equals(atual, alvo)) {
                sincronizaDados(cid, e.getId(), e.getMapaId(), x -> {
                    if (alvo == null) x.remove(MapaRegras.K_VISAO_FICHA); else x.put(MapaRegras.K_VISAO_FICHA, alvo.doubleValue());
                });
            }
        }
    }

    /** o alcance escrito na ficha (numero ou texto), preso a 0..100 casas; nulo quando esta vazio */
    private static Double alcanceDaFicha(JsonNode v) {
        if (!v.isNumber() && !(v.isString() && !v.asString("").isBlank())) return null;
        double casas = v.isNumber() ? v.asDouble() : numeroDaFicha(v.asString(""));
        return Math.round(Math.clamp(casas, 0, 100) * 10) / 10.0;
    }

    /** Muda os dados de um token por dentro da trava do mapa e avisa quem esta olhando (sem historico: nao e acao de ninguem). */
    private void sincronizaDados(long cid, long eid, long mid, java.util.function.Consumer<ObjectNode> muda) {
        Feito f = travado(mid, () -> tx.execute(s -> {
            MapaElemento x = elementos.findById(eid).orElse(null);
            Mapa m = mapas.findById(mid).orElse(null);
            if (x == null || m == null) return null;
            ObjectNode d = ler(x.getDados());
            muda.accept(d);
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
            Map<String, Object> ev = evento(K_ORDEM, m.getSeq());
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
        for (JsonNode c : ler(m.getRegras()).path(K_TRANCADAS)) {
            if (e.getCamada().equals(c.asString(""))) return true;
        }
        return false;
    }

    private static String camadaPadrao(MapaElemento.Tipo t, ObjectNode d) {
        return switch (t) {
            case DESENHO -> "decoracao";
            case PAREDE, FOG -> "cenario";
            case TOKEN -> d.hasNonNull("npcId") ? "npcs" : "personagens";
        };
    }

    /** Cada tipo de elemento tem as suas regras de dados; o que nao e conhecido cai. */
    private static ObjectNode dadosDoTipo(MapaElemento.Tipo t, ObjectNode d, Map<String, Object> in, Mapa m) {
        return switch (t) {
            case DESENHO -> MapaRegras.dadosDesenho(d, in, m);
            case PAREDE -> MapaRegras.dadosParede(d, in, m);
            case FOG -> MapaRegras.dadosFog(d, in, m);
            case TOKEN -> MapaRegras.dadosToken(d, in, m);
        };
    }

    /**
     * Parede e area de nevoa ficam sempre "visiveis" (nao ha parede escondida: ela vale para o movimento e a
     * visao de todos), mas nunca saem para o jogador: quem calcula o que ele ve e o servidor (MapaVisao).
     */
    private static boolean sempreVisivel(MapaElemento.Tipo t) {
        return t == MapaElemento.Tipo.PAREDE || t == MapaElemento.Tipo.FOG;
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
        return MapaElemento.Tipo.valueOf(t.trim().toUpperCase(Locale.ROOT));
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
        aplicaImagem(m, c, cid);
        if (c.grid != null) m.setGrid(om.writeValueAsString(MapaRegras.grid(c.grid)));
        if (c.regras != null) m.setRegras(om.writeValueAsString(MapaRegras.regras(regrasMescladas(m, c.regras))));
        if (c.cenaId != null) m.setCenaId(MapaRegras.corta(c.cenaId.trim(), 80));
    }

    /** imagem nova: o tamanho passa a ser o dela; sem imagem, o tamanho pedido (em pixels) */
    private void aplicaImagem(Mapa m, CorpoMapa c, long cid) {
        if (c.imagem != null && !c.imagem.equals(m.getImagem())) {
            String img = MapaRegras.caminhoImagem(c.imagem);
            m.setImagem(img);
            int[] wh = img.isEmpty() ? null : dimensoes(cid, img);
            if (wh != null) {
                m.setLargura(wh[0]);
                m.setAltura(wh[1]);
            }
        }
        if (m.getImagem().isEmpty() && c.largura != null && c.altura != null) {
            m.setLargura(Math.clamp(c.largura, LADO_MIN, LADO_MAX));
            m.setAltura(Math.clamp(c.altura, LADO_MIN, LADO_MAX));
        }
    }

    /**
     * As regras pedidas, com o que nao veio mantido como estava: quem edita so o "quem move" e o limite nao
     * destranca as camadas, nem desliga a nevoa, a memoria ou o encaixe sem querer.
     */
    private Map<String, Object> regrasMescladas(Mapa m, Map<String, Object> pedidas) {
        Map<String, Object> in = new LinkedHashMap<>(pedidas);
        JsonNode antes = ler(m.getRegras());
        in.putIfAbsent(K_ENCAIXE, antes.path(K_ENCAIXE).asBoolean(true));
        in.putIfAbsent("fog", antes.path("fog").asString(MapaNevoa.NENHUM));
        for (String k : List.of(MapaRegras.K_FOG_MEMORIA, MapaRegras.K_FOG_VER, MapaRegras.K_VISAO_PADRAO)) {
            JsonNode v = antes.get(k);
            if (v != null && !in.containsKey(k)) in.put(k, v.isBoolean() ? v.asBoolean() : v.asDouble());
        }
        if (!in.containsKey(K_TRANCADAS)) {
            List<String> t = new ArrayList<>();
            for (JsonNode n : antes.path(K_TRANCADAS)) t.add(n.asString(""));
            in.put(K_TRANCADAS, t);
        }
        return in;
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

    /**
     * Cada um recebe o elemento como pode ver: o jogador que perde a vista recebe "some". Com a nevoa ligada
     * (ou quando muda uma parede ou area), o jogador nao recebe o elemento: recebe "vista" e pede o estado de
     * novo, porque o que ele enxerga depende de tudo o que esta no mapa e quem corta e o servidor.
     */
    private void publicaElemento(long cid, Feito f) {
        boolean pelaVista = pelaVista(f);
        eventos.publicar(cid, (p, u) -> {
            boolean mestre = p == Papel.MESTRE;
            if (!mestre && !f.m().isAtivo()) return null;
            /* oculto: quem via fica sabendo que sumiu; quem nunca viu nao recebe nada, nem o id */
            if (!mestre && !f.e().isVisivel()) return f.eraVisivel() ? some(f) : null;
            if (!mestre && pelaVista) return vista(f);
            Map<String, Object> ev = evento("elemento", f.m().getSeq());
            ev.put("mapa", f.m().getId());
            ev.put("el", elJson(f.e(), f.m(), mestre, u));
            if (!f.trilha().isEmpty()) ev.put("via", f.trilha().stream().map(q -> List.of(q[0], q[1])).toList());
            return ev;
        });
    }

    /** a mudanca so chega ao jogador pela vista: nevoa ligada, ou parede e area (que nunca saem para ele) */
    private boolean pelaVista(Feito f) {
        return sempreVisivel(f.e().getTipo()) || !MapaNevoa.NENHUM.equals(ler(f.m().getRegras()).path("fog").asString(MapaNevoa.NENHUM));
    }

    private static Map<String, Object> vista(Feito f) {
        Map<String, Object> ev = evento("vista", f.m().getSeq());
        ev.put("mapa", f.m().getId());
        return ev;
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
    private Map<String, Object> elCru(MapaElemento e) {
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

    private Map<String, Object> elJson(MapaElemento e, Mapa m, boolean mestre, long uid) {
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
