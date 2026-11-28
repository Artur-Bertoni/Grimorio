package br.com.grimorio.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
/* o mural le os 200 mais novos da campanha: sem o indice, varria e ordenava a tabela inteira */
@Table(name = "mural_post", indexes = @Index(name = "ix_mural_campanha", columnList = "campanha_id, criado_em"))
public class MuralPost {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "campanha_id")
    private Long campanhaId;

    @Column(name = "usuario_id", nullable = false)
    private Long usuarioId;

    @Column(name = "autor_nome", nullable = false, length = 80)
    private String autorNome;

    @Column(nullable = false, length = 2000)
    private String texto;

    @Column(name = "criado_em", nullable = false)
    private Instant criadoEm = Instant.now();

    public Long getId() { return id; }
    public Long getCampanhaId() { return campanhaId; }
    public void setCampanhaId(Long campanhaId) { this.campanhaId = campanhaId; }
    public void setId(Long id) { this.id = id; }
    public Long getUsuarioId() { return usuarioId; }
    public void setUsuarioId(Long usuarioId) { this.usuarioId = usuarioId; }
    public String getAutorNome() { return autorNome; }
    public void setAutorNome(String autorNome) { this.autorNome = autorNome; }
    public String getTexto() { return texto; }
    public void setTexto(String texto) { this.texto = texto; }
    public Instant getCriadoEm() { return criadoEm; }
    public void setCriadoEm(Instant criadoEm) { this.criadoEm = criadoEm; }
}
