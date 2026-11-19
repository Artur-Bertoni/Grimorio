package br.com.grimorio.repo;

import br.com.grimorio.model.MapaExplorado;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface MapaExploradoRepo extends JpaRepository<MapaExplorado, Long> {
    Optional<MapaExplorado> findFirstByMapaIdAndUsuarioId(Long mapaId, long usuarioId);
    void deleteByMapaId(Long mapaId);
    void deleteByCampanhaId(Long campanhaId);
}
