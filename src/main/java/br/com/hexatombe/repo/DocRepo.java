package br.com.hexatombe.repo;

import br.com.hexatombe.model.Doc;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DocRepo extends JpaRepository<Doc, String> { }
