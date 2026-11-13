package br.com.grimorio.config;

import br.com.grimorio.repo.UsuarioRepo;
import br.com.grimorio.service.MidiaService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

@Configuration
public class Inicializacao {

    private static final Logger log = LoggerFactory.getLogger(Inicializacao.class);

    @Bean
    @Order(10)
    public ApplicationRunner partida(UsuarioRepo usuarios, AppProps props, MidiaService midia) {
        return args -> {
            Path raiz = Paths.get(props.getMidiaDir()).toAbsolutePath().normalize();
            Files.createDirectories(raiz);
            log.info("Pasta de midia: {}", raiz);

            if (usuarios.count() == 0) log.warn(" Nenhuma conta cadastrada.");
            /* em segundo plano: calcular hash de livro grande demora, e o site nao espera por isso */
            Thread t = new Thread(() -> {
                try { midia.desduplicarVolume(); }
                catch (Exception e) { log.warn("Desduplicacao do volume falhou: {}", e.getMessage()); }
            }, "desduplica-midia");
            t.setDaemon(true);
            t.start();
        };
    }
}
