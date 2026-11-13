package br.com.grimorio.repo;

import br.com.grimorio.model.Ficha;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface FichaRepo extends JpaRepository<Ficha, Long> {
    List<Ficha> findByCampanhaIdOrderByNomeAsc(Long campanhaId);
    List<Ficha> findByCampanhaIdAndUsuarioIdOrderByNomeAsc(Long campanhaId, Long usuarioId);
    long countByCampanhaIdAndUsuarioId(Long campanhaId, Long usuarioId);
    void deleteByCampanhaId(Long campanhaId);
}
