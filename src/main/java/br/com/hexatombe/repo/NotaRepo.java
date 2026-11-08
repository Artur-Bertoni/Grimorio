package br.com.hexatombe.repo;

import br.com.hexatombe.model.Nota;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NotaRepo extends JpaRepository<Nota, Long> { }
