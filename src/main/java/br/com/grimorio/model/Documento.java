package br.com.grimorio.model;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * Documento JSON grande de uma campanha: "guia" (so do mestre) e "mesa"
 * (visivel a todos). Substitui a tabela doc, que era de instancia unica.
 */
@Entity
@Table(name = "documento",
       uniqueConstraints = @UniqueConstraint(name = "uk_documento", columnNames = {"campanha_id", "chave"}))
public class Documento {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "campanha_id", nullable = false)
    private Long campanhaId;

    @Column(nullable = false, length = 40)
    private String chave;

    @Column(nullable = false, length = 10000000)
    private String conteudo = "{}";

    @Column(nullable = false)
    private long versao = 0L;

    @Column(name = "atualizado_em", nullable = false)
    private Instant atualizadoEm = Instant.now();

    public Documento() { }

    public Documento(Long campanhaId, String chave, String conteudo) {
        this.campanhaId = campanhaId;
        this.chave = chave;
        this.conteudo = conteudo;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getCampanhaId() { return campanhaId; }
    public void setCampanhaId(Long campanhaId) { this.campanhaId = campanhaId; }
    public String getChave() { return chave; }
    public void setChave(String chave) { this.chave = chave; }
    public String getConteudo() { return conteudo; }
    public void setConteudo(String conteudo) { this.conteudo = conteudo; }
    public long getVersao() { return versao; }
    public void setVersao(long versao) { this.versao = versao; }
    public Instant getAtualizadoEm() { return atualizadoEm; }
    public void setAtualizadoEm(Instant atualizadoEm) { this.atualizadoEm = atualizadoEm; }
}
