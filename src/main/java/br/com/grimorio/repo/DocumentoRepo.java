package br.com.grimorio.repo;

import br.com.grimorio.model.Documento;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface DocumentoRepo extends JpaRepository<Documento, Long> {
    Optional<Documento> findByCampanhaIdAndChave(Long campanhaId, String chave);
    List<Documento> findByCampanhaId(Long campanhaId);
    void deleteByCampanhaId(Long campanhaId);
}
