package br.com.grimorio.config;

import br.com.grimorio.repo.UsuarioRepo;
import br.com.grimorio.service.ArmazenamentoMidia;
import br.com.grimorio.service.ModeloService;
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
    ApplicationRunner partida(UsuarioRepo usuarios, AppProps props, ArmazenamentoMidia midia, ModeloService modelos) {
        return args -> {
            Path raiz = Paths.get(props.getMidiaDir()).toAbsolutePath().normalize();
            Files.createDirectories(raiz);
            log.info("Pasta de midia: {}", raiz);

            if (usuarios.count() == 0) log.warn(" Nenhuma conta cadastrada.");
            /* em segundo plano: copiar para o cofre o que ainda so esta no volume (de antes do bucket).
               So copia, nunca apaga; calcular hash e subir livro grande demora, e o site nao espera */
            Thread t = new Thread(() -> {
                try { midia.migrarParaCofre(); modelos.migrarParaCofre(); }
                catch (Exception e) { log.warn("Copia do volume para o cofre falhou: {}", e.getMessage()); }
            }, "midia-para-cofre");
            t.setDaemon(true);
            t.start();
        };
    }
}
