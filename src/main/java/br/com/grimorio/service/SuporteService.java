package br.com.grimorio.service;

import br.com.grimorio.config.AppProps;
import br.com.grimorio.model.Chamado;
import br.com.grimorio.model.Usuario;
import br.com.grimorio.repo.ChamadoRepo;
import jakarta.mail.*;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;

/** Contato com o suporte: grava a mensagem e tenta mandar por e-mail. O SMTP e o destino
 *  ficam na tabela config (Administracao), como a chave da IA; o destino padrao vem de
 *  grimorio.suporte-email. A senha do SMTP nunca volta para o navegador. */
@Service
public class SuporteService {

    private static final Logger log = LoggerFactory.getLogger(SuporteService.class);
    public static final String SMTP_HOST = "smtp.host", SMTP_PORTA = "smtp.porta", SMTP_USUARIO = "smtp.usuario",
            SMTP_SENHA = "smtp.senha", SMTP_REMETENTE = "smtp.remetente", DESTINO = "suporte.email";
    private static final int POR_HORA = 8;
    private static final DateTimeFormatter QUANDO = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm").withZone(ZoneId.of("America/Sao_Paulo"));

    private final ChamadoRepo chamados;
    private final ConfigService config;
    private final AppProps props;

    public SuporteService(ChamadoRepo chamados, ConfigService config, AppProps props) {
        this.chamados = chamados;
        this.config = config;
        this.props = props;
    }

    public String destino() { return config.get(DESTINO, props.getSuporteEmail()); }
    public boolean smtpConfigurado() { return !config.get(SMTP_HOST, "").isBlank(); }

    public Map<String, Object> abrir(Usuario u, String assunto, String mensagem, String contato, String contexto) {
        String a = limpa(assunto, 120), msg = mensagem == null ? "" : mensagem.trim();
        if (a.isEmpty()) a = "Sem assunto";
        if (msg.length() < 5) throw new IllegalArgumentException("escreva um pouco mais sobre o que aconteceu");
        if (msg.length() > 10000) msg = msg.substring(0, 10000);
        String ct = limpa(contato, 200);
        if (!ct.isEmpty() && !ct.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+"))
            throw new IllegalArgumentException("o e-mail para resposta parece errado");
        /* freio contra clique repetido e abuso: o e-mail do suporte e de uma pessoa */
        if (chamados.countByUsuarioIdAndCriadoEmAfter(u.getId(), Instant.now().minus(Duration.ofHours(1))) >= POR_HORA)
            throw new IllegalArgumentException("muitas mensagens em pouco tempo; tente de novo daqui a pouco");

        Chamado c = new Chamado();
        c.setUsuarioId(u.getId());
        c.setAutorNome(limpa(u.getNome(), 80));
        c.setAutorLogin(limpa(u.getLogin(), 60));
        c.setContato(ct.isEmpty() ? null : ct);
        c.setAssunto(a);
        c.setMensagem(msg);
        c.setContexto(limpa(contexto, 1000));
        chamados.save(c);

        String motivo = null;
        if (!smtpConfigurado()) {
            motivo = "o envio de e-mail não está configurado nesta instância";
        } else {
            try {
                enviar(destino(), c.getContato(), "[Grimório] " + a, corpo(c));
                c.setEnviado(true);
            } catch (Exception e) {
                log.warn("Chamado {} gravado, mas o e-mail nao saiu: {}", c.getId(), e.toString());
                motivo = "o e-mail não saiu agora";
                c.setErro(limpa(e.getMessage() == null ? e.toString() : e.getMessage(), 300));
            }
            chamados.save(c);
        }
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", c.getId());
        r.put("enviado", c.isEnviado());
        if (motivo != null) r.put("motivo", motivo);
        return r;
    }

    public List<Map<String, Object>> recentes() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Chamado c : chamados.findTop100ByOrderByCriadoEmDesc()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", c.getId());
            m.put("autor", c.getAutorNome() + " (" + c.getAutorLogin() + ")");
            m.put("contato", c.getContato());
            m.put("assunto", c.getAssunto());
            m.put("mensagem", c.getMensagem());
            m.put("contexto", c.getContexto());
            m.put("enviado", c.isEnviado());
            m.put("erro", c.getErro());
            m.put("em", c.getCriadoEm().toEpochMilli());
            out.add(m);
        }
        return out;
    }

    /** Botao "enviar e-mail de teste" da Administracao: devolve o erro do SMTP por extenso. */
    public void testar() throws Exception {
        if (!smtpConfigurado()) throw new IllegalStateException("preencha o servidor SMTP primeiro");
        enviar(destino(), null, "[Grimório] teste do e-mail de suporte",
                "Se esta mensagem chegou, o contato com o suporte do Grimório está funcionando.");
    }

    private String corpo(Chamado c) {
        return "Mensagem enviada pelo Grimório em " + QUANDO.format(c.getCriadoEm()) + "\n\n"
                + "De: " + c.getAutorNome() + " (login " + c.getAutorLogin() + ")\n"
                + "Responder para: " + (c.getContato() == null ? "não informou e-mail" : c.getContato()) + "\n"
                + "Assunto: " + c.getAssunto() + "\n"
                + (c.getContexto() == null || c.getContexto().isBlank() ? "" : "Onde: " + c.getContexto() + "\n")
                + "\n" + c.getMensagem() + "\n";
    }

    private void enviar(String para, String responderPara, String assunto, String corpo) throws Exception {
        String host = config.get(SMTP_HOST, "").trim();
        int porta;
        try { porta = Integer.parseInt(config.get(SMTP_PORTA, "587").trim()); } catch (NumberFormatException e) { porta = 587; }
        String usuario = config.get(SMTP_USUARIO, "").trim(), senha = config.get(SMTP_SENHA, "");
        String de = config.get(SMTP_REMETENTE, usuario).trim();
        if (de.isEmpty()) de = para;
        Properties p = new Properties();
        p.put("mail.smtp.host", host);
        p.put("mail.smtp.port", String.valueOf(porta));
        p.put("mail.smtp.auth", String.valueOf(!usuario.isEmpty()));
        /* 465 e SSL direto; o resto (587, 25) sobe para TLS com STARTTLS */
        if (porta == 465) p.put("mail.smtp.ssl.enable", "true");
        else p.put("mail.smtp.starttls.enable", "true");
        p.put("mail.smtp.connectiontimeout", "10000");
        p.put("mail.smtp.timeout", "15000");
        p.put("mail.smtp.writetimeout", "15000");
        Session s = usuario.isEmpty() ? Session.getInstance(p) : Session.getInstance(p, new Authenticator() {
            @Override protected PasswordAuthentication getPasswordAuthentication() {
                return new PasswordAuthentication(usuario, senha);
            }
        });
        MimeMessage m = new MimeMessage(s);
        m.setFrom(new InternetAddress(de));
        m.setRecipients(Message.RecipientType.TO, InternetAddress.parse(para));
        if (responderPara != null && !responderPara.isBlank()) m.setReplyTo(InternetAddress.parse(responderPara));
        m.setSubject(assunto, "UTF-8");
        m.setText(corpo, "UTF-8");
        Transport.send(m);
    }

    private static String limpa(String s, int max) {
        if (s == null) return "";
        String t = s.trim().replaceAll("[\\r\\n]+", " ");
        return t.length() > max ? t.substring(0, max) : t;
    }
}
