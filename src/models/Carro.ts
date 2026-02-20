/**
 * Interface que representa os dados de um veículo consultado por placa.
 * Equivalente ao Models/Carro.cs do projeto original em C#.
 */
export interface Carro {
  marca: string | null;
  modelo: string | null;
  importado: string | null;
  ano: string | null;
  anoModelo: string | null;
  cor: string | null;
  cilindrada: string | null;
  potencia: string | null;
  combustivel: string | null;
  chassi: string | null;
  motor: string | null;
  passageiros: string | null;
  uf: string | null;
  municipio: string | null;
}

/**
 * Interface de resposta padrão da API.
 * Equivalente ao ViewModelResult/Result.cs do projeto original.
 */
export interface Result<T> {
  data: T | null;
  erros: string[];
}
