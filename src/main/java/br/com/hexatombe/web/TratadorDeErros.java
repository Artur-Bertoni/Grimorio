package br.com.hexatombe.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.Map;

@RestControllerAdvice
public class TratadorDeErros {

    private static final Logger log = LoggerFactory.getLogger(TratadorDeErros.class);

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<?> ruim(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(Map.of("erro", msg(e)));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<?> grande(MaxUploadSizeExceededException e) {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(Map.of("erro", "arquivo maior que o limite configurado"));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<?> naoAchei(NoResourceFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("erro", "arquivo não encontrado"));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<?> estado(IllegalStateException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("erro", msg(e)));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<?> geral(Exception e) {
        log.error("Erro nao tratado", e);
        return ResponseEntity.internalServerError().body(Map.of("erro", msg(e)));
    }

    private String msg(Exception e) {
        String m = e.getMessage();
        return m == null || m.isBlank() ? e.getClass().getSimpleName() : m;
    }
}
