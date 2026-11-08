#!/usr/bin/env bash
# Envia PDFs e trilha sonora para a aplicação, sem passar pelo navegador.
# Use só se o upload pela tela "Arquivos" travar com os livros grandes.
#
#   ./enviar-midia.sh https://seu-app.up.railway.app mestre SUA_SENHA \
#        "/c/Users/artur/OneDrive/Documentos/1_RPG/.../Sistema" \
#        "/c/Users/artur/OneDrive/Documentos/1_RPG/.../Trilha Sonora"
#
# Roda em Git Bash, WSL, Linux e Mac. Precisa de curl.
set -u

URL="${1:?url da aplicação}"
LOGIN="${2:?login do mestre}"
SENHA="${3:?senha}"
SISTEMA="${4:-}"
TRILHA="${5:-}"
URL="${URL%/}"

COOKIES="$(mktemp)"
trap 'rm -f "$COOKIES"' EXIT

token() { awk '$6=="XSRF-TOKEN"{print $7}' "$COOKIES" | tail -1; }

echo "Entrando em $URL ..."
curl -sS -c "$COOKIES" -o /dev/null "$URL/api/ping"
CODIGO=$(curl -sS -b "$COOKIES" -c "$COOKIES" -o /dev/null -w '%{http_code}' \
  -H "X-XSRF-TOKEN: $(token)" \
  --data-urlencode "login=$LOGIN" --data-urlencode "senha=$SENHA" \
  "$URL/api/login")
if [ "$CODIGO" != "200" ]; then echo "login falhou (HTTP $CODIGO)"; exit 1; fi
echo "ok."

abrev_de() {
  local n; n=$(echo "$1" | tr '[:upper:]' '[:lower:]')
  case "$n" in
    *"ordem paranormal rpg"*|*"livro de regras"*) echo "LB|Livro Básico" ;;
    *"sobrevivendo ao horror"*)                   echo "SH|Sobrevivendo ao Horror" ;;
    *"arquivos secretos 01"*|*"arquivos secretos 1"*) echo "AS01|Arquivos Secretos 01" ;;
    *"arquivos secretos 02"*|*"arquivos secretos 2"*) echo "AS02|Arquivos Secretos 02" ;;
    *"arquivos secretos 03"*|*"arquivos secretos 3"*) echo "AS03|Arquivos Secretos 03" ;;
    *"arquivos secretos 04"*|*"arquivos secretos 4"*) echo "AS04|Arquivos Secretos 04" ;;
    *"arquivos secretos 05"*|*"arquivos secretos 5"*) echo "AS05|Arquivos Secretos 05" ;;
    *"arquivos secretos 06"*|*"arquivos secretos 6"*) echo "AS06|Arquivos Secretos 06" ;;
    *"arquivos secretos 07"*|*"arquivos secretos 7"*) echo "AS07|Arquivos Secretos 07" ;;
    *) echo "" ;;
  esac
}

if [ -n "$SISTEMA" ]; then
  echo
  echo "PDFs de $SISTEMA"
  find "$SISTEMA" -type f -iname '*.pdf' | while IFS= read -r f; do
    base=$(basename "$f")
    par=$(abrev_de "$base")
    if [ -z "$par" ]; then echo "  pulei (não reconheci o livro): $base"; continue; fi
    ab="${par%%|*}"; nome="${par#*|}"
    echo "  enviando $ab ($base) ..."
    curl -sS -b "$COOKIES" -H "X-XSRF-TOKEN: $(token)" \
      -F "abrev=$ab" -F "nome=$nome" -F "arquivo=@$f;type=application/pdf" \
      --progress-bar "$URL/api/admin/midia/pdf" ; echo
  done
fi

if [ -n "$TRILHA" ]; then
  echo
  echo "Trilha de $TRILHA"
  find "$TRILHA" -type f -iname '*.mp3' | while IFS= read -r f; do
    cat=$(basename "$(dirname "$f")")
    nome=$(basename "$f"); nome="${nome%.*}"
    printf '  %s / %s ... ' "$cat" "$nome"
    curl -sS -o /dev/null -b "$COOKIES" -H "X-XSRF-TOKEN: $(token)" \
      -F "categoria=$cat" -F "nome=$nome" -F "arquivo=@$f" \
      "$URL/api/admin/midia/audio" && echo "ok" || echo "falhou"
  done
fi

echo
echo "Pronto. Abra o app e confira em '···' > Arquivos."
