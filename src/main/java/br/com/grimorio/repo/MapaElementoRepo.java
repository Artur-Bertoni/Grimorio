package br.com.grimorio.repo;

import br.com.grimorio.model.MapaElemento;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface MapaElementoRepo extends JpaRepository<MapaElemento, Long> {
    List<MapaElemento> findByMapaIdOrderByOrdemAscIdAsc(Long mapaId);
    long countByMapaId(Long mapaId);
    void deleteByMapaId(Long mapaId);
    void deleteByCampanhaId(Long campanhaId);
}
