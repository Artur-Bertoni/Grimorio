package br.com.grimorio.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "midia")
public class Midia {

    public enum Tipo { PDF, AUDIO, IMG }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "campanha_id")
    private Long campanhaId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Tipo tipo;

    /** Abreviacao do livro (LB, SH, AS01...) ou chave normalizada da faixa. */
    @Column(nullable = false, length = 120)
    private String chave;

    @Column(nullable = false, length = 200)
    private String nome;

    @Column(length = 60)
    private String categoria;

    /** Caminho relativo dentro da pasta de midia. */
    @Column(nullable = false, length = 300)
    private String arquivo;

    @Column(nullable = false)
    private long tamanho;

    @Column(nullable = false)
    private int paginas;

    /** Livro visivel na busca dos jogadores. Falso = so o mestre ve. */
    @Column(nullable = false)
    private boolean publico = false;

    @Column(name = "enviado_em", nullable = false)
    private Instant enviadoEm = Instant.now();

    public Long getId() { return id; }
    public Long getCampanhaId() { return campanhaId; }
    public void setCampanhaId(Long campanhaId) { this.campanhaId = campanhaId; }
    public void setId(Long id) { this.id = id; }
    public Tipo getTipo() { return tipo; }
    public void setTipo(Tipo tipo) { this.tipo = tipo; }
    public String getChave() { return chave; }
    public void setChave(String chave) { this.chave = chave; }
    public String getNome() { return nome; }
    public void setNome(String nome) { this.nome = nome; }
    public String getCategoria() { return categoria; }
    public void setCategoria(String categoria) { this.categoria = categoria; }
    public String getArquivo() { return arquivo; }
    public void setArquivo(String arquivo) { this.arquivo = arquivo; }
    public long getTamanho() { return tamanho; }
    public void setTamanho(long tamanho) { this.tamanho = tamanho; }
    public boolean isPublico() { return publico; }
    public void setPublico(boolean publico) { this.publico = publico; }
    public int getPaginas() { return paginas; }
    public void setPaginas(int paginas) { this.paginas = paginas; }
    public Instant getEnviadoEm() { return enviadoEm; }
    public void setEnviadoEm(Instant enviadoEm) { this.enviadoEm = enviadoEm; }
}
