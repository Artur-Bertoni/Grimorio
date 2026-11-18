package br.com.grimorio.model;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * Log das operacoes de um mapa: quem fez, quando, o que fez e o estado de antes (a inversa).
 * E dele que sai o desfazer por pessoa e o historico que o mestre ve. Nunca vai para o jogador
 * inteiro: a operacao num elemento oculto contaria a ele que o elemento existe.
 */
@Entity
@Table(name = "mapa_historico", indexes = @Index(name = "ix_mapa_historico_mapa", columnList = "mapa_id, seq"))
public class MapaHistorico {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "mapa_id", nullable = false)
    private Long mapaId;

    @Column(name = "campanha_id", nullable = false)
    private Long campanhaId;

    @Column(nullable = false, columnDefinition = "bigint not null default 0")
    private long seq;

    @Column(name = "usuario_id", nullable = false, columnDefinition = "bigint not null default 0")
    private long usuarioId;

    @Column(nullable = false)
    private Instant em = Instant.now();

    /** criar, mudar, remover, mapa, desfazer, turno */
    @Column(nullable = false, length = 30, columnDefinition = "varchar(30) not null default ''")
    private String operacao = "";

    @Column(name = "elemento_id", nullable = false, columnDefinition = "bigint not null default 0")
    private long elementoId;

    /** o estado depois da operacao */
    @Column(nullable = false, length = 8000, columnDefinition = "varchar(8000) not null default ''")
    private String depois = "";

    /** o estado antes: aplicar isto desfaz a operacao (vazio na criacao) */
    @Column(nullable = false, length = 8000, columnDefinition = "varchar(8000) not null default ''")
    private String antes = "";

    /** true quando a operacao ja foi desfeita (ou e um desfazer): ela sai da fila do desfazer da pessoa */
    @Column(nullable = false, columnDefinition = "boolean not null default false")
    private boolean desfeito = false;

    public Long getId() { return id; }
    public Long getMapaId() { return mapaId; }
    public void setMapaId(Long mapaId) { this.mapaId = mapaId; }
    public Long getCampanhaId() { return campanhaId; }
    public void setCampanhaId(Long campanhaId) { this.campanhaId = campanhaId; }
    public long getSeq() { return seq; }
    public void setSeq(long seq) { this.seq = seq; }
    public long getUsuarioId() { return usuarioId; }
    public void setUsuarioId(long usuarioId) { this.usuarioId = usuarioId; }
    public Instant getEm() { return em; }
    public String getOperacao() { return operacao; }
    public void setOperacao(String operacao) { this.operacao = operacao; }
    public long getElementoId() { return elementoId; }
    public void setElementoId(long elementoId) { this.elementoId = elementoId; }
    public String getDepois() { return depois; }
    public void setDepois(String depois) { this.depois = depois; }
    public boolean isDesfeito() { return desfeito; }
    public void setDesfeito(boolean desfeito) { this.desfeito = desfeito; }
    public String getAntes() { return antes; }
    public void setAntes(String antes) { this.antes = antes; }
}
