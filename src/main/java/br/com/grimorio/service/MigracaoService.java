package br.com.grimorio.service;

import br.com.grimorio.model.*;
import br.com.grimorio.repo.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Objects;

/**
 * Converte uma instalacao antiga, de campanha unica, para o modelo de varias
 * campanhas. Roda uma vez so e nao apaga nada: as tabelas antigas (doc, nota)
 * continuam intactas como copia de seguranca.
 *
 * Precisa de um usuario para ser o dono, entao e chamada no boot (se ja houver
 * conta) e logo depois do primeiro cadastro.
 */
@Service
public class MigracaoService {

    private static final Logger log = LoggerFactory.getLogger(MigracaoService.class);
    private static final String FLAG = "migracao.multiCampanha";

    private final ConfigRepo configs;
    private final UsuarioRepo usuarios;
    private final CampanhaRepo campanhas;
    private final MembroRepo membros;
    private final DocRepo docsLegado;
    private final DocumentoRepo documentos;
    private final NotaRepo notasLegado;
    private final AnotacaoRepo anotacoes;
    private final MuralRepo mural;
    private final MidiaRepo midias;
    private final MidiaService midiaSvc;
    private final ObjectMapper om = new ObjectMapper();

    public MigracaoService(ConfigRepo configs, UsuarioRepo usuarios, CampanhaRepo campanhas,
                           MembroRepo membros, DocRepo docsLegado, DocumentoRepo documentos,
                           NotaRepo notasLegado, AnotacaoRepo anotacoes, MuralRepo mural,
                           MidiaRepo midias, MidiaService midiaSvc) {
        this.configs = configs;
        this.usuarios = usuarios;
        this.campanhas = campanhas;
        this.membros = membros;
        this.docsLegado = docsLegado;
        this.documentos = documentos;
        this.notasLegado = notasLegado;
        this.anotacoes = anotacoes;
        this.mural = mural;
        this.midias = midias;
        this.midiaSvc = midiaSvc;
    }

    /** Devolve o id da campanha criada, ou null se nao havia nada para migrar. */
    @Transactional
    public Long migrar() {
        if (configs.existsById(FLAG)) return null;
        try {
            long legados;
            try {
                legados = docsLegado.count();
            } catch (Exception e) {
                // tabela antiga nem existe: instalacao nova
                configs.save(new Config(FLAG, Instant.now().toString()));
                return null;
            }
            if (campanhas.count() > 0 || legados == 0) {
                configs.save(new Config(FLAG, Instant.now().toString()));
                return null;
            }

            Usuario dono = usuarios.findAll().stream().filter(Usuario::isAdmin).findFirst()
                    .orElseGet(() -> usuarios.findAll().stream().findFirst().orElse(null));
            if (dono == null) {
                log.info("Migracao adiada: ainda nao existe nenhuma conta.");
                return null;
            }

            Doc guiaVelho = docsLegado.findById("guia").orElse(null);
            Campanha c = new Campanha();
            c.setNome(nomeDoGuia(guiaVelho));
            c.setDonoId(dono.getId());
            c.setCriadoEm(Instant.now());
            campanhas.save(c);
            Long cid = c.getId();

            membros.save(new Membro(cid, dono.getId(), Papel.MESTRE));
            for (Usuario u : usuarios.findAll()) {
                if (Objects.equals(u.getId(), dono.getId())) continue;
                membros.save(new Membro(cid, u.getId(), Papel.JOGADOR));
            }

            for (Doc d : docsLegado.findAll()) {
                Documento novo = new Documento(cid, d.getChave(), d.getConteudo());
                novo.setVersao(d.getVersao());
                documentos.save(novo);
            }
            for (Nota n : notasLegado.findAll()) {
                Anotacao a = new Anotacao();
                a.setCampanhaId(cid);
                a.setUsuarioId(n.getUsuarioId());
                a.setTexto(n.getTexto());
                anotacoes.save(a);
            }

            List<MuralPost> posts = mural.findAll();
            for (MuralPost p : posts) {
                if (p.getCampanhaId() == null) { p.setCampanhaId(cid); mural.save(p); }
            }
            for (Midia m : midias.findAll()) {
                if (m.getCampanhaId() == null) { m.setCampanhaId(cid); midias.save(m); }
            }

            midiaSvc.prepararPastas(cid);
            Path raiz = midiaSvc.raizGeral();
            moverPasta(raiz.resolve("pdf"), raiz.resolve("c" + cid).resolve("pdf"));
            moverPasta(raiz.resolve("audio"), raiz.resolve("c" + cid).resolve("audio"));
            moverPasta(raiz.resolve("indice"), raiz.resolve("c" + cid).resolve("indice"));

            configs.save(new Config(FLAG, Instant.now().toString()));
            log.warn("Migracao: campanha {} (\"{}\") criada para {}, com {} documentos e {} recados.",
                    cid, c.getNome(), dono.getLogin(), documentos.findByCampanhaId(cid).size(), posts.size());
            return cid;

        } catch (Exception e) {
            log.error("Migracao falhou, nada foi marcado como feito: {}", e.toString());
            return null;
        }
    }

    private String nomeDoGuia(Doc guia) {
        if (guia == null) return "Minha campanha";
        try {
            JsonNode n = om.readTree(guia.getConteudo()).path("campanha").path("titulo");
            String t = n.isMissingNode() ? "" : n.asText("");
            return t.isBlank() ? "Minha campanha" : t;
        } catch (Exception e) {
            return "Minha campanha";
        }
    }

    private void moverPasta(Path de, Path para) {
        if (!Files.isDirectory(de)) return;
        try {
            Files.createDirectories(para);
            try (var st = Files.walk(de)) {
                for (Path p : st.filter(Files::isRegularFile).toList()) {
                    Path destino = para.resolve(de.relativize(p).toString());
                    Files.createDirectories(destino.getParent());
                    if (!Files.exists(destino)) Files.move(p, destino);
                }
            }
            log.info("Movi {} para {}", de, para);
        } catch (Exception e) {
            log.warn("Nao consegui mover {} para {}: {}", de, para, e.getMessage());
        }
    }
}
