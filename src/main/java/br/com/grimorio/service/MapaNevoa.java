package br.com.grimorio.service;

import br.com.grimorio.model.MapaElemento;
import tools.jackson.databind.JsonNode;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.Shape;
import java.awt.geom.Ellipse2D;
import java.awt.geom.Path2D;
import java.awt.geom.Rectangle2D;
import java.awt.image.BufferedImage;
import java.awt.image.DataBufferByte;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.BitSet;
import java.util.Base64;
import java.util.List;

import javax.imageio.ImageIO;

/**
 * O que um jogador enxerga de um mapa com nevoa, calculado no servidor (a decisao 1 do plano: a nevoa
 * e seguranca, nao enfeite). O mapa e dividido numa grade de casas pequenas (no maximo 512 de lado) e
 * cada casa fica coberta, lembrada (ja vista, com a memoria ligada) ou a vista. E dessa grade que sai o
 * pedaco da imagem que o jogador recebe (MapaTiles), quais tokens e desenhos chegam a ele e a mascara
 * que a tela dele borra para desenhar a nevoa.
 *
 * As regras sao as da tela do mestre (js/mapa-visao.js): as areas valem na ordem da lista (a mais nova
 * manda), a visao dos tokens do jogador abre por cima de tudo, parede e porta fechada barram a visao e
 * janela nao. O poligono de visao e o mesmo (um raio a cada 5 graus e tres para cada ponta de parede).
 */
final class MapaNevoa {

    static final int MAX_CASAS = 512;
    static final byte COBERTO = 0;
    static final byte LEMBRADO = 1;
    static final byte A_VISTA = 2;
    static final String NENHUM = "nenhum";
    static final String VISAO = "visao";
    private static final String K_PTS = "pts";

    private MapaNevoa() { /* so funcoes estaticas */ }

    /** um elemento ja lido do banco: o tipo, de quem e, se esta visivel e os dados */
    record El(MapaElemento.Tipo tipo, long dono, boolean visivel, JsonNode d) { }

    /** a grade de casas do corte: {@code cel} pixels do mapa por casa */
    record Grade(int cel, int cols, int lins) {
        static Grade de(int largura, int altura) {
            int w = Math.max(1, largura);
            int h = Math.max(1, altura);
            int cel = Math.max(4, (int) Math.ceil(Math.max(w, h) / (double) MAX_CASAS));
            return new Grade(cel, (w + cel - 1) / cel, (h + cel - 1) / cel);
        }

        int casas() { return cols * lins; }

        int col(double x) { return Math.clamp((long) Math.floor(x / cel), 0, cols - 1); }

        int lin(double y) { return Math.clamp((long) Math.floor(y / cel), 0, lins - 1); }
    }

    /** o que vale para o calculo: o modo da nevoa, a memoria, o tamanho da casa da grade do jogo e o alcance padrao */
    record Regras(String modo, boolean memoria, double lado, double visaoPadrao) { }

    /** o estado de cada casa (COBERTO, LEMBRADO ou A_VISTA), linha por linha */
    record Estados(Grade g, byte[] v) {
        @Override
        public boolean equals(Object o) {
            return o instanceof Estados(Grade og, byte[] ov) && g.equals(og) && Arrays.equals(v, ov);
        }

        @Override
        public int hashCode() { return 31 * g.hashCode() + Arrays.hashCode(v); }

        @Override
        public String toString() { return "Estados[" + g + ", " + v.length + " casas]"; }

        byte em(double x, double y) {
            if (x < 0 || y < 0 || x >= (double) g.cols() * g.cel() || y >= (double) g.lins() * g.cel()) return COBERTO;
            return v[g.lin(y) * g.cols() + g.col(x)];
        }

        /** alguma casa do retangulo (em pixels do mapa) esta pelo menos no estado pedido */
        boolean algum(double x0, double y0, double x1, double y1, byte minimo) {
            int c0 = g.col(Math.min(x0, x1));
            int c1 = g.col(Math.max(x0, x1));
            int l0 = g.lin(Math.min(y0, y1));
            int l1 = g.lin(Math.max(y0, y1));
            for (int l = l0; l <= l1; l++) {
                for (int c = c0; c <= c1; c++) {
                    if (v[l * g.cols() + c] >= minimo) return true;
                }
            }
            return false;
        }
    }

    /**
     * Calcula as casas para o jogador {@code uid}. {@code explorado} (pode ser nulo) e a memoria dele: com a
     * memoria ligada, recebe o que ele ve agora. Devolve tambem se a memoria mudou, para quem chama gravar.
     */
    static Estados calcula(Regras rg, Grade g, List<El> els, long uid, BitSet explorado, boolean[] mudou) {
        byte[] v = new byte[g.casas()];
        if (NENHUM.equals(rg.modo())) {
            Arrays.fill(v, A_VISTA);
            return new Estados(g, v);
        }
        byte[] manual = pinta(g, els, false, rg, uid);
        byte[] visao = VISAO.equals(rg.modo()) ? pinta(g, els, true, rg, uid) : null;
        boolean lembra = rg.memoria() && visao != null && explorado != null;
        for (int i = 0; i < v.length; i++) {
            boolean ve = manual[i] != 0 || (visao != null && visao[i] != 0);
            if (lembra && visao[i] != 0 && !explorado.get(i)) {
                explorado.set(i);
                mudou[0] = true;
            }
            if (ve) v[i] = A_VISTA;
            else if (lembra && explorado.get(i)) v[i] = LEMBRADO;
        }
        return new Estados(g, v);
    }

    /** As areas de nevoa (na ordem da lista) ou a visao dos tokens do jogador, pintadas na grade. */
    private static byte[] pinta(Grade g, List<El> els, boolean visao, Regras rg, long uid) {
        BufferedImage img = new BufferedImage(g.cols(), g.lins(), BufferedImage.TYPE_BYTE_GRAY);
        Graphics2D gr = img.createGraphics();
        try {
            gr.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_OFF);
            gr.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, RenderingHints.VALUE_STROKE_PURE);
            gr.scale(1.0 / g.cel(), 1.0 / g.cel());
            if (visao) pintaVisao(gr, els, rg.lado(), rg.visaoPadrao(), uid);
            else pintaAreas(gr, els);
        } finally {
            gr.dispose();
        }
        return ((DataBufferByte) img.getRaster().getDataBuffer()).getData();
    }

    private static void pintaAreas(Graphics2D gr, List<El> els) {
        for (El e : els) {
            if (e.tipo() != MapaElemento.Tipo.FOG) continue;
            JsonNode d = e.d();
            gr.setColor(d.path("revela").asBoolean(true) ? Color.WHITE : Color.BLACK);
            String forma = d.path("forma").asString("");
            if ("traco".equals(forma)) pintaTraco(gr, d);
            else {
                Shape s = forma(forma, d.path(K_PTS));
                if (s != null) gr.fill(s);
            }
        }
    }

    private static Shape forma(String forma, JsonNode p) {
        if (p.size() < 2) return null;
        double x0 = p.get(0).get(0).asDouble();
        double y0 = p.get(0).get(1).asDouble();
        double x1 = p.get(1).get(0).asDouble();
        double y1 = p.get(1).get(1).asDouble();
        return switch (forma) {
            case "retangulo" -> new Rectangle2D.Double(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
            case "circulo" -> {
                double r = Math.hypot(x1 - x0, y1 - y0);
                yield new Ellipse2D.Double(x0 - r, y0 - r, 2 * r, 2 * r);
            }
            default -> caminho(pontos(p), true);
        };
    }

    /** a pincelada: redonda e uma linha grossa; quadrada e losango, o casco da ponta nos dois extremos de cada trecho */
    private static void pintaTraco(Graphics2D gr, JsonNode d) {
        List<double[]> p = pontos(d.path(K_PTS));
        if (p.isEmpty()) return;
        double larg = d.path("larg").asDouble(70);
        String ponta = d.path("ponta").asString("redondo");
        if ("quadrado".equals(ponta) || "losango".equals(ponta)) {
            double r = larg / 2;
            double[][] base = "losango".equals(ponta) ? new double[][]{{r, 0}, {0, r}, {-r, 0}, {0, -r}}
                    : new double[][]{{r, r}, {-r, r}, {-r, -r}, {r, -r}};
            for (int i = 0; i < Math.max(1, p.size() - 1); i++) {
                double[] a = p.get(i);
                double[] b = p.get(Math.min(i + 1, p.size() - 1));
                List<double[]> c = new ArrayList<>();
                for (double[] q : base) {
                    c.add(new double[]{a[0] + q[0], a[1] + q[1]});
                    c.add(new double[]{b[0] + q[0], b[1] + q[1]});
                }
                gr.fill(caminho(casco(c), true));
            }
            return;
        }
        gr.setStroke(new BasicStroke((float) larg, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        Path2D.Double l = new Path2D.Double();
        l.moveTo(p.getFirst()[0], p.getFirst()[1]);
        if (p.size() == 1) l.lineTo(p.getFirst()[0] + 0.01, p.getFirst()[1]);
        for (int i = 1; i < p.size(); i++) l.lineTo(p.get(i)[0], p.get(i)[1]);
        gr.draw(l);
    }

    private static void pintaVisao(Graphics2D gr, List<El> els, double lado, double visaoPadrao, long uid) {
        List<double[]> trechos = trechosDeVisao(els);
        gr.setColor(Color.WHITE);
        for (El e : els) {
            double casas = fonteDeVisao(e, uid) ? alcance(e.d(), visaoPadrao) : 0;
            if (casas > 0) {
                List<double[]> pts = poligonoVisao(e.d().path("x").asDouble(0), e.d().path("y").asDouble(0), casas * lado, trechos);
                if (pts.size() >= 3) gr.fill(caminho(pts, true));
            }
        }
    }

    /** quem enxerga pelo jogador: os tokens dele que estao no mapa (o escondido pelo mestre nao) */
    private static boolean fonteDeVisao(El e, long uid) {
        return e.tipo() == MapaElemento.Tipo.TOKEN && e.visivel() && e.dono() == uid;
    }

    /** o alcance em casas: o do token, senao o da ficha de onde ele veio, senao o padrao do mapa */
    static double alcance(JsonNode d, double visaoPadrao) {
        JsonNode v = d.get(d.hasNonNull(VISAO) ? VISAO : MapaRegras.K_VISAO_FICHA);
        return v != null && v.isNumber() ? v.asDouble() : visaoPadrao;
    }

    /** os trechos que barram a visao: parede e porta fechada (a janela deixa ver) */
    static List<double[]> trechosDeVisao(List<El> els) {
        List<double[]> out = new ArrayList<>();
        for (El e : els) {
            if (barraVisao(e)) {
                List<double[]> p = pontos(e.d().path(K_PTS));
                for (int i = 1; i < p.size(); i++) out.add(new double[]{p.get(i - 1)[0], p.get(i - 1)[1], p.get(i)[0], p.get(i)[1]});
            }
        }
        return out;
    }

    private static boolean barraVisao(El e) {
        if (e.tipo() != MapaElemento.Tipo.PAREDE) return false;
        String k = e.d().path("kind").asString("parede");
        return !"janela".equals(k) && !("porta".equals(k) && e.d().path("aberta").asBoolean(false));
    }

    /** Poligono do que se ve a partir de (cx, cy): cada raio para na primeira parede ou no alcance. */
    static List<double[]> poligonoVisao(double cx, double cy, double r, List<double[]> trechos) {
        List<double[]> perto = new ArrayList<>();
        for (double[] s : trechos) {
            if (Math.max(s[0], s[2]) >= cx - r && Math.min(s[0], s[2]) <= cx + r
                    && Math.max(s[1], s[3]) >= cy - r && Math.min(s[1], s[3]) <= cy + r) perto.add(s);
        }
        List<Double> angs = new ArrayList<>();
        for (int i = 0; i < 72; i++) angs.add(-Math.PI + i * Math.PI / 36);
        for (double[] s : perto) {
            for (int k = 0; k < 4; k += 2) {
                double a = Math.atan2(s[k + 1] - cy, s[k] - cx);
                angs.add(a - 0.0001);
                angs.add(a);
                angs.add(a + 0.0001);
            }
        }
        angs.sort(null);
        List<double[]> pts = new ArrayList<>(angs.size());
        for (double a : angs) {
            double dx = Math.cos(a);
            double dy = Math.sin(a);
            double t = r;
            for (double[] s : perto) t = Math.min(t, batida(cx, cy, dx, dy, s));
            pts.add(new double[]{cx + dx * t, cy + dy * t});
        }
        return pts;
    }

    /** onde o raio de (cx, cy) na direcao (dx, dy) bate no trecho; infinito se nao bate */
    private static double batida(double cx, double cy, double dx, double dy, double[] s) {
        double sx = s[2] - s[0];
        double sy = s[3] - s[1];
        double den = dx * sy - dy * sx;
        if (Math.abs(den) < 1e-12) return Double.POSITIVE_INFINITY;
        double qx = s[0] - cx;
        double qy = s[1] - cy;
        double tt = (qx * sy - qy * sx) / den;
        double u = (qx * dy - qy * dx) / den;
        return tt >= 0 && u >= 0 && u <= 1 ? tt : Double.POSITIVE_INFINITY;
    }

    static List<double[]> pontos(JsonNode p) {
        List<double[]> out = new ArrayList<>();
        for (JsonNode q : p) {
            if (q.size() >= 2) out.add(new double[]{q.get(0).asDouble(), q.get(1).asDouble()});
        }
        return out;
    }

    private static Path2D.Double caminho(List<double[]> pts, boolean fecha) {
        Path2D.Double c = new Path2D.Double();
        for (int i = 0; i < pts.size(); i++) {
            if (i == 0) c.moveTo(pts.get(i)[0], pts.get(i)[1]); else c.lineTo(pts.get(i)[0], pts.get(i)[1]);
        }
        if (fecha) c.closePath();
        return c;
    }

    private static List<double[]> casco(List<double[]> pts) {
        List<double[]> p = new ArrayList<>(pts);
        p.sort((a, b) -> a[0] == b[0] ? Double.compare(a[1], b[1]) : Double.compare(a[0], b[0]));
        List<double[]> baixo = new ArrayList<>();
        List<double[]> alto = new ArrayList<>();
        for (double[] q : p) {
            while (baixo.size() > 1 && cruz(baixo.get(baixo.size() - 2), baixo.getLast(), q) <= 0) baixo.removeLast();
            baixo.add(q);
        }
        for (int i = p.size() - 1; i >= 0; i--) {
            while (alto.size() > 1 && cruz(alto.get(alto.size() - 2), alto.getLast(), p.get(i)) <= 0) alto.removeLast();
            alto.add(p.get(i));
        }
        baixo.removeLast();
        alto.removeLast();
        baixo.addAll(alto);
        return baixo;
    }

    private static double cruz(double[] o, double[] a, double[] b) {
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    }

    /**
     * A mascara que a tela do jogador borra para desenhar a nevoa: uma imagem do tamanho da grade, branca,
     * opaca onde ele ve, 60% onde so lembra e transparente no resto. Em data URL, para vir junto do estado.
     */
    static String mascaraPng(Estados e) {
        Grade g = e.g();
        BufferedImage img = new BufferedImage(g.cols(), g.lins(), BufferedImage.TYPE_INT_ARGB);
        int[] px = new int[g.casas()];
        for (int i = 0; i < px.length; i++) {
            int a = switch (e.v()[i]) { case A_VISTA -> 255; case LEMBRADO -> 153; default -> 0; };
            px[i] = (a << 24) | 0xFFFFFF;
        }
        img.setRGB(0, 0, g.cols(), g.lins(), px, 0, g.cols());
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            ImageIO.write(img, "png", out);
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
        return "data:image/png;base64," + Base64.getEncoder().encodeToString(out.toByteArray());
    }
}
