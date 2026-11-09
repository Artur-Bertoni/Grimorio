package br.com.grimorio.service;

import br.com.grimorio.model.Usuario;
import br.com.grimorio.repo.UsuarioRepo;
import org.springframework.security.core.userdetails.*;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class UsuarioService implements UserDetailsService {

    private final UsuarioRepo repo;
    private final PasswordEncoder enc;

    public UsuarioService(UsuarioRepo repo, PasswordEncoder enc) {
        this.repo = repo;
        this.enc = enc;
    }

    @Override
    @Transactional(readOnly = true)
    public UserDetails loadUserByUsername(String login) throws UsernameNotFoundException {
        Usuario u = repo.findByLoginIgnoreCase(login)
                .orElseThrow(() -> new UsernameNotFoundException("usuario nao encontrado"));
        List<String> papeis = u.isAdmin() ? List.of("USUARIO", "ADMIN") : List.of("USUARIO");
        return User.withUsername(u.getLogin())
                .password(u.getSenhaHash())
                .roles(papeis.toArray(new String[0]))
                .disabled(!u.isAtivo())
                .build();
    }

    @Transactional(readOnly = true)
    public Usuario porLogin(String login) {
        return repo.findByLoginIgnoreCase(login)
                .orElseThrow(() -> new IllegalStateException("usuario nao encontrado: " + login));
    }

    @Transactional(readOnly = true)
    public Usuario porId(Long id) {
        return repo.findById(id).orElseThrow(() -> new IllegalArgumentException("usuario nao encontrado"));
    }

    @Transactional(readOnly = true)
    public List<Usuario> todos() {
        return repo.findAllByOrderByPapelAscNomeAsc();
    }

    @Transactional(readOnly = true)
    public long quantos() {
        return repo.count();
    }

    @Transactional
    public Usuario criar(String login, String nome, String senha, boolean admin) {
        String l = login == null ? "" : login.trim().toLowerCase();
        if (!l.matches("[a-z0-9._-]{3,40}"))
            throw new IllegalArgumentException("login: de 3 a 40 caracteres, letras, numeros, ponto, hifen ou underline");
        if (senha == null || senha.length() < 6)
            throw new IllegalArgumentException("a senha precisa de ao menos 6 caracteres");
        if (repo.existsByLoginIgnoreCase(l))
            throw new IllegalArgumentException("esse login ja existe");
        Usuario u = new Usuario();
        u.setLogin(l);
        u.setNome(nome == null || nome.isBlank() ? l : nome.trim());
        u.setSenhaHash(enc.encode(senha));
        u.setAdmin(admin);
        return repo.save(u);
    }

    @Transactional
    public void trocarSenha(Long id, String senha) {
        if (senha == null || senha.length() < 6)
            throw new IllegalArgumentException("a senha precisa de ao menos 6 caracteres");
        Usuario u = porId(id);
        u.setSenhaHash(enc.encode(senha));
        repo.save(u);
    }

    @Transactional
    public void renomear(Long id, String nome) {
        Usuario u = porId(id);
        if (nome != null && !nome.isBlank()) u.setNome(nome.trim());
        repo.save(u);
    }

    @Transactional
    public void ativo(Long id, boolean ativo) {
        Usuario u = porId(id);
        if (u.isAdmin() && !ativo) throw new IllegalArgumentException("nao da para desativar um administrador");
        u.setAtivo(ativo);
        repo.save(u);
    }

    @Transactional
    public void admin(Long id, boolean admin) {
        Usuario u = porId(id);
        if (!admin && repo.countByAdminTrue() <= 1 && u.isAdmin())
            throw new IllegalArgumentException("a instancia precisa de ao menos um administrador");
        u.setAdmin(admin);
        repo.save(u);
    }

    @Transactional
    public void remover(Long id) {
        Usuario u = porId(id);
        if (u.isAdmin()) throw new IllegalArgumentException("tire o administrador antes de remover");
        repo.delete(u);
    }
}
