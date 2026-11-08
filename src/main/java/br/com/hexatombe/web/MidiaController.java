package br.com.hexatombe.web;

import br.com.hexatombe.service.MidiaService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** Catalogo de PDFs e trilha. Rota de MESTRE (ver SecurityConfig). */
@RestController
@RequestMapping("/api/midia")
public class MidiaController {

    private final MidiaService midia;
    private final Atual atual;

    public MidiaController(MidiaService midia, Atual atual) {
        this.midia = midia;
        this.atual = atual;
    }

    @GetMapping
    public Map<String, Object> catalogo() {
        if (!atual.mestre()) return Map.of("docs", java.util.List.of(), "faixas", java.util.List.of());
        return midia.catalogo();
    }
}
