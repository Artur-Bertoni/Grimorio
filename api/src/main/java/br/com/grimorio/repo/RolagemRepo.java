package br.com.grimorio.repo;

import br.com.grimorio.model.Rolagem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import java.util.List;

public interface RolagemRepo extends JpaRepository<Rolagem, Long> {
    List<Rolagem> findTop60ByCampanhaIdAndIdGreaterThanOrderByIdDesc(Long campanhaId, Long desde);
    void deleteByCampanhaId(Long campanhaId);

    /* guarda so as ultimas: rolagem e coisa do momento, nao historico */
    @Modifying
    @Query("delete from Rolagem r where r.campanhaId = ?1 and r.id < ?2")
    int apagarAntigas(Long campanhaId, Long antesDe);
}
