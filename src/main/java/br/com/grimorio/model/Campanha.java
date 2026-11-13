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

    /* Capa na lista de campanhas. Mora aqui e nao no guia porque a lista nao abre o guia
       de cada campanha. Caminho relativo a pasta de midia da campanha (img/foo.webp).
       Nullable de proposito: coluna nova em tabela com linhas (ver CLAUDE.md, armadilha 1). */
    @Column(length = 300)
    private String capa = "";

    /* Rolagem de jogador: aberta para a mesa toda ou so para quem rolou e o mestre.
       DEFAULT explicito: coluna NOT NULL nova em tabela com linhas (CLAUDE.md, armadilha 1). */
    @Column(name = "rolagens_abertas", nullable = false, columnDefinition = "boolean not null default true")
    private boolean rolagensAbertas = true;

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
    public boolean isRolagensAbertas() { return rolagensAbertas; }
    public void setRolagensAbertas(boolean v) { this.rolagensAbertas = v; }
    public String getCapa() { return capa; }
    public void setCapa(String capa) { this.capa = capa; }
    public Long getDonoId() { return donoId; }
    public void setDonoId(Long donoId) { this.donoId = donoId; }
    public boolean isArquivada() { return arquivada; }
    public void setArquivada(boolean arquivada) { this.arquivada = arquivada; }
    public Instant getCriadoEm() { return criadoEm; }
    public void setCriadoEm(Instant criadoEm) { this.criadoEm = criadoEm; }
}
