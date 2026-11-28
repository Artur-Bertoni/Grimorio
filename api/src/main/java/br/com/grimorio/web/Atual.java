package br.com.grimorio.web;

import br.com.grimorio.config.ContaDoPedido;
import br.com.grimorio.model.Usuario;
import br.com.grimorio.service.UsuarioService;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@Component
public class Atual {

    private final UsuarioService usuarios;

    public Atual(UsuarioService usuarios) {
        this.usuarios = usuarios;
    }

    public Usuario usuario() {
        Authentication a = SecurityContextHolder.getContext().getAuthentication();
        if (a == null || !a.isAuthenticated()) throw new IllegalStateException("sem sessao");
        /* ContaDoPedido ja carregou a conta (e conferiu que esta ativa): o mesmo pedido nao volta ao banco */
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes r
                && r.getRequest().getAttribute(ContaDoPedido.ATRIBUTO) instanceof Usuario u
                && u.getLogin().equalsIgnoreCase(a.getName())) {
            return u;
        }
        return usuarios.porLogin(a.getName());
    }

    public Long id() {
        return usuario().getId();
    }

    public boolean admin() {
        return usuario().isAdmin();
    }
}
