package br.com.grimorio.repo;

import br.com.grimorio.model.Chamado;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.Instant;
import java.util.List;

public interface ChamadoRepo extends JpaRepository<Chamado, Long> {
    List<Chamado> findTop100ByOrderByCriadoEmDesc();
    long countByUsuarioIdAndCriadoEmAfter(Long usuarioId, Instant desde);
    long countByEnviadoFalse();
}
