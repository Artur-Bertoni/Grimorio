package br.com.grimorio.service;

import br.com.grimorio.model.Documento;
import br.com.grimorio.repo.CampanhaRepo;
import br.com.grimorio.repo.DocumentoRepo;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
public class DocumentoService {

    public static final String GUIA = "guia";
    public static final String MESA = "mesa";

    private final DocumentoRepo repo;
    private final CampanhaRepo campanhas;

    public DocumentoService(DocumentoRepo repo, CampanhaRepo campanhas) {
        this.repo = repo;
        this.campanhas = campanhas;
    }

    @Transactional(readOnly = true)
    public Documento ler(Long campanhaId, String chave) {
        return repo.findByCampanhaIdAndChave(campanhaId, chave)
                .orElseGet(() -> new Documento(campanhaId, chave, "{}"));
    }

    /** A versao sem trazer o conteudo; documento que ainda nao existe esta na versao 0. */
    @Transactional(readOnly = true)
    public long versao(Long campanhaId, String chave) {
        return repo.versaoDe(campanhaId, chave).orElse(0L);
    }

    @Transactional
    public long gravar(Long campanhaId, String chave, String conteudo, long versaoEsperada) {
        Documento d = repo.findByCampanhaIdAndChave(campanhaId, chave)
                .orElseGet(() -> new Documento(campanhaId, chave, "{}"));
        if (versaoEsperada >= 0 && d.getVersao() != versaoEsperada)
            throw new ConflitoException(d.getVersao());
        d.setConteudo(conteudo == null ? "{}" : conteudo);
        d.setVersao(d.getVersao() + 1);
        d.setAtualizadoEm(Instant.now());
        repo.save(d);
        // o cartao da lista de campanhas le daqui a sessao que mostra, sem abrir o documento
        if (GUIA.equals(chave)) campanhas.gravaSessaoGuia(campanhaId, UltimaSessao.doGuia(d.getConteudo()));
        else if (MESA.equals(chave)) campanhas.gravaSessaoMesa(campanhaId, UltimaSessao.daMesa(d.getConteudo()));
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
