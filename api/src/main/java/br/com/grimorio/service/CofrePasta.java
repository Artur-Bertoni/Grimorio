package br.com.grimorio.service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Optional;

/** O cofre numa pasta: na maquina e no CI, onde nao ha bucket. A chave vira o caminho. */
public class CofrePasta implements Cofre {

    private final Path raiz;

    public CofrePasta(Path raiz) {
        this.raiz = raiz.toAbsolutePath().normalize();
    }

    private Path caminho(String chave) {
        Path p = raiz.resolve(chave).normalize();
        if (!p.startsWith(raiz)) throw new IllegalArgumentException("chave invalida");
        return p;
    }

    @Override
    public boolean existe(String chave) {
        return Files.isRegularFile(caminho(chave));
    }

    @Override
    public long tamanho(String chave) throws IOException {
        Path p = caminho(chave);
        return Files.isRegularFile(p) ? Files.size(p) : -1;
    }

    @Override
    public void guardar(String chave, Path arquivo, boolean podeMover) throws IOException {
        Path destino = caminho(chave);
        Files.createDirectories(destino.getParent());
        Path tmp = destino.resolveSibling(destino.getFileName() + ".parcial");
        if (podeMover) Files.move(arquivo, tmp, StandardCopyOption.REPLACE_EXISTING);
        else Files.copy(arquivo, tmp, StandardCopyOption.REPLACE_EXISTING);
        Files.move(tmp, destino, StandardCopyOption.REPLACE_EXISTING);
    }

    @Override
    public InputStream abrir(String chave) throws IOException {
        return Files.newInputStream(caminho(chave));
    }

    @Override
    public InputStream abrir(String chave, long inicio, long fim) throws IOException {
        return ArmazenamentoMidia.faixa(Files.newInputStream(caminho(chave)), inicio, fim);
    }

    @Override
    public void apagar(String chave) throws IOException {
        Files.deleteIfExists(caminho(chave));
    }

    @Override
    public Optional<Path> arquivoLocal(String chave) {
        Path p = caminho(chave);
        return Files.isRegularFile(p) ? Optional.of(p) : Optional.empty();
    }

    @Override
    public String descricao() {
        return "pasta " + raiz;
    }

    @Override
    public boolean remoto() {
        return false;
    }
}
