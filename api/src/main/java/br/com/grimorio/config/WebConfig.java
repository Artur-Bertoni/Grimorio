package br.com.grimorio.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import org.springframework.http.CacheControl;

import java.nio.file.Path;
import java.time.Duration;
import java.nio.file.Paths;

/**
 * Serve a pasta de midia como recurso estatico. O ResourceHttpRequestHandler do
 * Spring responde a Range requests, o que o pdf.js usa para carregar so as
 * paginas visitadas e o <audio> usa para seek.
 *
 * O front (HTML, JS, CSS, login, privacidade, 404) nao mora mais aqui: e o servico web
 * (pasta web/, Caddy), que repassa /api e /midia para ca pela rede privada do Railway.
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final AppProps props;

    public WebConfig(AppProps props) {
        this.props = props;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        Path dir = Paths.get(props.getMidiaDir()).toAbsolutePath().normalize();
        /* A pasta precisa existir antes do registro: o Spring descarta local que nao existe, e
           num servidor novo (pasta criada depois, no boot) nenhuma midia era servida ate reiniciar. */
        try { java.nio.file.Files.createDirectories(dir); }
        catch (java.io.IOException e) { throw new IllegalStateException("nao consegui criar a pasta de midia " + dir, e); }
        /* private: a midia e da campanha (PDF so de mestre, audio nunca para jogador). Sem isso um
           proxy compartilhado no caminho podia guardar o arquivo e entrega-lo a outra pessoa.
           Um dia, nao trinta: o PDF pode ser trocado no mesmo caminho (volume + Reescanear), e
           depois do prazo o navegador so pergunta (Last-Modified, 304). Imagem sai pelo
           MiniaturaController, com prazo proprio. */
        registry.addResourceHandler("/midia/**")
                .addResourceLocations(dir.toUri().toString())
                .setCacheControl(CacheControl.maxAge(Duration.ofDays(1)).cachePrivate());
    }
}
