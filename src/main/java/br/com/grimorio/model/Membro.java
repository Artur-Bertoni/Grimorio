package br.com.grimorio.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "membro",
       uniqueConstraints = @UniqueConstraint(name = "uk_membro", columnNames = {"campanha_id", "usuario_id"}))
public class Membro {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "campanha_id", nullable = false)
    private Long campanhaId;

    @Column(name = "usuario_id", nullable = false)
    private Long usuarioId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Papel papel = Papel.JOGADOR;

    @Column(name = "criado_em", nullable = false)
    private Instant criadoEm = Instant.now();

    public Membro() { }

    public Membro(Long campanhaId, Long usuarioId, Papel papel) {
        this.campanhaId = campanhaId;
        this.usuarioId = usuarioId;
        this.papel = papel;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getCampanhaId() { return campanhaId; }
    public void setCampanhaId(Long campanhaId) { this.campanhaId = campanhaId; }
    public Long getUsuarioId() { return usuarioId; }
    public void setUsuarioId(Long usuarioId) { this.usuarioId = usuarioId; }
    public Papel getPapel() { return papel; }
    public void setPapel(Papel papel) { this.papel = papel; }
    public Instant getCriadoEm() { return criadoEm; }
    public void setCriadoEm(Instant criadoEm) { this.criadoEm = criadoEm; }
}
