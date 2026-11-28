package br.com.grimorio.model;

import jakarta.persistence.*;

/**
 * O que fica em cima de um mapa: token, desenho, parede ou area de fog. Os campos que decidem
 * quem ve e quem mexe (tipo, dono, visivel, bloqueado) sao colunas, porque o servidor filtra por
 * eles antes de responder ao jogador. O resto (posicao, tamanho, rotacao, nome, imagem, vinculo
 * com ficha ou NPC) e JSON em {@code dados}: muda de forma a cada fase, sem pedir coluna nova.
 */
@Entity
@Table(name = "mapa_elemento", indexes = @Index(name = "ix_mapa_elemento_mapa", columnList = "mapa_id"))
public class MapaElemento {

    /** Coluna enum: registrada em AjusteEsquema (o check do banco nao acompanha valor novo sozinho). */
    public enum Tipo { TOKEN, DESENHO, PAREDE, FOG }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "mapa_id", nullable = false)
    private Long mapaId;

    @Column(name = "campanha_id", nullable = false)
    private Long campanhaId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20, columnDefinition = "varchar(20) not null default 'TOKEN'")
    private Tipo tipo = Tipo.TOKEN;

    @Column(nullable = false, length = 30, columnDefinition = "varchar(30) not null default ''")
    private String camada = "";

    /** usuario que controla o elemento; 0 quando e so do mestre */
    @Column(nullable = false, columnDefinition = "bigint not null default 0")
    private long dono;

    /** falso: so o mestre ve. O jogador nunca recebe o elemento, nem saber que ele existe. */
    @Column(nullable = false, columnDefinition = "boolean not null default true")
    private boolean visivel = true;

    @Column(nullable = false, columnDefinition = "boolean not null default false")
    private boolean bloqueado;

    @Column(nullable = false, columnDefinition = "integer not null default 0")
    private int ordem;

    @Column(nullable = false, length = 4000, columnDefinition = "varchar(4000) not null default '{}'")
    private String dados = "{}";

    public Long getId() { return id; }
    public Long getMapaId() { return mapaId; }
    public void setMapaId(Long mapaId) { this.mapaId = mapaId; }
    public Long getCampanhaId() { return campanhaId; }
    public void setCampanhaId(Long campanhaId) { this.campanhaId = campanhaId; }
    public Tipo getTipo() { return tipo; }
    public void setTipo(Tipo tipo) { this.tipo = tipo; }
    public String getCamada() { return camada; }
    public void setCamada(String camada) { this.camada = camada; }
    public long getDono() { return dono; }
    public void setDono(long dono) { this.dono = dono; }
    public boolean isVisivel() { return visivel; }
    public void setVisivel(boolean visivel) { this.visivel = visivel; }
    public boolean isBloqueado() { return bloqueado; }
    public void setBloqueado(boolean bloqueado) { this.bloqueado = bloqueado; }
    public int getOrdem() { return ordem; }
    public void setOrdem(int ordem) { this.ordem = ordem; }
    public String getDados() { return dados; }
    public void setDados(String dados) { this.dados = dados; }
}
