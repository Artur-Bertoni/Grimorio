package br.com.grimorio.repo;

import br.com.grimorio.model.MuralPost;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface MuralRepo extends JpaRepository<MuralPost, Long> {
    List<MuralPost> findTop200ByCampanhaIdOrderByCriadoEmDesc(Long campanhaId);
    void deleteByCampanhaId(Long campanhaId);
}
