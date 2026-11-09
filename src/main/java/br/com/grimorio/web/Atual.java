package br.com.grimorio.web;

import br.com.grimorio.model.Usuario;
import br.com.grimorio.service.UsuarioService;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

@Component
public class Atual {

    private final UsuarioService usuarios;

    public Atual(UsuarioService usuarios) {
        this.usuarios = usuarios;
    }

    public Usuario usuario() {
        Authentication a = SecurityContextHolder.getContext().getAuthentication();
        if (a == null || !a.isAuthenticated()) throw new IllegalStateException("sem sessao");
        return usuarios.porLogin(a.getName());
    }

    public Long id() {
        return usuario().getId();
    }

    public boolean admin() {
        return usuario().isAdmin();
    }
}
