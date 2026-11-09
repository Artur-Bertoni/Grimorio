package br.com.grimorio.service;

import br.com.grimorio.model.Campanha;
import br.com.grimorio.repo.CampanhaRepo;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.zip.*;

/**
 * Pacote de campanha: um zip com o guia, a mesa, os indices de busca e as
 * imagens. E assim que uma campanha sai de uma instancia e entra em outra,
 * e e por isso que o repositorio nao precisa carregar conteudo nenhum.
 *
 *   campanha.json      dados da campanha, guia e mesa
 *   indice/ABREV.json  indices de busca ja prontos
 *   img/arquivo.webp   imagens referenciadas pelo guia
 *
 * PDFs e audio nao entram: sao grandes e cada mestre tem os seus.
 */
@Service
public class PacoteService {

    private static final Logger log = LoggerFactory.getLogger(PacoteService.class);
    private static final long LIMITE_ENTRADA = 80L * 1024 * 1024;
    private static final int MAX_ENTRADAS = 2000;

    private final CampanhaRepo campanhas;
    private final DocumentoService docs;
    private final MidiaService midia;
    private final IndiceService indice;
    private final ObjectMapper om = new ObjectMapper();

    public PacoteService(CampanhaRepo campanhas, DocumentoService docs,
                         MidiaService midia, IndiceService indice) {
        this.campanhas = campanhas;
        this.docs = docs;
        this.midia = midia;
        this.indice = indice;
    }

    // ---------- exportar ----------

    public void exportar(Long campanhaId, boolean comImagens, OutputStream saida) throws IOException {
        Campanha c = campanhas.findById(campanhaId)
                .orElseThrow(() -> new IllegalArgumentException("campanha nao encontrada"));

        try (ZipOutputStream z = new ZipOutputStream(saida, StandardCharsets.UTF_8)) {
            ObjectNode raiz = om.createObjectNode();
            raiz.put("formato", 1);
            raiz.put("nome", c.getNome());
            raiz.put("sistema", c.getSistema());
            raiz.put("descricao", c.getDescricao());
            raiz.put("tema", c.getTema());
            raiz.set("guia", leJson(docs.ler(campanhaId, DocumentoService.GUIA).getConteudo()));
            raiz.set("mesa", leJson(docs.ler(campanhaId, DocumentoService.MESA).getConteudo()));

            z.putNextEntry(new ZipEntry("campanha.json"));
            z.write(om.writerWithDefaultPrettyPrinter().writeValueAsBytes(raiz));
            z.closeEntry();

            Path dirIdx = indice.pastaIndice(campanhaId);
            if (Files.isDirectory(dirIdx)) {
                try (var st = Files.list(dirIdx)) {
                    for (Path p : st.filter(x -> x.toString().endsWith(".json")).sorted().toList()) {
                        z.putNextEntry(new ZipEntry("indice/" + p.getFileName()));
                        Files.copy(p, z);
                        z.closeEntry();
                    }
                }
            }

            if (comImagens) {
                Path dirImg = midia.raiz(campanhaId).resolve("img");
                if (Files.isDirectory(dirImg)) {
                    try (var st = Files.list(dirImg)) {
                        for (Path p : st.filter(Files::isRegularFile).sorted().toList()) {
                            z.putNextEntry(new ZipEntry("img/" + p.getFileName()));
                            Files.copy(p, z);
                            z.closeEntry();
                        }
                    }
                }
            }
            z.finish();
        }
    }

    // ---------- importar ----------

    @Transactional
    public Map<String, Object> importar(Long campanhaId, MultipartFile zip,
                                        boolean substituirGuia) throws IOException {
        if (zip == null || zip.isEmpty()) throw new IllegalArgumentException("arquivo vazio");
        midia.prepararPastas(campanhaId);

        int indices = 0, imagens = 0;
        boolean trocouGuia = false, trocouMesa = false;
        String nomeCampanha = null;
        int entradas = 0;

        try (ZipInputStream z = new ZipInputStream(zip.getInputStream(), StandardCharsets.UTF_8)) {
            ZipEntry e;
            while ((e = z.getNextEntry()) != null) {
                if (++entradas > MAX_ENTRADAS) throw new IllegalArgumentException("pacote com entradas demais");
                if (e.isDirectory()) { z.closeEntry(); continue; }
                String nome = e.getName().replace('\\', '/');
                if (nome.contains("..") || nome.startsWith("/")) { z.closeEntry(); continue; }

                byte[] dados = lerLimitado(z);

                if (nome.equals("campanha.json")) {
                    JsonNode n = om.readTree(dados);
                    nomeCampanha = n.path("nome").asText("");
                    aplicarCampanha(campanhaId, n);
                    if (substituirGuia && n.has("guia") && !n.get("guia").isNull()) {
                        docs.gravar(campanhaId, DocumentoService.GUIA, om.writeValueAsString(n.get("guia")), -1);
                        trocouGuia = true;
                    }
                    if (substituirGuia && n.has("mesa") && !n.get("mesa").isNull()) {
                        docs.gravar(campanhaId, DocumentoService.MESA, om.writeValueAsString(n.get("mesa")), -1);
                        trocouMesa = true;
                    }
                } else if (nome.startsWith("indice/") && nome.endsWith(".json")) {
                    String arq = nome.substring("indice/".length());
                    if (arq.contains("/")) { z.closeEntry(); continue; }
                    Files.write(indice.pastaIndice(campanhaId).resolve(arq), dados);
                    indices++;
                } else if (nome.startsWith("img/")) {
                    String arq = nome.substring("img/".length());
                    if (arq.isEmpty() || arq.contains("/")) { z.closeEntry(); continue; }
                    midia.gravarImagem(campanhaId, arq, dados);
                    imagens++;
                }
                z.closeEntry();
            }
        }

        indice.invalidar(campanhaId);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("nome", nomeCampanha);
        r.put("indices", indices);
        r.put("imagens", imagens);
        r.put("guia", trocouGuia);
        r.put("mesa", trocouMesa);
        log.info("Campanha {}: importou {} indices e {} imagens (guia={}).",
                campanhaId, indices, imagens, trocouGuia);
        return r;
    }

    private void aplicarCampanha(Long campanhaId, JsonNode n) {
        campanhas.findById(campanhaId).ifPresent(c -> {
            if (c.getSistema() == null || c.getSistema().isBlank())
                c.setSistema(n.path("sistema").asText(""));
            if (c.getDescricao() == null || c.getDescricao().isBlank())
                c.setDescricao(n.path("descricao").asText(""));
            String tema = n.path("tema").asText("");
            if (!tema.isBlank()) c.setTema(tema);
            campanhas.save(c);
        });
    }

    private byte[] lerLimitado(InputStream in) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        long total = 0;
        int n;
        while ((n = in.read(buf)) > 0) {
            total += n;
            if (total > LIMITE_ENTRADA) throw new IllegalArgumentException("arquivo grande demais dentro do pacote");
            bos.write(buf, 0, n);
        }
        return bos.toByteArray();
    }

    private JsonNode leJson(String s) {
        try { return om.readTree(s == null || s.isBlank() ? "{}" : s); }
        catch (Exception e) { return om.createObjectNode(); }
    }
}
