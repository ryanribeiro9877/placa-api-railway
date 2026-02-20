import axios from "axios";
import * as cheerio from "cheerio";
import { Carro } from "../models/Carro";

/**
 * Configuração dos sites de consulta.
 * Cada site tem sua URL e um user-agent para simular navegador.
 * Equivalente às URLs comentadas no PreencheLista.cs original.
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
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  Referer: "https://www.google.com/",
};

/**
 * Formatos aceitos de placa:
 * - Antiga: ABC1234 (3 letras + 4 números)
 * - Mercosul: ABC1D23 (3 letras + 1 número + 1 letra + 2 números)
 */
const PLACA_REGEX = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/i;

/**
 * Valida o formato da placa informada.
 */
export function validarPlaca(placa: string): boolean {
  const placaLimpa = placa.replace(/[-\s]/g, "").toUpperCase();
  return PLACA_REGEX.test(placaLimpa);
}

/**
 * Extrai os dados do veículo a partir do HTML retornado pelo site.
 * Equivalente ao método Lista() + construtor Carro(List<HtmlNode>) do C#.
 *
 * O código original faz: pega cada segunda <td> (índices 2, 4, 6... até 28)
 * Isso porque as tabelas desses sites têm o formato:
 *   <tr><td>Marca:</td><td>RENAULT</td></tr>
 * E ele pega apenas os valores (td pares).
 */
function extrairDados(html: string): Carro | null {
  const $ = cheerio.load(html);

  // Seleciona todas as <td> da página
  const tds = $("td");

  if (tds.length < 28) return null;

  // Pega os valores (td pares: índice 1, 3, 5... no zero-based)
  // Equivalente ao loop for (int i = 2; i <= 28; i += 2) do C#
  // No C# usa XPath 1-based, aqui usamos 0-based
  const valores: (string | null)[] = [];
  for (let i = 1; i < 28; i += 2) {
    const td = tds.eq(i);
    valores.push(td.length > 0 ? td.text().trim() : null);
  }

  // Verifica se pelo menos o primeiro valor (marca) existe
  if (!valores[0]) return null;

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

/**
 * Tenta consultar um site específico.
 * Retorna os dados do veículo ou null se falhar.
 */
async function consultarSite(
  url: string,
  nomeSite: string
): Promise<Carro | null> {
  try {
    const response = await axios.get(url, {
      headers: HEADERS,
      timeout: 10000, // 10 segundos de timeout
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

/**
 * Consulta a placa do veículo em múltiplos sites com fallback.
 * Equivalente ao método Site() do PreencheLista.cs original.
 *
 * Fluxo:
 * 1. Tenta PlacaIPVA
 * 2. Se falhar, tenta Keplaca
 * 3. Se falhar, tenta PlacaFipe
 * 4. Se todos falharem, retorna null
 */
export async function consultarPlaca(placa: string): Promise<Carro | null> {
  const placaLimpa = placa.replace(/[-\s]/g, "").toUpperCase();

  for (const site of SITES) {
    const url = site.url(placaLimpa);
    console.log(`[INFO] Consultando ${site.nome}: ${url}`);

    const resultado = await consultarSite(url, site.nome);
    if (resultado) return resultado;
  }

  return null;
}
