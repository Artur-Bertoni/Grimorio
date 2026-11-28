package br.com.grimorio.service;

/** O volume de midia nao tem espaco para o arquivo. Vira 507 com codigo proprio, para a
 *  tela mostrar o aviso de armazenamento cheio em vez de um erro generico. */
public class ArmazenamentoCheioException extends RuntimeException {
    public ArmazenamentoCheioException() {
        super("o armazenamento esta cheio");
    }
}
