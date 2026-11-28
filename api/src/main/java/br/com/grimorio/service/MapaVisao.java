package br.com.grimorio.service;

import br.com.grimorio.model.Mapa;
import br.com.grimorio.model.MapaElemento;
import br.com.grimorio.model.MapaExplorado;
import br.com.grimorio.model.Midia;
import br.com.grimorio.repo.MapaExploradoRepo;
import br.com.grimorio.repo.MidiaRepo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.stereotype.Service;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.BitSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * A vista de cada jogador sobre o mapa ativo: o que a nevoa deixa ver (MapaNevoa), a memoria do que ele
 * ja explorou (MapaExplorado) e os pedacos da imagem que ele pode receber (MapaTiles). E calculada uma
 * vez por jogador a cada operacao no mapa (o {@code seq}) e guardada: o estado, a mascara e os pedacos
 * pedidos em seguida usam a mesma. O mestre nao passa por aqui: ele recebe tudo (menos no "ver como os
 * jogadores veem", que a tela dele calcula sozinha).
 */
@Service
public class MapaVisao {

    private static final Logger log = LoggerFactory.getLogger(MapaVisao.class);
    private static final int MAX_GUARDADAS = 400;
    private static final Set<String> MODOS = Set.of(MapaNevoa.NENHUM, "manual", MapaNevoa.VISAO);

    /** um pedaco da imagem pronto para sair, e se o navegador pode guarda-lo (a versao pedida e a de agora) */
    public record Pedaco(ByteArrayResource corpo, String tipo, boolean guarda) { }

    /** O que um jogador ve de um mapa num dado seq. */
    public static final class Vista {
        private final long seq;
        private final String imagem;
        private final String modo;
        private final MapaNevoa.Estados est;
        private final boolean[] mostra;
        private final MapaTiles.Fonte fonte;
        private final String[] versoes;
        private final String png;
        private final boolean paredes;
        private final int largura;

        private Vista(Mapa m, String modo, MapaNevoa.Estados est, MapaTiles.Fonte fonte, boolean paredes) {
            this.seq = m.getSeq();
            this.imagem = m.getImagem();
            this.largura = m.getLargura();
            this.modo = modo;
            this.est = est;
            this.mostra = MapaTiles.mostra(est);
            this.fonte = fonte;
            this.versoes = fonte == null ? new String[0] : MapaTiles.versoes(fonte, m.getLargura(), mostra, est.g());
            this.png = MapaNevoa.NENHUM.equals(modo) ? null : MapaNevoa.mascaraPng(est);
            this.paredes = paredes;
        }

        private boolean valeParaMapa(Mapa m) {
            return seq == m.getSeq() && imagem.equals(m.getImagem()) && largura == m.getLargura();
        }

        /** o ponto esta a vista agora (nao so lembrado): e o que decide se um token chega ao jogador */
        public boolean ve(double x, double y) {
            return MapaNevoa.NENHUM.equals(modo) || est.em(x, y) == MapaNevoa.A_VISTA;
        }

        /** o retangulo tem alguma parte que o jogador ve ou lembra: e o que decide se um desenho chega a ele */
        public boolean toca(double x0, double y0, double x1, double y1) {
            return MapaNevoa.NENHUM.equals(modo) || est.algum(x0, y0, x1, y1, MapaNevoa.LEMBRADO);
        }

        /** o que vai no estado do mapa para o jogador: a mascara da nevoa, os pedacos e se ha paredes (para pedir a rota) */
        public Map<String, Object> json() {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("modo", modo);
            r.put("cel", est.g().cel());
            r.put("cols", est.g().cols());
            r.put("lins", est.g().lins());
            if (png != null) r.put("png", png);
            r.put("paredes", paredes);
            if (fonte != null) {
                Map<String, Object> t = new LinkedHashMap<>();
                t.put("lado", MapaTiles.LADO);
                t.put("w", fonte.w());
                t.put("h", fonte.h());
                t.put("cols", fonte.cols());
                t.put("lins", fonte.lins());
                t.put("v", Arrays.asList(versoes));
                r.put("tiles", t);
            }
            return r;
        }
    }

    private final MapaExploradoRepo explorados;
    private final ArmazenamentoMidia volume;
    private final MidiaRepo midias;
    private final ObjectMapper om = JsonMapper.builder().build();
    private final Map<String, Vista> guardadas = new ConcurrentHashMap<>();
    private final Map<String, Object> travas = new ConcurrentHashMap<>();

    public MapaVisao(MapaExploradoRepo explorados, ArmazenamentoMidia volume, MidiaRepo midias) {
        this.explorados = explorados;
        this.volume = volume;
        this.midias = midias;
    }

    /** A vista do jogador sobre o mapa como ele esta agora. {@code els} so e lido se precisar calcular. */
    public Vista de(Mapa m, Supplier<List<MapaElemento>> els, long uid) {
        String chave = m.getId() + ":" + uid;
        Vista v = guardadas.get(chave);
        if (v != null && v.valeParaMapa(m)) return v;
        synchronized (travas.computeIfAbsent(chave, k -> new Object())) {
            v = guardadas.get(chave);
            if (v != null && v.valeParaMapa(m)) return v;
            v = calcula(m, els.get(), uid);
            if (guardadas.size() > MAX_GUARDADAS) guardadas.clear();
            guardadas.put(chave, v);
            return v;
        }
    }

    /** o mapa vai sair: a memoria de quem explorou sai junto (dentro da transacao de quem apaga) */
    public void apagaMapa(long mid) {
        explorados.deleteByMapaId(mid);
    }

    /** a campanha vai sair: dentro da transacao de ApagaCampanhaService */
    public void apagaCampanha(long cid) {
        explorados.deleteByCampanhaId(cid);
        guardadas.clear();
        travas.clear();
    }

    /** o mapa saiu (ou a campanha): as vistas guardadas dele nao servem mais */
    public void esquece(long mid) {
        String pref = mid + ":";
        guardadas.keySet().removeIf(k -> k.startsWith(pref));
        travas.keySet().removeIf(k -> k.startsWith(pref));
    }

    /**
     * Um pedaco da imagem. O mestre recebe o pedaco inteiro; o jogador, so o que ele ve ou lembra (o resto
     * pintado), e nada quando nao ve nada ali. A versao pedida so serve para o cache: o recorte e sempre o de agora.
     */
    public Pedaco pedaco(Mapa m, Supplier<List<MapaElemento>> els, long uid, boolean mestre, int tx, int ty, String versao) {
        MapaTiles.Fonte f = fonte(m);
        if (f == null || tx < 0 || ty < 0 || tx >= f.cols() || ty >= f.lins()) throw new MapaService.NaoAchado();
        int i = ty * f.cols() + tx;
        if (mestre) return new Pedaco(new ByteArrayResource(f.pedacos()[i]), f.tipo(), true);
        Vista v = de(m, els, uid);
        if (v.fonte == null || i >= v.versoes.length || v.versoes[i].isEmpty()) throw new MapaService.NaoAchado();
        try {
            byte[] b = MapaTiles.recorta(v.fonte, tx, ty, m.getLargura(), v.mostra, v.est.g());
            return new Pedaco(new ByteArrayResource(b), v.fonte.tipo(), v.versoes[i].equals(versao));
        } catch (IOException e) {
            log.warn("Mapa {}: nao consegui recortar o pedaco {},{}: {}", m.getId(), tx, ty, e.getMessage());
            throw new MapaService.NaoAchado();
        }
    }

    private Vista calcula(Mapa m, List<MapaElemento> els, long uid) {
        JsonNode regras = ler(m.getRegras());
        JsonNode grid = ler(m.getGrid());
        String modo = regras.path("fog").asString(MapaNevoa.NENHUM);
        if (!MODOS.contains(modo)) modo = MapaNevoa.NENHUM;
        boolean memoria = MapaNevoa.VISAO.equals(modo) && regras.path(MapaRegras.K_FOG_MEMORIA).asBoolean(false);
        int ver = regras.path(MapaRegras.K_FOG_VER).asInt(0);
        MapaNevoa.Regras rg = new MapaNevoa.Regras(modo, memoria, Math.max(8, grid.path("tam").asDouble(70)),
                regras.path(MapaRegras.K_VISAO_PADRAO).asDouble(MapaRegras.VISAO_PADRAO));
        MapaNevoa.Grade g = MapaNevoa.Grade.de(m.getLargura(), m.getAltura());
        List<MapaNevoa.El> lidos = new ArrayList<>(els.size());
        boolean paredes = false;
        for (MapaElemento e : els) {
            lidos.add(new MapaNevoa.El(e.getTipo(), e.getDono(), e.isVisivel(), ler(e.getDados())));
            paredes = paredes || e.getTipo() == MapaElemento.Tipo.PAREDE;
        }
        BitSet exp = memoria ? explorado(m, uid, ver, g) : null;
        boolean[] mudou = {false};
        MapaNevoa.Estados est = MapaNevoa.calcula(rg, g, lidos, uid, exp, mudou);
        if (exp != null && mudou[0]) grava(m, uid, ver, g, exp);
        return new Vista(m, modo, est, fonte(m), paredes);
    }

    private MapaTiles.Fonte fonte(Mapa m) {
        if (m.getImagem().isEmpty()) return null;
        if (!m.getImagem().startsWith("img/")) return null;
        Midia img = midias.findFirstByCampanhaIdAndArquivo(m.getCampanhaId(), m.getImagem()).orElse(null);
        if (img == null) return null;
        return MapaTiles.fonte(volume.raiz(m.getCampanhaId()), m.getImagem().substring(4),
                img.getEnviadoEm().toEpochMilli(), () -> volume.local(img)).orElse(null);
    }

    /** a memoria gravada, se ainda vale (mesma versao do "esquecer" e mesma grade); senao, em branco */
    private BitSet explorado(Mapa m, long uid, int ver, MapaNevoa.Grade g) {
        return explorados.findFirstByMapaIdAndUsuarioId(m.getId(), uid)
                .filter(x -> x.getVer() == ver && x.getColunas() == g.cols() && x.getLinhas() == g.lins() && !x.getBits().isEmpty())
                .map(x -> {
                    try {
                        return BitSet.valueOf(Base64.getDecoder().decode(x.getBits()));
                    } catch (IllegalArgumentException _) {
                        return new BitSet();
                    }
                })
                .orElseGet(BitSet::new);
    }

    private void grava(Mapa m, long uid, int ver, MapaNevoa.Grade g, BitSet exp) {
        MapaExplorado x = explorados.findFirstByMapaIdAndUsuarioId(m.getId(), uid).orElseGet(MapaExplorado::new);
        x.setMapaId(m.getId());
        x.setCampanhaId(m.getCampanhaId());
        x.setUsuarioId(uid);
        x.setVer(ver);
        x.setColunas(g.cols());
        x.setLinhas(g.lins());
        x.setBits(Base64.getEncoder().encodeToString(exp.toByteArray()));
        x.setAtualizadoEm(Instant.now());
        explorados.save(x);
    }

    private JsonNode ler(String json) {
        try {
            return om.readTree(json == null || json.isBlank() ? "{}" : json);
        } catch (JacksonException _) {
            return om.createObjectNode();
        }
    }
}
