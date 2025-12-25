#!/usr/bin/env bash
set -euo pipefail

: "${ZOHO_REFRESH_TOKEN?}"
: "${ZOHO_CLIENT_ID?}"
: "${ZOHO_CLIENT_SECRET?}"
: "${CREATOR_OWNER?}"
: "${CREATOR_APP?}"
: "${CREATOR_REPORT?}"

API_DOMAIN="https://www.zohoapis.com"
PAGE_SIZE="${PAGE_SIZE:-500}"
FROM=0
OUT="contratos_dump.json"

get_access_token() {
  curl -s -X POST "https://accounts.zoho.com/oauth/v2/token" \
    -d "refresh_token=${ZOHO_REFRESH_TOKEN}" \
    -d "client_id=${ZOHO_CLIENT_ID}" \
    -d "client_secret=${ZOHO_CLIENT_SECRET}" \
    -d "grant_type=refresh_token" \
  | python3 -c 'import sys, json; print(json.load(sys.stdin)["access_token"])'
}

ACCESS_TOKEN="$(get_access_token)"
echo '[]' > "$OUT"

while true; do
  echo "Buscando from=${FROM} limit=${PAGE_SIZE}..."

  RESP="$(curl -s -X GET \
    "${API_DOMAIN}/creator/v2.1/data/${CREATOR_OWNER}/${CREATOR_APP}/report/${CREATOR_REPORT}?from=${FROM}&limit=${PAGE_SIZE}" \
    -H "Authorization: Zoho-oauthtoken ${ACCESS_TOKEN}")"

  COUNT="$(python3 - <<'PY'
import sys, json
j=json.load(sys.stdin)
print(len(j.get("data", [])))
PY
  <<< "$RESP")"

  if [[ "$COUNT" -eq 0 ]]; then
    echo "Fim. Página vazia."
    break
  fi

  python3 - <<'PY' "$OUT"
import sys, json
out_path=sys.argv[1]
resp=json.load(sys.stdin)
new_items=resp.get("data", [])
with open(out_path, "r", encoding="utf-8") as f:
    cur=json.load(f)
cur.extend(new_items)
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(cur, f, ensure_ascii=False)
PY
  <<< "$RESP"

  FROM=$((FROM + PAGE_SIZE))
  sleep 0.2
done

echo "Dump salvo em: ${OUT}"
