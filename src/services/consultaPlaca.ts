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
 * Os sites usam labels como "Marca:", "MARCA", "marca" etc.
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
 * Normaliza um label removendo acentos, dois pontos, espaços extras.
 */
function normalizarLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/:/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrai os dados do veículo a partir do HTML retornado pelo site.
 * Usa labels das colunas para mapear corretamente os campos,
 * independente da ordem ou quantidade de colunas na tabela.
 */
function extrairDados(html: string): Carro | null {
  const $ = cheerio.load(html);

  const resultado: Partial<Carro> = {};

  // Estratégia 1: Buscar pares label/valor em <td> adjacentes
  const tds = $("td");
  for (let i = 0; i < tds.length - 1; i++) {
    const labelText = normalizarLabel($(tds[i]).text());
    const campo = LABEL_MAP[labelText];
    if (campo) {
      const valor = $(tds[i + 1]).text().trim();
      if (valor && !LABEL_MAP[normalizarLabel(valor)]) {
        resultado[campo] = valor;
        i++; // pula o td do valor
      }
    }
  }

  // Estratégia 2: Buscar em <tr> com <th> label e <td> valor
  if (!resultado.marca) {
    $("tr").each((_, tr) => {
      const th = $(tr).find("th, td:first-child").first().text();
      const td = $(tr).find("td:last-child").text();
      const labelText = normalizarLabel(th);
      const campo = LABEL_MAP[labelText];
      if (campo && td.trim() && th.trim() !== td.trim()) {
        resultado[campo] = td.trim();
      }
    });
  }

  // Precisa ter pelo menos a marca para ser válido
  if (!resultado.marca) return null;

  console.log(`[Parser] Campos extraídos: ${Object.keys(resultado).join(", ")}`);

  return {
    marca: resultado.marca || null,
    modelo: resultado.modelo || null,
    importado: resultado.importado || null,
    ano: resultado.ano || null,
    anoModelo: resultado.anoModelo || null,
    cor: resultado.cor || null,
    cilindrada: resultado.cilindrada || null,
    potencia: resultado.potencia || null,
    combustivel: resultado.combustivel || null,
    chassi: resultado.chassi || null,
    motor: resultado.motor || null,
    passageiros: resultado.passageiros || null,
    uf: resultado.uf || null,
    municipio: resultado.municipio || null,
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
