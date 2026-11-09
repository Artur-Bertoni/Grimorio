package br.com.grimorio.repo;

import br.com.grimorio.model.Campanha;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface CampanhaRepo extends JpaRepository<Campanha, Long> {
    List<Campanha> findByIdInOrderByNomeAsc(List<Long> ids);
    List<Campanha> findAllByOrderByNomeAsc();
    long countByDonoId(Long donoId);
}
