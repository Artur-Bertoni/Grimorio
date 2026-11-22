package br.com.grimorio.service;

import br.com.grimorio.model.Midia;
import br.com.grimorio.repo.MidiaRepo;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.apache.pdfbox.text.PDFTextStripper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Arrays;
import java.util.Objects;

/**
 * O indice de busca de um livro: o texto de cada pagina, tirado do PDF com o PDFBox, e o capitulo de cada
 * pagina, tirado do sumario que o proprio PDF carrega. PDF repetido (mesmo hash) copia o indice do gemeo em
 * vez de ler tudo de novo.
 */
@Component
class IndexadorPdf {

    private static final Logger log = LoggerFactory.getLogger(IndexadorPdf.class);
    private static final String K_PUBLICO = "publico";
    private static final String K_PAGINAS = "paginas";

    private final MidiaRepo repo;
    private final IndiceService indice;
    private final ObjectMapper om = JsonMapper.builder().build();

    IndexadorPdf(MidiaRepo repo, IndiceService indice) {
        this.repo = repo;
        this.indice = indice;
    }

    int contarPaginas(Path arquivo) {
        try (PDDocument doc = Loader.loadPDF(arquivo.toFile())) {
            return doc.getNumberOfPages();
        } catch (Exception e) {
            log.warn("Nao consegui contar paginas de {}: {}", arquivo, e.getMessage());
            return 0;
        }
    }

    /** Le o PDF e grava o indice dele. Devolve {total de paginas, paginas que ganharam titulo de capitulo}. */
    int[] indexar(Long campanhaId, String abrev, String nome, Path arquivo, boolean publico) throws IOException {
        ObjectNode raiz = om.createObjectNode();
        raiz.put(K_PUBLICO, publico);
        ArrayNode docs = raiz.putArray("docs");
        ArrayNode pages = raiz.putArray("pages");

        int total;
        int comSecao = 0;
        try (PDDocument doc = Loader.loadPDF(arquivo.toFile())) {
            total = doc.getNumberOfPages();
            String[] secao = secoesPorPagina(doc, total);
            PDFTextStripper s = new PDFTextStripper();
            s.setSortByPosition(true);
            for (int i = 1; i <= total; i++) {
                s.setStartPage(i);
                s.setEndPage(i);
                String t = limpar(s.getText(doc));
                if (t.isBlank()) continue;
                ObjectNode p = pages.addObject();
                p.put("d", abrev.toLowerCase());
                p.put("p", i);
                p.put("s", secao[i]);
                if (!secao[i].isEmpty()) comSecao++;
                p.put("t", t);
            }
        }

        ObjectNode d = docs.addObject();
        d.put("id", abrev.toLowerCase());
        d.put("nome", nome == null || nome.isBlank() ? abrev : nome);
        d.put("abrev", abrev);
        d.put(K_PAGINAS, total);

        Path saida = indice.pastaIndice(campanhaId).resolve(abrev + ".json");
        Files.createDirectories(saida.getParent());
        Files.writeString(saida, om.writeValueAsString(raiz), StandardCharsets.UTF_8);
        return new int[]{total, comSecao};
    }

    /** O mesmo PDF ja indexado em outra campanha (ou com outra sigla): o indice de busca e o
     *  mesmo texto, entao copia em vez de extrair tudo de novo. Le o indice do gemeo, troca o que
     *  e desta campanha (sigla, nome, publico) e grava ao lado. Devolve as paginas, ou 0 se nao
     *  houver gemeo com indice. */
    int copiarIndiceDoGemeo(Long campanhaId, String ab, String nome, boolean publico, String hash) {
        if (hash == null) return 0;
        for (Midia o : repo.findByHash(hash)) {
            if (o.getTipo() != Midia.Tipo.PDF) continue;
            if (Objects.equals(o.getCampanhaId(), campanhaId) && o.getChave().equalsIgnoreCase(ab)) continue;
            Path origem = indice.pastaIndice(o.getCampanhaId()).resolve(o.getChave() + ".json");
            if (!Files.isRegularFile(origem)) continue;
            try {
                int paginas = copiaIndice(origem, campanhaId, ab, nome, publico);
                log.info("PDF {} da campanha {}: indice copiado de {} da campanha {}, sem reprocessar o arquivo.",
                        ab, campanhaId, o.getChave(), o.getCampanhaId());
                return paginas;
            } catch (Exception e) {
                log.warn("Nao consegui copiar o indice de {}: {}", origem, e.getMessage());
            }
        }
        return 0;
    }

    private int copiaIndice(Path origem, Long campanhaId, String ab, String nome, boolean publico) throws IOException {
        ObjectNode raiz = (ObjectNode) om.readTree(Files.readString(origem, StandardCharsets.UTF_8));
        String id = ab.toLowerCase();
        raiz.put(K_PUBLICO, publico);
        int paginas = 0;
        for (var d : raiz.withArray("docs")) {
            ObjectNode doc = (ObjectNode) d;
            doc.put("id", id);
            doc.put("abrev", ab);
            doc.put("nome", nome == null || nome.isBlank() ? ab : nome.trim());
            paginas = Math.max(paginas, doc.path(K_PAGINAS).asInt(0));
        }
        for (var p : raiz.withArray("pages")) ((ObjectNode) p).put("d", id);
        if (paginas == 0) paginas = raiz.withArray("pages").size();
        Path destino = indice.pastaIndice(campanhaId).resolve(ab + ".json");
        Files.createDirectories(destino.getParent());
        Path tmp = destino.resolveSibling(destino.getFileName() + ".parcial");
        Files.writeString(tmp, om.writeValueAsString(raiz), StandardCharsets.UTF_8);
        Files.move(tmp, destino, StandardCopyOption.REPLACE_EXISTING);
        return Math.max(1, paginas);
    }

    /**
     * Titulo do capitulo de cada pagina (indice 1..total), tirado do sumario que o
     * proprio PDF carrega (os marcadores). Nao adivinha capitulo pelo texto: fonte
     * e diagramacao variam demais de livro para livro, e titulo errado atrapalha a
     * busca mais do que titulo nenhum. PDF sem marcadores fica com tudo vazio.
     */
    private String[] secoesPorPagina(PDDocument doc, int total) {
        String[] out = new String[total + 2];
        Arrays.fill(out, "");
        try {
            PDDocumentOutline raizSumario = doc.getDocumentCatalog().getDocumentOutline();
            if (raizSumario == null) return out;
            // em cada pagina vale a ultima entrada do sumario que aponta para ela
            String[] marca = new String[total + 2];
            coletarSumario(doc, raizSumario.getFirstChild(), "", 0, marca, new int[]{0});
            String atual = "";
            for (int i = 1; i <= total; i++) {
                if (marca[i] != null) atual = marca[i];
                out[i] = atual;
            }
        } catch (Exception e) {
            log.warn("Nao consegui ler o sumario do PDF: {}", e.getMessage());
        }
        return out;
    }

    private void coletarSumario(PDDocument doc, PDOutlineItem item, String capitulo, int nivel,
                                String[] marca, int[] visitados) {
        // sumario malformado pode ter ciclo; o teto evita laco infinito
        while (item != null && visitados[0]++ < 20000) {
            String titulo = item.getTitle() == null ? "" : item.getTitle().replaceAll("\\s+", " ").trim();
            String rotulo = nivel == 0 || capitulo.isEmpty() ? titulo : capitulo + " · " + titulo;
            marcaPagina(doc, item, titulo, rotulo, marca);
            if (nivel < 2) coletarSumario(doc, item.getFirstChild(), nivel == 0 ? titulo : capitulo, nivel + 1, marca, visitados);
            item = item.getNextSibling();
        }
    }

    private static void marcaPagina(PDDocument doc, PDOutlineItem item, String titulo, String rotulo, String[] marca) {
        try {
            PDPage pg = item.findDestinationPage(doc);
            // indexOf compara o objeto do PDF por baixo: cada leitura devolve um PDPage novo
            int n = pg == null ? 0 : doc.getPages().indexOf(pg) + 1;
            if (n >= 1 && n < marca.length && !titulo.isEmpty()) marca[n] = rotulo.length() > 160 ? rotulo.substring(0, 160) : rotulo;
        } catch (Exception _) {
            // entrada do sumario que aponta para lugar nenhum: fica sem marca
        }
    }

    private static String limpar(String s) {
        if (s == null) return "";
        return s.replace('\u0000', ' ').replace("�", "")
                .replaceAll("[ \\t]+\\n", "\n").replaceAll("\\n{3,}", "\n\n").trim();
    }
}
