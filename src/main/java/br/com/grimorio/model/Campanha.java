package br.com.grimorio.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "campanha")
public class Campanha {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 120)
    private String nome;

    @Column(length = 120)
    private String sistema = "";

    @Column(length = 400)
    private String descricao = "";

    @Column(length = 40)
    private String tema = "sangue";

    @Column(name = "dono_id", nullable = false)
    private Long donoId;

    @Column(nullable = false, columnDefinition = "boolean not null default false")
    private boolean arquivada = false;

    @Column(name = "criado_em", nullable = false)
    private Instant criadoEm = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getNome() { return nome; }
    public void setNome(String nome) { this.nome = nome; }
    public String getSistema() { return sistema; }
    public void setSistema(String sistema) { this.sistema = sistema; }
    public String getDescricao() { return descricao; }
    public void setDescricao(String descricao) { this.descricao = descricao; }
    public String getTema() { return tema; }
    public void setTema(String tema) { this.tema = tema; }
    public Long getDonoId() { return donoId; }
    public void setDonoId(Long donoId) { this.donoId = donoId; }
    public boolean isArquivada() { return arquivada; }
    public void setArquivada(boolean arquivada) { this.arquivada = arquivada; }
    public Instant getCriadoEm() { return criadoEm; }
    public void setCriadoEm(Instant criadoEm) { this.criadoEm = criadoEm; }
}
