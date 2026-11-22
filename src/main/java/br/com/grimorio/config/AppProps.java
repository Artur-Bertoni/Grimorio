package br.com.grimorio.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "grimorio")
public class AppProps {

    /** Pasta onde PDFs e audios ficam (volume do Railway). */
    private String midiaDir = "/data/midia";

    /** So para teste: base das APIs de e-mail (Brevo/Resend). Vazio usa os enderecos de verdade. */
    private String emailApiBase = "";

    /** Para onde vai o contato do suporte. A Administracao pode trocar pela tela. */
    private String suporteEmail = "artur_b_santos@hotmail.com";


    /**
     * Endereco publico da instancia (https://grimorio.exemplo.com), usado nos links que saem por
     * e-mail. Vazio cai para o RAILWAY_PUBLIC_DOMAIN, que o Railway define sozinho, e so entao para
     * o endereco do pedido. Montar o link pelo cabecalho Host deixava qualquer um pedir a
     * redefinicao da senha alheia com Host: site-do-atacante e receber o token pelo clique da vitima.
     */
    private String urlPublica = "";

    public String getUrlPublica() { return urlPublica; }
    public void setUrlPublica(String urlPublica) { this.urlPublica = urlPublica; }

    /** O endereco publico ja resolvido, sem barra no fim, ou vazio se ninguem configurou. */
    public String urlPublicaResolvida() {
        String u = urlPublica == null ? "" : urlPublica.trim();
        if (u.isEmpty()) {
            String railway = System.getenv("RAILWAY_PUBLIC_DOMAIN");
            if (railway != null && !railway.isBlank()) u = "https://" + railway.trim();
        }
        while (u.endsWith("/")) u = u.substring(0, u.length() - 1);
        return u;
    }

    public String getMidiaDir() { return midiaDir; }
    public void setMidiaDir(String midiaDir) { this.midiaDir = midiaDir; }
    public String getEmailApiBase() { return emailApiBase; }
    public void setEmailApiBase(String emailApiBase) { this.emailApiBase = emailApiBase; }
    public String getSuporteEmail() { return suporteEmail; }
    public void setSuporteEmail(String suporteEmail) { this.suporteEmail = suporteEmail; }
}
