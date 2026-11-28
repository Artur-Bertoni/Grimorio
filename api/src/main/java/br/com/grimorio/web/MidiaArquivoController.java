package br.com.grimorio.web;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import br.com.grimorio.model.Midia;
import br.com.grimorio.repo.MidiaRepo;
import br.com.grimorio.service.ArmazenamentoMidia;
import br.com.grimorio.service.Miniaturas;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Os arquivos da campanha: {@code /midia/c{id}/{pdf|audio|img}/...}. Quem pode pedir cada um ja foi
 * decidido antes, no filtro (MidiaAutorizacao); aqui so se entrega.
 *
 * <p>O original vem do cofre (o bucket), do cache ou, enquanto nao migrou, do volume. Responde a Range
 * (o pdf.js carrega so as paginas visitadas, o {@code <audio>} pula para o meio) e usa o hash do conteudo
 * como ETag: imagem trocada com o mesmo nome muda de hash, e o navegador pega a nova. Imagem guarda por 5
 * minutos; PDF e audio por um dia. Sempre {@code private}: um proxy no caminho nao pode entregar o arquivo
 * de uma campanha para outra pessoa.
 *
 * <p>Imagem com {@code ?mini=1} sai na miniatura de ate 512px (lista, cartao); com {@code ?mapa=1}, na
 * versao de ate 4096px que o tabletop desenha. As duas ficam no volume e sao refeitas se a imagem mudar.
 */
@RestController
public class MidiaArquivoController {

    private static final Logger log = LoggerFactory.getLogger(MidiaArquivoController.class);
    private static final Pattern FAIXA = Pattern.compile("^bytes=(\\d{0,18})-(\\d{0,18})$");
    private static final Duration PRAZO_IMAGEM = Duration.ofMinutes(5);
    private static final Duration PRAZO_ARQUIVO = Duration.ofDays(1);

    private final ArmazenamentoMidia volume;
    private final MidiaRepo midias;

    public MidiaArquivoController(ArmazenamentoMidia volume, MidiaRepo midias) {
        this.volume = volume;
        this.midias = midias;
    }

    @GetMapping("/midia/c{cid}/**")
    public void servir(@PathVariable long cid, HttpServletRequest req, HttpServletResponse res) throws IOException {
        String prefixo = "/midia/c" + cid + "/";
        String uri = req.getRequestURI();
        String rel = uri.startsWith(prefixo) ? URLDecoder.decode(uri.substring(prefixo.length()), StandardCharsets.UTF_8) : "";
        if (rel.contains("..") || rel.contains("\\")
                || !(rel.startsWith("pdf/") || rel.startsWith("audio/") || rel.startsWith("img/"))) {
            naoAchei(res);
            return;
        }
        Midia m = midias.findFirstByCampanhaIdAndArquivo(cid, rel).orElse(null);
        boolean imagem = rel.startsWith("img/");
        Duration prazo = imagem ? PRAZO_IMAGEM : PRAZO_ARQUIVO;

        if (imagem && m != null && (req.getParameter("mini") != null || req.getParameter("mapa") != null)) {
            String relImg = rel.substring(4);
            long versao = m.getEnviadoEm().toEpochMilli();
            Optional<Path> reduzida = req.getParameter("mini") != null
                    ? Miniaturas.obter(volume.raiz(cid), relImg, versao, () -> volume.local(m))
                    : Miniaturas.obterMapa(volume.raiz(cid), relImg, versao, () -> volume.local(m));
            if (reduzida.isPresent()) {
                Path p = reduzida.get();
                ArmazenamentoMidia.Conteudo c = new ArmazenamentoMidia.Conteudo(Files.size(p),
                        Files.getLastModifiedTime(p).toMillis(), (i, f) -> recorte(p, i, f));
                enviar(req, res, c, tipo(p.getFileName().toString()), null, c.modificado(), prazo);
                return;
            }
        }

        ArmazenamentoMidia.Conteudo c = volume.conteudo(cid, rel, m == null ? null : m.getHash());
        if (c == null) {
            naoAchei(res);
            return;
        }
        long modificado = m != null ? m.getEnviadoEm().toEpochMilli() : c.modificado();
        String etag = m != null && m.getHash() != null ? "\"" + m.getHash() + "\"" : null;
        enviar(req, res, c, tipo(rel), etag, modificado, prazo);
    }

    private static InputStream recorte(Path p, long inicio, long fim) throws IOException {
        InputStream in = Files.newInputStream(p);
        in.skipNBytes(inicio);
        return new java.io.BufferedInputStream(in) {
            private long resta = fim - inicio + 1;
            @Override
            public synchronized int read(byte[] b, int off, int len) throws IOException {
                if (resta <= 0) return -1;
                int n = super.read(b, off, (int) Math.min(len, resta));
                if (n > 0) resta -= n;
                return n;
            }
            @Override
            public synchronized int read() throws IOException {
                if (resta <= 0) return -1;
                int x = super.read();
                if (x >= 0) resta--;
                return x;
            }
        };
    }

    private static void enviar(HttpServletRequest req, HttpServletResponse res, ArmazenamentoMidia.Conteudo c,
                               String tipo, String etag, long modificado, Duration prazo) throws IOException {
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Cache-Control", "private, max-age=" + prazo.toSeconds());
        if (etag != null) res.setHeader("ETag", etag);
        if (modificado > 0) res.setDateHeader("Last-Modified", modificado);
        if (naoMudou(req, etag, modificado)) {
            res.setStatus(HttpServletResponse.SC_NOT_MODIFIED);
            return;
        }

        long tam = c.tamanho();
        long ini = 0;
        long fim = tam - 1;
        boolean parcial = false;
        String faixa = req.getHeader("Range");
        if (faixa != null && tam > 0 && faixaValeAinda(req, etag, modificado)) {
            Matcher f = FAIXA.matcher(faixa.trim());
            if (f.matches() && !(f.group(1).isEmpty() && f.group(2).isEmpty())) {
                if (f.group(1).isEmpty()) {
                    ini = Math.max(0, tam - Long.parseLong(f.group(2)));
                } else {
                    ini = Long.parseLong(f.group(1));
                    if (!f.group(2).isEmpty()) fim = Math.min(Long.parseLong(f.group(2)), tam - 1);
                }
                if (ini >= tam || ini > fim) {
                    res.setStatus(HttpServletResponse.SC_REQUESTED_RANGE_NOT_SATISFIABLE);
                    res.setHeader("Content-Range", "bytes */" + tam);
                    return;
                }
                parcial = true;
            }
        }
        res.setContentType(tipo);
        if (parcial) {
            res.setStatus(HttpServletResponse.SC_PARTIAL_CONTENT);
            res.setHeader("Content-Range", "bytes " + ini + "-" + fim + "/" + tam);
        }
        res.setContentLengthLong(tam == 0 ? 0 : fim - ini + 1);
        if ("HEAD".equals(req.getMethod()) || tam == 0) return;
        try (InputStream in = c.abertura().abrir(ini, fim); OutputStream out = res.getOutputStream()) {
            in.transferTo(out);
        } catch (IOException e) {
            /* quem pediu fechou a aba ou o pdf.js cancelou o trecho: nao ha a quem responder */
            if (clienteSaiu(e)) log.debug("Envio de midia interrompido: {}", e.getMessage());
            else log.warn("Envio de midia falhou no meio: {}", e.toString());
        }
    }

    private static boolean naoMudou(HttpServletRequest req, String etag, long modificado) {
        String inm = req.getHeader("If-None-Match");
        if (inm != null) return etag != null && (inm.trim().equals("*") || inm.contains(etag));
        if (modificado <= 0) return false;
        try {
            long ims = req.getDateHeader("If-Modified-Since");
            return ims >= 0 && modificado / 1000 <= ims / 1000;
        } catch (IllegalArgumentException _) {
            return false;
        }
    }

    /* If-Range: o trecho so vale se o arquivo ainda e o mesmo que o navegador tem; senao vai inteiro */
    private static boolean faixaValeAinda(HttpServletRequest req, String etag, long modificado) {
        String ir = req.getHeader("If-Range");
        if (ir == null) return true;
        if (ir.startsWith("\"") || ir.startsWith("W/")) return ir.equals(etag);
        try {
            long d = req.getDateHeader("If-Range");
            return modificado > 0 && modificado / 1000 <= d / 1000;
        } catch (IllegalArgumentException _) {
            return false;
        }
    }

    private static boolean clienteSaiu(IOException e) {
        for (Throwable x = e; x != null; x = x.getCause()) {
            String n = x.getClass().getSimpleName();
            String msg = String.valueOf(x.getMessage()).toLowerCase();
            if (n.contains("ClientAbort") || msg.contains("broken pipe") || msg.contains("connection reset")
                    || msg.contains("connection abort")) return true;
        }
        return false;
    }

    private static String tipo(String nome) {
        String n = nome.toLowerCase();
        if (n.endsWith(".webp")) return "image/webp";
        return MediaTypeFactory.getMediaType(n).orElse(MediaType.APPLICATION_OCTET_STREAM).toString();
    }

    private static void naoAchei(HttpServletResponse res) throws IOException {
        res.setStatus(HttpServletResponse.SC_NOT_FOUND);
        res.setContentType("application/json;charset=UTF-8");
        res.getWriter().write("{\"erro\":\"não encontrado\"}");
    }
}
