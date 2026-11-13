package br.com.grimorio.model;

import jakarta.persistence.*;
import java.time.Instant;

/** Mensagem para o suporte. Fica no banco sempre, mesmo quando o e-mail nao sai:
 *  instancia sem SMTP configurado nao pode perder a reclamacao de ninguem. */
@Entity
@Table(name = "chamado")
public class Chamado {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "usuario_id", nullable = false)
    private Long usuarioId;

    @Column(name = "autor_nome", nullable = false, length = 80)
    private String autorNome;

    @Column(name = "autor_login", nullable = false, length = 60)
    private String autorLogin;

    /* e-mail que a pessoa deixou para a resposta; a conta nao guarda e-mail */
    @Column(length = 200)
    private String contato;

    @Column(nullable = false, length = 120)
    private String assunto;

    @Column(nullable = false, length = 10000)
    private String mensagem;

    /* campanha, tela e navegador de onde veio: ajuda a reproduzir */
    @Column(length = 1000)
    private String contexto;

    @Column(nullable = false, columnDefinition = "boolean not null default false")
    private boolean enviado = false;

    @Column(length = 300)
    private String erro;

    @Column(name = "criado_em", nullable = false)
    private Instant criadoEm = Instant.now();

    public Long getId() { return id; }
    public Long getUsuarioId() { return usuarioId; }
    public void setUsuarioId(Long usuarioId) { this.usuarioId = usuarioId; }
    public String getAutorNome() { return autorNome; }
    public void setAutorNome(String autorNome) { this.autorNome = autorNome; }
    public String getAutorLogin() { return autorLogin; }
    public void setAutorLogin(String autorLogin) { this.autorLogin = autorLogin; }
    public String getContato() { return contato; }
    public void setContato(String contato) { this.contato = contato; }
    public String getAssunto() { return assunto; }
    public void setAssunto(String assunto) { this.assunto = assunto; }
    public String getMensagem() { return mensagem; }
    public void setMensagem(String mensagem) { this.mensagem = mensagem; }
    public String getContexto() { return contexto; }
    public void setContexto(String contexto) { this.contexto = contexto; }
    public boolean isEnviado() { return enviado; }
    public void setEnviado(boolean enviado) { this.enviado = enviado; }
    public String getErro() { return erro; }
    public void setErro(String erro) { this.erro = erro; }
    public Instant getCriadoEm() { return criadoEm; }
}
