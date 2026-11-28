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

    private static final java.util.regex.Pattern EMAIL = java.util.regex.Pattern.compile("[^@\\s]{1,100}@[^@\\s]{1,90}\\.[^@\\s]{1,10}");
    private static final java.time.Duration VALIDADE_RESET = java.time.Duration.ofHours(1);
    private final java.security.SecureRandom sorte = new java.security.SecureRandom();

    /** E-mail de recuperacao: vazio tira; formato errado ou repetido em outra conta e recusado. */
    @Transactional
    public void definirEmail(Long id, String email) {
        Usuario u = buscar(id);
        String e = email == null ? "" : email.trim();
        if (e.isEmpty()) { u.setEmail(null); repo.save(u); return; }
        if (e.length() > 200 || !EMAIL.matcher(e).matches()) throw new IllegalArgumentException("esse e-mail parece errado");
        repo.findByEmailIgnoreCase(e).filter(o -> !o.getId().equals(id)).ifPresent(o -> {
            throw new IllegalArgumentException("esse e-mail já está em outra conta"); });
        u.setEmail(e);
        repo.save(u);
    }

    /** Pedido de redefinicao: devolve a conta e o token em texto (para o link do e-mail) quando a
     *  conta existe, esta ativa e tem e-mail. Guarda so o hash do token, valido por uma hora. */
    @Transactional
    public java.util.Optional<java.util.Map.Entry<Usuario, String>> pedirRedefinicao(String loginOuEmail) {
        String k = loginOuEmail == null ? "" : loginOuEmail.trim();
        if (k.isEmpty()) return java.util.Optional.empty();
        java.util.Optional<Usuario> achou = k.contains("@") ? repo.findByEmailIgnoreCase(k) : repo.findByLoginIgnoreCase(k);
        return achou.filter(u -> u.isAtivo() && u.getEmail() != null && !u.getEmail().isBlank()).map(u -> {
            byte[] b = new byte[32];
            sorte.nextBytes(b);
            String token = java.util.HexFormat.of().formatHex(b);
            u.setResetHash(sha256(token));
            u.setResetAte(java.time.Instant.now().plus(VALIDADE_RESET));
            repo.save(u);
            return java.util.Map.entry(u, token);
        });
    }

    /** Troca a senha com o token do e-mail. Token usado, vencido ou desconhecido da o mesmo erro. */
    @Transactional
    public Usuario redefinir(String token, String senha) {
        String t = token == null ? "" : token.trim();
        Usuario u = t.isEmpty() ? null : repo.findByResetHash(sha256(t)).orElse(null);
        if (u == null || u.getResetAte() == null || u.getResetAte().isBefore(java.time.Instant.now()))
            throw new IllegalArgumentException("este link de redefinição venceu ou já foi usado; peça outro");
        validaSenha(senha);
        u.setSenhaHash(enc.encode(senha));
        u.setResetHash(null);
        u.setResetAte(null);
        return repo.save(u);
    }

    private static String sha256(String s) {
        try {
            return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256")
                    .digest(s.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 indisponível", e);
        }
    }

    /** Marca um guia (ou os primeiros passos de uma campanha) como visto na conta. So aceita os nomes conhecidos. */
    @Transactional
    public void marcarTour(Long id, String tour) {
        if (tour == null || !tour.matches("guia-(?:inicio|m|j)-[a-z]{1,12}|passos-\\d{1,12}")) return;
        Usuario u = buscar(id);
        java.util.Set<String> vistos = new java.util.TreeSet<>(toursVistos(u));
        String junto = String.join(",", vistos);
        if (vistos.add(tour) && junto.length() + tour.length() < 990) { u.setTours(String.join(",", vistos)); repo.save(u); }
    }

    public static java.util.List<String> toursVistos(Usuario u) {
        String t = u.getTours();
        return t == null || t.isBlank() ? java.util.List.of() : java.util.List.of(t.split(","));
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
            throw new IllegalArgumentException("o sistema precisa de ao menos um administrador");
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
