package br.com.grimorio.repo;

import br.com.grimorio.model.Doc;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DocRepo extends JpaRepository<Doc, String> { }
