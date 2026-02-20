# 🚗 API de Consulta de Placas — Railway Deploy

API Node.js/TypeScript para consulta de veículos por placa com fallback em 3 sites.

## Deploy no Railway

### 1. Criar repositório no GitHub

```bash
cd placa-api-railway
git init
git add .
git commit -m "API de consulta de placas"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/placa-api.git
git push -u origin main
```

### 2. Deploy no Railway

1. Acesse [railway.app](https://railway.app) e faça login com GitHub
2. Clique em **"New Project"** → **"Deploy from GitHub Repo"**
3. Selecione o repositório `placa-api`
4. Railway detecta Node.js automaticamente e faz deploy

### 3. Configurar variáveis de ambiente

No painel do Railway, vá em **Variables** e adicione:

| Variável | Valor |
|---|---|
| `ALLOWED_ORIGINS` | `https://rastreamentobrat.com.br,https://www.rastreamentobrat.com.br` |
| `RATE_LIMIT` | `30` |

> A variável `PORT` é injetada automaticamente pelo Railway.

### 4. Gerar domínio público

No painel: **Settings → Networking → Generate Domain**

Você receberá algo como: `placa-api-production-xxxx.up.railway.app`

### 5. Testar

```bash
curl https://SEU_DOMINIO.up.railway.app/health
curl https://SEU_DOMINIO.up.railway.app/IZO1880
```

---

## Uso no BratCargas

```typescript
const API_URL = "https://SEU_DOMINIO.up.railway.app";

const response = await fetch(`${API_URL}/${placa}`);
const data = await response.json();

if (data.data) {
  setMarca(data.data.marca);
  setModelo(data.data.modelo);
  // ...
}
```

## Estrutura

```
src/
├── models/Carro.ts            # Interface do veículo
├── services/consultaPlaca.ts   # Scraping com fallback (3 sites)
└── server.ts                   # Express + rate limiting
```

## Desenvolvimento local

```bash
npm install
npm run dev    # http://localhost:3001
```
