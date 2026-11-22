package br.com.grimorio.config;

import br.com.grimorio.model.Usuario;
import br.com.grimorio.repo.UsuarioRepo;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Optional;

/**
 * Carrega a conta de quem esta logado uma vez por pedido e barra a conta desativada.
 *
 * Duas razoes. A sessao dura 30 dias e o papel dela e montado no login: desativar alguem pela
 * Administracao so cortava a Administracao (AdminAutorizacao confere o banco), e a pessoa seguia
 * abrindo campanha, guia e midia ate a sessao vencer. E cada controller pedia a conta ao banco
 * duas ou tres vezes no mesmo pedido (Atual.id(), Atual.usuario()); agora ela fica guardada no
 * pedido e o Atual le dali.
 */
public class ContaDoPedido extends OncePerRequestFilter {

    /** Onde a conta fica guardada no pedido; o Atual le daqui antes de ir ao banco. */
    public static final String ATRIBUTO = "grimorio.usuario";

    private final UsuarioRepo usuarios;

    public ContaDoPedido(UsuarioRepo usuarios) {
        this.usuarios = usuarios;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest req) {
        String p = req.getRequestURI();
        return !(p.startsWith("/api/") || p.startsWith("/midia/"));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain cadeia)
            throws ServletException, IOException {
        Authentication a = SecurityContextHolder.getContext().getAuthentication();
        if (a == null || !a.isAuthenticated() || a instanceof AnonymousAuthenticationToken) {
            cadeia.doFilter(req, res);
            return;
        }
        Optional<Usuario> u = usuarios.findByLoginIgnoreCase(a.getName());
        if (u.isEmpty() || !u.get().isAtivo()) {
            /* conta apagada ou desativada: a sessao morre aqui, e a tela volta para o login */
            HttpSession s = req.getSession(false);
            if (s != null) s.invalidate();
            SecurityContextHolder.clearContext();
            res.setStatus(401);
            res.setContentType("application/json;charset=UTF-8");
            res.getWriter().write("{\"erro\":\"esta conta foi desativada\",\"codigo\":\"conta-desativada\"}");
            return;
        }
        req.setAttribute(ATRIBUTO, u.get());
        cadeia.doFilter(req, res);
    }
}
