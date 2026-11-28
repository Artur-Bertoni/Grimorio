package br.com.grimorio.repo;

import br.com.grimorio.model.Membro;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;
import java.util.Optional;

public interface MembroRepo extends JpaRepository<Membro, Long> {
    Optional<Membro> findByCampanhaIdAndUsuarioId(Long campanhaId, Long usuarioId);
    List<Membro> findByUsuarioId(Long usuarioId);

    /** [usuarioId, quantas campanhas]: a lista de contas da Administracao, numa consulta so. */
    @Query("select m.usuarioId, count(m) from Membro m group by m.usuarioId")
    List<Object[]> campanhasPorUsuario();
    List<Membro> findByCampanhaIdOrderByPapelAscIdAsc(Long campanhaId);
    void deleteByCampanhaId(Long campanhaId);
    long countByCampanhaId(Long campanhaId);
}
