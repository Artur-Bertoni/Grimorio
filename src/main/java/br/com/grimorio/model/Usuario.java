package br.com.grimorio.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "usuario")
public class Usuario {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 60)
    private String login;

    @Column(nullable = false, length = 80)
    private String nome;

    @Column(name = "senha_hash", nullable = false, length = 100)
    private String senhaHash;

    /* Papel global, de quando a instancia tinha uma campanha so. Hoje o papel e por campanha
       (Membro) e ninguem le este campo. Ele fica porque a coluna existe NOT NULL nos bancos em
       uso: tirar o campo faria qualquer cadastro novo falhar no insert. */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Papel papel = Papel.JOGADOR;

    /**
     * Administrador da instancia: mexe em usuarios, chave da IA e registro.
     * O columnDefinition tem DEFAULT de proposito: sem ele o Postgres recusa
     * adicionar uma coluna NOT NULL numa tabela que ja tem linhas.
     */
    @Column(nullable = false, columnDefinition = "boolean not null default false")
    private boolean admin = false;

    @Column(nullable = false, columnDefinition = "boolean not null default true")
    private boolean ativo = true;

    @Column(name = "criado_em", nullable = false)
    private Instant criadoEm = Instant.now();

    /* E-mail opcional, so para recuperar a senha. Coluna anulavel: entra em tabela com linhas
       sem precisar de DEFAULT (ver a armadilha do ddl-auto no CLAUDE.md). */
    @Column(length = 200)
    private String email;

    /* Redefinicao de senha: guarda o SHA-256 do token (nunca o token) e ate quando ele vale. */
    @Column(name = "reset_hash", length = 64)
    private String resetHash;

    @Column(name = "reset_ate")
    private Instant resetAte;

    /* orientacao ja vista, separada por virgula: guias ("guia-inicio-m", "guia-m-elenco"...) e primeiros passos
       dispensados ("passos-{campanha}"). Fica na conta para nao voltar em outro aparelho. */
    @Column(length = 1000)
    private String tours;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getLogin() { return login; }
    public void setLogin(String login) { this.login = login; }
    public String getNome() { return nome; }
    public void setNome(String nome) { this.nome = nome; }
    public String getSenhaHash() { return senhaHash; }
    public void setSenhaHash(String senhaHash) { this.senhaHash = senhaHash; }
    public Papel getPapel() { return papel; }
    public void setPapel(Papel papel) { this.papel = papel; }
    public boolean isAdmin() { return admin; }
    public void setAdmin(boolean admin) { this.admin = admin; }
    public boolean isAtivo() { return ativo; }
    public void setAtivo(boolean ativo) { this.ativo = ativo; }
    public Instant getCriadoEm() { return criadoEm; }
    public void setCriadoEm(Instant criadoEm) { this.criadoEm = criadoEm; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getResetHash() { return resetHash; }
    public void setResetHash(String resetHash) { this.resetHash = resetHash; }
    public Instant getResetAte() { return resetAte; }
    public void setResetAte(Instant resetAte) { this.resetAte = resetAte; }
    public String getTours() { return tours; }
    public void setTours(String tours) { this.tours = tours; }
}
