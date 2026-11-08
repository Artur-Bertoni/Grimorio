package br.com.hexatombe.web;

import br.com.hexatombe.model.Papel;
import br.com.hexatombe.model.Usuario;
import br.com.hexatombe.service.UsuarioService;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/** Atalho para pegar o usuario da sessao. */
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

    public boolean mestre() {
        return usuario().getPapel() == Papel.MESTRE;
    }
}
