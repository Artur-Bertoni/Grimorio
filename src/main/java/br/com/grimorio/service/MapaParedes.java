package br.com.grimorio.service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * Geometria das paredes: um trecho de caminho passa livre ou cruza uma parede, e, quando cruza, qual
 * e o menor caminho que a contorna. Cada parede e um segmento {x1, y1, x2, y2}. A tela refaz a mesma
 * conta (js/mapa-formas.js, mpRota) so para mostrar o trajeto: a que vale para o deslocamento e esta.
 */
final class MapaParedes {

    /** Distancia, em px, que o ponto de passagem fica afastado do canto de uma parede: nem encostado, nem do outro lado. */
    private static final double FOLGA = 2.0;
    private static final double EPS = 1e-9;
    /** Mais cantos que isso e a conta fica pesada: valem so os mais perto do trecho. */
    private static final int MAX_CANTOS = 150;
    private static final double[][] DESVIOS = desvios();

    private MapaParedes() { /* so funcoes estaticas */ }

    private static double[][] desvios() {
        double[][] d = new double[4][];
        for (int i = 0; i < 4; i++) {
            double a = Math.toRadians(22.5 + 90 * i);
            d[i] = new double[]{FOLGA * Math.cos(a), FOLGA * Math.sin(a)};
        }
        return d;
    }

    /**
     * O trecho a-b cruza a parede? Encostar na ponta do trecho nao conta quando a ponta e a origem ou o destino
     * do movimento (um token em cima de uma parede consegue sair), mas conta numa ponta de passagem (senao um ponto
     * posto em cima da parede deixaria atravessa-la); um canto de parede no meio do trecho conta.
     */
    static boolean cruza(double[] s, double ax, double ay, double bx, double by, boolean origem, boolean destino) {
        double rx = bx - ax;
        double ry = by - ay;
        double sx = s[2] - s[0];
        double sy = s[3] - s[1];
        double den = rx * sy - ry * sx;
        double qx = s[0] - ax;
        double qy = s[1] - ay;
        double comp = Math.hypot(rx, ry);
        if (comp < EPS) return false;
        if (Math.abs(den) < EPS * comp * Math.max(1, Math.hypot(sx, sy))) {
            /* paralelos: so bloqueia se estiverem na mesma reta e se sobrepuserem */
            if (Math.abs(qx * ry - qy * rx) > 1e-6 * comp) return false;
            double t0 = (qx * rx + qy * ry) / (comp * comp);
            double t1 = ((s[2] - ax) * rx + (s[3] - ay) * ry) / (comp * comp);
            double lo = Math.min(t0, t1);
            double hi = Math.max(t0, t1);
            return Math.min(hi, 1) - Math.max(lo, 0) > 1e-6;
        }
        double t = (qx * sy - qy * sx) / den;
        double u = (qx * ry - qy * rx) / den;
        double et = 1e-6;
        return (origem ? t > et : t >= -et) && (destino ? t < 1 - et : t <= 1 + et) && u >= -et && u <= 1 + et;
    }

    private static boolean livre(List<double[]> paredes, double ax, double ay, double bx, double by, boolean origem, boolean destino) {
        for (double[] s : paredes) {
            if (cruza(s, ax, ay, bx, by, origem, destino)) return false;
        }
        return true;
    }

    /** Todos os trechos da lista de pontos passam livres. */
    static boolean livre(List<double[]> paredes, List<double[]> pts) {
        for (int i = 1; i < pts.size(); i++) {
            if (!livre(paredes, pts.get(i - 1)[0], pts.get(i - 1)[1], pts.get(i)[0], pts.get(i)[1], i == 1, i == pts.size() - 1)) return false;
        }
        return true;
    }

    /**
     * Menor caminho de {@code o} a {@code d} sem cruzar paredes, passando junto aos cantos delas
     * (grafo de visibilidade). Devolve os pontos, de {@code o} a {@code d}, ou null se nao ha como chegar.
     */
    static List<double[]> rota(List<double[]> paredes, double[] o, double[] d) {
        if (livre(paredes, o[0], o[1], d[0], d[1], true, true)) return List.of(o, d);
        List<double[]> nos = new ArrayList<>();
        nos.add(o);
        nos.add(d);
        for (double[] c : cantos(paredes, o, d)) {
            for (double[] k : DESVIOS) nos.add(new double[]{c[0] + k[0], c[1] + k[1]});
        }
        int n = nos.size();
        double[] dist = new double[n];
        int[] antes = new int[n];
        boolean[] fechado = new boolean[n];
        Arrays.fill(dist, Double.POSITIVE_INFINITY);
        Arrays.fill(antes, -1);
        dist[0] = 0;
        for (int passo = 0; passo < n; passo++) {
            int u = -1;
            for (int i = 0; i < n; i++) {
                if (!fechado[i] && (u < 0 || dist[i] < dist[u])) u = i;
            }
            if (u < 0 || dist[u] == Double.POSITIVE_INFINITY) return null;
            if (u == 1) break;
            fechado[u] = true;
            double[] a = nos.get(u);
            for (int v = 0; v < n; v++) {
                if (fechado[v]) continue;
                double[] b = nos.get(v);
                double w = Math.hypot(b[0] - a[0], b[1] - a[1]);
                if (dist[u] + w < dist[v] && livre(paredes, a[0], a[1], b[0], b[1], u == 0, v == 1)) {
                    dist[v] = dist[u] + w;
                    antes[v] = u;
                }
            }
        }
        if (antes[1] < 0) return null;
        List<double[]> out = new ArrayList<>();
        for (int i = 1; i >= 0; i = antes[i]) {
            out.add(nos.get(i));
            if (i == 0) break;
        }
        Collections.reverse(out);
        return out;
    }

    /** Pontas das paredes, sem repetir; passando de {@link #MAX_CANTOS}, so as mais perto do meio do trecho. */
    private static List<double[]> cantos(List<double[]> paredes, double[] o, double[] d) {
        List<double[]> out = new ArrayList<>();
        java.util.Set<String> vistos = new java.util.HashSet<>();
        for (double[] s : paredes) {
            for (int i = 0; i < 4; i += 2) {
                if (vistos.add(s[i] + "," + s[i + 1])) out.add(new double[]{s[i], s[i + 1]});
            }
        }
        if (out.size() > MAX_CANTOS) {
            double mx = (o[0] + d[0]) / 2;
            double my = (o[1] + d[1]) / 2;
            out.sort((p, q) -> Double.compare(Math.hypot(p[0] - mx, p[1] - my), Math.hypot(q[0] - mx, q[1] - my)));
            return new ArrayList<>(out.subList(0, MAX_CANTOS));
        }
        return out;
    }
}
