package br.com.grimorio.config;

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
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        CsrfTokenRequestAttributeHandler csrfHandler = new CsrfTokenRequestAttributeHandler();
        csrfHandler.setCsrfRequestAttributeName(null);

        http
            .csrf(c -> c
                .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse()) // NOSONAR: o front le o cookie XSRF-TOKEN e o devolve no cabecalho (padrao double-submit)
                .csrfTokenRequestHandler(csrfHandler))
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
            .httpBasic(AbstractHttpConfigurer::disable)
            .authorizeHttpRequests(a -> a
                /* as fontes sao publicas de proposito: a tela de login usa as mesmas do app */
                .requestMatchers("/login.html", "/paginas/login.html", "/favicon.ico", "/vendor/fontes.css", "/vendor/fonts/**",
                                 "/api/ping", "/api/registrar", "/api/publico").permitAll()
                /* conferido no banco a cada pedido, nao no papel congelado no login (ver AdminAutorizacao) */
                .requestMatchers("/api/admin/**").access(adminAutorizacao)
                .requestMatchers("/midia/**").access(midiaAutorizacao)
                .anyRequest().authenticated())
            .formLogin(f -> f
                .loginPage("/paginas/login.html")
                .loginProcessingUrl("/api/login")
                .usernameParameter("login")
                .passwordParameter("senha")
                .successHandler((req, res, auth) -> {
                    res.setStatus(200);
                    res.setContentType(JSON_UTF8);
                    res.getWriter().write("{\"ok\":true}");
                })
                .failureHandler((req, res, ex) -> {
                    res.setStatus(401);
                    res.setContentType(JSON_UTF8);
                    res.getWriter().write("{\"erro\":\"login ou senha invalidos\"}");
                }))
            .logout(l -> l
                .logoutUrl("/api/logout")
                .logoutSuccessHandler((req, res, auth) -> res.setStatus(204))
                .deleteCookies("GRIMORIO"))
            .exceptionHandling(e -> e
                /* 403 que diz o motivo: token CSRF faltando (a tela pede outro e repete) ou falta de
                   permissao. Antes os dois chegavam iguais, sem corpo, e nao dava para saber qual era. */
                .accessDeniedHandler((req, res, ex) -> {
                    res.setStatus(403);
                    res.setContentType(JSON_UTF8);
                    res.getWriter().write(ex instanceof CsrfException
                        ? "{\"erro\":\"a sessao de seguranca expirou, tente de novo\",\"codigo\":\"csrf\"}"
                        : "{\"erro\":\"sem permissao para isso\",\"codigo\":\"proibido\"}");
                })
                .defaultAuthenticationEntryPointFor(
                    (req, res, ex) -> {
                        res.setStatus(401);
                        res.setContentType(JSON_UTF8);
                        res.getWriter().write("{\"erro\":\"nao autenticado\"}");
                    },
                    r -> {
                        String p = r.getRequestURI();
                        return p.startsWith("/api/") || p.startsWith("/midia/");
                    }));

        return http.build();
    }
}
