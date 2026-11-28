package br.com.grimorio.config;

import br.com.grimorio.service.Cofre;
import br.com.grimorio.service.CofrePasta;
import br.com.grimorio.service.CofreS3;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Escolhe onde moram os arquivos originais: o bucket, quando as quatro variaveis S3_* existem (no Railway
 * o .railway/railway.ts as liga ao bucket "midia"), ou a pasta {@code objetos/} ao lado da de midia (na
 * maquina e no CI).
 */
@Configuration
public class CofreConfig {

    private static final Logger log = LoggerFactory.getLogger(CofreConfig.class);

    @Bean
    Cofre cofre(Environment env, AppProps props) {
        String endpoint = env.getProperty("S3_ENDPOINT", "");
        String bucket = env.getProperty("S3_BUCKET", "");
        String chave = env.getProperty("S3_KEY", "");
        String segredo = env.getProperty("S3_SECRET", "");
        if (!endpoint.isBlank() && !bucket.isBlank() && !chave.isBlank() && !segredo.isBlank()) {
            log.info("Arquivos originais no bucket {} ({})", bucket, endpoint);
            return new CofreS3(endpoint, bucket, chave, segredo, env.getProperty("S3_REGIAO", "auto"),
                    Boolean.parseBoolean(env.getProperty("S3_PATH_STYLE", "false")));
        }
        Path midia = Paths.get(props.getMidiaDir()).toAbsolutePath().normalize();
        Path pasta = (midia.getParent() == null ? midia : midia.getParent()).resolve("objetos");
        log.info("Arquivos originais na pasta {} (sem S3_* configurado)", pasta);
        return new CofrePasta(pasta);
    }
}
