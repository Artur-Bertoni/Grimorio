package br.com.hexatombe.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "hexatombe")
public class AppProps {

    /** Pasta onde PDFs e audios ficam (volume do Railway). */
    private String midiaDir = "/data/midia";

    /** Login do mestre criado no primeiro boot. */
    private String mestreLogin = "mestre";

    /** Senha do mestre criada no primeiro boot. */
    private String mestreSenha = "";

    public String getMidiaDir() { return midiaDir; }
    public void setMidiaDir(String midiaDir) { this.midiaDir = midiaDir; }
    public String getMestreLogin() { return mestreLogin; }
    public void setMestreLogin(String mestreLogin) { this.mestreLogin = mestreLogin; }
    public String getMestreSenha() { return mestreSenha; }
    public void setMestreSenha(String mestreSenha) { this.mestreSenha = mestreSenha; }
}
