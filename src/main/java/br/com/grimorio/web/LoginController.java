package br.com.grimorio.web;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import org.springframework.core.io.ClassPathResource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/**
 * A tela de login com o endereco do servidor nos metadados de previa. O link de convite e
 * compartilhado em chat, e quem monta a previa (WhatsApp, Discord, Telegram) so aceita imagem
 * com endereco absoluto, que o HTML estatico nao tem como saber.
 */
@RestController
public class LoginController {

    @GetMapping("/paginas/login.html")
    public ResponseEntity<String> login() throws IOException {
        String base = ServletUriComponentsBuilder.fromCurrentContextPath().build().toUriString();
        try (InputStream in = new ClassPathResource("static/paginas/login.html").getInputStream()) {
            String html = new String(in.readAllBytes(), StandardCharsets.UTF_8).replace("{{BASE}}", base);
            return ResponseEntity.ok()
                    .cacheControl(CacheControl.noCache())
                    .contentType(new MediaType(MediaType.TEXT_HTML, StandardCharsets.UTF_8))
                    .body(html);
        }
    }
}
