package br.com.grimorio.config;

import jakarta.servlet.Filter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
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

    /**
     * Marca UTF-8 nos estaticos de texto. Sem isso o navegador adivinha a
     * codificacao pela locale e quebra acento (e, pior, qualquer regex com
     * caractere fora do ASCII). Nao toca em PDF nem audio de proposito.
     */
    @Bean
    public FilterRegistrationBean<Filter> charsetDeTexto() {
        FilterRegistrationBean<Filter> reg = new FilterRegistrationBean<>();
        reg.setFilter((pedido, resposta, cadeia) -> {
            String caminho = (pedido instanceof HttpServletRequest)
                    ? ((HttpServletRequest) pedido).getRequestURI() : "";
            if (caminho.endsWith("/") || caminho.endsWith(".html")
                    || caminho.endsWith(".js") || caminho.endsWith(".css")) {
                resposta.setCharacterEncoding("UTF-8");
            }
            cadeia.doFilter(pedido, resposta);
        });
        reg.addUrlPatterns("/*");
        reg.setOrder(Ordered.HIGHEST_PRECEDENCE);
        reg.setName("charsetDeTexto");
        return reg;
    }
}
