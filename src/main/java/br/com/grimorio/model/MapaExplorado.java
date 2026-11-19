package br.com.grimorio.model;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * O que um jogador ja viu de um mapa com a nevoa pela visao e a memoria ligada. E uma grade de casas
 * pequenas (a mesma do corte da nevoa, MapaNevoa), um bit por casa, em base64. Mora no servidor porque
 * e ele quem decide que pedaco da imagem o jogador recebe: uma memoria no navegador deixaria o jogador
 * pedir o que nunca viu. {@code ver} e o {@code fogVer} das regras quando foi gravada; "esquecer o
 * explorado" sobe o numero e a linha antiga deixa de valer.
 */
@Entity
@Table(name = "mapa_explorado", indexes = @Index(name = "ix_mapa_explorado", columnList = "mapa_id, usuario_id"))
public class MapaExplorado {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "mapa_id", nullable = false)
    private Long mapaId;

    @Column(name = "campanha_id", nullable = false)
    private Long campanhaId;

    @Column(name = "usuario_id", nullable = false, columnDefinition = "bigint not null default 0")
    private long usuarioId;

    @Column(nullable = false, columnDefinition = "integer not null default 0")
    private int ver;

    /** colunas e linhas da grade quando foi gravada: o mapa mudou de tamanho, a memoria recomeca */
    @Column(nullable = false, columnDefinition = "integer not null default 0")
    private int colunas;

    @Column(nullable = false, columnDefinition = "integer not null default 0")
    private int linhas;

    /** 512 x 512 casas no maximo: 32 KB de bits, uns 44 mil caracteres em base64 */
    @Column(nullable = false, length = 60000, columnDefinition = "varchar(60000) not null default ''")
    private String bits = "";

    @Column(name = "atualizado_em", nullable = false)
    private Instant atualizadoEm = Instant.now();

    public Long getId() { return id; }
    public Long getMapaId() { return mapaId; }
    public void setMapaId(Long mapaId) { this.mapaId = mapaId; }
    public Long getCampanhaId() { return campanhaId; }
    public void setCampanhaId(Long campanhaId) { this.campanhaId = campanhaId; }
    public long getUsuarioId() { return usuarioId; }
    public void setUsuarioId(long usuarioId) { this.usuarioId = usuarioId; }
    public int getVer() { return ver; }
    public void setVer(int ver) { this.ver = ver; }
    public int getColunas() { return colunas; }
    public void setColunas(int colunas) { this.colunas = colunas; }
    public int getLinhas() { return linhas; }
    public void setLinhas(int linhas) { this.linhas = linhas; }
    public String getBits() { return bits; }
    public void setBits(String bits) { this.bits = bits; }
    public Instant getAtualizadoEm() { return atualizadoEm; }
    public void setAtualizadoEm(Instant atualizadoEm) { this.atualizadoEm = atualizadoEm; }
}
