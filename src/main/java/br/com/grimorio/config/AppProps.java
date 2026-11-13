package br.com.grimorio.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "grimorio")
public class AppProps {

    /** Pasta onde PDFs e audios ficam (volume do Railway). */
    private String midiaDir = "/data/midia";

    /** Para onde vai o contato do suporte. A Administracao pode trocar pela tela. */
    private String suporteEmail = "artur_b_santos@hotmail.com";


    public String getMidiaDir() { return midiaDir; }
    public void setMidiaDir(String midiaDir) { this.midiaDir = midiaDir; }
    public String getSuporteEmail() { return suporteEmail; }
    public void setSuporteEmail(String suporteEmail) { this.suporteEmail = suporteEmail; }
}
