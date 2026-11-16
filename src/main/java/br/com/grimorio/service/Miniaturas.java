package br.com.grimorio.service;

import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Optional;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Miniatura de imagem de campanha: a versao de ate 512px que a tela usa em lista, cartao e
 * galeria, no lugar da foto original de varios megas. Nasce na primeira vez que alguem pede
 * ({@code ?mini=1}) e fica em {@code img/.mini/}, ao lado do original e nunca por cima dele
 * (o original pode ser um hard link compartilhado com outra campanha). A pasta comeca com ponto
 * para o reescanear do volume e o pacote, que so olham arquivos de {@code img/}, nao a verem.
 */
public final class Miniaturas {

    private static final Logger log = LoggerFactory.getLogger(Miniaturas.class);
    public static final int LADO = 512;
    private static final String PASTA = ".mini";

    private Miniaturas() { }

    /** Caminho da miniatura do original (que precisa estar dentro de {@code raiz/img}). */
    private static Path destino(Path raizCampanha, Path original, boolean comTransparencia) {
        Path img = raizCampanha.resolve("img");
        String rel = img.relativize(original).toString().replace('\\', '/');
        return img.resolve(PASTA).resolve(rel + (comTransparencia ? ".png" : ".jpg"));
    }

    /**
     * Devolve a miniatura, criando ou refazendo se o original mudou depois dela. Vazio quando
     * nao vale a pena (imagem ja pequena) ou quando o formato nao e legivel: quem chama serve
     * o original.
     */
    public static Optional<Path> obter(Path raizCampanha, Path original) throws IOException {
        for (boolean alfa : new boolean[] { false, true }) {
            Path d = destino(raizCampanha, original, alfa);
            if (Files.isRegularFile(d)
                    && Files.getLastModifiedTime(d).compareTo(Files.getLastModifiedTime(original)) >= 0) {
                return Optional.of(d);
            }
        }
        BufferedImage src;
        try {
            src = ImageIO.read(original.toFile());
        } catch (IOException | RuntimeException e) {
            log.warn("Miniatura: nao consegui ler {}: {}", original.getFileName(), e.getMessage());
            return Optional.empty();
        }
        if (src == null || Math.max(src.getWidth(), src.getHeight()) <= LADO) return Optional.empty();
        boolean alfa = src.getColorModel().hasAlpha();
        Path d = destino(raizCampanha, original, alfa);
        Files.createDirectories(d.getParent());
        Path tmp = Files.createTempFile(d.getParent(), "mini", ".tmp");
        try {
            BufferedImage peq = reduz(src, alfa);
            if (alfa) ImageIO.write(peq, "png", tmp.toFile());
            else gravaJpeg(peq, tmp);
            Files.move(tmp, d, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } finally {
            Files.deleteIfExists(tmp);
        }
        return Optional.of(d);
    }

    /** Tira as miniaturas de um original que saiu do volume. Falha aqui nao impede a remocao. */
    public static void apagar(Path raizCampanha, Path original) {
        for (boolean alfa : new boolean[] { false, true }) {
            try {
                Files.deleteIfExists(destino(raizCampanha, original, alfa));
            } catch (IOException | IllegalArgumentException e) {
                log.debug("Miniatura nao removida de {}: {}", original.getFileName(), e.getMessage());
            }
        }
    }

    private static BufferedImage reduz(BufferedImage src, boolean alfa) {
        double k = (double) LADO / Math.max(src.getWidth(), src.getHeight());
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
