package br.com.grimorio.repo;

import br.com.grimorio.model.Documento;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface DocumentoRepo extends JpaRepository<Documento, Long> {
    Optional<Documento> findByCampanhaIdAndChave(Long campanhaId, String chave);

    /** So a versao: a tela de cada jogador pergunta isto a cada 6 s, e o conteudo pode ter megas. */
    @Query("select d.versao from Documento d where d.campanhaId = :cid and d.chave = :chave")
    Optional<Long> versaoDe(@Param("cid") Long campanhaId, @Param("chave") String chave);
    List<Documento> findByCampanhaId(Long campanhaId);
    void deleteByCampanhaId(Long campanhaId);
}
