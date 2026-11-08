package br.com.hexatombe.service;

import br.com.hexatombe.model.Papel;
import br.com.hexatombe.model.Usuario;
import br.com.hexatombe.repo.UsuarioRepo;
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
        return User.withUsername(u.getLogin())
                .password(u.getSenhaHash())
                .roles(u.getPapel().name())
                .disabled(!u.isAtivo())
                .build();
    }

    @Transactional(readOnly = true)
    public Usuario porLogin(String login) {
        return repo.findByLoginIgnoreCase(login)
                .orElseThrow(() -> new IllegalStateException("usuario nao encontrado: " + login));
    }

    @Transactional(readOnly = true)
    public List<Usuario> todos() {
        return repo.findAllByOrderByPapelAscNomeAsc();
    }

    @Transactional
    public Usuario criar(String login, String nome, String senha, Papel papel) {
        String l = login == null ? "" : login.trim().toLowerCase();
        if (l.length() < 3) throw new IllegalArgumentException("login precisa de ao menos 3 letras");
        if (senha == null || senha.length() < 4) throw new IllegalArgumentException("senha precisa de ao menos 4 caracteres");
        if (repo.existsByLoginIgnoreCase(l)) throw new IllegalArgumentException("esse login ja existe");
        Usuario u = new Usuario();
        u.setLogin(l);
        u.setNome(nome == null || nome.isBlank() ? l : nome.trim());
        u.setSenhaHash(enc.encode(senha));
        u.setPapel(papel == null ? Papel.JOGADOR : papel);
        return repo.save(u);
    }

    @Transactional
    public void trocarSenha(Long id, String senha) {
        if (senha == null || senha.length() < 4) throw new IllegalArgumentException("senha precisa de ao menos 4 caracteres");
        Usuario u = repo.findById(id).orElseThrow(() -> new IllegalArgumentException("usuario nao encontrado"));
        u.setSenhaHash(enc.encode(senha));
        repo.save(u);
    }

    @Transactional
    public void renomear(Long id, String nome) {
        Usuario u = repo.findById(id).orElseThrow(() -> new IllegalArgumentException("usuario nao encontrado"));
        if (nome != null && !nome.isBlank()) u.setNome(nome.trim());
        repo.save(u);
    }

    @Transactional
    public void ativo(Long id, boolean ativo) {
        Usuario u = repo.findById(id).orElseThrow(() -> new IllegalArgumentException("usuario nao encontrado"));
        if (u.getPapel() == Papel.MESTRE && !ativo)
            throw new IllegalArgumentException("nao da para desativar o mestre");
        u.setAtivo(ativo);
        repo.save(u);
    }

    @Transactional
    public void remover(Long id) {
        Usuario u = repo.findById(id).orElseThrow(() -> new IllegalArgumentException("usuario nao encontrado"));
        if (u.getPapel() == Papel.MESTRE)
            throw new IllegalArgumentException("nao da para remover o mestre");
        repo.delete(u);
    }
}
