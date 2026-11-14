package br.com.grimorio.service;


import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import br.com.grimorio.model.Usuario;
import br.com.grimorio.repo.UsuarioRepo;
import org.springframework.security.core.userdetails.*;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UsuarioService implements UserDetailsService {

    /* find() de um caractere so: o ".*x.*" do matches() volta e tenta de novo em senha longa */
    private static final Pattern TEM_LETRA = Pattern.compile("\\p{L}");
    private static final Pattern TEM_NUMERO = Pattern.compile("\\d");
    private static final Pattern TEM_ESPECIAL = Pattern.compile("[^\\p{L}\\d\\s]");

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
        return buscar(id);
    }

    /* Chamada interna sem @Transactional: o proxy do Spring so vale para chamada vinda de fora,
       e quem usa isto ja abre a propria transacao (ou so le, e o repositorio abre a dele). */
    private Usuario buscar(Long id) {
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
        validaSenha(senha);
        if (repo.existsByLoginIgnoreCase(l))
            throw new IllegalArgumentException("esse login ja existe");
        Usuario u = new Usuario();
        u.setLogin(l);
        u.setNome(nome == null || nome.isBlank() ? l : nome.trim());
        u.setSenhaHash(enc.encode(senha));
        u.setAdmin(admin);
        return repo.save(u);
    }

    /** Regra de senha: 6 caracteres ou mais, com letra, numero e caractere especial. A tela
     *  confere o mesmo enquanto a pessoa digita; aqui e a garantia. Vale para senha nova e troca:
     *  conta antiga com senha fraca continua entrando ate trocar. */
    public static void validaSenha(String senha) {
        String s = senha == null ? "" : senha;
        List<String> falta = new ArrayList<>();
        if (s.length() < 6) falta.add("6 caracteres ou mais");
        if (!TEM_LETRA.matcher(s).find()) falta.add("uma letra");
        if (!TEM_NUMERO.matcher(s).find()) falta.add("um número");
        if (!TEM_ESPECIAL.matcher(s).find()) falta.add("um caractere especial");
        if (!falta.isEmpty()) throw new IllegalArgumentException("a senha precisa de " + String.join(", ", falta));
    }

    /** Confere a senha em texto puro contra o hash guardado. */
    public boolean conferirSenha(Long id, String senha) {
        if (senha == null || senha.isEmpty()) return false;
        return enc.matches(senha, buscar(id).getSenhaHash());
    }

    @Transactional
    public void trocarSenha(Long id, String senha) {
        validaSenha(senha);
        Usuario u = buscar(id);
        u.setSenhaHash(enc.encode(senha));
        repo.save(u);
    }

    @Transactional
    public void renomear(Long id, String nome) {
        Usuario u = buscar(id);
        if (nome != null && !nome.isBlank()) u.setNome(nome.trim());
        repo.save(u);
    }

    @Transactional
    public void ativo(Long id, boolean ativo) {
        Usuario u = buscar(id);
        if (u.isAdmin() && !ativo) throw new IllegalArgumentException("nao da para desativar um administrador");
        u.setAtivo(ativo);
        repo.save(u);
    }

    @Transactional
    public void admin(Long id, boolean admin) {
        Usuario u = buscar(id);
        if (!admin && repo.countByAdminTrue() <= 1 && u.isAdmin())
            throw new IllegalArgumentException("a instancia precisa de ao menos um administrador");
        u.setAdmin(admin);
        repo.save(u);
    }

    @Transactional
    public void remover(Long id) {
        Usuario u = buscar(id);
        if (u.isAdmin()) throw new IllegalArgumentException("tire o administrador antes de remover");
        repo.delete(u);
    }
}
