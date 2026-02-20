import express from "express";
import cors from "cors";
import { consultarPlaca, validarPlaca } from "./services/consultaPlaca";
import { Result } from "./models/Carro";

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================================
// CORS — Restrinja para o domínio do BratCargas em produção
// ============================================================
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["*"];

app.use(
  cors({
    origin: ALLOWED_ORIGINS.includes("*") ? "*" : ALLOWED_ORIGINS,
    methods: ["GET"],
  })
);

app.use(express.json());

// ============================================================
// Rate Limiting simples (sem dependência extra)
// Limita a 30 consultas por minuto por IP
// ============================================================
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT || "30");
const RATE_WINDOW_MS = 60_000; // 1 minuto

function rateLimit(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    next();
    return;
  }

  if (entry.count >= RATE_LIMIT) {
    res.status(429).json({
      data: null,
      erros: ["Limite de consultas excedido. Aguarde 1 minuto."],
    });
    return;
  }

  entry.count++;
  next();
}

// Limpa o mapa de rate limit a cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 5 * 60_000);

// ============================================================
// Rotas
// ============================================================

/**
 * GET /health
 * Health check — útil para monitoramento e uptime checks
 */
app.get("/health", (_req, res) => {
  res.json({
    status: "online",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    memory: {
      used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
      total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
    },
  });
});

/**
 * GET /:placa
 * Consulta os dados de um veículo pela placa.
 */
app.get("/:placa", rateLimit, async (req, res) => {
  const placa = req.params.placa as string;
  const startTime = Date.now();

  // Valida formato da placa
  if (!validarPlaca(placa)) {
    const resultado: Result<null> = {
      data: null,
      erros: [
        "Formato de placa inválido. Use o formato ABC1234 (antiga) ou ABC1D23 (Mercosul).",
      ],
    };
    return res.status(400).json(resultado);
  }

  try {
    console.log(
      `[${new Date().toISOString()}] Consulta: ${placa.toUpperCase()}`
    );

    const carro = await consultarPlaca(placa);
    const duration = Date.now() - startTime;

    if (!carro) {
      console.log(`[${new Date().toISOString()}] Não encontrado (${duration}ms)`);
      const resultado: Result<null> = {
        data: null,
        erros: ["Carro não encontrado. Verifique o número da placa."],
      };
      return res.status(404).json(resultado);
    }

    console.log(
      `[${new Date().toISOString()}] OK: ${carro.marca} ${carro.modelo} (${duration}ms)`
    );

    const resultado: Result<typeof carro> = {
      data: carro,
      erros: [],
    };
    return res.status(200).json(resultado);
  } catch (error: any) {
    console.error(`[${new Date().toISOString()}] ERRO: ${error.message}`);
    const resultado: Result<null> = {
      data: null,
      erros: ["Erro interno ao consultar a placa. Tente novamente."],
    };
    return res.status(500).json(resultado);
  }
});

// ============================================================
// Inicialização e Graceful Shutdown
// ============================================================
const server = app.listen(PORT, () => {
  console.log(`\n🚗 API de Consulta de Placas — Produção`);
  console.log(`   Porta: ${PORT}`);
  console.log(`   CORS: ${ALLOWED_ORIGINS.join(", ")}`);
  console.log(`   Rate Limit: ${RATE_LIMIT} req/min`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Uso: GET http://localhost:${PORT}/{placa}\n`);
});

// Graceful shutdown — PM2 envia SIGINT ao reiniciar
process.on("SIGINT", () => {
  console.log("\n[SHUTDOWN] Encerrando servidor...");
  server.close(() => {
    console.log("[SHUTDOWN] Servidor encerrado.");
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  console.log("\n[SHUTDOWN] SIGTERM recebido...");
  server.close(() => process.exit(0));
});

export default app;
