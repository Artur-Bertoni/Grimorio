package br.com.grimorio.web;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import br.com.grimorio.config.AppProps;
import br.com.grimorio.service.Miniaturas;
import jakarta.servlet.http.HttpServletRequest;

/**
 * Imagens da campanha: {@code /midia/c{id}/img/arquivo} serve o original e, com {@code ?mini=1},
 * a miniatura (ate 512px) para lista e cartao; com {@code ?mapa=1}, a versao de ate 4096px que o
 * tabletop desenha no canvas. PDF e audio continuam com o ResourceHandler de
 * WebConfig, que responde a Range. A autorizacao e a mesma de qualquer midia
 * (MidiaAutorizacao: imagem e para qualquer membro), porque o filtro roda antes.
 */
@RestController
public class MiniaturaController {

    private final Path raiz;

    public MiniaturaController(AppProps props) {
        this.raiz = Paths.get(props.getMidiaDir()).toAbsolutePath().normalize();
    }

    /* sem condicao de parametro de proposito: com params="mini" o Spring casava o caminho e,
       sem o parametro, respondia erro em vez de cair no ResourceHandler. Aqui serve os dois. */
    @GetMapping("/midia/c{cid}/img/**")
    public ResponseEntity<Resource> mini(@PathVariable long cid, HttpServletRequest req) throws IOException {
        String uri = URLDecoder.decode(req.getRequestURI(), StandardCharsets.UTF_8);
        Path raizCampanha = raiz.resolve("c" + cid);
        Path original = raiz.resolve(uri.substring("/midia/".length())).normalize();
        if (!original.startsWith(raizCampanha.resolve("img")) || !Files.isRegularFile(original)) {
            return ResponseEntity.notFound().build();
        }
        Path servir = original;
        if (req.getParameter("mini") != null) servir = Miniaturas.obter(raizCampanha, original).orElse(original);
        else if (req.getParameter("mapa") != null) servir = Miniaturas.obterMapa(raizCampanha, original).orElse(original);
        String nome = servir.getFileName().toString().toLowerCase();
        MediaType tipo = nome.endsWith(".webp") ? MediaType.parseMediaType("image/webp")
                : MediaTypeFactory.getMediaType(nome).orElse(MediaType.APPLICATION_OCTET_STREAM);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofDays(30)).cachePrivate())
                .contentType(tipo)
                .body(new FileSystemResource(servir));
    }
}
