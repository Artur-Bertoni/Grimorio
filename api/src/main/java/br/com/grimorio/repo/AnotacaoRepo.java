package br.com.grimorio.repo;

import br.com.grimorio.model.Anotacao;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface AnotacaoRepo extends JpaRepository<Anotacao, Long> {
    Optional<Anotacao> findByCampanhaIdAndUsuarioId(Long campanhaId, Long usuarioId);
    void deleteByCampanhaId(Long campanhaId);
}
