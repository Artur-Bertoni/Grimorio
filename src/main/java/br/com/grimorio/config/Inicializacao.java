package br.com.grimorio.config;

import br.com.grimorio.repo.UsuarioRepo;
import br.com.grimorio.service.MigracaoService;
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
    public ApplicationRunner partida(UsuarioRepo usuarios, MigracaoService migracao, AppProps props) {
        return args -> {
            Path raiz = Paths.get(props.getMidiaDir()).toAbsolutePath().normalize();
            Files.createDirectories(raiz);
            log.info("Pasta de midia: {}", raiz);

            long contas = usuarios.count();
            if (contas == 0) {
                log.warn(" Nenhuma conta cadastrada.");
            } else {
                migracao.migrar();
            }
        };
    }
}
