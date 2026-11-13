package br.com.grimorio.repo;

import br.com.grimorio.model.Midia;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface MidiaRepo extends JpaRepository<Midia, Long> {
    List<Midia> findByCampanhaIdAndTipoOrderByCategoriaAscNomeAsc(Long campanhaId, Midia.Tipo tipo);
    List<Midia> findByCampanhaId(Long campanhaId);
    Optional<Midia> findByCampanhaIdAndTipoAndChaveIgnoreCase(Long campanhaId, Midia.Tipo tipo, String chave);
    void deleteByCampanhaId(Long campanhaId);
    List<Midia> findByHash(String hash);
    List<Midia> findByHashIsNull();
    List<Midia> findByHashIsNotNullOrderByIdAsc();
}
