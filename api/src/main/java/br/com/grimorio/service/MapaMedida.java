package br.com.grimorio.service;

import tools.jackson.databind.JsonNode;

/**
 * Distancia entre dois pontos de um mapa, em casas, pela regra de diagonal do mapa. O cliente tem
 * a mesma conta (mpDistCasas, em mapa-motor.js) para mostrar a regua; esta e a que vale, porque
 * e ela que desconta o deslocamento do turno.
 */
final class MapaMedida {

    private static final double RAIZ3 = Math.sqrt(3);

    private MapaMedida() { /* so funcoes estaticas */ }

    /** {@code grid}: o JSON da grade do mapa (tipo, tam, ox, oy, diagonal). */
    static double casas(JsonNode grid, double x0, double y0, double x1, double y1) {
        String tipo = grid.path("tipo").asString("quadrado");
        double t = Math.max(8, grid.path("tam").asDouble(70));
        String diag = grid.path("diagonal").asString("121");
        if ("hex".equals(tipo)) {
            if ("eu".equals(diag)) return Math.hypot(x1 - x0, y1 - y0) / t;
            return passosHex(grid, t, x0, y0, x1, y1);
        }
        double dx = Math.abs(x1 - x0) / t;
        double dy = Math.abs(y1 - y0) / t;
        if ("nenhum".equals(tipo) || "eu".equals(diag)) return Math.hypot(dx, dy);
        long a = Math.round(dx);
        long b = Math.round(dy);
        long maior = Math.max(a, b);
        long menor = Math.min(a, b);
        return "1".equals(diag) ? maior : maior + menor / 2;
    }

    /** Passos de hexagono para hexagono (de ponta para cima, linhas impares deslocadas meia casa). */
    private static double passosHex(JsonNode grid, double t, double x0, double y0, double x1, double y1) {
        long[] a = hexPerto(grid, t, x0, y0);
        long[] b = hexPerto(grid, t, x1, y1);
        long dq = a[0] - b[0];
        long dr = a[1] - b[1];
        return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2.0;
    }

    /** O hexagono cujo centro esta mais perto do ponto, como coordenada axial {q, r}. */
    private static long[] hexPerto(JsonNode grid, double t, double x, double y) {
        double r = t / RAIZ3;
        double ox = grid.path("ox").asDouble(0);
        double oy = grid.path("oy").asDouble(0);
        long j0 = Math.round((y - oy - r) / (1.5 * r));
        double melhor = Double.MAX_VALUE;
        long[] achado = {0, 0};
        for (long j = j0 - 1; j <= j0 + 1; j++) {
            double desl = Math.floorMod(j, 2L) * t / 2;
            long i0 = Math.round((x - ox - t / 2 - desl) / t);
            for (long i = i0 - 1; i <= i0 + 1; i++) {
                double cx = ox + t / 2 + i * t + desl;
                double cy = oy + r + j * 1.5 * r;
                double d = Math.hypot(x - cx, y - cy);
                if (d < melhor) {
                    melhor = d;
                    achado = new long[]{i - (j - Math.floorMod(j, 2L)) / 2, j};
                }
            }
        }
        return achado;
    }
}
