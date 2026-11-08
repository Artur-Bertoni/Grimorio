package br.com.hexatombe.repo;

import br.com.hexatombe.model.Midia;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface MidiaRepo extends JpaRepository<Midia, Long> {
    List<Midia> findByTipoOrderByCategoriaAscNomeAsc(Midia.Tipo tipo);
    Optional<Midia> findByTipoAndChaveIgnoreCase(Midia.Tipo tipo, String chave);
}
