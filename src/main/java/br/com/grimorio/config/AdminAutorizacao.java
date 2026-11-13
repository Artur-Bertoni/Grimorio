package br.com.grimorio.config;

import br.com.grimorio.repo.UsuarioRepo;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;
import org.springframework.stereotype.Component;

import java.util.function.Supplier;

/**
 * Quem pode usar /api/admin/**. Le o banco a cada pedido em vez de confiar no papel gravado
 * na sessao: o papel da sessao e montado no login e a sessao dura 30 dias, entao uma conta
 * promovida a administradora depois de entrar via o painel (a tela le o banco) e tomava 403
 * em tudo, e uma conta rebaixada continuava administradora ate a sessao vencer.
 */
@Component
public class AdminAutorizacao implements AuthorizationManager<RequestAuthorizationContext> {

    private final UsuarioRepo usuarios;

    public AdminAutorizacao(UsuarioRepo usuarios) {
        this.usuarios = usuarios;
    }

    @Override
    public AuthorizationDecision check(Supplier<Authentication> auth, RequestAuthorizationContext ctx) {
        Authentication a = auth.get();
        if (a == null || !a.isAuthenticated() || a.getName() == null) return new AuthorizationDecision(false);
        boolean ok = usuarios.findByLoginIgnoreCase(a.getName())
                .map(u -> u.isAdmin() && u.isAtivo())
                .orElse(false);
        return new AuthorizationDecision(ok);
    }
}
