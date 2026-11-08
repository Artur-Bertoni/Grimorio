package br.com.hexatombe.model;

import jakarta.persistence.*;
import java.time.Instant;

/** Documento JSON grande: "guia" (so do mestre) e "mesa" (visivel a todos). */
@Entity
@Table(name = "doc")
public class Doc {

    @Id
    @Column(length = 40)
    private String chave;

    @Column(nullable = false, length = 10000000)
    private String conteudo = "{}";

    @Column(nullable = false)
    private long versao = 0L;

    @Column(name = "atualizado_em", nullable = false)
    private Instant atualizadoEm = Instant.now();

    public Doc() { }

    public Doc(String chave, String conteudo) {
        this.chave = chave;
        this.conteudo = conteudo;
    }

    public String getChave() { return chave; }
    public void setChave(String chave) { this.chave = chave; }
    public String getConteudo() { return conteudo; }
    public void setConteudo(String conteudo) { this.conteudo = conteudo; }
    public long getVersao() { return versao; }
    public void setVersao(long versao) { this.versao = versao; }
    public Instant getAtualizadoEm() { return atualizadoEm; }
    public void setAtualizadoEm(Instant atualizadoEm) { this.atualizadoEm = atualizadoEm; }
}
