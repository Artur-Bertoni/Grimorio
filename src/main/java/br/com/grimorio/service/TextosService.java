package br.com.grimorio.service;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.stereotype.Service;

/**
 * Textos de privacidade e de termos de uso da instancia. Cada instancia e de quem a sobe, entao
 * o texto e do administrador (Administracao › Textos legais); sem nada gravado vale o padrao
 * abaixo, que descreve o que o Grimorio de fato guarda.
 */
@Service
public class TextosService {

    public static final String PRIVACIDADE = "privacidade";
    public static final String TERMOS = "termos";
    private static final String PREFIXO = "texto.";

    private static final Map<String, String> TITULOS = Map.of(
            PRIVACIDADE, "Privacidade",
            TERMOS, "Termos de uso");

    private static final Map<String, String> PADRAO = Map.of(
            PRIVACIDADE, """
                Os dados ficam no servidor desta instância e não são vendidos nem enviados a terceiros.

                O que é guardado: o login, o nome que aparece para a mesa, a senha (só como hash, nunca em texto) e, se você informar, um e-mail para recuperar a senha. Também ficam guardados o conteúdo das campanhas em que você participa: guia, mesa, fichas, anotações, recados do mural, rolagens de dados e os arquivos enviados.

                Cookies: só o cookie de sessão, que mantém você conectado, e o de segurança contra envio forjado de formulários. Não há cookie de propaganda nem rastreio de terceiros.

                Contagem de uso: o servidor conta, de forma anônima e somada, quantas vezes cada tela foi aberta por dia, para quem administra saber o que é usado. Não se guarda quem abriu. Dá para desligar em Configurações › Privacidade.

                Inteligência artificial: se quem administra configurar a IA, as perguntas feitas a ela e os trechos de livros usados como contexto são enviados ao provedor da IA para gerar a resposta.

                Para pedir uma cópia ou a remoção dos seus dados, fale com quem administra esta instância pelo botão "Falar com o suporte", no rodapé de qualquer página.""",
            TERMOS, """
                O Grimório é um painel para mesas de RPG. Ao usar esta instância você concorda com estes termos, definidos por quem a administra.

                Conteúdo: você é responsável pelo que envia (textos, imagens, PDFs, áudios). Envie só o que você tem direito de usar. Livros e materiais protegidos ficam visíveis apenas para as pessoas da campanha, como decidir quem mestra.

                Convivência: respeite as pessoas da mesa. Quem administra pode desativar contas que abusem do serviço ou de outras pessoas.

                Encerramento: você pode sair de uma campanha a qualquer momento e pedir a remoção da sua conta pelo suporte.""");

    private final ConfigService config;

    public TextosService(ConfigService config) {
        this.config = config;
    }

    public static boolean conhecido(String chave) { return TITULOS.containsKey(chave); }

    public Map<String, Object> ler(String chave) {
        if (!conhecido(chave)) throw new IllegalArgumentException("texto desconhecido");
        String gravado = config.get(PREFIXO + chave, "");
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("chave", chave);
        r.put("titulo", TITULOS.get(chave));
        r.put("texto", gravado.isBlank() ? PADRAO.get(chave) : gravado);
        r.put("padrao", gravado.isBlank());
        return r;
    }

    /** Grava o texto do administrador; vazio volta ao padrao. */
    public void gravar(String chave, String texto) {
        if (!conhecido(chave)) throw new IllegalArgumentException("texto desconhecido");
        String t = texto == null ? "" : texto.trim();
        if (t.length() > 20000) throw new IllegalArgumentException("texto longo demais (máximo de 20 mil caracteres)");
        config.set(PREFIXO + chave, t);
    }
}
