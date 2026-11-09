package br.com.grimorio.service;

import br.com.grimorio.model.*;
import br.com.grimorio.repo.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;

@Service
public class CampanhaService {

    private final CampanhaRepo campanhas;
    private final MembroRepo membros;
    private final ConviteRepo convites;
    private final UsuarioRepo usuarios;

    public CampanhaService(CampanhaRepo campanhas, MembroRepo membros,
                           ConviteRepo convites, UsuarioRepo usuarios) {
        this.campanhas = campanhas;
        this.membros = membros;
        this.convites = convites;
        this.usuarios = usuarios;
    }

    /** Estourada quando o usuario nao pode fazer aquilo naquela campanha. */
    public static class SemAcessoException extends RuntimeException {
        public SemAcessoException(String m) { super(m); }
    }

    @Transactional(readOnly = true)
    public Campanha porId(Long id) {
        return campanhas.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("campanha nao encontrada"));
    }

    @Transactional(readOnly = true)
    public Optional<Papel> papelDe(Long campanhaId, Long usuarioId) {
        return membros.findByCampanhaIdAndUsuarioId(campanhaId, usuarioId).map(Membro::getPapel);
    }

    /** Exige que o usuario seja membro. Devolve o papel dele. */
    @Transactional(readOnly = true)
    public Papel exigeMembro(Long campanhaId, Long usuarioId) {
        return papelDe(campanhaId, usuarioId)
                .orElseThrow(() -> new SemAcessoException("voce nao participa desta campanha"));
    }

    @Transactional(readOnly = true)
    public void exigeMestre(Long campanhaId, Long usuarioId) {
        if (exigeMembro(campanhaId, usuarioId) != Papel.MESTRE)
            throw new SemAcessoException("so o mestre da campanha faz isso");
    }

    @Transactional(readOnly = true)
    public void exigeDono(Long campanhaId, Long usuarioId) {
        Campanha c = porId(campanhaId);
        if (!Objects.equals(c.getDonoId(), usuarioId))
            throw new SemAcessoException("so quem criou a campanha faz isso");
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> minhas(Long usuarioId) {
        List<Membro> meus = membros.findByUsuarioId(usuarioId);
        if (meus.isEmpty()) return List.of();
        Map<Long, Papel> papeis = new LinkedHashMap<>();
        for (Membro m : meus) papeis.put(m.getCampanhaId(), m.getPapel());
        List<Map<String, Object>> out = new ArrayList<>();
        for (Campanha c : campanhas.findByIdInOrderByNomeAsc(new ArrayList<>(papeis.keySet()))) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", c.getId());
            m.put("nome", c.getNome());
            m.put("sistema", c.getSistema());
            m.put("descricao", c.getDescricao());
            m.put("tema", c.getTema());
            m.put("arquivada", c.isArquivada());
            m.put("dono", Objects.equals(c.getDonoId(), usuarioId));
            m.put("papel", papeis.get(c.getId()).name());
            out.add(m);
        }
        return out;
    }

    @Transactional
    public Campanha criar(Long donoId, String nome, String sistema) {
        String n = nome == null ? "" : nome.trim();
        if (n.length() < 2) throw new IllegalArgumentException("de um nome a campanha");
        Campanha c = new Campanha();
        c.setNome(n);
        c.setSistema(sistema == null ? "" : sistema.trim());
        c.setDonoId(donoId);
        c.setCriadoEm(Instant.now());
        campanhas.save(c);
        membros.save(new Membro(c.getId(), donoId, Papel.MESTRE));
        return c;
    }

    @Transactional
    public void editar(Long campanhaId, Long usuarioId, String nome, String sistema,
                       String descricao, String tema, Boolean arquivada) {
        exigeMestre(campanhaId, usuarioId);
        Campanha c = porId(campanhaId);
        if (nome != null && !nome.isBlank()) c.setNome(nome.trim());
        if (sistema != null) c.setSistema(sistema.trim());
        if (descricao != null) c.setDescricao(descricao.trim());
        if (tema != null && !tema.isBlank()) c.setTema(tema.trim());
        if (arquivada != null) c.setArquivada(arquivada);
        campanhas.save(c);
    }

    // ---------- membros ----------

    @Transactional(readOnly = true)
    public List<Map<String, Object>> membrosDe(Long campanhaId, Long usuarioId) {
        exigeMembro(campanhaId, usuarioId);
        Campanha c = porId(campanhaId);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Membro m : membros.findByCampanhaIdOrderByPapelAscIdAsc(campanhaId)) {
            Usuario u = usuarios.findById(m.getUsuarioId()).orElse(null);
            if (u == null) continue;
            Map<String, Object> x = new LinkedHashMap<>();
            x.put("usuarioId", u.getId());
            x.put("login", u.getLogin());
            x.put("nome", u.getNome());
            x.put("papel", m.getPapel().name());
            x.put("dono", Objects.equals(c.getDonoId(), u.getId()));
            out.add(x);
        }
        return out;
    }

    @Transactional
    public void trocarPapel(Long campanhaId, Long quem, Long alvoId, Papel papel) {
        exigeMestre(campanhaId, quem);
        Campanha c = porId(campanhaId);
        if (Objects.equals(c.getDonoId(), alvoId))
            throw new IllegalArgumentException("o dono da campanha continua mestre");
        Membro m = membros.findByCampanhaIdAndUsuarioId(campanhaId, alvoId)
                .orElseThrow(() -> new IllegalArgumentException("essa pessoa nao esta na campanha"));
        m.setPapel(papel);
        membros.save(m);
    }

    @Transactional
    public void remover(Long campanhaId, Long quem, Long alvoId) {
        exigeMestre(campanhaId, quem);
        Campanha c = porId(campanhaId);
        if (Objects.equals(c.getDonoId(), alvoId))
            throw new IllegalArgumentException("o dono nao pode ser removido da propria campanha");
        membros.findByCampanhaIdAndUsuarioId(campanhaId, alvoId).ifPresent(membros::delete);
    }

    @Transactional
    public void sair(Long campanhaId, Long usuarioId) {
        Campanha c = porId(campanhaId);
        if (Objects.equals(c.getDonoId(), usuarioId))
            throw new IllegalArgumentException("o dono nao sai da propria campanha; arquive ou apague");
        membros.findByCampanhaIdAndUsuarioId(campanhaId, usuarioId).ifPresent(membros::delete);
    }

    // ---------- convites ----------

    @Transactional
    public Convite criarConvite(Long campanhaId, Long quem, Papel papel, String rotulo,
                                int usosMax, Integer diasValidade) {
        exigeMestre(campanhaId, quem);
        Convite c = new Convite();
        c.setCampanhaId(campanhaId);
        c.setPapel(papel == null ? Papel.JOGADOR : papel);
        c.setRotulo(rotulo == null ? "" : rotulo.trim());
        c.setUsosMax(Math.max(1, Math.min(50, usosMax)));
        if (diasValidade != null && diasValidade > 0)
            c.setExpiraEm(Instant.now().plusSeconds(86400L * diasValidade));
        c.setToken(token());
        return convites.save(c);
    }

    @Transactional(readOnly = true)
    public List<Convite> convitesDe(Long campanhaId, Long quem) {
        exigeMestre(campanhaId, quem);
        return convites.findByCampanhaIdOrderByCriadoEmDesc(campanhaId);
    }

    @Transactional
    public void apagarConvite(Long campanhaId, Long quem, Long conviteId) {
        exigeMestre(campanhaId, quem);
        convites.findById(conviteId)
                .filter(c -> Objects.equals(c.getCampanhaId(), campanhaId))
                .ifPresent(convites::delete);
    }

    /** Devolve a campanha em que a pessoa entrou. */
    @Transactional
    public Campanha aceitarConvite(String token, Long usuarioId) {
        Convite c = convites.findByToken(token == null ? "" : token.trim())
                .orElseThrow(() -> new IllegalArgumentException("convite nao encontrado"));
        if (!c.valido()) throw new IllegalArgumentException("esse convite expirou ou ja foi usado");
        Campanha camp = porId(c.getCampanhaId());
        if (membros.findByCampanhaIdAndUsuarioId(camp.getId(), usuarioId).isEmpty()) {
            membros.save(new Membro(camp.getId(), usuarioId, c.getPapel()));
            c.setUsos(c.getUsos() + 1);
            convites.save(c);
        }
        return camp;
    }

    private String token() {
        String abc = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        SecureRandom r = new SecureRandom();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 22; i++) sb.append(abc.charAt(r.nextInt(abc.length())));
        return sb.toString();
    }
}
