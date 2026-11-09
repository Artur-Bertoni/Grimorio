package br.com.grimorio.repo;

import br.com.grimorio.model.Nota;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NotaRepo extends JpaRepository<Nota, Long> { }
