package br.com.grimorio.service;

import br.com.grimorio.model.Campanha;
import br.com.grimorio.model.Papel;
import br.com.grimorio.model.Rolagem;
import br.com.grimorio.model.Usuario;
import br.com.grimorio.repo.CampanhaRepo;
import br.com.grimorio.repo.RolagemRepo;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class RolagemService {

    /* um termo da formula: 2d6, d20, 4d6dl1, 2d20kh1, ou um numero solto */
    private static final Pattern TERMO = Pattern.compile(
            "([+-]?)(?:(\\d{0,2})d(\\d{1,4})(?:(kh|kl|dh|dl)(\\d{1,2}))?|(\\d{1,4}))");
    private static final int MAX_TERMOS = 8, MAX_DADOS = 100;
    /* o id e global, entao a janela e larga: na pratica sobram as ultimas centenas da campanha */
    private static final long GUARDA = 2000;

    private final RolagemRepo rolagens;
    private final CampanhaRepo campanhas;
    private final CampanhaService camp;
    private final SecureRandom sorte = new SecureRandom();

    public RolagemService(RolagemRepo rolagens, CampanhaRepo campanhas, CampanhaService camp) {
        this.rolagens = rolagens;
        this.campanhas = campanhas;
        this.camp = camp;
    }

    /** O resultado de uma formula, ja sorteado. */
    public record Resultado(String formula, String detalhe, int total, int lados, int extremo) { }

    /** Le e sorteia. Formula ruim vira IllegalArgumentException com a razao. */
    public Resultado sortear(String bruta) {
        /* "2d6 3" sem o espaco viraria 2d63: numero colado em numero e sempre falta de sinal */
        if (bruta != null && bruta.matches(".*\\d\\s+\\d.*")) throw new IllegalArgumentException("falta + ou - entre as partes");
        String f = bruta == null ? "" : bruta.toLowerCase(Locale.ROOT).replaceAll("\\s+", "");
        if (f.isEmpty()) throw new IllegalArgumentException("escreva a rolagem, por exemplo 2d6+3");
        if (f.length() > 60) throw new IllegalArgumentException("rolagem comprida demais");
        Matcher m = TERMO.matcher(f);
        StringBuilder norma = new StringBuilder(), det = new StringBuilder();
        int pos = 0, termos = 0, dadosTotal = 0, total = 0, tipos = 0, lados = 0;
        boolean todosMax = true, todosUm = true, teveDado = false;
        while (pos < f.length()) {
            m.region(pos, f.length());
            if (!m.lookingAt() || m.end() == pos) throw new IllegalArgumentException("nao entendi a rolagem perto de \"" + f.substring(pos) + "\"");
            if (pos > 0 && m.group(1).isEmpty()) throw new IllegalArgumentException("falta + ou - entre as partes");
            if (++termos > MAX_TERMOS) throw new IllegalArgumentException("partes demais numa rolagem so");
            int sinal = "-".equals(m.group(1)) ? -1 : 1;
            String op = pos == 0 ? (sinal < 0 ? "-" : "") : (sinal < 0 ? " - " : " + ");
            String opN = pos == 0 ? (sinal < 0 ? "-" : "") : (sinal < 0 ? "-" : "+");
            if (m.group(6) != null) {
                int n = Integer.parseInt(m.group(6));
                total += sinal * n;
                norma.append(opN).append(n);
                det.append(op).append(n);
            } else {
                int qtd = m.group(2).isEmpty() ? 1 : Integer.parseInt(m.group(2));
                int l = Integer.parseInt(m.group(3));
                if (qtd < 1 || qtd > 50) throw new IllegalArgumentException("de 1 a 50 dados por parte");
                if (l < 2 || l > 1000) throw new IllegalArgumentException("dado de 2 a 1000 lados");
                if ((dadosTotal += qtd) > MAX_DADOS) throw new IllegalArgumentException("dados demais numa rolagem so");
                int[] v = new int[qtd];
                for (int i = 0; i < qtd; i++) v[i] = 1 + sorte.nextInt(l);
                boolean[] fora = new boolean[qtd];
                String mod = m.group(4);
                if (mod != null) {
                    int k = Integer.parseInt(m.group(5));
                    if (k < 1 || k >= qtd && mod.startsWith("d") || k > qtd)
                        throw new IllegalArgumentException("nao da para manter ou descartar " + k + " de " + qtd);
                    /* kh/kl dizem quantos ficam; dh/dl, quantos saem. Tudo vira "tirar N dos menores/maiores". */
                    int tirar = mod.startsWith("k") ? qtd - k : k;
                    boolean tiraMenores = mod.equals("kh") || mod.equals("dl");
                    Integer[] ordem = new Integer[qtd];
                    for (int i = 0; i < qtd; i++) ordem[i] = i;
                    Arrays.sort(ordem, (a, b) -> tiraMenores ? v[a] - v[b] : v[b] - v[a]);
                    for (int i = 0; i < tirar; i++) fora[ordem[i]] = true;
                }
                int soma = 0;
                StringBuilder lista = new StringBuilder("[");
                for (int i = 0; i < qtd; i++) {
                    if (i > 0) lista.append(", ");
                    if (fora[i]) { lista.append('(').append(v[i]).append(')'); continue; }
                    lista.append(v[i]);
                    soma += v[i];
                    if (v[i] != l) todosMax = false;
                    if (v[i] != 1) todosUm = false;
                }
                lista.append(']');
                total += sinal * soma;
                teveDado = true;
                if (lados != l) { tipos++; lados = l; }
                norma.append(opN).append(qtd).append('d').append(l);
                if (mod != null) norma.append(mod).append(m.group(5));
                det.append(op).append(lista);
            }
            pos = m.end();
        }
        if (!teveDado) throw new IllegalArgumentException("a rolagem precisa de pelo menos um dado, como d20");
        int extremo = todosMax ? 1 : todosUm ? -1 : 0;
        return new Resultado(norma.toString(), det.toString(), total, tipos == 1 ? lados : 0, extremo);
    }

    /** Quem ve: do jogador, a regra da mesa decide; do mestre, ele escolhe na hora de rolar. */
    @Transactional
    public Map<String, Object> rolar(Long cid, Usuario u, String formula, Boolean publicaPedida,
                                     String rotulo, Long pedidoId) {
        Papel papel = camp.exigeMembro(cid, u.getId());
        Resultado res = sortear(formula);
        Campanha c = campanhas.findById(cid).orElseThrow();
        boolean mestre = papel == Papel.MESTRE;
        Rolagem r = nova(cid, u, mestre);
        r.setFormula(res.formula());
        r.setDetalhe(corta(res.detalhe(), 400));
        r.setValor(res.total());
        r.setLados(res.lados());
        r.setExtremo(res.extremo());
        r.setRotulo(corta(rotulo == null ? "" : rotulo.trim(), 80));
        r.setPublica(mestre ? !Boolean.FALSE.equals(publicaPedida) : c.isRolagensAbertas());
        if (pedidoId != null && rolagens.findById(pedidoId)
                .filter(p -> p.isPedido() && Objects.equals(p.getCampanhaId(), cid)).isPresent())
            r.setPedidoId(pedidoId);
        rolagens.save(r);
        if (r.getId() > GUARDA) rolagens.apagarAntigas(cid, r.getId() - GUARDA);
        return mapa(r, u.getId());
    }

    /** O mestre pede um teste: aparece para a mesa toda, e cada um rola o seu. */
    @Transactional
    public Map<String, Object> pedir(Long cid, Usuario u, String formula, String rotulo) {
        camp.exigeMestre(cid, u.getId());
        /* sorteia so para validar e normalizar: o pedido em si nao tem resultado */
        Resultado res = sortear(formula);
        Rolagem r = nova(cid, u, true);
        r.setFormula(res.formula());
        r.setRotulo(corta(rotulo == null ? "" : rotulo.trim(), 80));
        r.setLados(res.lados());
        r.setPedido(true);
        r.setPublica(true);
        rolagens.save(r);
        return mapa(r, u.getId());
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> recentes(Long cid, Long uid, Long desde) {
        boolean mestre = camp.exigeMembro(cid, uid) == Papel.MESTRE;
        List<Map<String, Object>> out = new ArrayList<>();
        for (Rolagem r : rolagens.findTop60ByCampanhaIdAndIdGreaterThanOrderByIdDesc(cid, desde == null ? 0L : desde)) {
            /* o corte e aqui, nao na tela: rolagem fechada de outra pessoa nem sai do servidor */
            if (!mestre && !r.isPublica() && !Objects.equals(r.getUsuarioId(), uid)) continue;
            out.add(mapa(r, uid));
        }
        return out;
    }

    private Rolagem nova(Long cid, Usuario u, boolean mestre) {
        Rolagem r = new Rolagem();
        r.setCampanhaId(cid);
        r.setUsuarioId(u.getId());
        r.setAutorNome(u.getNome());
        r.setMestre(mestre);
        return r;
    }

    private static String corta(String s, int n) { return s.length() > n ? s.substring(0, n) : s; }

    private static Map<String, Object> mapa(Rolagem r, Long uid) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.getId());
        m.put("autor", r.getAutorNome());
        m.put("minha", Objects.equals(r.getUsuarioId(), uid));
        m.put("mestre", r.isMestre());
        m.put("formula", r.getFormula());
        m.put("detalhe", r.getDetalhe());
        m.put("rotulo", r.getRotulo());
        m.put("lados", r.getLados());
        m.put("valor", r.getValor());
        m.put("extremo", r.getExtremo());
        m.put("publica", r.isPublica());
        m.put("pedido", r.isPedido());
        m.put("pedidoId", r.getPedidoId());
        m.put("em", r.getCriadoEm().toEpochMilli());
        return m;
    }
}
