package br.com.grimorio.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import br.com.grimorio.service.CampanhaService;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import jakarta.servlet.http.HttpServletRequest;

@RestControllerAdvice
public class TratadorDeErros {

    private static final Logger log = LoggerFactory.getLogger(TratadorDeErros.class);

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Object> ruim(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(Map.of("erro", msg(e)));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Object> grande(MaxUploadSizeExceededException e) {
        return ResponseEntity.status(HttpStatus.CONTENT_TOO_LARGE)
                .body(Map.of("erro", "arquivo maior que o limite configurado"));
    }

    @ExceptionHandler(br.com.grimorio.service.ArmazenamentoCheioException.class)
    public ResponseEntity<Object> cheio(br.com.grimorio.service.ArmazenamentoCheioException e) {
        log.warn("Envio recusado: armazenamento de midia cheio");
        return ResponseEntity.status(HttpStatus.INSUFFICIENT_STORAGE)
                .body(Map.of("erro", "o armazenamento está cheio", "codigo", "armazenamento-cheio"));
    }

    @ExceptionHandler(CampanhaService.SemAcessoException.class)
    public ResponseEntity<Object> semAcesso(CampanhaService.SemAcessoException e) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("erro", msg(e), "codigo", "proibido"));
    }

    /* bloqueio de movimento do mapa: a tela mostra a frase e devolve o token ao lugar */
    @ExceptionHandler(br.com.grimorio.service.MapaService.LimiteDeMovimento.class)
    public ResponseEntity<Object> limiteDeMovimento(br.com.grimorio.service.MapaService.LimiteDeMovimento e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("erro", msg(e), "codigo", "limite-de-movimento"));
    }

    /* o cliente fechou a aba no meio de um fluxo (SSE do mapa): nao ha a quem responder, e tentar
       escrever JSON num text/event-stream so enchia o log de erro */
    @ExceptionHandler({org.springframework.web.context.request.async.AsyncRequestNotUsableException.class,
            org.springframework.web.context.request.async.AsyncRequestTimeoutException.class})
    public void clienteSaiu() {
        log.debug("Fluxo encerrado (cliente saiu ou o tempo acabou)");
    }

    /* mapa ou elemento que a pessoa nao pode ver responde como se nao existisse (como a ficha alheia) */
    @ExceptionHandler(br.com.grimorio.service.MapaService.NaoAchado.class)
    public ResponseEntity<Object> mapaNaoAchado(br.com.grimorio.service.MapaService.NaoAchado e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("erro", msg(e)));
    }

    /* Endereco que nao existe: quem pediu pelo navegador (aceita HTML e nao e /api nem /midia)
       recebe a pagina 404 com o tema e o caminho de volta; o resto continua recebendo JSON. */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Object> naoAchei(NoResourceFoundException e, HttpServletRequest req) {
        String uri = req.getRequestURI();
        String aceita = req.getHeader("Accept");
        boolean navegador = aceita != null && aceita.contains("text/html")
                && !uri.startsWith("/api/") && !uri.startsWith("/midia/");
        if (navegador) {
            try (InputStream in = new ClassPathResource("static/paginas/404.html").getInputStream()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .contentType(new MediaType(MediaType.TEXT_HTML, StandardCharsets.UTF_8))
                        .body(new String(in.readAllBytes(), StandardCharsets.UTF_8));
            } catch (IOException falta) {
                log.warn("Pagina 404 nao encontrada no jar: {}", falta.toString());
            }
        }
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("erro", "não encontrado"));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Object> estado(IllegalStateException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("erro", msg(e)));
    }

    /* Erro inesperado: o detalhe tecnico fica no log; a tela recebe uma frase que serve a quem usa */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Object> geral(Exception e) {
        log.error("Erro nao tratado", e);
        return ResponseEntity.internalServerError()
                .body(Map.of("erro", "o servidor falhou ao atender este pedido; tente de novo em instantes"));
    }

    private String msg(Exception e) {
        String m = e.getMessage();
        return m == null || m.isBlank() ? "pedido inválido" : m;
    }
}
