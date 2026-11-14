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

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
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
            SMTP_SENHA = "smtp.senha", SMTP_REMETENTE = "smtp.remetente", DESTINO = "suporte.email",
            EMAIL_PROVEDOR = "email.provedor", EMAIL_CHAVE = "email.apiKey";
    /* Por que o e-mail tem tres caminhos: hospedagem barata (Railway Trial/Hobby) bloqueia a saida
       SMTP (portas 25/465/587), e ai nenhuma senha resolve. Brevo e Resend falam HTTPS. */
    public static final Set<String> PROVEDORES = Set.of("smtp", "brevo", "resend");
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final ObjectMapper om = JsonMapper.builder().build();
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
    public String provedor() {
        String p = config.get(EMAIL_PROVEDOR, "smtp").trim().toLowerCase();
        return PROVEDORES.contains(p) ? p : "smtp";
    }
    public boolean envioConfigurado() {
        return provedor().equals("smtp") ? !config.get(SMTP_HOST, "").isBlank() : !config.get(EMAIL_CHAVE, "").isBlank();
    }

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
        if (!envioConfigurado()) {
            motivo = "o envio de e-mail não está configurado nesta instância";
        } else {
            try {
                enviar(destino(), c.getContato(), "[Grimório] " + a, corpo(c));
                c.setEnviado(true);
            } catch (Exception e) {
                log.warn("Chamado {} gravado, mas o e-mail nao saiu: {}", c.getId(), e.toString());
                motivo = "o e-mail não saiu agora";
                c.setErro(limpa(explica(e), 300));
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
        if (!envioConfigurado()) throw new IllegalStateException(provedor().equals("smtp")
                ? "preencha o servidor SMTP primeiro" : "cole a chave do provedor primeiro");
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

    /** Mensagem para a tela: o erro cru do SMTP ("Couldn't connect to host") nao diz que a causa
     *  costuma ser o bloqueio da hospedagem, e e o que mais confunde. */
    public String explicar(Throwable e) { return explica(e); }

    private String explica(Throwable e) {
        String m = e.getMessage() == null ? e.toString() : e.getMessage();
        String baixo = m.toLowerCase();
        /* erro de rede (nao de senha): o que a hospedagem que bloqueia SMTP produz, em varias formas */
        boolean rede = java.util.stream.Stream.of("connect", "timed out", "timeout", "reading response", "refused", "unreachable", "reset", "broken pipe").anyMatch(baixo::contains);
        if (provedor().equals("smtp") && rede && !baixo.contains("auth") && !baixo.contains("password") && !baixo.contains("credential"))
            return m + " — o servidor provavelmente bloqueia a saída SMTP (Railway Trial e Hobby bloqueiam). Troque o provedor para Brevo ou Resend, que usam HTTPS.";
        return m;
    }

    private void enviar(String para, String responderPara, String assunto, String corpo) throws Exception {
        switch (provedor()) {
            case "brevo" -> enviarBrevo(para, responderPara, assunto, corpo);
            case "resend" -> enviarResend(para, responderPara, assunto, corpo);
            default -> enviarSmtp(para, responderPara, assunto, corpo);
        }
    }

    private String base(String padrao) {
        String b = props.getEmailApiBase();
        return b == null || b.isBlank() ? padrao : b.replaceAll("/+$", "");
    }

    /* Resend: sem dominio proprio so manda de onboarding@resend.dev e so para o e-mail da conta
       Resend; com dominio verificado, de qualquer endereco dele. */
    private void enviarResend(String para, String responderPara, String assunto, String corpo) throws Exception {
        String de = config.get(SMTP_REMETENTE, "").trim();
        ObjectNode j = om.createObjectNode();
        j.put("from", de.isEmpty() ? "Grimório <onboarding@resend.dev>" : de);
        j.putArray("to").add(para);
        j.put("subject", assunto);
        j.put("text", corpo);
        if (responderPara != null && !responderPara.isBlank()) j.put("reply_to", responderPara);
        postJson(base("https://api.resend.com") + "/emails", "Authorization", "Bearer " + config.get(EMAIL_CHAVE, "").trim(), j);
    }

    /* Brevo: o remetente precisa estar verificado na conta Brevo (Remetentes e IPs). */
    private void enviarBrevo(String para, String responderPara, String assunto, String corpo) throws Exception {
        String de = config.get(SMTP_REMETENTE, "").trim();
        if (de.isEmpty()) throw new IllegalStateException("o Brevo exige um remetente verificado: preencha o campo Remetente");
        ObjectNode j = om.createObjectNode();
        j.putObject("sender").put("email", de.replaceAll(".*<(.+)>.*", "$1")).put("name", "Grimório");
        j.putArray("to").addObject().put("email", para);
        if (responderPara != null && !responderPara.isBlank()) j.putObject("replyTo").put("email", responderPara);
        j.put("subject", assunto);
        j.put("textContent", corpo);
        postJson(base("https://api.brevo.com") + "/v3/smtp/email", "api-key", config.get(EMAIL_CHAVE, "").trim(), j);
    }

    private void postJson(String url, String cabecalho, String valor, ObjectNode corpo) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(20))
                .header("Content-Type", "application/json").header("Accept", "application/json")
                .header(cabecalho, valor)
                .POST(HttpRequest.BodyPublishers.ofString(om.writeValueAsString(corpo), StandardCharsets.UTF_8)).build();
        HttpResponse<String> r = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (r.statusCode() / 100 != 2) {
            String detalhe = r.body();
            try { JsonNode n = om.readTree(r.body()); detalhe = n.path("message").asString(n.path("error").asString(r.body())); } catch (Exception ignore) { }
            throw new IllegalStateException("o provedor respondeu " + r.statusCode() + ": " + limpa(detalhe, 200));
        }
    }

    private void enviarSmtp(String para, String responderPara, String assunto, String corpo) throws Exception {
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
