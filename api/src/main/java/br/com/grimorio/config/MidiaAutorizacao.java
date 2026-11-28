package br.com.grimorio.config;

import br.com.grimorio.model.Membro;
import br.com.grimorio.model.Midia;
import br.com.grimorio.model.Papel;
import br.com.grimorio.model.Usuario;
import br.com.grimorio.repo.MapaRepo;
import br.com.grimorio.repo.MembroRepo;
import br.com.grimorio.repo.MidiaRepo;
import br.com.grimorio.repo.UsuarioRepo;
import org.springframework.web.util.UriUtils;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Quem pode baixar cada arquivo de /midia/c{id}/...
 *   img   -> qualquer membro da campanha (evidencia que o mestre liberou), menos a imagem de mapa do
 *            tabletop: o jogador so a recebe em pedacos, cortados pela nevoa
 *   audio -> so o mestre
 *   pdf   -> o mestre sempre; o jogador so se aquele livro estiver marcado publico
 */
@Component
public class MidiaAutorizacao implements AuthorizationManager<RequestAuthorizationContext> {

    private static final Pattern CAMINHO = Pattern.compile("^/midia/c(\\d{1,18})/(pdf|audio|img)/(.+)$");
    private static final AuthorizationDecision NAO = new AuthorizationDecision(false);
    private static final AuthorizationDecision SIM = new AuthorizationDecision(true);

    private final UsuarioRepo usuarios;
    private final MembroRepo membros;
    private final MidiaRepo midias;
    private final MapaRepo mapas;

    public MidiaAutorizacao(UsuarioRepo usuarios, MembroRepo membros, MidiaRepo midias, MapaRepo mapas) {
        this.usuarios = usuarios;
        this.membros = membros;
        this.midias = midias;
        this.mapas = mapas;
    }

    @Override
    public AuthorizationDecision authorize(Supplier<? extends Authentication> auth, RequestAuthorizationContext ctx) {
        Authentication a = auth.get();
        if (a == null || !a.isAuthenticated()) return NAO;

        Matcher m = CAMINHO.matcher(ctx.getRequest().getRequestURI());
        if (!m.matches()) return NAO;

        long campanhaId;
        try { campanhaId = Long.parseLong(m.group(1)); } catch (NumberFormatException _) { return NAO; }
        String tipo = m.group(2);
        String resto = m.group(3);

        Long usuarioId = usuarios.findByLoginIgnoreCase(a.getName()).map(Usuario::getId).orElse(null);
        if (usuarioId == null) return NAO;

        Papel papel = membros.findByCampanhaIdAndUsuarioId(campanhaId, usuarioId)
                .map(Membro::getPapel).orElse(null);
        if (papel == null) return NAO;
        if (papel == Papel.MESTRE) return SIM;

        if ("img".equals(tipo)) return imagemDeMapa(campanhaId, resto) ? NAO : SIM;
        if ("audio".equals(tipo)) return NAO;

        // pdf: so se o livro estiver publico
        String abrev = resto;
        int barra = abrev.lastIndexOf('/');
        if (barra >= 0) abrev = abrev.substring(barra + 1);
        int ponto = abrev.lastIndexOf('.');
        if (ponto > 0) abrev = abrev.substring(0, ponto);

        return midias.findByCampanhaIdAndTipoAndChaveIgnoreCase(campanhaId, Midia.Tipo.PDF, abrev)
                .map(x -> x.isPublico() ? SIM : NAO)
                .orElse(NAO);
    }

    /**
     * A imagem (ou a miniatura e a versao de 4096px dela, em {@code .mini/} e {@code .mapa/}) e de um mapa do
     * tabletop: o jogador so a recebe em pedacos, pelo corte da nevoa (MapaVisao). Pelo caminho direto, nao,
     * nem a de um mapa que ainda nao esta ativo.
     */
    private boolean imagemDeMapa(long campanhaId, String resto) {
        String rel = UriUtils.decode(resto, StandardCharsets.UTF_8);
        for (String pasta : new String[] { ".mini/", ".mapa/" }) {
            if (rel.startsWith(pasta)) {
                rel = rel.substring(pasta.length());
                if (rel.endsWith(".jpg") || rel.endsWith(".png")) rel = rel.substring(0, rel.length() - 4);
            }
        }
        return mapas.existsByCampanhaIdAndImagem(campanhaId, "img/" + rel);
    }
}
