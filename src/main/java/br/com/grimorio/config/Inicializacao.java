package br.com.grimorio.config;

import br.com.grimorio.model.*;
import br.com.grimorio.repo.*;
import br.com.grimorio.service.MidiaService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.nio.file.*;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.List;
import java.util.Objects;

@Configuration
public class Inicializacao {

    private static final Logger log = LoggerFactory.getLogger(Inicializacao.class);
    private static final String FLAG_MULTI = "migracao.multiCampanha";

    private final ObjectMapper om = new ObjectMapper();

    @Bean
    public ApplicationRunner partida(UsuarioRepo usuarios, ConfigRepo configs,
                                     CampanhaRepo campanhas, MembroRepo membros,
                                     DocRepo docsLegado, DocumentoRepo documentos,
                                     NotaRepo notasLegado, AnotacaoRepo anotacoes,
                                     MuralRepo mural, MidiaRepo midias,
                                     MidiaService midiaSvc, AppProps props,
                                     PasswordEncoder enc) {
        return args -> {
            Path raiz = Paths.get(props.getMidiaDir()).toAbsolutePath().normalize();
            Files.createDirectories(raiz);
            log.info("Pasta de midia: {}", raiz);

            if (usuarios.count() == 0) {
                String senha = props.getAdminSenha();
                boolean gerada = senha == null || senha.isBlank();
                if (gerada) senha = senhaAleatoria();
                Usuario u = new Usuario();
                u.setLogin(props.getAdminLogin());
                u.setNome("Administrador");
                u.setAdmin(true);
                u.setSenhaHash(enc.encode(senha));
                usuarios.save(u);
                log.warn("=================================================");
                if (gerada) log.warn(" ADMIN CRIADO -> login: {} / senha: {}", u.getLogin(), senha);
                else log.warn(" ADMIN CRIADO -> login: {}", u.getLogin());
                log.warn(" Troque a senha assim que entrar.");
                log.warn("=================================================");
            }

            migrarParaMultiCampanha(configs, usuarios, campanhas, membros, docsLegado, documentos,
                    notasLegado, anotacoes, mural, midias, midiaSvc, raiz);
        };
    }

    /**
     * Converte uma instalacao antiga, de campanha unica, para o modelo de
     * varias campanhas: cria a campanha 1 com tudo o que existia e move os
     * arquivos de /midia/... para /midia/c1/...
     * Roda uma vez so e nao apaga nada: as tabelas antigas ficam intactas.
     */
    private void migrarParaMultiCampanha(ConfigRepo configs, UsuarioRepo usuarios,
                                         CampanhaRepo campanhas, MembroRepo membros,
                                         DocRepo docsLegado, DocumentoRepo documentos,
                                         NotaRepo notasLegado, AnotacaoRepo anotacoes,
                                         MuralRepo mural, MidiaRepo midias,
                                         MidiaService midiaSvc, Path raiz) {
        if (configs.existsById(FLAG_MULTI)) return;
        try {
            if (campanhas.count() > 0 || docsLegado.count() == 0) {
                configs.save(new Config(FLAG_MULTI, Instant.now().toString()));
                return;
            }

            Usuario dono = usuarios.findAll().stream()
                    .filter(Usuario::isAdmin).findFirst()
                    .orElseGet(() -> usuarios.findAll().stream().findFirst().orElse(null));
            if (dono == null) {
                log.warn("Migracao multi-campanha adiada: nenhum usuario ainda.");
                return;
            }

            Doc guiaVelho = docsLegado.findById("guia").orElse(null);
            String nome = nomeDoGuia(guiaVelho);

            Campanha c = new Campanha();
            c.setNome(nome);
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
            moverPasta(raiz.resolve("pdf"), raiz.resolve("c" + cid).resolve("pdf"));
            moverPasta(raiz.resolve("audio"), raiz.resolve("c" + cid).resolve("audio"));
            moverPasta(raiz.resolve("indice"), raiz.resolve("c" + cid).resolve("indice"));

            configs.save(new Config(FLAG_MULTI, Instant.now().toString()));
            log.warn("Migracao multi-campanha: campanha {} (\"{}\") criada para {}, "
                    + "{} documentos, {} anotacoes, {} recados.",
                    cid, nome, dono.getLogin(), documentos.findByCampanhaId(cid).size(),
                    notasLegado.count(), posts.size());
            log.warn("As tabelas antigas (doc, nota) continuam la, intactas, como copia de seguranca.");

        } catch (Exception e) {
            log.error("Migracao multi-campanha falhou, nada foi marcado como feito: {}", e.toString());
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

    /** Move o conteudo de uma pasta para outra, sem sobrescrever o que ja existe. */
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

    private String senhaAleatoria() {
        String abc = "abcdefghjkmnpqrstuvwxyz23456789";
        SecureRandom r = new SecureRandom();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 12; i++) sb.append(abc.charAt(r.nextInt(abc.length())));
        return sb.toString();
    }
}
