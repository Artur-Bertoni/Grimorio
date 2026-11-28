package br.com.grimorio.service;

import br.com.grimorio.model.Mapa;
import br.com.grimorio.model.MapaElemento;
import br.com.grimorio.repo.MapaElementoRepo;
import br.com.grimorio.repo.MapaRepo;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Os mapas do tabletop dentro do pacote de campanha: o que {@code PacoteService} grava em
 * {@code campanha.json} (campo "mapas") e le de volta. A imagem de cada mapa ja viaja em {@code img/}.
 *
 * Fica de fora, de proposito: o historico e a memoria do explorado (estado de jogo de contas que nao
 * existem na outro servidor) e o que liga o token a uma conta ou a uma ficha (os ids nao valem la).
 * O mapa entra sempre desativado, para o jogador nunca ver um mapa que o mestre ainda nao conferiu.
 */
@Service
public class MapaPacote {

    private static final int MAX_MAPAS = 50;
    private static final int MAX_ELEMENTOS = 3000;
    private static final int MAX_DADOS = 4000;
    private static final int LADO_MIN = 200;
    private static final int LADO_MAX = 16000;
    /* o que so faz sentido no servidor de origem: ficha, conta e o gasto do turno */
    private static final List<String> SO_DA_ORIGEM = List.of("fichaId", "vinculo", "vidaCampo", "visaoFicha", "usado");

    private final MapaRepo mapas;
    private final MapaElementoRepo elementos;
    private final ObjectMapper om = JsonMapper.builder().build();

    public MapaPacote(MapaRepo mapas, MapaElementoRepo elementos) {
        this.mapas = mapas;
        this.elementos = elementos;
    }

    /** os caminhos de img/ que algum mapa usa */
    public Set<String> imagens(Long cid) {
        Set<String> r = new HashSet<>();
        for (Mapa m : mapas.findByCampanhaIdOrderByOrdemAscIdAsc(cid)) if (!m.getImagem().isEmpty()) r.add(m.getImagem());
        return r;
    }

    public ArrayNode exportar(Long cid) {
        ArrayNode lista = om.createArrayNode();
        for (Mapa m : mapas.findByCampanhaIdOrderByOrdemAscIdAsc(cid)) {
            ObjectNode o = lista.addObject();
            o.put("nome", m.getNome());
            o.put("imagem", m.getImagem());
            o.put("largura", m.getLargura());
            o.put("altura", m.getAltura());
            o.set("grid", om.readTree(m.getGrid()));
            o.set("regras", om.readTree(m.getRegras()));
            o.put("cenaId", m.getCenaId());
            ArrayNode els = o.putArray("elementos");
            for (MapaElemento e : elementos.findByMapaIdOrderByOrdemAscIdAsc(m.getId())) {
                ObjectNode x = els.addObject();
                x.put("tipo", e.getTipo().name());
                x.put("camada", e.getCamada());
                x.put("visivel", e.isVisivel());
                x.put("bloqueado", e.isBloqueado());
                x.set("dados", om.readTree(e.getDados()));
            }
        }
        return lista;
    }

    /** Devolve quantos mapas entraram. Mapa com o mesmo nome e a mesma imagem de um que ja existe fica de fora (reimportar nao duplica). */
    public int importar(Long cid, JsonNode lista) {
        if (lista == null || !lista.isArray()) return 0;
        List<Mapa> tem = mapas.findByCampanhaIdOrderByOrdemAscIdAsc(cid);
        Set<String> chaves = new HashSet<>();
        for (Mapa m : tem) chaves.add(m.getNome() + "\n" + m.getImagem());
        int ordem = tem.stream().mapToInt(Mapa::getOrdem).max().orElse(-1) + 1;
        int n = 0;
        for (JsonNode o : lista) {
            if (n >= MAX_MAPAS || !o.isObject()) break;
            Mapa m = mapaDoPacote(cid, o, ordem);
            if (m == null || !chaves.add(m.getNome() + "\n" + m.getImagem())) continue;
            m = mapas.save(m);
            gravaElementos(cid, m, o.path("elementos"));
            ordem++;
            n++;
        }
        return n;
    }

    private Mapa mapaDoPacote(Long cid, JsonNode o, int ordem) {
        String img;
        try {
            img = MapaRegras.caminhoImagem(o.path("imagem").asString(""));
        } catch (IllegalArgumentException _) {
            img = "";
        }
        String nome = o.path("nome").asString("").trim();
        Mapa m = new Mapa();
        m.setCampanhaId(cid);
        m.setNome(nome.isEmpty() ? "Mapa sem nome" : MapaRegras.corta(nome, 120));
        m.setImagem(img);
        m.setLargura(Math.clamp(o.path("largura").asInt(0), LADO_MIN, LADO_MAX));
        m.setAltura(Math.clamp(o.path("altura").asInt(0), LADO_MIN, LADO_MAX));
        m.setGrid(om.writeValueAsString(MapaRegras.grid(mapaDe(o.path("grid")))));
        m.setRegras(om.writeValueAsString(MapaRegras.regras(mapaDe(o.path("regras")))));
        m.setCenaId(MapaRegras.corta(o.path("cenaId").asString("").trim(), 80));
        m.setOrdem(ordem);
        m.setAtivo(false);
        m.setSeq(1);
        return m;
    }

    private void gravaElementos(Long cid, Mapa m, JsonNode lista) {
        if (!lista.isArray()) return;
        int ordem = 0;
        for (JsonNode o : lista) {
            if (ordem >= MAX_ELEMENTOS) break;
            MapaElemento e = elementoDoPacote(cid, m, o, ordem);
            if (e == null) continue;
            elementos.save(e);
            ordem++;
        }
    }

    private MapaElemento elementoDoPacote(Long cid, Mapa m, JsonNode o, int ordem) {
        MapaElemento.Tipo tipo;
        try {
            tipo = MapaElemento.Tipo.valueOf(o.path("tipo").asString(""));
        } catch (IllegalArgumentException _) {
            return null;
        }
        JsonNode d = o.path("dados");
        if (!d.isObject()) return null;
        ObjectNode dados = ((ObjectNode) d).deepCopy();
        dados.remove(SO_DA_ORIGEM);
        if (dados.has("img")) {
            try {
                dados.put("img", MapaRegras.caminhoImagem(dados.path("img").asString("")));
            } catch (IllegalArgumentException _) {
                dados.put("img", "");
            }
        }
        String json = om.writeValueAsString(dados);
        if (json.length() > MAX_DADOS) return null;
        MapaElemento e = new MapaElemento();
        e.setMapaId(m.getId());
        e.setCampanhaId(cid);
        e.setTipo(tipo);
        e.setCamada(MapaRegras.camada(o.path("camada").asString(""), ""));
        e.setDono(0);
        /* parede e area de nevoa sao sempre visiveis (o servidor decide o que o jogador ve) */
        e.setVisivel(tipo == MapaElemento.Tipo.PAREDE || tipo == MapaElemento.Tipo.FOG || o.path("visivel").asBoolean(true));
        e.setBloqueado(o.path("bloqueado").asBoolean(false));
        e.setOrdem(ordem);
        e.setDados(json);
        return e;
    }

    private Map<String, Object> mapaDe(JsonNode n) {
        if (!n.isObject()) return new LinkedHashMap<>();
        return om.convertValue(n, new tools.jackson.core.type.TypeReference<LinkedHashMap<String, Object>>() { });
    }
}
