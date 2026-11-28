package br.com.grimorio.model;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * Mapa do tabletop. Mora fora do guia e da mesa: muda a cada token arrastado, e regravar o guia
 * inteiro a cada movimento seria caro e brigaria com a versao otimista dele. So um mapa por
 * campanha fica {@code ativo}: e o unico que o jogador ve. A imagem e um caminho em {@code img/},
 * como no guia; largura e altura sao as do original, e as coordenadas dos elementos estao nessa
 * escala, seja qual for a versao reduzida que a tela carregar.
 */
@Entity
@Table(name = "mapa", indexes = @Index(name = "ix_mapa_campanha", columnList = "campanha_id"))
public class Mapa {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "campanha_id", nullable = false)
    private Long campanhaId;

    @Column(nullable = false, length = 120, columnDefinition = "varchar(120) not null default ''")
    private String nome = "";

    @Column(nullable = false, length = 400, columnDefinition = "varchar(400) not null default ''")
    private String imagem = "";

    @Column(nullable = false, columnDefinition = "integer not null default 0")
    private int largura;

    @Column(nullable = false, columnDefinition = "integer not null default 0")
    private int altura;

    /** tipo, tamanho da casa, deslocamento, opacidade, escala, unidade e regra de diagonal */
    @Column(nullable = false, length = 4000, columnDefinition = "varchar(4000) not null default '{}'")
    private String grid = "{}";

    /** quem move os tokens (e, nas fases seguintes, o limite de deslocamento) */
    @Column(nullable = false, length = 4000, columnDefinition = "varchar(4000) not null default '{}'")
    private String regras = "{}";

    /** sobe a cada operacao no mapa ou num elemento dele: e o que o polling compara */
    @Column(nullable = false, columnDefinition = "bigint not null default 0")
    private long seq;

    @Column(nullable = false, columnDefinition = "integer not null default 0")
    private int ordem;

    @Column(nullable = false, columnDefinition = "boolean not null default false")
    private boolean ativo;

    /** id da cena do guia a que o mapa esta ligado; vazio quando nao esta */
    @Column(name = "cena_id", nullable = false, length = 80, columnDefinition = "varchar(80) not null default ''")
    private String cenaId = "";

    @Column(name = "atualizado_em", nullable = false)
    private Instant atualizadoEm = Instant.now();

    public Long getId() { return id; }
    public Long getCampanhaId() { return campanhaId; }
    public void setCampanhaId(Long campanhaId) { this.campanhaId = campanhaId; }
    public String getNome() { return nome; }
    public void setNome(String nome) { this.nome = nome; }
    public String getImagem() { return imagem; }
    public void setImagem(String imagem) { this.imagem = imagem; }
    public int getLargura() { return largura; }
    public void setLargura(int largura) { this.largura = largura; }
    public int getAltura() { return altura; }
    public void setAltura(int altura) { this.altura = altura; }
    public String getGrid() { return grid; }
    public void setGrid(String grid) { this.grid = grid; }
    public String getRegras() { return regras; }
    public void setRegras(String regras) { this.regras = regras; }
    public long getSeq() { return seq; }
    public void setSeq(long seq) { this.seq = seq; }
    public int getOrdem() { return ordem; }
    public void setOrdem(int ordem) { this.ordem = ordem; }
    public boolean isAtivo() { return ativo; }
    public void setAtivo(boolean ativo) { this.ativo = ativo; }
    public String getCenaId() { return cenaId; }
    public void setCenaId(String cenaId) { this.cenaId = cenaId; }
    public Instant getAtualizadoEm() { return atualizadoEm; }
    public void setAtualizadoEm(Instant atualizadoEm) { this.atualizadoEm = atualizadoEm; }
}
