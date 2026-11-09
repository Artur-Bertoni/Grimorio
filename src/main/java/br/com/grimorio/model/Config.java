package br.com.grimorio.model;

import jakarta.persistence.*;

@Entity
@Table(name = "config")
public class Config {

    @Id
    @Column(length = 60)
    private String chave;

    @Column(length = 10000000)
    private String valor;

    public Config() { }

    public Config(String chave, String valor) {
        this.chave = chave;
        this.valor = valor;
    }

    public String getChave() { return chave; }
    public void setChave(String chave) { this.chave = chave; }
    public String getValor() { return valor; }
    public void setValor(String valor) { this.valor = valor; }
}
