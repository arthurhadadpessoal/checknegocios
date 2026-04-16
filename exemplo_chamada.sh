# Exemplo de chamada ao serviço de renderização
# Substitua a URL pelo endereço do seu serviço no Railway

curl -X POST https://SEU-SERVICO.railway.app/render \
  -H "Content-Type: application/json" \
  -d '{
    "titulo_linha1": "INCLUSÃO DE",
    "titulo_linha2": "CONVÊNIO",
    "mostrar_selo": true,
    "campos": [
      { "label": "Banco",       "valor": "CAPITAL CONSIG SCD S.A." },
      { "label": "Convênio",    "valor": "PREF. DE PALMAS E\nPREV PALMAS" },
      { "label": "A partir de", "valor": "24/03/2026" }
    ]
  }' \
  --output banner_gerado.png

# Para 4 campos (ex: Alteração Comercial):
curl -X POST https://SEU-SERVICO.railway.app/render \
  -H "Content-Type: application/json" \
  -d '{
    "titulo_linha1": "ALTERAÇÃO",
    "titulo_linha2": "COMERCIAL",
    "mostrar_selo": false,
    "campos": [
      { "label": "Banco",       "valor": "Icred Financeira" },
      { "label": "Tabela",      "valor": "INSS" },
      { "label": "Convênio",    "valor": "Aumento de Taxa" },
      { "label": "A partir de", "valor": "24/03/2026" }
    ]
  }' \
  --output banner_alteracao.png
