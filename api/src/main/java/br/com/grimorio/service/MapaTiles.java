package br.com.grimorio.service;

import java.awt.AlphaComposite;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.zip.CRC32;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.ImageTypeSpecifier;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * A imagem do mapa em pedacos de 512px (da versao de ate 4096px), para o jogador receber so o que a
 * nevoa deixa ver. O pedaco e cortado uma vez e guardado na memoria (os ultimos mapas abertos); o que
 * vai para o jogador sai dele com as casas cobertas pintadas de preto (ou transparentes, se a imagem
 * tem transparencia), alargadas em uma casa para a borda borrada da tela ainda ter imagem por baixo.
 *
 * Nada disso vai para o volume: um arquivo em {@code img/} seria servido a qualquer membro, e um
 * arquivo fora dele precisaria de limpeza quando o mapa troca de imagem.
 */
final class MapaTiles {

    private static final Logger log = LoggerFactory.getLogger(MapaTiles.class);
    static final int LADO = 512;
    /** os ultimos mapas cortados que ficam na memoria (uns 5 MB cada) */
    private static final int MAX_FONTES = 4;

    /** a imagem cortada: tamanho da versao usada, se tem transparencia e cada pedaco ja codificado */
    record Fonte(String tag, int w, int h, boolean alfa, int cols, int lins, byte[][] pedacos) {
        String tipo() { return alfa ? "image/png" : "image/jpeg"; }

        /* a etiqueta ja diz qual arquivo (e de quando) foi cortado: os pedacos nao precisam entrar na comparacao */
        @Override
        public boolean equals(Object o) { return o instanceof Fonte(String t, _, _, _, _, _, _) && tag.equals(t); }

        @Override
        public int hashCode() { return tag.hashCode(); }

        @Override
        public String toString() { return "Fonte[" + tag + ", " + w + "x" + h + "]"; }
    }

    private static final Map<String, Fonte> FONTES = new LinkedHashMap<>(8, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Fonte> e) { return size() > MAX_FONTES; }
    };

    private MapaTiles() { /* so funcoes estaticas */ }

    /** Os pedacos da imagem do mapa (cortados na primeira vez). Vazio se a imagem nao existe ou nao e legivel. */
    static Optional<Fonte> fonte(Path raizCampanha, Path original) {
        try {
            if (!Files.isRegularFile(original)) return Optional.empty();
            Path src = Miniaturas.obterMapa(raizCampanha, original).orElse(original);
            String chave = src + "@" + Files.getLastModifiedTime(src).toMillis();
            synchronized (FONTES) {
                Fonte f = FONTES.get(chave);
                if (f == null) {
                    f = corta(src, Integer.toHexString(chave.hashCode()));
                    if (f == null) return Optional.empty();
                    FONTES.put(chave, f);
                }
                return Optional.of(f);
            }
        } catch (IOException | RuntimeException e) {
            log.warn("Mapa: nao consegui cortar {}: {}", original.getFileName(), e.getMessage());
            return Optional.empty();
        }
    }

    /** Le a imagem uma faixa de 512 linhas por vez (a de 4096px inteira pediria 64 MB de heap) e codifica cada pedaco. */
    private static Fonte corta(Path src, String tag) throws IOException {
        try (ImageInputStream in = ImageIO.createImageInputStream(src.toFile())) {
            if (in == null) return null;
            Iterator<ImageReader> it = ImageIO.getImageReaders(in);
            if (!it.hasNext()) return null;
            ImageReader r = it.next();
            try {
                r.setInput(in, false, true);
                int w = r.getWidth(0);
                int h = r.getHeight(0);
                ImageTypeSpecifier tipo = r.getRawImageType(0);
                boolean alfa = tipo != null && tipo.getColorModel().hasAlpha();
                int cols = (w + LADO - 1) / LADO;
                int lins = (h + LADO - 1) / LADO;
                byte[][] pedacos = new byte[cols * lins][];
                for (int ty = 0; ty < lins; ty++) {
                    ImageReadParam p = r.getDefaultReadParam();
                    int bh = Math.min(LADO, h - ty * LADO);
                    p.setSourceRegion(new Rectangle(0, ty * LADO, w, bh));
                    BufferedImage faixa = r.read(0, p);
                    if (tipo == null) alfa = alfa || faixa.getColorModel().hasAlpha();
                    /* leitor que ignora a regiao (devolve a imagem inteira): o pedaco sai do lugar certo mesmo assim */
                    int dy = faixa.getHeight() > bh ? -ty * LADO : 0;
                    for (int tx = 0; tx < cols; tx++) {
                        int tw = Math.min(LADO, w - tx * LADO);
                        BufferedImage peq = new BufferedImage(tw, bh, alfa ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
                        Graphics2D g = peq.createGraphics();
                        try {
                            g.drawImage(faixa, -tx * LADO, dy, null);
                        } finally {
                            g.dispose();
                        }
                        pedacos[ty * cols + tx] = codifica(peq, alfa);
                    }
                }
                return new Fonte(tag, w, h, alfa, cols, lins, pedacos);
            } finally {
                r.dispose();
            }
        }
    }

    /** As casas que mostram imagem: as que o jogador ve ou lembra e as vizinhas delas (a borda borrada). */
    static boolean[] mostra(MapaNevoa.Estados e) {
        MapaNevoa.Grade g = e.g();
        boolean[] out = new boolean[g.casas()];
        for (int l = 0; l < g.lins(); l++) {
            for (int c = 0; c < g.cols(); c++) {
                if (e.v()[l * g.cols() + c] == MapaNevoa.COBERTO) continue;
                for (int dl = Math.max(0, l - 1); dl <= Math.min(g.lins() - 1, l + 1); dl++) {
                    for (int dc = Math.max(0, c - 1); dc <= Math.min(g.cols() - 1, c + 1); dc++) out[dl * g.cols() + dc] = true;
                }
            }
        }
        return out;
    }

    /** As casas da grade que um pedaco cobre: {c0, c1, l0, l1}, inclusivo. {@code k}: pixels da versao por pixel do mapa. */
    private static int[] faixaDeCasas(Fonte f, MapaNevoa.Grade g, double k, int tx, int ty) {
        double x0 = tx * LADO / k;
        double y0 = ty * LADO / k;
        double x1 = Math.min(f.w(), (tx + 1) * LADO) / k;
        double y1 = Math.min(f.h(), (ty + 1) * LADO) / k;
        return new int[]{g.col(x0), g.col(Math.max(x0, x1 - 1e-6)), g.lin(y0), g.lin(Math.max(y0, y1 - 1e-6))};
    }

    /**
     * A versao de cada pedaco, para o navegador guardar em cache: vazia quando o jogador nao ve nada ali
     * (o pedaco nem e servido), "f" quando ve tudo e, no meio, um resumo de quais casas ele ve.
     */
    static String[] versoes(Fonte f, int largura, boolean[] mostra, MapaNevoa.Grade g) {
        double k = f.w() / (double) Math.max(1, largura);
        String[] out = new String[f.cols() * f.lins()];
        for (int ty = 0; ty < f.lins(); ty++) {
            for (int tx = 0; tx < f.cols(); tx++) {
                out[ty * f.cols() + tx] = versao(f, faixaDeCasas(f, g, k, tx, ty), mostra, g);
            }
        }
        return out;
    }

    private static String versao(Fonte f, int[] r, boolean[] mostra, MapaNevoa.Grade g) {
        CRC32 crc = new CRC32();
        int vistas = 0;
        int total = 0;
        for (int l = r[2]; l <= r[3]; l++) {
            for (int c = r[0]; c <= r[1]; c++) {
                boolean m = mostra[l * g.cols() + c];
                crc.update(m ? 1 : 0);
                if (m) vistas++;
                total++;
            }
        }
        if (vistas == 0) return "";
        return f.tag() + (vistas == total ? "f" : Long.toHexString(crc.getValue()));
    }

    /** O pedaco como o jogador pode ve-lo: o que esta coberto sai preto (ou transparente). */
    static byte[] recorta(Fonte f, int tx, int ty, int largura, boolean[] mostra, MapaNevoa.Grade g) throws IOException {
        byte[] cru = f.pedacos()[ty * f.cols() + tx];
        double k = f.w() / (double) Math.max(1, largura);
        int[] r = faixaDeCasas(f, g, k, tx, ty);
        if (versao(f, r, mostra, g).endsWith("f")) return cru;
        BufferedImage lido = ImageIO.read(new ByteArrayInputStream(cru));
        BufferedImage out = new BufferedImage(lido.getWidth(), lido.getHeight(), f.alfa() ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
        Graphics2D gr = out.createGraphics();
        try {
            gr.drawImage(lido, 0, 0, null);
            if (f.alfa()) gr.setComposite(AlphaComposite.Clear); else gr.setColor(Color.BLACK);
            double passo = g.cel() * k;
            double[] origem = {tx * (double) LADO, ty * (double) LADO};
            for (int l = r[2]; l <= r[3]; l++) cobreLinha(gr, l, r, mostra, g, passo, origem);
        } finally {
            gr.dispose();
        }
        return codifica(out, f.alfa());
    }

    /** pinta uma linha de casas cobertas, juntando as vizinhas num retangulo so */
    private static void cobreLinha(Graphics2D gr, int l, int[] r, boolean[] mostra, MapaNevoa.Grade g, double passo, double[] origem) {
        double ox = origem[0];
        int y0 = (int) Math.floor(l * passo - origem[1]);
        int y1 = (int) Math.ceil((l + 1) * passo - origem[1]);
        int c = r[0];
        while (c <= r[1]) {
            if (mostra[l * g.cols() + c]) {
                c++;
                continue;
            }
            int ini = c;
            while (c <= r[1] && !mostra[l * g.cols() + c]) c++;
            int x0 = (int) Math.floor(ini * passo - ox);
            int x1 = (int) Math.ceil(c * passo - ox);
            gr.fillRect(x0, y0, x1 - x0, y1 - y0);
        }
    }

    private static byte[] codifica(BufferedImage img, boolean alfa) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        if (alfa) {
            ImageIO.write(img, "png", bos);
            return bos.toByteArray();
        }
        ImageWriter w = ImageIO.getImageWritersByFormatName("jpg").next();
        ImageWriteParam p = w.getDefaultWriteParam();
        p.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
        p.setCompressionQuality(0.82f);
        try (ImageOutputStream out = ImageIO.createImageOutputStream(bos)) {
            w.setOutput(out);
            w.write(null, new IIOImage(img, null, null), p);
        } finally {
            w.dispose();
        }
        return bos.toByteArray();
    }
}
