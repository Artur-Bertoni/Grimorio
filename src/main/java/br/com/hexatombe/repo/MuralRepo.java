package br.com.hexatombe.repo;

import br.com.hexatombe.model.MuralPost;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface MuralRepo extends JpaRepository<MuralPost, Long> {
    List<MuralPost> findTop200ByOrderByCriadoEmDesc();
}
