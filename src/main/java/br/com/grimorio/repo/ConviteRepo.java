package br.com.grimorio.repo;

import br.com.grimorio.model.Convite;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface ConviteRepo extends JpaRepository<Convite, Long> {
    Optional<Convite> findByToken(String token);
    List<Convite> findByCampanhaIdOrderByCriadoEmDesc(Long campanhaId);
    void deleteByCampanhaId(Long campanhaId);
}
