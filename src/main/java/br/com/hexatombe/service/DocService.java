package br.com.hexatombe.service;

import br.com.hexatombe.model.Doc;
import br.com.hexatombe.repo.DocRepo;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
public class DocService {

    public static final String GUIA = "guia";
    public static final String MESA = "mesa";

    private final DocRepo repo;

    public DocService(DocRepo repo) {
        this.repo = repo;
    }

    @Transactional(readOnly = true)
    public Doc ler(String chave) {
        return repo.findById(chave).orElseGet(() -> new Doc(chave, "{}"));
    }

    /**
     * Grava com travamento otimista. versaoEsperada &lt; 0 forca a gravacao.
     * Devolve a nova versao; estoura ConflitoException se alguem gravou antes.
     */
    @Transactional
    public long gravar(String chave, String conteudo, long versaoEsperada) {
        Doc d = repo.findById(chave).orElseGet(() -> new Doc(chave, "{}"));
        if (versaoEsperada >= 0 && d.getVersao() != versaoEsperada) {
            throw new ConflitoException(d.getVersao());
        }
        d.setConteudo(conteudo);
        d.setVersao(d.getVersao() + 1);
        d.setAtualizadoEm(Instant.now());
        repo.save(d);
        return d.getVersao();
    }

    public static class ConflitoException extends RuntimeException {
        private final long versaoAtual;
        public ConflitoException(long versaoAtual) {
            super("versao desatualizada, a atual e " + versaoAtual);
            this.versaoAtual = versaoAtual;
        }
        public long getVersaoAtual() { return versaoAtual; }
    }
}
