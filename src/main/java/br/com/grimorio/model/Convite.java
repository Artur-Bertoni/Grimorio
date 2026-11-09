package br.com.grimorio.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "convite")
public class Convite {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 64)
    private String token;

    @Column(name = "campanha_id", nullable = false)
    private Long campanhaId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Papel papel = Papel.JOGADOR;

    @Column(length = 80)
    private String rotulo = "";

    @Column(name = "usos_max", nullable = false)
    private int usosMax = 1;

    @Column(nullable = false)
    private int usos = 0;

    @Column(name = "expira_em")
    private Instant expiraEm;

    @Column(name = "criado_em", nullable = false)
    private Instant criadoEm = Instant.now();

    public boolean valido() {
        if (usos >= usosMax) return false;
        return expiraEm == null || expiraEm.isAfter(Instant.now());
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }
    public Long getCampanhaId() { return campanhaId; }
    public void setCampanhaId(Long campanhaId) { this.campanhaId = campanhaId; }
    public Papel getPapel() { return papel; }
    public void setPapel(Papel papel) { this.papel = papel; }
    public String getRotulo() { return rotulo; }
    public void setRotulo(String rotulo) { this.rotulo = rotulo; }
    public int getUsosMax() { return usosMax; }
    public void setUsosMax(int usosMax) { this.usosMax = usosMax; }
    public int getUsos() { return usos; }
    public void setUsos(int usos) { this.usos = usos; }
    public Instant getExpiraEm() { return expiraEm; }
    public void setExpiraEm(Instant expiraEm) { this.expiraEm = expiraEm; }
    public Instant getCriadoEm() { return criadoEm; }
    public void setCriadoEm(Instant criadoEm) { this.criadoEm = criadoEm; }
}
