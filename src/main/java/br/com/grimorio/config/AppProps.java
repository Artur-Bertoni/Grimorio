package br.com.grimorio.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "grimorio")
public class AppProps {

    /** Pasta onde PDFs e audios ficam (volume do Railway). */
    private String midiaDir = "/data/midia";


    public String getMidiaDir() { return midiaDir; }
    public void setMidiaDir(String midiaDir) { this.midiaDir = midiaDir; }
}
