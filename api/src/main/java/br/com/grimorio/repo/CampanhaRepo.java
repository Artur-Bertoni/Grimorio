package br.com.grimorio.repo;

import br.com.grimorio.model.Campanha;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface CampanhaRepo extends JpaRepository<Campanha, Long> {
    List<Campanha> findByIdInOrderByNomeAsc(List<Long> ids);
    List<Campanha> findAllByOrderByNomeAsc();
    long countByDonoId(Long donoId);

    /* update direto: gravar o guia ou a mesa nao carrega a campanha so para trocar o resumo do cartao */
    @Modifying
    @Query("update Campanha c set c.sessaoGuia = :v where c.id = :id")
    void gravaSessaoGuia(@Param("id") Long id, @Param("v") String v);

    @Modifying
    @Query("update Campanha c set c.sessaoMesa = :v where c.id = :id")
    void gravaSessaoMesa(@Param("id") Long id, @Param("v") String v);
}
