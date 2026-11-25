package br.com.grimorio.model;

import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * Contagem de uso, anonima e agregada: quantas vezes um evento ("tela:elenco", "rolagem")
 * aconteceu num dia, no servidor todo. Nao guarda quem, nem campanha, nem endereco: so o
 * numero. E o que o administrador ve em Administracao › Uso, e nada sai do servidor.
 */
@Entity
@Table(name = "metrica", uniqueConstraints = @UniqueConstraint(columnNames = { "dia", "evento" }))
public class Metrica {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private LocalDate dia;

    @Column(nullable = false, length = 60, columnDefinition = "varchar(60) not null default ''")
    private String evento = "";

    @Column(nullable = false, columnDefinition = "bigint not null default 0")
    private long total = 0;

    public Long getId() { return id; }
    public LocalDate getDia() { return dia; }
    public void setDia(LocalDate dia) { this.dia = dia; }
    public String getEvento() { return evento; }
    public void setEvento(String evento) { this.evento = evento; }
    public long getTotal() { return total; }
    public void setTotal(long total) { this.total = total; }
}
