package br.com.hexatombe.repo;

import br.com.hexatombe.model.Config;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ConfigRepo extends JpaRepository<Config, String> { }
