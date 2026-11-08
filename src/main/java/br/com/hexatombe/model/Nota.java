package br.com.hexatombe.model;

import jakarta.persistence.*;
import java.time.Instant;

/** Anotacao privada de um jogador. So o dono le. */
@Entity
@Table(name = "nota")
public class Nota {

    @Id
    @Column(name = "usuario_id")
    private Long usuarioId;

    @Column(nullable = false, length = 10000000)
    private String texto = "";

    @Column(name = "atualizado_em", nullable = false)
    private Instant atualizadoEm = Instant.now();

    public Long getUsuarioId() { return usuarioId; }
    public void setUsuarioId(Long usuarioId) { this.usuarioId = usuarioId; }
    public String getTexto() { return texto; }
    public void setTexto(String texto) { this.texto = texto; }
    public Instant getAtualizadoEm() { return atualizadoEm; }
    public void setAtualizadoEm(Instant atualizadoEm) { this.atualizadoEm = atualizadoEm; }
}
