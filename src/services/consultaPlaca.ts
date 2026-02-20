import axios from "axios";
import * as cheerio from "cheerio";
import { Carro } from "../models/Carro";

/**
 * Configuração dos sites de consulta (scraping).
 */
const SITES = [
  {
    nome: "PlacaIPVA",
    url: (placa: string) => `https://placaipva.com.br/placa/${placa}`,
  },
  {
    nome: "Keplaca",
    url: (placa: string) => `https://www.keplaca.com/placa/${placa}`,
  },
  {
    nome: "PlacaFipe",
    url: (placa: string) => `https://placafipe.com/${placa}`,
  },
];

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  Referer: "https://www.google.com/",
};

const PLACA_REGEX = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/i;

export function validarPlaca(placa: string): boolean {
  const placaLimpa = placa.replace(/[-\s]/g, "").toUpperCase();
  return PLACA_REGEX.test(placaLimpa);
}

/**
 * Mapa de labels possíveis nos sites → campo do Carro.
 */
const LABEL_MAP: Record<string, keyof Carro> = {
  "marca": "marca",
  "modelo": "modelo",
  "importado": "importado",
  "ano": "ano",
  "ano modelo": "anoModelo",
  "ano-modelo": "anoModelo",
  "anomodelo": "anoModelo",
  "cor": "cor",
  "cilindrada": "cilindrada",
  "cilindradas": "cilindrada",
  "potencia": "potencia",
  "potência": "potencia",
  "combustivel": "combustivel",
  "combustível": "combustivel",
  "chassi": "chassi",
  "motor": "motor",
  "passageiros": "passageiros",
  "uf": "uf",
  "estado": "uf",
  "municipio": "municipio",
  "município": "municipio",
  "cidade": "municipio",
};

/**
 * Labels que indicam seções de valores FIPE / financeiros — devem ser ignorados.
 */
const LABELS_IGNORAR = [
  "valor venal", "valor", "fipe", "preço", "preco", "seguro",
  "ipva", "tabela", "referência", "referencia", "r$",
];

function normalizarLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/:/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Verifica se um valor parece ser financeiro/FIPE (R$ xxx, etc.)
 */
function isValorFinanceiro(valor: string): boolean {
  const v = valor.trim().toLowerCase();
  return v.startsWith("r$") || v.startsWith("r $") || /^\d{1,3}(\.\d{3})*(,\d{2})?$/.test(v);
}

/**
 * Verifica se um label pertence a uma seção que deve ser ignorada.
 */
function isLabelIgnorado(label: string): boolean {
  const norm = normalizarLabel(label);
  return LABELS_IGNORAR.some(ign => norm.includes(ign));
}

/**
 * Extrai os dados do veículo a partir do HTML.
 * Usa abordagem híbrida:
 * 1. Label-based: busca pares label/valor filtrando seções FIPE
 * 2. Index-based (fallback): usa a primeira tabela com >= 28 TDs
 */
function extrairDados(html: string): Carro | null {
  const $ = cheerio.load(html);

  // ===== Estratégia 1: Label-based com filtro de valores financeiros =====
  const resultado: Partial<Carro> = {};
  let dentroDeSecaoFipe = false;

  const tds = $("td");
  for (let i = 0; i < tds.length - 1; i++) {
    const rawLabel = $(tds[i]).text().trim();
    const labelNorm = normalizarLabel(rawLabel);

    // Detectar se entramos em seção FIPE/financeira
    if (isLabelIgnorado(rawLabel)) {
      dentroDeSecaoFipe = true;
      continue;
    }

    const campo = LABEL_MAP[labelNorm];
    if (campo && !dentroDeSecaoFipe) {
      const valor = $(tds[i + 1]).text().trim();
      // Rejeitar se o valor parece financeiro ou é outro label
      if (valor && !LABEL_MAP[normalizarLabel(valor)] && !isValorFinanceiro(valor) && !isLabelIgnorado(valor)) {
        // Só aceitar o primeiro valor encontrado para cada campo
        if (!resultado[campo]) {
          resultado[campo] = valor;
        }
        i++; // pula o td do valor
      }
    }
  }

  if (resultado.marca) {
    console.log(`[Parser-Label] Campos: ${Object.keys(resultado).join(", ")}`);
    return buildCarro(resultado);
  }

  // ===== Estratégia 2: Index-based na primeira tabela com dados =====
  console.log("[Parser] Label-based falhou, tentando index-based...");
  const tables = $("table");
  for (let t = 0; t < tables.length; t++) {
    const tableTds = $(tables[t]).find("td");
    if (tableTds.length < 28) continue;

    const valores: (string | null)[] = [];
    for (let i = 1; i < 28; i += 2) {
      const td = tableTds.eq(i);
      valores.push(td.length > 0 ? td.text().trim() : null);
    }

    if (valores[0] && !isValorFinanceiro(valores[0])) {
      console.log(`[Parser-Index] Tabela ${t}: marca=${valores[0]}`);
      return {
        marca: valores[0],
        modelo: valores[1],
        importado: valores[2],
        ano: valores[3],
        anoModelo: valores[4],
        cor: valores[5],
        cilindrada: valores[6],
        potencia: valores[7],
        combustivel: valores[8],
        chassi: valores[9],
        motor: valores[10],
        passageiros: valores[11],
        uf: valores[12],
        municipio: valores[13],
      };
    }
  }

  return null;
}

function buildCarro(r: Partial<Carro>): Carro {
  return {
    marca: r.marca || null,
    modelo: r.modelo || null,
    importado: r.importado || null,
    ano: r.ano || null,
    anoModelo: r.anoModelo || null,
    cor: r.cor || null,
    cilindrada: r.cilindrada || null,
    potencia: r.potencia || null,
    combustivel: r.combustivel || null,
    chassi: r.chassi || null,
    motor: r.motor || null,
    passageiros: r.passageiros || null,
    uf: r.uf || null,
    municipio: r.municipio || null,
  };
}

// ========== Estratégia 1: API Gateway JSON (sem scraping) ==========
async function consultarGateway(placa: string): Promise<Carro | null> {
  try {
    console.log(`[Gateway] Consultando wdapi2: ${placa}`);
    const response = await axios.get(
      `https://wdapi2.com.br/consulta/${placa}/aeaboreal`,
      {
        headers: {
          "User-Agent": HEADERS["User-Agent"],
          Accept: "application/json",
        },
        timeout: 12000,
      }
    );

    if (response.status === 200 && response.data?.MARCA) {
      const json = response.data;
      console.log(`[Gateway] OK: ${json.MARCA} ${json.MODELO}`);
      return {
        marca: json.MARCA || null,
        modelo: json.MODELO || null,
        importado: json.importado || null,
        ano: json.ano || null,
        anoModelo: json.anoModelo || null,
        cor: json.cor || null,
        cilindrada: json.cilindradas || null,
        potencia: json.potencia || null,
        combustivel: json.combustivel || null,
        chassi: json.chassi || null,
        motor: json.motor || null,
        passageiros: json.passageiros || null,
        uf: json.uf || null,
        municipio: json.municipio || null,
      };
    }
  } catch (error: any) {
    console.log(`[Gateway] Falha: ${error.message}`);
  }
  return null;
}

// ========== Estratégia 2: API apiplacas.com.br ==========
async function consultarApiPlacas(placa: string): Promise<Carro | null> {
  try {
    console.log(`[ApiPlacas] Consultando: ${placa}`);
    const response = await axios.post(
      "https://apiplacas.com.br/consulta",
      { placa },
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": HEADERS["User-Agent"],
          Accept: "application/json",
          Origin: "https://apiplacas.com.br",
          Referer: "https://apiplacas.com.br/",
        },
        timeout: 12000,
      }
    );

    const json = response.data;
    if (json && (json.marca || json.MARCA)) {
      console.log(`[ApiPlacas] OK: ${json.marca || json.MARCA}`);
      return {
        marca: json.marca || json.MARCA || null,
        modelo: json.modelo || json.MODELO || null,
        importado: json.importado || null,
        ano: json.ano || json.anoFabricacao || null,
        anoModelo: json.anoModelo || null,
        cor: json.cor || json.COR || null,
        cilindrada: json.cilindrada || json.cilindradas || null,
        potencia: json.potencia || null,
        combustivel: json.combustivel || null,
        chassi: json.chassi || null,
        motor: json.motor || null,
        passageiros: json.passageiros || null,
        uf: json.uf || json.UF || null,
        municipio: json.municipio || json.MUNICIPIO || null,
      };
    }
  } catch (error: any) {
    console.log(`[ApiPlacas] Falha: ${error.message}`);
  }
  return null;
}

// ========== Estratégia 3: Scraping direto ==========
async function consultarSiteDireto(
  url: string,
  nomeSite: string
): Promise<Carro | null> {
  try {
    const response = await axios.get(url, {
      headers: HEADERS,
      timeout: 10000,
      maxRedirects: 5,
    });

    if (response.status === 200 && response.data) {
      const dados = extrairDados(response.data);
      if (dados) {
        console.log(`[OK] Dados encontrados via ${nomeSite}`);
        return dados;
      }
    }
  } catch (error: any) {
    console.log(
      `[FALHA] ${nomeSite}: ${error.message || "Erro desconhecido"}`
    );
  }
  return null;
}

// ========== Estratégia 4: Scraping via ScraperAPI (proxy residencial) ==========
async function consultarSiteViaProxy(
  url: string,
  nomeSite: string
): Promise<Carro | null> {
  const scraperApiKey = process.env.SCRAPER_API_KEY;
  if (!scraperApiKey) return null;

  try {
    const proxyUrl = `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(url)}&country_code=br&render=false`;
    console.log(`[Proxy] Consultando ${nomeSite} via ScraperAPI`);

    const response = await axios.get(proxyUrl, { timeout: 30000 });

    if (response.status === 200 && response.data) {
      const dados = extrairDados(response.data);
      if (dados) {
        console.log(`[Proxy] OK: Dados encontrados via ${nomeSite}`);
        return dados;
      }
    }
  } catch (error: any) {
    console.log(`[Proxy] ${nomeSite} falha: ${error.message}`);
  }
  return null;
}

/**
 * Consulta a placa do veículo com múltiplas estratégias:
 * 1. API Gateway JSON (wdapi2) — mais rápida, sem scraping
 * 2. API apiplacas.com.br — JSON direto
 * 3. Scraping direto (sem proxy) — funciona se IP não bloqueado
 * 4. Scraping via ScraperAPI (proxy residencial) — fallback final
 */
export async function consultarPlaca(placa: string): Promise<Carro | null> {
  const placaLimpa = placa.replace(/[-\s]/g, "").toUpperCase();

  // 1) API Gateway JSON
  console.log(`\n========== Consulta: ${placaLimpa} ==========`);
  console.log("[1/4] Tentando Gateway API (wdapi2)...");
  let resultado = await consultarGateway(placaLimpa);
  if (resultado) return resultado;

  // 2) API apiplacas
  console.log("[2/4] Tentando ApiPlacas...");
  resultado = await consultarApiPlacas(placaLimpa);
  if (resultado) return resultado;

  // 3) Scraping direto
  console.log("[3/4] Tentando scraping direto...");
  for (const site of SITES) {
    const url = site.url(placaLimpa);
    resultado = await consultarSiteDireto(url, site.nome);
    if (resultado) return resultado;
  }

  // 4) Scraping via ScraperAPI (proxy)
  if (process.env.SCRAPER_API_KEY) {
    console.log("[4/4] Tentando scraping via ScraperAPI (proxy)...");
    for (const site of SITES) {
      const url = site.url(placaLimpa);
      resultado = await consultarSiteViaProxy(url, site.nome);
      if (resultado) return resultado;
    }
  } else {
    console.log("[4/4] ScraperAPI não configurada (SCRAPER_API_KEY ausente)");
  }

  console.log(`[RESULTADO] Nenhuma estratégia retornou dados para ${placaLimpa}`);
  return null;
}
