package br.com.hexatombe.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Serve a pasta de midia como recurso estatico. O ResourceHttpRequestHandler do
 * Spring responde a Range requests, o que o pdf.js usa para carregar so as
 * paginas visitadas e o <audio> usa para seek.
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
        registry.addResourceHandler("/midia/**")
                .addResourceLocations(dir.toUri().toString())
                .setCachePeriod(60 * 60 * 24 * 30);
    }
}
