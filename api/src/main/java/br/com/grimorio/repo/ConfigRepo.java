package br.com.grimorio.repo;

import br.com.grimorio.model.Config;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ConfigRepo extends JpaRepository<Config, String> { }
