package br.com.grimorio.config;

import br.com.grimorio.repo.UsuarioRepo;
import br.com.grimorio.service.ConfigService;
import br.com.grimorio.service.Freio;
import br.com.grimorio.service.UsuarioService;
import jakarta.servlet.DispatcherType;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;

import java.security.SecureRandom;
import java.util.Base64;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;

@Configuration
public class SecurityConfig {

    private static final String JSON_UTF8 = "application/json;charset=UTF-8";
    private static final String COOKIE_LEMBRAR = "GRIMORIO_LEMBRAR";
    private static final String CHAVE_LEMBRAR = "seguranca.lembrar";
    /* o mesmo prazo da sessao (server.servlet.session.timeout) */
    private static final int LEMBRAR_SEG = 30 * 24 * 60 * 60;
    private static final SecureRandom SORTE = new SecureRandom();

    private final MidiaAutorizacao midiaAutorizacao;
    private final AdminAutorizacao adminAutorizacao;

    public SecurityConfig(MidiaAutorizacao midiaAutorizacao, AdminAutorizacao adminAutorizacao) {
        this.midiaAutorizacao = midiaAutorizacao;
        this.adminAutorizacao = adminAutorizacao;
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, UsuarioService usuarios, UsuarioRepo repoUsuarios,
                                    ConfigService config, Freio freio) {
        CsrfTokenRequestAttributeHandler csrfHandler = new CsrfTokenRequestAttributeHandler();
        csrfHandler.setCsrfRequestAttributeName(null);
        FreioDeLogin freioLogin = new FreioDeLogin(freio);

        http
            .addFilterBefore(freioLogin, UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(new ContaDoPedido(repoUsuarios), AuthorizationFilter.class)
            /* A sessao mora na memoria do Tomcat e morria a cada deploy: o "30 dias" do cookie nunca
               passava do proximo git push, e a mesa inteira precisava entrar de novo. O cookie de lembrar
               e assinado (SHA-256) com uma chave guardada no banco, entao sobrevive a reinicio e a
               deploy, e deixa de valer sozinho quando a senha muda ou a conta e desativada. */
            .rememberMe(r -> r
                .key(chaveDeLembrar(config))
                .userDetailsService(usuarios)
                .alwaysRemember(true)
                .tokenValiditySeconds(LEMBRAR_SEG)
                .rememberMeCookieName(COOKIE_LEMBRAR))
            .headers(h -> h
                .referrerPolicy(rp -> rp.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.SAME_ORIGIN))
                /* nada aqui usa camera, microfone nem localizacao: um script que entrasse nao os ganha */
                .permissionsPolicyHeader(pp -> pp.policy("camera=(), microphone=(), geolocation=(), payment=(), usb=()"))
                /* CSP minima que nao muda o que a tela carrega: sem plugin, sem <base> trocado, sem
                   moldura alheia, formulario so para o proprio site. A completa (script-src) depende
                   de tirar o eval do petite-vue e os style= inline; ver docs/auditoria-rodada-4.md */
                /* script so do proprio site: script injetado e handler on*= nao rodam. O unsafe-eval fica
                   porque o motor de template (petite-vue) compila as expressoes com new Function, e o
                   pdf.js tambem pode usar. Estilo fica livre (os templates usam style= com a cor do tema). */
                .contentSecurityPolicy(csp -> csp.policyDirectives(
                    "script-src 'self' 'unsafe-eval'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'")))
            .csrf(c -> c
                .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse()) // NOSONAR: o front le o cookie XSRF-TOKEN e o devolve no cabecalho (padrao double-submit)
                .csrfTokenRequestHandler(csrfHandler))
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
            .httpBasic(AbstractHttpConfigurer::disable)
            .authorizeHttpRequests(a -> a
                /* o despacho assincrono so acontece para um pedido que ja passou pela autorizacao
                   (o fluxo SSE do mapa, o download do pacote); conferir de novo no fim dele, com a
                   resposta ja comecada, so geraria erro no log */
                .dispatcherTypeMatchers(DispatcherType.ASYNC).permitAll()
                /* Aqui so chegam /api e /midia: as paginas (login, privacidade, termos, a casca) sao do
                   servico web. Estas rotas sao o que a tela de login e a de privacidade pedem sem conta. */
                .requestMatchers("/api/ping", "/api/registrar", "/api/publico/**").permitAll()
                /* conferido no banco a cada pedido, nao no papel congelado no login (ver AdminAutorizacao) */
                .requestMatchers("/api/admin/**").access(adminAutorizacao)
                .requestMatchers("/midia/**").access(midiaAutorizacao)
                .anyRequest().authenticated())
            .formLogin(f -> f
                /* a pagina mora no servico web; declarar o endereco impede o Spring de gerar a tela de
                   login padrao dele em /login */
                .loginPage("/paginas/login.html")
                .loginProcessingUrl("/api/login")
                .usernameParameter("login")
                .passwordParameter("senha")
                .successHandler((req, res, auth) -> {
                    freioLogin.acertou(req);
                    res.setStatus(200);
                    res.setContentType(JSON_UTF8);
                    res.getWriter().write("{\"ok\":true}");
                })
                .failureHandler((req, res, ex) -> {
                    freioLogin.errou(req);
                    res.setStatus(401);
                    res.setContentType(JSON_UTF8);
                    res.getWriter().write("{\"erro\":\"login ou senha inválidos\"}");
                }))
            .logout(l -> l
                .logoutUrl("/api/logout")
                .logoutSuccessHandler((req, res, auth) -> res.setStatus(204))
                .deleteCookies("GRIMORIO", COOKIE_LEMBRAR))
            .exceptionHandling(e -> e
                /* 403 que diz o motivo: token CSRF faltando (a tela pede outro e repete) ou falta de
                   permissao. Antes os dois chegavam iguais, sem corpo, e nao dava para saber qual era. */
                .accessDeniedHandler((req, res, ex) -> {
                    res.setStatus(403);
                    res.setContentType(JSON_UTF8);
                    res.getWriter().write(ex instanceof CsrfException
                        ? "{\"erro\":\"a sessão de segurança expirou, tente de novo\",\"codigo\":\"csrf\"}"
                        : "{\"erro\":\"sem permissão para isso\",\"codigo\":\"proibido\"}");
                })
                .defaultAuthenticationEntryPointFor(
                    (req, res, ex) -> {
                        res.setStatus(401);
                        res.setContentType(JSON_UTF8);
                        res.getWriter().write("{\"erro\":\"não autenticado\"}");
                    },
                    r -> {
                        String p = r.getRequestURI();
                        return p.startsWith("/api/") || p.startsWith("/midia/");
                    }));

        return http.build();
    }

    /** A chave que assina o cookie de lembrar: gerada uma vez e guardada no banco, para valer em
     *  qualquer boot. Trocar o valor na tabela config desloga as contas de uma vez (saida de emergencia). */
    private static String chaveDeLembrar(ConfigService config) {
        String k = config.get(CHAVE_LEMBRAR, "");
        if (k.isBlank()) {
            byte[] b = new byte[32];
            SORTE.nextBytes(b);
            k = Base64.getUrlEncoder().withoutPadding().encodeToString(b);
            config.set(CHAVE_LEMBRAR, k);
        }
        return k;
    }
}
