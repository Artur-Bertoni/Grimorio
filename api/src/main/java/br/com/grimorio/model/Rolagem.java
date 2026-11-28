package br.com.grimorio.model;

import jakarta.persistence.*;
import java.time.Instant;

/** Uma rolagem de dado feita pela tela, ou um pedido de teste do mestre (pedido = true).
 *  O sorteio e do servidor: o navegador so manda a formula. */
@Entity
@Table(name = "rolagem", indexes = @Index(name = "ix_rolagem_campanha", columnList = "campanha_id, id"))
public class Rolagem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "campanha_id", nullable = false)
    private Long campanhaId;

    @Column(name = "usuario_id", nullable = false)
    private Long usuarioId;

    @Column(name = "autor_nome", nullable = false, length = 80)
    private String autorNome;

    /* formula ja normalizada pelo servidor: 2d6+3, 2d20kh1 */
    @Column(nullable = false, length = 60, columnDefinition = "varchar(60) not null default ''")
    private String formula = "";

    /* os dados que sairam, para a mesa conferir: [6, 4, (1)] + 3 */
    @Column(nullable = false, length = 400, columnDefinition = "varchar(400) not null default ''")
    private String detalhe = "";

    /* para que foi: "Percepcao". Vazio em rolagem solta. */
    @Column(nullable = false, length = 80, columnDefinition = "varchar(80) not null default ''")
    private String rotulo = "";

    /* lados quando a formula e um tipo so de dado; 0 em formula misturada */
    @Column(nullable = false)
    private int lados;

    @Column(nullable = false)
    private int valor;

    /* 1: todo dado que contou saiu no maximo. -1: todos sairam 1. 0: nem um nem outro. */
    @Column(nullable = false, columnDefinition = "integer not null default 0")
    private int extremo;

    /* publica: a mesa inteira ve. Fechada: so quem rolou e os mestres. */
    @Column(nullable = false, columnDefinition = "boolean not null default false")
    private boolean publica = false;

    @Column(nullable = false, columnDefinition = "boolean not null default false")
    private boolean mestre = false;

    /* pedido de teste: o mestre pede, ninguem rolou ainda */
    @Column(nullable = false, columnDefinition = "boolean not null default false")
    private boolean pedido = false;

    /* rolagem que responde a um pedido */
    @Column(name = "pedido_id")
    private Long pedidoId;

    @Column(name = "criado_em", nullable = false)
    private Instant criadoEm = Instant.now();

    public Long getId() { return id; }
    public Long getCampanhaId() { return campanhaId; }
    public void setCampanhaId(Long campanhaId) { this.campanhaId = campanhaId; }
    public Long getUsuarioId() { return usuarioId; }
    public void setUsuarioId(Long usuarioId) { this.usuarioId = usuarioId; }
    public String getAutorNome() { return autorNome; }
    public void setAutorNome(String autorNome) { this.autorNome = autorNome; }
    public String getFormula() { return formula; }
    public void setFormula(String formula) { this.formula = formula; }
    public String getDetalhe() { return detalhe; }
    public void setDetalhe(String detalhe) { this.detalhe = detalhe; }
    public String getRotulo() { return rotulo; }
    public void setRotulo(String rotulo) { this.rotulo = rotulo; }
    public int getLados() { return lados; }
    public void setLados(int lados) { this.lados = lados; }
    public int getValor() { return valor; }
    public void setValor(int valor) { this.valor = valor; }
    public int getExtremo() { return extremo; }
    public void setExtremo(int extremo) { this.extremo = extremo; }
    public boolean isPublica() { return publica; }
    public void setPublica(boolean publica) { this.publica = publica; }
    public boolean isMestre() { return mestre; }
    public void setMestre(boolean mestre) { this.mestre = mestre; }
    public boolean isPedido() { return pedido; }
    public void setPedido(boolean pedido) { this.pedido = pedido; }
    public Long getPedidoId() { return pedidoId; }
    public void setPedidoId(Long pedidoId) { this.pedidoId = pedidoId; }
    public Instant getCriadoEm() { return criadoEm; }
}
