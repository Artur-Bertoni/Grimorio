import { defineRailway, github, postgres, preserve, project, service, volume } from "railway/iac";

// Aplicado pela CLI, nao pelo push (ver README, "Deploy no Railway"):
//   railway config plan     mostra o que vai mudar, sem mudar
//   railway config apply
// O codigo continua indo pelo git push na main; cada servico so redeploya quando a pasta dele muda.

const REPOSITORIO = "Artur-Bertoni/Grimorio";
const DOMINIO = "grimorio-rpg.up.railway.app";
const REGIAO = "us-east4-eqdc4a";

const codigo = (pasta: string) => github(REPOSITORIO, { branch: "main", rootDirectory: pasta });

const dockerfile = (pasta: string) => ({
  builder: "DOCKERFILE" as const,
  dockerfilePath: "Dockerfile",
  watchPatterns: [`/${pasta}/**`],
});

export default defineRailway(() => {
  const banco = postgres("Postgres", { region: REGIAO });
  // o banco dorme quando ninguem usa, como ja estava; postgres() nao tem opcao para isso
  Object.assign(banco, { deploy: { ...banco.deploy, sleepApplication: true } });

  // Livros, trilhas, imagens e modelos de campanha. Volume so se prende a um servico: por isso a
  // midia mora na api, e o web so repassa /midia para ela.
  const midia = volume("campanha-volume", {
    region: REGIAO,
    sizeMB: 5000,
    allowOnlineResize: true,
    alerts: { usage: { "80": {}, "95": {}, "100": {} } },
  });

  // A api (Spring Boot, pasta api/). O nome "Grimório" e o do servico que ja existia: renomear pela
  // IaC apagaria e recriaria o servico, e o volume junto. Sem dominio publico: so o web fala com ela,
  // pela rede privada (grimorio.railway.internal).
  const api = service("Grimório", {
    source: codigo("api"),
    build: dockerfile("api"),
    deploy: {
      healthcheckPath: "/api/ping",
      healthcheckTimeout: 120,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 5,
      sleepApplication: true,
    },
    networking: { privateNetworkEndpoint: "grimorio" },
    volumeMounts: { "/data": midia },
    env: {
      // valores que ja estao no Railway e apontam para o Postgres; ficam como estao
      DATABASE_URL: preserve(),
      DB_HOST: preserve(),
      DB_PORT: preserve(),
      PORT: "8080",
      // link de redefinir senha: o endereco publico e o do web
      URL_PUBLICA: `https://${DOMINIO}`,
    },
  });

  // O front (pasta web/): Caddy com os arquivos, sem build. Repassa /api e /midia para a api.
  const web = service("web", {
    source: codigo("web"),
    build: dockerfile("web"),
    deploy: {
      healthcheckPath: "/saude",
      healthcheckTimeout: 60,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 5,
      sleepApplication: true,
    },
    // o dominio (DOMINIO, porta 8080) fica no painel: a IaC do Railway nao registra *.up.railway.app
    env: {
      PORT: "8080",
      API_URL: "grimorio.railway.internal:8080",
      URL_PUBLICA: `https://${DOMINIO}`,
    },
  });

  return project("Grimório", {
    environments: ["production"],
    resources: [banco, midia, api, web],
  });
});
