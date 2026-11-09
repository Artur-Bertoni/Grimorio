package br.com.grimorio.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "grimorio")
public class AppProps {

    /** Pasta onde PDFs e audios ficam (volume do Railway). */
    private String midiaDir = "/data/midia";

    /** Login do administrador criado no primeiro boot. */
    private String adminLogin = "admin";

    /** Senha do administrador criada no primeiro boot. */
    private String adminSenha = "";

    public String getMidiaDir() { return midiaDir; }
    public void setMidiaDir(String midiaDir) { this.midiaDir = midiaDir; }
    public String getAdminLogin() { return adminLogin; }
    public void setAdminLogin(String adminLogin) { this.adminLogin = adminLogin; }
    public String getAdminSenha() { return adminSenha; }
    public void setAdminSenha(String adminSenha) { this.adminSenha = adminSenha; }
}
