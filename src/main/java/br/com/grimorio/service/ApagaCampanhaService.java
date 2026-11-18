package br.com.grimorio.service;

import br.com.grimorio.repo.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;

/**
 * Apagar uma campanha leva tudo que e dela: documentos, anotacoes, mural, rolagens, fichas,
 * mapas, convites, membros e os arquivos do volume. Tabela nova com {@code campanha_id} entra
 * aqui, senao sobra linha orfa no banco.
 */
@Service
public class ApagaCampanhaService {

    private final CampanhaService camp;
    private final MidiaService midia;
    private final MapaService mapas;
    private final CampanhaRepo campanhas;
    private final DocumentoRepo documentos;
    private final AnotacaoRepo anotacoes;
    private final MuralRepo mural;
    private final MembroRepo membros;
    private final ConviteRepo convites;
    private final RolagemRepo rolagens;
    private final FichaRepo fichas;

    public ApagaCampanhaService(CampanhaService camp, MidiaService midia, MapaService mapas, // NOSONAR: uma dependencia por tabela da campanha, de proposito
                                CampanhaRepo campanhas, DocumentoRepo documentos, AnotacaoRepo anotacoes,
                                MuralRepo mural, MembroRepo membros, ConviteRepo convites,
                                RolagemRepo rolagens, FichaRepo fichas) {
        this.camp = camp;
        this.midia = midia;
        this.mapas = mapas;
        this.campanhas = campanhas;
        this.documentos = documentos;
        this.anotacoes = anotacoes;
        this.mural = mural;
        this.membros = membros;
        this.convites = convites;
        this.rolagens = rolagens;
        this.fichas = fichas;
    }

    /** So quem criou a campanha apaga. Falha no meio desfaz tudo o que ja saiu do banco. */
    @Transactional(rollbackFor = IOException.class)
    public void apagar(Long cid, Long quem) throws IOException {
        camp.exigeDono(cid, quem);
        documentos.deleteByCampanhaId(cid);
        anotacoes.deleteByCampanhaId(cid);
        mural.deleteByCampanhaId(cid);
        rolagens.deleteByCampanhaId(cid);
        fichas.deleteByCampanhaId(cid);
        mapas.apagarDaCampanha(cid);
        convites.deleteByCampanhaId(cid);
        membros.deleteByCampanhaId(cid);
        midia.apagarTudoDaCampanha(cid);
        campanhas.deleteById(cid);
    }
}
