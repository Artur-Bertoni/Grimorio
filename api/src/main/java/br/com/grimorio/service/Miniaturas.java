package br.com.grimorio.service;

import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Iterator;
import java.util.Optional;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Versoes reduzidas de imagem de campanha. A miniatura (ate 512px) e o que a tela usa em lista,
 * cartao e galeria; a de mapa (ate 4096px) e o que o tabletop desenha, no lugar de um original
 * que pode ter dezenas de megapixels. Nascem na primeira vez que alguem pede ({@code ?mini=1},
 * {@code ?mapa=1}) e ficam em {@code img/.mini/} e {@code img/.mapa/}, ao lado do original e nunca
 * por cima dele (o original pode ser um hard link compartilhado com outra campanha). As pastas
 * comecam com ponto para o reescanear do volume e o pacote, que so olham arquivos de {@code img/},
 * nao as verem.
 */
public final class Miniaturas {

    private static final Logger log = LoggerFactory.getLogger(Miniaturas.class);
    public static final int LADO = 512;
    public static final int LADO_MAPA = 4096;
    private static final String PASTA = ".mini";
    private static final String PASTA_MAPA = ".mapa";

    private Miniaturas() { /* so funcoes estaticas */ }

    /** Caminho da versao reduzida da imagem {@code img/{relImg}} da campanha. */
    private static Path destino(Path raizCampanha, String relImg, String pasta, boolean comTransparencia) {
        Path img = raizCampanha.resolve("img");
        Path d = img.resolve(pasta).resolve(relImg + (comTransparencia ? ".png" : ".jpg")).normalize();
        if (!d.startsWith(img.resolve(pasta))) throw new IllegalArgumentException("imagem fora da campanha");
        return d;
    }

    /**
     * Devolve a miniatura, criando ou refazendo se a imagem mudou depois dela ({@code versao}, em
     * milissegundos). O original so e pedido se for preciso refazer. Vazio quando nao vale a pena
     * (imagem ja pequena) ou quando o formato nao e legivel: quem chama serve o original.
     */
    public static Optional<Path> obter(Path raizCampanha, String relImg, long versao,
                                       ArmazenamentoMidia.ComOriginal original) throws IOException {
        return obter(raizCampanha, relImg, versao, original, LADO, PASTA);
    }

    /** A versao de ate 4096px que o tabletop desenha. Mesmas regras da miniatura. */
    public static Optional<Path> obterMapa(Path raizCampanha, String relImg, long versao,
                                           ArmazenamentoMidia.ComOriginal original) throws IOException {
        return obter(raizCampanha, relImg, versao, original, LADO_MAPA, PASTA_MAPA);
    }

    private static Optional<Path> obter(Path raizCampanha, String relImg, long versao,
                                        ArmazenamentoMidia.ComOriginal original, int lado, String pasta) throws IOException {
        for (boolean alfa : new boolean[] { false, true }) {
            Path d = destino(raizCampanha, relImg, pasta, alfa);
            if (Files.isRegularFile(d) && Files.getLastModifiedTime(d).toMillis() >= versao) return Optional.of(d);
        }
        BufferedImage src;
        try {
            src = lerReduzido(original.obter(), lado);
        } catch (IOException | RuntimeException e) {
            log.warn("Imagem reduzida: nao consegui ler {}: {}", relImg, e.getMessage());
            return Optional.empty();
        }
        if (src == null) return Optional.empty();
        boolean alfa = src.getColorModel().hasAlpha();
        Path d = destino(raizCampanha, relImg, pasta, alfa);
        Files.createDirectories(d.getParent());
        Path tmp = Files.createTempFile(d.getParent(), "mini", ".tmp");
        try {
            BufferedImage peq = reduz(src, alfa, lado);
            if (alfa) ImageIO.write(peq, "png", tmp.toFile());
            else gravaJpeg(peq, tmp);
            Files.move(tmp, d, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } finally {
            Files.deleteIfExists(tmp);
        }
        return Optional.of(d);
    }

    /**
     * Le a imagem ja subamostrada para perto do tamanho final. Decodificar inteiro um mapa de
     * 10000x10000 pediria 400 MB de heap (a JVM roda com 512); pulando pixels na leitura, o que
     * fica na memoria e da ordem do resultado. Nulo quando a imagem ja cabe no lado pedido.
     */
    private static BufferedImage lerReduzido(Path original, int lado) throws IOException {
        try (ImageInputStream in = ImageIO.createImageInputStream(original.toFile())) {
            ImageReader r = leitor(in);
            if (r == null) return null;
            try {
                r.setInput(in, true, true);
                int w = r.getWidth(0);
                int h = r.getHeight(0);
                if (Math.max(w, h) <= lado) return null;
                ImageReadParam p = r.getDefaultReadParam();
                int passo = Math.max(1, Math.max(w, h) / lado);
                if (passo > 1) p.setSourceSubsampling(passo, passo, 0, 0);
                return r.read(0, p);
            } finally {
                r.dispose();
            }
        }
    }

    private static ImageReader leitor(ImageInputStream in) {
        if (in == null) return null;
        Iterator<ImageReader> it = ImageIO.getImageReaders(in);
        return it.hasNext() ? it.next() : null;
    }

    /** Largura e altura do original, lidas do cabecalho, sem decodificar a imagem. Vazio se ilegivel. */
    public static Optional<int[]> dimensoes(Path original) {
        try (ImageInputStream in = ImageIO.createImageInputStream(original.toFile())) {
            ImageReader r = leitor(in);
            if (r == null) return Optional.empty();
            try {
                r.setInput(in, true, true);
                return Optional.of(new int[] { r.getWidth(0), r.getHeight(0) });
            } finally {
                r.dispose();
            }
        } catch (IOException | RuntimeException e) {
            log.warn("Nao consegui ler o tamanho de {}: {}", original.getFileName(), e.getMessage());
            return Optional.empty();
        }
    }

    /** Tira as versoes reduzidas de {@code img/{relImg}}. Falha aqui nao impede a remocao. */
    public static void apagar(Path raizCampanha, String relImg) {
        for (String pasta : new String[] { PASTA, PASTA_MAPA }) {
            for (boolean alfa : new boolean[] { false, true }) {
                try {
                    Files.deleteIfExists(destino(raizCampanha, relImg, pasta, alfa));
                } catch (IOException | IllegalArgumentException e) {
                    log.debug("Imagem reduzida nao removida de {}: {}", relImg, e.getMessage());
                }
            }
        }
    }

    private static BufferedImage reduz(BufferedImage src, boolean alfa, int lado) {
        double k = Math.min(1.0, (double) lado / Math.max(src.getWidth(), src.getHeight()));
        int w = Math.max(1, (int) Math.round(src.getWidth() * k));
        int h = Math.max(1, (int) Math.round(src.getHeight() * k));
        BufferedImage out = new BufferedImage(w, h, alfa ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.drawImage(src, 0, 0, w, h, null);
        } finally {
            g.dispose();
        }
        return out;
    }

    private static void gravaJpeg(BufferedImage img, Path destino) throws IOException {
        ImageWriter w = ImageIO.getImageWritersByFormatName("jpg").next();
        ImageWriteParam p = w.getDefaultWriteParam();
        p.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
        p.setCompressionQuality(0.82f);
        try (ImageOutputStream out = ImageIO.createImageOutputStream(destino.toFile())) {
            w.setOutput(out);
            w.write(null, new IIOImage(img, null, null), p);
        } finally {
            w.dispose();
        }
    }
}
