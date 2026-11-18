package br.com.grimorio.repo;

import br.com.grimorio.model.Mapa;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface MapaRepo extends JpaRepository<Mapa, Long> {
    List<Mapa> findByCampanhaIdOrderByOrdemAscIdAsc(Long campanhaId);
    Optional<Mapa> findFirstByCampanhaIdAndAtivoTrue(Long campanhaId);
    long countByCampanhaId(Long campanhaId);
    void deleteByCampanhaId(Long campanhaId);
}
