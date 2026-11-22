package br.com.grimorio.config;

import br.com.grimorio.service.Freio;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.Locale;

/**
 * Freio de senha errada no POST /api/login. Antes, um script testava senhas sem limite contra
 * qualquer conta. Tres contagens, porque o IP vem do X-Forwarded-For e o cliente pode forja-lo:
 *  - conta + IP: 5 erros em 15 min (quem errou a propria senha espera pouco);
 *  - IP: 30 erros em 15 min (quem testa muitas contas de um lugar so);
 *  - conta, de qualquer lugar: 20 erros em 15 min (quem troca de IP a cada tentativa).
 * A ultima deixa alguem travar a conta de outra pessoa por 15 minutos; e o preco de nao deixar
 * a senha ser adivinhada (ver OWASP, "Blocking Brute Force Attacks").
 */
public class FreioDeLogin extends OncePerRequestFilter {

    static final Duration JANELA = Duration.ofMinutes(15);
    private static final int POR_CONTA_E_IP = 5, POR_IP = 30, POR_CONTA = 20;

    private final Freio freio;

    public FreioDeLogin(Freio freio) {
        this.freio = freio;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest req) {
        return !("POST".equals(req.getMethod()) && "/api/login".equals(req.getRequestURI()));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain cadeia)
            throws ServletException, IOException {
        String conta = conta(req), ip = req.getRemoteAddr();
        String travada = freio.travado(chaveContaIp(conta, ip), POR_CONTA_E_IP, JANELA) ? chaveContaIp(conta, ip)
                : freio.travado(chaveIp(ip), POR_IP, JANELA) ? chaveIp(ip)
                : freio.travado(chaveConta(conta), POR_CONTA, JANELA) ? chaveConta(conta) : null;
        if (travada != null) {
            long seg = freio.segundosAteLiberar(travada, JANELA);
            res.setStatus(429);
            res.setHeader("Retry-After", String.valueOf(seg));
            res.setContentType("application/json;charset=UTF-8");
            res.getWriter().write("{\"erro\":\"tentativas demais; espere " + Math.max(1, (seg + 59) / 60)
                    + " min e tente de novo\",\"codigo\":\"muitas-tentativas\"}");
            return;
        }
        cadeia.doFilter(req, res);
    }

    /** Senha errada: soma nas tres contagens. */
    void errou(HttpServletRequest req) {
        String conta = conta(req), ip = req.getRemoteAddr();
        freio.conta(chaveContaIp(conta, ip));
        freio.conta(chaveIp(ip));
        freio.conta(chaveConta(conta));
    }

    /** Entrou: a conta volta a ter todas as tentativas (o IP nao, para nao premiar quem acertou uma). */
    void acertou(HttpServletRequest req) {
        String conta = conta(req);
        freio.esquece(chaveContaIp(conta, req.getRemoteAddr()));
        freio.esquece(chaveConta(conta));
    }

    private static String conta(HttpServletRequest req) {
        String c = req.getParameter("login");
        return c == null ? "" : c.trim().toLowerCase(Locale.ROOT);
    }

    private static String chaveContaIp(String conta, String ip) { return "login:" + conta + "@" + ip; }
    private static String chaveIp(String ip) { return "login-ip:" + ip; }
    private static String chaveConta(String conta) { return "login-conta:" + conta; }
}
