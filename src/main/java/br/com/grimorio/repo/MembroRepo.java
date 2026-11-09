package br.com.grimorio.repo;

import br.com.grimorio.model.Membro;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface MembroRepo extends JpaRepository<Membro, Long> {
    Optional<Membro> findByCampanhaIdAndUsuarioId(Long campanhaId, Long usuarioId);
    List<Membro> findByUsuarioId(Long usuarioId);
    List<Membro> findByCampanhaIdOrderByPapelAscIdAsc(Long campanhaId);
    void deleteByCampanhaId(Long campanhaId);
    long countByCampanhaId(Long campanhaId);
}
