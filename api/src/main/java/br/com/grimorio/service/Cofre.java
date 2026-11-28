package br.com.grimorio.service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Path;
import java.util.Optional;

/**
 * Onde moram os arquivos originais (PDF, audio, imagem, zip de modelo). Em producao e o bucket S3 do
 * Railway ({@link CofreS3}); sem as variaveis S3_* (na maquina, no CI) e uma pasta ({@link CofrePasta}).
 *
 * <p>A midia entra pela chave {@code midia/{sha256}}: o mesmo conteudo, de qualquer campanha e com
 * qualquer nome, e um objeto so. Quem diz a que campanha e nome ele pertence e a tabela midia. Por
 * isso nenhum objeto e reescrito: conteudo novo e outra chave.
 */
public interface Cofre {

    boolean existe(String chave) throws IOException;

    /** Tamanho em bytes, ou -1 se a chave nao existe. */
    long tamanho(String chave) throws IOException;

    /** Guarda o arquivo na chave. Com {@code podeMover}, a pasta pode mover em vez de copiar
     *  (o arquivo de origem deixa de existir). */
    void guardar(String chave, Path arquivo, boolean podeMover) throws IOException;

    InputStream abrir(String chave) throws IOException;

    /** Os bytes de {@code inicio} a {@code fim}, inclusive (o que o pdf.js e o audio pedem com Range). */
    InputStream abrir(String chave, long inicio, long fim) throws IOException;

    void apagar(String chave) throws IOException;

    /** O arquivo no disco, quando o cofre e uma pasta: ler direto poupa a copia para o cache. */
    default Optional<Path> arquivoLocal(String chave) { return Optional.empty(); }

    /** Para o painel da Administracao. */
    String descricao();

    boolean remoto();
}
