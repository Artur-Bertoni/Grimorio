package br.com.grimorio.config;

import br.com.grimorio.model.Midia;
import br.com.grimorio.model.Papel;
import br.com.grimorio.repo.MembroRepo;
import br.com.grimorio.repo.MidiaRepo;
import br.com.grimorio.repo.UsuarioRepo;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;
import org.springframework.stereotype.Component;

import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Quem pode baixar cada arquivo de /midia/c{id}/...
 *   img   -> qualquer membro da campanha (evidencia que o mestre liberou)
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

    public MidiaAutorizacao(UsuarioRepo usuarios, MembroRepo membros, MidiaRepo midias) {
        this.usuarios = usuarios;
        this.membros = membros;
        this.midias = midias;
    }

    @Override
    public AuthorizationDecision check(Supplier<Authentication> auth, RequestAuthorizationContext ctx) {
        Authentication a = auth.get();
        if (a == null || !a.isAuthenticated()) return NAO;

        Matcher m = CAMINHO.matcher(ctx.getRequest().getRequestURI());
        if (!m.matches()) return NAO;

        long campanhaId;
        try { campanhaId = Long.parseLong(m.group(1)); } catch (Exception e) { return NAO; }
        String tipo = m.group(2);
        String resto = m.group(3);

        Long usuarioId = usuarios.findByLoginIgnoreCase(a.getName()).map(u -> u.getId()).orElse(null);
        if (usuarioId == null) return NAO;

        Papel papel = membros.findByCampanhaIdAndUsuarioId(campanhaId, usuarioId)
                .map(x -> x.getPapel()).orElse(null);
        if (papel == null) return NAO;
        if (papel == Papel.MESTRE) return SIM;

        if ("img".equals(tipo)) return SIM;
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
}
