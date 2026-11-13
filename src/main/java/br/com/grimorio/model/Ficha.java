package br.com.grimorio.model;

import jakarta.persistence.*;
import java.time.Instant;

/** Ficha de personagem de um membro numa campanha. O dono edita; os mestres veem todas.
 *  O conteudo e JSON livre: os campos sao da campanha, nao de um sistema. */
@Entity
@Table(name = "ficha", indexes = @Index(name = "ix_ficha_campanha", columnList = "campanha_id, usuario_id"))
public class Ficha {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "campanha_id", nullable = false)
    private Long campanhaId;

    @Column(name = "usuario_id", nullable = false)
    private Long usuarioId;

    @Column(nullable = false, length = 120)
    private String nome = "";

    @Column(nullable = false, length = 10000000)
    private String conteudo = "{}";

    @Column(name = "atualizado_em", nullable = false)
    private Instant atualizadoEm = Instant.now();

    public Long getId() { return id; }
    public Long getCampanhaId() { return campanhaId; }
    public void setCampanhaId(Long campanhaId) { this.campanhaId = campanhaId; }
    public Long getUsuarioId() { return usuarioId; }
    public void setUsuarioId(Long usuarioId) { this.usuarioId = usuarioId; }
    public String getNome() { return nome; }
    public void setNome(String nome) { this.nome = nome; }
    public String getConteudo() { return conteudo; }
    public void setConteudo(String conteudo) { this.conteudo = conteudo; }
    public Instant getAtualizadoEm() { return atualizadoEm; }
    public void setAtualizadoEm(Instant atualizadoEm) { this.atualizadoEm = atualizadoEm; }
}
