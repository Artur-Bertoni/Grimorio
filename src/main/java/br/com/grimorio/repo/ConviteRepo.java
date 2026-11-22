package br.com.grimorio.repo;

import br.com.grimorio.model.Convite;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface ConviteRepo extends JpaRepository<Convite, Long> {
    Optional<Convite> findByToken(String token);

    /** Le o convite travando a linha ate o fim da transacao: dois aceites ao mesmo tempo nao passam do limite de usos. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from Convite c where c.token = :token")
    Optional<Convite> travarPorToken(@Param("token") String token);
    List<Convite> findByCampanhaIdOrderByCriadoEmDesc(Long campanhaId);
    void deleteByCampanhaId(Long campanhaId);
}
