package br.com.grimorio.repo;

import br.com.grimorio.model.MapaHistorico;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MapaHistoricoRepo extends JpaRepository<MapaHistorico, Long> {
    void deleteByMapaId(Long mapaId);
    void deleteByCampanhaId(Long campanhaId);
}
