package br.com.grimorio.repo;

import br.com.grimorio.model.MapaHistorico;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface MapaHistoricoRepo extends JpaRepository<MapaHistorico, Long> {
    void deleteByMapaId(Long mapaId);
    List<MapaHistorico> findTop20ByMapaIdAndUsuarioIdAndDesfeitoFalseAndOperacaoInOrderByIdDesc(Long mapaId, long usuarioId, Collection<String> operacoes);
    Optional<MapaHistorico> findFirstByMapaIdAndSeqAndUsuarioId(Long mapaId, long seq, long usuarioId);
    List<MapaHistorico> findByMapaIdOrderByIdDesc(Long mapaId, Pageable p);
    List<MapaHistorico> findByMapaIdAndUsuarioIdOrderByIdDesc(Long mapaId, long usuarioId, Pageable p);

    /** o elemento refeito pelo desfazer tem outro id: o que veio antes dele passa a apontar para o novo */
    @Modifying
    @Query("update MapaHistorico h set h.elementoId = :novo where h.mapaId = :mapa and h.elementoId = :antigo")
    void trocaElemento(@Param("mapa") Long mapa, @Param("antigo") long antigo, @Param("novo") long novo);
    void deleteByCampanhaId(Long campanhaId);
}
