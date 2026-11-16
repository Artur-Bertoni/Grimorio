package br.com.grimorio.web;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import br.com.grimorio.service.MetricaService;
import br.com.grimorio.service.TextosService;

/**
 * Administracao › Textos legais e Administracao › Uso. Fica sob /api/admin, entao passa por
 * AdminAutorizacao como o resto.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminTextosController {

    private final TextosService textos;
    private final MetricaService metricas;

    public AdminTextosController(TextosService textos, MetricaService metricas) {
        this.textos = textos;
        this.metricas = metricas;
    }

    public static class Texto {
        public String texto;
    }

    @PutMapping("/textos/{chave}")
    public Map<String, Object> gravar(@PathVariable String chave, @RequestBody Texto t) {
        textos.gravar(chave, t.texto);
        return textos.ler(chave);
    }

    @GetMapping("/metricas")
    public Map<String, Object> metricas(@RequestParam(defaultValue = "30") int dias) {
        return metricas.resumo(dias);
    }
}
