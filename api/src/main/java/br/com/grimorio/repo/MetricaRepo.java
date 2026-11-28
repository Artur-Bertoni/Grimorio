package br.com.grimorio.repo;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import br.com.grimorio.model.Metrica;

public interface MetricaRepo extends JpaRepository<Metrica, Long> {
    Optional<Metrica> findByDiaAndEvento(LocalDate dia, String evento);
    List<Metrica> findByDiaGreaterThanEqualOrderByDiaAsc(LocalDate desde);
}
