package br.com.hexatombe.config;

import br.com.hexatombe.model.*;
import br.com.hexatombe.repo.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.SecureRandom;

@Configuration
public class Inicializacao {

    private static final Logger log = LoggerFactory.getLogger(Inicializacao.class);

    @Bean
    public ApplicationRunner semente(UsuarioRepo usuarios, DocRepo docs, AppProps props,
                                     PasswordEncoder enc) {
        return args -> {
            Path midia = Paths.get(props.getMidiaDir()).toAbsolutePath().normalize();
            Files.createDirectories(midia.resolve("pdf"));
            Files.createDirectories(midia.resolve("audio"));
            Files.createDirectories(midia.resolve("indice"));
            log.info("Pasta de midia: {}", midia);

            if (usuarios.count() == 0) {
                String senha = props.getMestreSenha();
                boolean gerada = senha == null || senha.isBlank();
                if (gerada) senha = senhaAleatoria();
                Usuario u = new Usuario();
                u.setLogin(props.getMestreLogin());
                u.setNome("Mestre");
                u.setPapel(Papel.MESTRE);
                u.setSenhaHash(enc.encode(senha));
                usuarios.save(u);
                if (gerada) {
                    log.warn("=================================================");
                    log.warn(" MESTRE CRIADO -> login: {} / senha: {}", u.getLogin(), senha);
                    log.warn(" Troque a senha no painel de administracao.");
                    log.warn("=================================================");
                } else {
                    log.info("Mestre criado com o login {}", u.getLogin());
                }
            }

            if (!docs.existsById("guia")) {
                docs.save(new Doc("guia", lerSemente("seed/guia.json")));
                log.info("Documento 'guia' semeado.");
            }
            if (!docs.existsById("mesa")) {
                docs.save(new Doc("mesa", lerSemente("seed/mesa.json")));
                log.info("Documento 'mesa' semeado.");
            }
        };
    }

    private String lerSemente(String caminho) {
        try {
            ClassPathResource r = new ClassPathResource(caminho);
            if (!r.exists()) return "{}";
            try (var in = r.getInputStream()) {
                return new String(in.readAllBytes(), StandardCharsets.UTF_8);
            }
        } catch (Exception e) {
            log.warn("Nao consegui ler a semente {}: {}", caminho, e.getMessage());
            return "{}";
        }
    }

    private String senhaAleatoria() {
        String abc = "abcdefghjkmnpqrstuvwxyz23456789";
        SecureRandom r = new SecureRandom();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 12; i++) sb.append(abc.charAt(r.nextInt(abc.length())));
        return sb.toString();
    }
}
